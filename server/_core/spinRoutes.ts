import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { createDiscountCoupon, createFreeItemCoupon, createCoupon } from "./couponService";

const router = Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

// Lucky Spin milestones: [lifetimePoints, spinsAwarded]
const SPIN_MILESTONES = [
  { points: 50, spins: 1 },
  { points: 100, spins: 3 },
  { points: 150, spins: 5 },
];

async function ensureSpinRewards() {
  const client = sb()!;
  const { data } = await client.from("spinRewards").select("*").eq("enabled", true).order("id");
  return data || [];
}

async function ensureCustomerSpins(phone: string) {
  const client = sb()!;
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
  const client = sb()!;
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
    const client = sb()!;

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
    const { customerPhone } = req.body;
    if (!customerPhone) return res.status(400).json({ error: "customerPhone is required" });

    const client = sb()!;

    // Check available spins
    const { data: spins } = await client.from("customerSpins").select("*").eq("customerPhone", customerPhone).single();
    if (!spins || spins.available <= 0) {
      return res.status(400).json({ error: "No spins available" });
    }

    // Get enabled rewards
    const { data: rewards } = await client.from("spinRewards").select("*").eq("enabled", true);
    if (!rewards || rewards.length === 0) {
      return res.status(500).json({ error: "No rewards configured" });
    }

    // Weighted random selection
    const totalWeight = rewards.reduce((sum: number, r: any) => sum + Number(r.probability), 0);
    let random = Math.random() * totalWeight;
    let selectedReward = rewards[0];
    for (const reward of rewards) {
      random -= Number(reward.probability);
      if (random <= 0) {
        selectedReward = reward;
        break;
      }
    }

    // Deduct a spin
    await client.from("customerSpins").update({
      available: spins.available - 1,
      used: spins.used + 1,
      updatedAt: new Date().toISOString(),
    }).eq("id", spins.id);

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
    }).select().single();

    // Apply reward
    if (selectedReward.rewardType === "points" && wallet) {
      const { data: w } = await client.from("loyaltyWallets").select("currentPoints, lifetimeEarned").eq("id", wallet.id).single();
      if (w) {
        await client.from("loyaltyWallets").update({
          currentPoints: w.currentPoints + selectedReward.rewardValue,
          lifetimeEarned: w.lifetimeEarned + selectedReward.rewardValue,
          updatedAt: new Date().toISOString(),
        }).eq("id", wallet.id);
      }
      // Log transaction
      await client.from("loyaltyTransactions").insert({
        walletId: wallet.id,
        type: "earn",
        points: selectedReward.rewardValue,
        description: `Lucky Spin: ${selectedReward.label}`,
      });
    } else if (selectedReward.rewardType === "coupon" && wallet) {
      await createDiscountCoupon({
        walletId: wallet.id,
        discountPercent: selectedReward.rewardValue,
        source: "spin",
        label: `${selectedReward.rewardValue}% OFF (Lucky Spin)`,
      });
    } else if (selectedReward.rewardType === "freeItem" && wallet) {
      await createFreeItemCoupon({
        walletId: wallet.id,
        itemName: selectedReward.label,
        source: "spin",
      });
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
      remainingSpins: spins.available - 1,
    });
  } catch (err: any) {
    console.error("[Spin] Play error:", err);
    res.status(500).json({ error: "Failed to process spin" });
  }
});

// GET /api/spin/admin/rewards — admin: all wheel rewards
router.get("/api/spin/admin/rewards", async (_req: Request, res: Response) => {
  try {
    const client = sb()!;
    const { data } = await client.from("spinRewards").select("*").order("id");
    res.json(data || []);
  } catch (err: any) {
    console.error("[Spin] Admin rewards error:", err);
    res.status(500).json({ error: "Failed to fetch rewards" });
  }
});

// POST /api/spin/admin/rewards — admin: add/update reward
router.post("/api/spin/admin/rewards", async (req: Request, res: Response) => {
  try {
    const { id, label, rewardType, rewardValue, color, probability, enabled } = req.body;
    const client = sb()!;

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

// DELETE /api/spin/admin/rewards/:id
router.delete("/api/spin/admin/rewards/:id", async (req: Request, res: Response) => {
  try {
    const client = sb()!;
    await client.from("spinRewards").delete().eq("id", parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Spin] Admin delete error:", err);
    res.status(500).json({ error: "Failed to delete reward" });
  }
});

// GET /api/spin/admin/history — admin: all spin history
router.get("/api/spin/admin/history", async (_req: Request, res: Response) => {
  try {
    const client = sb()!;
    const { data } = await client.from("spinHistory").select("*").order("spunAt", { ascending: false }).limit(200);
    res.json(data || []);
  } catch (err: any) {
    console.error("[Spin] Admin history error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
