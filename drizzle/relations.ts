import { relations } from "drizzle-orm";
import {
  users,
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
  businessSettings,
  userProfiles,
} from "./schema";

export const tablesRelations = relations(tables, ({ one }) => ({
  activeSession: one(sessions, {
    fields: [tables.activeSessionId],
    references: [sessions.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  table: one(tables, {
    fields: [sessions.tableId],
    references: [tables.id],
  }),
  orders: many(orders),
  feedback: one(feedback, {
    fields: [sessions.id],
    references: [feedback.sessionId],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  session: one(sessions, {
    fields: [orders.sessionId],
    references: [sessions.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  category: one(categories, {
    fields: [menuItems.categoryId],
    references: [categories.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  menuItems: many(menuItems),
}));

export const sessionEditLogsRelations = relations(sessionEditLogs, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionEditLogs.sessionId],
    references: [sessions.id],
  }),
}));

export const orderHistoriesRelations = relations(orderHistories, ({ one }) => ({
  session: one(sessions, {
    fields: [orderHistories.sessionId],
    references: [sessions.id],
  }),
}));

export const feedbackRelations = relations(feedback, ({ one }) => ({
  session: one(sessions, {
    fields: [feedback.sessionId],
    references: [sessions.id],
  }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.authUserId],
    references: [users.openId],
  }),
}));
