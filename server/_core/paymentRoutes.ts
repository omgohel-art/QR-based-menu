import express, { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { razorpayBreaker, fire } from "./circuitBreaker";
import { awardLoyaltyPoints } from "./loyaltyService";
import { validateCoupon, applyCoupon } from "./couponService";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _supabase;
}

let _razorpay: Razorpay | null = null;
function getRazorpay() {
  if (!_razorpay) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay credentials not configured");
    }
    _razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
}

const router = Router();

// In-memory rate limiter with periodic cleanup to prevent memory leak
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  });
}, 300_000);

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count++;
  return true;
}

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

    const order = await fire(razorpayBreaker, async () =>
      getRazorpay().orders.create(options)
    ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Razorpay unavailable";
      throw new Error(msg);
    });

    return res.json({
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    console.error("Razorpay order creation failed:", err);
    return res.status(500).json({ error: "Payment order creation failed" });
  }
});

function validateItems(items: any[]): string | null {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return "Items array is required and must not be empty";
  }
  if (items.length > 200) {
    return "Too many items in a single order (max 200)";
  }
  for (const item of items) {
    if (!item.menuItemId || typeof item.menuItemId !== "number" || item.menuItemId <= 0) {
      return "Each item must have a valid menuItemId (positive number)";
    }
    if (!item.quantity || typeof item.quantity !== "number" || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      return "Each item must have a valid quantity (positive integer)";
    }
    if (item.quantity > 100) {
      return "Item quantity cannot exceed 100";
    }
  }
  return null;
}

function sanitizePhone(raw: string): string {
  let digits = raw.replace(/[\s\-\(\)\+]/g, "");
  if (digits.startsWith("00")) digits = digits.substring(2);
  if (!digits.startsWith("91") && digits.length === 10) digits = "91" + digits;
  return digits;
}

function validateIndianPhone(phone: string): boolean {
  const sanitized = sanitizePhone(phone);
  return /^\d{10,15}$/.test(sanitized);
}

async function loadAndVerifyOrderData(req: any) {
  const { tableCode, items, submissionId, deviceToken, customerName, customerPhone } = req.body;

  if (!tableCode || typeof tableCode !== "string" || tableCode.trim().length === 0) {
    return { error: "Invalid table code" };
  }

  if (!submissionId || typeof submissionId !== "string" || submissionId.trim().length === 0) {
    return { error: "Invalid submission ID" };
  }

  if (!deviceToken || typeof deviceToken !== "string" || deviceToken.trim().length < 8) {
    return { error: "Invalid device token" };
  }

  const trimmedName = customerName ? String(customerName).trim() : "";
  const trimmedPhone = customerPhone ? String(customerPhone).trim() : "";
  const appliedCouponCode = req.body.appliedCouponCode ? String(req.body.appliedCouponCode).trim() : "";

  const sanitizedPhone = trimmedPhone ? sanitizePhone(trimmedPhone) : "";

  if (trimmedName && trimmedName.length > 128) {
    return { error: "Customer name is too long" };
  }
  if (trimmedPhone && !validateIndianPhone(trimmedPhone)) {
    return { error: "Invalid phone number. Enter a valid 10-digit Indian mobile number." };
  }

  const itemError = validateItems(items);
  if (itemError) return { error: itemError };

  const supabase = getSupabase();

  const { data: tableData } = await (supabase as any)
    .from("tables")
    .select("id")
    .eq("tableCode", tableCode.trim())
    .single();

  if (!tableData) {
    return { error: "Table not found" };
  }

  const { data: sessionData } = await (supabase as any)
    .from("sessions")
    .select("*")
    .eq("tableId", tableData.id)
    .eq("status", "open")
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sessionData) {
    return { error: "No active session" };
  }

  const { data: existingOrder } = await (supabase as any)
    .from("orders")
    .select("id")
    .eq("submissionId", submissionId)
    .single();

  if (existingOrder) {
    return { isDuplicate: true };
  }

  // Fetch all menu items in one query to validate prices
  const menuItemIds = items.map((item: any) => item.menuItemId);
  const { data: menuItemsData } = await (supabase as any)
    .from("menuItems")
    .select("id, price, isAvailable")
    .in("id", menuItemIds);

  if (!menuItemsData || menuItemsData.length !== new Set(menuItemIds).size) {
    return { error: "One or more menu items not found" };
  }

  const menuItemMap = new Map((menuItemsData as any[]).map((m: any) => [m.id, m]));

  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    if (!menuItem) {
      return { error: `Menu item ${item.menuItemId} not found` };
    }
    if (!(menuItem as any).isAvailable) {
      return { error: `Menu item ${item.menuItemId} is not available` };
    }
  }

  // Fetch server-side settings (never trust client-supplied tax/service charge rates)
  const { data: bizSettings } = await (supabase as any)
    .from("businessSettings")
    .select("gstEnabled, gstRate, serviceChargePercentage")
    .maybeSingle();

  const serverSettings = {
    gstEnabled: bizSettings?.gstEnabled ?? false,
    gstRate: parseFloat(bizSettings?.gstRate?.toString() || "0"),
    serviceChargePercentage: parseFloat(bizSettings?.serviceChargePercentage?.toString() || "0"),
  };

  return { tableData, sessionData, menuItemMap, items, submissionId, deviceToken, settings: serverSettings, customerName: trimmedName, customerPhone: sanitizePhone(trimmedPhone), appliedCouponCode };
}

async function createOrderFromValidatedData(data: any, overrides?: { method?: string; status?: string }) {
  const { sessionData, items, submissionId, deviceToken, menuItemMap, settings, customerName, customerPhone, appliedCouponCode } = data;
  const supabase = getSupabase();
  const db = supabase as any;

  // Calculate subtotal
  let totalAdded = 0;
  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId);
    const price = parseFloat(menuItem.price.toString());
    totalAdded += price * item.quantity;
  }

  // Calculate tax and service charge
  const scRate = settings?.serviceChargePercentage || 0;
  const gstEnabled = settings?.gstEnabled || false;
  const gstRate = settings?.gstRate || 0;
  const scAmt = totalAdded * (scRate / 100);
  const taxable = gstEnabled ? totalAdded + scAmt : 0;
  const taxAmt = taxable * (gstRate / 100);
  const subtotalWithTax = totalAdded + scAmt + taxAmt;

  // Apply coupon if provided
  let couponDiscount = 0;
  let couponId: number | null = null;
  let couponCode: string | null = null;
  let finalTotal = subtotalWithTax;

  if (appliedCouponCode && customerPhone) {
    try {
      const couponResult = await validateCoupon(appliedCouponCode, customerPhone);
      if (couponResult.valid && couponResult.coupon) {
        if (couponResult.coupon.rewardType === "discount") {
          couponDiscount = Math.round(subtotalWithTax * (couponResult.coupon.discountPercent / 100) * 100) / 100;
          finalTotal = subtotalWithTax - couponDiscount;
        } else if (couponResult.coupon.rewardType === "freeItem") {
          // Free item coupon: find a matching item and discount its price
          // For simplicity, apply as a discount of the cheapest item
          const prices = items.map((item: any) => {
            const menuItem = menuItemMap.get(item.menuItemId);
            return parseFloat(menuItem.price.toString()) * item.quantity;
          });
          if (prices.length > 0) {
            couponDiscount = Math.min(...prices);
            finalTotal = subtotalWithTax - couponDiscount;
          }
        }
        couponId = couponResult.coupon.id;
        couponCode = couponResult.coupon.code;
      }
    } catch (err) {
      console.error("[Coupon] Validation error:", err);
    }
  }

  finalTotal = Math.max(0, finalTotal);

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
    paymentMethod: overrides?.method || "online",
    paymentStatus: overrides?.status || "paid",
  };
  if (orderNumber !== null) insertPayload.orderNumber = orderNumber;
  if (couponCode) insertPayload.appliedCouponCode = couponCode;
  if (couponDiscount) insertPayload.couponDiscount = couponDiscount;
  if (finalTotal !== null && finalTotal !== undefined) insertPayload.finalTotalAfterDiscount = finalTotal;

  let newOrder: any = null;
  let orderError: any = null;

  ({ data: newOrder, error: orderError } = await db
    .from("orders")
    .insert(insertPayload)
    .select()
    .single());

  const orderErrorText = orderError ? JSON.stringify(orderError) : "";
  const schemaError = /appliedCouponCode|couponDiscount|finalTotalAfterDiscount|schema cache|column .* does not exist/i.test(orderErrorText);

  if (orderError && schemaError) {
    const fallbackPayload: any = {
      sessionId: sessionData.id,
      submissionId,
      deviceToken,
      paymentMethod: overrides?.method || "online",
      paymentStatus: overrides?.status || "paid",
    };
    if (orderNumber !== null) fallbackPayload.orderNumber = orderNumber;

    ({ data: newOrder, error: orderError } = await db
      .from("orders")
      .insert(fallbackPayload)
      .select()
      .single());
  }

  if (orderError) {
    // Handle unique constraint violation on submissionId (race condition duplicate)
    if (orderError.code === "23505" && orderError.message?.includes("submissionId")) {
      const { data: existing } = await db
        .from("orders")
        .select("id, orderNumber")
        .eq("submissionId", submissionId)
        .single();
      if (existing) {
        return { success: true, orderId: existing.id, orderNumber: existing.orderNumber ?? existing.id, isDuplicate: true };
      }
    }
    throw orderError;
  }

  const orderItemsToInsert = items.map((item: any) => {
    const menuItem = menuItemMap.get(item.menuItemId);
    const price = parseFloat(menuItem.price.toString());
    const insertItem: any = {
      orderId: newOrder.id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      priceAtOrderTime: price,
    };
    if (item.notes) {
      insertItem.specialInstructions = item.notes;
    }
    return insertItem;
  });

  await db.from("orderItems").insert(orderItemsToInsert);

  // Use atomic SQL increment via RPC to avoid race conditions
  const { error: rpcError } = await db.rpc("add_to_session_total", {
    p_session_id: sessionData.id,
    p_amount: totalAdded,
    p_service_charge_pct: settings?.serviceChargePercentage || 0,
    p_gst_enabled: settings?.gstEnabled || false,
    p_gst_rate: settings?.gstRate || 0,
  });

  if (rpcError) {
    // Fallback: use atomic SQL increment via Supabase RPC to avoid race condition
    const scRate = settings?.serviceChargePercentage || 0;
    const gstEnabled = settings?.gstEnabled || false;
    const gstRate = settings?.gstRate || 0;

    // Atomic increment: add totalAdded to subtotal, then recalculate derived fields
    const { error: updateError } = await db.rpc("atomic_add_to_session", {
      p_session_id: sessionData.id,
      p_amount: totalAdded,
      p_sc_rate: scRate,
      p_gst_enabled: gstEnabled,
      p_gst_rate: gstRate,
    });

    if (updateError) {
      // Final fallback: read current subtotal and do a direct update
      // Small race window exists but RPC is the primary atomic path
      const { data: updatedSession } = await db
        .from("sessions")
        .select("subtotal")
        .eq("id", sessionData.id)
        .single();

      if (updatedSession) {
        const currentSubtotal = parseFloat(updatedSession.subtotal?.toString() || "0");
        const newSubtotal = currentSubtotal + totalAdded;
        const sc = newSubtotal * (scRate / 100);
        const taxableAmount = gstEnabled ? newSubtotal + sc : 0;
        const tax = taxableAmount * (gstRate / 100);

        await db.from("sessions").update({
          subtotal: newSubtotal,
          serviceCharge: sc,
          taxAmount: tax,
          finalTotal: newSubtotal + sc + tax,
          lastActivityAt: new Date().toISOString(),
        }).eq("id", sessionData.id);
      }
    }
  }

  // Store customer info on the session (first order sets it, subsequent orders preserve it)
  if (customerName || customerPhone) {
    const updatePayload: any = {};
    if (customerName) updatePayload.customerName = customerName;
    if (customerPhone) updatePayload.customerPhone = customerPhone;
    if (Object.keys(updatePayload).length > 0) {
      await db.from("sessions").update(updatePayload).eq("id", sessionData.id);
    }
  }

  // Award loyalty points immediately (on the full amount before discount)
  let loyaltyResult = { earned: 0, totalPoints: 0, milestoneReached: false, newCouponsCount: 0, spinsAwarded: 0, newSpinMilestones: [] as number[] };
  if (customerPhone && totalAdded > 0) {
    try {
      loyaltyResult = await awardLoyaltyPoints(customerPhone, customerName || undefined, totalAdded, newOrder.id);
      await db.from("orders").update({
        loyaltyPointsEarned: loyaltyResult.earned,
        loyaltyAwardedAt: new Date().toISOString(),
      }).eq("id", newOrder.id);
    } catch (err) {
      console.error("[Loyalty] Failed to award points on order creation:", err);
    }
  }

  // Mark coupon as used after successful order creation
  if (couponId) {
    try {
      await applyCoupon(couponId, newOrder.id);
    } catch (err) {
      console.error("[Coupon] Failed to mark coupon as used:", err);
    }
  }

  return {
    success: true,
    orderId: newOrder.id,
    orderNumber: newOrder.orderNumber ?? newOrder.id,
    loyaltyPointsEarned: loyaltyResult.earned,
    loyaltyTotalPoints: loyaltyResult.totalPoints,
    loyaltyMilestoneReached: loyaltyResult.milestoneReached,
    loyaltyNewCouponsCount: loyaltyResult.newCouponsCount,
    spinsAwarded: loyaltyResult.spinsAwarded,
    newSpinMilestones: loyaltyResult.newSpinMilestones,
    couponApplied: couponCode ? { code: couponCode, discount: couponDiscount, finalTotal } : null,
  };
}

// Razorpay payment verification
router.post("/api/payment/verify", async (req, res) => {
  try {
    const validated = await loadAndVerifyOrderData(req);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    if (validated.isDuplicate) {
      return res.json({ success: true, isDuplicate: true });
    }

    // Rate limit: max 20 orders per IP per minute
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(`verify:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing Razorpay payment details" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    const sigBuffer = Buffer.from(razorpay_signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return res.status(400).json({ error: "Payment verification failed - signature mismatch" });
    }

    // Verify payment amount matches server-calculated total
    try {
      const payment = await fire(razorpayBreaker, async () =>
        getRazorpay().payments.fetch(razorpay_payment_id)
      ).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Razorpay unavailable";
        throw new Error(msg);
      });
      const amountPaid = payment.amount;

      const v = validated as any;
      let calcTotal = 0;
      for (const item of v.items) {
        const menuItem = v.menuItemMap.get(item.menuItemId);
        const price = parseFloat(menuItem.price.toString());
        calcTotal += price * item.quantity;
      }
      const scRate = validated.settings?.serviceChargePercentage || 0;
      const gstEnabled = validated.settings?.gstEnabled || false;
      const gstRate = validated.settings?.gstRate || 0;
      const scAmt = calcTotal * (scRate / 100);
      const taxable = gstEnabled ? calcTotal + scAmt : 0;
      const taxAmt = taxable * (gstRate / 100);
      const subtotalWithTax = calcTotal + scAmt + taxAmt;

      // Apply coupon discount if applicable
      let couponDiscountPaise = 0;
      if (v.appliedCouponCode && v.customerPhone) {
        try {
          const couponResult = await validateCoupon(v.appliedCouponCode, v.customerPhone);
          if (couponResult.valid && couponResult.coupon) {
            if (couponResult.coupon.rewardType === "discount") {
              couponDiscountPaise = Math.round(subtotalWithTax * (couponResult.coupon.discountPercent / 100) * 100);
            } else if (couponResult.coupon.rewardType === "freeItem") {
              const prices = v.items.map((item: any) => {
                const mi = v.menuItemMap.get(item.menuItemId);
                return parseFloat(mi.price.toString()) * item.quantity;
              });
              if (prices.length > 0) {
                couponDiscountPaise = Math.round(Math.min(...prices) * 100);
              }
            }
          }
        } catch {}
      }

      const expectedPaise = Math.round(subtotalWithTax * 100) - couponDiscountPaise;

      if (amountPaid !== expectedPaise) {
        return res.status(400).json({ error: "Payment amount mismatch" });
      }
    } catch (err) {
      console.error("Failed to verify payment amount:", err);
      return res.status(500).json({ error: "Payment amount verification failed" });
    }

    const result = await createOrderFromValidatedData(validated);
    return res.json(result);
  } catch (err: any) {
    console.error("Payment verification failed:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// Counter order submission with server-side price validation
router.post("/api/order/counter-submit", async (req, res) => {
  try {
    const validated = await loadAndVerifyOrderData(req);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }
    if (validated.isDuplicate) {
      return res.json({ success: true, isDuplicate: true });
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkRateLimit(`counter:${ip}`, 20, 60_000)) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }

    const result = await createOrderFromValidatedData(validated, { method: "counter", status: "pending" });
    return res.json(result);
  } catch (err: any) {
    console.error("Counter order submission failed:", err);
    return res.status(500).json({ error: err?.message || "Order submission failed" });
  }
});

// ============================================================================
// RAZORPAY WEBHOOK — must be mounted BEFORE the global JSON body parser
// Uses express.raw() to get the raw body for signature verification
// ============================================================================
export const webhookRouter = Router();

webhookRouter.post("/api/payment/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    if (!webhookSecret) {
      console.error("[Webhook] RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook");
      return res.status(503).json({ error: "Webhook not configured" });
    }

    const rawBody = req.body; // Buffer from express.raw()
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ error: "Invalid webhook body" });
    }

    // Verify webhook signature
    const signature = req.headers["x-razorpay-signature"] as string;
    if (!signature) {
      return res.status(400).json({ error: "Missing webhook signature" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      console.error("[Webhook] Signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = JSON.parse(rawBody.toString());
    console.log(`[Webhook] Received event: ${event.event}`);

    // Handle payment.captured event (payment successful)
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      if (!payment) {
        return res.json({ received: true });
      }

      const { razorpay_order_id, razorpay_payment_id, amount } = payment;

      // Log for reconciliation — the client-side /api/payment/verify is the primary
      // order creation path. The webhook is a safety net for when that fails.
      // We log the event so admin can manually reconcile if needed.
      console.log(`[Webhook] Payment captured: order=${razorpay_order_id}, payment=${razorpay_payment_id}, amount=${amount} paise`);

      // Try to find and update any pending order that matches this Razorpay order
      const supabase = getSupabase();
      const db = supabase as any;

      // Look for orders with this payment method that are still pending
      // The submissionId format includes the Razorpay order ID in some cases
      const { data: pendingOrders } = await db
        .from("orders")
        .select("id, sessionId, paymentStatus")
        .eq("paymentMethod", "online")
        .eq("paymentStatus", "pending")
        .limit(10);

      if (pendingOrders && pendingOrders.length > 0) {
        // Mark the most recent pending order as paid
        const latestOrder = pendingOrders[pendingOrders.length - 1];
        await db
          .from("orders")
          .update({ paymentStatus: "paid" })
          .eq("id", latestOrder.id);
        console.log(`[Webhook] Updated order ${latestOrder.id} to paid`);
      }
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error("[Webhook] Error processing webhook:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
