import postgres from 'postgres';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres';

async function run() {
  console.log('[Migration] Connecting to database...');
  const sql = postgres(DATABASE_URL, { ssl: { rejectUnauthorized: false } });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS "staff_permissions" (
        "id" SERIAL PRIMARY KEY,
        "auth_user_id" VARCHAR(64) NOT NULL UNIQUE,
        "orders" BOOLEAN DEFAULT true NOT NULL,
        "tables" BOOLEAN DEFAULT true NOT NULL,
        "menu" BOOLEAN DEFAULT true NOT NULL,
        "analytics" BOOLEAN DEFAULT true NOT NULL,
        "inventory" BOOLEAN DEFAULT true NOT NULL,
        "customers" BOOLEAN DEFAULT true NOT NULL,
        "staff_management" BOOLEAN DEFAULT true NOT NULL,
        "bookings" BOOLEAN DEFAULT true NOT NULL,
        "reports" BOOLEAN DEFAULT true NOT NULL,
        "settings" BOOLEAN DEFAULT true NOT NULL,
        "external_orders" BOOLEAN DEFAULT true NOT NULL,
        "payments" BOOLEAN DEFAULT true NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    console.log('[Migration] "staff_permissions" table verified/created.');

    await sql`
      CREATE INDEX IF NOT EXISTS "staff_permissions_auth_user_id_idx"
      ON "staff_permissions" ("auth_user_id");
    `;
    console.log('[Migration] Index on "auth_user_id" verified/created.');

    // Also create audit_logs table if not exists for security audit
    await sql`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" SERIAL PRIMARY KEY,
        "action" VARCHAR(64) NOT NULL,
        "actor_id" VARCHAR(64) NOT NULL,
        "actor_email" VARCHAR(256),
        "target_id" VARCHAR(64),
        "target_email" VARCHAR(256),
        "details" JSONB,
        "ip" VARCHAR(64),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    console.log('[Migration] "audit_logs" table verified/created.');

  } catch (err: any) {
    console.error('[Migration] Error:', err.message);
  } finally {
    await sql.end();
  }
}

run();
