import express from "express";
import net from "net";

const router = express.Router();

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

router.post("/api/print-receipt", async (req, res) => {
  const { printerIp, printerPort = 9100, receipt } = req.body;

  if (!printerIp) {
    return res.status(400).json({ error: "Printer IP not configured" });
  }
  if (!receipt) {
    return res.status(400).json({ error: "No receipt data" });
  }

  try {
    let doc = "";

    // Header
    doc += center(boldOn() + bigText());
    doc += center(receipt.restaurantName || "RESTAURANT");
    doc += center(normalText() + boldOff());
    if (receipt.address) doc += center(receipt.address);
    const cityLine = `${receipt.city || ""}${receipt.city && receipt.state ? ", " : ""}${receipt.state || ""}`;
    if (cityLine.trim()) doc += center(cityLine);
    if (receipt.phone) doc += center(receipt.phone);
    if (receipt.gstNumber) doc += center(`GST: ${receipt.gstNumber}`);
    doc += "\n";

    // Invoice info
    doc += divider();
    doc += left(`Invoice: ${receipt.invoicePrefix || "INV-"}${String(receipt.sessionId).padStart(6, "0")}`);
    doc += left(`Date: ${receipt.date}`);
    doc += left(`Time: ${receipt.time}`);
    doc += left(`Table: ${receipt.table}`);
    if (receipt.orders) doc += left(`Orders: ${receipt.orders}`);
    doc += "\n";

    // Items header
    doc += divider();
    doc += left(boldOn() + padRight("Item", 30) + padLeft("Qty", 4) + "  " + padLeft("Price", 10) + boldOff());
    doc += thinDivider();

    // Items
    for (const item of receipt.items || []) {
      const name = item.name.length > 28 ? item.name.substring(0, 26) + ".." : item.name;
      const price = `₹${(item.price * item.qty).toFixed(2)}`;
      doc += left(padRight(name, 30) + padLeft(String(item.qty), 4) + "  " + padLeft(price, 10));
    }

    doc += "\n";
    doc += divider();

    // Subtotal
    doc += left(`Subtotal${" ".repeat(22)}₹${receipt.subtotal.toFixed(2)}`);

    // GST
    if (receipt.gstEnabled) {
      doc += left(`CGST (${receipt.gstHalf}%)${" ".repeat(18)}₹${receipt.cgst.toFixed(2)}`);
      doc += left(`SGST (${receipt.gstHalf}%)${" ".repeat(18)}₹${receipt.sgst.toFixed(2)}`);
    }

    doc += divider();

    // Grand total
    doc += boldOn() + left(`Grand Total${" ".repeat(18)}₹${receipt.grandTotal.toFixed(2)}`) + boldOff();

    // Payment
    if (receipt.payment) {
      doc += "\n";
      doc += left(`Payment: ${receipt.payment}`);
    }

    // Footer
    if (receipt.footerMessage) {
      doc += "\n";
      doc += center(receipt.footerMessage);
    }

    doc += "\n\n";
    doc += cut();

    const buffer = Buffer.from(doc, "ascii");
    await sendToPrinter(printerIp, printerPort, buffer);

    res.json({ success: true, message: "Receipt printed" });
  } catch (err: any) {
    console.error("Print error:", err);
    res.status(500).json({ error: err.message || "Failed to print" });
  }
});

export default router;
