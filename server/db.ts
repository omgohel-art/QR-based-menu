import { eq, and, desc, sql, gte, lte, inArray, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import {
  tables,
  sessions,
  orders,
  orderItems,
  menuItems,
  categories,
  sessionEditLogs,
  orderHistories,
  deviceRateLimits,
  feedback,
  Table,
  Session,
  Order,
  OrderItem,
  MenuItem,
  Category,
  SessionEditLog,
  OrderHistory,
  DeviceRateLimit,
  Feedback,
  InsertTable,
  InsertSession,
  InsertOrder,
  InsertOrderItem,
  InsertMenuItem,
  InsertCategory,
  InsertSessionEditLog,
  InsertOrderHistory,
  InsertDeviceRateLimit,
  InsertFeedback,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;
let _initPromise: Promise<ReturnType<typeof drizzle> | null> | null = null;

export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) return null;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      _client = postgres(process.env.DATABASE_URL!, {
        idle_timeout: 20,
        max_lifetime: 300,
        keep_alive: 30,
        connect_timeout: 10,
      });
      _db = drizzle(_client);
      return _db;
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _client = null;
      _initPromise = null;
      return null;
    }
  })();

  return _initPromise;
}

export async function resetDb() {
  if (_client) {
    try { await _client.end(); } catch {}
    _client = null;
    _db = null;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      (values as any)[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================================================
// TABLE MANAGEMENT
// ============================================================================

export async function createTable(data: InsertTable): Promise<Table> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [created] = await db.insert(tables).values(data).returning();
  if (!created) throw new Error("Failed to create table");
  return created;
}

export async function getTableByCode(tableCode: string): Promise<Table | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(tables).where(eq(tables.tableCode, tableCode)).limit(1);
  return result[0];
}

export async function getTableById(id: number): Promise<Table | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(tables).where(eq(tables.id, id)).limit(1);
  return result[0];
}

export async function listAllTables(): Promise<Table[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(tables).orderBy(tables.label);
}

export async function updateTableLabel(id: number, label: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(tables).set({ label }).where(eq(tables.id, id));
}

export async function updateTableStatus(id: number, status: "empty" | "active" | "flagged_inactive", activeSessionId?: number | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(tables).set({ status, activeSessionId: activeSessionId ?? null }).where(eq(tables.id, id));
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export async function createSession(tableId: number): Promise<Session> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [created] = await db.insert(sessions).values({ tableId }).returning();
  if (!created) throw new Error("Failed to create session");
  return created;
}

export async function getActiveSessionForTable(tableId: number): Promise<Session | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tableId, tableId), eq(sessions.status, "open")))
    .limit(1);
  return result[0];
}

export async function getSessionById(id: number): Promise<Session | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return result[0];
}

export async function updateSessionLastActivity(sessionId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(sessions).set({ lastActivityAt: sql`NOW()` }).where(eq(sessions.id, sessionId));
}

export async function updateSessionSubtotal(sessionId: number, subtotal: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(sessions).set({ subtotal, lastActivityAt: sql`NOW()` }).where(eq(sessions.id, sessionId));
}

export async function settleSession(
  sessionId: number,
  taxAmount: string,
  serviceCharge: string,
  discountAmount: string,
  discountReason: string | null,
  settledBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const tax = parseFloat(taxAmount);
  const service = parseFloat(serviceCharge);
  const discount = parseFloat(discountAmount);

  if (tax < 0 || service < 0 || discount < 0) {
    throw new Error("Invalid negative values in session settlement");
  }

  // Use atomic SQL to recalculate finalTotal from current subtotal, avoiding stale reads
  await db.execute(sql`
    UPDATE sessions SET
      status = 'settled',
      taxAmount = ${taxAmount}::numeric,
      serviceCharge = ${serviceCharge}::numeric,
      discountAmount = ${discountAmount}::numeric,
      discountReason = ${discountReason},
      finalTotal = GREATEST(0, subtotal::numeric + ${serviceCharge}::numeric + ${taxAmount}::numeric - ${discountAmount}::numeric),
      settledAt = NOW(),
      settledBy = ${settledBy}
    WHERE id = ${sessionId} AND status = 'open'
  `);
}

export async function getInactiveSessionsForFlagging(inactivityWindowMinutes: number): Promise<Session[]> {
  const db = await getDb();
  if (!db) return [];
  
  const cutoffTime = new Date(Date.now() - inactivityWindowMinutes * 60 * 1000);
  
  return db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.status, "open"),
        sql`${sessions.lastActivityAt} < ${cutoffTime}`
      )
    );
}

// ============================================================================
// ORDER MANAGEMENT
// ============================================================================

export async function createOrder(data: InsertOrder): Promise<Order> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [created] = await db.insert(orders).values(data).returning();
  if (!created) throw new Error("Failed to create order");
  return created;
}

export async function getMaxOrderNumber(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ max: sql<number>`max(orderNumber)` }).from(orders);
  return result[0]?.max ?? null;
}

export async function checkSubmissionIdExists(submissionId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const result = await db.select().from(orders).where(eq(orders.submissionId, submissionId)).limit(1);
  return result.length > 0;
}

export async function getOrdersBySessionId(sessionId: number): Promise<Order[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(orders).where(eq(orders.sessionId, sessionId)).orderBy(orders.submittedAt);
}

export async function createOrderItems(items: InsertOrderItem[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (items.length > 0) {
    await db.insert(orderItems).values(items);
  }
}

export async function getOrderItemsByOrderId(orderId: number): Promise<OrderItem[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function getOrderItemById(id: number): Promise<OrderItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1);
  return result[0];
}

export async function getOrderItemsBySessionId(sessionId: number): Promise<OrderItem[]> {
  const db = await getDb();
  if (!db) return [];
  
  const results = await db
    .select()
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(eq(orders.sessionId, sessionId));
  
  return results.map(r => r.orderItems);
}

export async function removeOrderItem(orderItemId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(orderItems).where(eq(orderItems.id, orderItemId));
}

export async function updateOrderItemQuantity(orderItemId: number, quantity: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(orderItems).set({ quantity }).where(eq(orderItems.id, orderItemId));
}

// ============================================================================
// MENU MANAGEMENT
// ============================================================================

export async function createCategory(data: InsertCategory): Promise<Category> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [created] = await db.insert(categories).values(data).returning();
  if (!created) throw new Error("Failed to create category");
  return created;
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(categories).orderBy(categories.displayOrder, categories.name);
}

export async function getCategoryById(id: number): Promise<Category | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return result[0];
}

export async function updateCategory(id: number, data: Partial<InsertCategory>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(categories).set(data).where(eq(categories.id, id));
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(categories).where(eq(categories.id, id));
}

export async function createMenuItem(data: InsertMenuItem): Promise<MenuItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [created] = await db.insert(menuItems).values(data).returning();
  if (!created) throw new Error("Failed to create menu item");
  return created;
}

export async function listMenuItems(): Promise<MenuItem[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(menuItems).orderBy(menuItems.categoryId, menuItems.displayOrder, menuItems.name);
}

export async function getMenuItemById(id: number): Promise<MenuItem | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  return result[0];
}

export async function updateMenuItem(id: number, data: Partial<InsertMenuItem>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(menuItems).set(data).where(eq(menuItems.id, id));
}

export async function deleteMenuItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(menuItems).where(eq(menuItems.id, id));
}

// ============================================================================
// AUDIT LOG MANAGEMENT
// ============================================================================

export async function createEditLog(data: InsertSessionEditLog): Promise<SessionEditLog> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [created] = await db.insert(sessionEditLogs).values(data).returning();
  if (!created) throw new Error("Failed to create edit log");
  return created;
}

export async function getEditLogsBySessionId(sessionId: number): Promise<SessionEditLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sessionEditLogs).where(eq(sessionEditLogs.sessionId, sessionId)).orderBy(sessionEditLogs.timestamp);
}

// ============================================================================
// ORDER HISTORY
// ============================================================================

export async function createOrderHistory(data: InsertOrderHistory): Promise<OrderHistory> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [created] = await db.insert(orderHistories).values(data).returning();
  if (!created) throw new Error("Failed to create order history");
  return created;
}

export async function getOrderHistoryBySessionId(sessionId: number): Promise<OrderHistory | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(orderHistories).where(eq(orderHistories.sessionId, sessionId)).limit(1);
  return result[0];
}

export async function listOrderHistory(
  limit: number = 50,
  cursor?: { settledAt: string; id: number } | null
): Promise<{ data: OrderHistory[]; nextCursor: { settledAt: string; id: number } | null; hasMore: boolean }> {
  const db = await getDb();
  if (!db) return { data: [], nextCursor: null, hasMore: false };

  const fetchLimit = limit + 1;
  let query = db.select().from(orderHistories).orderBy(desc(orderHistories.settledAt), desc(orderHistories.id));

  if (cursor) {
    query = query.where(
      sql`(${orderHistories.settledAt}, ${orderHistories.id}) < (${cursor.settledAt}, ${cursor.id})`
    ) as any;
  }

  const results = await query.limit(fetchLimit);
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const last = data[data.length - 1];

  return {
    data,
    nextCursor: hasMore && last?.settledAt
      ? { settledAt: String(last.settledAt), id: last.id }
      : null,
    hasMore,
  };
}

// ============================================================================
// RATE LIMITING
// ============================================================================

export async function getDeviceRateLimit(deviceToken: string): Promise<DeviceRateLimit | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(deviceRateLimits).where(eq(deviceRateLimits.deviceToken, deviceToken)).limit(1);
  return result[0];
}

export async function createOrUpdateDeviceRateLimit(deviceToken: string): Promise<DeviceRateLimit> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Use atomic SQL upsert to avoid TOCTOU race condition
  const result = await db.execute(sql`
    INSERT INTO "deviceRateLimits" ("deviceToken", "lastSubmissionAt", "submissionCount", "windowResetAt")
    VALUES (${deviceToken}, NOW(), 1, NOW())
    ON CONFLICT ("deviceToken") DO UPDATE SET
      "lastSubmissionAt" = NOW(),
      "submissionCount" = CASE
        WHEN NOW() > "deviceRateLimits"."windowResetAt" + INTERVAL '1 minute' THEN 1
        ELSE "deviceRateLimits"."submissionCount" + 1
      END,
      "windowResetAt" = CASE
        WHEN NOW() > "deviceRateLimits"."windowResetAt" + INTERVAL '1 minute' THEN NOW()
        ELSE "deviceRateLimits"."windowResetAt"
      END
    RETURNING *
  `);
  
  const rows = result as any;
  if (!rows || rows.length === 0) throw new Error("Failed to upsert device rate limit");
  return rows[0] as DeviceRateLimit;
}

// ============================================================================
// FEEDBACK
// ============================================================================

export async function createFeedback(data: InsertFeedback): Promise<Feedback> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [created] = await db.insert(feedback).values(data).returning();
  return created!;
}

export async function getFeedbackBySessionId(sessionId: number): Promise<Feedback | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(feedback).where(eq(feedback.sessionId, sessionId)).limit(1);
  return result[0];
}

export async function listFeedback(
  limit: number = 50,
  cursor?: { createdAt: string; id: number } | null
): Promise<{ data: Feedback[]; nextCursor: { createdAt: string; id: number } | null; hasMore: boolean }> {
  const db = await getDb();
  if (!db) return { data: [], nextCursor: null, hasMore: false };

  const fetchLimit = limit + 1;
  let query = db.select().from(feedback).orderBy(desc(feedback.createdAt), desc(feedback.id));

  if (cursor) {
    query = query.where(
      sql`(${feedback.createdAt}, ${feedback.id}) < (${cursor.createdAt}, ${cursor.id})`
    ) as any;
  }

  const results = await query.limit(fetchLimit);
  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, limit) : results;
  const last = data[data.length - 1];

  return {
    data,
    nextCursor: hasMore && last?.createdAt
      ? { createdAt: String(last.createdAt), id: last.id }
      : null,
    hasMore,
  };
}

// ============================================================================
// ANALYTICS
// ============================================================================

export async function getPopularItems(days: number = 30): Promise<{ menuItemId: number; name: string; count: number; revenue: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // DB-level aggregation: group by menuItemId, compute count and revenue, take top 20
  const aggregated = await db
    .select({
      menuItemId: orderItems.menuItemId,
      count: sql<number>`sum(${orderItems.quantity})`,
      revenue: sql<number>`sum(${orderItems.priceAtOrderTime}::numeric * ${orderItems.quantity})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(gte(orders.submittedAt, since))
    .groupBy(orderItems.menuItemId)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(20);

  if (aggregated.length === 0) return [];

  const menuItemIds = aggregated.map(r => r.menuItemId);
  const menuResult = await db.select({ id: menuItems.id, name: menuItems.name }).from(menuItems).where(inArray(menuItems.id, menuItemIds));
  const nameMap = new Map(menuResult.map(m => [m.id, m.name]));

  return aggregated.map(r => ({
    menuItemId: r.menuItemId,
    name: nameMap.get(r.menuItemId) || `Item #${r.menuItemId}`,
    count: Number(r.count),
    revenue: Number(r.revenue),
  }));
}

export async function getDailyRevenue(days: number = 7): Promise<{ date: string; revenue: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // DB-level aggregation: sum revenue per day
  const aggregated = await db
    .select({
      date: sql<string>`TO_CHAR(${sessions.settledAt}, 'YYYY-MM-DD')`,
      revenue: sql<number>`SUM(${sessions.finalTotal}::numeric)`,
    })
    .from(sessions)
    .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, since)))
    .groupBy(sql`TO_CHAR(${sessions.settledAt}, 'YYYY-MM-DD')`);

  const dayMap = new Map(aggregated.map(r => [r.date, Number(r.revenue)]));
  const result: { date: string; revenue: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, revenue: dayMap.get(key) || 0 });
  }
  return result;
}

export async function getPeakHours(days: number = 30): Promise<{ hour: number; orderCount: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // DB-level aggregation: extract hour, count orders per hour
  const aggregated = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${orders.submittedAt})::int`,
      orderCount: sql<number>`COUNT(*)::int`,
    })
    .from(orders)
    .where(gte(orders.submittedAt, since))
    .groupBy(sql`EXTRACT(HOUR FROM ${orders.submittedAt})`);

  const hourMap = new Map(aggregated.map(r => [r.hour, r.orderCount]));
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    orderCount: hourMap.get(i) || 0,
  }));
}

export async function getTableTurnover(days: number = 7): Promise<{ tableLabel: string; sessionCount: number; totalRevenue: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // DB-level aggregation: group by tableId, compute session count and revenue
  const aggregated = await db
    .select({
      tableId: sessions.tableId,
      sessionCount: sql<number>`COUNT(*)::int`,
      totalRevenue: sql<number>`SUM(${sessions.finalTotal}::numeric)`,
    })
    .from(sessions)
    .where(and(eq(sessions.status, "settled"), gte(sessions.settledAt, since)))
    .groupBy(sessions.tableId)
    .orderBy(desc(sql`SUM(${sessions.finalTotal}::numeric)`));

  if (aggregated.length === 0) return [];

  const tableIds = aggregated.map(r => r.tableId);
  const tablesData = await db.select().from(tables).where(inArray(tables.id, tableIds));
  const labelMap = new Map(tablesData.map(t => [t.id, t.label]));

  return aggregated.map(r => ({
    tableLabel: labelMap.get(r.tableId) || `Table #${r.tableId}`,
    sessionCount: r.sessionCount,
    totalRevenue: Number(r.totalRevenue),
  }));
}

export async function getAverageRating(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ avg: sql<number>`COALESCE(AVG(${feedback.rating}), 0)` }).from(feedback);
  return Math.round((result[0]?.avg ?? 0) * 10) / 10;
}

export async function getFeedbackCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(feedback);
  return result[0]?.count ?? 0;
}
