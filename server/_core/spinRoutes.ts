import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { createDiscountCoupon, createFreeItemCoupon, createCoupon } from "./couponService";
import { getUserIdFromToken, fetchUserProfileByAuthId } from "./authRoutes";

const router = Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

// In-memory rate limiter to prevent spin endpoint flooding (C6/C7 defence in depth).
const spinRateLimit = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  spinRateLimit.forEach((entry, key) => {
    if (now > entry.resetAt) spinRateLimit.delete(key);
  });
}, 300_000);
function checkSpinRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = spinRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    spinRateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

async function requireStaffOrSelf(req: Request, res: Response, targetPhone: string): Promise<boolean> {
  // Customers can spin for themselves; staff can spin for any customer (support case).
  const userId = getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  // If a JWT is present, allow any authenticated staff to call. Customers calling
  // without a JWT are rejected (C7 fix — the original endpoint was completely
  // unauthenticated and trivially exploitable).
  const profile = await fetchUserProfileByAuthId(userId).catch(() => null);
  if (profile && (profile.role === "admin" || profile.role === "staff")) {
    return true;
  }
  // Non-staff: allow only if their JWT subject matches the customer.
  // Since customers don't yet have their own accounts in this app, this path is
  // effectively staff-only. The check still enforces authentication.
  res.status(403).json({ error: "Staff authentication required" });
  return false;
}

import { getUserRoleAndPermissions } from "./authRoutes";

async function requirePermission(req: Request, res: Response, permission: string): Promise<boolean> {
  const userId = getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  const { role, permissions } = await getUserRoleAndPermissions(userId);
  if (role === "admin" || permissions[permission]) {
    return true;
  }
  res.status(403).json({ error: `Access denied: Missing '${permission}' permission` });
  return false;
}

// Lucky Spin milestones: [lifetimePoints, spinsAwarded]
const SPIN_MILESTONES = [
  { points: 50, spins: 1 },
  { points: 100, spins: 3 },
  { points: 150, spins: 5 },
];

async function ensureSpinRewards() {
  const client = sb() as any;
  const { data } = await client.from("spinRewards").select("*").eq("enabled", true).order("id");
  return data || [];
}

async function ensureCustomerSpins(phone: string) {
  const client = sb() as any;
  const { data: existing } = await client.from("customerSpins").select("*").eq("customerPhone", phone).single();
  if (existing) return existing;
  // Find wallet
  const { data: wallet } = await client.from("loyaltyWallets").select("id").eq("customerPhone", phone).single();
  if (!wallet) return null;
  const { data: created } = await client.from("customerSpins").insert({
    walletId: wallet.id,
    customerPhone: phone,
    available: 0,
    used: 0,
  }).select().single();
  return created;
}

async function checkAndAwardMilestones(phone: string) {
  const client = sb() as any;
  const { data: wallet } = await client.from("loyaltyWallets").select("id, lifetimeEarned").eq("customerPhone", phone).single();
  if (!wallet) return { awarded: 0, totalAvailable: 0 };

  // Note: Spins are no longer auto-awarded. Customers choose to redeem milestones for spins or coupons.
  // This function now just returns the current spin count.

  const { data: spinsNow } = await client.from("customerSpins").select("available, used").eq("customerPhone", phone).single();

  return { awarded: 0, newMilestones: [], totalAvailable: spinsNow?.available || 0 };
}

// GET /api/spin/config — public: wheel rewards
router.get("/api/spin/config", async (_req: Request, res: Response) => {
  try {
    const rewards = await ensureSpinRewards();
    res.json({ rewards, milestones: SPIN_MILESTONES });
  } catch (err: any) {
    console.error("[Spin] Config error:", err);
    res.status(500).json({ error: "Failed to fetch spin config" });
  }
});

// GET /api/spin/status/:phone — customer spin status
router.get("/api/spin/status/:phone", async (req: Request, res: Response) => {
  try {
    const phone = req.params.phone;
    const client = sb() as any;

    // Check and award any pending milestones
    await checkAndAwardMilestones(phone);

    const { data: wallet } = await client.from("loyaltyWallets").select("id, lifetimeEarned, currentPoints").eq("customerPhone", phone).single();
    const { data: spins } = await client.from("customerSpins").select("available, used").eq("customerPhone", phone).single();
    const { data: history } = await client.from("spinHistory").select("*").eq("customerPhone", phone).order("spunAt", { ascending: false }).limit(50);
    const { data: claimed } = await client.from("spinMilestones").select("milestonePoints, spinsAwarded, claimedAt").eq("walletId", wallet?.id || 0).order("claimedAt", { ascending: false });

    const lifetimeEarned = wallet?.lifetimeEarned || 0;
    const currentPoints = wallet?.currentPoints || 0;

    // Find next milestone
    let nextMilestone = null;
    for (const m of SPIN_MILESTONES) {
      if (lifetimeEarned < m.points) {
        nextMilestone = m;
        break;
      }
    }

    // Find which milestones are claimed
    const claimedSet = new Set((claimed || []).map((c: any) => c.milestonePoints));
    const unclaimedMilestones = SPIN_MILESTONES.filter(m => !claimedSet.has(m.points));

    res.json({
      available: spins?.available || 0,
      used: spins?.used || 0,
      totalSpinsUsed: spins?.used || 0,
      lifetimeEarned,
      currentPoints,
      nextMilestone,
      unclaimedMilestones,
      history: history || [],
      milestones: claimed || [],
    });
  } catch (err: any) {
    console.error("[Spin] Status error:", err);
    res.status(500).json({ error: "Failed to fetch spin status" });
  }
});

// POST /api/spin/play — execute a spin
router.post("/api/spin/play", async (req: Request, res: Response) => {
  try {
    const { customerPhone, idempotencyKey } = req.body;
    if (!customerPhone) return res.status(400).json({ error: "customerPhone is required" });

    // CRITICAL (C7 fix): require authentication. Previously the endpoint was
    // completely open and anyone with a phone number could spin and force
    // coupon creation.
    if (!(await requireStaffOrSelf(req, res, customerPhone))) return;

    // Defence in depth: also rate-limit per-customer.
    if (!checkSpinRateLimit(`spin:${customerPhone}`, 5, 60_000)) {
      return res.status(429).json({ error: "Too many spin attempts. Please slow down." });
    }

    const client = sb() as any;

    // CRITICAL (C6 fix): Atomic decrement using SQL guard `available >= 1`. Two
    // concurrent calls can no longer both succeed — exactly one will decrement,
    // the other will see 0 rows updated and be told "no spins available".
    //
    // We use a single round-trip that:
    //   1) Atomically decrements available by 1 and increments used by 1
    //      ONLY IF available >= 1.
    //   2) Returns the post-decrement state.
    const { data: decremented, error: decErr } = await client
      .rpc("decrement_customer_spins", { p_phone: customerPhone, p_amount: 1 })
      .single();

    if (decErr || !decremented) {
      return res.status(400).json({ error: "No spins available" });
    }

    const remainingSpins = (decremented as any).available;

    // Get enabled rewards
    const { data: rewards } = await client.from("spinRewards").select("*").eq("enabled", true);
    if (!rewards || rewards.length === 0) {
      return res.status(500).json({ error: "No rewards configured" });
    }

    // Weighted random selection. M14 fix: if totalWeight is 0, fall back to a
    // uniform random instead of silently picking rewards[0].
    const totalWeight = rewards.reduce((sum: number, r: any) => sum + Number(r.probability), 0);
    let selectedReward = rewards[0];
    if (totalWeight > 0) {
      let random = Math.random() * totalWeight;
      for (const reward of rewards) {
        random -= Number(reward.probability);
        if (random <= 0) {
          selectedReward = reward;
          break;
        }
      }
    } else {
      selectedReward = rewards[Math.floor(Math.random() * rewards.length)];
    }

    // Get wallet
    const { data: wallet } = await client.from("loyaltyWallets").select("id").eq("customerPhone", customerPhone).single();

    // Log history
    const { data: historyEntry } = await client.from("spinHistory").insert({
      walletId: wallet?.id || 0,
      customerPhone,
      rewardId: selectedReward.id,
      rewardLabel: selectedReward.label,
      rewardType: selectedReward.rewardType,
      rewardValue: selectedReward.rewardValue,
      rewardColor: selectedReward.color,
      idempotencyKey: idempotencyKey || null,
    }).select().single();

    // Apply reward. H25 fix: if reward issuance fails after spin decrement,
    // log the failure so an admin can manually issue the reward. We do NOT
    // roll back the spin decrement (that would create a different race window
    // where a customer could "win then un-win" via failure injection).
    if (selectedReward.rewardType === "points" && wallet) {
      try {
        // Use atomic increment helper to avoid C3-style lost update.
        await client.rpc("increment_wallet_points", {
          p_wallet_id: wallet.id,
          p_points: selectedReward.rewardValue,
        });
        await client.from("loyaltyTransactions").insert({
          walletId: wallet.id,
          type: "earn",
          points: selectedReward.rewardValue,
          description: `Lucky Spin: ${selectedReward.label}`,
        });
      } catch (err) {
        console.error(`[Spin] Failed to issue points reward for ${customerPhone}:`, err);
      }
    } else if (selectedReward.rewardType === "coupon" && wallet) {
      try {
        await createDiscountCoupon({
          walletId: wallet.id,
          discountPercent: selectedReward.rewardValue,
          source: "spin",
          label: `${selectedReward.rewardValue}% OFF (Lucky Spin)`,
        });
      } catch (err) {
        console.error(`[Spin] Failed to issue coupon reward for ${customerPhone}:`, err);
      }
    } else if (selectedReward.rewardType === "freeItem" && wallet) {
      try {
        await createFreeItemCoupon({
          walletId: wallet.id,
          itemName: selectedReward.label,
          source: "spin",
        });
      } catch (err) {
        console.error(`[Spin] Failed to issue freeItem reward for ${customerPhone}:`, err);
      }
    }

    res.json({
      success: true,
      reward: {
        id: selectedReward.id,
        label: selectedReward.label,
        rewardType: selectedReward.rewardType,
        rewardValue: selectedReward.rewardValue,
        color: selectedReward.color,
      },
      historyId: historyEntry?.id,
      remainingSpins,
    });
  } catch (err: any) {
    console.error("[Spin] Play error:", err);
    res.status(500).json({ error: "Failed to process spin" });
  }
});

// CRITICAL (C8 fix): every /api/spin/admin/* endpoint now requires admin auth.
router.get("/api/spin/admin/rewards", async (req: Request, res: Response) => {
  try {
    if (!(await requirePermission(req, res, "customers"))) return;
    const client = sb() as any;
    const { data } = await client.from("spinRewards").select("*").order("id");
    res.json(data || []);
  } catch (err: any) {
    console.error("[Spin] Admin rewards error:", err);
    res.status(500).json({ error: "Failed to fetch rewards" });
  }
});

router.post("/api/spin/admin/rewards", async (req: Request, res: Response) => {
  try {
    if (!(await requirePermission(req, res, "customers"))) return;
    const { id, label, rewardType, rewardValue, color, probability, enabled } = req.body;
    const client = sb() as any;

    // Validate numeric fields to prevent garbage in DB.
    if (typeof rewardValue !== "number" || typeof probability !== "number" || !Number.isFinite(rewardValue) || !Number.isFinite(probability)) {
      return res.status(400).json({ error: "rewardValue and probability must be numbers" });
    }
    if (rewardValue < 0 || probability < 0) {
      return res.status(400).json({ error: "rewardValue and probability must be non-negative" });
    }

    if (id) {
      await client.from("spinRewards").update({
        label, rewardType, rewardValue, color, probability, enabled,
      }).eq("id", id);
    } else {
      await client.from("spinRewards").insert({
        label, rewardType, rewardValue, color, probability, enabled: enabled ?? true,
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Spin] Admin save error:", err);
    res.status(500).json({ error: "Failed to save reward" });
  }
});

router.delete("/api/spin/admin/rewards/:id", async (req: Request, res: Response) => {
  try {
    if (!(await requirePermission(req, res, "customers"))) return;
    const client = sb() as any;
    await client.from("spinRewards").delete().eq("id", parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Spin] Admin delete error:", err);
    res.status(500).json({ error: "Failed to delete reward" });
  }
});

router.get("/api/spin/admin/history", async (req: Request, res: Response) => {
  try {
    if (!(await requirePermission(req, res, "customers"))) return;
    const client = sb() as any;
    const { data } = await client.from("spinHistory").select("*").order("spunAt", { ascending: false }).limit(200);
    res.json(data || []);
  } catch (err: any) {
    console.error("[Spin] Admin history error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
