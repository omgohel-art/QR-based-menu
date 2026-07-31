import { decimal, integer, pgTable, text, timestamp, varchar, boolean, index, json, serial, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name").notNull().default(""),
  email: varchar("email", { length: 320 }).notNull().default(""),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
}, (table) => ({
  userRoleCheck: check("user_role_check", sql`${table.role} IN ('user', 'admin', 'staff')`),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Table entity: represents a physical table in the cafe.
 */
export const tables = pgTable("tables", {
  id: serial("id").primaryKey(),
  tableCode: varchar("tableCode", { length: 32 }).notNull().unique(),
  label: varchar("label", { length: 64 }).notNull(),
  status: varchar("status", { length: 50 }).default("empty").notNull(),
  activeSessionId: integer("activeSessionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  tableStatusIdx2: index("tables_status_idx").on(table.status),
  tableActiveSessionIdx: index("tables_activeSessionId_idx").on(table.activeSessionId),
  tableStatusCheck: check("tables_status_check", sql`${table.status} IN ('empty', 'active', 'flagged_inactive')`),
}));

export type Table = typeof tables.$inferSelect;
export type InsertTable = typeof tables.$inferInsert;

/**
 * Session entity: represents an active or settled order session at a table.
 */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  tableId: integer("tableId").notNull().references(() => tables.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
  settledAt: timestamp("settledAt"),
  settledBy: integer("settledBy").references(() => users.id, { onDelete: "set null" }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0").notNull(),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  serviceCharge: decimal("serviceCharge", { precision: 10, scale: 2 }).default("0").notNull(),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).default("0").notNull(),
  discountReason: text("discountReason"),
  finalTotal: decimal("finalTotal", { precision: 10, scale: 2 }).default("0").notNull(),
  customerName: varchar("customerName", { length: 128 }),
  customerPhone: varchar("customerPhone", { length: 20 }),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  }, (table) => ({
  tableIdIdx: index("tableId_idx").on(table.tableId),
  statusIdx: index("status_idx").on(table.status),
  tableStatusIdx: index("tableStatus_idx").on(table.tableId, table.status),
  statusSettledAtIdx: index("sessions_status_settledAt_idx").on(table.status, table.settledAt),
  statusLastActivityIdx: index("sessions_status_lastActivityAt_idx").on(table.status, table.lastActivityAt),
  sessionStatusCheck: check("session_status_check", sql`${table.status} IN ('open', 'settled')`),
  sessionSubtotalCheck: check("session_subtotal_check", sql`${table.subtotal}::numeric >= 0`),
  sessionTaxCheck: check("session_tax_check", sql`${table.taxAmount}::numeric >= 0`),
  sessionServiceChargeCheck: check("session_service_charge_check", sql`${table.serviceCharge}::numeric >= 0`),
  sessionDiscountCheck: check("session_discount_check", sql`${table.discountAmount}::numeric >= 0`),
  sessionFinalTotalCheck: check("session_final_total_check", sql`${table.finalTotal}::numeric >= 0`),
}));

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Category entity: groups menu items (e.g., "Coffee", "Pastries")
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  displayOrder: integer("displayOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * MenuItem entity: represents a menu item (coffee, pastry, etc.)
 */
export const menuItems = pgTable("menuItems", {
  id: serial("id").primaryKey(),
  categoryId: integer("categoryId").notNull().references(() => categories.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("imageUrl"),
  isAvailable: boolean("isAvailable").default(true).notNull(),
  badge: varchar("badge", { length: 50 }),
  foodType: varchar("foodType", { length: 50 }).default("veg").notNull(),
  displayOrder: integer("displayOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  categoryIdIdx: index("categoryId_idx").on(table.categoryId),
  menuItemPriceCheck: check("menuitem_price_check", sql`${table.price}::numeric >= 0`),
  menuItemIsAvailableIdx: index("menuItems_isAvailable_idx").on(table.isAvailable),
  menuItemFoodTypeCheck: check("menuitem_foodtype_check", sql`${table.foodType} IN ('veg', 'non-veg', 'vegan')`),
}));

export type MenuItem = typeof menuItems.$inferSelect;
export type InsertMenuItem = typeof menuItems.$inferInsert;

/**
 * Order entity: represents a single order submission.
 */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  submissionId: varchar("submissionId", { length: 64 }).notNull().unique(),
  deviceToken: varchar("deviceToken", { length: 64 }).notNull(),
  orderStatus: varchar("orderStatus", { length: 50 }).default("received").notNull(),
  orderNumber: integer("orderNumber").notNull().unique(),
  paymentMethod: varchar("paymentMethod", { length: 32 }),
  paymentStatus: varchar("paymentStatus", { length: 32 }).default("pending").notNull(),
  submittedAt: timestamp("submittedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("ord_sessionId_idx").on(table.sessionId),
  submittedAtIdx: index("orders_submittedAt_idx").on(table.submittedAt),
  orderNumberIdx: index("orders_orderNumber_idx").on(table.orderNumber),
  orderStatusCheck: check("order_status_check", sql`${table.orderStatus} IN ('received', 'preparing', 'ready', 'delivered', 'cancelled')`),
  orderPaymentStatusCheck: check("order_payment_status_check", sql`${table.paymentStatus} IN ('pending', 'paid', 'failed', 'refunded')`),
}));

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * OrderItem entity: represents individual items within an order.
 */
export const orderItems = pgTable("orderItems", {
  id: serial("id").primaryKey(),
  orderId: integer("orderId").notNull().references(() => orders.id, { onDelete: "cascade" }),
  menuItemId: integer("menuItemId").notNull().references(() => menuItems.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  priceAtOrderTime: decimal("priceAtOrderTime", { precision: 10, scale: 2 }).notNull(),
  specialInstructions: text("specialInstructions"),
  delivered: boolean("delivered").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index("orderId_idx").on(table.orderId),
  menuItemIdIdx: index("menuItemId_idx").on(table.menuItemId),
  orderItemQuantityCheck: check("orderitem_quantity_check", sql`${table.quantity} > 0`),
}));

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

/**
 * SessionEditLog entity: audit trail for admin edits to a session.
 */
export const sessionEditLogs = pgTable("sessionEditLogs", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  changedBy: integer("changedBy").references(() => users.id, { onDelete: "set null" }),
  changeType: varchar("changeType", { length: 50 }).notNull(),
  itemId: integer("itemId"),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  reason: text("reason"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("sel_sessionId_idx").on(table.sessionId),
  timestampIdx: index("sel_timestamp_idx").on(table.timestamp),
}));

export type SessionEditLog = typeof sessionEditLogs.$inferSelect;
export type InsertSessionEditLog = typeof sessionEditLogs.$inferInsert;

/**
 * OrderHistory entity: snapshot of a settled session for admin reporting.
 */
export const orderHistories = pgTable("orderHistories", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().unique().references(() => sessions.id, { onDelete: "cascade" }),
  tableId: integer("tableId").references(() => tables.id, { onDelete: "set null" }),
  tableLabel: varchar("tableLabel", { length: 64 }).notNull(),
  itemsSnapshot: json("itemsSnapshot").notNull(),
  editsSnapshot: json("editsSnapshot").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 10, scale: 2 }).notNull(),
  serviceCharge: decimal("serviceCharge", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discountAmount", { precision: 10, scale: 2 }).notNull(),
  discountReason: text("discountReason"),
  finalTotal: decimal("finalTotal", { precision: 10, scale: 2 }).notNull(),
  customerName: varchar("customerName", { length: 128 }),
  customerPhone: varchar("customerPhone", { length: 20 }),
  settledBy: integer("settledBy").notNull().references(() => users.id, { onDelete: "set null" }),
  settledAt: timestamp("settledAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("oh_sessionId_idx").on(table.sessionId),
  settledAtIdx: index("oh_settledAt_idx").on(table.settledAt),
  ohSubtotalCheck: check("oh_subtotal_check", sql`${table.subtotal}::numeric >= 0`),
  ohFinalTotalCheck: check("oh_final_total_check", sql`${table.finalTotal}::numeric >= 0`),
}));

export type OrderHistory = typeof orderHistories.$inferSelect;
export type InsertOrderHistory = typeof orderHistories.$inferInsert;

/**
 * DeviceRateLimit entity: tracks per-device submission rates.
 */
export const deviceRateLimits = pgTable("deviceRateLimits", {
  id: serial("id").primaryKey(),
  deviceToken: varchar("deviceToken", { length: 64 }).notNull().unique(),
  lastSubmissionAt: timestamp("lastSubmissionAt").defaultNow().notNull(),
  submissionCount: integer("submissionCount").default(0).notNull(),
  windowResetAt: timestamp("windowResetAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
}));

export type DeviceRateLimit = typeof deviceRateLimits.$inferSelect;
export type InsertDeviceRateLimit = typeof deviceRateLimits.$inferInsert;



/**
 * Feedback entity: captures customer ratings and comments.
 */
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull().unique().references(() => sessions.id, { onDelete: "cascade" }),
  tableLabel: varchar("tableLabel", { length: 64 }).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("fb_sessionId_idx").on(table.sessionId),
  createdAtIdx: index("fb_createdAt_idx").on(table.createdAt),
  feedbackRatingCheck: check("feedback_rating_check", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
  feedbackRatingIdx: index("feedback_rating_idx").on(table.rating),
}));

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;

/**
 * Business settings entity: stores cafe-level configuration.
 */
// Note: businessSettings should only have one row. Enforce in application code.
export const businessSettings = pgTable("businessSettings", {
  id: serial("id").primaryKey(),
  restaurantName: varchar("restaurantName", { length: 256 }),
  legalBusinessName: varchar("legalBusinessName", { length: 256 }),
  gstNumber: varchar("gstNumber", { length: 20 }),
  fssaiNumber: varchar("fssaiNumber", { length: 50 }),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 256 }),
  address: varchar("address", { length: 512 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 128 }),
  pincode: varchar("pincode", { length: 16 }),
  logoUrl: text("logoUrl"),
  gstEnabled: boolean("gstEnabled").default(false).notNull(),
  gstRate: integer("gstRate").default(18).notNull(),
  invoicePrefix: varchar("invoicePrefix", { length: 32 }).default("INV-").notNull(),
  footerMessage: text("footerMessage"),
  senderName: text("sender_name"),
  replyToEmail: varchar("reply_to_email", { length: 256 }),
  autoSendInvoice: boolean("auto_send_invoice").default(false),
  printerIp: varchar("printerIp", { length: 64 }),
  printerPort: integer("printerPort").default(9100).notNull(),
  upiId: varchar("upiId", { length: 128 }),
  tagline: varchar("tagline", { length: 512 }),
  brandDescription: text("brandDescription"),
  sinceYear: integer("sinceYear"),
  averageRating: decimal("averageRating", { precision: 3, scale: 1 }),
  serviceChargePercentage: decimal("serviceChargePercentage", { precision: 5, scale: 2 }).default("0").notNull(),
  inactivityWindowMinutes: integer("inactivityWindowMinutes").default(75).notNull(),
  currency: varchar("currency", { length: 10 }).default("INR"),
  time_format: varchar("time_format", { length: 10 }).default("12h"),
  date_format: varchar("date_format", { length: 20 }).default("DD/MM/YYYY"),
  restaurant_status: varchar("restaurant_status", { length: 20 }).default("open"),
  review_link: text("review_link"),
  accent_color: varchar("accent_color", { length: 20 }).default("#C08A4D"),
  notif_enabled: boolean("notif_enabled").default(true),
  saveInvoiceCustomerInfo: boolean("saveInvoiceCustomerInfo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BusinessSettings = typeof businessSettings.$inferSelect;
export type InsertBusinessSettings = typeof businessSettings.$inferInsert;

/**
 * User profiles entity: links Supabase auth users to app roles.
 */
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  authUserId: varchar("auth_user_id", { length: 64 }).notNull().unique(),
  profileImageUrl: text("profile_image_url"),
  name: text("name"),
  phone: varchar("phone", { length: 32 }),
  language: varchar("language", { length: 20 }).default("en"),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Kolkata"),
  lastLoginAt: timestamp("last_login_at"),
  restaurantId: integer("restaurant_id"),
  role: varchar("role", { length: 50 }).default("staff").notNull(),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  employeeId: varchar("employee_id", { length: 32 }),
  department: varchar("department", { length: 64 }),
  branch: varchar("branch", { length: 128 }),
  shift: varchar("shift", { length: 32 }),
  shiftTiming: varchar("shift_timing", { length: 64 }),
  reportingManager: varchar("reporting_manager", { length: 128 }),
  employmentStatus: varchar("employment_status", { length: 20 }).default("active"),
  emergencyContactName: varchar("emergency_contact_name", { length: 128 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 32 }),
  emergencyContactRelationship: varchar("emergency_contact_relationship", { length: 64 }),
  notifOrder: boolean("notif_order").default(true),
  notifSystem: boolean("notif_system").default(true),
  notifEmail: boolean("notif_email").default(true),
  attendanceClockIn: timestamp("attendance_clock_in"),
  attendanceClockOut: timestamp("attendance_clock_out"),
  attendanceDate: timestamp("attendance_date"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  authUserIdIdx: index("auth_user_id_idx").on(table.authUserId),
  userProfileRoleCheck: check("user_profile_role_check", sql`${table.role} IN ('admin', 'staff')`),
}));

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

/**
 * LeaveRequest entity: staff leave/half-day applications.
 */
export const leaveRequests = pgTable("leaveRequests", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  leaveType: varchar("leave_type", { length: 20 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  reviewedBy: varchar("reviewed_by", { length: 64 }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("lr_userId_idx").on(table.userId),
  dateIdx: index("lr_date_idx").on(table.date),
  statusIdx: index("lr_status_idx").on(table.status),
  lrLeaveTypeCheck: check("lr_leave_type_check", sql`${table.leaveType} IN ('holiday', 'half-day')`),
  lrStatusCheck: check("lr_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
}));

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = typeof leaveRequests.$inferInsert;

/**
 * InventoryItem entity: raw material / supply stock tracking.
 */
export const inventoryItems = pgTable("inventoryItems", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 64 }),
  currentStock: decimal("currentStock", { precision: 12, scale: 3 }).default("0").notNull(),
  unit: varchar("unit", { length: 16 }).notNull(),
  minimumStock: decimal("minimumStock", { precision: 12, scale: 3 }).default("0").notNull(),
  maximumStock: decimal("maximumStock", { precision: 12, scale: 3 }).default("0").notNull(),
  purchasePrice: decimal("purchasePrice", { precision: 10, scale: 2 }).default("0").notNull(),
  supplier: varchar("supplier", { length: 128 }),
  lastRestockedAt: timestamp("lastRestockedAt"),
  expiryDate: timestamp("expiryDate"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("inv_category_idx").on(table.category),
  nameIdx: index("inv_name_idx").on(table.name),
  supplierIdx: index("inv_supplier_idx").on(table.supplier),
  invCategoryCheck: check("inv_category_check", sql`${table.category} IN ('Coffee Beans', 'Tea', 'Milk & Dairy', 'Bread & Bakery', 'Vegetables', 'Fruits', 'Sauces', 'Syrups', 'Spices', 'Beverages', 'Packaging', 'Cleaning Supplies', 'Other')`),
  invUnitCheck: check("inv_unit_check", sql`${table.unit} IN ('kg', 'g', 'L', 'ml', 'pcs', 'bottles', 'packets', 'boxes')`),
}));

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = typeof inventoryItems.$inferInsert;

/**
 * InventoryHistory entity: audit trail for every stock change.
 */
export const inventoryHistory = pgTable("inventoryHistory", {
  id: serial("id").primaryKey(),
  itemId: integer("itemId").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  itemName: varchar("itemName", { length: 128 }).notNull(),
  quantityChanged: decimal("quantityChanged", { precision: 12, scale: 3 }).notNull(),
  beforeQuantity: decimal("beforeQuantity", { precision: 12, scale: 3 }).notNull(),
  afterQuantity: decimal("afterQuantity", { precision: 12, scale: 3 }).notNull(),
  action: varchar("action", { length: 16 }).notNull(),
  reason: varchar("reason", { length: 32 }).notNull(),
  userId: varchar("userId", { length: 64 }),
  userName: varchar("userName", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  itemIdIdx: index("invhist_itemId_idx").on(table.itemId),
  actionIdx: index("invhist_action_idx").on(table.action),
  createdAtIdx: index("invhist_createdAt_idx").on(table.createdAt),
  invhistActionCheck: check("invhist_action_check", sql`${table.action} IN ('add', 'remove')`),
  invhistReasonCheck: check("invhist_reason_check", sql`${table.reason} IN ('Purchase', 'Waste', 'Damage', 'Expired', 'Correction', 'Other')`),
}));

export type InventoryHistoryEntry = typeof inventoryHistory.$inferSelect;
export type InsertInventoryHistoryEntry = typeof inventoryHistory.$inferInsert;
