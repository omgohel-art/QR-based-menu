-- Add brand intro fields to businessSettings
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "tagline" TEXT DEFAULT '';
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "brandDescription" TEXT DEFAULT '';
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "sinceYear" INTEGER DEFAULT NULL;
ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "averageRating" NUMERIC(2,1) DEFAULT NULL;
