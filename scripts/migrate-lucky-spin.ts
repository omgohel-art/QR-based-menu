/**
 * Migration: Create lucky spin tables
 * Run: npx tsx scripts/migrate-lucky-spin.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
if (!url || !key) { console.error("Missing env vars"); process.exit(1); }
const sb = createClient(url, key);

async function run() {
  console.log("Creating lucky spin tables...");

  // 1. spinRewards — configurable wheel rewards
  const { error: e1 } = await sb.rpc("exec_sql", {
    query: `
      CREATE TABLE IF NOT EXISTS "spinRewards" (
        id SERIAL PRIMARY KEY,
        label VARCHAR(64) NOT NULL,
        "rewardType" VARCHAR(32) NOT NULL DEFAULT 'points',
        "rewardValue" INTEGER NOT NULL DEFAULT 0,
        color VARCHAR(16) NOT NULL DEFAULT '#C08A4D',
        probability NUMERIC(5,2) NOT NULL DEFAULT 10.00,
        enabled BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
    `
  }).single();
  // Fallback: direct SQL via Supabase REST
  if (e1) {
    console.log("Using REST fallback for table creation...");
    const SQL_URL = `${url}/rest/v1/rpc/exec_sql`;
    await fetch(SQL_URL, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `
        CREATE TABLE IF NOT EXISTS "spinRewards" (
          id SERIAL PRIMARY KEY,
          label VARCHAR(64) NOT NULL,
          "rewardType" VARCHAR(32) NOT NULL DEFAULT 'points',
          "rewardValue" INTEGER NOT NULL DEFAULT 0,
          color VARCHAR(16) NOT NULL DEFAULT '#C08A4D',
          probability NUMERIC(5,2) NOT NULL DEFAULT 10.00,
          enabled BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
      ` })
    });
  }

  // 2. spinMilestones — claimed milestones per wallet
  const q2 = `
    CREATE TABLE IF NOT EXISTS "spinMilestones" (
      id SERIAL PRIMARY KEY,
      "walletId" INTEGER NOT NULL REFERENCES "loyaltyWallets"(id) ON DELETE CASCADE,
      "milestonePoints" INTEGER NOT NULL,
      "spinsAwarded" INTEGER NOT NULL,
      "claimedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      UNIQUE("walletId", "milestonePoints")
    );
  `;
  await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q2 })
  });

  // 3. customerSpins — available + used spins per customer
  const q3 = `
    CREATE TABLE IF NOT EXISTS "customerSpins" (
      id SERIAL PRIMARY KEY,
      "walletId" INTEGER NOT NULL REFERENCES "loyaltyWallets"(id) ON DELETE CASCADE,
      "customerPhone" VARCHAR(20) NOT NULL,
      available INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "custspin_phone_idx" ON "customerSpins"("customerPhone");
  `;
  await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q3 })
  });

  // 4. spinHistory — log every spin usage
  const q4 = `
    CREATE TABLE IF NOT EXISTS "spinHistory" (
      id SERIAL PRIMARY KEY,
      "walletId" INTEGER NOT NULL REFERENCES "loyaltyWallets"(id) ON DELETE CASCADE,
      "customerPhone" VARCHAR(20) NOT NULL,
      "rewardId" INTEGER,
      "rewardLabel" VARCHAR(64),
      "rewardType" VARCHAR(32),
      "rewardValue" INTEGER DEFAULT 0,
      "rewardColor" VARCHAR(16) DEFAULT '#C08A4D',
      "spunAt" TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `;
  await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q4 })
  });

  // 5. Seed default wheel rewards if empty
  const { data: existing } = await sb.from("spinRewards").select("id").limit(1);
  if (!existing || existing.length === 0) {
    console.log("Seeding default wheel rewards...");
    await sb.from("spinRewards").insert([
      { label: "5 Points", rewardType: "points", rewardValue: 5, color: "#22c55e", probability: 25, enabled: true },
      { label: "10 Points", rewardType: "points", rewardValue: 10, color: "#3b82f6", probability: 20, enabled: true },
      { label: "15 Points", rewardType: "points", rewardValue: 15, color: "#8b5cf6", probability: 15, enabled: true },
      { label: "20 Points", rewardType: "points", rewardValue: 20, color: "#f59e0b", probability: 12, enabled: true },
      { label: "5% OFF", rewardType: "coupon", rewardValue: 5, color: "#ec4899", probability: 10, enabled: true },
      { label: "10% OFF", rewardType: "coupon", rewardValue: 10, color: "#ef4444", probability: 8, enabled: true },
      { label: "Free Item", rewardType: "freeItem", rewardValue: 0, color: "#06b6d4", probability: 5, enabled: true },
      { label: "Try Again", rewardType: "none", rewardValue: 0, color: "#9ca3af", probability: 5, enabled: true },
    ]);
  }

  console.log("Lucky spin migration complete!");
}

run().catch((err) => { console.error("Migration failed:", err); process.exit(1); });
