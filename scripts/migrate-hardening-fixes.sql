-- Migration: production hardening fixes for QA audit
-- Apply this against your Supabase / PostgreSQL database BEFORE deploying the
-- corresponding application changes.
--
-- This migration:
--   1) Adds razorpayOrderId / razorpayPaymentId columns to orders (C1 fix).
--   2) Adds a CHECK constraint preventing negative inventory stock (C5 fix).
--   3) Adds an idempotency-key column for loyalty awards (C2 fix).
--   4) Adds an atomic-increment SQL helper for loyalty wallet points (C3 fix).

-- 1. Razorpay columns + index on orders (idempotent).
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "razorpayOrderId" varchar(64),
  ADD COLUMN IF NOT EXISTS "razorpayPaymentId" varchar(64);

CREATE INDEX IF NOT EXISTS "orders_razorpayOrderId_idx" ON "orders" ("razorpayOrderId");
CREATE INDEX IF NOT EXISTS "orders_razorpayPaymentId_idx" ON "orders" ("razorpayPaymentId");

-- 2. Prevent negative stock at the DB layer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inv_currentStock_nonneg'
  ) THEN
    ALTER TABLE "inventoryItems"
      ADD CONSTRAINT "inv_currentStock_nonneg" CHECK ("currentStock" >= 0);
  END IF;
END$$;

-- 3. Loyalty earn-transaction uniqueness (C2 fix).
-- The application relies on a UNIQUE (orderId, type) constraint to guarantee
-- exactly-once earning. If the table already exists without it, add it now.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyaltyTxn_orderId_type_unique'
  ) THEN
    -- Only add if there are no existing duplicates that would block creation.
    IF NOT EXISTS (
      SELECT 1 FROM "loyaltyTransactions"
      GROUP BY "orderId", "type"
      HAVING COUNT(*) > 1
      LIMIT 1
    ) THEN
      ALTER TABLE "loyaltyTransactions"
        ADD CONSTRAINT "loyaltyTxn_orderId_type_unique" UNIQUE ("orderId", "type");
    END IF;
  END IF;
END$$;

-- 4. Atomic increment helper for loyalty wallet points (C3 fix).
-- The application calls rpc('increment_wallet_points', {p_wallet_id, p_points}).
CREATE OR REPLACE FUNCTION increment_wallet_points(p_wallet_id integer, p_points integer)
RETURNS TABLE("currentPoints" integer, "lifetimeEarned" integer)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "loyaltyWallets"
    SET "currentPoints" = "currentPoints" + p_points,
        "lifetimeEarned" = "lifetimeEarned" + p_points,
        "updatedAt" = NOW()
    WHERE "id" = p_wallet_id;
  RETURN QUERY
    SELECT "currentPoints", "lifetimeEarned" FROM "loyaltyWallets" WHERE "id" = p_wallet_id;
END$$;

-- 5. Per-day uniqueness for daily summaries (de-duplicates across multi-instance).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dailySummary_date_channel_unique'
  ) THEN
    ALTER TABLE "dailySummaries"
      ADD CONSTRAINT "dailySummary_date_channel_unique" UNIQUE ("summaryDate", "channel");
  END IF;
END$$;

-- 6. Atomic decrement for customerSpins.available (C6 fix).
-- Returns the post-decrement available count. Updates only when available >= p_amount.
CREATE OR REPLACE FUNCTION decrement_customer_spins(p_phone varchar, p_amount integer)
RETURNS TABLE("available" integer, "used" integer)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "customerSpins"
    SET "available" = "available" - p_amount,
        "used" = "used" + p_amount,
        "updatedAt" = NOW()
    WHERE "customerPhone" = p_phone AND "available" >= p_amount
    RETURNING "customerSpins"."available", "customerSpins"."used" INTO "available", "used";
  RETURN;
END$$;
