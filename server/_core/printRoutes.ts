import express from "express";
import net from "net";
import { supabaseBreaker, fire } from "./circuitBreaker";

const router = express.Router();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

// Private IP ranges that are never allowed for printer connections
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

function resolveHostname(hostname: string): string {
  // If it's already an IP, return as-is
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return hostname;
  // If it looks like a hostname, reject it — we only allow literal IPs for printer connections
  return hostname;
}

function sanitizeReceiptField(value: string): string {
  // Strip any byte below 0x20 (control chars) except newline/tab
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
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
    (req as any).userEmail = user.email;

    // Verify user has staff or admin role
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

function sendToPrinter(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(data, () => {
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(5000);
    socket.on("timeout", () => { socket.destroy(); reject(new Error("Printer connection timed out")); });
    socket.on("error", (err) => reject(err));
  });
}

function center(text: string): string {
  return `\x1B\x61\x01${text}\n`;
}
function left(text: string): string {
  return `\x1B\x61\x00${text}\n`;
}
function boldOn(): string { return "\x1B\x45\x01"; }
function boldOff(): string { return "\x1B\x45\x00"; }
function bigText(): string { return "\x1D\x21\x01"; }
function normalText(): string { return "\x1D\x21\x00"; }
function divider(): string {
  return "\x1B\x61\x00" + "-".repeat(48) + "\n";
}
function thinDivider(): string {
  return "\x1B\x61\x00" + ".".repeat(48) + "\n";
}
function cut(): string {
  return "\x1D\x56\x00";
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + " ".repeat(len - str.length);
}
function padLeft(str: string, len: number): string {
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

router.post("/api/print-receipt", requireAuth, async (req, res) => {
  const { printerPort = 9100, receipt } = req.body;

  // Always fetch printer IP from server-side businessSettings to prevent SSRF
  let printerIp: string | undefined;
  try {
    const resp = await fire(supabaseBreaker, async () => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/businessSettings?select=printerIp,printerPort&limit=1`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!r.ok) throw new Error("Settings fetch failed");
      return r;
    }).catch(() => null);
    if (resp) {
      const data = await resp.json();
      if (data && data.length > 0) {
        printerIp = data[0].printerIp;
      }
    }
  } catch {}

  if (!printerIp) {
    return res.status(400).json({ error: "Printer IP not configured in Business Settings" });
  }

  // Resolve hostname and validate only literal IPs are allowed
  const resolvedIp = resolveHostname(printerIp);
  if (resolvedIp !== printerIp) {
    return res.status(400).json({ error: "Hostnames are not allowed for printer IP; use a literal IP address" });
  }

  // Validate printer IP — reject private/routable addresses
  if (isPrivateIP(resolvedIp)) {
    console.error(`Blocked printer connection to private IP: ${resolvedIp}`);
    return res.status(400).json({ error: "Invalid printer IP address" });
  }

  // Validate port range
  const port = typeof printerPort === "number" && printerPort > 0 && printerPort < 65536 ? printerPort : 9100;

  if (!receipt) {
    return res.status(400).json({ error: "No receipt data" });
  }

  try {
    let doc = "";

    // Sanitize all receipt text fields to prevent ESC/POS injection
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

    // Header
    doc += center(boldOn() + bigText());
    doc += center(r.restaurantName);
    doc += center(normalText() + boldOff());
    if (r.address) doc += center(r.address);
    const cityLine = `${r.city}${r.city && r.state ? ", " : ""}${r.state}`;
    if (cityLine.trim()) doc += center(cityLine);
    if (r.phone) doc += center(r.phone);
    if (r.gstNumber) doc += center(`GST: ${r.gstNumber}`);
    doc += "\n";

    // Invoice info
    doc += divider();
    doc += left(`Invoice: ${r.invoicePrefix}${String(r.sessionId).padStart(6, "0")}`);
    doc += left(`Date: ${r.date}`);
    doc += left(`Time: ${r.time}`);
    doc += left(`Table: ${r.table}`);
    if (r.orders) doc += left(`Orders: ${r.orders}`);
    doc += "\n";

    // Items header
    doc += divider();
    doc += left(boldOn() + padRight("Item", 30) + padLeft("Qty", 4) + "  " + padLeft("Price", 10) + boldOff());
    doc += thinDivider();

    // Items
    for (const item of r.items) {
      const name = item.name.length > 28 ? item.name.substring(0, 26) + ".." : item.name;
      const price = `₹${(item.price * item.qty).toFixed(2)}`;
      doc += left(padRight(name, 30) + padLeft(String(item.qty), 4) + "  " + padLeft(price, 10));
    }

    doc += "\n";
    doc += divider();

    // Subtotal
    doc += left(`Subtotal${" ".repeat(22)}₹${r.subtotal.toFixed(2)}`);

    // GST
    if (r.gstEnabled) {
      doc += left(`CGST (${r.gstHalf}%)${" ".repeat(18)}₹${r.cgst.toFixed(2)}`);
      doc += left(`SGST (${r.gstHalf}%)${" ".repeat(18)}₹${r.sgst.toFixed(2)}`);
    }

    doc += divider();

    // Grand total
    doc += boldOn() + left(`Grand Total${" ".repeat(18)}₹${r.grandTotal.toFixed(2)}`) + boldOff();

    // Payment
    if (r.payment) {
      doc += "\n";
      doc += left(`Payment: ${r.payment}`);
    }

    // Footer
    if (r.footerMessage) {
      doc += "\n";
      doc += center(r.footerMessage);
    }

    doc += "\n\n";
    doc += cut();

    const buffer = Buffer.from(doc, "ascii");
    await sendToPrinter(printerIp, port, buffer);

    res.json({ success: true, message: "Receipt printed" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to print";
    console.error("Print error:", message);
    res.status(500).json({ error: message });
  }
});

export default router;
