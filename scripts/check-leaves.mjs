import postgres from "postgres";

const sql = postgres("postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres");

const profiles = await sql`SELECT "auth_user_id", "name", "role" FROM "user_profiles"`;
console.log("Profiles:", JSON.stringify(profiles, null, 2));

await sql.end();
