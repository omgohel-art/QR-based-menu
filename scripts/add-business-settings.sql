-- Business Settings table for restaurant/business info, invoices, and billing
CREATE TABLE IF NOT EXISTS "businessSettings" (
  id SERIAL PRIMARY KEY,
  "restaurantName" TEXT NOT NULL DEFAULT '',
  "legalBusinessName" TEXT NOT NULL DEFAULT '',
  "gstNumber" TEXT NOT NULL DEFAULT '',
  "fssaiNumber" TEXT DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT '',
  "pincode" TEXT NOT NULL DEFAULT '',
  "logoUrl" TEXT DEFAULT '',
  "gstEnabled" BOOLEAN DEFAULT false,
  "gstRate" DECIMAL(5,2) DEFAULT 0,
  "invoicePrefix" TEXT DEFAULT 'INV-',
  "footerMessage" TEXT DEFAULT '',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
