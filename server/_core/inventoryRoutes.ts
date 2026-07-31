import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { inventoryItems, inventoryHistory } from "../../drizzle/schema";
import { eq, and, desc, sql, like, or, lte, gte, count } from "drizzle-orm";
import { getUserIdFromToken } from "./authRoutes";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = getUserIdFromToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  try {
    const API_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role,name`, {
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

async function getUserName(userId: string): Promise<string> {
  try {
    const API_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=name`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
    });
    const profiles = await r.json();
    return profiles?.[0]?.name || "Admin";
  } catch {
    return "Admin";
  }
}

/**
 * GET /api/inventory/dashboard
 * Dashboard summary stats.
 */
router.get("/api/inventory/dashboard", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ totalItems: 0, lowStock: 0, outOfStock: 0, totalValue: 0, recentItems: [] });

    const allItems = await db.select().from(inventoryItems);

    const totalItems = allItems.length;
    let lowStock = 0;
    let outOfStock = 0;
    let totalValue = 0;

    for (const item of allItems) {
      const stock = parseFloat(item.currentStock?.toString() || "0");
      const min = parseFloat(item.minimumStock?.toString() || "0");
      const price = parseFloat(item.purchasePrice?.toString() || "0");

      if (stock <= 0) {
        outOfStock++;
      } else if (stock <= min) {
        lowStock++;
      }
      totalValue += stock * price;
    }

    const recentItems = allItems
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        currentStock: item.currentStock,
        unit: item.unit,
        updatedAt: item.updatedAt,
      }));

    res.json({ totalItems, lowStock, outOfStock, totalValue: Math.round(totalValue * 100) / 100, recentItems });
  } catch (err) {
    console.error("[Inventory Dashboard] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/inventory/items?search=&category=&status=&page=1&limit=50
 * List inventory items with filtering.
 */
router.get("/api/inventory/items", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ items: [], total: 0 });

    const { search, category, status } = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(
        or(
          like(inventoryItems.name, `%${search}%`),
          like(inventoryItems.sku, `%${search}%`),
          like(inventoryItems.supplier, `%${search}%`)
        )
      );
    }
    if (category) {
      conditions.push(eq(inventoryItems.category, category));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(inventoryItems)
      .where(whereClause);

    let query = db
      .select()
      .from(inventoryItems)
      .where(whereClause)
      .orderBy(desc(inventoryItems.updatedAt))
      .limit(limit)
      .offset(offset);

    let items = await query;

    if (status === "low") {
      items = items.filter((item) => {
        const stock = parseFloat(item.currentStock?.toString() || "0");
        const min = parseFloat(item.minimumStock?.toString() || "0");
        return stock > 0 && stock <= min;
      });
    } else if (status === "out") {
      items = items.filter((item) => parseFloat(item.currentStock?.toString() || "0") <= 0);
    } else if (status === "expiring") {
      const twoWeeksFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      items = items.filter((item) => {
        if (!item.expiryDate) return false;
        return new Date(item.expiryDate) <= twoWeeksFromNow;
      });
    }

    res.json({ items, total: countResult?.count || 0 });
  } catch (err) {
    console.error("[Inventory Items] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/inventory/items/:id
 * Get single inventory item.
 */
router.get("/api/inventory/items/:id", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(404).json({ error: "Not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json(item);
  } catch (err) {
    console.error("[Inventory Item] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/inventory/items
 * Create a new inventory item.
 */
router.post("/api/inventory/items", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { name, category, sku, currentStock, unit, minimumStock, maximumStock, purchasePrice, supplier, lastRestockedAt, expiryDate, notes } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Item name is required" });
    if (!category) return res.status(400).json({ error: "Category is required" });
    if (!unit) return res.status(400).json({ error: "Unit is required" });

    const validCategories = ['Coffee Beans', 'Tea', 'Milk & Dairy', 'Bread & Bakery', 'Vegetables', 'Fruits', 'Sauces', 'Syrups', 'Spices', 'Beverages', 'Packaging', 'Cleaning Supplies', 'Other'];
    const validUnits = ['kg', 'g', 'L', 'ml', 'pcs', 'bottles', 'packets', 'boxes'];

    if (!validCategories.includes(category)) return res.status(400).json({ error: "Invalid category" });
    if (!validUnits.includes(unit)) return res.status(400).json({ error: "Invalid unit" });

    const stock = parseFloat(currentStock?.toString() || "0");
    const minStock = parseFloat(minimumStock?.toString() || "0");
    const maxStock = parseFloat(maximumStock?.toString() || "0");
    const price = parseFloat(purchasePrice?.toString() || "0");

    if (stock < 0) return res.status(400).json({ error: "Current stock cannot be negative" });
    if (minStock < 0) return res.status(400).json({ error: "Minimum stock cannot be negative" });
    if (maxStock < 0) return res.status(400).json({ error: "Maximum stock cannot be negative" });
    if (price < 0) return res.status(400).json({ error: "Purchase price cannot be negative" });

    const [item] = await db.insert(inventoryItems).values({
      name: name.trim(),
      category,
      sku: sku?.trim() || null,
      currentStock: stock.toString(),
      unit,
      minimumStock: minStock.toString(),
      maximumStock: maxStock.toString(),
      purchasePrice: price.toString(),
      supplier: supplier?.trim() || null,
      lastRestockedAt: lastRestockedAt ? new Date(lastRestockedAt) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      notes: notes?.trim() || null,
    }).returning();

    // Log initial stock if > 0
    if (stock > 0) {
      const userName = await getUserName(userId);
      await db.insert(inventoryHistory).values({
        itemId: item.id,
        itemName: item.name,
        quantityChanged: stock.toString(),
        beforeQuantity: "0",
        afterQuantity: stock.toString(),
        action: "add",
        reason: "Purchase",
        userId,
        userName,
      });
    }

    res.status(201).json(item);
  } catch (err) {
    console.error("[Inventory Create] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/inventory/items/:id
 * Update an inventory item.
 */
router.put("/api/inventory/items/:id", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!existing) return res.status(404).json({ error: "Item not found" });

    const { name, category, sku, unit, minimumStock, maximumStock, purchasePrice, supplier, lastRestockedAt, expiryDate, notes } = req.body;

    if (name !== undefined && !name?.trim()) return res.status(400).json({ error: "Item name cannot be empty" });
    if (category !== undefined) {
      const validCategories = ['Coffee Beans', 'Tea', 'Milk & Dairy', 'Bread & Bakery', 'Vegetables', 'Fruits', 'Sauces', 'Syrups', 'Spices', 'Beverages', 'Packaging', 'Cleaning Supplies', 'Other'];
      if (!validCategories.includes(category)) return res.status(400).json({ error: "Invalid category" });
    }
    if (unit !== undefined) {
      const validUnits = ['kg', 'g', 'L', 'ml', 'pcs', 'bottles', 'packets', 'boxes'];
      if (!validUnits.includes(unit)) return res.status(400).json({ error: "Invalid unit" });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (category !== undefined) updates.category = category;
    if (sku !== undefined) updates.sku = sku?.trim() || null;
    if (unit !== undefined) updates.unit = unit;
    if (minimumStock !== undefined) updates.minimumStock = parseFloat(minimumStock?.toString() || "0").toString();
    if (maximumStock !== undefined) updates.maximumStock = parseFloat(maximumStock?.toString() || "0").toString();
    if (purchasePrice !== undefined) updates.purchasePrice = parseFloat(purchasePrice?.toString() || "0").toString();
    if (supplier !== undefined) updates.supplier = supplier?.trim() || null;
    if (lastRestockedAt !== undefined) updates.lastRestockedAt = lastRestockedAt ? new Date(lastRestockedAt) : null;
    if (expiryDate !== undefined) updates.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    const [updated] = await db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, id)).returning();
    res.json(updated);
  } catch (err) {
    console.error("[Inventory Update] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/inventory/items/:id
 * Delete an inventory item.
 */
router.delete("/api/inventory/items/:id", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!existing) return res.status(404).json({ error: "Item not found" });

    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("[Inventory Delete] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/inventory/adjust
 * Adjust stock for an item (add or remove).
 */
router.post("/api/inventory/adjust", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { itemId, action, quantity, reason } = req.body;

    if (!itemId) return res.status(400).json({ error: "Item ID is required" });
    if (!action || !["add", "remove"].includes(action)) return res.status(400).json({ error: "Action must be 'add' or 'remove'" });
    if (!quantity || parseFloat(quantity?.toString() || "0") <= 0) return res.status(400).json({ error: "Quantity must be positive" });
    if (!reason) return res.status(400).json({ error: "Reason is required" });

    const validReasons = ['Purchase', 'Waste', 'Damage', 'Expired', 'Correction', 'Other'];
    if (!validReasons.includes(reason)) return res.status(400).json({ error: "Invalid reason" });

    const id = parseInt(itemId);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid item ID" });

    const [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    if (!existing) return res.status(404).json({ error: "Item not found" });

    const beforeStock = parseFloat(existing.currentStock?.toString() || "0");
    const adjustQty = parseFloat(quantity?.toString() || "0");
    let afterStock: number;

    if (action === "add") {
      afterStock = beforeStock + adjustQty;
    } else {
      afterStock = Math.max(0, beforeStock - adjustQty);
    }

    const updates: Record<string, any> = {
      currentStock: afterStock.toString(),
      updatedAt: new Date(),
    };
    if (action === "add" && reason === "Purchase") {
      updates.lastRestockedAt = new Date();
    }

    await db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, id));

    const userName = await getUserName(userId);
    await db.insert(inventoryHistory).values({
      itemId: id,
      itemName: existing.name,
      quantityChanged: (action === "add" ? adjustQty : -adjustQty).toString(),
      beforeQuantity: beforeStock.toString(),
      afterQuantity: afterStock.toString(),
      action,
      reason,
      userId,
      userName,
    });

    res.json({ success: true, beforeStock, afterStock });
  } catch (err) {
    console.error("[Inventory Adjust] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/inventory/history?itemId=&page=1&limit=50
 * Get inventory change history.
 */
router.get("/api/inventory/history", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ items: [], total: 0 });

    const { itemId } = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (itemId) {
      const id = parseInt(itemId);
      if (!isNaN(id)) conditions.push(eq(inventoryHistory.itemId, id));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: count() })
      .from(inventoryHistory)
      .where(whereClause);

    const items = await db
      .select()
      .from(inventoryHistory)
      .where(whereClause)
      .orderBy(desc(inventoryHistory.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ items, total: countResult?.count || 0 });
  } catch (err) {
    console.error("[Inventory History] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
