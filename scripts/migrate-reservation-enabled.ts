import postgres from "postgres";
import { readFileSync } from "fs";

const envText = readFileSync(".env", "utf-8");
const env: Record<string, string> = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const sql = postgres(env.DATABASE_URL, { ssl: { rejectUnauthorized: false } });

async function run() {
  console.log("Adding reservationEnabled column to businessSettings...");

  // Check if column already exists
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'businessSettings' AND column_name = 'reservationEnabled'
  `;
  if (cols.length > 0) {
    console.log("Column 'reservationEnabled' already exists. Skipping.");
  } else {
    await sql`ALTER TABLE "businessSettings" ADD COLUMN "reservationEnabled" boolean DEFAULT false NOT NULL`;
    console.log("Added reservationEnabled column (default: false).");
  }

  // Also create the reservations table if it doesn't exist
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'reservations'
  `;
  if (tables.length > 0) {
    console.log("Table 'reservations' already exists. Skipping.");
  } else {
    await sql`
      CREATE TABLE "reservations" (
        "id" SERIAL PRIMARY KEY,
        "customerName" VARCHAR(128) NOT NULL,
        "customerPhone" VARCHAR(20) NOT NULL,
        "date" VARCHAR(10) NOT NULL,
        "time" VARCHAR(10) NOT NULL,
        "pax" INTEGER NOT NULL,
        "status" VARCHAR(20) DEFAULT 'pending' NOT NULL,
        "notes" TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW() NOT NULL,
        CONSTRAINT reservations_status_check CHECK ("status" IN ('pending', 'confirmed', 'cancelled', 'completed'))
      )
    `;
    await sql`CREATE INDEX "reservations_date_idx" ON "reservations" ("date")`;
    await sql`CREATE INDEX "reservations_status_idx" ON "reservations" ("status")`;
    console.log("Created reservations table with indexes.");
  }

  console.log("Migration complete.");
  await sql.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});