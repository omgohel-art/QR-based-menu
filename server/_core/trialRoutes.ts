import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

const TRIAL_DAYS = 14;

// Valid license keys (demo / dev). In production these would be validated
// against a signed key issued by the vendor. For the trial experience we
// accept any non-empty key of the form "MAMA-XXXX-XXXX-XXXX" and grant
// 1 year of license.
function isValidLicenseKey(key: string | undefined | null): boolean {
  if (!key) return false;
  return /^MAMA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

export interface TrialStatus {
  isInTrial: boolean;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  daysRemaining: number;
  hasLicense: boolean;
  licenseExpiresAt: string | null;
  isExpired: boolean;
  requiresUpgrade: boolean;
}

// Single-row business settings — fetch and ensure trial fields are populated.
export async function getTrialStatus(): Promise<TrialStatus> {
  const db = (await getDb()) as any;
  if (!db) {
    return {
      isInTrial: true,
      trialStartedAt: null,
      trialExpiresAt: null,
      daysRemaining: TRIAL_DAYS,
      hasLicense: false,
      licenseExpiresAt: null,
      isExpired: false,
      requiresUpgrade: false,
    };
  }
  const result: any = await db.execute(sql`
    SELECT "trialStartedAt", "trialExpiresAt", "licenseKey", "licenseExpiresAt"
    FROM "businessSettings"
    LIMIT 1
  `);
  const row = result?.rows?.[0];

  if (!row) {
    // No business settings row yet — return a fresh trial.
    return {
      isInTrial: true,
      trialStartedAt: null,
      trialExpiresAt: null,
      daysRemaining: TRIAL_DAYS,
      hasLicense: false,
      licenseExpiresAt: null,
      isExpired: false,
      requiresUpgrade: false,
    };
  }

  const trialStartedAt = row.trialStartedAt ? new Date(row.trialStartedAt) : null;
  const trialExpiresAt = row.trialExpiresAt ? new Date(row.trialExpiresAt) : null;
  const licenseExpiresAt = row.licenseExpiresAt ? new Date(row.licenseExpiresAt) : null;

  // If a license is set and valid + not expired, no trial needed.
  if (row.licenseKey && isValidLicenseKey(row.licenseKey) && licenseExpiresAt && licenseExpiresAt > new Date()) {
    return {
      isInTrial: false,
      trialStartedAt: trialStartedAt?.toISOString() ?? null,
      trialExpiresAt: trialExpiresAt?.toISOString() ?? null,
      daysRemaining: 0,
      hasLicense: true,
      licenseExpiresAt: licenseExpiresAt.toISOString(),
      isExpired: false,
      requiresUpgrade: false,
    };
  }

  // Backfill trial fields on first read.
  if (!trialStartedAt || !trialExpiresAt) {
    const now = new Date();
    const expires = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await db.execute(sql`
      UPDATE "businessSettings"
      SET "trialStartedAt" = ${now.toISOString()},
          "trialExpiresAt" = ${expires.toISOString()}
      WHERE "trialStartedAt" IS NULL OR "trialExpiresAt" IS NULL
    `);
    const daysRemaining = Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    return {
      isInTrial: true,
      trialStartedAt: now.toISOString(),
      trialExpiresAt: expires.toISOString(),
      daysRemaining,
      hasLicense: false,
      licenseExpiresAt: null,
      isExpired: false,
      requiresUpgrade: false,
    };
  }

  const now = new Date();
  const isExpired = trialExpiresAt <= now;
  const daysRemaining = isExpired
    ? 0
    : Math.ceil((trialExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  return {
    isInTrial: true,
    trialStartedAt: trialStartedAt.toISOString(),
    trialExpiresAt: trialExpiresAt.toISOString(),
    daysRemaining,
    hasLicense: false,
    licenseExpiresAt: null,
    isExpired,
    requiresUpgrade: isExpired,
  };
}

// Public endpoint for the marketing/admin header to display trial status.
router.get("/api/trial/status", async (_req: Request, res: Response) => {
  try {
    const status = await getTrialStatus();
    res.json(status);
  } catch (err: any) {
    console.error("[Trial] status error:", err);
    res.status(500).json({ error: "Failed to fetch trial status" });
  }
});

// Admin endpoint to apply a license key (gates premium features).
router.post("/api/trial/activate-license", async (req: Request, res: Response) => {
  try {
    const { licenseKey } = req.body;
    if (!isValidLicenseKey(licenseKey)) {
      return res.status(400).json({ error: "Invalid license key format. Expected: MAMA-XXXX-XXXX-XXXX" });
    }
    const db = (await getDb()) as any;
    if (!db) return res.status(503).json({ error: "Database unavailable" });
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    await db.execute(sql`
      UPDATE "businessSettings"
      SET "licenseKey" = ${licenseKey},
          "licenseExpiresAt" = ${expires.toISOString()}
      WHERE id = (SELECT id FROM "businessSettings" ORDER BY id ASC LIMIT 1)
    `);
    res.json({ success: true, licenseExpiresAt: expires.toISOString() });
  } catch (err: any) {
    console.error("[Trial] activate error:", err);
    res.status(500).json({ error: "Failed to activate license" });
  }
});

export { router as trialRouter };
