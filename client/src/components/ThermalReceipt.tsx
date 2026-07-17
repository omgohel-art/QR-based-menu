import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Printer } from "lucide-react";
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
};

export default function ThermalReceipt({ data, table, printerIp, printerPort = 9100, onClose }: ThermalReceiptProps) {
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<"idle" | "success" | "error">("idle");

  const biz = data;
  const allItems = table.orders.flatMap((o) => o.items);
  const subtotal = table.subtotal;
  const gstEnabled = biz?.gstEnabled && (biz.gstRate || 0) > 0;
  const gstHalf = gstEnabled ? (biz!.gstRate / 2) : 0;
  const cgst = gstEnabled ? subtotal * (biz!.gstRate / 200) : 0;
  const sgst = gstEnabled ? subtotal * (biz!.gstRate / 200) : 0;
  const grandTotal = gstEnabled ? subtotal + cgst + sgst : subtotal;

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

  const handlePrint = async () => {
    if (!printerIp) {
      setPrintStatus("error");
      return;
    }
    setPrinting(true);
    setPrintStatus("idle");
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
            gstEnabled,
            gstHalf: gstHalf,
            cgst,
            sgst,
            grandTotal,
            payment: paymentMethods.map((m) => paymentLabels[m] || m).join(", "),
            footerMessage: biz?.footerMessage || "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Print failed");
      setPrintStatus("success");
      setTimeout(() => setPrintStatus("idle"), 3000);
    } catch (err: any) {
      setPrintStatus("error");
      setTimeout(() => setPrintStatus("idle"), 5000);
    } finally {
      setPrinting(false);
    }
  };

  return createPortal(
    <div className="thermal-receipt-overlay" onClick={onClose}>
      <div className="thermal-receipt" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-content" id={`thermal-receipt-${table.sessionId}`}>
          {biz?.logoUrl && (
            <div className="receipt-logo">
              <img src={biz.logoUrl} alt="Logo" />
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
              <span className="receipt-item-price">₹{(item.priceAtOrderTime * item.quantity).toFixed(2)}</span>
            </div>
          ))}

          <div className="receipt-divider" />

          <div className="receipt-total-row">
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {gstEnabled && (
            <>
              <div className="receipt-total-row">
                <span>CGST ({gstHalf}%)</span>
                <span>₹{cgst.toFixed(2)}</span>
              </div>
              <div className="receipt-total-row">
                <span>SGST ({gstHalf}%)</span>
                <span>₹{sgst.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="receipt-divider-thin" />
          <div className="receipt-grand-total">
            <span>Grand Total</span>
            <span>₹{grandTotal.toFixed(2)}</span>
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

        {printerIp && (
          <button
            className="receipt-print-btn"
            onClick={handlePrint}
            disabled={printing}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
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
                <Printer className="w-4 h-4" />
                Print to Thermal Printer
              </>
            )}
          </button>
        )}
        <button className="receipt-print-btn" onClick={() => window.print()} style={{ background: "#2563eb" }}>
          Print Preview (PDF)
        </button>
        <button className="receipt-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
