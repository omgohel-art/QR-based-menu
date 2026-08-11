-- Recipe mappings: links menu items to inventory items for automatic stock deduction.
-- Example: 1 Cappuccino = 30g Coffee Beans + 200ml Milk
-- When an order is placed, quantities in this table are auto-deducted from inventoryItems.currentStock.

CREATE TABLE IF NOT EXISTS "recipes" (
  "id" serial PRIMARY KEY,
  "menuItemId" integer NOT NULL REFERENCES "menuItems"("id") ON DELETE CASCADE,
  "inventoryItemId" integer NOT NULL REFERENCES "inventoryItems"("id") ON DELETE CASCADE,
  "quantityRequired" decimal(12,4) NOT NULL CHECK ("quantityRequired" > 0),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("menuItemId", "inventoryItemId")
);

CREATE INDEX IF NOT EXISTS "recipe_menuItemId_idx" ON "recipes" ("menuItemId");
CREATE INDEX IF NOT EXISTS "recipe_inventoryItemId_idx" ON "recipes" ("inventoryItemId");

-- Allow 'Sale' as a valid reason for inventory history (auto-deduction from orders)
ALTER TABLE "inventoryHistory" DROP CONSTRAINT IF EXISTS "invhist_reason_check";
ALTER TABLE "inventoryHistory" ADD CONSTRAINT "invhist_reason_check"
  CHECK ("reason" IN ('Purchase', 'Waste', 'Damage', 'Expired', 'Correction', 'Sale', 'Other'));

-- Add HSN code column to menuItems (for GST invoice compliance)
ALTER TABLE "menuItems" ADD COLUMN IF NOT EXISTS "hsnCode" varchar(8);

-- Add HSN/SAC and tax-related fields to businessSettings
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "invoiceCounter" integer DEFAULT 0;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "stateCode" varchar(2);
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "panNumber" varchar(10);
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "sacCode" varchar(8);
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "cgstRate" integer DEFAULT 9;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "sgstRate" integer DEFAULT 9;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "igstRate" integer DEFAULT 18;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "placeOfSupply" varchar(128);
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "isInterState" boolean DEFAULT false;

-- WhatsApp daily summary settings
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "whatsappNumber" varchar(20);
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "whatsappEnabled" boolean DEFAULT false;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "dailySummaryEnabled" boolean DEFAULT false;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "summaryHour" integer DEFAULT 23;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "summaryMinute" integer DEFAULT 0;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "whatsappProvider" varchar(20) DEFAULT 'webhook';
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "whatsappApiKey" text;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "whatsappApiUrl" text;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "lowStockAlertsEnabled" boolean DEFAULT true;

-- Daily summary tracking table (so we don't double-send)
CREATE TABLE IF NOT EXISTS "dailySummaries" (
  "id" serial PRIMARY KEY,
  "summaryDate" varchar(10) NOT NULL,
  "sentAt" timestamp DEFAULT now() NOT NULL,
  "channel" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'sent' NOT NULL,
  "payload" json,
  "errorMessage" text,
  UNIQUE ("summaryDate", "channel")
);

CREATE INDEX IF NOT EXISTS "dailySummaries_summaryDate_idx" ON "dailySummaries" ("summaryDate");
