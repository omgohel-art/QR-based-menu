import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, index, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "staff"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Table entity: represents a physical table in the cafe.
 * Each table has a random, unguessable code for QR encoding and a human-friendly label for staff.
 */
export const tables = mysqlTable("tables", {
  id: int("id").autoincrement().primaryKey(),
  tableCode: varchar("tableCode", { length: 32 }).notNull().unique(), // Random, unguessable code for QR/URL
  label: varchar("label", { length: 64 }).notNull(), // Human-friendly label (e.g., "Table 12")
  status: mysqlEnum("status", ["empty", "active", "flagged_inactive"]).default("empty").notNull(),
  activeSessionId: int("activeSessionId"), // Reference to current active session
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tableCodeIdx: index("tableCode_idx").on(table.tableCode),
}));

export type Table = typeof tables.$inferSelect;
export type InsertTable = typeof tables.$inferInsert;

/**
 * Session entity: represents an active or settled order session at a table.
 * Multiple orders from different devices append to the same session.
 */
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  tableId: int("tableId").notNull(),
  status: mysqlEnum("status", ["open", "settled"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(), // Updated on every order submission
  settledAt: timestamp("settledAt"),
  settledBy: int("settledBy"), // Reference to admin user who settled
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0").notNull(),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  serviceCharge: decimal("serviceCharge", { precision: 10, scale: 2 }).default("0").notNull(),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  discountReason: text("discountReason"),
  finalTotal: decimal("finalTotal", { precision: 10, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tableIdIdx: index("tableId_idx").on(table.tableId),
  statusIdx: index("status_idx").on(table.status),
}));

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Category entity: groups menu items (e.g., "Coffee", "Pastries")
 */
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  displayOrder: int("displayOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * MenuItem entity: represents a menu item (coffee, pastry, etc.)
 */
export const menuItems = mysqlTable("menuItems", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("imageUrl"),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  displayOrder: int("displayOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  categoryIdIdx: index("categoryId_idx").on(table.categoryId),
}));

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

/**
 * Order entity: represents a single order submission (one or more items submitted together).
 * Multiple orders can belong to the same session (from different devices).
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  submissionId: varchar("submissionId", { length: 64 }).notNull().unique(), // Client-generated UUID for idempotency
  deviceToken: varchar("deviceToken", { length: 64 }).notNull(), // Anonymous device identifier for attribution
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("sessionId_idx").on(table.sessionId),
  submissionIdIdx: index("submissionId_idx").on(table.submissionId),
}));

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * OrderItem entity: represents individual items within an order.
 */
export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  menuItemId: int("menuItemId").notNull(),
  quantity: int("quantity").notNull(),
  priceAtOrderTime: decimal("priceAtOrderTime", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index("orderId_idx").on(table.orderId),
}));

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

/**
 * SessionEditLog entity: audit trail for admin edits to a session.
 * Tracks all removals, adjustments, tax/discount changes.
 */
export const sessionEditLogs = mysqlTable("sessionEditLogs", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  changedBy: int("changedBy").notNull(), // Admin user ID
  changeType: mysqlEnum("changeType", ["remove_item", "adjust_quantity", "apply_discount", "apply_tax", "apply_service_charge"]).notNull(),
  itemId: int("itemId"), // Reference to order item if applicable
  oldValue: text("oldValue"), // JSON serialized old value
  newValue: text("newValue"), // JSON serialized new value
  reason: text("reason"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("sessionId_idx").on(table.sessionId),
}));

export type SessionEditLog = typeof sessionEditLogs.$inferSelect;
export type InsertSessionEditLog = typeof sessionEditLogs.$inferInsert;

/**
 * OrderHistory entity: snapshot of a settled session for admin reporting and dispute resolution.
 * Created when a session is settled.
 */
export const orderHistories = mysqlTable("orderHistories", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().unique(), // Reference to original session
  tableLabel: varchar("tableLabel", { length: 64 }).notNull(),
  itemsSnapshot: json("itemsSnapshot").notNull(), // JSON array of all items in session
  editsSnapshot: json("editsSnapshot").notNull(), // JSON array of all edits made
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).notNull(),
  serviceCharge: decimal("serviceCharge", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).notNull(),
  discountReason: text("discountReason"),
  finalTotal: decimal("finalTotal", { precision: 10, scale: 2 }).notNull(),
  settledBy: int("settledBy").notNull(),
  settledAt: timestamp("settledAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("sessionId_idx").on(table.sessionId),
}));

export type OrderHistory = typeof orderHistories.$inferSelect;
export type InsertOrderHistory = typeof orderHistories.$inferInsert;

/**
 * DeviceRateLimit entity: tracks per-device submission rates to prevent spam.
 */
export const deviceRateLimits = mysqlTable("deviceRateLimits", {
  id: int("id").autoincrement().primaryKey(),
  deviceToken: varchar("deviceToken", { length: 64 }).notNull().unique(),
  lastSubmissionAt: timestamp("lastSubmissionAt").defaultNow().notNull(),
  submissionCount: int("submissionCount").default(0).notNull(), // Count in current window
  windowResetAt: timestamp("windowResetAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  deviceTokenIdx: index("deviceToken_idx").on(table.deviceToken),
}));

export type DeviceRateLimit = typeof deviceRateLimits.$inferSelect;
export type InsertDeviceRateLimit = typeof deviceRateLimits.$inferInsert;

/**
 * Cafe settings entity: stores cafe-level configuration (tax rate, service charge %, inactivity window)
 */
export const cafeSettings = mysqlTable("cafeSettings", {
  id: int("id").autoincrement().primaryKey(),
  taxPercentage: decimal("taxPercentage", { precision: 5, scale: 2 }).default("0").notNull(),
  serviceChargePercentage: decimal("serviceChargePercentage", { precision: 5, scale: 2 }).default("0").notNull(),
  inactivityWindowMinutes: int("inactivityWindowMinutes").default(75).notNull(), // Default 75 min (mid-range of 60-90)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CafeSettings = typeof cafeSettings.$inferSelect;
export type InsertCafeSettings = typeof cafeSettings.$inferInsert;
