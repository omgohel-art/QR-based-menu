import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { getUserIdFromToken } from "./authRoutes";
import { fetchPrinterSettings, deliverOrQueue, sanitizeReceiptField, center, boldOn, boldOff, normalText, bigText, divider, left, padRight, padLeft, thinDivider, cut } from "./printRoutes";

const router = Router();

interface AutoKotItem {
  name: string;
  quantity: number;
  notes?: string;
}

// POST /api/print-kot/auto  — fired by the server after a new order is accepted.
// Looks up the configured printer, builds a minimal KOT payload, and delivers it.
// Returns { skipped: true } when no printer is configured (so callers can ignore
// without breaking the order flow).
router.post("/api/print-kot/auto", async (req: Request, res: Response) => {
  try {
    const { orderId, orderNumber, tableLabel, items } = req.body as {
      orderId: number | string;
      orderNumber?: number | string;
      tableLabel?: string;
      items: AutoKotItem[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items[] required" });
    }

    // Look up printer settings from business config. We deliberately allow
    // either an authenticated caller or a trusted server-side call by passing
    // through with no token — fetchPrinterSettings reads from the DB directly.
    const settings = await fetchPrinterSettings(undefined).catch(() => ({
      printerIp: "",
      printerPort: 9100,
    }));

    if (!settings.printerIp) {
      return res.json({ skipped: true, reason: "no_printer_configured" });
    }

    const now = new Date();
    const k = {
      orderNumber: String(orderNumber ?? orderId ?? "---"),
      table: sanitizeReceiptField(String(tableLabel ?? "Unknown")),
      date: now.toLocaleDateString("en-IN"),
      time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      type: "DINE-IN",
      items: items.map((it) => ({
        name: sanitizeReceiptField(String(it.name || "")),
        qty: it.quantity || 1,
        variantSelections: [],
        specialInstructions: it.notes ? sanitizeReceiptField(String(it.notes)) : "",
      })),
    };

    let doc = "";
    doc += center(boldOn() + bigText() + "KOT" + normalText() + boldOff());
    doc += center(`Order #: ${k.orderNumber}`);
    doc += center(boldOn() + `Table: ${k.table}` + boldOff());
    doc += center(`Type: ${k.type}`);
    doc += center(`${k.date} ${k.time}`);
    doc += "\n";
    doc += divider();
    doc += left(boldOn() + padRight("Item", 40) + padLeft("Qty", 6) + boldOff());
    doc += thinDivider();
    for (const item of k.items) {
      doc += left(boldOn() + padRight(item.name.substring(0, 40), 40) + padLeft(String(item.qty), 6) + boldOff());
      if (item.specialInstructions) {
        doc += left(`  * ${item.specialInstructions}`);
      }
      doc += "\n";
    }
    doc += divider();
    doc += "\n\n\n";
    doc += cut();

    const buffer = Buffer.from(doc, "ascii");
    const result = await deliverOrQueue("kot", settings.printerIp, settings.printerPort, buffer);
    res.json({ skipped: false, mode: result.mode, jobId: result.jobId });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Failed to print KOT";
    console.error("[print-kot/auto] error:", message);
    // Don't fail the parent flow — KOT printing is best-effort.
    res.status(200).json({ skipped: true, reason: "error", error: message });
  }
});

// GET /api/print-kot/test  — admin-only health check that prints "TEST".
router.get("/api/print-kot/test", async (req: Request, res: Response) => {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) return res.status(401).json({ error: "Auth required" });

    const settings = await fetchPrinterSettings(undefined).catch(() => ({
      printerIp: "",
      printerPort: 9100,
    }));
    if (!settings.printerIp) {
      return res.status(400).json({ error: "No printer configured in business settings" });
    }
    const doc = center(boldOn() + bigText() + "TEST PRINT" + normalText() + boldOff()) +
      center(`Printer at ${settings.printerIp}:${settings.printerPort}`) +
      center(new Date().toLocaleString("en-IN")) +
      "\n\n\n\n" +
      cut();
    const buffer = Buffer.from(doc, "ascii");
    const result = await deliverOrQueue("kot", settings.printerIp, settings.printerPort, buffer);
    res.json({ success: true, mode: result.mode });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Test print failed" });
  }
});

export default router;
