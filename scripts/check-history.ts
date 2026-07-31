import "dotenv/config";
import postgres from "postgres";

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const r = await client.unsafe(`SELECT DATE("settledAt" AT TIME ZONE 'Asia/Kolkata') as date, COUNT(*)::int as count, SUM("finalTotal"::numeric) as total FROM "orderHistories" GROUP BY 1 ORDER BY 1`);
  console.log("Settled bills by date:");
  for (const row of r) {
    console.log(`  ${row.date}: ${row.count} bills, ₹${row.total}`);
  }
  const total = await client.unsafe(`SELECT COUNT(*)::int as count FROM "orderHistories"`);
  console.log(`\nTotal orderHistory records: ${total[0].count}`);
  await client.end();
}
main().catch(console.error);
