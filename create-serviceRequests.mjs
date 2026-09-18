import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    console.log("Creating serviceRequests table...");
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

-- Enable RLS on serviceRequests table
ALTER TABLE "serviceRequests" ENABLE ROW LEVEL SECURITY;

-- Allow inserts via anon/authed keys (customers calling waiter)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow insert for service requests' AND tablename = 'serviceRequests') THEN
        CREATE POLICY "Allow insert for service requests" ON "serviceRequests" FOR INSERT TO anon, authenticated WITH CHECK (true);
    END IF;
END $$;

-- Allow selects via service_role key (staff/admin dashboard)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role select' AND tablename = 'serviceRequests') THEN
        CREATE POLICY "Allow service role select" ON "serviceRequests" FOR SELECT TO service_role USING (true);
    END IF;
END $$;

-- Allow selects via anon/authed key (so clients can see their own requests if needed)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon select' AND tablename = 'serviceRequests') THEN
        CREATE POLICY "Allow anon select" ON "serviceRequests" FOR SELECT TO anon, authenticated USING (true);
    END IF;
END $$;
    `);
    console.log("serviceRequests table and policies created successfully.");
  } catch(e) {
    console.error("Error creating table:", e);
  } finally {
    process.exit(0);
  }
}
main();
