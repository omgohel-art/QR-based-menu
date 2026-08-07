import postgres from "postgres";

const env = process.env;

let _sql: ReturnType<typeof postgres> | null = null;
function sql() {
  if (!_sql) _sql = postgres(env.DATABASE_URL!, { ssl: { rejectUnauthorized: false } });
  return _sql;
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
  const existing = await sql()`SELECT id FROM "loyaltyCoupons" WHERE code = ${code}`;
  if (existing.length > 0) return ensureUniqueCode(attempt + 1);
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

  const rows = await sql()`
    INSERT INTO "loyaltyCoupons" ("walletId", "code", "discountPercent", "status", "expiresAt", "source", "rewardType", "rewardLabel")
    VALUES (${params.walletId}, ${code}, ${params.discountPercent}, 'active', ${expiresAt.toISOString()}, ${params.source}, ${params.rewardType}, ${params.rewardLabel})
    RETURNING *
  `;
  return rows[0] as CouponRecord;
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
  const rows = await sql()`SELECT * FROM "loyaltyCoupons" WHERE upper(code) = ${code.toUpperCase()}`;
  if (rows.length === 0) return { valid: false, error: "Coupon not found" };
  const coupon = rows[0] as CouponRecord;

  if (coupon.status === "used") return { valid: false, error: "Coupon already used" };
  if (coupon.status === "expired") return { valid: false, error: "Coupon expired" };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    await sql()`UPDATE "loyaltyCoupons" SET status = 'expired' WHERE id = ${coupon.id}`;
    return { valid: false, error: "Coupon expired" };
  }
  if (customerPhone) {
    const wallet = await sql()`SELECT id FROM "loyaltyWallets" WHERE "customerPhone" = ${customerPhone}`;
    if (wallet.length === 0 || coupon.walletId !== (wallet[0] as any).id) {
      return { valid: false, error: "Coupon does not belong to this customer" };
    }
  }

  return { valid: true, coupon };
}

export async function applyCoupon(couponId: number, orderId: number): Promise<CouponRecord> {
  const rows = await sql()`
    UPDATE "loyaltyCoupons"
    SET status = 'used', "redeemedAt" = NOW(), "redeemedOrderId" = ${orderId}
    WHERE id = ${couponId} AND status = 'active'
    RETURNING *
  `;
  if (rows.length === 0) throw new Error("Coupon not found or already used");
  return rows[0] as CouponRecord;
}

export async function expireCoupons(): Promise<number> {
  const rows = await sql()`
    UPDATE "loyaltyCoupons"
    SET status = 'expired'
    WHERE status = 'active' AND "expiresAt" < NOW()
    RETURNING id
  `;
  return rows.length;
}

export async function getCustomerCoupons(phone: string): Promise<CouponRecord[]> {
  const rows = await sql()`
    SELECT c.* FROM "loyaltyCoupons" c
    JOIN "loyaltyWallets" w ON c."walletId" = w.id
    WHERE w."customerPhone" = ${phone}
    ORDER BY c."createdAt" DESC
  `;
  return rows as CouponRecord[];
}

export async function getActiveCoupons(phone: string): Promise<CouponRecord[]> {
  const rows = await sql()`
    SELECT c.* FROM "loyaltyCoupons" c
    JOIN "loyaltyWallets" w ON c."walletId" = w.id
    WHERE w."customerPhone" = ${phone} AND c.status = 'active'
    AND (c."expiresAt" IS NULL OR c."expiresAt" > NOW())
    ORDER BY c."createdAt" DESC
  `;
  return rows as CouponRecord[];
}

export async function getAllCoupons(): Promise<(CouponRecord & { customerPhone: string; customerName: string | null })[]> {
  const rows = await sql()`
    SELECT c.*, w."customerPhone", w."customerName"
    FROM "loyaltyCoupons" c
    JOIN "loyaltyWallets" w ON c."walletId" = w.id
    ORDER BY c."createdAt" DESC
  `;
  return rows as any[];
}

export async function deactivateCoupon(couponId: number): Promise<void> {
  await sql()`UPDATE "loyaltyCoupons" SET status = 'expired' WHERE id = ${couponId}`;
}

export async function forceExpireCoupon(couponId: number): Promise<void> {
  await sql()`UPDATE "loyaltyCoupons" SET status = 'expired' WHERE id = ${couponId} AND status = 'active'`;
}
