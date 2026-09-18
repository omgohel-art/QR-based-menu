import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const sql = postgres(dbUrl);

async function main() {
  try {
    console.log("Adding UPDATE policy on serviceRequests...");
    await sql.unsafe(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow update for service requests' AND tablename = 'serviceRequests') THEN
              CREATE POLICY "Allow update for service requests" ON "serviceRequests" FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
          END IF;
      END $$;
    `);
    console.log("UPDATE policy added successfully!");
  } catch (err) {
    console.error("Error setting up UPDATE policy:", err);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

main();
