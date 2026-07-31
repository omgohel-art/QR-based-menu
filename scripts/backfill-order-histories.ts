import "dotenv/config";
import postgres from "postgres";

async function backfill() {
  const client = postgres(process.env.DATABASE_URL!);

  // Find settled sessions without orderHistory using raw SQL
  const settled = await client.unsafe(`
    SELECT s.id, s."tableId", s."subtotal", s."taxAmount", s."serviceCharge",
           s."discountAmount", s."discountReason", s."finalTotal",
           s."customerName", s."customerPhone", s."settledBy", s."settledAt",
           t.label as "tableLabel"
    FROM sessions s
    LEFT JOIN tables t ON s."tableId" = t.id
    WHERE s.status = 'settled'
      AND NOT EXISTS (SELECT 1 FROM "orderHistories" oh WHERE oh."sessionId" = s.id)
  `);

  console.log(`Found ${settled.length} settled sessions without orderHistory`);

  for (const s of settled) {
    try {
      // Get items snapshot
      const orderIds = (await client.unsafe(
        `SELECT id FROM orders WHERE "sessionId" = $1`, [s.id]
      )).map((o: any) => o.id);

      let itemsSnapshot: any[] = [];
      if (orderIds.length > 0) {
        itemsSnapshot = await client.unsafe(
          `SELECT "menuItemId", quantity, "priceAtOrderTime" as "priceAtOrderTime", "specialInstructions"
           FROM "orderItems" WHERE "orderId" IN (${orderIds.join(",")})`
        );
        itemsSnapshot = itemsSnapshot.map((item: any) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          priceAtOrderTime: parseFloat(item.priceAtOrderTime || "0"),
          specialInstructions: item.specialInstructions,
        }));
      }

      // Get edits snapshot
      const editsSnapshot = (await client.unsafe(
        `SELECT "changeType", "oldValue", "newValue", "reason", "changedBy", timestamp
         FROM "sessionEditLogs" WHERE "sessionId" = $1`, [s.id]
      )).map((e: any) => ({
        changeType: e.changeType,
        oldValue: e.oldValue,
        newValue: e.newValue,
        reason: e.reason,
        changedBy: e.changedBy,
        timestamp: e.timestamp,
      }));

      // Insert with raw SQL
      await client.unsafe(`
        INSERT INTO "orderHistories"
          ("sessionId", "tableLabel", "itemsSnapshot", "editsSnapshot",
           "subtotal", "taxAmount", "serviceCharge", "discountAmount", "discountReason",
           "finalTotal", "customerName", "customerPhone", "settledBy", "settledAt")
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        s.id, s.tableLabel || "Unknown",
        JSON.stringify(itemsSnapshot), JSON.stringify(editsSnapshot),
        s.subtotal || "0", s.taxAmount || "0", s.serviceCharge || "0",
        s.discountAmount || "0", s.discountReason || null,
        s.finalTotal || "0", s.customerName || null, s.customerPhone || null,
        s.settledBy || 1, s.settledAt
      ]);

      console.log(`  Backfilled session ${s.id}`);
    } catch (err: any) {
      console.error(`  Failed session ${s.id}: ${err.message}`);
    }
  }

  console.log("Done.");
  await client.end();
}

backfill().catch(console.error);
