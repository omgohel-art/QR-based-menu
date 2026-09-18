import { useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_PRINTER_PORT } from "@/lib/constants";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import "./ThermalReceipt.css";

type ThermalReceiptProps = {
  data: {
    restaurantName: string;
    address: string;
    city: string;
    state: string;
    phone: string;
    gstNumber: string;
    logoUrl: string | null;
    gstEnabled: boolean;
    gstRate: number;
    invoicePrefix: string;
    footerMessage: string;
  } | null;
  table: {
    label: string;
    sessionId: number;
    subtotal: number;
    serviceCharge: number;
    taxAmount: number;
    finalTotal: number;
    orders: Array<{
      orderNumber: number | null;
      paymentMethod: string | null;
      paymentStatus: string | null;
      items: Array<{
        menuItemName: string;
        quantity: number;
        priceAtOrderTime: number;
      }>;
    }>;
  };
  printerIp?: string;
  printerPort?: number;
  onClose: () => void;
  printKOT?: boolean; // Print Kitchen Order Ticket instead of customer receipt
};

function escapeForESCPos(text: string): string {
  // Escape special characters for ESC/POS
  return text
    .replace(/\$/g, "\u0024")
    .replace(/\"/g, "\u0022")
    .replace(/\&/g, "\u0026")
    .replace(/\'/g, "\u0027")
    .replace(/\\/g, "\u005c")
    .replace(/\//g, "\u002f");
}

function formatINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatNumber(n: number): string {
  return n.toString().padStart(2, "0");
}

export default function ThermalReceipt({
  data,
  table,
  printerIp,
  printerPort = DEFAULT_PRINTER_PORT,
  onClose,
  printKOT = false,
}: ThermalReceiptProps) {
  const { fmtPrice } = useFormatCurrency();
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSocketPrinting, setIsSocketPrinting] = useState(false);

  const biz = data;
  const allItems = table.orders.flatMap((o) => o.items);
  const subtotal = table.subtotal;
  const serviceCharge = table.serviceCharge || 0;
  const gstEnabled = biz?.gstEnabled && (biz.gstRate || 0) > 0;
  const gstHalf = gstEnabled ? (biz!.gstRate / 2) : 0;
  const taxableBase = subtotal + serviceCharge;
  const cgst = gstEnabled ? taxableBase * (biz!.gstRate / 200) : 0;
  const sgst = gstEnabled ? taxableBase * (biz!.gstRate / 200) : 0;
  const grandTotal = taxableBase + cgst + sgst;

  const orderNumbers = table.orders
    .filter((o) => o.orderNumber)
    .map((o) => "#" + String(o.orderNumber).padStart(3, "0"))
    .join(", ");

  const paymentLabels: Record<string, string> = {
    counter: "Cash",
    online: "Online",
  };
  const paymentMethods = Array.from(
    new Set(table.orders.filter((o) => o.paymentMethod).map((o) => o.paymentMethod!))
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  // Generate ESC/POS text receipt (for silent socket printing)
  const generateESCPOSReceipt = (): string => {
    const lines: string[] = [];

    // Header - Restaurant info
    lines.push(escapeForESCPos(biz?.restaurantName || "Restaurant"));
    lines.push(escapeForESCPos(biz?.address || ""));
    lines.push(escapeForESCPos(`${biz?.city || ""}${biz?.city && biz?.state ? ", " : ""}${biz?.state || ""}`));
    lines.push(escapeForESCPos(biz?.phone || ""));
    if (biz?.gstNumber) {
      lines.push(`GST: ${escapeForESCPos(biz.gstNumber)}`);
    }
    lines.push(""); // blank line

    // Invoice header
    lines.push(`Invoice: ${biz?.invoicePrefix || "INV-"}${String(table.sessionId).padStart(6, "0")}`);
    lines.push(`Date: ${dateStr}`);
    lines.push(`Time: ${timeStr}`);
    lines.push(`Table: ${escapeForESCPos(table.label)}`);
    if (orderNumbers) {
      lines.push(`Orders: ${orderNumbers}`);
    }
    lines.push(""); // blank line

    // Items table header
    lines.push("Item                    Qty      Price");
    lines.push("-------------------------------");

    // Items
    allItems.map((item, i) => {
      const itemName = escapeForESCPos(item.menuItemName).substring(0, 20); // limit length
      const qty = formatNumber(item.quantity);
      const price = fmtPrice(item.priceAtOrderTime * item.quantity);
      // ESC/POS simple formatting: left-align name, center qty, right-align price
      const paddedName = itemName.padEnd(20, " ");
      lines.push(`${paddedName}${qty.padEnd(6, " ")}${price}`);
    });
    lines.push("-------------------------------");

    // Totals
    lines.push(`Subtotal           ${fmtPrice(subtotal)}`);
    if (serviceCharge > 0) {
      lines.push(`Service Charge     ${fmtPrice(serviceCharge)}`);
    }
    if (gstEnabled) {
      lines.push(`CGST (${gstHalf}%)    ${fmtPrice(cgst)}`);
      lines.push(`SGST (${gstHalf}%)    ${fmtPrice(sgst)}`);
    }
    lines.push(`-------------------------------`);
    lines.push(`Grand Total        ${fmtPrice(grandTotal)}`);
    lines.push(""); // blank line

    // Payment
    if (paymentMethods.length > 0) {
      const paymentText = paymentMethods.map((m) => paymentLabels[m] || m).join(", ");
      lines.push(`Payment: ${escapeForESCPos(paymentText)}`);
    }
    lines.push(""); // blank line

    // Footer
    if (biz?.footerMessage) {
      lines.push(escapeForESCPos(biz.footerMessage));
    }

    return lines.join("\r\n");
  };

  // Generate KOT (Kitchen Order Ticket) - simplified format for kitchen
  const generateKOTTicket = (): string => {
    const lines: string[] = [];

    // KOT Header
    lines.push("=== KOT === ");
    lines.push(`Table: ${escapeForESCPos(table.label)}`);
    lines.push(`Time: ${timeStr}`);
    lines.push("-------------------------------");

    // Orders
    const orderNumbers = table.orders
      .filter((o) => o.orderNumber)
      .map((o) => `#${String(o.orderNumber).padStart(3, "0")}`)
      .join(", ");
    lines.push(`Orders: ${orderNumbers || "N/A"}`);
    lines.push("");

    // Items
    lines.push("Item          Qty  Price");
    lines.push("---------------------");

    allItems.map((item) => {
      const itemName = escapeForESCPos(item.menuItemName).substring(0, 18);
      const qty = formatNumber(item.quantity);
      const price = fmtPrice(item.priceAtOrderTime);
      lines.push(`${itemName.padEnd(18, " ")} ${qty}   ${price}`);
    });
    lines.push("---------------------");

    // Total
    lines.push(`TOTAL          ${fmtPrice(grandTotal)}`);
    lines.push("---------------------");

    // Table status
    lines.push(`Status: Active`);
    lines.push(`KOT Generated: ${dateStr} ${timeStr}`);

    return lines.join("\r\n");
  };

  const handlePrint = async () => {
    if (!printerIp) {
      setPrintStatus("error");
      setTimeout(() => setPrintStatus("idle"), 3000);
      return;
    }

    setPrinting(true);
    setPrintStatus("idle");
    setIsSocketPrinting(true);

    try {
      const res = await fetch("/api/print-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printerIp,
          printerPort,
          receipt: {
            restaurantName: biz?.restaurantName || "Restaurant",
            address: biz?.address || "",
            city: biz?.city || "",
            state: biz?.state || "",
            phone: biz?.phone || "",
            gstNumber: biz?.gstNumber || "",
            invoicePrefix: biz?.invoicePrefix || "INV-",
            sessionId: table.sessionId,
            date: dateStr,
            time: timeStr,
            table: table.label,
            orders: orderNumbers,
            items: allItems.map((item) => ({
              name: item.menuItemName,
              qty: item.quantity,
              price: item.priceAtOrderTime,
            })),
            subtotal,
            serviceCharge,
            gstEnabled,
            gstHalf: gstHalf,
            cgst,
            sgst,
            grandTotal,
            payment: paymentMethods.map((m) => paymentLabels[m] || m).join(", "),
            footerMessage: biz?.footerMessage || "",
            // Pass KOT flag
            isKOT: printKOT,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Print failed");

      setPrintStatus("success");
      setTimeout(() => setPrintStatus("idle"), 3000);

      // Show success message based on print type
      const message = printKOT ? "KOT sent to kitchen printer" : "Receipt sent to printer";
      toast.success(message, {
        description: `Order ${printKOT ? "KOT" : "Receipt"} printed successfully`,
      });
    } catch (err) {
      console.error("Print error:", err);
      setPrintStatus("error");
      setTimeout(() => setPrintStatus("idle"), 5000);
      toast.error(`Print failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setPrinting(false);
      setIsSocketPrinting(false);
    }
  };

  // Handle KOT-specific print
  const handleKOTPrint = async () => {
    if (!printerIp) {
      setPrintStatus("error");
      setTimeout(() => setPrintStatus("idle"), 3000);
      return;
    }

    setPrinting(true);
    setPrintStatus("idle");
    setIsSocketPrinting(true);

    try {
      const res = await fetch("/api/print-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printerIp,
          printerPort,
          receipt: {
            restaurantName: biz?.restaurantName || "Restaurant",
            address: biz?.address || "",
            city: biz?.city || "",
            state: biz?.state || "",
            phone: biz?.phone || "",
            gstNumber: biz?.gstNumber || "",
            invoicePrefix: biz?.invoicePrefix || "INV-",
            sessionId: table.sessionId,
            date: dateStr,
            time: timeStr,
            table: table.label,
            orders: orderNumbers,
            items: allItems.map((item) => ({
              name: item.menuItemName,
              qty: item.quantity,
              price: item.priceAtOrderTime,
            })),
            subtotal,
            serviceCharge,
            gstEnabled,
            gstHalf: gstHalf,
            cgst,
            sgst,
            grandTotal,
            payment: paymentMethods.map((m) => paymentLabels[m] || m).join(", "),
            footerMessage: biz?.footerMessage || "",
            isKOT: true, // KOT mode
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Print failed");

      setPrintStatus("success");
      setTimeout(() => setPrintStatus("idle"), 3000);

      toast.success("KOT sent to kitchen", {
        description: "Kitchen Order Ticket printed successfully",
      });
    } catch (err) {
      console.error("KOT Print error:", err);
      setPrintStatus("error");
      setTimeout(() => setPrintStatus("idle"), 5000);
      toast.error(`KOT print failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setPrinting(false);
      setIsSocketPrinting(false);
    }
  };

  return createPortal(
    <div className="thermal-receipt-overlay" onClick={onClose}>
      <div className="thermal-receipt" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-content" id={`thermal-receipt-${table.sessionId}`}>
          {biz?.logoUrl && (
            <div className="receipt-logo">
              <img src={biz.logoUrl} alt="Logo" width={120} height={40} loading="lazy" />
            </div>
          )}
          <h2 className="receipt-title">{biz?.restaurantName || "Restaurant"}</h2>
          <p className="receipt-line">{biz?.address}</p>
          <p className="receipt-line">{biz?.city}{biz?.city && biz?.state ? ", " : ""}{biz?.state}</p>
          <p className="receipt-line">{biz?.phone}</p>
          {biz?.gstNumber && <p className="receipt-line">GST: {biz.gstNumber}</p>}

          <div className="receipt-divider" />

          <p className="receipt-row">
            <span>Invoice:</span>
            <span>{biz?.invoicePrefix || "INV-"}{String(table.sessionId).padStart(6, "0")}</span>
          </p>
          <p className="receipt-row">
            <span>Date:</span>
            <span>{dateStr}</span>
          </p>
          <p className="receipt-row">
            <span>Time:</span>
            <span>{timeStr}</span>
          </p>
          <p className="receipt-row">
            <span>Table:</span>
            <span>{table.label}</span>
          </p>
          {orderNumbers && (
            <p className="receipt-row">
              <span>Orders:</span>
              <span>{orderNumbers}</span>
            </p>
          )}

          <div className="receipt-divider" />

          <div className="receipt-items-header">
            <span className="receipt-item-name">Item</span>
            <span className="receipt-item-qty">Qty</span>
            <span className="receipt-item-price">Price</span>
          </div>
          <div className="receipt-divider-thin" />

          {allItems.map((item, i) => (
            <div key={i} className="receipt-item">
              <span className="receipt-item-name">{item.menuItemName}</span>
              <span className="receipt-item-qty">{item.quantity}</span>
              <span className="receipt-item-price">{fmtPrice(item.priceAtOrderTime * item.quantity)}</span>
            </div>
          ))}

          <div className="receipt-divider" />

          <div className="receipt-total-row">
            <span>Subtotal</span>
            <span>{fmtPrice(subtotal)}</span>
          </div>
          {serviceCharge > 0 && (
            <div className="receipt-total-row">
              <span>Service Charge</span>
              <span>{fmtPrice(serviceCharge)}</span>
            </div>
          )}
          {gstEnabled && (
            <>
              <div className="receipt-total-row">
                <span>CGST ({gstHalf}%)</span>
                <span>{fmtPrice(cgst)}</span>
              </div>
              <div className="receipt-total-row">
                <span>SGST ({gstHalf}%)</span>
                <span>{fmtPrice(sgst)}</span>
              </div>
            </>
          )}
          <div className="receipt-divider-thin" />
          <div className="receipt-grand-total">
            <span>Grand Total</span>
            <span>{fmtPrice(grandTotal)}</span>
          </div>

          {paymentMethods.length > 0 && (
            <>
              <div className="receipt-divider" />
              <p className="receipt-line">Payment: {paymentMethods.map((m) => paymentLabels[m] || m).join(", ")}</p>
            </>
          )}

          {biz?.footerMessage && (
            <>
              <div className="receipt-divider" />
              <p className="receipt-footer">{biz.footerMessage}</p>
            </>
          )}
        </div>

        {/* Print Buttons Section */}
        {printerIp && (
          <div className="printer-actions">
            {/* Customer Receipt Button */}
            <button
              className="receipt-print-btn"
              onClick={handlePrint}
              disabled={printing}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "8px" }}
            >
              {printing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Printing...
                </>
              ) : printStatus === "success" ? (
                "✓ Sent to Printer"
              ) : printStatus === "error" ? (
                "✗ Printer Error"
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Print Receipt
                </>
              )}
            </button>

            {/* KOT Button (Kitchen Order Ticket) */}
            {printKOT || (
              <button
                className="receipt-print-btn"
                onClick={handleKOTPrint}
                disabled={printing}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginLeft: "8px", background: "#dc2626", color: "white" }}
              >
                {printing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Printing...
                  </>
                ) : (
                  "🍽️ KOT"
                )}
              </button>
            )}

            {/* Preview PDF Button */}
            <button
              className="receipt-print-btn"
              onClick={() => window.print()}
              style={{ background: "#2563eb", color: "white", marginLeft: "8px" }}
            >
              Preview (PDF)
            </button>
          </div>
        )}

        <button className="receipt-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}