import { Router } from "express";
import crypto from "crypto";
import { sendOtpEmail } from "./sendEmail";
import { supabaseBreaker, fire } from "./circuitBreaker";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

// In-memory rate limiter with periodic cleanup to prevent memory leak
const requestCounts = new Map<string, { count: number; windowStart: number }>();
setInterval(() => {
  const now = Date.now();
  requestCounts.forEach((entry, key) => {
    if (now - entry.windowStart > 600_000) requestCounts.delete(key);
  });
}, 300_000);

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = requestCounts.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    requestCounts.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

const router = Router();

export function getUserIdFromToken(req: any): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || "";
    if (!secret) {
      if (process.env.NODE_ENV === "development" && process.env.ALLOW_INSECURE_JWT === "true") {
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
        return payload.sub || null;
      }
      return null;
    }
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    const sigBuf = Buffer.from(signatureB64);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload.sub || null;
  } catch {
    return null;
  }
}

// Use service key for password_reset_otps operations (server-to-server, no client JWT available).
// The server code handles all validation and rate limiting before these calls.
const API_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

async function restQuery(table: string, query: string, method = "GET", body?: any) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers: Record<string, string> = {
    apikey: API_KEY,
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fire(supabaseBreaker, async () => {
    const r = await fetch(url, opts);
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Supabase ${method} ${table} failed: ${r.status} ${text}`);
    }
    return r;
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[restQuery] Fallback — ${method} ${table}: ${msg}`);
    return null;
  });
  if (!res) throw new Error("OTP service temporarily unavailable. Try again later.");
  if (res.status === 204) return null;
  return res.json();
}

function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character";
  return null;
}

router.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Rate limit: 3 OTP requests per email per 5 minutes
    if (!checkRateLimit(`send-otp:${email}`, 3, 5 * 60 * 1000)) {
      return res.status(429).json({ error: "Too many requests. Please wait before requesting another code." });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await restQuery(
      "password_reset_otps",
      "?",
      "POST",
      { email, otp, expires_at: expiresAt }
    );

    // Await email send so user knows it was actually sent
    await sendOtpEmail(email, otp);

    return res.json({ success: true, message: "OTP sent to your email" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("send-otp error:", msg);
    return res.status(500).json({ error: `OTP send failed: ${msg}` });
  }
});

router.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    // Rate limit: 10 attempts per email per 5 minutes
    if (!checkRateLimit(`verify-otp:${email}`, 10, 5 * 60 * 1000)) {
      return res.status(429).json({ error: "Too many attempts. Please wait." });
    }

    // Atomically mark OTP as used FIRST to prevent double-use race condition
    const now = new Date().toISOString();
    const markUsedQuery = `?email=eq.${encodeURIComponent(email)}&otp=eq.${otp}&used=eq.false&expires_at=gte.${encodeURIComponent(now)}`;
    const markResult = await restQuery("password_reset_otps", markUsedQuery, "PATCH", { used: true });

    // If no rows were updated, the OTP was already used or expired
    if (!markResult || markResult.length === 0) {
      return res.status(400).json({ error: "Incorrect code" });
    }

    return res.json({ success: true, message: "OTP verified" });
  } catch (err: unknown) {
    console.error("verify-otp error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
});

router.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, OTP, and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Rate limit: 5 attempts per email per 30 minutes
    if (!checkRateLimit(`reset-password:${email}`, 5, 30 * 60 * 1000)) {
      return res.status(429).json({ error: "Too many attempts. Please wait." });
    }

    // Validate password strength BEFORE consuming the OTP
    const pwError = validatePasswordStrength(newPassword);
    if (pwError) {
      return res.status(400).json({ error: pwError });
    }

    // Atomically mark OTP as used FIRST to prevent race condition
    const now = new Date().toISOString();
    const markUsedQuery = `?email=eq.${encodeURIComponent(email)}&otp=eq.${otp}&used=eq.false&expires_at=gte.${encodeURIComponent(now)}`;
    const markResult = await restQuery("password_reset_otps", markUsedQuery, "PATCH", { used: true });

    if (!markResult || markResult.length === 0) {
      return res.status(400).json({ error: "Incorrect code" });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Password reset service not configured" });
    }

    // Fetch user by email
    const userLookupRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        {
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
        }
      );
      if (!r.ok) throw new Error(`User lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!userLookupRes) {
      return res.status(503).json({ error: "Auth service temporarily unavailable" });
    }
    const userLookupData = await userLookupRes.json();
    const matchedUser = userLookupData.users?.[0];
    if (!matchedUser) {
      return res.status(400).json({ error: "User not found" });
    }

    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${matchedUser.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!r.ok) throw new Error(`Password update failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!updateRes) {
      return res.status(503).json({ error: "Auth service temporarily unavailable" });
    }

    return res.json({ success: true, message: "Password reset successfully" });
  } catch (err: unknown) {
    console.error("reset-password error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

// ── Check if email already exists ──
router.post("/api/auth/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    if (!checkRateLimit(`check-email:${email}`, 10, 60_000)) {
      return res.status(429).json({ error: "Too many requests. Please wait." });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Email check service not configured" });
    }

    const userLookupRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        {
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
        }
      );
      if (!r.ok) throw new Error(`User lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!userLookupRes) {
      return res.status(503).json({ error: "Auth service temporarily unavailable" });
    }

    const data = await userLookupRes.json();
    if (data.users && data.users.length > 0) {
      return res.status(409).json({ error: "This email is already in use by another account" });
    }

    return res.json({ available: true });
  } catch (err: unknown) {
    console.error("check-email error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to check email" });
  }
});

// ── Change email via Admin API (no confirmation required) ──
router.post("/api/auth/change-email", async (req, res) => {
  try {

    const { newEmail } = req.body;
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Auth service not configured" });
    }

    // Get current user from token
    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });
    const userId = callerId;

    // Check if new email is already taken by another user
    const checkRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(newEmail)}`,
        {
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
        }
      );
      if (!r.ok) throw new Error(`User lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (checkRes) {
      const checkData = await checkRes.json();
      const takenByAnother = checkData.users?.some((u: any) => u.id !== userId && u.email === newEmail);
      if (takenByAnother) {
        return res.status(409).json({ error: "This email is already in use by another account" });
      }
    }

    // Update email directly via Admin API
    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: newEmail, email_confirm: true }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.msg || `Email update failed: ${r.status}`);
      }
      return r;
    }).catch(() => null);

    if (!updateRes) {
      return res.status(503).json({ error: "Failed to update email. Try again." });
    }

    // Re-login with new email to refresh the token
    return res.json({ success: true, newEmail, message: "Email updated successfully. Please sign in again." });
  } catch (err: unknown) {
    console.error("change-email error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to change email" });
  }
});

// ── Verify password ──
router.post("/api/auth/verify-password", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Rate limit: 5 attempts per email per 5 minutes
    if (!checkRateLimit(`verify-password:${email}`, 3, 5 * 60 * 1000)) {
      return res.status(429).json({ error: "Too many attempts. Please wait." });
    }

    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!r.ok) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    return res.json({ verified: true });
  } catch (err: unknown) {
    console.error("verify-password error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to verify password" });
  }
});

// ── Update all user passwords (admin only) ──
router.post("/api/auth/update-all-passwords", async (req, res) => {
  try {
    const { newPassword } = req.body;
    const strengthError = validatePasswordStrength(newPassword || "");
    if (strengthError) {
      return res.status(400).json({ error: strengthError });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Auth service not configured" });
    }

    // Verify the requesting user is an admin
    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });

    // Check admin role
    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profileData = await profileRes.json();
    if (profileData[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update all passwords" });
    }

    // Get all users
    const usersRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
      });
      if (!r.ok) throw new Error(`Users fetch failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!usersRes) return res.status(503).json({ error: "Failed to fetch users" });
    const usersData = await usersRes.json();
    const users = usersData.users || [];

    // Update each user's password
    let updated = 0;
    let failed = 0;
    const failedEmails: string[] = [];
    for (const u of users) {
      try {
        const updateRes = await fire(supabaseBreaker, async () => {
          const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
              apikey: SUPABASE_SERVICE_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ password: newPassword }),
          });
          if (!r.ok) {
            const errBody = await r.text().catch(() => "");
            throw new Error(`Update failed for ${u.email}: ${r.status} ${errBody}`);
          }
          return r;
        }).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[update-all-passwords] Failed to update ${u.email} (${u.id}): ${msg}`);
          return null;
        });

        if (updateRes) {
          updated++;
        } else {
          failed++;
          failedEmails.push(u.email);
        }
      } catch (err: unknown) {
        console.error(`[update-all-passwords] Unexpected error for ${u.email}:`, err);
        failed++;
        failedEmails.push(u.email);
      }

      // Small delay between updates to avoid Supabase Admin API rate limits
      if (users.indexOf(u) < users.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (failed > 0) {
      console.warn(`[update-all-passwords] Partial failure: ${failed}/${users.length} failed — ${failedEmails.join(", ")}`);
    }

    return res.json({ success: true, updated, failed, total: users.length, failedEmails });
  } catch (err: unknown) {
    console.error("update-all-passwords error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to update passwords" });
  }
});

// ── List all staff accounts (admin only) ──
router.get("/api/auth/staff", async (req, res) => {
  try {
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Not configured" });

    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });

    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch((err: unknown) => {
      console.error("[staff] Profile lookup failed:", err instanceof Error ? err.message : err);
      return null;
    });
    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profileData = await profileRes.json();
    if (profileData[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can view staff" });
    }

    // Fetch all auth users
    const usersRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
      });
      if (!r.ok) throw new Error(`Users fetch failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!usersRes) return res.status(503).json({ error: "Failed to fetch users" });
    const usersData = await usersRes.json();
    const users = usersData.users || [];

    // Fetch all profiles
    const profilesRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?select=auth_user_id,name,role,phone,pin,attendance_clock_in,attendance_clock_out,attendance_date,last_login_at,department,shift,employment_status`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profiles fetch failed: ${r.status}`);
      return r;
    }).catch(() => null);
    const profiles: any[] = profilesRes ? await profilesRes.json() : [];
    const profileMap = new Map<string, any>(profiles.map((p: any) => [p.auth_user_id, p]));

    const staff = users
      .filter((u: any) => u.id !== callerId)
      .map((u: any) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: p?.name || "",
        role: p?.role || "staff",
        phone: p?.phone || "",
        pin: p?.pin || "",
        lastSignIn: u.last_sign_in_at || null,
        createdAt: u.created_at,
        department: p?.department || null,
        shift: p?.shift || null,
        attendanceClockIn: p?.attendance_clock_in || null,
        attendanceClockOut: p?.attendance_clock_out || null,
        attendanceDate: p?.attendance_date || null,
        lastLoginAt: p?.last_login_at || null,
        employmentStatus: p?.employment_status || "active",
      };
    });

    return res.json({ staff });
  } catch (err: unknown) {
    console.error("staff-list error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to fetch staff" });
  }
});

// ── Set password for a specific staff member (admin only) ──
router.post("/api/auth/set-staff-password", async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: "User ID and new password are required" });
    }

    const pwError = validatePasswordStrength(newPassword);
    if (pwError) return res.status(400).json({ error: pwError });

    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Not configured" });

    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });

    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profileData = await profileRes.json();
    if (profileData[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can set staff passwords" });
    }

    // Update the target user's password
    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        throw new Error(`Password update failed: ${r.status} ${errBody}`);
      }
      return r;
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[set-staff-password] Failed for ${userId}: ${msg}`);
      return null;
    });

    if (!updateRes) {
      return res.status(503).json({ error: "Failed to update password. Try again." });
    }

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err: unknown) {
    console.error("set-staff-password error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to set password" });
  }
});

// ── List active sessions for authenticated user ──
router.get("/api/auth/sessions", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Session service not configured" });
    }

    // Fetch all sessions for this user using admin API
    const sessionsRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}/sessions`,
        {
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
        }
      );
      if (!r.ok) throw new Error(`Sessions lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!sessionsRes) {
      return res.status(503).json({ error: "Session service temporarily unavailable" });
    }

    const sessionsData = await sessionsRes.json();
    return res.json({ sessions: sessionsData });
  } catch (err: unknown) {
    console.error("sessions error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// ── Log out all other sessions (keep current) ──
router.post("/api/auth/sessions/logout-others", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") || "";
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Session service not configured" });
    }

    // Get current session ID from token
    let currentSessionId: string | null = null;
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        currentSessionId = payload.session_id || null;
      }
    } catch { /* ignore parse errors */ }

    // Fetch all sessions
    const sessionsRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}/sessions`,
        {
          headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
        }
      );
      if (!r.ok) throw new Error(`Sessions lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!sessionsRes) {
      return res.status(503).json({ error: "Session service temporarily unavailable" });
    }

    const sessionsData = await sessionsRes.json();
    let deletedCount = 0;

    // Delete all sessions except current
    for (const session of sessionsData) {
      if (session.id !== currentSessionId) {
        const delRes = await fire(supabaseBreaker, async () => {
          const r = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users/${userId}/sessions/${session.id}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
            }
          );
          return r;
        }).catch(() => null);
        if (delRes && delRes.ok) deletedCount++;
      }
    }

    return res.json({ success: true, message: `Logged out from ${deletedCount} other device(s)` });
  } catch (err: unknown) {
    console.error("logout-others error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to logout other sessions" });
  }
});

// ── Get current staff profile ──
router.get("/api/auth/my-profile", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    // Get profile
    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=*`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profiles = await profileRes.json();
    if (!profiles || profiles.length === 0) return res.status(404).json({ error: "Profile not found" });

    const profile = profiles[0];

    // Get today's performance stats
    const today = new Date().toISOString().split("T")[0];
    const ordersRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/orders?created_at=gte.${today}T00:00:00&select=id`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      return r;
    }).catch(() => null);
    const ordersData = ordersRes ? await ordersRes.json() : [];

    const feedbackRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/feedback?created_at=gte.${today}T00:00:00&select=rating`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      return r;
    }).catch(() => null);
    const feedbackData = feedbackRes ? await feedbackRes.json() : [];
    const avgRating = feedbackData.length > 0
      ? (feedbackData.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / feedbackData.length).toFixed(1)
      : null;

    return res.json({
      profile,
      performance: {
        ordersProcessed: ordersData.length,
        invoicesSent: ordersData.length,
        avgRating,
        paymentsCollected: 0,
      },
    });
  } catch (err: unknown) {
    console.error("my-profile error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ── Update current staff profile ──
router.put("/api/auth/my-profile", async (req, res) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    const allowed = [
      "name", "phone", "profile_image_url", "timezone", "language",
      "department", "branch", "shift", "shift_timing", "reporting_manager",
      "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
      "notif_order", "notif_system", "notif_email",
      "attendance_clock_in", "attendance_clock_out", "attendance_date",
    ];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(updates),
        }
      );
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        throw new Error(`Profile update failed: ${r.status} ${errBody}`);
      }
      return r;
    }).catch((err: unknown) => {
      console.error("[my-profile] Update failed:", err instanceof Error ? err.message : err);
      return null;
    });

    if (!updateRes) return res.status(503).json({ error: "Failed to update profile" });
    const updated = await updateRes.json();
    return res.json({ success: true, profile: updated[0] });
  } catch (err: unknown) {
    console.error("my-profile update error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── Clock in / Clock out ──
router.post("/api/auth/attendance", async (req, res) => {
  try {
    const { action } = req.body;
    if (!["clock-in", "clock-out"].includes(action)) {
      return res.status(400).json({ error: "Action must be clock-in or clock-out" });
    }

    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    const now = new Date().toISOString();
    const today = new Date().toISOString().split("T")[0];

    const updates: Record<string, any> = {};
    if (action === "clock-in") {
      updates.attendance_clock_in = now;
      updates.attendance_date = today;
      updates.attendance_clock_out = null;
    } else {
      updates.attendance_clock_out = now;
    }

    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(updates),
        }
      );
      const body = await r.text();
      console.log(`[attendance] PATCH status=${r.status}`);
      if (!r.ok) throw new Error(`Attendance update failed: ${r.status}: ${body}`);
      return { ok: true, json: () => JSON.parse(body) };
    }).catch((err) => { console.error("[attendance] fire error:", err?.message || err); return null; });

    if (!updateRes) return res.status(503).json({ error: "Failed to update attendance" });
    const updatedProfile = await updateRes.json();
    return res.json({ success: true, action, profile: updatedProfile[0] || null });
  } catch (err: unknown) {
    console.error("attendance error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to update attendance" });
  }
});

// ── Admin: Update any staff profile ──
router.put("/api/auth/staff/:userId", async (req, res) => {
  try {
    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profileData = await profileRes.json();
    if (profileData[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can update staff profiles" });
    }

    const allowed = [
      "name", "phone", "department", "branch", "shift", "shift_timing",
      "reporting_manager", "employment_status", "role",
    ];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(updates),
        }
      );
      if (!r.ok) throw new Error(`Update failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!updateRes) return res.status(503).json({ error: "Failed to update staff profile" });
    const updated = await updateRes.json();
    return res.json({ success: true, profile: updated[0] });
  } catch (err: unknown) {
    console.error("staff update error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to update staff profile" });
  }
});

// ── Create a new staff account (admin only) ──
router.post("/api/auth/create-staff", async (req, res) => {
  try {
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Not configured" });

    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });

    // Verify caller is admin
    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profileData = await profileRes.json();
    if (profileData[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can create staff" });
    }

    const { email, password, name, phone, role, department, shift } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Generate a unique 4-digit PIN for this staff member
    let pin = "";
    let pinAttempts = 0;
    const usedPins = new Set<string>();
    // Fetch all existing PINs
    const existingPinsRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=pin&pin=not.is.null`, {
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
      });
      if (!r.ok) throw new Error("Failed to fetch pins");
      return r;
    }).catch(() => null);
    if (existingPinsRes) {
      const existingPins = (await existingPinsRes.json()) as { pin: string }[];
      for (const p of existingPins) usedPins.add(p.pin);
    }
    do {
      pin = String(1000 + Math.floor(Math.random() * 9000));
      pinAttempts++;
    } while (usedPins.has(pin) && pinAttempts < 100);

    // Create auth user via Supabase Admin API
    const createRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: name || "", phone: phone || "" },
        }),
      });
      if (!r.ok) {
        const errBody = await r.json();
        throw new Error(errBody.msg || errBody.error_description || `Create user failed: ${r.status}`);
      }
      return r;
    }).catch((err: unknown) => {
      console.error("[create-staff] Error:", err instanceof Error ? err.message : err);
      return null;
    });

    if (!createRes) {
      return res.status(500).json({ error: "Failed to create auth user. Email may already exist." });
    }

    const newUser = await createRes.json();

    // Create user_profiles record
    const profileCreateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          auth_user_id: newUser.id,
          name: name || "",
          phone: phone || "",
          role: role || "staff",
          department: department || null,
          shift: shift || null,
          pin,
          employment_status: "active",
          must_change_password: false,
          notif_order: true,
          notif_system: true,
          notif_email: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
      if (!r.ok) {
        const errBody = await r.json();
        console.error("[create-staff] Profile create failed:", JSON.stringify(errBody));
        throw new Error(`Profile create failed: ${r.status}: ${JSON.stringify(errBody)}`);
      }
      return r;
    }).catch((err: unknown) => {
      console.error("[create-staff] Profile create error:", err instanceof Error ? err.message : err);
      return null;
    });

    if (!profileCreateRes) {
      return res.status(500).json({ error: "Auth user created but profile setup failed" });
    }

    const profile = await profileCreateRes.json();
    return res.json({ success: true, user: { id: newUser.id, email: newUser.email }, profile: profile[0] });
  } catch (err: unknown) {
    console.error("create-staff error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to create staff account" });
  }
});

// ── Deactivate a staff account (admin only) ──
router.post("/api/auth/staff/:userId/deactivate", async (req, res) => {
  try {
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Not configured" });

    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    // Verify caller is admin
    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profileData = await profileRes.json();
    if (profileData[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can deactivate staff" });
    }

    // Cannot deactivate yourself
    if (userId === callerId) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    // Set employment_status to inactive
    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ employment_status: "inactive" }),
        }
      );
      if (!r.ok) throw new Error(`Deactivate failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!updateRes) return res.status(503).json({ error: "Failed to deactivate account" });
    const updated = await updateRes.json();

    // Also ban the user in Supabase Auth so they can't log in
    await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ban_duration: "876000h" }),
      });
      return r;
    }).catch(() => null);

    return res.json({ success: true, profile: updated[0] });
  } catch (err: unknown) {
    console.error("deactivate error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to deactivate account" });
  }
});

// ── Reactivate a staff account (admin only) ──
router.post("/api/auth/staff/:userId/reactivate", async (req, res) => {
  try {
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Not configured" });

    const callerId = getUserIdFromToken(req);
    if (!callerId) return res.status(401).json({ error: "Invalid token" });

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    // Verify caller is admin
    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${callerId}&select=role`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error(`Profile lookup failed: ${r.status}`);
      return r;
    }).catch(() => null);
    if (!profileRes) return res.status(503).json({ error: "Service unavailable" });
    const profileData = await profileRes.json();
    if (profileData[0]?.role !== "admin") {
      return res.status(403).json({ error: "Only admins can reactivate staff" });
    }

    // Set employment_status to active
    const updateRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            apikey: SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ employment_status: "active" }),
        }
      );
      if (!r.ok) throw new Error(`Reactivate failed: ${r.status}`);
      return r;
    }).catch(() => null);

    if (!updateRes) return res.status(503).json({ error: "Failed to reactivate account" });
    const updated = await updateRes.json();

    // Unban the user in Supabase Auth
    await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ban_duration: "none" }),
      });
      return r;
    }).catch(() => null);

    return res.json({ success: true, profile: updated[0] });
  } catch (err: unknown) {
    console.error("reactivate error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Failed to reactivate account" });
  }
});

// --- Leave Requests ---

router.get("/api/leave-requests", async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const data = await restQuery("leaveRequests", `?user_id=eq.${userId}&order=createdAt.desc`);
    return res.json(data || []);
  } catch (err: unknown) {
    console.error("leave-requests list error:", err);
    return res.status(500).json({ error: "Failed to fetch leave requests" });
  }
});

router.post("/api/leave-requests", async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { leaveType, date, reason } = req.body;
  if (!leaveType || !date) {
    return res.status(400).json({ error: "Leave type and date are required" });
  }
  if (!["holiday", "half-day"].includes(leaveType)) {
    return res.status(400).json({ error: "Leave type must be 'holiday' or 'half-day'" });
  }

  try {
    const data = await restQuery("leaveRequests", "", "POST", {
      user_id: userId,
      leave_type: leaveType,
      date,
      reason: reason || null,
      status: "pending",
    });
    return res.json({ success: true, request: data[0] });
  } catch (err: unknown) {
    console.error("leave-requests create error:", err);
    return res.status(500).json({ error: "Failed to submit leave request" });
  }
});

router.delete("/api/leave-requests/:id", async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.params;
  try {
    await restQuery("leaveRequests", `?id=eq.${id}&user_id=eq.${userId}&status=eq.pending`, "DELETE");
    return res.json({ success: true });
  } catch (err: unknown) {
    console.error("leave-requests delete error:", err);
    return res.status(500).json({ error: "Failed to cancel leave request" });
  }
});

// Admin: list all leave requests
router.get("/api/admin/leave-requests", async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Check admin role
    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role`, {
        headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
      });
      return r.json();
    });
    const profile = profileRes?.[0];
    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Fetch all leave requests
    const requests = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/leaveRequests?order=createdAt.desc`, {
        headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
      });
      return r.json();
    });

    if (!requests || requests.length === 0) return res.json([]);

    // Fetch staff names
    const userIds = Array.from(new Set(requests.map((r: any) => r.user_id)));
    let staffProfiles: any[] = [];
    if (userIds.length > 0) {
      try {
        staffProfiles = await fire(supabaseBreaker, async () => {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=in.(${userIds.join(",")})&select=auth_user_id,name`, {
            headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
          });
          return r.json();
        }) || [];
      } catch {}
    }
    const profileMap = new Map(staffProfiles.map((p: any) => [p.auth_user_id, p]));

    const enriched = requests.map((r: any) => {
      const p = profileMap.get(r.user_id);
      return { ...r, staffName: p?.name || "Unknown" };
    });
    return res.json(enriched);
  } catch (err: unknown) {
    console.error("admin leave-requests error:", err);
    return res.status(500).json({ error: "Failed to fetch leave requests" });
  }
});

// Admin: approve/reject leave request
router.put("/api/admin/leave-requests/:id", async (req, res) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const profileRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role`, {
        headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
      });
      return r.json();
    });
    const profile = profileRes?.[0];
    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch {
    return res.status(403).json({ error: "Admin access required" });
  }

  const { id } = req.params;
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
  }

  try {
    const data = await restQuery("leaveRequests", `?id=eq.${id}`, "PATCH", {
      status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    });
    return res.json({ success: true, request: data?.[0] });
  } catch (err: unknown) {
    console.error("admin leave-requests update error:", err);
    return res.status(500).json({ error: "Failed to update leave request" });
  }
});

// ── PIN Login: Look up staff by 4-digit PIN and create a session ──
router.get("/api/auth/pin-login/:pin", async (req, res) => {
  try {
    if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Not configured" });

    const { pin } = req.params;
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: "Invalid PIN format" });
    }

    // Find the user_profiles entry with this PIN
    const pinRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?pin=eq.${pin}&employment_status=eq.active&select=auth_user_id,role,name`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error("Failed to find staff");
      return r;
    }).catch(() => null);
    if (!pinRes) return res.status(503).json({ error: "Service unavailable" });

    const profiles = await pinRes.json();
    if (!profiles || profiles.length === 0) {
      return res.status(404).json({ error: "Invalid 4-digit PIN" });
    }

    const profile = profiles[0];

    // Get the auth user's email
    const authRes = await fire(supabaseBreaker, async () => {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${profile.auth_user_id}`,
        { headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY } }
      );
      if (!r.ok) throw new Error("Failed to get user");
      return r;
    }).catch(() => null);
    if (!authRes) return res.status(503).json({ error: "Service unavailable" });

    const authUser = await authRes.json();
    if (!authUser || !authUser.email) {
      return res.status(404).json({ error: "Auth user not found" });
    }

    return res.json({
      valid: true,
      email: authUser.email,
      name: profile.name,
      role: profile.role,
      authUserId: profile.auth_user_id,
    });
  } catch (err: unknown) {
    console.error("pin-login error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "PIN login failed" });
  }
});

export default router;
