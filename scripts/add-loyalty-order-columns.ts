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
  await sql.unsafe(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "loyaltyPointsEarned" INTEGER DEFAULT 0`);
  await sql.unsafe(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "loyaltyAwardedAt" TIMESTAMPTZ`);
  await sql.unsafe(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "loyaltyReversed" BOOLEAN DEFAULT false`);
  console.log("Columns added to orders table");
  await sql.end();
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });
