import { Router } from "express";
import { sendOtpEmail } from "./sendEmail";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const router = Router();

async function restQuery(table: string, query: string, method = "GET", body?: any) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: method === "POST" ? "return=representation" : undefined as any,
  };
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

router.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await restQuery(
      "password_reset_otps",
      "?",
      "POST",
      { email, otp, expires_at: expiresAt }
    );

    sendOtpEmail(email, otp);

    console.log(`[OTP] Password reset OTP for ${email}: ${otp} (expires at ${expiresAt})`);

    return res.json({ success: true, message: "OTP sent to your email" });
  } catch (err: any) {
    console.error("send-otp error:", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const now = new Date().toISOString();
    const query = `?email=eq.${encodeURIComponent(email)}&otp=eq.${otp}&used=eq.false&expires_at=gte.${encodeURIComponent(now)}&order=created_at.desc&limit=1`;
    const data = await restQuery("password_reset_otps", query);

    if (!data || data.length === 0) {
      return res.status(400).json({ error: "Incorrect code" });
    }

    return res.json({ success: true, message: "OTP verified" });
  } catch (err: any) {
    console.error("verify-otp error:", err);
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

    const now = new Date().toISOString();
    const query = `?email=eq.${encodeURIComponent(email)}&otp=eq.${otp}&used=eq.false&expires_at=gte.${encodeURIComponent(now)}&order=created_at.desc&limit=1`;
    const data = await restQuery("password_reset_otps", query);

    if (!data || data.length === 0) {
      return res.status(400).json({ error: "Incorrect code" });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: "Password reset service not configured" });
    }

    const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY },
    });
    if (!usersRes.ok) {
      console.error("User list failed:", usersRes.status);
      return res.status(500).json({ error: "Failed to reset password" });
    }
    const usersData = await usersRes.json();
    const matchedUser = usersData.users?.find((u: any) => u.email === email);
    if (!matchedUser) {
      return res.status(400).json({ error: "User not found" });
    }

    const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${matchedUser.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error("Password update failed:", errText);
      return res.status(500).json({ error: "Failed to reset password" });
    }

    await restQuery(
      "password_reset_otps",
      `?id=eq.${data[0].id}`,
      "PATCH",
      { used: true }
    );

    return res.json({ success: true, message: "Password reset successfully" });
  } catch (err: any) {
    console.error("reset-password error:", err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

export default router;
