import postgres from "postgres";

const sql = postgres("postgresql://postgres:aarumumma1328@db.wqwvmkxstkkyfuzgcikv.supabase.co:5432/postgres");

const orders = await sql`SELECT id, "sessionId", "submittedAt", "orderStatus" FROM "orders" ORDER BY id DESC LIMIT 10`;
console.log("Recent orders:", JSON.stringify(orders, null, 2));

const orderItems = await sql`SELECT id, "orderId", "menuItemId", quantity FROM "orderItems" LIMIT 10`;
console.log("Order items:", JSON.stringify(orderItems, null, 2));

await sql.end();
