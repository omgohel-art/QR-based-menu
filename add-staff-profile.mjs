import postgres from "postgres";

const sql = postgres("postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres");

async function run() {
  try {
    const cols = [
      ['employee_id', 'varchar(32)'],
      ['department', 'varchar(64)'],
      ['branch', 'varchar(128)'],
      ['shift', 'varchar(32)'],
      ['shift_timing', 'varchar(64)'],
      ['reporting_manager', 'varchar(128)'],
      ['employment_status', "varchar(20) DEFAULT 'active'"],
      ['emergency_contact_name', 'varchar(128)'],
      ['emergency_contact_phone', 'varchar(32)'],
      ['emergency_contact_relationship', 'varchar(64)'],
      ['notif_order', 'boolean DEFAULT true'],
      ['notif_system', 'boolean DEFAULT true'],
      ['notif_email', 'boolean DEFAULT true'],
      ['attendance_clock_in', 'timestamp'],
      ['attendance_clock_out', 'timestamp'],
      ['attendance_date', 'date'],
    ];

    for (const [name, type] of cols) {
      await sql.unsafe(`ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "${name}" ${type}`);
      console.log(`OK: ${name}`);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
  await sql.end();
  console.log("Done");
}
run();
