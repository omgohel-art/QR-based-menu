import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { sessions, tables, menuItems, categories } from "../../drizzle/schema";
import { eq, desc, gte, and } from "drizzle-orm";
import { getUserIdFromToken } from "./authRoutes";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
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

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

/** GET /api/admin/export/menu.csv */
router.get("/api/admin/export/menu.csv", async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const db = await getDb();
  if (!db) return res.status(503).send("Database unavailable");

  const cats = await db.select().from(categories);
  const items = await db.select().from(menuItems);
  const catMap = new Map(cats.map((c) => [c.id, c.name]));

  const rows = items.map((item) => ({
    category: catMap.get(item.categoryId) || "",
    name: item.name,
    description: item.description || "",
    price: item.price,
    foodType: item.foodType || "veg",
    isAvailable: item.isAvailable ? "yes" : "no",
    badge: item.badge || "",
  }));

  const csv = toCsv(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="menu-export.csv"');
  res.send("\uFEFF" + csv);
});

/** GET /api/admin/export/orders.csv?days=30 */
router.get("/api/admin/export/orders.csv", async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const db = await getDb();
  if (!db) return res.status(503).send("Database unavailable");

  const settled = await db
    .select({
      id: sessions.id,
      tableId: sessions.tableId,
      subtotal: sessions.subtotal,
      taxAmount: sessions.taxAmount,
      serviceCharge: sessions.serviceCharge,
      finalTotal: sessions.finalTotal,
      settledAt: sessions.settledAt,
      status: sessions.status,
    })
    .from(sessions)
    .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, since)))
    .orderBy(desc(sessions.settledAt));

  const tableRows = await db.select({ id: tables.id, label: tables.label }).from(tables);
  const tableMap = new Map(tableRows.map((t) => [t.id, t.label]));

  const rows = settled.map((s) => ({
    sessionId: s.id,
    table: tableMap.get(s.tableId) || s.tableId,
    settledAt: s.settledAt ? new Date(s.settledAt).toISOString() : "",
    subtotal: s.subtotal,
    tax: s.taxAmount,
    serviceCharge: s.serviceCharge,
    total: s.finalTotal,
    status: s.status,
  }));

  const csv = toCsv(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="orders-${days}d.csv"`);
  res.send("\uFEFF" + csv);
});

export default router;
