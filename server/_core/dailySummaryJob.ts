/**
 * Daily summary scheduler.
 *
 * Runs every 5 minutes and checks if a daily summary needs to be sent based on
 * the owner's configured hour/minute in businessSettings.
 *
 * Each owner picks a single time of day (default 23:00 = 11 PM). The scheduler
 * sends the summary once per calendar day (IST), tracked in the dailySummaries table.
 */

import { getDb } from "../db";
import { businessSettings } from "../../drizzle/schema";
import { sendDailySummary, getIndianDateKey } from "./whatsappService";

const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — fine for daily schedule
let timer: NodeJS.Timeout | null = null;
let isRunning = false;
let lastCheckDate: string | null = null;
let lastCheckMinuteKey: string | null = null;
let lastCheckStatus: "sent" | "failed" | null = null;

export async function tickDailySummary(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const db = await getDb();
    if (!db) return;

    const [settings] = await db.select().from(businessSettings).limit(1);
    if (!settings) return;
    if (!settings.dailySummaryEnabled || !settings.whatsappEnabled) return;

    // IST "now"
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const todayKey = getIndianDateKey();
    const hour = settings.summaryHour ?? 23;
    const minute = settings.summaryMinute ?? 0;
    const minuteKey = `${todayKey}-${istNow.getUTCHours()}:${istNow.getUTCMinutes()}`;

    // De-dupe within the same minute window
    if (lastCheckDate === todayKey && lastCheckMinuteKey === minuteKey) return;

    // Only fire if current IST time is at or past the configured HH:MM
    const istHour = istNow.getUTCHours();
    const istMinute = istNow.getUTCMinutes();
    const currentMinutes = istHour * 60 + istMinute;
    const targetMinutes = hour * 60 + minute;

    if (currentMinutes < targetMinutes) {
      // Too early; just record we checked
      lastCheckDate = todayKey;
      return;
    }

    // Only fire once per day, BUT retry on failure (H36 fix). If the first
    // tick at the target minute fails, subsequent ticks within the same day
    // should retry, not silently skip.
    if (lastCheckDate === todayKey && lastCheckStatus === "sent") {
      lastCheckMinuteKey = minuteKey;
      return;
    }

    console.log(`[Daily Summary] Sending for ${todayKey} (scheduled at ${hour}:${String(minute).padStart(2, "0")} IST)`);
    const result = await sendDailySummary(todayKey);
    lastCheckStatus = result?.success ? "sent" : "failed";
    if (result) {
      console.log(`[Daily Summary] Result: ${result.success ? "sent" : "failed"} via ${result.channel}${result.error ? ` — ${result.error}` : ""}`);
    }
    lastCheckDate = todayKey;
    lastCheckMinuteKey = minuteKey;
  } catch (err) {
    console.error("[Daily Summary] Tick error:", (err as Error).message);
  } finally {
    isRunning = false;
  }
}

/**
 * Manual trigger endpoint: allows admin to send the summary immediately
 * (used by the "Send Test Summary" button in settings).
 */
export async function sendNow(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const result = await sendDailySummary();
    if (!result) {
      return { success: false, error: "Daily summary not enabled. Configure WhatsApp number and enable daily summary in business settings." };
    }
    return {
      success: result.success,
      message: result.success ? `Summary sent via ${result.channel}` : undefined,
      error: result.error,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export function startDailySummaryService(): void {
  if (timer) {
    console.log("[Daily Summary] Service already running");
    return;
  }
  console.log(`[Daily Summary] Starting service (every ${TICK_INTERVAL_MS / 1000}s)`);
  // Check once at boot, then every interval
  setTimeout(() => { void tickDailySummary(); }, 10 * 1000);
  timer = setInterval(() => { void tickDailySummary(); }, TICK_INTERVAL_MS);
}

export function stopDailySummaryService(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Daily Summary] Service stopped");
  }
}
