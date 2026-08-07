import { Router, Request, Response } from "express";
import { menuDataCache, settingsCache } from "./cache";
import {
  listCategories,
  listMenuItems,
} from "../db";
import { getDb } from "../db";
import { businessSettings, serviceRequests } from "../../drizzle/schema";
import { getUserIdFromToken } from "./authRoutes";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const CACHE_TTL_BROWSER_SECONDS = 2 * 60; // 2 minutes for CDN/browser cache

function setCacheHeaders(res: Response): void {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${CACHE_TTL_BROWSER_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`
  );
}

function getSupabaseFallback() {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

router.get("/api/public/categories", async (_req: Request, res: Response) => {
  const cached = menuDataCache.get("categories");
  if (cached) {
    setCacheHeaders(res);
    return res.json(cached);
  }
  try {
    const db = await getDb();
    if (!db) {
      // Fallback to Supabase client
      const sb = getSupabaseFallback();
      if (sb) {
        const { data } = await sb.from("categories").select("*").order("displayOrder").order("name");
        menuDataCache.set("categories", data || []);
        setCacheHeaders(res);
        return res.json(data || []);
      }
      return res.json([]);
    }
    const data = await listCategories();
    menuDataCache.set("categories", data);
    setCacheHeaders(res);
    res.json(data);
  } catch (err) {
    console.error("[Cache] Failed to fetch categories:", err);
    try {
      const sb = getSupabaseFallback();
      if (sb) {
        const { data, error: sbErr } = await sb.from("categories").select("*").order("displayOrder").order("name");
        if (sbErr) {
          console.error("[Cache] Supabase fallback error for categories:", sbErr);
        } else {
          menuDataCache.set("categories", data || []);
          setCacheHeaders(res);
          return res.json(data || []);
        }
      }
    } catch (fbErr) {
      console.error("[Cache] Supabase fallback exception for categories:", fbErr);
    }
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/api/public/menu-items", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      // Fallback to Supabase client
      const sb = getSupabaseFallback();
      if (sb) {
        const { data } = await sb.from("menuItems").select("*").order("categoryId").order("displayOrder").order("name");
        res.setHeader("Cache-Control", "no-store");
        return res.json(data || []);
      }
      console.warn("[Public] Menu items: DB not available, returning empty");
      return res.json([]);
    }
    const data = await listMenuItems();
    res.setHeader("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    console.error("[Cache] Failed to fetch menu items:", err);
    // Fallback to Supabase client on error
    try {
      const sb = getSupabaseFallback();
      if (sb) {
        const { data } = await sb.from("menuItems").select("*").order("categoryId").order("displayOrder").order("name");
        res.setHeader("Cache-Control", "no-store");
        return res.json(data || []);
      }
    } catch {}
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

router.get("/api/public/menu-items", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Public] Menu items: DB not available, returning empty");
      return res.json([]);
    }
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

router.post("/api/public/call-waiter", async (req: Request, res: Response) => {
  const { tableCode, requestType, requestLabel } = req.body as {
    tableCode?: unknown;
    requestType?: unknown;
    requestLabel?: unknown;
  };

  if (!tableCode || typeof tableCode !== "string" || !tableCode.trim()) {
    return res.status(400).json({ error: "Table code is required" });
  }
  if (!requestType || typeof requestType !== "string" || !requestType.trim()) {
    return res.status(400).json({ error: "Request type is required" });
  }
  if (!requestLabel || typeof requestLabel !== "string" || !requestLabel.trim()) {
    return res.status(400).json({ error: "Request label is required" });
  }

  const trimmedTableCode = tableCode.trim().slice(0, 32);
  const trimmedRequestType = requestType.trim().slice(0, 32);
  const trimmedRequestLabel = requestLabel.trim().slice(0, 64);
  const allowedTypes = ["waiter", "water", "bill", "clean"];

  if (!allowedTypes.includes(trimmedRequestType)) {
    return res.status(400).json({ error: "Invalid request type" });
  }

  try {
    const db = await getDb();
    if (db) {
      try {
        await db.insert(serviceRequests).values({
          tableCode: trimmedTableCode,
          requestType: trimmedRequestType,
          requestLabel: trimmedRequestLabel,
        });
      } catch (dbError) {
        console.error("[CallWaiter] DB insert failed, trying Supabase fallback:", dbError);
        const sb = getSupabaseFallback();
        if (!sb) {
          throw dbError;
        }
        const { error } = await sb.from("serviceRequests").insert({
          tableCode: trimmedTableCode,
          requestType: trimmedRequestType,
          requestLabel: trimmedRequestLabel,
        });
        if (error) {
          console.error("[CallWaiter] Supabase fallback insert error:", error);
          throw error;
        }
      }
    } else {
      const sb = getSupabaseFallback();
      if (!sb) {
        return res.status(503).json({ error: "Database unavailable" });
      }
      const { error } = await sb.from("serviceRequests").insert({
        tableCode: trimmedTableCode,
        requestType: trimmedRequestType,
        requestLabel: trimmedRequestLabel,
      });
      if (error) {
        console.error("[CallWaiter] Supabase insert error:", error);
        return res.status(500).json({ error: "Failed to save service request" });
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[CallWaiter] request failed:", err);
    return res.status(500).json({ error: "Failed to create service request" });
  }
});

// Loyalty tiers from server settings (mirrors loyaltyRoutes DEFAULT_TIERS)
const LOYALTY_TIERS = [
  { minSpend: 500, points: 5 },
  { minSpend: 1000, points: 15 },
  { minSpend: 1500, points: 20 },
  { minSpend: 2000, points: 30 },
  { minSpend: 2500, points: 35 },
  { minSpend: 3000, points: 45 },
  { minSpend: 3500, points: 50 },
  { minSpend: 4000, points: 60 },
];

router.get("/api/public/loyalty-tiers", async (_req: Request, res: Response) => {
  try {
    const cached = settingsCache.get("businessSettings");
    const loyaltyEnabled = cached?.loyaltyEnabled ?? true;
    const loyaltyRewardPercent = cached?.loyaltyRewardPercent ?? 5;
    const loyaltyPointsThreshold = cached?.loyaltyPointsThreshold ?? 100;

    res.json({
      loyaltyEnabled,
      loyaltyRewardPercent,
      loyaltyPointsThreshold,
      tiers: LOYALTY_TIERS,
    });
  } catch {
    res.json({
      loyaltyEnabled: true,
      loyaltyRewardPercent: 5,
      loyaltyPointsThreshold: 100,
      tiers: LOYALTY_TIERS,
    });
  }
});

export default router;
