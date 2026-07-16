import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import crypto from "crypto";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _supabase;
}

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

const router = Router();

router.post("/api/payment/create-order", async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const options = {
      amount: Math.round(amount * 100),
      currency: currency || "INR",
      receipt: receipt || `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    return res.json({
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    console.error("Razorpay order creation failed:", err);
    return res.status(500).json({ error: err.message || "Payment order creation failed" });
  }
});

router.post("/api/payment/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      tableCode,
      items,
      submissionId,
      deviceToken,
      settings,
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed - signature mismatch" });
    }

    const supabase = getSupabase();
    const db = supabase as any;

    const { data: tableData } = await db
      .from("tables")
      .select("*")
      .eq("tableCode", tableCode)
      .single();

    if (!tableData) {
      return res.status(400).json({ error: "Table not found" });
    }

    const { data: sessionData } = await db
      .from("sessions")
      .select("*")
      .eq("tableId", tableData.id)
      .eq("status", "open")
      .single();

    if (!sessionData) {
      return res.status(400).json({ error: "No active session" });
    }

    const { data: existingOrder } = await db
      .from("orders")
      .select("*")
      .eq("submissionId", submissionId)
      .single();

    if (existingOrder) {
      return res.json({ success: true, isDuplicate: true });
    }

    let orderNumber: number | null = null;
    try {
      const { data: counterData } = await db.rpc("get_next_order_number").single();
      if (counterData) {
        orderNumber = counterData as number;
      }
    } catch {}

    if (orderNumber === null) {
      try {
        const { data: maxOrd } = await db
          .from("orders")
          .select("orderNumber")
          .order("orderNumber", { ascending: false })
          .limit(1);
        orderNumber = (maxOrd && maxOrd[0]?.orderNumber != null ? (maxOrd[0].orderNumber as number) : 0) + 1;
      } catch {}
    }

    const insertPayload: any = {
      sessionId: sessionData.id,
      submissionId,
      deviceToken,
      paymentMethod: "online",
      paymentStatus: "paid",
    };
    if (orderNumber !== null) insertPayload.orderNumber = orderNumber;

    const { data: newOrder, error: orderError } = await db
      .from("orders")
      .insert(insertPayload)
      .select()
      .single();

    if (orderError) throw orderError;

    let totalAdded = 0;
    const menuItemIds = items.map((item: any) => item.menuItemId);
    const { data: menuItemsData } = await db
      .from("menuItems")
      .select("*")
      .in("id", menuItemIds);

    const menuItemMap = new Map((menuItemsData || []).map((m: any) => [m.id, m]));

    const orderItemsToInsert = items.map((item: any) => {
      const menuItem = menuItemMap.get(item.menuItemId);
      const price = menuItem ? parseFloat((menuItem as any).price.toString()) : 0;
      totalAdded += price * item.quantity;
      return {
        orderId: newOrder.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        priceAtOrderTime: price,
      };
    });

    await db.from("orderItems").insert(orderItemsToInsert);

    const currentSubtotal = parseFloat(sessionData.subtotal.toString());
    const newSubtotal = currentSubtotal + totalAdded;
    const scRate = settings?.serviceChargePercentage || 0;
    const taxRate = settings?.taxPercentage || 0;
    const sc = newSubtotal * (scRate / 100);
    const tax = (newSubtotal + sc) * (taxRate / 100);

    await db
      .from("sessions")
      .update({
        subtotal: newSubtotal,
        serviceCharge: sc,
        taxAmount: tax,
        finalTotal: newSubtotal + sc + tax,
        lastActivityAt: new Date().toISOString(),
      })
      .eq("id", sessionData.id);

    return res.json({ success: true, orderId: (newOrder as any).id });
  } catch (err: any) {
    console.error("Payment verification failed:", err);
    return res.status(500).json({ error: err.message || "Payment verification failed" });
  }
});

export default router;
