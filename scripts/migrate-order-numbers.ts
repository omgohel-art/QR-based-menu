import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://wqwvmkxstkkyfuzgcikv.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ISbebqr7TgR0HH4K-ZhpYg_c4HiHtgW";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Check if orderNumber column exists
  const { data: test, error } = await supabase.from("orders").select("orderNumber").limit(1);
  if (!error && test !== null) {
    console.log("✓ orderNumber column already exists");
  } else {
    // Try to add column via raw SQL
    const sql = `ALTER TABLE orders ADD COLUMN IF NOT EXISTS "orderNumber" integer;`;
    const { error: rpcError } = await supabase.rpc("exec_sql", { query_text: sql });
    if (rpcError) {
      console.log("Could not add column via RPC. Please run this SQL manually in your Supabase SQL editor:");
      console.log(sql);
      console.log("");
      console.log("Also create this table:");
      console.log('CREATE TABLE IF NOT EXISTS "orderCounter" (');
      console.log('  id integer PRIMARY KEY DEFAULT 1,');
      console.log('  "nextNumber" integer NOT NULL DEFAULT 1');
      console.log(");");
      console.log('INSERT INTO "orderCounter" (id, "nextNumber") VALUES (1, 1) ON CONFLICT (id) DO NOTHING;');
      process.exit(1);
    }
    console.log("✓ Added orderNumber column");
  }

  // Check/create orderCounter table
  const { data: counter } = await supabase.from("orderCounter").select("*").single();
  if (counter) {
    console.log("✓ orderCounter table exists, nextNumber:", counter.nextNumber);
  } else {
    const { error: insertError } = await supabase.from("orderCounter").insert({ id: 1, nextNumber: 1 }).single();
    if (insertError) {
      console.log("Could not create orderCounter table. Please run this SQL manually:");
      console.log('CREATE TABLE IF NOT EXISTS "orderCounter" (');
      console.log('  id integer PRIMARY KEY DEFAULT 1,');
      console.log('  "nextNumber" integer NOT NULL DEFAULT 1');
      console.log(');');
      console.log('INSERT INTO "orderCounter" (id, "nextNumber") VALUES (1, 1) ON CONFLICT (id) DO NOTHING;');
      process.exit(1);
    }
    console.log("✓ Created orderCounter table");
  }

  // Backfill existing orders with order numbers
  const { data: ordersWithoutNumber } = await supabase
    .from("orders")
    .select("id")
    .is("orderNumber", null)
    .order("id", { ascending: true });

  if (ordersWithoutNumber && ordersWithoutNumber.length > 0) {
    console.log(`Backfilling ${ordersWithoutNumber.length} orders...`);
    for (let i = 0; i < ordersWithoutNumber.length; i++) {
      const order = ordersWithoutNumber[i];
      const orderNumber = i + 1;
      await supabase.from("orders").update({ orderNumber }).eq("id", order!.id);
    }
    console.log("✓ Backfilled existing orders");
  }

  console.log("Migration complete!");
}

run().catch(console.error);