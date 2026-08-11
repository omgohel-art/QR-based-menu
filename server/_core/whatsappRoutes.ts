/**
 * Admin routes for WhatsApp daily-summary settings.
 */

import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { businessSettings, dailySummaries } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { getUserIdFromToken } from "./authRoutes";
import { sendNow } from "./dailySummaryJob";
import { computeDailySummary, formatSummaryForWhatsApp } from "./whatsappService";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  try {
    const API_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role`,
      { headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` } }
    );
    const profiles = await r.json();
    if (!profiles?.[0] || profiles[0].role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return userId;
  } catch {
    res.status(500).json({ error: "Internal server error" });
    return null;
  }
}

/**
 * GET /api/whatsapp/settings
 * Returns current WhatsApp configuration.
 */
router.get("/api/whatsapp/settings", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ settings: null });

    const [settings] = await db.select().from(businessSettings).limit(1);
    if (!settings) return res.json({ settings: null });

    // Don't leak API key in plain GET; show masked version
    const maskedKey = settings.whatsappApiKey
      ? `${settings.whatsappApiKey.slice(0, 4)}…${settings.whatsappApiKey.slice(-4)}`
      : null;

    res.json({
      settings: {
        whatsappEnabled: settings.whatsappEnabled,
        whatsappNumber: settings.whatsappNumber,
        whatsappProvider: settings.whatsappProvider || "webhook",
        whatsappApiUrl: settings.whatsappApiUrl,
        whatsappApiKeyMasked: maskedKey,
        dailySummaryEnabled: settings.dailySummaryEnabled,
        summaryHour: settings.summaryHour,
        summaryMinute: settings.summaryMinute,
        lowStockAlertsEnabled: settings.lowStockAlertsEnabled,
      },
    });
  } catch (err) {
    console.error("[WhatsApp Settings GET] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/whatsapp/settings
 * Update WhatsApp configuration.
 */
router.put("/api/whatsapp/settings", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const {
      whatsappEnabled,
      whatsappNumber,
      whatsappProvider,
      whatsappApiUrl,
      whatsappApiKey,
      dailySummaryEnabled,
      summaryHour,
      summaryMinute,
      lowStockAlertsEnabled,
    } = req.body;

    const [existing] = await db.select().from(businessSettings).limit(1);
    if (!existing) {
      return res.status(404).json({ error: "Business settings not configured yet" });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (typeof whatsappEnabled === "boolean") updates.whatsappEnabled = whatsappEnabled;
    if (whatsappNumber !== undefined) updates.whatsappNumber = whatsappNumber?.toString().trim() || null;
    if (whatsappProvider !== undefined) updates.whatsappProvider = whatsappProvider;
    if (whatsappApiUrl !== undefined) updates.whatsappApiUrl = whatsappApiUrl?.toString().trim() || null;
    // Only update API key if a non-empty value is sent
    if (whatsappApiKey !== undefined && whatsappApiKey !== "" && whatsappApiKey !== null) {
      updates.whatsappApiKey = whatsappApiKey.toString();
    }
    if (typeof dailySummaryEnabled === "boolean") updates.dailySummaryEnabled = dailySummaryEnabled;
    if (typeof summaryHour === "number" && summaryHour >= 0 && summaryHour <= 23) updates.summaryHour = summaryHour;
    if (typeof summaryMinute === "number" && summaryMinute >= 0 && summaryMinute <= 59) updates.summaryMinute = summaryMinute;
    if (typeof lowStockAlertsEnabled === "boolean") updates.lowStockAlertsEnabled = lowStockAlertsEnabled;

    await db.update(businessSettings).set(updates).where(eq(businessSettings.id, existing.id));
    res.json({ success: true });
  } catch (err) {
    console.error("[WhatsApp Settings PUT] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/whatsapp/send-test
 * Sends a test summary immediately to the configured number (or to the provided
 * override number for one-off testing).
 */
router.post("/api/whatsapp/send-test", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { previewOnly, phoneOverride } = req.body || {};

    const summary = await computeDailySummary();
    const message = formatSummaryForWhatsApp(summary);

    if (previewOnly) {
      return res.json({ success: true, preview: message, summary });
    }

    const [settings] = await db.select().from(businessSettings).limit(1);
    if (!settings || (!settings.whatsappEnabled && !phoneOverride)) {
      return res.status(400).json({ error: "WhatsApp is not enabled. Configure your number first." });
    }

    const targetPhone = phoneOverride || settings.whatsappNumber;
    if (!targetPhone) {
      return res.status(400).json({ error: "No WhatsApp number configured" });
    }

    // Bypass the daily-send guard by calling the underlying send function directly
    const { sendWhatsAppMessage } = await import("./whatsappService");
    const result = await sendWhatsAppMessage({
      phone: targetPhone,
      message,
      provider: settings.whatsappProvider || "webhook",
      apiKey: settings.whatsappApiKey || undefined,
      apiUrl: settings.whatsappApiUrl || undefined,
    });

    res.json({ success: result.success, error: result.error, channel: result.channel });
  } catch (err) {
    console.error("[WhatsApp Send Test] Error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/whatsapp/summary-preview
 * Returns the summary payload + the formatted message without sending.
 */
router.get("/api/whatsapp/summary-preview", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const summary = await computeDailySummary();
    const message = formatSummaryForWhatsApp(summary);
    res.json({ summary, message });
  } catch (err) {
    console.error("[WhatsApp Preview] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/whatsapp/history
 * Returns recent summary send attempts (last 30 days).
 */
router.get("/api/whatsapp/history", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ items: [] });

    const items = await db
      .select()
      .from(dailySummaries)
      .orderBy(desc(dailySummaries.sentAt))
      .limit(30);

    res.json({ items });
  } catch (err) {
    console.error("[WhatsApp History] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
