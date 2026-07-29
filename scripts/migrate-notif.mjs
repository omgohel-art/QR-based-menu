import postgres from "postgres";

const sql = postgres("postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres");

await sql`ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "notif_enabled" boolean DEFAULT true`;
console.log("Migration applied: notif_enabled column added to businessSettings");

await sql.end();
