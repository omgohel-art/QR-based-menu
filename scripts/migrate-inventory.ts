import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function migrate() {
  console.log("Creating inventoryItems table...");
  await sql`
    CREATE TABLE IF NOT EXISTS "inventoryItems" (
      "id" serial PRIMARY KEY,
      "name" varchar(128) NOT NULL,
      "category" varchar(64) NOT NULL,
      "sku" varchar(64),
      "currentStock" decimal(12,3) DEFAULT '0' NOT NULL,
      "unit" varchar(16) NOT NULL,
      "minimumStock" decimal(12,3) DEFAULT '0' NOT NULL,
      "maximumStock" decimal(12,3) DEFAULT '0' NOT NULL,
      "purchasePrice" decimal(10,2) DEFAULT '0' NOT NULL,
      "supplier" varchar(128),
      "lastRestockedAt" timestamp,
      "expiryDate" timestamp,
      "notes" text,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    );
  `;
  console.log("✓ inventoryItems table created");

  console.log("Creating inventoryHistory table...");
  await sql`
    CREATE TABLE IF NOT EXISTS "inventoryHistory" (
      "id" serial PRIMARY KEY,
      "itemId" integer NOT NULL REFERENCES "inventoryItems"("id") ON DELETE CASCADE,
      "itemName" varchar(128) NOT NULL,
      "quantityChanged" decimal(12,3) NOT NULL,
      "beforeQuantity" decimal(12,3) NOT NULL,
      "afterQuantity" decimal(12,3) NOT NULL,
      "action" varchar(16) NOT NULL,
      "reason" varchar(32) NOT NULL,
      "userId" varchar(64),
      "userName" varchar(128),
      "createdAt" timestamp DEFAULT now() NOT NULL
    );
  `;
  console.log("✓ inventoryHistory table created");

  console.log("Creating indexes...");
  await sql`CREATE INDEX IF NOT EXISTS "inv_category_idx" ON "inventoryItems" ("category")`;
  await sql`CREATE INDEX IF NOT EXISTS "inv_name_idx" ON "inventoryItems" ("name")`;
  await sql`CREATE INDEX IF NOT EXISTS "inv_supplier_idx" ON "inventoryItems" ("supplier")`;
  await sql`CREATE INDEX IF NOT EXISTS "invhist_itemId_idx" ON "inventoryHistory" ("itemId")`;
  await sql`CREATE INDEX IF NOT EXISTS "invhist_action_idx" ON "inventoryHistory" ("action")`;
  await sql`CREATE INDEX IF NOT EXISTS "invhist_createdAt_idx" ON "inventoryHistory" ("createdAt")`;
  console.log("✓ Indexes created");

  console.log("Adding CHECK constraints...");
  await sql`ALTER TABLE "inventoryItems" ADD CONSTRAINT "inv_category_check" CHECK ("category" IN ('Coffee Beans', 'Tea', 'Milk & Dairy', 'Bread & Bakery', 'Vegetables', 'Fruits', 'Sauces', 'Syrups', 'Spices', 'Beverages', 'Packaging', 'Cleaning Supplies', 'Other'))`;
  await sql`ALTER TABLE "inventoryItems" ADD CONSTRAINT "inv_unit_check" CHECK ("unit" IN ('kg', 'g', 'L', 'ml', 'pcs', 'bottles', 'packets', 'boxes'))`;
  await sql`ALTER TABLE "inventoryHistory" ADD CONSTRAINT "invhist_action_check" CHECK ("action" IN ('add', 'remove'))`;
  await sql`ALTER TABLE "inventoryHistory" ADD CONSTRAINT "invhist_reason_check" CHECK ("reason" IN ('Purchase', 'Waste', 'Damage', 'Expired', 'Correction', 'Other'))`;
  console.log("✓ CHECK constraints added");

  console.log("\nMigration complete!");
  await sql.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
