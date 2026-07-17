-- Add delivered column to orderItems for per-item delivery tracking
ALTER TABLE "orderItems" ADD COLUMN IF NOT EXISTS "delivered" BOOLEAN DEFAULT false;
