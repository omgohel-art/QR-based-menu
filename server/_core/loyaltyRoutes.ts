import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  validateCoupon,
  applyCoupon,
  getCustomerCoupons,
  getActiveCoupons,
  getAllCoupons,
  deactivateCoupon,
  forceExpireCoupon,
  expireCoupons,
} from "./couponService";
import {
  awardLoyaltyPoints,
  reverseLoyaltyPoints,
  getMilestoneStatus,
  redeemMilestone,
} from "./loyaltyService";

const router = Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

async function ensureWallet(phone: string, name?: string) {
  const client = sb()!;
  const { data: existing } = await client.from("loyaltyWallets").select("*").eq("customerPhone", phone).single();
  if (existing) return existing;
  const { data: created } = await client.from("loyaltyWallets").insert({
    customerPhone: phone,
    customerName: name || null,
    currentPoints: 0,
    lifetimeEarned: 0,
    lifetimeRedeemed: 0,
  }).select().single();
  return created;
}

// POST /api/loyalty/earn — earn points for a completed order
router.post("/api/loyalty/earn", async (req: Request, res: Response) => {
  try {
    const { customerPhone, customerName, orderAmount, orderId } = req.body;
    if (!customerPhone || !orderAmount || !orderId) {
      return res.status(400).json({ error: "customerPhone, orderAmount, and orderId are required" });
    }

    const result = await awardLoyaltyPoints(customerPhone, customerName, orderAmount, orderId);
    res.json(result);
  } catch (err: any) {
    console.error("[Loyalty] Earn error:", err);
    res.status(500).json({ error: "Failed to earn points" });
  }
});

// GET /api/loyalty/wallet/:phone
router.get("/api/loyalty/wallet/:phone", async (req: Request, res: Response) => {
  try {
    const client = sb()!;
    const phone = req.params.phone;
    const wallet = await ensureWallet(phone);

    const { data: transactions } = await client.from("loyaltyTransactions")
      .select("*").eq("walletId", wallet.id).order("createdAt", { ascending: false }).limit(50);

    const coupons = await getCustomerCoupons(phone);
    const activeCoupons = coupons.filter((c) => c.status === "active");
    const { milestones } = await getMilestoneStatus(phone);

    res.json({
      wallet,
      transactions: transactions || [],
      coupons,
      activeCoupons,
      progress: 0,
      progressPercent: 0,
      pointsToNext: 0,
      nextReward: 0,
      milestones,
    });
  } catch (err: any) {
    console.error("[Loyalty] Wallet error:", err);
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

// POST /api/loyalty/redeem — redeem a coupon by code at checkout
router.post("/api/loyalty/redeem", async (req: Request, res: Response) => {
  try {
    const { couponCode, customerPhone, orderId } = req.body;
    if (!couponCode || !customerPhone || !orderId) {
      return res.status(400).json({ error: "couponCode, customerPhone, and orderId are required" });
    }

    const result = await validateCoupon(couponCode, customerPhone);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    const applied = await applyCoupon(result.coupon!.id, orderId);
    res.json({
      success: true,
      discountPercent: applied.discountPercent,
      rewardType: applied.rewardType,
      rewardLabel: applied.rewardLabel,
      couponCode: applied.code,
    });
  } catch (err: any) {
    console.error("[Loyalty] Redeem error:", err);
    res.status(500).json({ error: "Failed to redeem coupon" });
  }
});

// GET /api/loyalty/validate-coupon/:code
router.get("/api/loyalty/validate-coupon/:code", async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string | undefined;
    const result = await validateCoupon(req.params.code, phone);
    if (!result.valid) return res.json({ valid: false, error: result.error });
    res.json({
      valid: true,
      discountPercent: result.coupon!.discountPercent,
      rewardType: result.coupon!.rewardType,
      rewardLabel: result.coupon!.rewardLabel,
      couponCode: result.coupon!.code,
    });
  } catch {
    res.json({ valid: false });
  }
});

// GET /api/loyalty/my-coupons/:phone — get all coupons for a customer
router.get("/api/loyalty/my-coupons/:phone", async (req: Request, res: Response) => {
  try {
    const coupons = await getCustomerCoupons(req.params.phone);
    res.json(coupons);
  } catch (err: any) {
    console.error("[Loyalty] My coupons error:", err);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// POST /api/loyalty/reverse — reverse points for a cancelled order
router.post("/api/loyalty/reverse", async (req: Request, res: Response) => {
  try {
    const { customerPhone, orderId } = req.body;
    if (!customerPhone || !orderId) {
      return res.status(400).json({ error: "customerPhone and orderId are required" });
    }

    const result = await reverseLoyaltyPoints(customerPhone, orderId);
    res.json(result);
  } catch (err: any) {
    console.error("[Loyalty] Reverse error:", err);
    res.status(500).json({ error: "Failed to reverse points" });
  }
});

// GET /api/loyalty/milestones/:phone
router.get("/api/loyalty/milestones/:phone", async (req: Request, res: Response) => {
  try {
    const result = await getMilestoneStatus(req.params.phone);
    res.json(result);
  } catch (err: any) {
    console.error("[Loyalty] Milestones error:", err);
    res.status(500).json({ error: "Failed to fetch milestones" });
  }
});

// POST /api/loyalty/redeem-milestone
router.post("/api/loyalty/redeem-milestone", async (req: Request, res: Response) => {
  try {
    const { customerPhone, milestonePoints, rewardType } = req.body;
    if (!customerPhone || !milestonePoints || !rewardType) {
      return res.status(400).json({ error: "customerPhone, milestonePoints, and rewardType are required" });
    }
    if (rewardType !== "spins" && rewardType !== "coupon") {
      return res.status(400).json({ error: "rewardType must be 'spins' or 'coupon'" });
    }
    const result = await redeemMilestone(customerPhone, milestonePoints, rewardType);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err: any) {
    console.error("[Loyalty] Redeem milestone error:", err);
    res.status(500).json({ error: "Failed to redeem milestone" });
  }
});

// GET /api/loyalty/milestone-config
router.get("/api/loyalty/milestone-config", async (_req: Request, res: Response) => {
  try {
    const client = sb()!;
    const { data } = await client.from("businessSettings").select("milestoneConfig").single();
    res.json(data?.milestoneConfig || [
      { points: 50, spins: 1, couponPercent: 5, enabled: true },
      { points: 100, spins: 3, couponPercent: 10, enabled: true },
      { points: 150, spins: 5, couponPercent: 15, enabled: true },
    ]);
  } catch (err: any) {
    console.error("[Loyalty] Milestone config error:", err);
    res.status(500).json({ error: "Failed to fetch milestone config" });
  }
});

// PUT /api/loyalty/milestone-config
router.put("/api/loyalty/milestone-config", async (req: Request, res: Response) => {
  try {
    const { config } = req.body;
    if (!config || !Array.isArray(config)) {
      return res.status(400).json({ error: "config array is required" });
    }
    const client = sb()!;
    await client.from("businessSettings").update({ milestoneConfig: config }).eq("id", 1);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Loyalty] Update milestone config error:", err);
    res.status(500).json({ error: "Failed to update milestone config" });
  }
});

// ============ ADMIN COUPON MANAGEMENT ============

// GET /api/loyalty/admin/wallets
router.get("/api/loyalty/admin/wallets", async (_req: Request, res: Response) => {
  try {
    const client = sb()!;
    const { data: wallets } = await client.from("loyaltyWallets").select("*").order("currentPoints", { ascending: false });
    res.json(wallets || []);
  } catch (err: any) {
    console.error("[Loyalty] Admin wallets error:", err);
    res.status(500).json({ error: "Failed to fetch wallets" });
  }
});

// GET /api/loyalty/admin/coupons — all coupons with customer info
router.get("/api/loyalty/admin/coupons", async (_req: Request, res: Response) => {
  try {
    const coupons = await getAllCoupons();
    res.json(coupons);
  } catch (err: any) {
    console.error("[Loyalty] Admin coupons error:", err);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// POST /api/loyalty/admin/adjust
router.post("/api/loyalty/admin/adjust", async (req: Request, res: Response) => {
  try {
    const { customerPhone, points, reason } = req.body;
    if (!customerPhone || points === undefined) {
      return res.status(400).json({ error: "customerPhone and points are required" });
    }
    const wallet = await ensureWallet(customerPhone);
    const client = sb()!;
    await client.from("loyaltyWallets").update({
      currentPoints: Math.max(0, wallet.currentPoints + points),
      lifetimeEarned: points > 0 ? wallet.lifetimeEarned + points : wallet.lifetimeEarned,
      lifetimeRedeemed: points < 0 ? wallet.lifetimeRedeemed + Math.abs(points) : wallet.lifetimeRedeemed,
      updatedAt: new Date().toISOString(),
    }).eq("id", wallet.id);

    await client.from("loyaltyTransactions").insert({
      walletId: wallet.id,
      type: "adjust",
      points: Math.abs(points),
      description: reason || `Admin adjustment: ${points > 0 ? "+" : ""}${points} points`,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("[Loyalty] Adjust error:", err);
    res.status(500).json({ error: "Failed to adjust points" });
  }
});

// PATCH /api/loyalty/admin/coupons/:id/deactivate
router.patch("/api/loyalty/admin/coupons/:id/deactivate", async (req: Request, res: Response) => {
  try {
    await deactivateCoupon(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Loyalty] Deactivate coupon error:", err);
    res.status(500).json({ error: "Failed to deactivate coupon" });
  }
});

// PATCH /api/loyalty/admin/coupons/:id/expire
router.patch("/api/loyalty/admin/coupons/:id/expire", async (req: Request, res: Response) => {
  try {
    await forceExpireCoupon(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Loyalty] Expire coupon error:", err);
    res.status(500).json({ error: "Failed to expire coupon" });
  }
});

// POST /api/loyalty/admin/expire-all — expire all overdue coupons
router.post("/api/loyalty/admin/expire-all", async (_req: Request, res: Response) => {
  try {
    const count = await expireCoupons();
    res.json({ expired: count });
  } catch (err: any) {
    console.error("[Loyalty] Expire all error:", err);
    res.status(500).json({ error: "Failed to expire coupons" });
  }
});

export default router;
