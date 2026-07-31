import "dotenv/config";
import postgres from "postgres";

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const cols = await client.unsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'orderHistories' ORDER BY ordinal_position`);
  console.log("orderHistories columns:", cols.map((c: any) => c.column_name).join(", "));
  const slogs = await client.unsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = 'sessionEditLogs' ORDER BY ordinal_position`);
  console.log("sessionEditLogs columns:", slogs.map((c: any) => c.column_name).join(", "));
  await client.end();
}
main().catch(console.error);
