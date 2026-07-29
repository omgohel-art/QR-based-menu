-- ============================================================
-- 1. menuItems: add badge and foodType columns
-- ============================================================
ALTER TABLE "menuItems"
  ADD COLUMN IF NOT EXISTS "badge" text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "foodType" text DEFAULT 'veg';

-- ============================================================
-- 2. orderItems: add specialInstructions and delivered columns
-- ============================================================
ALTER TABLE "orderItems"
  ADD COLUMN IF NOT EXISTS "specialInstructions" text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "delivered" boolean DEFAULT false;

-- ============================================================
-- 3. orders: add orderStatus, orderNumber, paymentMethod, paymentStatus
-- ============================================================
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "orderStatus" text DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS "orderNumber" integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "paymentMethod" text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "paymentStatus" text DEFAULT 'pending';

-- Update existing status values to match new orderStatus
UPDATE "orders" SET "orderStatus" = 'received' WHERE "orderStatus" IS NULL OR "status" = 'pending';
UPDATE "orders" SET "orderStatus" = 'delivered' WHERE "status" = 'delivered';
UPDATE "orders" SET "orderStatus" = 'settled' WHERE "status" = 'settled';

-- ============================================================
-- 4. cafeSettings: add upiId column
-- ============================================================
ALTER TABLE "cafeSettings"
  ADD COLUMN IF NOT EXISTS "upiId" text DEFAULT NULL;

-- ============================================================
-- 5. businessSettings: ensure all columns exist
-- ============================================================
ALTER TABLE "businessSettings"
  ADD COLUMN IF NOT EXISTS "restaurantName" text DEFAULT 'Cafe',
  ADD COLUMN IF NOT EXISTS "legalBusinessName" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "gstNumber" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "fssaiNumber" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "phone" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "email" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "address" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "city" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "state" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pincode" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "logoUrl" text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "gstEnabled" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "gstRate" numeric DEFAULT 18,
  ADD COLUMN IF NOT EXISTS "invoicePrefix" text DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS "footerMessage" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "printerIp" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "printerPort" integer DEFAULT 9100,
  ADD COLUMN IF NOT EXISTS "upiId" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tagline" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "brandDescription" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "sinceYear" integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "averageRating" numeric DEFAULT NULL;

-- ============================================================
-- 6. Create feedback table
-- ============================================================
CREATE TABLE IF NOT EXISTS "feedback" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "sessionId" bigint NOT NULL,
  "tableLabel" text NOT NULL DEFAULT '',
  "rating" integer NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
  "comment" text DEFAULT NULL,
  "createdAt" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "feedback_sessionId_idx" ON "feedback" ("sessionId");

-- ============================================================
-- 7. Create missing tables
-- ============================================================

-- user_profiles: maps Supabase Auth users to restaurant roles
CREATE TABLE IF NOT EXISTS user_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id UUID NOT NULL,
  restaurant_id BIGINT,
  role TEXT NOT NULL DEFAULT 'staff',
  must_change_password BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id ON user_profiles(auth_user_id);

-- password_reset_otps: OTP codes for forgot-password flow
CREATE TABLE IF NOT EXISTS password_reset_otps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON password_reset_otps(email);

-- ============================================================
-- 8. Enable Realtime (required for WebSocket subscriptions)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "sessions";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "orders";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "orderItems";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "menuItems";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "feedback";
