import postgres from 'postgres';

const DATABASE_URL = 'postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres';

async function run() {
  const sql = postgres(DATABASE_URL, { ssl: { rejectUnauthorized: false } });
  try {
    // loyaltyWallets
    await sql`CREATE TABLE IF NOT EXISTS "loyaltyWallets" (
      "id" serial PRIMARY KEY,
      "customerPhone" varchar(20) NOT NULL UNIQUE,
      "customerName" varchar(128),
      "currentPoints" integer DEFAULT 0 NOT NULL,
      "lifetimeEarned" integer DEFAULT 0 NOT NULL,
      "lifetimeRedeemed" integer DEFAULT 0 NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS "loyaltyWallets_phone_idx" ON "loyaltyWallets" ("customerPhone")`;
    console.log('loyaltyWallets OK');

    // loyaltyTransactions
    await sql`CREATE TABLE IF NOT EXISTS "loyaltyTransactions" (
      "id" serial PRIMARY KEY,
      "walletId" integer NOT NULL REFERENCES "loyaltyWallets"("id") ON DELETE CASCADE,
      "type" varchar(16) NOT NULL,
      "points" integer NOT NULL,
      "orderId" integer,
      "orderAmount" decimal(10,2),
      "description" text,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS "loytxn_walletId_idx" ON "loyaltyTransactions" ("walletId")`;
    await sql`CREATE INDEX IF NOT EXISTS "loytxn_type_idx" ON "loyaltyTransactions" ("type")`;
    await sql`CREATE INDEX IF NOT EXISTS "loytxn_orderId_idx" ON "loyaltyTransactions" ("orderId")`;
    console.log('loyaltyTransactions OK');

    // loyaltyCoupons
    await sql`CREATE TABLE IF NOT EXISTS "loyaltyCoupons" (
      "id" serial PRIMARY KEY,
      "walletId" integer NOT NULL REFERENCES "loyaltyWallets"("id") ON DELETE CASCADE,
      "code" varchar(32) NOT NULL UNIQUE,
      "discountPercent" integer DEFAULT 5 NOT NULL,
      "status" varchar(16) DEFAULT 'active' NOT NULL,
      "redeemedAt" timestamp,
      "redeemedOrderId" integer,
      "expiresAt" timestamp,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS "loycoupon_walletId_idx" ON "loyaltyCoupons" ("walletId")`;
    await sql`CREATE INDEX IF NOT EXISTS "loycoupon_code_idx" ON "loyaltyCoupons" ("code")`;
    await sql`CREATE INDEX IF NOT EXISTS "loycoupon_status_idx" ON "loyaltyCoupons" ("status")`;
    console.log('loyaltyCoupons OK');

    // businessSettings loyalty columns
    await sql`ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "loyaltyEnabled" boolean DEFAULT true NOT NULL`;
    await sql`ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "loyaltyRewardPercent" integer DEFAULT 5 NOT NULL`;
    await sql`ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "loyaltyPointsThreshold" integer DEFAULT 100 NOT NULL`;
    console.log('businessSettings loyalty columns OK');

    console.log('\nAll loyalty tables created successfully!');
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
}
run();
