import postgres from 'postgres';

const DATABASE_URL = 'postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres';

async function run() {
  const sql = postgres(DATABASE_URL, { ssl: { rejectUnauthorized: false } });
  try {
    await sql`ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS "saveInvoiceCustomerInfo" boolean DEFAULT true NOT NULL`;
    console.log('Column "saveInvoiceCustomerInfo" added successfully');
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
}
run();
