import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    console.log("Tables in public schema:");
    console.log(tables.map(t => t.table_name).join(', '));
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
main();
