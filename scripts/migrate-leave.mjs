import postgres from "postgres";

const sql = postgres("postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres");

await sql`CREATE TABLE IF NOT EXISTS "leaveRequests" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(64) NOT NULL,
  "leave_type" varchar(20) NOT NULL,
  "date" varchar(10) NOT NULL,
  "reason" text,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "reviewed_by" varchar(64),
  "reviewed_at" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
)`;

await sql`CREATE INDEX IF NOT EXISTS "lr_userId_idx" ON "leaveRequests" ("user_id")`;
await sql`CREATE INDEX IF NOT EXISTS "lr_date_idx" ON "leaveRequests" ("date")`;
await sql`CREATE INDEX IF NOT EXISTS "lr_status_idx" ON "leaveRequests" ("status")`;

console.log("Migration applied: leaveRequests table created");
await sql.end();
