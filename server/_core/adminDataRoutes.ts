import { Router, Request, Response } from "express";
import { parsePaginationParams, encodeCursor } from "./pagination";
import { getDb } from "../db";
import { sessions, tables, orders, orderItems, menuItems, feedback } from "../../drizzle/schema";
import { eq, and, desc, gte, sql, inArray } from "drizzle-orm";
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
 * GET /api/admin/settled-bills?cursor=...&limit=20
 * Cursor-paginated settled bills from the last 30 days.
 */
router.get("/api/admin/settled-bills", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ data: [], nextCursor: null, hasMore: false });

    const { limit, cursor } = parsePaginationParams(req.query as Record<string, any>);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const fetchLimit = limit + 1;
    let query = db
      .select({
        id: sessions.id,
        tableId: sessions.tableId,
        subtotal: sessions.subtotal,
        serviceCharge: sessions.serviceCharge,
        taxAmount: sessions.taxAmount,
        finalTotal: sessions.finalTotal,
        settledAt: sessions.settledAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.status, "settled"),
          gte(sessions.settledAt, thirtyDaysAgo),
          cursor
            ? sql`(${sessions.settledAt}, ${sessions.id}) < (${cursor.settledAt}, ${cursor.id})`
            : undefined
        )
      )
      .orderBy(desc(sessions.settledAt), desc(sessions.id))
      .limit(fetchLimit);

    const results = await query;
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    // Fetch table labels in one query
    const tableIds = Array.from(new Set(data.map(s => s.tableId)));
    const tablesData = tableIds.length > 0
      ? await db.select({ id: tables.id, label: tables.label }).from(tables).where(inArray(tables.id, tableIds))
      : [];
    const tableLabelMap = new Map(tablesData.map(t => [t.id, t.label]));

    const shaped = data.map(s => ({
      id: s.id,
      tableLabel: tableLabelMap.get(s.tableId) || "Unknown",
      subtotal: parseFloat(s.subtotal?.toString() || "0"),
      serviceCharge: parseFloat(s.serviceCharge?.toString() || "0"),
      taxAmount: parseFloat(s.taxAmount?.toString() || "0"),
      finalTotal: parseFloat(s.finalTotal?.toString() || "0"),
      settledAt: s.settledAt,
      createdAt: s.createdAt,
    }));

    const last = data[data.length - 1];
    res.json({
      data: shaped,
      nextCursor: hasMore && last?.settledAt
        ? encodeCursor({ settledAt: String(last.settledAt), id: last.id })
        : null,
      hasMore,
    });
  } catch (err: any) {
    console.error("Settled bills query failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/settled-bills/count
 * Returns total count of settled bills in last 30 days (for stats).
 */
router.get("/api/admin/settled-bills/count", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ count: 0 });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(sessions)
      .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, thirtyDaysAgo)));

    res.json({ count: result[0]?.count ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/settled-bills/today-revenue
 * Returns today's total revenue (small query, no pagination needed).
 */
router.get("/api/admin/settled-bills/today-revenue", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ total: 0 });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(${sessions.finalTotal}::numeric), 0)` })
      .from(sessions)
      .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, todayStart)));

    res.json({ total: Number(result[0]?.total ?? 0) });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/feedback?cursor=...&limit=20
 * Cursor-paginated feedback list.
 */
router.get("/api/admin/feedback", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ data: [], nextCursor: null, hasMore: false });

    const { limit, cursor } = parsePaginationParams(req.query as Record<string, any>);

    const fetchLimit = limit + 1;
    let query = db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt), desc(feedback.id));

    if (cursor) {
      query = query.where(
        sql`(${feedback.createdAt}, ${feedback.id}) < (${cursor.createdAt}, ${cursor.id})`
      ) as any;
    }

    const results = await query.limit(fetchLimit);
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const last = data[data.length - 1];

    res.json({
      data,
      nextCursor: hasMore && last?.createdAt
        ? encodeCursor({ createdAt: String(last.createdAt), id: last.id })
        : null,
      hasMore,
    });
  } catch (err: any) {
    console.error("Feedback query failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/feedback/stats
 * Returns aggregate feedback stats (average, distribution, total).
 */
router.get("/api/admin/feedback/stats", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ average: 0, total: 0, distribution: [] });

    const [avgResult] = await db
      .select({ avg: sql<number>`COALESCE(AVG(${feedback.rating}), 0)` })
      .from(feedback);

    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(feedback);

    const distResults = await db
      .select({ rating: feedback.rating, count: sql<number>`COUNT(*)::int` })
      .from(feedback)
      .groupBy(feedback.rating);

    const distribution = [5, 4, 3, 2, 1].map(r => ({
      rating: r,
      count: distResults.find(d => d.rating === r)?.count ?? 0,
    }));

    res.json({
      average: Math.round((avgResult?.avg ?? 0) * 10) / 10,
      total: countResult?.count ?? 0,
      distribution,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/active-tables
 * Returns active (open) tables with order count, item count, and current total.
 */
router.get("/api/admin/active-tables", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json([]);

    // Get all open sessions joined with table info
    const openSessions = await db
      .select({
        sessionId: sessions.id,
        tableId: sessions.tableId,
        tableLabel: tables.label,
        tableCode: tables.tableCode,
        createdAt: sessions.createdAt,
        lastActivityAt: sessions.lastActivityAt,
        subtotal: sessions.subtotal,
        taxAmount: sessions.taxAmount,
        serviceCharge: sessions.serviceCharge,
        finalTotal: sessions.finalTotal,
      })
      .from(sessions)
      .innerJoin(tables, eq(sessions.tableId, tables.id))
      .where(eq(sessions.status, "open"))
      .orderBy(desc(sessions.lastActivityAt));

    if (openSessions.length === 0) return res.json([]);

    // Get order counts and item counts per session
    const sessionIds = openSessions.map(s => s.sessionId);
    const orderStats = await db
      .select({
        sessionId: orders.sessionId,
        orderCount: sql<number>`COUNT(DISTINCT ${orders.id})::int`,
        itemCount: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)::int`,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(inArray(orders.sessionId, sessionIds))
      .groupBy(orders.sessionId);

    const statsMap = new Map(orderStats.map(s => [s.sessionId, s]));

    const result = openSessions.map(s => {
      const stats = statsMap.get(s.sessionId);
      const minsActive = Math.round((Date.now() - new Date(s.lastActivityAt).getTime()) / 60000);
      return {
        sessionId: s.sessionId,
        tableLabel: s.tableLabel,
        tableCode: s.tableCode,
        orderCount: stats?.orderCount ?? 0,
        itemCount: stats?.itemCount ?? 0,
        subtotal: parseFloat(s.subtotal?.toString() || "0"),
        taxAmount: parseFloat(s.taxAmount?.toString() || "0"),
        serviceCharge: parseFloat(s.serviceCharge?.toString() || "0"),
        finalTotal: parseFloat(s.finalTotal?.toString() || "0"),
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        minsActive,
      };
    });

    res.json(result);
  } catch (err: any) {
    console.error("Active tables query failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/admin/popular-items
 * Returns top menu items by quantity sold in the last 30 days.
 */
router.get("/api/admin/popular-items", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json([]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const aggregated = await db
      .select({
        menuItemId: orderItems.menuItemId,
        count: sql<number>`sum(${orderItems.quantity})`,
        revenue: sql<number>`sum(${orderItems.priceAtOrderTime}::numeric * ${orderItems.quantity})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(gte(orders.submittedAt, thirtyDaysAgo))
      .groupBy(orderItems.menuItemId)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(10);

    if (aggregated.length === 0) return res.json([]);

    const menuItemIds = aggregated.map(r => r.menuItemId);
    const menuResult = await db
      .select({ id: menuItems.id, name: menuItems.name })
      .from(menuItems)
      .where(inArray(menuItems.id, menuItemIds));
    const nameMap = new Map(menuResult.map(m => [m.id, m.name]));

    res.json(aggregated.map(r => ({
      menuItemId: r.menuItemId,
      name: nameMap.get(r.menuItemId) || `Item #${r.menuItemId}`,
      count: Number(r.count),
      revenue: Number(r.revenue),
    })));
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
