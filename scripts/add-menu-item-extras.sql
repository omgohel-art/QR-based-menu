-- Add tags and badge columns to menuItems for smart search and premium badges
ALTER TABLE "menuItems" ADD COLUMN IF NOT EXISTS "tags" TEXT DEFAULT '';
ALTER TABLE "menuItems" ADD COLUMN IF NOT EXISTS "badge" TEXT DEFAULT '';
