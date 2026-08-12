import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { getUserIdFromToken, fetchUserProfileByAuthId } from "./authRoutes";
import { awardLoyaltyPoints } from "./loyaltyService";

const router = Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb && SUPABASE_URL && SUPABASE_KEY) _sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb as any;
}

type Source = "zomato" | "swiggy" | "manual" | "other";

const ALLOWED_SOURCES: Source[] = ["zomato", "swiggy", "manual", "other"];

const SOURCE_LABEL: Record<Source, string> = {
  zomato: "Zomato",
  swiggy: "Swiggy",
  manual: "Walk-in",
  other: "Other",
};

// Payment methods available for external orders.
//   Aggregator channels: only 'aggregator' makes sense (the platform pays us).
//   Walk-in / Other: the same cash / UPI / card options the rest of the system uses.
const PAYMENT_FOR_SOURCE: Record<Source, string[]> = {
  zomato: ["aggregator"],
  swiggy: ["aggregator"],
  manual: ["cash", "upi", "card", "counter"],
  other: ["cash", "upi", "card", "counter", "aggregator"],
};

interface AddExternalOrderPayload {
  source: Source;
  aggregatorOrderId?: string;
  customerName?: string;
  customerPhone?: string;
  items: { menuItemId: number; quantity: number; notes?: string }[];
  paymentMethod: "cash" | "upi" | "card" | "counter" | "aggregator";
  notes?: string;
}

async function loadBusinessSettings(db: any) {
  const r: any = await db.execute(sql`SELECT "gstEnabled", "gstRate", "serviceChargePercentage" FROM "businessSettings" LIMIT 1`);
  const row = r?.rows?.[0] || {};
  return {
    gstEnabled: row.gstEnabled === true || row.gstEnabled === "true",
    gstRate: parseFloat(row.gstRate?.toString() || "0") || 0,
    serviceChargePercentage: parseFloat(row.serviceChargePercentage?.toString() || "0") || 0,
  };
}

async function requireStaffOrAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  const profile = await fetchUserProfileByAuthId(userId).catch(() => null);
  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    res.status(403).json({ error: "Staff or admin access required" });
    return false;
  }
  return true;
}

function sanitisePhone(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/[^0-9]/g, "").slice(0, 15);
}

async function findExistingWallet(db: any, phone: string): Promise<{ id: number; customerName: string | null; lifetimeEarned: number } | null> {
  if (!phone) return null;
  const r: any = await db.execute(sql`
    SELECT id, "customerName", "lifetimeEarned"
    FROM "loyaltyWallets"
    WHERE "customerPhone" = ${phone}
    LIMIT 1
  `);
  const row = r?.rows?.[0];
  return row ? { id: row.id, customerName: row.customerName, lifetimeEarned: parseFloat(row.lifetimeEarned?.toString() || "0") } : null;
}

// POST /api/aggregator/orders — log a new external order (Add External Order).
router.post("/api/aggregator/orders", async (req: Request, res: Response) => {
  try {
    if (!(await requireStaffOrAdmin(req, res))) return;

    const body = req.body as AddExternalOrderPayload;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Invalid request body" });
    }
    if (!ALLOWED_SOURCES.includes(body.source)) {
      return res.status(400).json({ error: `source must be one of: ${ALLOWED_SOURCES.join(", ")}` });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: "At least one menu item is required" });
    }
    if (!PAYMENT_FOR_SOURCE[body.source].includes(body.paymentMethod)) {
      return res.status(400).json({
        error: `paymentMethod "${body.paymentMethod}" is not valid for ${SOURCE_LABEL[body.source]} orders. Allowed: ${PAYMENT_FOR_SOURCE[body.source].join(", ")}`,
      });
    }
    const customerPhone = sanitisePhone(body.customerPhone);
    if (customerPhone && !/^\d{10,15}$/.test(customerPhone)) {
      return res.status(400).json({ error: "customerPhone must be 10-15 digits" });
    }
    if (body.customerName && body.customerName.length > 128) {
      return res.status(400).json({ error: "customerName too long (max 128 chars)" });
    }

    const cleanItems: Array<{ menuItemId: number; quantity: number; notes: string }> = [];
    for (const it of body.items) {
      const mid = parseInt(String(it.menuItemId ?? ""), 10);
      const qty = parseInt(String(it.quantity ?? ""), 10);
      if (!Number.isFinite(mid) || mid <= 0) {
        return res.status(400).json({ error: `Invalid menuItemId: ${it.menuItemId}` });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for item ${mid}: ${it.quantity}` });
      }
      const note = (it.notes || "").toString().slice(0, 240);
      const prev = cleanItems.find((x) => x.menuItemId === mid);
      if (prev) {
        prev.quantity += qty;
        if (note && !prev.notes) prev.notes = note;
      } else {
        cleanItems.push({ menuItemId: mid, quantity: qty, notes: note });
      }
    }
    const menuIds = cleanItems.map((x) => x.menuItemId);

    const db = (await getDb()) as any;
    if (!db) return res.status(503).json({ error: "Database unavailable" });

    const menuRes: any = await db.execute(sql`
      SELECT id, name, price, "isAvailable", "categoryId"
      FROM "menuItems"
      WHERE id = ANY(${menuIds})
    `);
    const menuRows: any[] = menuRes?.rows || [];
    if (menuRows.length !== menuIds.length) {
      const found = new Set(menuRows.map((r) => r.id));
      const missing = menuIds.filter((id) => !found.has(id));
      return res.status(400).json({ error: `Menu item(s) not found: ${missing.join(", ")}` });
    }
    const menuById = new Map<number, any>(menuRows.map((r) => [r.id, r]));
    const unavailable = menuRows.filter((r) => r.isAvailable === false);
    if (unavailable.length > 0) {
      return res.status(400).json({
        error: `Menu item(s) not available: ${unavailable.map((r) => r.name).join(", ")}`,
      });
    }

    const existingWallet = customerPhone ? await findExistingWallet(db, customerPhone) : null;
    const resolvedCustomerName = (body.customerName?.trim() || existingWallet?.customerName || "") || null;

    let subtotal = 0;
    for (const { menuItemId, quantity } of cleanItems as any) {
      const price = parseFloat(menuById.get(menuItemId).price.toString());
      subtotal += price * quantity;
    }

    const settings = await loadBusinessSettings(db);
    const scAmount = subtotal * (settings.serviceChargePercentage / 100);
    const taxable = settings.gstEnabled ? subtotal + scAmount : 0;
    const taxAmount = taxable * (settings.gstRate / 100);
    const total = +(subtotal + scAmount + taxAmount).toFixed(2);

    let orderNumber: number | null = null;
    try {
      const r: any = await db.execute(sql`SELECT get_next_order_number() AS n`);
      const n = r?.rows?.[0]?.n;
      if (Number.isFinite(parseInt(n, 10))) orderNumber = parseInt(n, 10);
    } catch {}
    if (orderNumber === null) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const r: any = await db.execute(sql`SELECT COALESCE(MAX("orderNumber"), 1000) AS n FROM orders`);
        orderNumber = parseInt(r?.rows?.[0]?.n || "1001", 10);
        break;
      }
    }

    const submissionId = `EXT-${body.source.toUpperCase()}-${Date.now()}-${nanoidLite()}`;
    const deviceToken = `external-${body.source}`;

    const tableLabel = `External (${SOURCE_LABEL[body.source]})`;
    const tableRes: any = await db.execute(sql`
      INSERT INTO tables (label, "tableCode", capacity, "isActive", "createdAt")
      VALUES (${tableLabel}, ${`EXT-${body.source}-${Date.now()}`}, 1, true, NOW())
      ON CONFLICT ("tableCode") DO NOTHING
      RETURNING id
    `);
    let virtualTableId = tableRes?.rows?.[0]?.id;
    if (!virtualTableId) {
      const existing: any = await db.execute(sql`SELECT id FROM tables WHERE label = ${tableLabel} LIMIT 1`);
      virtualTableId = existing?.rows?.[0]?.id;
    }

    const sessionRes: any = await db.execute(sql`
      INSERT INTO sessions ("tableId", status, "customerName", "customerPhone",
                            "subtotal", "taxAmount", "serviceCharge", "discountAmount", "finalTotal",
                            "createdAt", "lastActivityAt", "settledAt")
      VALUES (${virtualTableId}, 'closed', ${resolvedCustomerName}, ${customerPhone || null},
              ${subtotal.toString()}, ${taxAmount.toString()}, ${scAmount.toString()}, 0, ${total.toString()},
              NOW(), NOW(), NOW())
      RETURNING id
    `);
    const sessionId = sessionRes?.rows?.[0]?.id;

    const orderRes: any = await db.execute(sql`
      INSERT INTO orders ("sessionId", "submissionId", "deviceToken", "orderStatus", "orderNumber",
                          "paymentMethod", "paymentStatus",
                          "customerName", "customerPhone",
                          "orderSource", "aggregatorOrderId",
                          "finalTotalAfterDiscount",
                          "submittedAt", "updatedAt")
      VALUES (${sessionId}, ${submissionId}, ${deviceToken}, 'delivered', ${orderNumber},
              ${body.paymentMethod}, 'paid',
              ${resolvedCustomerName}, ${customerPhone || null},
              ${body.source}, ${body.aggregatorOrderId?.trim() || null},
              ${total.toString()}, NOW(), NOW())
      RETURNING id, "orderNumber", "orderSource", "aggregatorOrderId", "customerName", "customerPhone",
                "paymentMethod", "paymentStatus", "finalTotalAfterDiscount", "submittedAt"
    `);
    const newOrder = orderRes?.rows?.[0];
    if (!newOrder) throw new Error("Failed to insert order");

    for (const { menuItemId, quantity, notes } of cleanItems) {
      const mi = menuById.get(menuItemId);
      const price = parseFloat(mi.price.toString());
      await db.execute(sql`
        INSERT INTO "orderItems" ("orderId", "menuItemId", quantity, "priceAtOrderTime", "variantSelections", notes, "createdAt")
        VALUES (${newOrder.id}, ${menuItemId}, ${quantity}, ${price.toString()}, ${JSON.stringify([])}, ${notes || null}, NOW())
      `);
    }

    try {
      const { deductInventoryForOrder } = await import("./recipeRoutes");
      const itemsForDeduction = Array.from(cleanItems).map((it) => ({
        menuItemId: it.menuItemId,
        quantity: it.quantity,
      }));
      const alerts = await deductInventoryForOrder(db, itemsForDeduction, newOrder.id);
      if (alerts.length > 0) {
        console.log(`[External] Order #${orderNumber} low-stock:`, alerts.map((a: any) => a.inventoryName).join(", "));
      }
    } catch (invErr) {
      console.error("[External] inventory deduction failed (non-fatal):", invErr);
    }

    let loyaltyResult = { earned: 0, totalPoints: 0, milestoneReached: false, spinsAwarded: 0 };
    if (customerPhone && subtotal > 0) {
      try {
        loyaltyResult = await awardLoyaltyPoints(customerPhone, resolvedCustomerName || undefined, subtotal, newOrder.id);
        if (loyaltyResult.earned > 0) {
          await db.execute(sql`
            UPDATE orders SET "loyaltyPointsEarned" = ${loyaltyResult.earned},
                             "loyaltyAwardedAt" = NOW()
            WHERE id = ${newOrder.id}
          `);
        }
      } catch (loyErr) {
        console.error("[External] loyalty award failed (non-fatal):", loyErr);
      }
    }

    try {
      const host = req.get("host");
      const proto = req.protocol;
      await fetch(`${proto}://${host}/api/print-kot/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: newOrder.id,
          orderNumber,
          tableLabel: `External (${SOURCE_LABEL[body.source]})`,
          items: Array.from(cleanItems).map((it) => ({
            name: menuById.get(it.menuItemId).name,
            quantity: it.quantity,
            notes: it.notes || body.notes || "",
          })),
        }),
      }).catch(() => undefined);
    } catch (printErr) {
      console.warn("[External] auto KOT failed:", printErr);
    }

    res.json({
      success: true,
      orderId: newOrder.id,
      orderNumber,
      sessionId,
      source: newOrder.orderSource,
      customerPhone: newOrder.customerPhone,
      customerName: newOrder.customerName,
      existingCustomer: !!existingWallet,
      subtotal: +subtotal.toFixed(2),
      serviceCharge: +scAmount.toFixed(2),
      taxAmount: +taxAmount.toFixed(2),
      total,
      loyaltyPointsEarned: loyaltyResult.earned,
      loyaltyTotalPoints: loyaltyResult.totalPoints,
      loyaltyMilestoneReached: loyaltyResult.milestoneReached,
      spinsAwarded: loyaltyResult.spinsAwarded,
      items: Array.from(cleanItems).map((it) => ({
        menuItemId: it.menuItemId,
        name: menuById.get(it.menuItemId).name,
        quantity: it.quantity,
        price: parseFloat(menuById.get(it.menuItemId).price.toString()),
        lineTotal: +(parseFloat(menuById.get(it.menuItemId).price.toString()) * it.quantity).toFixed(2),
        notes: it.notes || null,
      })),
    });
  } catch (err: any) {
    console.error("[External Order] create error:", err);
    res.status(500).json({ error: err.message || "Failed to log external order" });
  }
});

// GET /api/aggregator/orders — list recent external orders (Supabase REST).
router.get("/api/aggregator/orders", async (req: Request, res: Response) => {
  try {
    if (!(await requireStaffOrAdmin(req, res))) return;
    const client = sb();
    if (!client) return res.status(503).json({ error: "Database unavailable" });
    const source = (req.query.source as string) || "";
    const sinceParam = req.query.since as string | undefined;
    const limit = Math.max(1, Math.min(200, parseInt((req.query.limit as string) || "100", 10) || 100));
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    let q = client
      .from("orders")
      .select("id, orderNumber, orderSource, aggregatorOrderId, customerName, customerPhone, paymentMethod, paymentStatus, finalTotalAfterDiscount, submittedAt, orderStatus, loyaltyPointsEarned")
      .neq("orderSource", "direct")
      .gte("submittedAt", since.toISOString())
      .order("submittedAt", { ascending: false })
      .limit(limit);
    if (ALLOWED_SOURCES.includes(source as Source)) {
      q = q.eq("orderSource", source);
    }
    const { data: rows, error } = await q;
    if (error) {
      console.error("[External Order] list supabase error:", error);
      return res.status(500).json({ error: "Failed to list external orders" });
    }
    const orders = rows || [];

    if (orders.length > 0) {
      const ids = orders.map((r: any) => r.id);
      const { data: items } = await client
        .from("orderItems")
        .select("orderId, menuItemId, quantity, priceAtOrderTime, notes, menuItems(name)")
        .in("orderId", ids)
        .order("id", { ascending: true });
      const itemsByOrder = new Map<number, any[]>();
      for (const it of items || []) {
        if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
        itemsByOrder.get(it.orderId)!.push({
          menuItemId: it.menuItemId,
          quantity: it.quantity,
          priceAtOrderTime: it.priceAtOrderTime,
          notes: it.notes,
          menuItemName: it.menuItems?.name || null,
        });
      }
      for (const row of orders) {
        (row as any).items = itemsByOrder.get(row.id) || [];
      }
    }
    res.json(orders);
  } catch (err: any) {
    console.error("[External Order] list error:", err);
    res.status(500).json({ error: "Failed to list external orders" });
  }
});

// GET /api/aggregator/orders/:id — full detail (Supabase REST).
router.get("/api/aggregator/orders/:id", async (req: Request, res: Response) => {
  try {
    if (!(await requireStaffOrAdmin(req, res))) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid order id" });
    }
    const client = sb();
    if (!client) return res.status(503).json({ error: "Database unavailable" });

    const { data: order, error } = await client
      .from("orders")
      .select("*, sessions(subtotal, taxAmount, serviceCharge, discountAmount)")
      .eq("id", id)
      .neq("orderSource", "direct")
      .maybeSingle();
    if (error) {
      console.error("[External Order] detail supabase error:", error);
      return res.status(500).json({ error: "Failed to load external order" });
    }
    if (!order) return res.status(404).json({ error: "External order not found" });

    const { data: items } = await client
      .from("orderItems")
      .select("*, menuItems(name, price)")
      .eq("orderId", id)
      .order("id", { ascending: true });

    const mapped = (items || []).map((it: any) => ({
      ...it,
      menuItemName: it.menuItems?.name || null,
      menuItemCurrentPrice: it.menuItems?.price ?? null,
    }));
    (order as any).items = mapped;
    const sess = (order as any).sessions;
    if (sess) {
      order.sessionSubtotal = sess.subtotal;
      order.sessionTax = sess.taxAmount;
      order.sessionSC = sess.serviceCharge;
      order.sessionDiscount = sess.discountAmount;
      delete order.sessions;
    }
    res.json(order);
  } catch (err: any) {
    console.error("[External Order] detail error:", err);
    res.status(500).json({ error: "Failed to load external order" });
  }
});

// DELETE /api/aggregator/orders/:id — cancel an external order (admin only).
// NOTE: write path — still uses drizzle getDb() (works when DB reachable).
router.delete("/api/aggregator/orders/:id", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const profile = await fetchUserProfileByAuthId(userId).catch(() => null);
    if (!profile || profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required to cancel external orders" });
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid order id" });
    }
    const db = (await getDb()) as any;
    if (!db) return res.status(503).json({ error: "Database unavailable" });

    const orderRes: any = await db.execute(sql`
      SELECT id, "orderStatus", "paymentStatus" FROM orders
      WHERE id = ${id} AND "orderSource" != 'direct'
    `);
    const order = orderRes?.rows?.[0];
    if (!order) return res.status(404).json({ error: "External order not found" });
    if (order.orderStatus === "cancelled") {
      return res.json({ success: true, alreadyCancelled: true });
    }

    try {
      const itemsRes: any = await db.execute(sql`
        SELECT "menuItemId", quantity FROM "orderItems" WHERE "orderId" = ${id} AND "menuItemId" IS NOT NULL
      `);
      const items = itemsRes?.rows || [];
      for (const it of items) {
        await db.execute(sql`
          UPDATE "inventoryItems"
          SET "currentStock" = ("currentStock" + ${it.quantity})::numeric,
              "updatedAt" = NOW()
          WHERE "id" IN (
            SELECT "inventoryItemId" FROM recipes WHERE "menuItemId" = ${it.menuItemId}
          )
        `);
      }
    } catch (invErr) {
      console.error("[External Order] inventory reversal failed (non-fatal):", invErr);
    }

    await db.execute(sql`
      UPDATE orders SET "orderStatus" = 'cancelled', "updatedAt" = NOW() WHERE id = ${id}
    `);
    res.json({ success: true, orderId: id });
  } catch (err: any) {
    console.error("[External Order] cancel error:", err);
    res.status(500).json({ error: "Failed to cancel external order" });
  }
});

// GET /api/aggregator/stats — counts + revenue per source (Supabase REST).
router.get("/api/aggregator/stats", async (req: Request, res: Response) => {
  try {
    if (!(await requireStaffOrAdmin(req, res))) return;
    const client = sb();
    if (!client) return res.status(503).json({ error: "Database unavailable" });
    const sinceParam = req.query.since as string | undefined;
    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data: orders, error } = await client
      .from("orders")
      .select("id, orderSource, finalTotalAfterDiscount, submittedAt")
      .gte("submittedAt", since.toISOString())
      .limit(2000);
    if (error) {
      console.error("[External Order] stats supabase error:", error);
      return res.status(500).json({ error: "Failed to fetch external stats" });
    }

    const stats: Record<string, { count: number; revenue: number; avgOrderValue: number }> = {
      direct: { count: 0, revenue: 0, avgOrderValue: 0 },
      zomato: { count: 0, revenue: 0, avgOrderValue: 0 },
      swiggy: { count: 0, revenue: 0, avgOrderValue: 0 },
      manual: { count: 0, revenue: 0, avgOrderValue: 0 },
      other: { count: 0, revenue: 0, avgOrderValue: 0 },
    };
    const revenueBySource: Record<string, number> = {};
    for (const o of orders || []) {
      const src = o.orderSource || "direct";
      if (!stats[src]) stats[src] = { count: 0, revenue: 0, avgOrderValue: 0 };
      stats[src].count += 1;
      revenueBySource[src] = (revenueBySource[src] || 0) + (Number(o.finalTotalAfterDiscount) || 0);
    }
    for (const src of Object.keys(stats)) {
      stats[src].revenue = +(revenueBySource[src] || 0).toFixed(2);
      stats[src].avgOrderValue = stats[src].count > 0 ? +(stats[src].revenue / stats[src].count).toFixed(2) : 0;
    }

    // Top items per source for the same window.
    const orderIds = (orders || []).map((o: any) => o.id);
    const itemsBySource: Record<string, any[]> = {};
    if (orderIds.length > 0) {
      const { data: items } = await client
        .from("orderItems")
        .select("orderId, menuItemId, quantity, priceAtOrderTime, menuItems(name)")
        .in("orderId", orderIds);
      const orderSourceMap = new Map<number, string>();
      for (const o of orders || []) orderSourceMap.set(o.id, o.orderSource || "direct");

      const grouped = new Map<string, { menuItemId: number; name: string; quantity: number; revenue: number; _src: string }>();
      for (const it of items || []) {
        const src = orderSourceMap.get(it.orderId) || "direct";
        if (src === "direct") continue;
        const key = `${src}::${it.menuItemId}`;
        const cur = grouped.get(key);
        const qty = Number(it.quantity) || 0;
        const rev = qty * (Number(it.priceAtOrderTime) || 0);
        if (cur) {
          cur.quantity += qty;
          cur.revenue += rev;
        } else {
          grouped.set(key, {
            menuItemId: it.menuItemId,
            name: it.menuItems?.name || `Item #${it.menuItemId}`,
            quantity: qty,
            revenue: rev,
            _src: src,
          });
        }
      }
      const sorted = Array.from(grouped.values()).sort((a, b) => b.quantity - a.quantity);
      for (const v of sorted) {
        v.revenue = +v.revenue.toFixed(2);
        const { _src, ...rest } = v;
        if (!itemsBySource[_src]) itemsBySource[_src] = [];
        itemsBySource[_src].push(rest);
      }
    }

    res.json({ since: since.toISOString(), bySource: stats, topItemsBySource: itemsBySource });
  } catch (err: any) {
    console.error("[External Order] stats error:", err);
    res.status(500).json({ error: "Failed to fetch external stats" });
  }
});

// GET /api/aggregator/customers/lookup?phone=... (Supabase REST).
router.get("/api/aggregator/customers/lookup", async (req: Request, res: Response) => {
  try {
    if (!(await requireStaffOrAdmin(req, res))) return;
    const phone = sanitisePhone((req.query.phone as string) || "");
    if (!phone) return res.json({ found: false });
    const client = sb();
    if (!client) return res.status(503).json({ error: "Database unavailable" });

    const { data } = await client
      .from("loyaltyWallets")
      .select("id, customerName, lifetimeEarned")
      .eq("customerPhone", phone)
      .limit(1);
    const wallet = (data || [])[0];
    if (!wallet) return res.json({ found: false });
    res.json({
      found: true,
      walletId: wallet.id,
      customerName: wallet.customerName,
      lifetimeEarned: Number(wallet.lifetimeEarned) || 0,
    });
  } catch (err: any) {
    console.error("[External Order] customer lookup error:", err);
    res.status(500).json({ error: "Failed to lookup customer" });
  }
});

function nanoidLite(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export { ALLOWED_SOURCES, PAYMENT_FOR_SOURCE, SOURCE_LABEL };
export default router;
