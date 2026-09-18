import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

console.log("URL:", url);
console.log("KEY exists:", !!key);

const sb = createClient(url, key);

async function test() {
  console.log("Testing Supabase insert...");
  const { data, error } = await sb.from("serviceRequests").insert({
    tableCode: "test-table",
    requestType: "water",
    requestLabel: "Water",
  }).select();
  
  if (error) {
    console.error("Supabase insert error:", JSON.stringify(error, null, 2));
  } else {
    console.log("Supabase insert success:", data);
  }
}

test();
