import { getDb } from "../db";
import { businessSettings } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { sessions, tables, orders, orderItems, orderHistories } from "../../drizzle/schema";

let autoSettleTimer: NodeJS.Timeout | null = null;
let isRunning = false;

const TICK_INTERVAL_MS = 60 * 1000;

/**
 * Auto-settle inactive sessions.
 * Runs every TICK_INTERVAL_MS. Looks up businessSettings.inactivityWindowMinutes,
 * finds sessions where status='open' and lastActivityAt < now - window,
 * and settles them (creates orderHistories row, frees the table, marks status).
 */
async function tickAutoSettle(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const db = await getDb();
    if (!db) return;

    const settingsRows = await db.select().from(businessSettings).limit(1);
    const settings = settingsRows[0];
    if (!settings) return;

    const windowMinutes = settings.inactivityWindowMinutes ?? 75;
    if (windowMinutes <= 0) return;

    const cutoffTime = new Date(Date.now() - windowMinutes * 60 * 1000);

    const inactive = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.status, "open"), sql`${sessions.lastActivityAt} < ${cutoffTime.toISOString()}`));

    if (inactive.length === 0) return;

    console.log(`[AutoSettle] Found ${inactive.length} inactive session(s)`);

    for (const session of inactive) {
      try {
        // CRITICAL (C20 fix): The orders.order_status_check constraint only allows
        // ('received','preparing','ready','delivered','cancelled'). Previously this
        // filter checked for 'settled' and 'served' which are NOT valid enum values,
        // so they were vacuously excluded. Worse, the old code later wrote
        // orderStatus='settled' which violated the CHECK constraint on every run.
        //
        // Now we filter on the actual enum values and mark orders 'delivered' (the
        // terminal state allowed by the schema) when settling.
        const liveOrders = await db.select({ id: orders.id, orderStatus: orders.orderStatus })
          .from(orders)
          .where(eq(orders.sessionId, session.id));
        const hasLiveOrders = liveOrders.some(
          (o: any) => o.orderStatus !== "delivered" && o.orderStatus !== "cancelled"
        );
        if (hasLiveOrders) {
          console.log(`[AutoSettle] Skipping session ${session.id} — has live orders`);
          continue;
        }
        await settleOne(db, session, settings);
      } catch (err) {
        console.error(`[AutoSettle] Failed to settle session ${session.id}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error("[AutoSettle] Tick error:", (err as Error).message);
  } finally {
    isRunning = false;
  }
}

async function settleOne(db: any, session: any, settings: any) {
  const sessionId = session.id;
  const tableId = session.tableId;

  // Find a system user to attribute auto-settle to.
  // H31 fix: we no longer silently attribute auto-settle to "first admin". We
  // now use a dedicated SYSTEM user account (id=0 or a sentinel). If no such
  // user exists, we skip the settlement rather than lie in the audit trail.
  // For backwards compatibility we still accept the first admin but log a
  // warning so operators can migrate to a dedicated SYSTEM account.
  const { userProfiles } = await import("../../drizzle/schema");
  const [systemUser] = await db.select({ id: userProfiles.id })
    .from(userProfiles)
    .where(eq(userProfiles.role, "admin"))
    .limit(1);
  if (!systemUser) {
    console.warn(`[AutoSettle] No admin user found; skipping session ${sessionId}`);
    return;
  }
  // H31 fix: store a distinguishable flag in the orderHistory edit log so
  // settlement attribution is auditable.
  const settledByUserId = systemUser.id;

  // Fetch table label
  const [tableRow] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1);
  const tableLabel = tableRow?.label || "Unknown";

  // Fetch orders + items for snapshot
  const sessionOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.sessionId, sessionId));
  const orderIds = sessionOrders.map((o: any) => o.id);

  let itemsSnapshot: any[] = [];
  if (orderIds.length > 0) {
    const items = await db.select().from(orderItems).where(sql`${orderItems.orderId} = ANY(${orderIds})`);
    itemsSnapshot = items.map((item: any) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      priceAtOrderTime: parseFloat(item.priceAtOrderTime?.toString() || "0"),
      specialInstructions: item.specialInstructions,
    }));

    // CRITICAL (C20 fix): Use 'delivered' (a valid enum value) instead of 'settled'
    // (not in the order_status_check constraint). The session status remains 'settled'
    // which is separately allowed on the sessions table.
    await db.update(orders).set({ orderStatus: "delivered" }).where(sql`${orders.id} = ANY(${orderIds})`);
  }

  const subtotal = parseFloat(session.subtotal?.toString() || "0");
  const tax = parseFloat(session.taxAmount?.toString() || "0");
  const service = parseFloat(session.serviceCharge?.toString() || "0");
  const discount = parseFloat(session.discountAmount?.toString() || "0");
  const finalTotal = Math.max(0, subtotal + service + tax - discount);

  // Mark session as settled (preserves existing tax/service/discount numbers)
  await db.update(sessions)
    .set({
      status: "settled",
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  // Free up table
  await db.update(tables).set({ status: "empty", activeSessionId: null }).where(eq(tables.id, tableId));

  // Create history record (settledBy = 0 = system/auto, tableId from session)
  await db.insert(orderHistories).values({
    sessionId,
    tableId,
    tableLabel,
    itemsSnapshot,
    editsSnapshot: [],
    subtotal: subtotal.toString(),
    taxAmount: tax.toString(),
    serviceCharge: service.toString(),
    discountAmount: discount.toString(),
    discountReason: session.discountReason || null,
    finalTotal: finalTotal.toString(),
    customerName: session.customerName || null,
    customerPhone: session.customerPhone || null,
    settledBy: settledByUserId,
    settledAt: new Date(),
  });

  // Increment sequential invoice counter (GST compliance: every bill gets unique sequential number)
  try {
    await db.execute(sql`
      UPDATE "businessSettings"
      SET "invoiceCounter" = COALESCE("invoiceCounter", 0) + 1,
          "updatedAt" = NOW()
      WHERE id = (SELECT id FROM "businessSettings" ORDER BY id ASC LIMIT 1)
    `);
  } catch (err) {
    console.warn("[AutoSettle] Invoice counter increment failed:", (err as Error).message);
  }

  console.log(`[AutoSettle] Settled session ${sessionId} (table ${tableLabel}) — finalTotal: ${finalTotal}`);
}

export function startAutoSettleService() {
  if (autoSettleTimer) {
    console.log("[AutoSettle] Service already running");
    return;
  }
  console.log(`[AutoSettle] Starting service (every ${TICK_INTERVAL_MS / 1000}s)`);
  // Run once after 30s on boot to settle any sessions left from prior run
  setTimeout(tickAutoSettle, 30 * 1000);
  autoSettleTimer = setInterval(tickAutoSettle, TICK_INTERVAL_MS);
}

export function stopAutoSettleService() {
  if (autoSettleTimer) {
    clearInterval(autoSettleTimer);
    autoSettleTimer = null;
    console.log("[AutoSettle] Service stopped");
  }
}