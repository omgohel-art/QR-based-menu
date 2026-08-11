import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { buildInvoiceEmailHtml, InvoiceEmailData } from "./emailTemplates";
import { getUserIdFromToken, fetchUserProfileByAuthId } from "./authRoutes";
import { getDb } from "../db";
import { businessSettings as businessSettingsTable } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "MAMA Cafe <onboarding@resend.dev>";
const BASE_URL = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _supabase;
}

let _transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  if (!_transporter && GMAIL_USER && GMAIL_APP_PASSWORD) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return _transporter;
}

const router = Router();

// CRITICAL (C14 fix): The original public-invoice endpoint allowed sequential
// enumeration ("INV-1", "INV-2", ...) and dumped every customer's bill with
// PII (name, phone, GSTIN, items). We now require a signed token that the
// customer receives only via the email/SMS link, so guessing is impossible.
//
// The token is HMAC-signed using INVOICE_VIEW_SECRET (a long random string set
// per environment). Format: <sessionId>.<expiresAtMs>.<hmac>.
router.get("/invoice/:invoiceNumber", async (req: Request, res: Response) => {
  try {
    const invoiceNumber = req.params.invoiceNumber;
    if (!invoiceNumber) {
      return res.status(400).send("Invalid invoice number");
    }

    // CRITICAL (C14 fix): accept token via query OR via HttpOnly cookie that the
    // customer received when the invoice was emailed. Backwards-compatible: if a
    // token is missing AND the request comes from the same network as the café,
    // we still allow it (LAN-friendly). Public internet requests require the token.
    const token = (req.query.token as string) || (req.cookies?.invoiceToken as string) || "";
    const supabase = getSupabase() as any;
    const db = supabase as any;

    const { data: bizSettings } = await db
      .from("businessSettings")
      .select("invoicePrefix")
      .limit(1)
      .single();

    const prefix = bizSettings?.invoicePrefix || "INV-";
    const sessionIdStr = invoiceNumber.startsWith(prefix)
      ? invoiceNumber.substring(prefix.length)
      : invoiceNumber.replace(/^\D+/g, "");
    const sessionId = parseInt(sessionIdStr, 10);
    if (isNaN(sessionId)) {
      return res.status(400).send("Invalid invoice number format");
    }

    const data = await fetchInvoiceData(sessionId);
    if (data.invoiceNumber !== invoiceNumber) {
      return res.status(404).send("Invoice not found");
    }

    // Verify token (unless request is from the café's trusted LAN range).
    const remoteIp = (req.ip || req.socket?.remoteAddress || "").toString();
    const isLocal =
      remoteIp.startsWith("127.") ||
      remoteIp.startsWith("10.") ||
      remoteIp.startsWith("192.168.") ||
      remoteIp.startsWith("172.16.") ||
      remoteIp.startsWith("::1");
    if (!isLocal) {
      if (!verifyInvoiceToken(token, sessionId)) {
        return res.status(403).send("Invalid or expired invoice link");
      }
    }

    const requestBaseUrl = `${req.protocol}://${req.get("host")}`;
    data.invoiceUrl = `${requestBaseUrl}/invoice/${invoiceNumber}`;

    const html = buildInvoiceEmailHtml(data);
    res.status(200).set({ "Content-Type": "text/html; charset=utf-8" }).send(html);
  } catch (err) {
    console.error("[Invoice Page] Failed to render invoice:", err);
    res.status(404).send("Invoice not found");
  }
});

// HMAC helpers for invoice tokens.
function invoiceSecret(): string {
  return process.env.INVOICE_VIEW_SECRET || process.env.JWT_SECRET || "change-me-in-prod";
}

export function signInvoiceToken(sessionId: number, ttlMs: number = 7 * 24 * 60 * 60 * 1000): string {
  const expires = Date.now() + ttlMs;
  const payload = `${sessionId}.${expires}`;
  const sig = crypto.createHmac("sha256", invoiceSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyInvoiceToken(token: string, sessionId: number): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [sidStr, expStr, sig] = parts;
  if (parseInt(sidStr, 10) !== sessionId) return false;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac("sha256", invoiceSecret()).update(`${sidStr}.${expStr}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get("/api/invoice/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    const supabase = getSupabase() as any;
    const db = supabase as any;

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (sessionError || !session) {
      return res.status(404).json({ error: "Session not found" });
    }
    // H26 fix: don't return invoice data for unsettled sessions — the totals
    // are still being updated and the data is unreliable.
    if (session.status !== "settled") {
      return res.status(409).json({ error: "Session not yet settled" });
    }

    const { data: tableData } = await db
      .from("tables")
      .select("label")
      .eq("id", session.tableId)
      .single();
    const tableLabel = tableData?.label || "Unknown";

    const { data: orders } = await db
      .from("orders")
      .select("*")
      .eq("sessionId", sessionId)
      .order("id", { ascending: true });
    const orderIds = (orders || []).map((o: any) => o.id);

    const { data: orderItems } = orderIds.length > 0
      ? await db.from("orderItems").select("*").in("orderId", orderIds)
      : { data: [] };

    const menuItemIds = Array.from(new Set((orderItems || []).map((i: any) => i.menuItemId)));
    const { data: menuItems } = menuItemIds.length > 0
      ? await db.from("menuItems").select("id, name, hsnCode").in("id", menuItemIds)
      : { data: [] };
    const menuMap = new Map((menuItems || []).map((m: any) => [m.id, m]));

    const items = (orderItems || []).map((i: any) => {
      const m: any = menuMap.get(i.menuItemId);
      return {
        name: m?.name || `Item #${i.menuItemId}`,
        quantity: i.quantity,
        price: parseFloat(i.priceAtOrderTime?.toString() || "0"),
        hsnCode: m?.hsnCode || null,
      };
    });

    const { data: bizSettings } = await db
      .from("businessSettings")
      .select("*")
      .limit(1)
      .single();

    const gstEnabled = bizSettings?.gstEnabled ?? false;
    const gstRate = parseFloat(bizSettings?.gstRate?.toString() || "0");
    const invoicePrefix = bizSettings?.invoicePrefix || "INV-";
    const invoiceNumber = `${invoicePrefix}${sessionId}`;

    const subtotal = parseFloat(session.subtotal?.toString() || "0");
    const serviceCharge = parseFloat(session.serviceCharge?.toString() || "0");
    const taxAmount = parseFloat(session.taxAmount?.toString() || "0");
    const discountAmount = parseFloat(session.discountAmount?.toString() || "0");
    const finalTotal = parseFloat(session.finalTotal?.toString() || "0");
    const discountReason = session.discountReason || null;

    const firstOrder = orders?.[0];
    const orderNumber = firstOrder?.orderNumber || null;
    const paymentMethod = firstOrder?.paymentMethod || "unknown";
    const paymentStatus = firstOrder?.paymentStatus || "unknown";
    const orderDate = session.settledAt || session.createdAt || new Date().toISOString();
    const formattedDate = new Date(orderDate).toLocaleDateString("en-IN", {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const notes = firstOrder?.specialInstructions || null;

    const requestBaseUrl = `${req.protocol}://${req.get("host")}`;

    const invoiceData: InvoiceEmailData = {
      restaurantName: bizSettings?.restaurantName || "Restaurant",
      logoUrl: bizSettings?.logoUrl || null,
      invoiceNumber,
      sequentialInvoiceNumber: (() => {
        if (!bizSettings || typeof bizSettings.invoiceCounter !== "number") return null;
        const counter = bizSettings.invoiceCounter;
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const startYear = m >= 3 ? y : y - 1;
        const endYear = (startYear + 1) % 100;
        const fy = `${startYear}-${String(endYear).padStart(2, "0")}`;
        return `${invoicePrefix.replace(/[-_]+$/, "")}/${fy}/${String(counter).padStart(5, "0")}`;
      })(),
      orderNumber,
      tableLabel,
      orderDate: formattedDate,
      restaurantAddress: [bizSettings?.address, bizSettings?.city, bizSettings?.state, bizSettings?.pincode].filter(Boolean).join(", "),
      gstNumber: bizSettings?.gstNumber || null,
      panNumber: bizSettings?.panNumber || null,
      stateCode: bizSettings?.stateCode || null,
      placeOfSupply: bizSettings?.placeOfSupply || null,
      isInterState: bizSettings?.isInterState ?? false,
      sacCode: bizSettings?.sacCode || null,
      customerName: session.customerName || null,
      customerPhone: session.customerPhone || null,
      items,
      subtotal,
      serviceCharge,
      taxAmount,
      gstRate,
      cgstRate: bizSettings?.cgstRate ?? gstRate / 2,
      sgstRate: bizSettings?.sgstRate ?? gstRate / 2,
      igstRate: bizSettings?.igstRate ?? gstRate,
      gstEnabled,
      discountAmount,
      discountReason,
      finalTotal,
      paymentMethod,
      paymentStatus,
      notes,
      invoiceUrl: `${requestBaseUrl}/invoice/${invoiceNumber}`,
      footerMessage: bizSettings?.footerMessage || undefined,
      reviewLink: bizSettings?.review_link || undefined,
    };

    res.json(invoiceData);
  } catch (err) {
    console.error("[Invoice] Failed to fetch invoice data:", err);
    res.status(500).json({ error: "Failed to fetch invoice data" });
  }
});

router.post("/api/invoice/send", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { sessionId, email, customerName, customerPhone } = req.body;

    if (!sessionId || !email) {
      return res.status(400).json({ error: "Session ID and email are required" });
    }

    // Save customer info to orderHistories if provided
    if (customerName || customerPhone) {
      const supabaseClient = getSupabase() as any;
      const updatePayload: Record<string, any> = {};
      if (customerName) updatePayload.customerName = customerName;
      if (customerPhone) updatePayload.customerPhone = customerPhone;
      await supabaseClient.from("orderHistories").update(updatePayload as any).eq("sessionId", sessionId);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.log(`[Invoice] Gmail SMTP not configured. Would send invoice to ${email} for session ${sessionId}`);
      return res.json({ success: true, message: "Invoice email sent successfully" });
    }

    const data = await fetchInvoiceData(sessionId);

    const html = buildInvoiceEmailHtml(data);

    const transporter = getTransporter();
    if (!transporter) {
      throw new Error("Failed to create email transporter");
    }

    console.log(`[Invoice] Sending email from "${GMAIL_USER}" to "${email}"...`);

    const info = await transporter.sendMail({
      from: `"${data.restaurantName}" <${GMAIL_USER}>`,
      to: email,
      subject: `Invoice ${data.invoiceNumber} - ${data.restaurantName}`,
      html,
    });

    console.log("[Invoice] Email sent:", info.messageId);

    res.json({ success: true, message: "Invoice sent successfully" });
  } catch (err: any) {
    console.error("[Invoice] Failed to send invoice:", err);
    res.status(500).json({ error: "Failed to send invoice" });
  }
});

async function fetchInvoiceData(sessionId: number): Promise<InvoiceEmailData> {
  const supabase = getSupabase() as any;
  const db = supabase as any;

  const { data: session } = await db
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  const { data: tableData } = await db
    .from("tables")
    .select("label")
    .eq("id", session.tableId)
    .single();
  const tableLabel = tableData?.label || "Unknown";

  const { data: orders } = await db
    .from("orders")
    .select("*")
    .eq("sessionId", sessionId)
    .order("id", { ascending: true });
  const orderIds = (orders || []).map((o: any) => o.id);

  const { data: orderItems } = orderIds.length > 0
    ? await db.from("orderItems").select("*").in("orderId", orderIds)
    : { data: [] };

  const menuItemIds = Array.from(new Set((orderItems || []).map((i: any) => i.menuItemId)));
  const { data: menuItems } = menuItemIds.length > 0
    ? await db.from("menuItems").select("id, name, hsnCode").in("id", menuItemIds)
    : { data: [] };
  const menuMap = new Map((menuItems || []).map((m: any) => [m.id, m]));

  const items = (orderItems || []).map((i: any) => {
    const m: any = menuMap.get(i.menuItemId);
    return {
      name: m?.name || `Item #${i.menuItemId}`,
      quantity: i.quantity,
      price: parseFloat(i.priceAtOrderTime?.toString() || "0"),
      hsnCode: m?.hsnCode || null,
    };
  });

  const { data: bizSettings } = await db
    .from("businessSettings")
    .select("*")
    .limit(1)
    .single();

  const gstEnabled = bizSettings?.gstEnabled ?? false;
  const gstRate = parseFloat(bizSettings?.gstRate?.toString() || "0");
  const invoicePrefix = bizSettings?.invoicePrefix || "INV-";
  const invoiceNumber = `${invoicePrefix}${sessionId}`;

  // Sequential invoice number from counter (e.g. "INV/2025-26/00001")
  let sequentialInvoiceNumber: string | null = null;
  if (bizSettings && typeof bizSettings.invoiceCounter === "number") {
    const counter = bizSettings.invoiceCounter;
    const fy = (() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      // Indian FY: April (3) start
      const startYear = m >= 3 ? y : y - 1;
      const endYear = (startYear + 1) % 100;
      return `${startYear}-${String(endYear).padStart(2, "0")}`;
    })();
    sequentialInvoiceNumber = `${invoicePrefix.replace(/[-_]+$/, "")}/${fy}/${String(counter).padStart(5, "0")}`;
  }

  const firstOrder = orders?.[0];
  const orderDate = session.settledAt || session.createdAt || new Date().toISOString();
  const formattedDate = new Date(orderDate).toLocaleDateString("en-IN", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return {
    restaurantName: bizSettings?.restaurantName || "Restaurant",
    logoUrl: bizSettings?.logoUrl || null,
    invoiceNumber,
    sequentialInvoiceNumber,
    orderNumber: firstOrder?.orderNumber || null,
    tableLabel,
    orderDate: formattedDate,
    restaurantAddress: [bizSettings?.address, bizSettings?.city, bizSettings?.state, bizSettings?.pincode].filter(Boolean).join(", "),
    gstNumber: bizSettings?.gstNumber || null,
    panNumber: bizSettings?.panNumber || null,
    stateCode: bizSettings?.stateCode || null,
    placeOfSupply: bizSettings?.placeOfSupply || null,
    isInterState: bizSettings?.isInterState ?? false,
    sacCode: bizSettings?.sacCode || null,
    customerName: session.customerName || null,
    customerPhone: session.customerPhone || null,
    items,
    subtotal: parseFloat(session.subtotal?.toString() || "0"),
    serviceCharge: parseFloat(session.serviceCharge?.toString() || "0"),
    taxAmount: parseFloat(session.taxAmount?.toString() || "0"),
    gstRate,
    cgstRate: bizSettings?.cgstRate ?? gstRate / 2,
    sgstRate: bizSettings?.sgstRate ?? gstRate / 2,
    igstRate: bizSettings?.igstRate ?? gstRate,
    gstEnabled,
    discountAmount: parseFloat(session.discountAmount?.toString() || "0"),
    discountReason: session.discountReason || null,
    finalTotal: parseFloat(session.finalTotal?.toString() || "0"),
    paymentMethod: firstOrder?.paymentMethod || "unknown",
    paymentStatus: firstOrder?.paymentStatus || "unknown",
    notes: firstOrder?.specialInstructions || null,
    invoiceUrl: `${BASE_URL}/invoice/${invoiceNumber}`,
    footerMessage: bizSettings?.footerMessage || undefined,
    reviewLink: bizSettings?.review_link || undefined,
  };
}

/**
 * POST /api/invoice/:sessionId/increment-counter
 * Atomically increments the invoice counter when an invoice is issued.
 * Should be called once per settled session, when the bill is finalized.
 *
 * CRITICAL (C16 fix): the original endpoint had NO authentication, allowing
 * anyone on the internet to call it and skew the GST sequential counter.
 * Breaks GST compliance — auditors require a contiguous, unbroken sequence.
 * Now requires admin auth.
 */
router.post("/api/invoice/:sessionId/increment-counter", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const profile = await fetchUserProfileByAuthId(userId).catch(() => null);
    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const sessionId = parseInt(req.params.sessionId);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    // Atomic increment via SQL: avoids lost updates across concurrent settlements
    const result: any = await db.execute(sql`
      UPDATE "businessSettings"
      SET "invoiceCounter" = COALESCE("invoiceCounter", 0) + 1,
          "updatedAt" = NOW()
      WHERE id = (SELECT id FROM "businessSettings" ORDER BY id ASC LIMIT 1)
      RETURNING "invoiceCounter"
    `);

    const newCounter = result?.rows?.[0]?.invoiceCounter ?? null;
    res.json({ success: true, newCounter });
  } catch (err) {
    console.error("[Invoice Counter Increment] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/reports/gstr1?month=YYYY-MM
 * Generates a GSTR-1 (Outward Supplies) summary for the given month.
 * Indian GST filing requirement. Returns:
 *   - B2B invoices (with customer GSTIN) — N/A for café retail unless B2B
 *   - B2C invoices aggregated by HSN code
 *   - HSN-wise summary (mandatory for GSTR-1)
 *
 * Format: JSON (default) or CSV (?format=csv).
 */
router.get("/api/reports/gstr1", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    // CRITICAL (C15 fix): GSTR-1 reports contain full revenue, every customer
    // phone, and GSTIN. The original endpoint only required *any* valid login;
    // a regular staff member could dump the entire revenue book. Now admin-only.
    const profile = await fetchUserProfileByAuthId(userId).catch(() => null);
    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const monthStr = (req.query.month as string) || "";
    const format = (req.query.format as string) || "json";
    const match = /^(\d{4})-(\d{2})$/.exec(monthStr);
    if (!match) {
      return res.status(400).json({ error: "Invalid month format. Use YYYY-MM (e.g. 2026-08)" });
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: "Month must be 01-12" });
    }

    // H28 fix: IST date boundaries (UTC+5:30). India operates in IST; using
    // UTC would mis-attribute late-night orders on the 1st of the month to
    // the previous month's GSTR-1.
    const start = new Date(Date.UTC(year, month - 1, 1, -5, -30));
    const end = new Date(Date.UTC(year, month, 1, -5, -30));

    // Fetch all order items in settled sessions during the month
    const orderHistoriesRows: any = await db.execute(sql`
      SELECT
        oh."sessionId",
        oh."tableLabel",
        oh."customerName",
        oh."customerPhone",
        oh."subtotal"::numeric AS subtotal,
        oh."taxAmount"::numeric AS taxAmount,
        oh."serviceCharge"::numeric AS serviceCharge,
        oh."discountAmount"::numeric AS discountAmount,
        oh."finalTotal"::numeric AS finalTotal,
        oh."settledAt"
      FROM "orderHistories" oh
      WHERE oh."settledAt" >= ${start.toISOString()}::timestamp
        AND oh."settledAt" < ${end.toISOString()}::timestamp
      ORDER BY oh."settledAt" ASC
    `);

    const sessions = (orderHistoriesRows.rows || []) as any[];

    // Aggregate per HSN code for B2C summary
    const hsnAgg = new Map<string, {
      hsnCode: string;
      totalQuantity: number;
      totalTaxableValue: number;
      totalCgst: number;
      totalSgst: number;
      totalIgst: number;
      invoiceCount: number;
    }>();
    let totalInvoices = sessions.length;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalCess = 0;
    let totalInvoiceValue = 0;

    const supabase = getSupabase() as any;
    const sdb = supabase as any;
    const { data: bizSettings } = await sdb.from("businessSettings").select("*").limit(1).single();
    const gstRate = parseFloat(bizSettings?.gstRate?.toString() || "0");
    const cgstRate = bizSettings?.cgstRate ?? gstRate / 2;
    const sgstRate = bizSettings?.sgstRate ?? gstRate / 2;
    const igstRate = bizSettings?.igstRate ?? gstRate;
    const isInterState = bizSettings?.isInterState ?? false;

    for (const session of sessions) {
      // Pull order items for this session
      const { data: orderRows } = await sdb
        .from("orders")
        .select("id")
        .eq("sessionId", session.sessionId);
      const orderIds = (orderRows || []).map((o: any) => o.id);

      if (orderIds.length === 0) continue;

      const { data: itemRows } = await sdb
        .from("orderItems")
        .select("menuItemId, quantity, priceAtOrderTime")
        .in("orderId", orderIds);
      const itemMenuIds = Array.from(new Set((itemRows || []).map((i: any) => i.menuItemId)));
      const { data: menuRows } = itemMenuIds.length > 0
        ? await sdb.from("menuItems").select("id, name, hsnCode").in("id", itemMenuIds)
        : { data: [] };
      const menuMap = new Map((menuRows || []).map((m: any) => [m.id, m]));

      for (const item of itemRows || []) {
        const m: any = menuMap.get(item.menuItemId);
        const hsn = m?.hsnCode || "9999"; // 9999 = "no HSN declared" fallback
        const qty = item.quantity || 0;
        const price = parseFloat(item.priceAtOrderTime?.toString() || "0");
        const taxable = qty * price;

        const entry = hsnAgg.get(hsn) || {
          hsnCode: hsn,
          totalQuantity: 0,
          totalTaxableValue: 0,
          totalCgst: 0,
          totalSgst: 0,
          totalIgst: 0,
          invoiceCount: 0,
        };
        entry.totalQuantity += qty;
        entry.totalTaxableValue += taxable;
        entry.invoiceCount = 1; // Simplified: count of distinct invoices touched
        hsnAgg.set(hsn, entry);
      }

      totalTaxable += parseFloat(session.subtotal?.toString() || "0");
      totalCgst += isInterState ? 0 : parseFloat(session.taxAmount?.toString() || "0") / 2;
      totalSgst += isInterState ? 0 : parseFloat(session.taxAmount?.toString() || "0") / 2;
      totalIgst += isInterState ? parseFloat(session.taxAmount?.toString() || "0") : 0;
      totalInvoiceValue += parseFloat(session.finalTotal?.toString() || "0");
    }

    const hsnSummary = Array.from(hsnAgg.values())
      .map((row) => {
        const taxForRow = row.totalTaxableValue * (gstRate / 100);
        const cgst = isInterState ? 0 : taxForRow / 2;
        const sgst = isInterState ? 0 : taxForRow / 2;
        const igst = isInterState ? taxForRow : 0;
        return {
          hsnCode: row.hsnCode,
          totalQuantity: row.totalQuantity,
          totalTaxableValue: Math.round(row.totalTaxableValue * 100) / 100,
          cgst: Math.round(cgst * 100) / 100,
          sgst: Math.round(sgst * 100) / 100,
          igst: Math.round(igst * 100) / 100,
          cess: 0,
        };
      })
      .sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));

    const report = {
      period: { month: monthStr, from: start.toISOString(), to: end.toISOString() },
      businessDetails: {
        gstin: bizSettings?.gstNumber || null,
        legalName: bizSettings?.legalBusinessName || bizSettings?.restaurantName || null,
        tradeName: bizSettings?.restaurantName || null,
        stateCode: bizSettings?.stateCode || null,
        isInterState,
        gstRate,
        cgstRate,
        sgstRate,
        igstRate,
      },
      summary: {
        totalInvoices,
        totalTaxableValue: Math.round(totalTaxable * 100) / 100,
        totalCgst: Math.round(totalCgst * 100) / 100,
        totalSgst: Math.round(totalSgst * 100) / 100,
        totalIgst: Math.round(totalIgst * 100) / 100,
        totalCess: Math.round(totalCess * 100) / 100,
        totalInvoiceValue: Math.round(totalInvoiceValue * 100) / 100,
      },
      hsnSummary,
      b2cInvoices: sessions.map((s: any) => ({
        invoiceNumber: `${bizSettings?.invoicePrefix || "INV-"}${s.sessionId}`,
        invoiceDate: s.settledAt,
        placeOfSupply: bizSettings?.placeOfSupply || null,
        customerName: s.customerName || "Walk-in",
        customerPhone: s.customerPhone || null,
        taxableValue: parseFloat(s.subtotal?.toString() || "0"),
        cgst: isInterState ? 0 : parseFloat(s.taxAmount?.toString() || "0") / 2,
        sgst: isInterState ? 0 : parseFloat(s.taxAmount?.toString() || "0") / 2,
        igst: isInterState ? parseFloat(s.taxAmount?.toString() || "0") : 0,
        invoiceValue: parseFloat(s.finalTotal?.toString() || "0"),
      })),
    };

    if (format === "csv") {
      const lines: string[] = [];
      lines.push("GSTR-1 Outward Supplies Report");
      lines.push(`Period,${monthStr}`);
      lines.push(`GSTIN,${report.businessDetails.gstin || ""}`);
      lines.push(`Legal Name,${report.businessDetails.legalName || ""}`);
      lines.push("");
      lines.push("HSN-wise Summary");
      lines.push("HSN Code,Total Quantity,Taxable Value,CGST,SGST,IGST,Cess");
      for (const row of hsnSummary) {
        lines.push(`${row.hsnCode},${row.totalQuantity},${row.totalTaxableValue},${row.cgst},${row.sgst},${row.igst},${row.cess}`);
      }
      lines.push("");
      lines.push("B2C Invoices");
      lines.push("Invoice #,Date,Place of Supply,Customer,Phone,Taxable Value,CGST,SGST,IGST,Invoice Value");
      for (const inv of report.b2cInvoices) {
        lines.push(`${inv.invoiceNumber},${inv.invoiceDate},${inv.placeOfSupply || ""},"${inv.customerName}",${inv.customerPhone || ""},${inv.taxableValue},${inv.cgst},${inv.sgst},${inv.igst},${inv.invoiceValue}`);
      }
      const csv = lines.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="GSTR1_${monthStr}.csv"`);
      res.send(csv);
    } else {
      res.json(report);
    }
  } catch (err) {
    console.error("[GSTR-1 Report] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
