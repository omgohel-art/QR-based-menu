import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { sessions, tables, orders, orderItems, menuItems, orderHistories, categories } from "../../drizzle/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";
import { getUserIdFromToken } from "./authRoutes";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = getUserIdFromToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  try {
    const API_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
    });
    const profiles = await r.json();
    if (!profiles?.[0] || profiles[0].role !== "admin") {
      res.status(403).json({ error: "Admin access required" }); return null;
    }
    return userId;
  } catch {
    res.status(500).json({ error: "Internal server error" }); return null;
  }
}

function parseDateRange(query: any): { start: Date; end: Date } {
  const end = query.end ? new Date(query.end + "T23:59:59") : new Date();
  const start = query.start ? new Date(query.start + "T00:00:00") : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * GET /api/admin/analytics/revenue?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
router.get("/api/admin/analytics/revenue", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;
    const db = await getDb();
    if (!db) return res.json({});

    const { start, end } = parseDateRange(req.query);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const allSettled = await db.select({
      id: sessions.id, tableId: sessions.tableId, subtotal: sessions.subtotal,
      taxAmount: sessions.taxAmount, serviceCharge: sessions.serviceCharge,
      discountAmount: sessions.discountAmount, finalTotal: sessions.finalTotal,
      settledAt: sessions.settledAt, settledBy: sessions.settledBy,
    }).from(sessions)
      .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, start), lte(sessions.settledAt, end)))
      .orderBy(desc(sessions.settledAt));

    const tableIds = [...new Set(allSettled.map(s => s.tableId))];
    const tablesData = tableIds.length > 0
      ? await db.select({ id: tables.id, label: tables.label }).from(tables).where(inArray(tables.id, tableIds))
      : [];
    const tableLabelMap = new Map(tablesData.map(t => [t.id, t.label]));

    const todayRevenue = allSettled.filter(s => new Date(s.settledAt) >= todayStart)
      .reduce((sum, s) => sum + parseFloat(s.finalTotal?.toString() || "0"), 0);
    const yesterdayRevenue = allSettled.filter(s => {
      const d = new Date(s.settledAt);
      return d >= yesterdayStart && d < todayStart;
    }).reduce((sum, s) => sum + parseFloat(s.finalTotal?.toString() || "0"), 0);
    const totalRevenue = allSettled.reduce((sum, s) => sum + parseFloat(s.finalTotal?.toString() || "0"), 0);

    // Revenue by hour (today)
    const hourlyRev: Record<number, number> = {};
    allSettled.filter(s => new Date(s.settledAt) >= todayStart).forEach(s => {
      const h = new Date(s.settledAt).getHours();
      hourlyRev[h] = (hourlyRev[h] || 0) + parseFloat(s.finalTotal?.toString() || "0");
    });

    // Revenue by day
    const dailyRev: Record<string, number> = {};
    allSettled.forEach(s => {
      const key = new Date(s.settledAt).toISOString().slice(0, 10);
      dailyRev[key] = (dailyRev[key] || 0) + parseFloat(s.finalTotal?.toString() || "0");
    });

    // Revenue by table
    const tableRev: Record<string, number> = {};
    allSettled.forEach(s => {
      const label = tableLabelMap.get(s.tableId) || "Unknown";
      tableRev[label] = (tableRev[label] || 0) + parseFloat(s.finalTotal?.toString() || "0");
    });

    // Yearly revenue
    const yearlyRev: Record<string, number> = {};
    allSettled.forEach(s => {
      const key = new Date(s.settledAt).getFullYear().toString();
      yearlyRev[key] = (yearlyRev[key] || 0) + parseFloat(s.finalTotal?.toString() || "0");
    });

    const bills = allSettled.map(s => parseFloat(s.finalTotal?.toString() || "0"));
    const highestBill = bills.length ? Math.max(...bills) : 0;
    const lowestBill = bills.length ? Math.min(...bills) : 0;

    res.json({
      todayRevenue, yesterdayRevenue, totalRevenue,
      hourlyRevenue: Object.entries(hourlyRev).map(([h, v]) => ({ hour: Number(h), revenue: v })),
      dailyRevenue: Object.entries(dailyRev).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date)),
      tableRevenue: Object.entries(tableRev).map(([table, revenue]) => ({ table, revenue })).sort((a, b) => b.revenue - a.revenue),
      yearlyRevenue: Object.entries(yearlyRev).map(([year, revenue]) => ({ year, revenue })),
      highestBill, lowestBill, totalBills: allSettled.length,
      growthPercent: yesterdayRevenue > 0 ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : 0,
    });
  } catch (err) {
    console.error("[Analytics Revenue]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/analytics/orders?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
router.get("/api/admin/analytics/orders", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;
    const db = await getDb();
    if (!db) return res.json({});

    const { start, end } = parseDateRange(req.query);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const allOrders = await db.select({
      id: orders.id, sessionId: orders.sessionId, orderStatus: orders.orderStatus,
      paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus,
      submittedAt: orders.submittedAt, updatedAt: orders.updatedAt,
    }).from(orders)
      .where(and(gte(orders.submittedAt, start), lte(orders.submittedAt, end)))
      .orderBy(desc(orders.submittedAt));

    const todayOrders = allOrders.filter(o => new Date(o.submittedAt) >= todayStart);
    const completed = allOrders.filter(o => o.orderStatus === "delivered");
    const pending = allOrders.filter(o => ["received", "preparing", "ready"].includes(o.orderStatus));
    const cancelled = allOrders.filter(o => o.orderStatus === "cancelled");

    const avgOrderValue = allOrders.length > 0
      ? allOrders.reduce((sum, o) => sum + 1, 0) / allOrders.length : 0;

    // Peak hours
    const hourCount: Record<number, number> = {};
    allOrders.forEach(o => { const h = new Date(o.submittedAt).getHours(); hourCount[h] = (hourCount[h] || 0) + 1; });

    // Peak days
    const dayCount: Record<string, number> = {};
    allOrders.forEach(o => {
      const d = new Date(o.submittedAt).toISOString().slice(0, 10);
      dayCount[d] = (dayCount[d] || 0) + 1;
    });

    // Payment method breakdown
    const paymentMethods: Record<string, number> = {};
    allOrders.forEach(o => { if (o.paymentMethod) paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + 1; });

    // Order status breakdown
    const statusCount: Record<string, number> = {};
    allOrders.forEach(o => { statusCount[o.orderStatus] = (statusCount[o.orderStatus] || 0) + 1; });

    res.json({
      totalOrders: allOrders.length, todayOrders: todayOrders.length,
      completedOrders: completed.length, pendingOrders: pending.length, cancelledOrders: cancelled.length,
      peakHours: Object.entries(hourCount).map(([h, c]) => ({ hour: Number(h), count: c })).sort((a, b) => b.count - a.count),
      peakDays: Object.entries(dayCount).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
      paymentMethods: Object.entries(paymentMethods).map(([m, c]) => ({ method: m, count: c })),
      statusBreakdown: Object.entries(statusCount).map(([s, c]) => ({ status: s, count: c })),
    });
  } catch (err) {
    console.error("[Analytics Orders]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/analytics/tables?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
router.get("/api/admin/analytics/tables", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;
    const db = await getDb();
    if (!db) return res.json({});

    const { start, end } = parseDateRange(req.query);

    const allTables = await db.select().from(tables);
    const allSettled = await db.select({
      id: sessions.id, tableId: sessions.tableId, finalTotal: sessions.finalTotal,
      createdAt: sessions.createdAt, settledAt: sessions.settledAt,
    }).from(sessions)
      .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, start), lte(sessions.settledAt, end)))
      .orderBy(desc(sessions.settledAt));

    const openSessions = await db.select({
      sessionId: sessions.id, tableId: sessions.tableId, createdAt: sessions.createdAt,
      lastActivityAt: sessions.lastActivityAt,
    }).from(sessions).where(eq(sessions.status, "open"));

    const occupied = openSessions.length;
    const free = allTables.length - occupied;

    // Table stats
    const tableStats: Record<string, { sessions: number; revenue: number; totalMins: number }> = {};
    allTables.forEach(t => { tableStats[t.label] = { sessions: 0, revenue: 0, totalMins: 0 }; });

    allSettled.forEach(s => {
      const label = allTables.find(t => t.id === s.tableId)?.label || "Unknown";
      if (!tableStats[label]) tableStats[label] = { sessions: 0, revenue: 0, totalMins: 0 };
      tableStats[label].sessions++;
      tableStats[label].revenue += parseFloat(s.finalTotal?.toString() || "0");
      if (s.settledAt && s.createdAt) {
        tableStats[label].totalMins += Math.round((new Date(s.settledAt).getTime() - new Date(s.createdAt).getTime()) / 60000);
      }
    });

    const tableData = Object.entries(tableStats).map(([label, stats]) => ({
      label, ...stats,
      avgDuration: stats.sessions > 0 ? Math.round(stats.totalMins / stats.sessions) : 0,
      avgRevenue: stats.sessions > 0 ? Math.round(stats.revenue / stats.sessions) : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    const mostOccupied = tableData.length ? tableData.reduce((a, b) => a.sessions > b.sessions ? a : b) : null;
    const leastOccupied = tableData.filter(t => t.sessions > 0).length
      ? tableData.filter(t => t.sessions > 0).reduce((a, b) => a.sessions < b.sessions ? a : b) : null;

    res.json({
      totalTables: allTables.length, occupied, free,
      tableData, mostOccupied: mostOccupied?.label, leastOccupied: leastOccupied?.label,
      avgOccupancyTime: tableData.length ? Math.round(tableData.reduce((s, t) => s + t.avgDuration, 0) / tableData.length) : 0,
    });
  } catch (err) {
    console.error("[Analytics Tables]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/analytics/billing?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
router.get("/api/admin/analytics/billing", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;
    const db = await getDb();
    if (!db) return res.json({});

    const { start, end } = parseDateRange(req.query);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const { orderHistories: oh } = await import("../../drizzle/schema");

    const allBills = await db.select().from(oh)
      .where(and(gte(oh.settledAt, start), lte(oh.settledAt, end)))
      .orderBy(desc(oh.settledAt));

    const todayBills = allBills.filter(b => new Date(b.settledAt) >= todayStart);
    const amounts = allBills.map(b => parseFloat(b.finalTotal?.toString() || "0"));
    const discounts = allBills.map(b => parseFloat(b.discountAmount?.toString() || "0"));
    const taxes = allBills.map(b => parseFloat(b.taxAmount?.toString() || "0"));

    // Payment method breakdown from orders
    const sessionIds = allBills.map(b => b.sessionId);
    const paymentMethods: Record<string, number> = {};
    if (sessionIds.length > 0) {
      const relatedOrders = await db.select({ paymentMethod: orders.paymentMethod })
        .from(orders).where(inArray(orders.sessionId, sessionIds));
      relatedOrders.forEach(o => {
        if (o.paymentMethod) paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + 1;
      });
    }

    res.json({
      totalBills: allBills.length, todayBills: todayBills.length,
      totalRevenue: amounts.reduce((s, v) => s + v, 0),
      avgBillAmount: amounts.length ? amounts.reduce((s, v) => s + v, 0) / amounts.length : 0,
      highestBill: amounts.length ? Math.max(...amounts) : 0,
      lowestBill: amounts.length ? Math.min(...amounts) : 0,
      totalDiscounts: discounts.reduce((s, v) => s + v, 0),
      totalTaxes: taxes.reduce((s, v) => s + v, 0),
      paymentMethods: Object.entries(paymentMethods).map(([m, c]) => ({ method: m, count: c })),
    });
  } catch (err) {
    console.error("[Analytics Billing]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/analytics/products?start=YYYY-MM-DD&end=YYYY-MM-DD
 */
router.get("/api/admin/analytics/products", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;
    const db = await getDb();
    if (!db) return res.json({});

    const { start, end } = parseDateRange(req.query);

    const aggregated = await db.select({
      menuItemId: orderItems.menuItemId,
      count: sql<number>`sum(${orderItems.quantity})`,
      revenue: sql<number>`sum(${orderItems.priceAtOrderTime}::numeric * ${orderItems.quantity})`,
    }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(gte(orders.submittedAt, start), lte(orders.submittedAt, end)))
      .groupBy(orderItems.menuItemId)
      .orderBy(desc(sql`sum(${orderItems.quantity})`));

    const menuItemIds = aggregated.map(r => r.menuItemId);
    const menuData = menuItemIds.length > 0
      ? await db.select({ id: menuItems.id, name: menuItems.name, price: menuItems.price, categoryId: menuItems.categoryId })
          .from(menuItems).where(inArray(menuItems.id, menuItemIds))
      : [];
    const menuMap = new Map(menuData.map(m => [m.id, m]));

    const catIds = [...new Set(menuData.map(m => m.categoryId))];
    const catData = catIds.length > 0
      ? await db.select({ id: categories.id, name: categories.name }).from(categories).where(inArray(categories.id, catIds))
      : [];
    const catMap = new Map(catData.map(c => [c.id, c.name]));

    const items = aggregated.map(r => {
      const m = menuMap.get(r.menuItemId);
      return {
        menuItemId: r.menuItemId,
        name: m?.name || `Item #${r.menuItemId}`,
        count: Number(r.count),
        revenue: Number(r.revenue),
        avgPrice: Number(r.count) > 0 ? Math.round(Number(r.revenue) / Number(r.count)) : 0,
        category: m ? (catMap.get(m.categoryId) || "Uncategorized") : "Unknown",
      };
    });

    // Category performance
    const catPerf: Record<string, { count: number; revenue: number }> = {};
    items.forEach(i => {
      if (!catPerf[i.category]) catPerf[i.category] = { count: 0, revenue: 0 };
      catPerf[i.category].count += i.count;
      catPerf[i.category].revenue += i.revenue;
    });

    res.json({
      items,
      categoryPerformance: Object.entries(catPerf).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.revenue - a.revenue),
      totalItemsSold: items.reduce((s, i) => s + i.count, 0),
      totalItemRevenue: items.reduce((s, i) => s + i.revenue, 0),
    });
  } catch (err) {
    console.error("[Analytics Products]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/analytics/revenue-chart?days=30
 */
router.get("/api/admin/analytics/revenue-chart", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;
    const db = await getDb();
    if (!db) return res.json([]);

    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const settled = await db.select({
      finalTotal: sessions.finalTotal, settledAt: sessions.settledAt,
    }).from(sessions)
      .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, startDate)))
      .orderBy(desc(sessions.settledAt));

    const daily: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      daily[d.toISOString().slice(0, 10)] = 0;
    }
    settled.forEach(s => {
      const key = new Date(s.settledAt).toISOString().slice(0, 10);
      if (daily[key] !== undefined) daily[key] += parseFloat(s.finalTotal?.toString() || "0");
    });

    res.json(Object.entries(daily).map(([date, revenue]) => ({ date, revenue })));
  } catch (err) {
    console.error("[Analytics RevenueChart]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/analytics/table-breakdown
 */
router.get("/api/admin/analytics/table-breakdown", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;
    const db = await getDb();
    if (!db) return res.json([]);

    const allTables = await db.select().from(tables).orderBy(tables.label);

    const openSessions = await db.select({
      sessionId: sessions.id, tableId: sessions.tableId,
      createdAt: sessions.createdAt, lastActivityAt: sessions.lastActivityAt,
      finalTotal: sessions.finalTotal,
    }).from(sessions).where(eq(sessions.status, "open"));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const settledSessions = await db.select({
      tableId: sessions.tableId, finalTotal: sessions.finalTotal,
      createdAt: sessions.createdAt, settledAt: sessions.settledAt,
    }).from(sessions)
      .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, thirtyDaysAgo)));

    const breakdown = allTables.map(t => {
      const active = openSessions.filter(s => s.tableId === t.id);
      const history = settledSessions.filter(s => s.tableId === t.id);
      const totalRevenue = history.reduce((sum, s) => sum + parseFloat(s.finalTotal?.toString() || "0"), 0);
      const activeRevenue = active.reduce((sum, s) => sum + parseFloat(s.finalTotal?.toString() || "0"), 0);
      const avgDuration = history.length
        ? Math.round(history.reduce((sum, s) => {
            if (s.settledAt && s.createdAt) return sum + (new Date(s.settledAt).getTime() - new Date(s.createdAt).getTime()) / 60000;
            return sum;
          }, 0) / history.length)
        : 0;

      return {
        label: t.label, status: t.status,
        isActive: active.length > 0,
        activeSession: active[0] || null,
        sessionCount30d: history.length,
        revenue30d: totalRevenue,
        activeRevenue,
        avgDuration,
      };
    });

    res.json(breakdown);
  } catch (err) {
    console.error("[Analytics TableBreakdown]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
