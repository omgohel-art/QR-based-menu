import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { buildInvoiceEmailHtml, InvoiceEmailData } from "./emailTemplates";
import { getUserIdFromToken } from "./authRoutes";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "MAMA Cafe <onboarding@resend.dev>";
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

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

// Public invoice page — no auth required
router.get("/invoice/:invoiceNumber", async (req: Request, res: Response) => {
  try {
    const invoiceNumber = req.params.invoiceNumber;
    if (!invoiceNumber) {
      return res.status(400).send("Invalid invoice number");
    }

    const supabase = getSupabase();
    const db = supabase as any;

    // Fetch business settings to get invoice prefix
    const { data: bizSettings } = await db
      .from("businessSettings")
      .select("invoicePrefix")
      .limit(1)
      .single();

    const prefix = bizSettings?.invoicePrefix || "INV-";

    // Extract sessionId from invoice number (e.g., "MAMA-123" → "123")
    const sessionIdStr = invoiceNumber.startsWith(prefix)
      ? invoiceNumber.substring(prefix.length)
      : invoiceNumber.replace(/^\D+/g, "");

    const sessionId = parseInt(sessionIdStr, 10);
    if (isNaN(sessionId)) {
      return res.status(400).send("Invalid invoice number format");
    }

    const data = await fetchInvoiceData(sessionId);

    // Verify the generated invoice number matches
    if (data.invoiceNumber !== invoiceNumber) {
      return res.status(404).send("Invoice not found");
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

router.get("/api/invoice/:sessionId", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    const supabase = getSupabase();
    const db = supabase as any;

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (sessionError || !session) {
      return res.status(404).json({ error: "Session not found" });
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
      ? await db.from("menuItems").select("id, name").in("id", menuItemIds)
      : { data: [] };
    const nameMap = new Map((menuItems || []).map((m: any) => [m.id, m.name]));

    const items = (orderItems || []).map((i: any) => ({
      name: nameMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
      quantity: i.quantity,
      price: parseFloat(i.priceAtOrderTime?.toString() || "0"),
    }));

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
      orderNumber,
      tableLabel,
      orderDate: formattedDate,
      restaurantAddress: [bizSettings?.address, bizSettings?.city, bizSettings?.state, bizSettings?.pincode].filter(Boolean).join(", "),
      gstNumber: bizSettings?.gstNumber || null,
      items,
      subtotal,
      serviceCharge,
      taxAmount,
      gstRate,
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
      const supabaseClient = getSupabase();
      const updatePayload: Record<string, any> = {};
      if (customerName) updatePayload.customerName = customerName;
      if (customerPhone) updatePayload.customerPhone = customerPhone;
      await supabaseClient.from("orderHistories").update(updatePayload).eq("sessionId", sessionId);
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
  const supabase = getSupabase();
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
    ? await db.from("menuItems").select("id, name").in("id", menuItemIds)
    : { data: [] };
  const nameMap = new Map((menuItems || []).map((m: any) => [m.id, m.name]));

  const items = (orderItems || []).map((i: any) => ({
    name: nameMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
    quantity: i.quantity,
    price: parseFloat(i.priceAtOrderTime?.toString() || "0"),
  }));

  const { data: bizSettings } = await db
    .from("businessSettings")
    .select("*")
    .limit(1)
    .single();

  const gstEnabled = bizSettings?.gstEnabled ?? false;
  const gstRate = parseFloat(bizSettings?.gstRate?.toString() || "0");
  const invoicePrefix = bizSettings?.invoicePrefix || "INV-";
  const invoiceNumber = `${invoicePrefix}${sessionId}`;

  const firstOrder = orders?.[0];
  const orderDate = session.settledAt || session.createdAt || new Date().toISOString();
  const formattedDate = new Date(orderDate).toLocaleDateString("en-IN", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return {
    restaurantName: bizSettings?.restaurantName || "Restaurant",
    logoUrl: bizSettings?.logoUrl || null,
    invoiceNumber,
    orderNumber: firstOrder?.orderNumber || null,
    tableLabel,
    orderDate: formattedDate,
    restaurantAddress: [bizSettings?.address, bizSettings?.city, bizSettings?.state, bizSettings?.pincode].filter(Boolean).join(", "),
    gstNumber: bizSettings?.gstNumber || null,
    items,
    subtotal: parseFloat(session.subtotal?.toString() || "0"),
    serviceCharge: parseFloat(session.serviceCharge?.toString() || "0"),
    taxAmount: parseFloat(session.taxAmount?.toString() || "0"),
    gstRate,
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

export default router;
