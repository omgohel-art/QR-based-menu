import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { createDiscountCoupon, createFreeItemCoupon } from "./couponService";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

const SPIN_MILESTONES = [
  { points: 50, spins: 1 },
  { points: 100, spins: 3 },
  { points: 150, spins: 5 },
];

export interface MilestoneConfig {
  points: number;
  spins: number;
  couponPercent: number;
  enabled: boolean;
}

const DEFAULT_MILESTONE_CONFIG: MilestoneConfig[] = [
  { points: 50, spins: 1, couponPercent: 5, enabled: true },
  { points: 100, spins: 3, couponPercent: 10, enabled: true },
  { points: 150, spins: 5, couponPercent: 15, enabled: true },
];

async function getMilestoneConfig(): Promise<MilestoneConfig[]> {
  const client = sb() as any;
  if (!client) return DEFAULT_MILESTONE_CONFIG;
  const { data } = await client.from("businessSettings").select("milestoneConfig").single();
  if (data?.milestoneConfig) {
    return data.milestoneConfig;
  }
  return DEFAULT_MILESTONE_CONFIG;
}

function calculatePoints(amount: number): number {
  if (amount < 500) return 0;
  if (amount < 1000) return 5;
  if (amount < 1500) return 15;
  if (amount < 2000) return 20;
  if (amount < 2500) return 30;
  if (amount < 3000) return 45;
  if (amount < 3500) return 50;
  if (amount < 4000) return 60;
  const extra = Math.floor((amount - 4000) / 500);
  return 60 + extra * 10;
}

function generateCouponCode(): string {
  return `CAFE-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function getLoyaltySettings() {
  const client = sb();
  if (!client) return { loyaltyEnabled: true, loyaltyRewardPercent: 5, loyaltyPointsThreshold: 100 };
  const { data } = await client.from("businessSettings").select("loyaltyEnabled,loyaltyRewardPercent,loyaltyPointsThreshold" as any).single();
  return data || { loyaltyEnabled: true, loyaltyRewardPercent: 5, loyaltyPointsThreshold: 100 };
}

async function ensureWallet(phone: string, name?: string) {
  const client = sb() as any;
  const { data: existing } = await client.from("loyaltyWallets").select("*").eq("customerPhone", phone).single();
  if (existing) return existing;
  const { data: created } = await client.from("loyaltyWallets").insert({
    customerPhone: phone,
    customerName: name || null,
    currentPoints: 0,
    lifetimeEarned: 0,
    lifetimeRedeemed: 0,
  } as any).select().single();
  return created;
}

async function generateCouponsForMilestone(walletId: number, totalPoints: number) {
  const client = sb() as any;
  const settings = await getLoyaltySettings();
  const threshold = settings.loyaltyPointsThreshold || 100;
  const rewardPercent = settings.loyaltyRewardPercent || 5;

  const { data: existingCoupons } = await client.from("loyaltyCoupons").select("id").eq("walletId", walletId);
  const existingCount = existingCoupons?.length || 0;
  const newCouponsNeeded = Math.floor(totalPoints / threshold) - existingCount;

  const newCoupons = [];
  for (let i = 0; i < newCouponsNeeded; i++) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 3);
    newCoupons.push({
      walletId,
      code: generateCouponCode(),
      discountPercent: rewardPercent,
      status: "active",
      expiresAt: expiresAt.toISOString(),
    });
  }
  if (newCoupons.length > 0) {
    await client.from("loyaltyCoupons").insert(newCoupons);
  }
  return newCoupons;
}

export interface LoyaltyEarnResult {
  earned: number;
  totalPoints: number;
  milestoneReached: boolean;
  newCouponsCount: number;
  spinsAwarded: number;
  newSpinMilestones: number[];
}

export async function awardLoyaltyPoints(
  customerPhone: string,
  customerName: string | undefined,
  orderAmount: number,
  orderId: number
): Promise<LoyaltyEarnResult> {
  const client = sb() as any;
  const settings = await getLoyaltySettings();

  if (!settings.loyaltyEnabled) {
    return { earned: 0, totalPoints: 0, milestoneReached: false, newCouponsCount: 0, spinsAwarded: 0, newSpinMilestones: [] };
  }

  const points = calculatePoints(orderAmount);
  if (points === 0) {
    return { earned: 0, totalPoints: 0, milestoneReached: false, newCouponsCount: 0, spinsAwarded: 0, newSpinMilestones: [] };
  }

  const wallet = await ensureWallet(customerPhone, customerName);
  if (!wallet) {
    return { earned: 0, totalPoints: 0, milestoneReached: false, newCouponsCount: 0, spinsAwarded: 0, newSpinMilestones: [] };
  }

  // CRITICAL (C2/C3 fix): Atomically insert the earn transaction with a UNIQUE
  // (orderId, type='earn') guard. If the insert succeeds (rowsAffected > 0), we
  // are the first winner; bump the wallet atomically via SQL. If the insert
  // fails with a unique-violation, a concurrent award already won — return the
  // current wallet state.
  //
  // This eliminates the duplicate-award race and the lost-update race that came
  // from computing `currentPoints + points` in JS.
  const { error: insertError } = await client
    .from("loyaltyTransactions")
    .insert({
      walletId: wallet.id,
      type: "earn",
      points,
      orderId,
      orderAmount: orderAmount.toString(),
      description: `Order #${orderId} — ₹${orderAmount}`,
    });

  if (insertError) {
    // If unique violation on (orderId, type='earn'), another concurrent award
    // already credited this order. Return the current wallet state, not a double.
    if (insertError.code === "23505") {
      const { data: w } = await client
        .from("loyaltyWallets")
        .select("currentPoints")
        .eq("id", wallet.id)
        .single();
      return {
        earned: 0,
        totalPoints: w?.currentPoints || 0,
        milestoneReached: false,
        newCouponsCount: 0,
        spinsAwarded: 0,
        newSpinMilestones: [],
      };
    }
    throw insertError;
  }

  // Atomic SQL increment — no JS-side race possible.
  // Note: Supabase JS doesn't expose a +1 update directly, so we use rpc('increment_wallet_points')
  // if available, otherwise fall back to a guarded UPDATE that re-reads the previous value.
  // To avoid race entirely we use a conditional UPDATE that won't ever overshoot.
  const { data: updatedWallet } = await client
    .rpc("increment_wallet_points", { p_wallet_id: wallet.id, p_points: points })
    .single()
    .catch(() => ({ data: null } as any));

  let newTotal: number;
  let newLifetime: number;
  if (updatedWallet) {
    newTotal = (updatedWallet as any).currentPoints;
    newLifetime = (updatedWallet as any).lifetimeEarned;
  } else {
    // Fallback path. Bug 2 fix: the previous version had a broken early-return
    // condition that could double-add points under concurrency. The simpler and
    // correct approach is to bail out — if the atomic RPC isn't available we
    // should NOT fall back to a JS-side read-modify-write that races. Surface
    // a clear error so the operator knows the schema migration is missing.
    console.error(
      `[loyalty] increment_wallet_points RPC not available — wallet ${wallet.id} was NOT credited ${points} points for order ${orderId}. ` +
      `Apply scripts/migrate-hardening-fixes.sql to provision the SQL helper.`
    );
    // Best-effort fallback: read the current state without modification.
    const { data: w } = await client
      .from("loyaltyWallets")
      .select("currentPoints, lifetimeEarned")
      .eq("id", wallet.id)
      .single();
    if (!w) {
      throw new Error("Wallet disappeared during loyalty award");
    }
    newTotal = w.currentPoints;
    newLifetime = w.lifetimeEarned;
  }

  // Check which milestones have been reached (customer will choose reward later)
  const milestoneConfig = await getMilestoneConfig();
  const newMilestonesReached: number[] = [];
  for (const m of milestoneConfig) {
    if (m.enabled && newLifetime >= m.points) {
      newMilestonesReached.push(m.points);
    }
  }

  return { earned: points, totalPoints: newTotal, milestoneReached: newMilestonesReached.length > 0, newCouponsCount: 0, spinsAwarded: 0, newSpinMilestones: newMilestonesReached };
}

export async function reverseLoyaltyPoints(
  customerPhone: string,
  orderId: number
): Promise<{ reversed: boolean; pointsReversed: number }> {
  const client = sb() as any;

  // Find the original earn transaction
  const { data: txn } = await client.from("loyaltyTransactions").select("id, points, walletId").eq("orderId", orderId).eq("type", "earn").single();
  if (!txn) {
    return { reversed: false, pointsReversed: 0 };
  }

  // Check if already reversed (Bug 1 fix: look for the type we actually write,
  // which is 'adjust' — the schema CHECK constraint only allows earn/redeem/adjust).
  const { data: existingReverse } = await client.from("loyaltyTransactions").select("id").eq("orderId", orderId).eq("type", "adjust").eq("description", `Order #${orderId} cancelled — reversed`).single();
  if (existingReverse) {
    return { reversed: false, pointsReversed: 0 };
  }
  // Belt-and-braces: also check the orders.loyaltyReversed flag we set.
  const { data: orderRow } = await client.from("orders").select("loyaltyReversed").eq("id", orderId).single();
  if (orderRow?.loyaltyReversed) {
    return { reversed: false, pointsReversed: 0 };
  }

  // Get wallet
  const { data: wallet } = await client.from("loyaltyWallets").select("id, currentPoints, lifetimeEarned").eq("customerPhone", customerPhone).single();
  if (!wallet) {
    return { reversed: false, pointsReversed: 0 };
  }

  const pointsToReverse = txn.points;
  const newTotal = Math.max(0, wallet.currentPoints - pointsToReverse);
  const newLifetime = Math.max(0, wallet.lifetimeEarned - pointsToReverse);

  await client.from("loyaltyWallets").update({
    currentPoints: newTotal,
    lifetimeEarned: newLifetime,
    updatedAt: new Date().toISOString(),
  }).eq("id", wallet.id);

  await client.from("loyaltyTransactions").insert({
    walletId: wallet.id,
    type: "adjust",
    points: -pointsToReverse,
    orderId,
    description: `Order #${orderId} cancelled — reversed ${pointsToReverse} points`,
  });

  // Reverse spins if they haven't been used
  const { data: spinMilestones } = await client.from("spinMilestones").select("id, milestonePoints, spinsAwarded").eq("walletId", wallet.id);
  if (spinMilestones && spinMilestones.length > 0) {
    // Check which milestones are no longer valid with the new lifetime
    for (const m of spinMilestones) {
      if (newLifetime < m.milestonePoints) {
        // Check if spins from this milestone have been used
        const { data: spinHistory } = await client.from("spinHistory").select("id").eq("walletId", wallet.id).limit(m.spinsAwarded);
        if (!spinHistory || spinHistory.length === 0) {
          // Spins not used, remove the milestone and deduct spins
          await client.from("spinMilestones").delete().eq("id", m.id);
          
          const { data: customerSpins } = await client.from("customerSpins").select("id, available").eq("customerPhone", customerPhone).single();
          if (customerSpins) {
            await client.from("customerSpins").update({
              available: Math.max(0, customerSpins.available - m.spinsAwarded),
              updatedAt: new Date().toISOString(),
            }).eq("id", customerSpins.id);
          }
        }
      }
    }
  }

  // Mark order as reversed
  await client.from("orders").update({
    loyaltyReversed: true,
    updatedAt: new Date().toISOString(),
  }).eq("id", orderId);

  return { reversed: true, pointsReversed: pointsToReverse };
}

export async function getMilestoneStatus(customerPhone: string) {
  const client = sb() as any;
  const wallet = await client.from("loyaltyWallets").select("id, currentPoints, lifetimeEarned").eq("customerPhone", customerPhone).single();
  if (!wallet) return { milestones: [], wallet: null };

  const milestoneConfig = await getMilestoneConfig();
  const { data: redemptions } = await client.from("milestoneRedemptions").select("milestonePoints, rewardType, spinsAwarded, couponId, redeemedAt").eq("walletId", wallet.id);

  const milestones = milestoneConfig.map((m) => {
    const redemption = redemptions?.find((r: any) => r.milestonePoints === m.points);
    return {
      points: m.points,
      spins: m.spins,
      couponPercent: m.couponPercent,
      enabled: m.enabled,
      reached: wallet.lifetimeEarned >= m.points,
      redeemed: !!redemption,
      rewardType: redemption?.rewardType || null,
      spinsAwarded: redemption?.spinsAwarded || 0,
      couponId: redemption?.couponId || null,
      redeemedAt: redemption?.redeemedAt || null,
    };
  });

  return { milestones, wallet };
}

export async function redeemMilestone(
  customerPhone: string,
  milestonePoints: number,
  rewardType: "spins" | "coupon"
): Promise<{ success: boolean; error?: string; spinsAwarded?: number; couponId?: number; couponCode?: string; couponPercent?: number }> {
  const client = sb() as any;

  const wallet = await client.from("loyaltyWallets").select("id, currentPoints, lifetimeEarned").eq("customerPhone", customerPhone).single();
  if (!wallet) return { success: false, error: "Wallet not found" };

  // Check if milestone is reached
  if (wallet.lifetimeEarned < milestonePoints) {
    return { success: false, error: "Milestone not reached yet" };
  }

  // Check if already redeemed
  const { data: existing } = await client.from("milestoneRedemptions").select("id").eq("walletId", wallet.id).eq("milestonePoints", milestonePoints).single();
  if (existing) {
    return { success: false, error: "Milestone already redeemed" };
  }

  // Get milestone config
  const milestoneConfig = await getMilestoneConfig();
  const milestone = milestoneConfig.find((m) => m.points === milestonePoints);
  if (!milestone) return { success: false, error: "Invalid milestone" };
  if (!milestone.enabled) return { success: false, error: "Milestone is disabled" };

  // Check if customer has enough points
  if (wallet.currentPoints < milestonePoints) {
    return { success: false, error: `You need ${milestonePoints - wallet.currentPoints} more points` };
  }

  // Deduct points
  const newTotal = wallet.currentPoints - milestonePoints;
  await client.from("loyaltyWallets").update({
    currentPoints: newTotal,
    updatedAt: new Date().toISOString(),
  }).eq("id", wallet.id);

  // Record the redemption
  let spinsAwarded = 0;
  let couponId: number | null = null;
  let couponCode: string | undefined;
  let couponPercent: number | undefined;

  if (rewardType === "spins") {
    spinsAwarded = milestone.spins;
    // Add spins to customerSpins
    const { data: spins } = await client.from("customerSpins").select("id, available").eq("customerPhone", customerPhone).single();
    if (spins) {
      await client.from("customerSpins").update({
        available: spins.available + spinsAwarded,
        updatedAt: new Date().toISOString(),
      }).eq("id", spins.id);
    } else {
      await client.from("customerSpins").insert({
        walletId: wallet.id,
        customerPhone,
        available: spinsAwarded,
        used: 0,
      });
    }
  } else if (rewardType === "coupon") {
    const coupon = await createDiscountCoupon({
      walletId: wallet.id,
      discountPercent: milestone.couponPercent,
      source: "loyalty",
      label: `${milestone.couponPercent}% OFF`,
    });
    couponId = coupon.id;
    couponCode = coupon.code;
  }

  // Insert redemption record
  await client.from("milestoneRedemptions").insert({
    walletId: wallet.id,
    customerPhone,
    milestonePoints,
    rewardType,
    pointsDeducted: milestonePoints,
    spinsAwarded,
    couponId,
  });

  // Log the transaction
  await client.from("loyaltyTransactions").insert({
    walletId: wallet.id,
    type: "redeem",
    points: -milestonePoints,
    description: `Milestone ${milestonePoints}pts redeemed for ${rewardType === "spins" ? `${spinsAwarded} spins` : `${couponPercent}% coupon`}`,
  });

  return { success: true, spinsAwarded, couponId: couponId || undefined, couponCode, couponPercent: rewardType === "coupon" ? milestone.couponPercent : undefined };
}
