import { useQuery } from "@tanstack/react-query";

function getPhone(tableCode?: string): string {
  if (!tableCode) return "";
  try {
    return localStorage.getItem(`cafe-customer-phone-${tableCode}`) || "";
  } catch {
    return "";
  }
}

export function calculatePoints(amount: number): number {
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

export interface LoyaltyTier {
  minSpend: number;
  points: number;
}

export interface LoyaltyTiersData {
  loyaltyEnabled: boolean;
  loyaltyRewardPercent: number;
  loyaltyPointsThreshold: number;
  tiers: LoyaltyTier[];
}

export function getNextMilestone(cartTotal: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  for (const tier of tiers) {
    if (cartTotal < tier.minSpend) return tier;
  }
  return null;
}

export function getCurrentTierPoints(cartTotal: number, tiers: LoyaltyTier[]): number {
  let earned = 0;
  for (const tier of tiers) {
    if (cartTotal >= tier.minSpend) {
      earned = tier.points;
    } else {
      break;
    }
  }
  return earned;
}

export interface LoyaltyWallet {
  id: number;
  customerPhone: string;
  customerName: string | null;
  currentPoints: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

export interface LoyaltyCoupon {
  id: number;
  walletId: number;
  code: string;
  discountPercent: number;
  status: string;
  redeemedAt: string | null;
  redeemedOrderId: number | null;
  expiresAt: string | null;
  createdAt: string;
  source: "loyalty" | "spin";
  rewardType: "discount" | "freeItem" | "none";
  rewardLabel: string | null;
}

export interface MilestoneData {
  points: number;
  spins: number;
  couponPercent: number;
  enabled: boolean;
  reached: boolean;
  redeemed: boolean;
  rewardType: "spins" | "coupon" | null;
  spinsAwarded: number;
  couponId: number | null;
  redeemedAt: string | null;
}

export interface LoyaltyData {
  wallet: LoyaltyWallet;
  transactions: any[];
  coupons: LoyaltyCoupon[];
  activeCoupons: LoyaltyCoupon[];
  progress: number;
  progressPercent: number;
  pointsToNext: number;
  nextReward: number;
  milestones: MilestoneData[];
}

export function useLoyalty(tableCode?: string, phoneOverride?: string) {
  const phone = phoneOverride || getPhone(tableCode);
  const sanitized = phone.replace(/[\s\-\(\)\+]/g, "");
  const normalized = !sanitized.startsWith("91") && sanitized.length === 10 ? "91" + sanitized : sanitized;

  const query = useQuery<LoyaltyData>({
    queryKey: ["loyalty", normalized],
    enabled: normalized.length >= 10,
    queryFn: async () => {
      const res = await fetch(`/api/loyalty/wallet/${normalized}`);
      if (!res.ok) throw new Error("Failed to fetch loyalty data");
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    phone: normalized,
    hasPhone: normalized.length >= 10,
    wallet: query.data?.wallet,
    activeCoupons: query.data?.activeCoupons || [],
    pointsToNext: query.data?.pointsToNext ?? 100,
    progressPercent: query.data?.progressPercent ?? 0,
    progress: query.data?.progress ?? 0,
    nextReward: query.data?.nextReward ?? 5,
    milestones: query.data?.milestones || [],
  };
}

export function useLoyaltyTiers() {
  return useQuery<LoyaltyTiersData>({
    queryKey: ["loyaltyTiers"],
    queryFn: async () => {
      const res = await fetch("/api/public/loyalty-tiers");
      if (!res.ok) throw new Error("Failed to fetch loyalty tiers");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export interface SpinStatusData {
  available: number;
  used: number;
  totalSpinsUsed: number;
  lifetimeEarned: number;
  currentPoints: number;
  nextMilestone: { points: number; spins: number } | null;
  unclaimedMilestones: { points: number; spins: number }[];
  history: any[];
  milestones: any[];
}

export function useSpinStatus(phone?: string) {
  return useQuery<SpinStatusData>({
    queryKey: ["spinStatus", phone],
    enabled: !!phone && phone.length >= 10,
    queryFn: async () => {
      const res = await fetch(`/api/spin/status/${phone}`);
      if (!res.ok) throw new Error("Failed to fetch spin status");
      return res.json();
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}
