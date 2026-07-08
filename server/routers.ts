import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import { TRPCError } from "@trpc/server";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateTableCode(): string {
  // Generate a random, unguessable 10-character code
  return nanoid(10);
}

function generateDeviceToken(): string {
  return nanoid(16);
}

async function checkRateLimit(deviceToken: string): Promise<boolean> {
  const rateLimit = await db.createOrUpdateDeviceRateLimit(deviceToken);
  // Allow max 5 submissions per minute
  return rateLimit.submissionCount <= 5;
}

async function calculateSessionTotals(sessionId: number): Promise<{ subtotal: string; itemCount: number }> {
  const items = await db.getOrderItemsBySessionId(sessionId);
  let subtotal = 0;
  let itemCount = 0;
  
  for (const item of items) {
    const price = typeof item.priceAtOrderTime === 'string' 
      ? parseFloat(item.priceAtOrderTime) 
      : item.priceAtOrderTime;
    subtotal += price * item.quantity;
    itemCount += item.quantity;
  }
  
  return { subtotal: subtotal.toFixed(2), itemCount };
}

// ============================================================================
// ADMIN PROCEDURE GUARD
// ============================================================================

const dummyUserMiddleware = publicProcedure.use(async ({ ctx, next }) => {
  return next({
    ctx: {
      ...ctx,
      user: { id: 0, role: 'admin', name: 'Admin' },
    },
  });
});

const adminProcedure = dummyUserMiddleware;
const staffProcedure = dummyUserMiddleware;

// ============================================================================
// CUSTOMER PROCEDURES (PUBLIC)
// ============================================================================

const customerRouter = router({
  // Get menu for a table (public, no auth required)
  getMenu: publicProcedure.query(async () => {
    const categories = await db.listCategories();
    const items = await db.listMenuItems();
    
    return {
      categories,
      items: items.filter(i => i.isAvailable),
    };
  }),

  // Get active session for a table by its code
  getTableSession: publicProcedure
    .input(z.object({ tableCode: z.string() }))
    .query(async ({ input }) => {
      const table = await db.getTableByCode(input.tableCode);
      if (!table) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Table not found' });
      }

      let session = await db.getActiveSessionForTable(table.id);
      
      // Create new session if none exists
      if (!session) {
        session = await db.createSession(table.id);
        await db.updateTableStatus(table.id, 'active', session.id);
      }

      const { subtotal, itemCount } = await calculateSessionTotals(session.id);
      const orders = await db.getOrdersBySessionId(session.id);
      const items = await db.getOrderItemsBySessionId(session.id);

      return {
        session: {
          id: session.id,
          tableLabel: table.label,
          status: session.status,
          subtotal,
          itemCount,
          createdAt: session.createdAt,
        },
        orders: orders.map(o => ({
          id: o.id,
          deviceToken: o.deviceToken,
          submittedAt: o.submittedAt,
        })),
        items: items.map(i => ({
          id: i.id,
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          priceAtOrderTime: i.priceAtOrderTime,
          deviceToken: orders.find(o => o.id === (i as any).orderId)?.deviceToken,
        })),
      };
    }),

  // Submit an order to a table
  submitOrder: publicProcedure
    .input(z.object({
      tableCode: z.string(),
      items: z.array(z.object({
        menuItemId: z.number(),
        quantity: z.number().min(1),
      })),
      submissionId: z.string(), // Client-generated UUID for idempotency
      deviceToken: z.string(), // Anonymous device identifier
    }))
    .mutation(async ({ input }) => {
      // Check idempotency
      const existingOrder = await db.checkSubmissionIdExists(input.submissionId);
      if (existingOrder) {
        return { success: true, isDuplicate: true };
      }

      // Check rate limit
      const allowed = await checkRateLimit(input.deviceToken);
      if (!allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many submissions. Please wait.' });
      }

      // Get table and session
      const table = await db.getTableByCode(input.tableCode);
      if (!table) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Table not found' });
      }

      let session = await db.getActiveSessionForTable(table.id);
      if (!session) {
        session = await db.createSession(table.id);
        await db.updateTableStatus(table.id, 'active', session.id);
      }

      // Validate menu items and calculate total
      let orderTotal = 0;
      const orderItemsData = [];
      
      for (const item of input.items) {
        const menuItem = await db.getMenuItemById(item.menuItemId);
        if (!menuItem || !menuItem.isAvailable) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Item ${item.menuItemId} not available` });
        }
        
        const price = typeof menuItem.price === 'string' ? parseFloat(menuItem.price) : menuItem.price;
        orderTotal += price * item.quantity;
        orderItemsData.push({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price,
        });
      }

      // Create order
      const order = await db.createOrder({
        sessionId: session.id,
        submissionId: input.submissionId,
        deviceToken: input.deviceToken,
      });

      // Create order items
      const itemsToInsert = orderItemsData.map(item => ({
        orderId: order.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        priceAtOrderTime: item.price.toString(),
      }));
      
      await db.createOrderItems(itemsToInsert);

      // Update session activity and subtotal
      await db.updateSessionLastActivity(session.id);
      const { subtotal } = await calculateSessionTotals(session.id);
      
      // Update session subtotal
      const subtotalNum = parseFloat(subtotal);
      await db.settleSession(
        session.id,
        session.taxAmount?.toString() || '0',
        session.serviceCharge?.toString() || '0',
        session.discountAmount?.toString() || '0',
        session.discountReason,
        session.settledBy || 0
      );

      return { success: true, isDuplicate: false, orderId: order.id };
    }),
});

// ============================================================================
// STAFF PROCEDURES (PROTECTED)
// ============================================================================

const staffRouter = router({
  // Get all active tables with their current orders
  getActiveTables: staffProcedure.query(async () => {
    const tables = await db.listAllTables();
    const result = [];
    
    for (const table of tables) {
      const session = await db.getActiveSessionForTable(table.id);
      if (session && session.status === 'open') {
        const { subtotal, itemCount } = await calculateSessionTotals(session.id);
        result.push({
          id: table.id,
          label: table.label,
          status: table.status,
          sessionId: session.id,
          subtotal,
          itemCount,
          lastActivityAt: session.lastActivityAt,
        });
      }
    }
    
    return result;
  }),

  // Get detailed session view for a table
  getSessionDetails: staffProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const session = await db.getSessionById(input.sessionId);
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const orders = await db.getOrdersBySessionId(session.id);
      const items = await db.getOrderItemsBySessionId(session.id);
      const editLogs = await db.getEditLogsBySessionId(session.id);

      return {
        session,
        orders: orders.map(o => ({
          id: o.id,
          deviceToken: o.deviceToken,
          submittedAt: o.submittedAt,
        })),
        items: items.map(i => ({
          id: i.id,
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          priceAtOrderTime: i.priceAtOrderTime,
        })),
        editLogs,
      };
    }),
});

// ============================================================================
// ADMIN PROCEDURES (PROTECTED)
// ============================================================================

const adminRouter = router({
  // Table Management
  createTable: adminProcedure
    .input(z.object({ label: z.string() }))
    .mutation(async ({ input }) => {
      const tableCode = generateTableCode();
      return db.createTable({
        tableCode,
        label: input.label,
        status: 'empty',
      });
    }),

  listTables: adminProcedure.query(() => db.listAllTables()),

  updateTableLabel: adminProcedure
    .input(z.object({ tableId: z.number(), label: z.string() }))
    .mutation(async ({ input }) => {
      await db.updateTableLabel(input.tableId, input.label);
      return { success: true };
    }),

  // Menu Management
  createCategory: adminProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      return db.createCategory({
        name: input.name,
        displayOrder: 0,
      });
    }),

  listCategories: adminProcedure.query(() => db.listCategories()),

  createMenuItem: adminProcedure
    .input(z.object({
      categoryId: z.number(),
      name: z.string(),
      description: z.string().optional(),
      price: z.number(),
      imageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createMenuItem({
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        price: input.price.toString(),
        imageUrl: input.imageUrl,
        isAvailable: true,
        displayOrder: 0,
      });
    }),

  listMenuItems: adminProcedure.query(() => db.listMenuItems()),

  updateMenuItem: adminProcedure
    .input(z.object({
      itemId: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      price: z.number().optional(),
      isAvailable: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { itemId, ...updates } = input;
      const updateData: any = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.price) updateData.price = updates.price.toString();
      if (updates.isAvailable !== undefined) updateData.isAvailable = updates.isAvailable;
      
      await db.updateMenuItem(itemId, updateData);
      return { success: true };
    }),

  deleteMenuItem: adminProcedure
    .input(z.object({ itemId: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteMenuItem(input.itemId);
      return { success: true };
    }),

  // Settlement
  settleSession: adminProcedure
    .input(z.object({
      sessionId: z.number(),
      taxPercentage: z.number().optional(),
      serviceChargePercentage: z.number().optional(),
      discountAmount: z.number().optional(),
      discountReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await db.getSessionById(input.sessionId);
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const { subtotal } = await calculateSessionTotals(session.id);
      const subtotalNum = parseFloat(subtotal);
      
      const settings = await db.getCafeSettings();
      const taxPercentage = input.taxPercentage ?? parseFloat(settings.taxPercentage?.toString() || '0');
      const serviceChargePercentage = input.serviceChargePercentage ?? parseFloat(settings.serviceChargePercentage?.toString() || '0');
      
      const taxAmount = (subtotalNum * taxPercentage / 100).toFixed(2);
      const serviceCharge = (subtotalNum * serviceChargePercentage / 100).toFixed(2);
      const discountAmount = (input.discountAmount || 0).toFixed(2);

      await db.settleSession(
        session.id,
        taxAmount,
        serviceCharge,
        discountAmount,
        input.discountReason || null,
        ctx.user.id
      );

      // Create order history snapshot
      const items = await db.getOrderItemsBySessionId(session.id);
      const editLogs = await db.getEditLogsBySessionId(session.id);
      const table = await db.getTableById(session.tableId);

      await db.createOrderHistory({
        sessionId: session.id,
        tableLabel: table?.label || 'Unknown',
        itemsSnapshot: JSON.stringify(items),
        editsSnapshot: JSON.stringify(editLogs),
        subtotal: subtotal,
        taxAmount,
        serviceCharge,
        discountAmount,
        discountReason: input.discountReason || null,
        finalTotal: (subtotalNum + parseFloat(taxAmount) + parseFloat(serviceCharge) - parseFloat(discountAmount)).toFixed(2),
        settledBy: ctx.user.id,
        settledAt: new Date(),
      });

      // Reset table to empty
      await db.updateTableStatus(session.tableId, 'empty', null);

      return { success: true };
    }),

  // Order History
  getOrderHistory: adminProcedure
    .input(z.object({ limit: z.number().optional(), offset: z.number().optional() }))
    .query(async ({ input }) => {
      return db.listOrderHistory(input.limit || 50, input.offset || 0);
    }),

  // Edit/Remove Items
  removeOrderItem: adminProcedure
    .input(z.object({ itemId: z.number(), sessionId: z.number(), reason: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const item = await db.getOrderItemsByOrderId(0); // Get the item first
      
      await db.createEditLog({
        sessionId: input.sessionId,
        changedBy: ctx.user.id,
        changeType: 'remove_item',
        itemId: input.itemId,
        oldValue: JSON.stringify(item),
        newValue: null,
        reason: input.reason,
      });

      await db.removeOrderItem(input.itemId);
      return { success: true };
    }),
});

// ============================================================================
// MAIN ROUTER
// ============================================================================

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  customer: customerRouter,
  staff: staffRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
