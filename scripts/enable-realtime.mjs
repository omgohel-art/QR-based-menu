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
    console.log("Checking and enabling publication for serviceRequests...");
    
    // Ensure serviceRequests table exists
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "serviceRequests" (
        id SERIAL PRIMARY KEY,
        "tableCode" VARCHAR(32) NOT NULL,
        "requestType" VARCHAR(32) NOT NULL,
        "requestLabel" VARCHAR(64) NOT NULL,
        "status" VARCHAR(32) DEFAULT 'pending' NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "serviceRequests_tableCode_idx" ON "serviceRequests"("tableCode");
      CREATE INDEX IF NOT EXISTS "serviceRequests_status_idx" ON "serviceRequests"("status");
      
      ALTER TABLE "serviceRequests" ENABLE ROW LEVEL SECURITY;
    `);

    // Policies
    await sql.unsafe(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow insert for service requests' AND tablename = 'serviceRequests') THEN
              CREATE POLICY "Allow insert for service requests" ON "serviceRequests" FOR INSERT TO anon, authenticated WITH CHECK (true);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role select' AND tablename = 'serviceRequests') THEN
              CREATE POLICY "Allow service role select" ON "serviceRequests" FOR SELECT TO service_role USING (true);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon select' AND tablename = 'serviceRequests') THEN
              CREATE POLICY "Allow anon select" ON "serviceRequests" FOR SELECT TO anon, authenticated USING (true);
          END IF;
      END $$;
    `);

    // Add to publication if publication exists
    await sql.unsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE "serviceRequests";
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- ignore if table is already in publication
        NULL;
      END $$;
    `);

    console.log("serviceRequests publication and RLS verified successfully!");
  } catch (err) {
    console.error("Error setting up serviceRequests:", err);
  } finally {
    await sql.end();
    process.exit(0);
  }
}

main();
