import postgres from "postgres";
import { readFileSync } from "fs";

const envText = readFileSync(".env", "utf-8");
const env: Record<string, string> = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const sql = postgres(env.DATABASE_URL, { ssl: { rejectUnauthorized: false } });

async function main() {
  // 1. Add new columns to loyaltyCoupons
  await sql.unsafe(`
    ALTER TABLE "loyaltyCoupons" ADD COLUMN IF NOT EXISTS "source" VARCHAR(16) DEFAULT 'loyalty' CHECK ("source" IN ('loyalty', 'spin'));
  `);
  console.log("Added source column to loyaltyCoupons");

  await sql.unsafe(`
    ALTER TABLE "loyaltyCoupons" ADD COLUMN IF NOT EXISTS "rewardType" VARCHAR(16) DEFAULT 'discount' CHECK ("rewardType" IN ('discount', 'freeItem', 'none'));
  `);
  console.log("Added rewardType column to loyaltyCoupons");

  await sql.unsafe(`
    ALTER TABLE "loyaltyCoupons" ADD COLUMN IF NOT EXISTS "rewardLabel" VARCHAR(128);
  `);
  console.log("Added rewardLabel column to loyaltyCoupons");

  // 2. Add coupon discount columns to orders table
  await sql.unsafe(`
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "appliedCouponCode" VARCHAR(32);
  `);
  console.log("Added appliedCouponCode column to orders");

  await sql.unsafe(`
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "couponDiscount" DECIMAL(10,2) DEFAULT 0;
  `);
  console.log("Added couponDiscount column to orders");

  await sql.unsafe(`
    ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "finalTotalAfterDiscount" DECIMAL(10,2) DEFAULT 0;
  `);
  console.log("Added finalTotalAfterDiscount column to orders");

  // 3. Ensure unique index on coupon codes
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "loycoupon_code_unique" ON "loyaltyCoupons" ("code");
  `);
  console.log("Ensured unique index on coupon codes");

  // 4. Backfill existing coupons with source/rewardType/rewardLabel
  await sql.unsafe(`
    UPDATE "loyaltyCoupons"
    SET "source" = 'loyalty', "rewardType" = 'discount', "rewardLabel" = "discountPercent" || '% OFF'
    WHERE "source" IS NULL AND "rewardLabel" IS NULL;
  `);
  console.log("Backfilled existing coupons");

  console.log("Migration complete!");
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
