-- Run this in Supabase SQL Editor
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "paymentStatus" VARCHAR(50);

CREATE INDEX IF NOT EXISTS "paymentStatus_idx" ON orders("paymentStatus");
