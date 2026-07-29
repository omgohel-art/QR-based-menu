import { Router, Request, Response } from "express";
import { menuDataCache, settingsCache } from "./cache";
import {
  listCategories,
  listMenuItems,
} from "../db";
import { getDb } from "../db";
import { businessSettings } from "../../drizzle/schema";
import { getUserIdFromToken } from "./authRoutes";

const router = Router();

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const CACHE_TTL_BROWSER_SECONDS = 2 * 60; // 2 minutes for CDN/browser cache

function setCacheHeaders(res: Response): void {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${CACHE_TTL_BROWSER_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`
  );
}

router.get("/api/public/categories", async (_req: Request, res: Response) => {
  const cached = menuDataCache.get("categories");
  if (cached) {
    setCacheHeaders(res);
    return res.json(cached);
  }
  try {
    const db = await getDb();
    if (!db) return res.json([]);
    const data = await listCategories();
    menuDataCache.set("categories", data);
    setCacheHeaders(res);
    res.json(data);
  } catch (err) {
    console.error("[Cache] Failed to fetch categories:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/api/public/menu-items", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.json([]);
    const data = await listMenuItems();
    res.setHeader("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    console.error("[Cache] Failed to fetch menu items:", err);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

router.get("/api/public/business-settings", async (_req: Request, res: Response) => {
  const cached = settingsCache.get("businessSettings");
  if (cached) {
    setCacheHeaders(res);
    return res.json(cached);
  }
  try {
    const db = await getDb();
    if (!db) {
      return res.status(503).json({ error: "Database not available" });
    }
    const data = await db.select().from(businessSettings).limit(1).then((rows) => rows[0] ?? null);
    settingsCache.set("businessSettings", data);
    setCacheHeaders(res);
    res.json(data);
  } catch (err) {
    console.error("[Cache] Failed to fetch business settings:", err);
    res.status(500).json({ error: "Failed to fetch business settings" });
  }
});

router.post("/api/public/invalidate", async (req: Request, res: Response) => {
  const userId = getUserIdFromToken(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const API_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
    });
    const profiles = await r.json();
    if (!profiles?.[0] || profiles[0].role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }

  const { table } = req.body as { table?: string };
  if (!table) {
    menuDataCache.invalidateAll();
    settingsCache.invalidateAll();
  } else if (table === "categories" || table === "menuItems") {
    menuDataCache.invalidateAll();
  } else if (table === "businessSettings") {
    settingsCache.invalidateAll();
  }
  res.json({ invalidated: true });
});

export default router;
