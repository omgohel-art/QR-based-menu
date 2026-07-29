import postgres from "postgres";

const sql = postgres("postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres");

async function run() {
  try {
    await sql.unsafe('ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS currency varchar(10) DEFAULT \'INR\'');
    console.log("OK: currency");
    await sql.unsafe('ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS time_format varchar(10) DEFAULT \'12h\'');
    console.log("OK: time_format");
    await sql.unsafe('ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS date_format varchar(20) DEFAULT \'DD/MM/YYYY\'');
    console.log("OK: date_format");
    await sql.unsafe('ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS restaurant_status varchar(20) DEFAULT \'open\'');
    console.log("OK: restaurant_status");
    await sql.unsafe('ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS review_link text');
    console.log("OK: review_link");
    await sql.unsafe('ALTER TABLE "businessSettings" ADD COLUMN IF NOT EXISTS accent_color varchar(20) DEFAULT \'#C08A4D\'');
    console.log("OK: accent_color");
  } catch (err) {
    console.error("Error:", err.message);
  }
  await sql.end();
  console.log("Done");
}
run();
