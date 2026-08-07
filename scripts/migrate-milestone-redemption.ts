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
  // 1. Create milestoneRedemptions table
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "milestoneRedemptions" (
      id SERIAL PRIMARY KEY,
      "walletId" INTEGER NOT NULL REFERENCES "loyaltyWallets"(id) ON DELETE CASCADE,
      "customerPhone" VARCHAR(20) NOT NULL,
      "milestonePoints" INTEGER NOT NULL,
      "rewardType" VARCHAR(16) NOT NULL CHECK ("rewardType" IN ('spins', 'coupon')),
      "pointsDeducted" INTEGER NOT NULL,
      "spinsAwarded" INTEGER DEFAULT 0,
      "couponId" INTEGER REFERENCES "loyaltyCoupons"(id) ON DELETE SET NULL,
      "redeemedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      UNIQUE("walletId", "milestonePoints")
    );
  `);
  console.log("milestoneRedemptions table created");

  // 2. Add milestone config fields to businessSettings
  // We'll store them as JSON in a new column or use existing fields
  // For simplicity, we'll add a new JSON column for milestone config
  await sql.unsafe(`
    ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "milestoneConfig" JSONB DEFAULT '[
      {"points": 50, "spins": 1, "couponPercent": 5, "enabled": true},
      {"points": 100, "spins": 3, "couponPercent": 10, "enabled": true},
      {"points": 150, "spins": 5, "couponPercent": 15, "enabled": true}
    ]'::jsonb;
  `);
  console.log("milestoneConfig column added to businessSettings");

  // 3. Remove auto-spin milestones (drop the spinMilestones table if it exists)
  // Actually, let's keep it for backwards compatibility but stop using it
  // We'll just stop inserting new records

  // 4. Remove auto-coupon generation by setting a flag
  // We'll use the milestoneConfig to control this behavior

  console.log("Migration complete!");
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
