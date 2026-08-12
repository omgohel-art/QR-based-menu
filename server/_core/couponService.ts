import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb as any;
}

export interface CouponRecord {
  id: number;
  walletId: number;
  code: string;
  discountPercent: number;
  status: string;
  redeemedAt: string | null;
  redeemedOrderId: number | null;
  expiresAt: string | null;
  createdAt: string;
  source: string;
  rewardType: string;
  rewardLabel: string;
}

export type CouponSource = "loyalty" | "spin";
export type CouponRewardType = "discount" | "freeItem" | "none";

function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `MAMA-${code}`;
}

async function ensureUniqueCode(attempt = 0): Promise<string> {
  if (attempt > 10) throw new Error("Could not generate unique coupon code");
  const code = generateCouponCode();
  const client = sb();
  const { data } = await client.from("loyaltyCoupons").select("id").eq("code", code);
  if (data && data.length > 0) return ensureUniqueCode(attempt + 1);
  return code;
}

export async function createCoupon(params: {
  walletId: number;
  discountPercent: number;
  source: CouponSource;
  rewardType: CouponRewardType;
  rewardLabel: string;
  expiryMonths?: number;
}): Promise<CouponRecord> {
  const code = await ensureUniqueCode();
  const expiryMonths = params.expiryMonths ?? 3;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  const client = sb();
  const { data } = await client
    .from("loyaltyCoupons")
    .insert({
      walletId: params.walletId,
      code,
      discountPercent: params.discountPercent,
      status: "active",
      expiresAt: expiresAt.toISOString(),
      source: params.source,
      rewardType: params.rewardType,
      rewardLabel: params.rewardLabel,
    })
    .select()
    .single();
  if (!data) throw new Error("Failed to create coupon");
  return data as CouponRecord;
}

export async function createDiscountCoupon(params: {
  walletId: number;
  discountPercent: number;
  source: CouponSource;
  label?: string;
}): Promise<CouponRecord> {
  const label = params.label ?? `${params.discountPercent}% OFF`;
  return createCoupon({
    walletId: params.walletId,
    discountPercent: params.discountPercent,
    source: params.source,
    rewardType: "discount",
    rewardLabel: label,
  });
}

export async function createFreeItemCoupon(params: {
  walletId: number;
  itemName: string;
  source: CouponSource;
}): Promise<CouponRecord> {
  return createCoupon({
    walletId: params.walletId,
    discountPercent: 0,
    source: params.source,
    rewardType: "freeItem",
    rewardLabel: params.itemName,
  });
}

export async function validateCoupon(code: string, customerPhone?: string): Promise<{
  valid: boolean;
  coupon?: CouponRecord;
  error?: string;
}> {
  // H9 fix: validateCoupon is now READ-ONLY. It does not mutate the row's status
  // (the previous code flipped status='expired' as a side effect, which made
  // retries and concurrent validations flaky). Expiry is reported as a valid
  // result with an `error` field; the caller decides whether to flip status.
  const client = sb();
  const { data } = await client
    .from("loyaltyCoupons")
    .select("*")
    .filter("code", "ilike", code.toUpperCase())
    .limit(1);
  if (!data || data.length === 0) return { valid: false, error: "Coupon not found" };
  const coupon = data[0] as CouponRecord;

  if (coupon.status === "used") return { valid: false, error: "Coupon already used" };
  if (coupon.status === "expired") return { valid: false, error: "Coupon expired" };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, error: "Coupon expired" };
  }
  if (customerPhone) {
    // H10 fix: phone ownership is enforced, but to avoid leaking existence we
    // do not distinguish "phone not found" from "phone doesn't own this coupon".
    const { data: wallet } = await client
      .from("loyaltyWallets")
      .select("id")
      .eq("customerPhone", customerPhone)
      .limit(1);
    if (!wallet || wallet.length === 0 || coupon.walletId !== wallet[0].id) {
      return { valid: false, error: "Coupon does not belong to this customer" };
    }
  }

  return { valid: true, coupon };
}

export async function applyCoupon(couponId: number, orderId: number): Promise<CouponRecord> {
  const client = sb();
  const { data } = await client
    .from("loyaltyCoupons")
    .update({ status: "used", redeemedAt: new Date().toISOString(), redeemedOrderId: orderId })
    .eq("id", couponId)
    .eq("status", "active")
    .select()
    .single();
  if (!data) throw new Error("Coupon not found or already used");
  return data as CouponRecord;
}

export async function expireCoupons(): Promise<number> {
  const client = sb();
  const { data } = await client
    .from("loyaltyCoupons")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expiresAt", new Date().toISOString())
    .select("id");
  return (data || []).length;
}

async function getWalletIdForPhone(phone: string): Promise<number | null> {
  const client = sb();
  const { data } = await client.from("loyaltyWallets").select("id").eq("customerPhone", phone).limit(1);
  return data && data.length > 0 ? (data[0].id as number) : null;
}

export async function getCustomerCoupons(phone: string): Promise<CouponRecord[]> {
  const walletId = await getWalletIdForPhone(phone);
  if (!walletId) return [];
  const client = sb();
  const { data } = await client
    .from("loyaltyCoupons")
    .select("*")
    .eq("walletId", walletId)
    .order("createdAt", { ascending: false });
  return (data || []) as CouponRecord[];
}

export async function getActiveCoupons(phone: string): Promise<CouponRecord[]> {
  const walletId = await getWalletIdForPhone(phone);
  if (!walletId) return [];
  const client = sb();
  const { data } = await client
    .from("loyaltyCoupons")
    .select("*")
    .eq("walletId", walletId)
    .eq("status", "active")
    .filter("expiresAt", "gt", new Date().toISOString())
    .order("createdAt", { ascending: false });
  return (data || []) as CouponRecord[];
}

export async function getAllCoupons(): Promise<(CouponRecord & { customerPhone: string; customerName: string | null })[]> {
  const client = sb();
  const { data: wallets } = await client.from("loyaltyWallets").select("id, customerPhone, customerName");
  const walletMap = new Map<number, { customerPhone: string; customerName: string | null }>(
    (wallets || []).map((w: any) => [w.id, { customerPhone: w.customerPhone, customerName: w.customerName }])
  );
  const { data } = await client.from("loyaltyCoupons").select("*").order("createdAt", { ascending: false });
  return ((data || []) as CouponRecord[]).map((c) => ({
    ...c,
    customerPhone: walletMap.get(c.walletId)?.customerPhone || "",
    customerName: walletMap.get(c.walletId)?.customerName ?? null,
  }));
}

export async function deactivateCoupon(couponId: number): Promise<void> {
  const client = sb();
  await client.from("loyaltyCoupons").update({ status: "expired" }).eq("id", couponId);
}

export async function forceExpireCoupon(couponId: number): Promise<void> {
  const client = sb();
  await client.from("loyaltyCoupons").update({ status: "expired" }).eq("id", couponId).eq("status", "active");
}