-- ============================================================
-- COMPLETE SUPABASE SETUP
-- Paste this entire file into Supabase SQL Editor and run it.
-- ============================================================

-- ============================================================
-- 1. SCHEMA MIGRATIONS (new columns, tables)
-- ============================================================

-- menuItems: add badge and foodType columns
ALTER TABLE "menuItems"
  ADD COLUMN IF NOT EXISTS "badge" text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "foodType" text DEFAULT 'veg';

-- orderItems: add specialInstructions and delivered columns
ALTER TABLE "orderItems"
  ADD COLUMN IF NOT EXISTS "specialInstructions" text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "delivered" boolean DEFAULT false;

-- orders: add orderStatus, orderNumber, paymentMethod, paymentStatus
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "orderStatus" text DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS "orderNumber" integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "paymentMethod" text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "paymentStatus" text DEFAULT 'pending';

UPDATE "orders" SET "orderStatus" = 'received' WHERE "orderStatus" IS NULL OR "status" = 'pending';
UPDATE "orders" SET "orderStatus" = 'delivered' WHERE "status" = 'delivered';
UPDATE "orders" SET "orderStatus" = 'settled' WHERE "status" = 'settled';

-- businessSettings: add serviceChargePercentage and inactivityWindowMinutes
ALTER TABLE "businessSettings"
  ADD COLUMN IF NOT EXISTS "serviceChargePercentage" numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inactivityWindowMinutes" integer DEFAULT 75,
  ADD COLUMN IF NOT EXISTS "upiId" text DEFAULT '';

-- businessSettings: ensure all columns exist
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
  ADD COLUMN IF NOT EXISTS "tagline" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "brandDescription" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "sinceYear" integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "averageRating" numeric DEFAULT NULL;

-- feedback table (if not exists)
CREATE TABLE IF NOT EXISTS "feedback" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "sessionId" bigint NOT NULL UNIQUE,
  "tableLabel" text NOT NULL DEFAULT '',
  "rating" integer NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
  "comment" text DEFAULT NULL,
  "createdAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "feedback_sessionId_idx" ON "feedback" ("sessionId");

-- ============================================================
-- 2. MISSING TABLES
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
-- 3. ORDER NUMBER SEQUENCE (for atomic order numbering)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_number_sequence (
  id integer PRIMARY KEY DEFAULT 1,
  last_value integer NOT NULL DEFAULT 0
);
INSERT INTO order_number_sequence (id, last_value)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_next_order_number()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE next_num integer;
BEGIN
  UPDATE order_number_sequence SET last_value = last_value + 1 WHERE id = 1 RETURNING last_value INTO next_num;
  RETURN next_num;
END;
$$;

-- ============================================================
-- 3b. ATOMIC SESSION TOTAL FUNCTION (prevents race conditions)
-- ============================================================
CREATE OR REPLACE FUNCTION add_to_session_total(
  p_session_id integer,
  p_amount numeric,
  p_service_charge_pct numeric DEFAULT 0,
  p_gst_enabled boolean DEFAULT false,
  p_gst_rate numeric DEFAULT 0
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "sessions"
  SET
    "subtotal" = COALESCE("subtotal", 0) + p_amount,
    "serviceCharge" = (COALESCE("subtotal", 0) + p_amount) * (p_service_charge_pct / 100),
    "taxAmount" = CASE WHEN p_gst_enabled THEN ((COALESCE("subtotal", 0) + p_amount) * (p_service_charge_pct / 100 + 1) * (p_gst_rate / 100)) ELSE 0 END,
    "finalTotal" = CASE WHEN p_gst_enabled
      THEN (COALESCE("subtotal", 0) + p_amount) * (1 + p_service_charge_pct / 100) * (1 + p_gst_rate / 100)
      ELSE (COALESCE("subtotal", 0) + p_amount) * (1 + p_service_charge_pct / 100)
    END,
    "lastActivityAt" = now()
  WHERE "id" = p_session_id;
END;
$$;

-- ============================================================
-- 3c. UPDATED_AT TRIGGER (auto-updates timestamps)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl text;
  tables_with_updated_at text[] := ARRAY['users', 'tables', 'sessions', 'categories', 'menuItems', 'businessSettings', 'user_profiles', 'deviceRateLimits'];
BEGIN
  FOREACH tbl IN ARRAY tables_with_updated_at
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 4. ENABLE REALTIME (for WebSocket live updates)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "sessions";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "orders";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "orderItems";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "menuItems";
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS "feedback";

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE IF EXISTS "tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "orderItems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "menuItems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "businessSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "password_reset_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "order_number_sequence" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "menu_items_read_public" ON "menuItems";
DROP POLICY IF EXISTS "menu_items_write_admin" ON "menuItems";
DROP POLICY IF EXISTS "categories_read_public" ON "categories";
DROP POLICY IF EXISTS "categories_write_admin" ON "categories";
DROP POLICY IF EXISTS "tables_read_public" ON "tables";
DROP POLICY IF EXISTS "tables_write_admin" ON "tables";
DROP POLICY IF EXISTS "sessions_read_insert_public" ON "sessions";
DROP POLICY IF EXISTS "sessions_write_admin" ON "sessions";
DROP POLICY IF EXISTS "orders_read_insert_public" ON "orders";
DROP POLICY IF EXISTS "orders_write_admin" ON "orders";
DROP POLICY IF EXISTS "order_items_read_insert_public" ON "orderItems";
DROP POLICY IF EXISTS "order_items_write_admin" ON "orderItems";
DROP POLICY IF EXISTS "business_settings_read_public" ON "businessSettings";
DROP POLICY IF EXISTS "business_settings_write_admin" ON "businessSettings";
DROP POLICY IF EXISTS "feedback_insert_public" ON "feedback";
DROP POLICY IF EXISTS "feedback_read_admin" ON "feedback";
DROP POLICY IF EXISTS "user_profiles_read_own" ON "user_profiles";
DROP POLICY IF EXISTS "user_profiles_insert_admin" ON "user_profiles";
DROP POLICY IF EXISTS "user_profiles_update_admin" ON "user_profiles";
DROP POLICY IF EXISTS "otp_insert_public" ON "password_reset_otps";
DROP POLICY IF EXISTS "otp_select_public" ON "password_reset_otps";
DROP POLICY IF EXISTS "otp_update_public" ON "password_reset_otps";
DROP POLICY IF EXISTS "order_seq_read" ON "order_number_sequence";
DROP POLICY IF EXISTS "order_seq_write" ON "order_number_sequence";

-- Tables: anyone can read, only authenticated (admin) can write
CREATE POLICY "tables_read_public" ON "tables" FOR SELECT USING (true);
CREATE POLICY "tables_write_admin" ON "tables" FOR ALL USING (auth.role() = 'authenticated');

-- Sessions: anyone can create (QR scan), admins can update
CREATE POLICY "sessions_insert_public" ON "sessions" FOR INSERT WITH CHECK (true);
CREATE POLICY "sessions_read_admin" ON "sessions" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sessions_update_admin" ON "sessions" FOR UPDATE USING (auth.role() = 'authenticated');

-- Orders: anyone can create (customer ordering), admins can read/update
CREATE POLICY "orders_insert_public" ON "orders" FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_read_admin" ON "orders" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "orders_update_admin" ON "orders" FOR UPDATE USING (auth.role() = 'authenticated');

-- Order Items: anyone can create, admins can read/update
CREATE POLICY "order_items_insert_public" ON "orderItems" FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_read_admin" ON "orderItems" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "order_items_update_admin" ON "orderItems" FOR UPDATE USING (auth.role() = 'authenticated');

-- Menu Items: anyone can read (menu display), only admins can write
CREATE POLICY "menu_items_read_public" ON "menuItems" FOR SELECT USING (true);
CREATE POLICY "menu_items_write_admin" ON "menuItems" FOR ALL USING (auth.role() = 'authenticated');

-- Categories: anyone can read, only admins can write
CREATE POLICY "categories_read_public" ON "categories" FOR SELECT USING (true);
CREATE POLICY "categories_write_admin" ON "categories" FOR ALL USING (auth.role() = 'authenticated');

-- Business Settings: only authenticated users (admin/staff) can read (contains UPI ID, printer IP)
CREATE POLICY "business_settings_read_auth" ON "businessSettings" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "business_settings_write_admin" ON "businessSettings" FOR ALL USING (auth.role() = 'authenticated');

-- Feedback: anyone can insert (customers), only admins can read
CREATE POLICY "feedback_insert_public" ON "feedback" FOR INSERT WITH CHECK (true);
CREATE POLICY "feedback_read_admin" ON "feedback" FOR SELECT USING (auth.role() = 'authenticated');

-- User Profiles: users can read/update their own profile only
CREATE POLICY "user_profiles_read_own" ON "user_profiles" FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "user_profiles_insert_admin" ON "user_profiles" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "user_profiles_update_own" ON "user_profiles" FOR UPDATE USING (auth.uid() = auth_user_id);

-- Password Reset OTPs: public can insert (send-otp), can only read/update own by email
CREATE POLICY "otp_insert_public" ON "password_reset_otps" FOR INSERT WITH CHECK (true);
CREATE POLICY "otp_select_own" ON "password_reset_otps" FOR SELECT USING (email = current_setting('request.jwt.claims')::json->>'email');
CREATE POLICY "otp_update_own" ON "password_reset_otps" FOR UPDATE USING (email = current_setting('request.jwt.claims')::json->>'email' AND used = false);

-- Order number sequence: only authenticated can read/use
CREATE POLICY "order_seq_read" ON "order_number_sequence" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "order_seq_write" ON "order_number_sequence" FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================
-- 6. CREATE DEFAULT SETTINGS ROWS (if missing)
-- ============================================================
INSERT INTO "businessSettings" ("restaurantName", "legalBusinessName", "phone", "email", "address", "city", "state", "pincode", "serviceChargePercentage", "inactivityWindowMinutes")
SELECT 'My Cafe', 'My Cafe Pvt Ltd', '+91-', '', '', '', '', '', 0, 75
WHERE NOT EXISTS (SELECT 1 FROM "businessSettings");
