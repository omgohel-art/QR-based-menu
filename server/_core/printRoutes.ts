import express from "express";
import net from "net";
import { randomUUID } from "crypto";
import { supabaseBreaker, fire } from "./circuitBreaker";

const router = express.Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const ALLOW_LAN_PRINT = process.env.ALLOW_LAN_PRINT === "true" || process.env.ALLOW_LAN_PRINT === "1";
const PRINT_AGENT_SECRET = process.env.PRINT_AGENT_SECRET || "";

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

function isPrivateIP(ip: string): boolean {
  return PRIVATE_RANGES.some((range) => range.test(ip));
}

export function sanitizeReceiptField(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

type PrintJob = {
  id: string;
  createdAt: number;
  type: "receipt" | "kot";
  printerIp: string;
  printerPort: number;
  payloadBase64: string;
  claimed: boolean;
};

/** In-memory queue — local print agent polls and prints to LAN thermal printers */
const printJobs: PrintJob[] = [];
const MAX_JOBS = 200;
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneJobs() {
  const cutoff = Date.now() - JOB_TTL_MS;
  while (printJobs.length > 0 && (printJobs[0].createdAt < cutoff || printJobs.length > MAX_JOBS)) {
    printJobs.shift();
  }
}

function enqueueJob(job: Omit<PrintJob, "id" | "createdAt" | "claimed">) {
  pruneJobs();
  const full: PrintJob = {
    ...job,
    id: randomUUID(),
    createdAt: Date.now(),
    claimed: false,
  };
  printJobs.push(full);
  return full;
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  const token = authHeader.slice(7);
  try {
    const response = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      });
      if (!r.ok) throw new Error("Invalid token");
      return r;
    }).catch(() => null);
    if (!response) {
      return res.status(503).json({ error: "Auth service temporarily unavailable" });
    }
    const user = await response.json();
    (req as any).userId = user.id;

    try {
      const profileResp = await fire(supabaseBreaker, async () => {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${user.id}&select=role`,
          { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
        );
        if (!r.ok) throw new Error("Profile fetch failed");
        return r;
      }).catch(() => null);
      if (profileResp) {
        const profiles = await profileResp.json();
        const role = profiles?.[0]?.role;
        if (role !== "staff" && role !== "admin") {
          return res.status(403).json({ error: "Insufficient permissions" });
        }
      }
    } catch {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  } catch {
    return res.status(401).json({ error: "Authentication failed" });
  }
}

function requirePrintAgent(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!PRINT_AGENT_SECRET) {
    return res.status(503).json({ error: "PRINT_AGENT_SECRET not configured on server" });
  }
  const header = req.headers["x-print-agent-token"] || req.headers["authorization"];
  const token =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7)
      : typeof header === "string"
        ? header
        : "";
  if (!token || token !== PRINT_AGENT_SECRET) {
    return res.status(401).json({ error: "Invalid print agent token" });
  }
  next();
}

function sendToPrinter(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(data, () => {
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Printer connection timed out"));
    });
    socket.on("error", (err) => reject(err));
  });
}

function center(text: string): string {
  return `\x1B\x61\x01${text}\n`;
}
export { center };
function left(text: string): string {
  return `\x1B\x61\x00${text}\n`;
}
export { left };
function boldOn(): string {
  return "\x1B\x45\x01";
}
export { boldOn };
function boldOff(): string {
  return "\x1B\x45\x00";
}
export { boldOff };
function bigText(): string {
  return "\x1D\x21\x01";
}
export { bigText };
function normalText(): string {
  return "\x1D\x21\x00";
}
export { normalText };
function divider(): string {
  return "\x1B\x61\x00" + "-".repeat(48) + "\n";
}
export { divider };
function thinDivider(): string {
  return "\x1B\x61\x00" + ".".repeat(48) + "\n";
}
export { thinDivider };
function cut(): string {
  return "\x1D\x56\x00";
}
export { cut };
function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + " ".repeat(len - str.length);
}
export { padRight };
function padLeft(str: string, len: number): string {
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
}
export { padLeft };

export async function fetchPrinterSettings(authToken?: string): Promise<{ printerIp?: string; printerPort: number; kitchenIp?: string; kitchenPort: number; counterIp?: string; counterPort: number }> {
  let printerIp: string | undefined;
  let printerPort = 9100;
  let kitchenIp: string | undefined;
  let kitchenPort = 9100;
  let counterIp: string | undefined;
  let counterPort = 9100;
  try {
    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authToken || SUPABASE_ANON_KEY}`,
    };
    const resp = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/businessSettings?select=printerIp,printerPort,kitchenPrinterIp,kitchenPrinterPort,counterPrinterIp,counterPrinterPort&limit=1`, {
        headers,
      });
      if (!r.ok) throw new Error("Settings fetch failed");
      return r;
    }).catch(() => null);
    if (resp) {
      const data = await resp.json();
      if (data?.[0]) {
        printerIp = data[0].printerIp || undefined;
        if (typeof data[0].printerPort === "number") printerPort = data[0].printerPort;
        kitchenIp = data[0].kitchenPrinterIp || undefined;
        if (typeof data[0].kitchenPrinterPort === "number") kitchenPort = data[0].kitchenPrinterPort;
        counterIp = data[0].counterPrinterIp || undefined;
        if (typeof data[0].counterPrinterPort === "number") counterPort = data[0].counterPrinterPort;
      }
    }
  } catch {
    /* ignore */
  }
  return { printerIp, printerPort, kitchenIp, kitchenPort, counterIp, counterPort };
}

export async function deliverOrQueue(
  type: "receipt" | "kot",
  printerIp: string,
  printerPort: number,
  buffer: Buffer,
  printerType: "kot" | "receipt" | "cash" = "receipt",
  settings?: { kitchenIp?: string; kitchenPort?: number; counterIp?: string; counterPort?: number }
): Promise<{ mode: "direct" | "queued"; jobId?: string }> {
  const canDirect =
    ALLOW_LAN_PRINT || !isPrivateIP(printerIp);

  // Determine which printer IP/port to use based on type
  let targetIp: string;
  let targetPort: number;

  const kitchenIp = settings?.kitchenIp;
  const kitchenPort = settings?.kitchenPort || 9100;
  const counterIp = settings?.counterIp;
  const counterPort = settings?.counterPort || 9100;

  if (printerType === "kot") {
    targetIp = kitchenIp || printerIp;
    targetPort = kitchenPort || printerPort;
  } else if (printerType === "cash") {
    targetIp = counterIp || printerIp;
    targetPort = counterPort || printerPort;
  } else {
    // receipt default to counter printer
    targetIp = counterIp || printerIp;
    targetPort = counterPort || printerPort;
  }

  if (canDirect) {
    try {
      await sendToPrinter(targetIp, targetPort, buffer);
      return { mode: "direct" };
    } catch (err) {
      if (!isPrivateIP(targetIp) || !PRINT_AGENT_SECRET) throw err;
      // Fall through to queue for LAN when direct fails
    }
  }

  if (isPrivateIP(targetIp) && !ALLOW_LAN_PRINT) {
    const job = enqueueJob({
      type,
      printerIp: targetIp,
      printerPort: targetPort,
      payloadBase64: buffer.toString("base64"),
    });
    return { mode: "queued", jobId: job.id };
  }

  if (!canDirect) {
    const job = enqueueJob({
      type,
      printerIp: targetIp,
      printerPort: targetPort,
      payloadBase64: buffer.toString("base64"),
    });
    return { mode: "queued", jobId: job.id };
  }

  await sendToPrinter(targetIp, targetPort, buffer);
  return { mode: "direct" };
}

router.post("/api/print-receipt", requireAuth, async (req, res) => {
  const { printerPort: bodyPort, receipt } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const settings = await fetchPrinterSettings(token);
  const printerIp = settings.printerIp;
  const printerPort =
    typeof bodyPort === "number" && bodyPort > 0 && bodyPort < 65536
      ? bodyPort
      : settings.printerPort || 9100;

  if (!printerIp) {
    return res.status(400).json({ error: "Printer IP not configured in Business Settings" });
  }

  // Allow both IP addresses and hostnames; net.createConnection supports hostnames
  // Validate only if it looks like an IP (basic check), otherwise allow hostname
  const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(printerIp);
  if (isIp) {
    const ipParts = printerIp.split(".").map(Number);
    if (ipParts.some((p) => p < 0 || p > 255)) {
      return res.status(400).json({ error: "Invalid printer IP address" });
    }
  }

  if (!receipt) {
    return res.status(400).json({ error: "No receipt data" });
  }

  try {
    const r = {
      restaurantName: receipt.restaurantName ? sanitizeReceiptField(String(receipt.restaurantName)) : "RESTAURANT",
      address: receipt.address ? sanitizeReceiptField(String(receipt.address)) : "",
      city: receipt.city ? sanitizeReceiptField(String(receipt.city)) : "",
      state: receipt.state ? sanitizeReceiptField(String(receipt.state)) : "",
      phone: receipt.phone ? sanitizeReceiptField(String(receipt.phone)) : "",
      gstNumber: receipt.gstNumber ? sanitizeReceiptField(String(receipt.gstNumber)) : "",
      invoicePrefix: receipt.invoicePrefix ? sanitizeReceiptField(String(receipt.invoicePrefix)) : "INV-",
      sessionId: receipt.sessionId,
      date: receipt.date ? sanitizeReceiptField(String(receipt.date)) : "",
      time: receipt.time ? sanitizeReceiptField(String(receipt.time)) : "",
      table: receipt.table ? sanitizeReceiptField(String(receipt.table)) : "",
      orders: receipt.orders,
      items: (receipt.items || []).map((item: any) => ({
        name: item.name ? sanitizeReceiptField(String(item.name)) : "",
        qty: item.qty || 0,
        price: item.price || 0,
      })),
      subtotal: receipt.subtotal || 0,
      gstEnabled: !!receipt.gstEnabled,
      gstHalf: receipt.gstHalf || 0,
      cgst: receipt.cgst || 0,
      sgst: receipt.sgst || 0,
      grandTotal: receipt.grandTotal || 0,
      payment: receipt.payment ? sanitizeReceiptField(String(receipt.payment)) : "",
      footerMessage: receipt.footerMessage ? sanitizeReceiptField(String(receipt.footerMessage)) : "",
    };

    let doc = "";
    doc += center(boldOn() + bigText());
    doc += center(r.restaurantName);
    doc += center(normalText() + boldOff());
    if (r.address) doc += center(r.address);
    const cityLine = `${r.city}${r.city && r.state ? ", " : ""}${r.state}`;
    if (cityLine.trim()) doc += center(cityLine);
    if (r.phone) doc += center(r.phone);
    if (r.gstNumber) doc += center(`GST: ${r.gstNumber}`);
    doc += "\n";
    doc += divider();
    doc += left(`Invoice: ${r.invoicePrefix}${String(r.sessionId).padStart(6, "0")}`);
    doc += left(`Date: ${r.date}`);
    doc += left(`Time: ${r.time}`);
    doc += left(`Table: ${r.table}`);
    if (r.orders) doc += left(`Orders: ${r.orders}`);
    doc += "\n";
    doc += divider();
    doc += left(boldOn() + padRight("Item", 30) + padLeft("Qty", 4) + "  " + padLeft("Price", 10) + boldOff());
    doc += thinDivider();
    for (const item of r.items) {
      const name = item.name.length > 28 ? item.name.substring(0, 26) + ".." : item.name;
      const price = `Rs${(item.price * item.qty).toFixed(2)}`;
      doc += left(padRight(name, 30) + padLeft(String(item.qty), 4) + "  " + padLeft(price, 10));
    }
    doc += "\n";
    doc += divider();
    doc += left(`Subtotal${" ".repeat(22)}Rs${r.subtotal.toFixed(2)}`);
    if (r.gstEnabled) {
      doc += left(`CGST (${r.gstHalf}%)${" ".repeat(18)}Rs${r.cgst.toFixed(2)}`);
      doc += left(`SGST (${r.gstHalf}%)${" ".repeat(18)}Rs${r.sgst.toFixed(2)}`);
    }
    doc += divider();
    doc += boldOn() + left(`Grand Total${" ".repeat(18)}Rs${r.grandTotal.toFixed(2)}`) + boldOff();
    if (r.payment) {
      doc += "\n";
      doc += left(`Payment: ${r.payment}`);
    }
    if (r.footerMessage) {
      doc += "\n";
      doc += center(r.footerMessage);
    }
    doc += "\n\n";
    doc += cut();

    const buffer = Buffer.from(doc, "ascii");
    // Receipt routes to counter printer; if payment is cash, also kick drawer after
    const result = await deliverOrQueue("receipt", printerIp, printerPort, buffer, "receipt", settings);

    // Cash drawer kick: if payment method is cash, send ESC/POS kick command
    let drawerKickResult = null;
    if (receipt?.payment && receipt.payment.toLowerCase().includes("cash")) {
      try {
        const KICK_CASH_DRAWER = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
        // Send to counter printer IP/port
        await sendToPrinter(settings.counterIp || printerIp, settings.counterPort || printerPort, KICK_CASH_DRAWER);
        drawerKickResult = { success: true, action: "cash_drawer_kicked" };
      } catch (err) {
        console.error("Cash drawer kick failed:", err);
        drawerKickResult = { success: false, error: err instanceof Error ? err.message : "Unknown error" };
      }
    }

    if (result.mode === "queued") {
      return res.json({
        success: true,
        queued: true,
        jobId: result.jobId,
        message: "Receipt queued for local print agent. Run scripts/print-agent.mjs on the café PC.",
        // Include drawer kick status in response
        drawerKick: drawerKickResult,
      });
    }
    // If printed directly, also perform drawer kick if cash
    if (receipt?.payment && receipt.payment.toLowerCase().includes("cash") && drawerKickResult?.success) {
      // Already kicked above, just return success
    }
    res.json({ success: true, queued: false, message: "Receipt printed", drawerKick: drawerKickResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to print";
    console.error("Print error:", message);
    res.status(500).json({ error: message });
  }
});

router.post("/api/print-kot", requireAuth, async (req, res) => {
  const { printerPort: bodyPort, kot } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const settings = await fetchPrinterSettings(token);
  const printerIp = settings.printerIp;
  const printerPort =
    typeof bodyPort === "number" && bodyPort > 0 && bodyPort < 65536
      ? bodyPort
      : settings.printerPort || 9100;

  if (!printerIp) {
    return res.status(400).json({ error: "Printer IP not configured in Business Settings" });
  }
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(printerIp)) {
    return res.status(400).json({ error: "Invalid IP" });
  }
  if (!kot || !kot.items || !kot.items.length) {
    return res.status(400).json({ error: "No KOT data" });
  }

  try {
    const k = {
      orderNumber: kot.orderNumber || "---",
      table: kot.table ? sanitizeReceiptField(String(kot.table)) : "Unknown",
      date: kot.date ? sanitizeReceiptField(String(kot.date)) : "",
      time: kot.time ? sanitizeReceiptField(String(kot.time)) : "",
      type: kot.type ? sanitizeReceiptField(String(kot.type)) : "DINE-IN",
      items: kot.items.map((item: any) => ({
        name: item.name ? sanitizeReceiptField(String(item.name)) : "",
        qty: item.qty || 1,
        variantSelections: Array.isArray(item.variantSelections)
          ? item.variantSelections.map((v: any) => sanitizeReceiptField(String(v.name || v)))
          : [],
        specialInstructions: item.specialInstructions ? sanitizeReceiptField(String(item.specialInstructions)) : "",
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
      if (item.variantSelections?.length) {
        for (const variant of item.variantSelections) {
          doc += left(`  - ${variant}`);
        }
      }
      if (item.specialInstructions) {
        doc += left(`  * ${item.specialInstructions}`);
      }
      doc += "\n";
    }
    doc += divider();
    doc += "\n\n\n";
    doc += cut();

    const buffer = Buffer.from(doc, "ascii");
    // KOT always routes to kitchen printer
    const result = await deliverOrQueue("kot", printerIp, printerPort, buffer, "kot", settings);

    if (result.mode === "queued") {
      return res.json({
        success: true,
        queued: true,
        jobId: result.jobId,
        message: "KOT queued for kitchen print agent",
      });
    }
    res.json({ success: true, queued: false, message: "KOT printed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to print KOT";
    console.error("Print KOT error:", message);
    res.status(500).json({ error: message });
  }
});

/** Print agent — exempt from CSRF via mounting before CSRF or path check in index */
router.get("/api/print-agent/jobs", requirePrintAgent, (_req, res) => {
  pruneJobs();
  const pending = printJobs.filter((j) => !j.claimed).slice(0, 10);
  for (const j of pending) j.claimed = true;
  res.json({
    jobs: pending.map((j) => ({
      id: j.id,
      type: j.type,
      printerIp: j.printerIp,
      printerPort: j.printerPort,
      payloadBase64: j.payloadBase64,
    })),
  });
});

router.post("/api/print-agent/ack", requirePrintAgent, (req, res) => {
  const { jobId, ok, error } = req.body || {};
  const idx = printJobs.findIndex((j) => j.id === jobId);
  if (idx >= 0) printJobs.splice(idx, 1);
  if (!ok) console.error("Print agent failed job", jobId, error);
  res.json({ success: true });
});

router.get("/api/print-agent/status", requireAuth, (_req, res) => {
  pruneJobs();
  res.json({
    pendingJobs: printJobs.filter((j) => !j.claimed).length,
    claimedJobs: printJobs.filter((j) => j.claimed).length,
    agentConfigured: Boolean(PRINT_AGENT_SECRET),
    allowLanPrint: ALLOW_LAN_PRINT,
  });
});

export default router;
