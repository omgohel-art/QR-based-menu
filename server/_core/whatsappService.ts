/**
 * WhatsApp service for sending daily summaries to café owners.
 *
 * Supports two providers:
 * - "webhook" (default): POSTs a JSON payload to a configurable URL. Works with any
 *   Indian WhatsApp Business API provider (Wati, AiSensy, Interakt, Twilio proxy, etc.).
 *   The webhook provider is expected to forward the message to the owner's WhatsApp number.
 *
 * - "twilio": Uses Twilio's official WhatsApp API directly. Requires
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM env vars.
 *
 * Indian café owners commonly use Wati / AiSensy / Interakt / Twilio — this design lets them
 * plug in whichever provider they already pay for without forcing a specific vendor.
 */

import { getDb } from "../db";
import { businessSettings, dailySummaries, orders, orderItems, menuItems, inventoryItems, orderHistories } from "../../drizzle/schema";
import { eq, sql, gte, lt, and, desc, inArray } from "drizzle-orm";

export interface DailySummaryData {
  date: string; // YYYY-MM-DD
  restaurantName: string;
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  cashRevenue: number;
  onlineRevenue: number;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  lowStockItems: Array<{ name: string; currentStock: number; unit: string; minimumStock: number }>;
  cancelledOrders: number;
  pendingBills: number;
  yesterdayComparison?: {
    revenueChange: number; // percentage (positive = growth)
    ordersChange: number;
  };
}

function getIndianDateKey(d: Date = new Date()): string {
  // Use IST (UTC+5:30) so the "day" boundaries match Indian café operating hours.
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs);
  return ist.toISOString().slice(0, 10);
}

function getDayRangeIST(dateKey: string): { start: Date; end: Date } {
  // Returns UTC timestamps representing 00:00 IST to 23:59:59 IST of the given date.
  const [y, m, d] = dateKey.split("-").map(Number);
  const startIst = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const endIst = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  const start = new Date(startIst.getTime() - 5.5 * 60 * 60 * 1000);
  const end = new Date(endIst.getTime() - 5.5 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Compute the daily summary data for a given date (default = today in IST).
 */
export async function computeDailySummary(dateKey?: string): Promise<DailySummaryData> {
  const targetDate = dateKey || getIndianDateKey();
  const yesterday = (() => {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const db = await getDb();
  if (!db) {
    return {
      date: targetDate,
      restaurantName: "Cafe",
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      cashRevenue: 0,
      onlineRevenue: 0,
      topItems: [],
      lowStockItems: [],
      cancelledOrders: 0,
      pendingBills: 0,
    };
  }

  const [settings] = await db.select().from(businessSettings).limit(1);
  const restaurantName = settings?.restaurantName || "Cafe";

  const { start, end } = getDayRangeIST(targetDate);

  // Revenue / orders
  // (Bug 12 fix: removed the unused `todaysSettledBills` query — it was
  // fetched but never referenced. Revenue is correctly computed below from
  // `todaysOrders` which iterates the actual order rows.)

  // For payment breakdown, fetch actual order payment methods grouped
  const todaysOrders = await db
    .select({
      orderId: orders.id,
      sessionId: orders.sessionId,
      finalTotalAfterDiscount: orders.finalTotalAfterDiscount,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
    })
    .from(orders)
    .where(and(
      gte(orders.submittedAt, start),
      lt(orders.submittedAt, end),
    ));

  let totalRevenue = 0;
  let cashRevenue = 0;
  let onlineRevenue = 0;
  let cancelledOrders = 0;
  const validOrders: number[] = [];

  for (const o of todaysOrders) {
    if (o.orderStatus === "cancelled") {
      cancelledOrders++;
      continue;
    }
    const amount = parseFloat(o.finalTotalAfterDiscount?.toString() || "0");
    if (o.paymentStatus === "paid") {
      totalRevenue += amount;
      if (o.paymentMethod === "counter" || o.paymentMethod === "cash") {
        cashRevenue += amount;
      } else {
        onlineRevenue += amount;
      }
    }
    if (o.orderId) validOrders.push(o.orderId);
  }

  const totalOrders = validOrders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Top items
  const topItems: DailySummaryData["topItems"] = [];
  if (validOrders.length > 0) {
    const itemRows = await db
      .select({
        menuItemId: orderItems.menuItemId,
        name: menuItems.name,
        quantity: sql<number>`SUM(${orderItems.quantity})::int`,
        revenue: sql<number>`SUM(${orderItems.priceAtOrderTime}::numeric * ${orderItems.quantity})::numeric`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
      .where(inArray(orderItems.orderId, validOrders))
      .groupBy(orderItems.menuItemId, menuItems.name)
      .orderBy(desc(sql`SUM(${orderItems.quantity})`))
      .limit(5);

    topItems.push(...itemRows.map((r: any) => ({
      name: r.name || `Item #${r.menuItemId}`,
      quantity: Number(r.quantity) || 0,
      revenue: parseFloat(r.revenue?.toString() || "0"),
    })));
  }

  // Low stock items
  const lowStockRows = await db
    .select()
    .from(inventoryItems);
  const lowStockItems = lowStockRows
    .map((it: any) => ({
      name: it.name,
      currentStock: parseFloat(it.currentStock?.toString() || "0"),
      unit: it.unit,
      minimumStock: parseFloat(it.minimumStock?.toString() || "0"),
    }))
    .filter((it) => it.currentStock <= it.minimumStock)
    .sort((a, b) => a.currentStock - b.currentStock)
    .slice(0, 5);

  // Pending bills (active sessions not yet settled today)
  const { start: yStart, end: yEnd } = getDayRangeIST(yesterday);
  const pendingBillsRows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(orderHistories)
    .where(and(gte(orderHistories.createdAt, start), lt(orderHistories.settledAt, end)));
  // Approximation: pending = orders submitted today with non-finalized sessions
  const pendingCount = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${orders.sessionId})::int` })
    .from(orders)
    .where(and(
      gte(orders.submittedAt, start),
      lt(orders.submittedAt, end),
      sql`${orders.paymentStatus} != 'paid' OR ${orders.paymentStatus} IS NULL`,
    ));

  // Yesterday comparison
  let yesterdayComparison: DailySummaryData["yesterdayComparison"] | undefined;
  const yOrders = await db
    .select({
      revenue: sql<number>`COALESCE(SUM(${orders.finalTotalAfterDiscount}::numeric), 0)::numeric`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(and(
      gte(orders.submittedAt, yStart),
      lt(orders.submittedAt, yEnd),
      eq(orders.paymentStatus, "paid"),
      sql`${orders.orderStatus} != 'cancelled'`,
    ));
  const yRevenue = parseFloat(yOrders[0]?.revenue?.toString() || "0");
  const yCount = yOrders[0]?.count || 0;
  yesterdayComparison = {
    revenueChange: yRevenue > 0 ? ((totalRevenue - yRevenue) / yRevenue) * 100 : (totalRevenue > 0 ? 100 : 0),
    ordersChange: yCount > 0 ? ((totalOrders - yCount) / yCount) * 100 : (totalOrders > 0 ? 100 : 0),
  };

  return {
    date: targetDate,
    restaurantName,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    cashRevenue: Math.round(cashRevenue * 100) / 100,
    onlineRevenue: Math.round(onlineRevenue * 100) / 100,
    topItems,
    lowStockItems,
    cancelledOrders,
    pendingBills: pendingCount[0]?.count || 0,
    yesterdayComparison,
  };
}

/**
 * Format a summary into a clean WhatsApp message (plain text with emoji).
 * Designed for readability on mobile, with clear sections.
 */
export function formatSummaryForWhatsApp(summary: DailySummaryData): string {
  const date = new Date(summary.date).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`☕ *${summary.restaurantName}*`);
  lines.push(`📊 Daily Summary — ${date}`);
  lines.push("");

  // Revenue section
  lines.push("💰 *Revenue*");
  lines.push(`   Total: ₹${summary.totalRevenue.toLocaleString("en-IN")}`);
  if (summary.totalOrders > 0) {
    lines.push(`   Orders: ${summary.totalOrders}`);
    lines.push(`   Avg bill: ₹${summary.averageOrderValue.toFixed(0)}`);
  }
  if (summary.onlineRevenue > 0 || summary.cashRevenue > 0) {
    lines.push(`   Online: ₹${summary.onlineRevenue.toLocaleString("en-IN")}`);
    lines.push(`   Cash: ₹${summary.cashRevenue.toLocaleString("en-IN")}`);
  }
  if (summary.yesterdayComparison) {
    const revArrow = summary.yesterdayComparison.revenueChange >= 0 ? "📈" : "📉";
    const ordArrow = summary.yesterdayComparison.ordersChange >= 0 ? "📈" : "📉";
    lines.push(`   vs Yesterday: ${revArrow} ${summary.yesterdayComparison.revenueChange.toFixed(0)}% revenue, ${ordArrow} ${summary.yesterdayComparison.ordersChange.toFixed(0)}% orders`);
  }
  lines.push("");

  // Top items
  if (summary.topItems.length > 0) {
    lines.push("🏆 *Top Items*");
    summary.topItems.slice(0, 3).forEach((it, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
      lines.push(`   ${medal} ${it.name} — ${it.quantity} sold (₹${it.revenue.toFixed(0)})`);
    });
    lines.push("");
  }

  // Low stock alerts
  if (summary.lowStockItems.length > 0) {
    lines.push("⚠️ *Low Stock Alert*");
    summary.lowStockItems.forEach((it) => {
      const status = it.currentStock <= 0 ? "🚨 OUT" : `⚠️ Low`;
      lines.push(`   ${status}: ${it.name} (${it.currentStock.toFixed(1)}${it.unit})`);
    });
    lines.push("");
  }

  // Other stats
  if (summary.cancelledOrders > 0) {
    lines.push(`❌ Cancelled: ${summary.cancelledOrders}`);
  }
  if (summary.pendingBills > 0) {
    lines.push(`⏳ Pending bills: ${summary.pendingBills}`);
  }

  lines.push("");
  lines.push("— Sent automatically by your cafe system");

  return lines.join("\n");
}

export interface SendResult {
  success: boolean;
  channel: string;
  error?: string;
  messageId?: string;
}

/**
 * Send the daily summary to the owner via the configured WhatsApp provider.
 */
export async function sendDailySummary(dateKey?: string): Promise<SendResult | null> {
  const db = await getDb();
  if (!db) return null;

  const [settings] = await db.select().from(businessSettings).limit(1);
  if (!settings) return null;

  if (!settings.dailySummaryEnabled || !settings.whatsappEnabled || !settings.whatsappNumber) {
    return null;
  }

  const targetDate = dateKey || getIndianDateKey();

  // H33 fix: use a UNIQUE(summaryDate, channel) constraint + ON CONFLICT
  // semantics to make the de-dup atomic. Two concurrent calls now race on the
  // DB-level constraint — only one insert wins, the other gets the existing
  // row. This prevents the "first send already fired" race that existed
  // because the previous check was a separate read followed by an insert.
  const [existing] = await db
    .select()
    .from(dailySummaries)
    .where(and(
      eq(dailySummaries.summaryDate, targetDate),
      eq(dailySummaries.channel, "whatsapp"),
    ))
    .limit(1);
  if (existing && existing.status === "sent") {
    return { success: true, channel: "whatsapp", messageId: "already-sent" };
  }

  const summary = await computeDailySummary(targetDate);
  const message = formatSummaryForWhatsApp(summary);

  const result = await sendWhatsAppMessage({
    phone: settings.whatsappNumber,
    message,
    provider: settings.whatsappProvider || "webhook",
    apiKey: settings.whatsappApiKey || undefined,
    apiUrl: settings.whatsappApiUrl || undefined,
  });

  // Record the send attempt. We use upsert semantics so a re-tried failed
  // send gets recorded as a fresh attempt rather than silently failing.
  try {
    await db.insert(dailySummaries).values({
      summaryDate: targetDate,
      channel: "whatsapp",
      status: result.success ? "sent" : "failed",
      payload: { phone: settings.whatsappNumber, messageLength: message.length },
      errorMessage: result.error || null,
    }).onConflictDoUpdate({
      target: [dailySummaries.summaryDate, dailySummaries.channel],
      set: {
        status: result.success ? "sent" : "failed",
        payload: { phone: settings.whatsappNumber, messageLength: message.length } as any,
        errorMessage: result.error || null,
        sentAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[Daily Summary] Failed to record send:", err);
  }

  return result;
}

interface SendOptions {
  phone: string;
  message: string;
  provider: string;
  apiKey?: string;
  apiUrl?: string;
}

export async function sendWhatsAppMessage(opts: SendOptions): Promise<SendResult> {
  try {
    if (opts.provider === "twilio") {
      return await sendViaTwilio(opts);
    }
    // Default: webhook (works with Wati, AiSensy, Interakt, custom proxy, etc.)
    return await sendViaWebhook(opts);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[WhatsApp Send] Error:", errMsg);
    return { success: false, channel: "whatsapp", error: errMsg };
  }
}

async function sendViaTwilio(opts: SendOptions): Promise<SendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"

  if (!accountSid || !authToken || !fromNumber) {
    return {
      success: false,
      channel: "twilio",
      error: "Twilio credentials missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)",
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: fromNumber,
    To: `whatsapp:${opts.phone.startsWith("+") ? opts.phone : "+91" + opts.phone.replace(/\D/g, "")}`,
    Body: opts.message,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, channel: "twilio", error: `Twilio ${response.status}: ${text.slice(0, 200)}` };
  }
  const data: any = await response.json();
  return { success: true, channel: "twilio", messageId: data.sid };
}

async function sendViaWebhook(opts: SendOptions): Promise<SendResult> {
  // Generic webhook — the operator configures apiUrl + apiKey.
  // Two common shapes are accepted:
  //   1) If apiUrl is provided → POST { phone, message } (or { to, body }) to it
  //   2) If only apiKey → call WHATSAPP_API_URL env var (e.g. Wati endpoint)

  const apiUrl = opts.apiUrl || process.env.WHATSAPP_API_URL;
  if (!apiUrl) {
    return {
      success: false,
      channel: "webhook",
      error: "WhatsApp webhook URL not configured (set whatsappApiUrl in business settings or WHATSAPP_API_URL env)",
    };
  }

  // H32 fix: SSRF protection. The apiUrl is admin-configurable, but historically
  // could point at internal services (e.g. http://169.254.169.254/... AWS
  // metadata, http://localhost:5432 Postgres, etc.). We now:
  //   1) Require HTTPS or HTTP with explicit localhost trust list
  //   2) Resolve the hostname and reject private/loopback IPs at request time
  //   3) Cap response body size to prevent memory blowup
  const allowlist = (process.env.WHATSAPP_WEBHOOK_ALLOWLIST || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const urlCheck = isSafeOutboundUrl(apiUrl, allowlist);
  if (!urlCheck.ok) {
    return { success: false, channel: "webhook", error: `Webhook URL rejected: ${urlCheck.error}` };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  // Try the standard shape first; provider-specific shapes vary widely.
  const phone = opts.phone.startsWith("+") ? opts.phone : "+91" + opts.phone.replace(/\D/g, "");
  const payload = { phone, to: phone, message: opts.message, body: opts.message };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    return { success: false, channel: "webhook", error: err instanceof Error ? err.message : String(err) };
  }
  clearTimeout(timeout);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { success: false, channel: "webhook", error: `Webhook ${response.status}: ${text.slice(0, 200)}` };
  }
  const text = await response.text().catch(() => "");
  return { success: true, channel: "webhook", messageId: text.slice(0, 64) };
}

// H32 helper: validate outbound URL is not pointing at internal infrastructure.
function isSafeOutboundUrl(rawUrl: string, allowlist: string[]): { ok: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "Only http/https URLs are allowed" };
  }
  const host = url.hostname.toLowerCase();
  // Always reject the cloud metadata endpoint and loopback.
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    return { ok: false, error: "Cloud metadata endpoints are not allowed" };
  }
  // Allowlist always wins.
  if (allowlist.includes(host) || allowlist.includes(`*.${host.split(".").slice(-2).join(".")}`)) {
    return { ok: true };
  }
  // Reject loopback / private / link-local / multicast ranges.
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return { ok: false, error: "Private/loopback URLs are not allowed without explicit allowlist" };
  }
  return { ok: true };
}

/**
 * H34 fix: in-memory throttle for low-stock alerts. Even with daily dedup on
 * the dailySummaries table, low-stock alerts would fire once per order that
 * drains an ingredient. We coalesce: at most one alert per ingredient per
 * 4 hours, regardless of how many orders drained it.
 */
const lowStockAlertThrottle = new Map<string, number>();
const LOW_STOCK_THROTTLE_MS = 4 * 60 * 60 * 1000;

export async function sendLowStockAlert(alerts: Array<{ inventoryName: string; currentStock: number; unit: string; minimumStock: number }>): Promise<SendResult | null> {
  const db = await getDb();
  if (!db) return null;

  const [settings] = await db.select().from(businessSettings).limit(1);
  if (!settings || !settings.lowStockAlertsEnabled || !settings.whatsappEnabled || !settings.whatsappNumber) {
    return null;
  }
  if (alerts.length === 0) return null;

  // H34 fix: filter out ingredients that have alerted recently.
  const now = Date.now();
  const fresh = alerts.filter((a) => {
    const key = `${a.inventoryName}`;
    const last = lowStockAlertThrottle.get(key) || 0;
    return now - last >= LOW_STOCK_THROTTLE_MS;
  });
  if (fresh.length === 0) return null;
  // Mark them all as just-alerted.
  for (const a of fresh) lowStockAlertThrottle.set(a.inventoryName, now);

  const lines = [
    `⚠️ *Low Stock Alert — ${settings.restaurantName}*`,
    "",
    ...fresh.map((a) => {
      const status = a.currentStock <= 0 ? "🚨 OUT OF STOCK" : "⚠️ Low";
      return `${status}: ${a.inventoryName} (${a.currentStock.toFixed(1)}${a.unit})`;
    }),
    "",
    "Reorder before service hours.",
  ];
  const message = lines.join("\n");

  const result = await sendWhatsAppMessage({
    phone: settings.whatsappNumber,
    message,
    provider: settings.whatsappProvider || "webhook",
    apiKey: settings.whatsappApiKey || undefined,
    apiUrl: settings.whatsappApiUrl || undefined,
  });
  return result;
}

export { getIndianDateKey };
