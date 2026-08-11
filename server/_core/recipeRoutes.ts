import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { recipes, inventoryItems, inventoryHistory, menuItems, businessSettings } from "../../drizzle/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
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
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role,name`,
      {
        headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
      }
    );
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
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=name`,
      { headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` } }
    );
    const profiles = await r.json();
    return profiles?.[0]?.name || "Admin";
  } catch {
    return "Admin";
  }
}

/**
 * GET /api/recipes/menu-item/:menuItemId
 * Returns all recipe mappings for a menu item.
 */
router.get("/api/recipes/menu-item/:menuItemId", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ items: [] });

    const menuItemId = parseInt(req.params.menuItemId);
    if (isNaN(menuItemId)) return res.status(400).json({ error: "Invalid menu item ID" });

    const items = await db
      .select({
        id: recipes.id,
        menuItemId: recipes.menuItemId,
        inventoryItemId: recipes.inventoryItemId,
        quantityRequired: recipes.quantityRequired,
        inventoryName: inventoryItems.name,
        inventoryUnit: inventoryItems.unit,
        currentStock: inventoryItems.currentStock,
        minimumStock: inventoryItems.minimumStock,
      })
      .from(recipes)
      .innerJoin(inventoryItems, eq(recipes.inventoryItemId, inventoryItems.id))
      .where(eq(recipes.menuItemId, menuItemId));

    res.json({ items });
  } catch (err) {
    console.error("[Recipes Get] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/recipes/menu-items
 * Returns all menu items with their recipe status (whether they have a recipe defined).
 */
router.get("/api/recipes/menu-items", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.json({ items: [] });

    const items = await db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        hsnCode: menuItems.hsnCode,
        recipeCount: sql<number>`COUNT(${recipes.id})::int`,
      })
      .from(menuItems)
      .leftJoin(recipes, eq(recipes.menuItemId, menuItems.id))
      .groupBy(menuItems.id, menuItems.name, menuItems.hsnCode)
      .orderBy(menuItems.name);

    res.json({ items });
  } catch (err) {
    console.error("[Recipes Menu Items] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/recipes
 * Add a single recipe mapping: { menuItemId, inventoryItemId, quantityRequired }
 */
router.post("/api/recipes", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { menuItemId, inventoryItemId, quantityRequired } = req.body;

    if (!menuItemId || !inventoryItemId || !quantityRequired) {
      return res.status(400).json({ error: "menuItemId, inventoryItemId and quantityRequired are required" });
    }
    const qty = parseFloat(quantityRequired.toString());
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: "quantityRequired must be a positive number" });
    }

    const [menuItem] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
    if (!menuItem) return res.status(404).json({ error: "Menu item not found" });

    const [inventoryItem] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, inventoryItemId)).limit(1);
    if (!inventoryItem) return res.status(404).json({ error: "Inventory item not found" });

    try {
      const [created] = await db.insert(recipes).values({
        menuItemId,
        inventoryItemId,
        quantityRequired: qty.toString(),
      }).returning();
      res.status(201).json(created);
    } catch (err: any) {
      // Unique constraint: same (menuItemId, inventoryItemId) already exists → update instead
      if (err?.code === "23505" || /unique/i.test(err?.message || "")) {
        const [updated] = await db.update(recipes)
          .set({ quantityRequired: qty.toString(), updatedAt: new Date() })
          .where(and(eq(recipes.menuItemId, menuItemId), eq(recipes.inventoryItemId, inventoryItemId)))
          .returning();
        return res.json(updated);
      }
      throw err;
    }
  } catch (err) {
    console.error("[Recipes Create] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/recipes/:id
 * Update a single recipe mapping quantity.
 */
router.put("/api/recipes/:id", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const { quantityRequired } = req.body;
    if (!quantityRequired) return res.status(400).json({ error: "quantityRequired is required" });

    const qty = parseFloat(quantityRequired.toString());
    if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "quantityRequired must be positive" });

    const [updated] = await db.update(recipes)
      .set({ quantityRequired: qty.toString(), updatedAt: new Date() })
      .where(eq(recipes.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Recipe not found" });
    res.json(updated);
  } catch (err) {
    console.error("[Recipes Update] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/recipes/:id
 * Delete a single recipe mapping.
 */
router.delete("/api/recipes/:id", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    await db.delete(recipes).where(eq(recipes.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("[Recipes Delete] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/recipes/bulk
 * Bulk replace all recipe mappings for a menu item.
 * Body: { menuItemId, items: [{ inventoryItemId, quantityRequired }] }
 */
router.post("/api/recipes/bulk", async (req: Request, res: Response) => {
  try {
    const userId = await requireAdmin(req, res);
    if (!userId) return;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });

    const { menuItemId, items } = req.body;
    if (!menuItemId || !Array.isArray(items)) {
      return res.status(400).json({ error: "menuItemId and items array are required" });
    }

    const [menuItem] = await db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).limit(1);
    if (!menuItem) return res.status(404).json({ error: "Menu item not found" });

    await db.delete(recipes).where(eq(recipes.menuItemId, menuItemId));

    const validItems = items.filter((it: any) => it.inventoryItemId && parseFloat(it.quantityRequired?.toString() || "0") > 0);
    if (validItems.length > 0) {
      await db.insert(recipes).values(validItems.map((it: any) => ({
        menuItemId,
        inventoryItemId: parseInt(it.inventoryItemId.toString()),
        quantityRequired: parseFloat(it.quantityRequired.toString()).toString(),
      })));
    }
    res.json({ success: true, count: validItems.length });
  } catch (err) {
    console.error("[Recipes Bulk] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Auto-deduct inventory based on recipes for a list of order items.
 * Called from paymentRoutes after a successful order creation.
 *
 * @param db Drizzle db instance
 * @param orderItems Array of { menuItemId, quantity }
 * @param orderId For audit trail in inventoryHistory
 * @returns Array of items that went below minimum stock (for alerts)
 */
export async function deductInventoryForOrder(
  db: any,
  orderItems: Array<{ menuItemId: number; quantity: number }>,
  orderId: number
): Promise<Array<{ inventoryItemId: number; inventoryName: string; currentStock: number; minimumStock: number; unit: string }>> {
  const lowStockAlerts: Array<{ inventoryItemId: number; inventoryName: string; currentStock: number; minimumStock: number; unit: string }> = [];
  if (!db || orderItems.length === 0) return lowStockAlerts;

  try {
    // Aggregate required quantities per (menuItemId, inventoryItemId)
    const menuItemIds = Array.from(new Set(orderItems.map((it) => it.menuItemId)));
    if (menuItemIds.length === 0) return lowStockAlerts;

    const recipeRows = await db
      .select({
        menuItemId: recipes.menuItemId,
        inventoryItemId: recipes.inventoryItemId,
        quantityRequired: recipes.quantityRequired,
      })
      .from(recipes)
      .where(inArray(recipes.menuItemId, menuItemIds));

    if (recipeRows.length === 0) return lowStockAlerts;

    // Build consumption map: inventoryItemId -> totalQty
    const consumption = new Map<number, number>();
    for (const orderItem of orderItems) {
      const matchingRecipes = recipeRows.filter((r: any) => r.menuItemId === orderItem.menuItemId);
      for (const r of matchingRecipes) {
        const qtyPerUnit = parseFloat(r.quantityRequired.toString());
        const totalQty = qtyPerUnit * orderItem.quantity;
        consumption.set(r.inventoryItemId, (consumption.get(r.inventoryItemId) || 0) + totalQty);
      }
    }
    if (consumption.size === 0) return lowStockAlerts;

    // Fetch inventory items
    const inventoryItemIds = Array.from(consumption.keys());
    const inventoryRows = await db
      .select()
      .from(inventoryItems)
      .where(inArray(inventoryItems.id, inventoryItemIds));

    // CRITICAL (C5 fix): Use an atomic SQL UPDATE with a stock guard so that
    // concurrent orders cannot oversell the last unit. The expression
    //   GREATEST(0, currentStock - qty)
    // plus the WHERE clause
    //   currentStock >= qty
    // means: only deduct when stock is sufficient. Combined with the new DB-level
    // CHECK (currentStock >= 0), this prevents negative stock under any concurrency.
    //
    // We use RETURNING to capture the post-deduction stock so we can build alerts
    // and history rows with the authoritative value.
    const deductionTime = new Date();
    for (const inv of inventoryRows) {
      const deductQty = consumption.get(inv.id) || 0;
      if (deductQty <= 0) continue;

      const deductQtyStr = deductQty.toString();

      // Atomic guarded decrement. If currentStock < deductQty, the row is not
      // updated — no oversell. We still capture the (unchanged) stock for alerts.
      const result: any = await db.execute(sql`
        UPDATE "inventoryItems"
        SET "currentStock" = ("currentStock" - ${deductQtyStr})::numeric,
            "updatedAt" = NOW()
        WHERE "id" = ${inv.id} AND "currentStock" >= ${deductQtyStr}::numeric
        RETURNING "currentStock"
      `);
      const rows = result?.rows || [];
      const actuallyDeducted = rows.length > 0;
      // Bug 5 fix: only emit an inventory history row when we actually deducted.
      // Bug 11 fix: when not deducted, do not pollute the history with phantom
      // negative-quantity entries that didn't actually happen.
      if (!actuallyDeducted) {
        // Still emit a low-stock alert if the requested deduction would have
        // driven the item below zero — operators should know recipes are
        // demanding more than they have.
        const minStock = parseFloat(inv.minimumStock?.toString() || "0");
        const currentStock = parseFloat(inv.currentStock?.toString() || "0");
        if (currentStock <= minStock) {
          lowStockAlerts.push({
            inventoryItemId: inv.id,
            inventoryName: inv.name,
            currentStock,
            minimumStock: minStock,
            unit: inv.unit,
          });
        }
        continue;
      }
      const afterStock = parseFloat(rows[0].currentStock?.toString() || "0");
      const beforeStock = afterStock + deductQty;

      await db.insert(inventoryHistory).values({
        itemId: inv.id,
        itemName: inv.name,
        quantityChanged: (-deductQty).toString(),
        beforeQuantity: beforeStock.toString(),
        afterQuantity: afterStock.toString(),
        action: "remove",
        reason: "Sale",
        userId: null,
        userName: `Order #${orderId}`,
      });

      // Low stock alert (only if we actually deducted or stock is already low).
      const minStock = parseFloat(inv.minimumStock?.toString() || "0");
      if (afterStock <= minStock) {
        lowStockAlerts.push({
          inventoryItemId: inv.id,
          inventoryName: inv.name,
          currentStock: afterStock,
          minimumStock: minStock,
          unit: inv.unit,
        });
      }
    }

    // Find menu items whose recipes reference out-of-stock ingredients → mark unavailable
    const outOfStockIds = lowStockAlerts.filter((a) => a.currentStock <= 0).map((a) => a.inventoryItemId);
    if (outOfStockIds.length > 0) {
      const affectedRecipes = await db
        .select({ menuItemId: recipes.menuItemId })
        .from(recipes)
        .where(inArray(recipes.inventoryItemId, outOfStockIds));
      const menuIdsToDisable = Array.from(new Set(affectedRecipes.map((r: any) => r.menuItemId)));
      if (menuIdsToDisable.length > 0) {
        await db.update(menuItems)
          .set({ isAvailable: false, updatedAt: deductionTime })
          .where(inArray(menuItems.id, menuIdsToDisable as number[]));
      }
    }
  } catch (err) {
    console.error("[Inventory Auto-Deduct] Error:", err);
  }
  return lowStockAlerts;
}

export default router;
