import postgres from "postgres";
import { readFileSync } from "fs";

const envText = readFileSync(".env", "utf-8");
const env: Record<string, string> = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const sql = postgres(env.DATABASE_URL, { ssl: { rejectUnauthorized: false } });

function generatePin(): string {
  // Generate a 4-digit PIN that excludes 0000 and avoids sequential/repeated patterns
  let tries = 0;
  while (tries < 50) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    if (pin === "1234" || pin === "0000" || pin === "1111" || pin === "2222" || pin === "3333" || pin === "4444" || pin === "5555" || pin === "6666" || pin === "7777" || pin === "8888" || pin === "9999" || pin[0] === pin[1] && pin[2] === pin[3]) {
      tries++;
      continue;
    }
    return pin;
  }
  return String(1000 + Math.floor(Math.random() * 9000));
}

async function main() {
  // 1. Add pin column
  await sql.unsafe(`
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pin VARCHAR(4);
  `);
  console.log("Added pin column to user_profiles");

  // 2. Assign unique PINs to all existing staff WITHOUT a pin
  const profiles = await sql.unsafe(
    `SELECT id, name FROM user_profiles WHERE pin IS NULL`
  ) as Array<{ id: number; name: string | null }>;
  console.log(`Found ${profiles.length} staff without PINs`);

  const usedPins = new Set<string>();
  const existing = await sql.unsafe(`SELECT pin FROM user_profiles WHERE pin IS NOT NULL`) as Array<{ pin: string }>;
  for (const row of existing) usedPins.add(row.pin);

  for (const profile of profiles) {
    let pin: string;
    let attempts = 0;
    do {
      pin = generatePin();
      attempts++;
    } while (usedPins.has(pin) && attempts < 100);
    usedPins.add(pin);
    await sql.unsafe(`UPDATE user_profiles SET pin = $1 WHERE id = $2`, [pin, profile.id]);
    console.log(`  Assigned PIN ${pin} to profile ${profile.id} (${profile.name})`);
  }

  console.log("Migration complete!");
}

main().catch((err) => { console.error("Failed:", err); process.exit(1); });