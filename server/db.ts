import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  cafeSettings,
  Table,
  Session,
  Order,
  OrderItem,
  MenuItem,
  Category,
  SessionEditLog,
  OrderHistory,
  DeviceRateLimit,
  CafeSettings,
  InsertTable,
  InsertSession,
  InsertOrder,
  InsertOrderItem,
  InsertMenuItem,
  InsertCategory,
  InsertSessionEditLog,
  InsertOrderHistory,
  InsertDeviceRateLimit,
  InsertCafeSettings,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
      values[field] = normalized;
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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
  
  const result = await db.insert(tables).values(data);
  const id = result[0].insertId as number;
  const created = await db.select().from(tables).where(eq(tables.id, id)).limit(1);
  return created[0]!;
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
  
  const result = await db.insert(sessions).values({ tableId });
  const id = result[0].insertId as number;
  const created = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return created[0]!;
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
  
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("Session not found");
  
  const subtotal = typeof session.subtotal === 'string' ? parseFloat(session.subtotal) : 0;
  const tax = parseFloat(taxAmount);
  const service = parseFloat(serviceCharge);
  const discount = parseFloat(discountAmount);
  const finalTotal = (subtotal + tax + service - discount).toString();
  
  await db.update(sessions).set({
    status: "settled",
    taxAmount,
    serviceCharge,
    discountAmount,
    discountReason,
    finalTotal,
    settledAt: new Date(),
    settledBy,
  }).where(eq(sessions.id, sessionId));
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
  
  const result = await db.insert(orders).values(data);
  const id = result[0].insertId as number;
  const created = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return created[0]!;
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
  
  const result = await db.insert(categories).values(data);
  const id = result[0].insertId as number;
  const created = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return created[0]!;
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
  
  const result = await db.insert(menuItems).values(data);
  const id = result[0].insertId as number;
  const created = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  return created[0]!;
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
  
  const result = await db.insert(sessionEditLogs).values(data);
  const id = result[0].insertId as number;
  const created = await db.select().from(sessionEditLogs).where(eq(sessionEditLogs.id, id)).limit(1);
  return created[0]!;
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
  
  const result = await db.insert(orderHistories).values(data);
  const id = result[0].insertId as number;
  const created = await db.select().from(orderHistories).where(eq(orderHistories.id, id)).limit(1);
  return created[0]!;
}

export async function getOrderHistoryBySessionId(sessionId: number): Promise<OrderHistory | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(orderHistories).where(eq(orderHistories.sessionId, sessionId)).limit(1);
  return result[0];
}

export async function listOrderHistory(limit: number = 50, offset: number = 0): Promise<OrderHistory[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(orderHistories).orderBy(desc(orderHistories.settledAt)).limit(limit).offset(offset);
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
  
  const existing = await getDeviceRateLimit(deviceToken);
  const now = new Date();
  
  if (existing) {
    // Check if window has reset
    const windowResetTime = new Date(existing.windowResetAt.getTime() + 60 * 1000); // 1 minute window
    const newCount = now > windowResetTime ? 1 : existing.submissionCount + 1;
    const newWindowReset = now > windowResetTime ? now : existing.windowResetAt;
    
    await db.update(deviceRateLimits).set({
      lastSubmissionAt: now,
      submissionCount: newCount,
      windowResetAt: newWindowReset,
    }).where(eq(deviceRateLimits.deviceToken, deviceToken));
    
    return { ...existing, lastSubmissionAt: now, submissionCount: newCount, windowResetAt: newWindowReset };
  } else {
    const result = await db.insert(deviceRateLimits).values({
      deviceToken,
      lastSubmissionAt: now,
      submissionCount: 1,
      windowResetAt: now,
    });
    const id = result[0].insertId as number;
    const created = await db.select().from(deviceRateLimits).where(eq(deviceRateLimits.id, id)).limit(1);
    return created[0]!;
  }
}

// ============================================================================
// CAFE SETTINGS
// ============================================================================

export async function getCafeSettings(): Promise<CafeSettings> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  let result = await db.select().from(cafeSettings).limit(1);
  
  if (result.length === 0) {
    // Create default settings if none exist
    await db.insert(cafeSettings).values({});
    result = await db.select().from(cafeSettings).limit(1);
  }
  
  return result[0]!;
}

export async function updateCafeSettings(data: Partial<InsertCafeSettings>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(cafeSettings).limit(1);
  
  if (existing.length === 0) {
    await db.insert(cafeSettings).values(data);
  } else {
    await db.update(cafeSettings).set(data).where(eq(cafeSettings.id, existing[0]!.id));
  }
}
