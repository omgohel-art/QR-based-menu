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
  // 1. spinRewards
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "spinRewards" (
      id SERIAL PRIMARY KEY,
      label VARCHAR(64) NOT NULL,
      "rewardType" VARCHAR(32) NOT NULL DEFAULT 'points',
      "rewardValue" INTEGER NOT NULL DEFAULT 0,
      color VARCHAR(16) NOT NULL DEFAULT '#C08A4D',
      probability NUMERIC(5,2) NOT NULL DEFAULT 10.00,
      enabled BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  console.log("spinRewards created");

  // 2. spinMilestones
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "spinMilestones" (
      id SERIAL PRIMARY KEY,
      "walletId" INTEGER NOT NULL REFERENCES "loyaltyWallets"(id) ON DELETE CASCADE,
      "milestonePoints" INTEGER NOT NULL,
      "spinsAwarded" INTEGER NOT NULL,
      "claimedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      UNIQUE("walletId", "milestonePoints")
    );
  `);
  console.log("spinMilestones created");

  // 3. customerSpins
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "customerSpins" (
      id SERIAL PRIMARY KEY,
      "walletId" INTEGER NOT NULL REFERENCES "loyaltyWallets"(id) ON DELETE CASCADE,
      "customerPhone" VARCHAR(20) NOT NULL,
      available INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "custspin_phone_idx" ON "customerSpins"("customerPhone")`);
  console.log("customerSpins created");

  // 4. spinHistory
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "spinHistory" (
      id SERIAL PRIMARY KEY,
      "walletId" INTEGER NOT NULL REFERENCES "loyaltyWallets"(id) ON DELETE CASCADE,
      "customerPhone" VARCHAR(20) NOT NULL,
      "rewardId" INTEGER,
      "rewardLabel" VARCHAR(64),
      "rewardType" VARCHAR(32),
      "rewardValue" INTEGER DEFAULT 0,
      "rewardColor" VARCHAR(16) DEFAULT '#C08A4D',
      "spunAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  console.log("spinHistory created");

  // 5. Seed rewards
  const existing = await sql`SELECT count(*) as cnt FROM "spinRewards"`;
  if (parseInt(existing[0].cnt) === 0) {
    await sql`
      INSERT INTO "spinRewards" (label, "rewardType", "rewardValue", color, probability, enabled) VALUES
        ('5 Points', 'points', 5, '#22c55e', 25, true),
        ('10 Points', 'points', 10, '#3b82f6', 20, true),
        ('15 Points', 'points', 15, '#8b5cf6', 15, true),
        ('20 Points', 'points', 20, '#f59e0b', 12, true),
        ('5% OFF', 'coupon', 5, '#ec4899', 10, true),
        ('10% OFF', 'coupon', 10, '#ef4444', 8, true),
        ('Free Item', 'freeItem', 0, '#06b6d4', 5, true),
        ('Try Again', 'none', 0, '#9ca3af', 5, true);
    `;
    console.log("Seeded 8 default wheel rewards!");
  }

  const final = await sql`SELECT count(*) as cnt FROM "spinRewards"`;
  console.log("Total rewards:", final[0].cnt);

  await sql.end();
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
