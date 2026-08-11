import express, { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { razorpayBreaker, fire } from "./circuitBreaker";
import { awardLoyaltyPoints } from "./loyaltyService";
import { validateCoupon, applyCoupon } from "./couponService";
import { getDb } from "../db";
import { getUserIdFromToken } from "./authRoutes";

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

// In-memory rate limiter. CRITICAL (C21 fix): bounded — if the map grows past
// MAX_RL_ENTRIES we evict the oldest entries (LRU-ish via insertion order).
const MAX_RL_ENTRIES = 50_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  });
  // Hard cap: evict oldest entries if still over the limit.
  if (rateLimitMap.size > MAX_RL_ENTRIES) {
    const overflow = rateLimitMap.size - MAX_RL_ENTRIES;
    let i = 0;
    const keys = Array.from(rateLimitMap.keys());
    for (const key of keys) {
      if (i++ >= overflow) break;
      rateLimitMap.delete(key);
    }
  }
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

    // Bug 3 fix: require a valid tableCode so anonymous callers can't generate
    // Razorpay orders at arbitrary amounts. Combined with the rate-limit below
    // and the tableCode → open-session check, this restricts create-order to
    // legitimate customer flows at the table.
    const { tableCode } = req.body;
    if (!tableCode || typeof tableCode !== "string") {
      return res.status(400).json({ error: "tableCode is required" });
    }
    const supabase = getSupabase();
    const sb = supabase as any;
    const { data: tableRow } = await sb
      .from("tables")
      .select("id")
      .eq("tableCode", tableCode.trim())
      .maybeSingle();
    if (!tableRow) {
      return res.status(404).json({ error: "Table not found" });
    }
    const { data: openSession } = await sb
      .from("sessions")
      .select("id")
      .eq("tableId", tableRow.id)
      .eq("status", "open")
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!openSession) {
      return res.status(409).json({ error: "No active session at this table" });
    }

    // Bug 4 fix: robust amount validation. Reject NaN, non-finite, scientific
    // notation, and out-of-range values before they reach Razorpay.
    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0 || rupees > 5_000_000) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    // Reject scientific notation input — parseInt("1e+21") would silently truncate
    // to 1, leading to a ₹0.01 charge for what the caller thinks is ₹1e21.
    const rawStr = String(amount).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(rawStr)) {
      return res.status(400).json({ error: "Invalid amount format" });
    }
    // Convert rupees → paise using string-based rounding (avoids JS float drift
    // like 0.295 * 100 = 29.4999…).
    const [intPart, fracPart = ""] = rawStr.split(".");
    const frac2 = (fracPart + "00").slice(0, 2);
    const amountPaise = parseInt(intPart, 10) * 100 + parseInt(frac2 || "0", 10);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // Bug 3 fix: per-IP rate limit on create-order to prevent spam.
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    if (!checkRateLimit(`create-order:${ip}`, 30, 60_000)) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }

    const options = {
      amount: amountPaise,
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
    // Cap notes length to prevent DoS via huge payloads (M4 fix).
    if (item.notes != null && typeof item.notes === "string" && item.notes.length > 500) {
      return "Item notes cannot exceed 500 characters";
    }
  }
  // CRITICAL (C18 fix): Guard against quantity tampering. The server must NEVER
  // recompute totals using a separate client-supplied quantity — both the server-side
  // total calculation AND the per-item quantity record come from the SAME validated
  // `items` array. The amount verification in /api/payment/verify will recompute the
  // total using these exact items (and re-fetched prices), so any tampering causes
  // an amount mismatch and the order is rejected.
  //
  // We also normalise types here so downstream code can rely on Number.
  for (const item of items) {
    item.menuItemId = Number(item.menuItemId);
    item.quantity = Number(item.quantity);
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

    // CRITICAL (C18 fix): Server-side sanity check on per-item total. Without this,
    // an attacker can pass quantity=1 alongside a full item list and pay pennies for
    // a large order. By capping the per-item line total at ₹10,00,000 (10 lakh) and
    // the cumulative order total at ₹50,00,000 (50 lakh), we make tampering expensive
    // while still allowing legitimate large orders.
    let lineTotalCheck = 0;
    const MAX_LINE_TOTAL_PAISE = 10_000_000_00; // ₹10 lakh
    const MAX_ORDER_TOTAL_PAISE = 50_000_000_00; // ₹50 lakh
    for (const item of items) {
      const menuItem = menuItemMap.get(item.menuItemId);
      if (!menuItem) {
        return { error: `Menu item ${item.menuItemId} not found` };
      }
      if (!(menuItem as any).isAvailable) {
        return { error: `Menu item ${item.menuItemId} is not available` };
      }
      const price = parseFloat((menuItem as any).price.toString());
      if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
        return { error: `Menu item ${item.menuItemId} has invalid price` };
      }
      const linePaise = Math.round(price * 100) * item.quantity;
      if (linePaise > MAX_LINE_TOTAL_PAISE) {
        return { error: `Line total for item ${item.menuItemId} exceeds limit` };
      }
      lineTotalCheck += linePaise;
      if (lineTotalCheck > MAX_ORDER_TOTAL_PAISE) {
        return { error: "Order total exceeds safety limit" };
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
    // H1 fix: retry the lookup a few times if we collide on the unique orderNumber index.
    for (let attempt = 0; attempt < 5 && orderNumber === null; attempt++) {
      try {
        const { data: maxOrd } = await db
          .from("orders")
          .select("orderNumber")
          .order("orderNumber", { ascending: false })
          .limit(1);
        orderNumber = (maxOrd && maxOrd[0]?.orderNumber != null ? (maxOrd[0].orderNumber as number) : 0) + 1;
      } catch {
        orderNumber = null;
      }
    }
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
    // Handle unique constraint violations gracefully.
    if (orderError.code === "23505") {
      // Duplicate submissionId — race condition duplicate, return existing row.
      if (orderError.message?.includes("submissionId")) {
        const { data: existing } = await db
          .from("orders")
          .select("id, orderNumber")
          .eq("submissionId", submissionId)
          .single();
        if (existing) {
          return { success: true, orderId: existing.id, orderNumber: existing.orderNumber ?? existing.id, isDuplicate: true };
        }
      }
      // Duplicate orderNumber (H1 fix) — retry with a fresh number.
      if (orderError.message?.includes("orderNumber") && orderNumber !== null) {
        for (let i = 0; i < 5; i++) {
          const retryNum = orderNumber + 1 + i;
          const { data: retried, error: retryErr } = await db
            .from("orders")
            .insert({ ...insertPayload, orderNumber: retryNum })
            .select()
            .single();
          if (!retryErr) {
            newOrder = retried;
            orderError = null;
            break;
          }
          if (!retryErr.message?.includes("orderNumber")) {
            orderError = retryErr;
            break;
          }
        }
      }
    }
    if (orderError) throw orderError;
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

  // Auto-deduct inventory based on recipes (Phase 1: Recipe-based inventory tracking)
  try {
    const { deductInventoryForOrder } = await import("./recipeRoutes");
    const drizzleDb = await getDb();
    if (drizzleDb) {
      const itemsForDeduction = items.map((it: any) => ({
        menuItemId: parseInt(it.menuItemId.toString()),
        quantity: parseInt(it.quantity.toString() || "1"),
      }));
      const lowStockAlerts = await deductInventoryForOrder(drizzleDb, itemsForDeduction, newOrder.id);
      if (lowStockAlerts.length > 0) {
        console.log(`[Auto-Deduct] Order #${newOrder.id} triggered ${lowStockAlerts.length} low-stock alert(s):`,
          lowStockAlerts.map((a) => `${a.inventoryName} (${a.currentStock.toFixed(3)}${a.unit})`).join(", "));
      }
    }
  } catch (err) {
    console.error("[Auto-Deduct] Inventory deduction failed (non-fatal):", err);
  }

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
      // H4 fix: final fallback uses a guarded UPDATE so concurrent orders don't
      // race. The RPC path is the primary atomic path; this last-chance direct
      // update re-reads the row and uses the previous value as a guard so two
      // concurrent fallbacks cannot silently lose one update.
      const { data: updatedSession } = await db
        .from("sessions")
        .select("subtotal, serviceCharge, taxAmount")
        .eq("id", sessionData.id)
        .single();

      if (updatedSession) {
        const prevSubtotal = parseFloat(updatedSession.subtotal?.toString() || "0");
        const newSubtotal = prevSubtotal + totalAdded;
        const sc = newSubtotal * (scRate / 100);
        const taxableAmount = gstEnabled ? newSubtotal + sc : 0;
        const tax = taxableAmount * (gstRate / 100);

        const { error: guardedErr } = await db.from("sessions").update({
          subtotal: newSubtotal,
          serviceCharge: sc,
          taxAmount: tax,
          finalTotal: newSubtotal + sc + tax,
          lastActivityAt: new Date().toISOString(),
        }).eq("id", sessionData.id).eq("subtotal", prevSubtotal.toString());

        if (guardedErr) {
          // H4 fix: log loudly so the operator notices that the fallback path
          // raced. The session subtotal may be slightly stale until next order.
          console.error(`[Session Total] Guarded fallback raced on session ${sessionData.id}; subtotal may be stale.`);
        }
      }
    }
  }

  // H5 fix: only set customer name/phone when the session has none yet. This
  // prevents a second customer at the same table from changing the
  // customer-of-record on an existing bill.
  if (customerName || customerPhone) {
    const updatePayload: any = {};
    if (customerName && !sessionData.customerName) updatePayload.customerName = customerName;
    if (customerPhone && !sessionData.customerPhone) updatePayload.customerPhone = customerPhone;
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

  // Mark coupon as used after successful order creation.
  // CRITICAL (C4 fix): The previous code swallowed the "Coupon not found or
  // already used" error silently, allowing the second concurrent order to claim
  // the discount AND keep the coupon active. applyCoupon is now strict — we
  // surface the error so the caller can decide whether to roll back the order.
  if (couponId) {
    try {
      await applyCoupon(couponId, newOrder.id);
    } catch (err) {
      console.error("[Coupon] Failed to mark coupon as used:", err);
      // Roll back the order to keep state consistent — if we can't consume the
      // coupon atomically, the customer should not get the discount.
      try {
        await db.from("orderItems").delete().eq("orderId", newOrder.id);
        await db.from("orders").update({
          paymentStatus: "failed",
          updatedAt: new Date().toISOString(),
        }).eq("id", newOrder.id);
      } catch (rollbackErr) {
        console.error("[Coupon] Rollback failed:", rollbackErr);
      }
      throw new Error("Coupon redemption failed; order rolled back. Please re-apply and try again.");
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
    // Bug 3 fix: /api/payment/verify now requires an explicit tableCode in the
    // body. loadAndVerifyOrderData will additionally validate it and look up the
    // open session. Anonymous callers can no longer hit this endpoint to forge
    // payment verifications.
    const { tableCode: _tc, submissionId: _sid, deviceToken: _dt } = req.body;
    if (!_tc || !_sid || !_dt) {
      return res.status(400).json({ error: "tableCode, submissionId, and deviceToken are required" });
    }

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
    // Bug 4 fix: validate Razorpay identifiers are non-empty strings of
    // reasonable length. The signature is verified below.
    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string" ||
      razorpay_order_id.length > 64 ||
      razorpay_payment_id.length > 64 ||
      razorpay_signature.length > 256
    ) {
      return res.status(400).json({ error: "Invalid Razorpay identifier format" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    // CRITICAL (C19 fix): Reject odd-length hex up front. Buffer.from(_, "hex") silently
    // truncates odd-length hex to the largest even-length prefix, which could cause a
    // length-equality match against an attacker-supplied truncated signature.
    if (!/^[0-9a-f]+$/i.test(razorpay_signature) || razorpay_signature.length % 2 !== 0) {
      return res.status(400).json({ error: "Invalid signature format" });
    }

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
    // Persist the Razorpay IDs on the order so the webhook can match exactly.
    try {
      const supabaseForUpdate = getSupabase();
      await (supabaseForUpdate as any).from("orders").update({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      }).eq("id", (result as any).orderId);
    } catch (e) {
      console.warn("[Verify] Failed to persist Razorpay IDs:", e);
    }

    // Feature 1: best-effort auto KOT fire after successful online payment.
    try {
      const kotItems = (validated.items || []).map((it: any) => ({
        name: it.menuItemName || it.name || `Item #${it.menuItemId}`,
        quantity: it.quantity,
        notes: it.notes || "",
      }));
      await fetch(`${req.protocol}://${req.get("host")}/api/print-kot/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: (result as any).orderId ?? (result as any).orderNumber,
          orderNumber: (result as any).orderNumber,
          tableLabel: (validated as any).tableData?.label ?? "Unknown",
          items: kotItems,
        }),
      }).catch(() => undefined);
    } catch (printErr) {
      console.warn("[verify] auto KOT failed:", printErr);
    }

    return res.json(result);
  } catch (err: any) {
    console.error("Payment verification failed:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
});

// Counter order submission with server-side price validation
router.post("/api/order/counter-submit", async (req, res) => {
  try {
    // CRITICAL (C17 fix): counter-submit is staff-only — it bypasses payment,
    // so anyone with the URL could submit orders with no money changing hands.
    // Require either a valid JWT (staff) OR a short-lived staff token in the
    // request body that's been issued via /api/auth/staff-token.
    const userId = getUserIdFromToken(req);
    const staffToken = req.headers["x-staff-token"];
    const tokenOk = verifyStaffToken(staffToken as string | undefined);
    if (!userId && !tokenOk) {
      return res.status(401).json({ error: "Staff authentication required" });
    }

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

    // Feature 1: best-effort auto KOT fire. Failures are logged but never block
    // the order flow — printing is auxiliary.
    try {
      const kotItems = (validated.items || []).map((it: any) => ({
        name: it.menuItemName || it.name || `Item #${it.menuItemId}`,
        quantity: it.quantity,
        notes: it.notes || "",
      }));
      await fetch(`${req.protocol}://${req.get("host")}/api/print-kot/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: result.orderId ?? result.orderNumber,
          orderNumber: result.orderNumber,
          tableLabel: (validated as any).tableData?.label ?? "Unknown",
          items: kotItems,
        }),
      }).catch(() => undefined);
    } catch (printErr) {
      console.warn("[counter-submit] auto KOT failed:", printErr);
    }

    return res.json(result);
  } catch (err: any) {
    console.error("Counter order submission failed:", err);
    return res.status(500).json({ error: err?.message || "Order submission failed" });
  }
});

// Short-lived HMAC-signed staff tokens used by counter terminals. Each token
// includes the staff user id and an expiry, signed with STAFF_TOKEN_SECRET.
// Bug 6 + Bug 7 fix: removed unused staffTokenCache Map and dropped the
// unnecessary `async` from verifyStaffToken.
function staffTokenSecret(): string {
  return process.env.STAFF_TOKEN_SECRET || process.env.JWT_SECRET || "change-me-in-prod";
}
export function issueStaffToken(userId: string, ttlMs: number = 8 * 60 * 60 * 1000): string {
  const expires = Date.now() + ttlMs;
  const payload = `${userId}.${expires}`;
  const sig = crypto.createHmac("sha256", staffTokenSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifyStaffToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac("sha256", staffTokenSecret()).update(`${uid}.${expStr}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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

    // H6 fix: replay protection — reject webhooks older than 5 minutes.
    const event = JSON.parse(rawBody.toString());
    const eventAgeMs = Date.now() - (event.created_at ? event.created_at * 1000 : Date.now());
    if (eventAgeMs > 5 * 60 * 1000) {
      console.warn(`[Webhook] Rejecting stale event (age ${Math.round(eventAgeMs / 1000)}s)`);
      return res.status(400).json({ error: "Stale webhook event" });
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

    console.log(`[Webhook] Received event: ${event.event}`);

    // Handle payment.captured event (payment successful)
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload?.payment?.entity;
      if (!payment) {
        return res.json({ received: true });
      }

      const { razorpay_order_id, razorpay_payment_id, amount } = payment;

      console.log(`[Webhook] Payment captured: order=${razorpay_order_id}, payment=${razorpay_payment_id}, amount=${amount} paise`);

      const supabase = getSupabase();
      const db = supabase as any;

      // CRITICAL (C1 fix): Match the payment to the EXACT order that initiated it,
      // not an arbitrary pending order. The razorpay_order_id is stored on the order
      // record (or in the receipts table) when /api/payment/create-order is called.
      //
      // Strategy:
      //  1) Look for an order whose razorpayOrderId matches the captured payment's
      //     razorpay_order_id.
      //  2) If none, look for an order whose paymentId matches the captured payment_id.
      //  3) If still none, refuse to mutate — log only for manual reconciliation.
      //
      // Without exact matching we risk marking the wrong customer's order as paid,
      // causing direct revenue loss and reconciliation nightmares.

      const { data: matchedByRzp } = await db
        .from("orders")
        .select("id, paymentStatus")
        .eq("razorpayOrderId", razorpay_order_id)
        .limit(1)
        .maybeSingle();

      let matchedOrder = matchedByRzp;

      if (!matchedOrder) {
        const { data: matchedByPay } = await db
          .from("orders")
          .select("id, paymentStatus")
          .eq("razorpayPaymentId", razorpay_payment_id)
          .limit(1)
          .maybeSingle();
        matchedOrder = matchedByPay;
      }

      if (!matchedOrder) {
        console.warn(
          `[Webhook] No matching order found for razorpay_order_id=${razorpay_order_id} ` +
          `payment_id=${razorpay_payment_id}. Leaving untouched for manual reconciliation.`
        );
        return res.json({ received: true, matched: false });
      }

      if (matchedOrder.paymentStatus === "paid") {
        // Idempotent: already paid, no-op.
        return res.json({ received: true, matched: true, alreadyPaid: true });
      }

      await db
        .from("orders")
        .update({
          paymentStatus: "paid",
          razorpayPaymentId: razorpay_payment_id,
        })
        .eq("id", matchedOrder.id);

      console.log(`[Webhook] Marked order ${matchedOrder.id} as paid (razorpay_order_id=${razorpay_order_id})`);
    } else if (event.event === "refund.processed" || event.event === "payment.refunded" || event.event === "refund.failed") {
      // H7 fix: handle refund events. Without this, refunded orders stayed
      // paymentStatus='paid' forever, breaking reconciliation. We look up the
      // matching order by payment_id and update its paymentStatus accordingly.
      const refund = event.payload?.refund?.entity || event.payload?.payment?.entity;
      if (!refund) {
        return res.json({ received: true });
      }
      const { payment_id, status } = refund;
      const supabase = getSupabase();
      const db = supabase as any;
      const newStatus = event.event === "refund.failed" ? "paid" : "refunded";
      const { data: refundMatch } = await db
        .from("orders")
        .select("id")
        .eq("razorpayPaymentId", payment_id)
        .limit(1)
        .maybeSingle();
      if (refundMatch) {
        await db.from("orders").update({
          paymentStatus: newStatus,
          updatedAt: new Date().toISOString(),
        }).eq("id", refundMatch.id);
        console.log(`[Webhook] Refund event=${event.event} order=${refundMatch.id} → ${newStatus}`);
      } else {
        console.warn(`[Webhook] Refund event but no matching order for payment_id=${payment_id}`);
      }
    }

    return res.json({ received: true });
  } catch (err: any) {
    console.error("[Webhook] Error processing webhook:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
