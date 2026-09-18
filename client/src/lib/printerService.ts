import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export interface KOTPrintPayload {
  orderNumber?: number | string;
  table?: string;
  type?: string;
  date?: string;
  time?: string;
  items: Array<{
    name: string;
    qty: number;
    price?: number;
    variantSelections?: string[];
    specialInstructions?: string;
  }>;
}

export interface ReceiptPrintPayload {
  restaurantName?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  gstNumber?: string;
  invoicePrefix?: string;
  sessionId?: number;
  date?: string;
  time?: string;
  table?: string;
  orders?: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
  }>;
  subtotal: number;
  serviceCharge?: number;
  gstEnabled?: boolean;
  gstHalf?: number;
  cgst?: number;
  sgst?: number;
  grandTotal: number;
  payment?: string;
  footerMessage?: string;
}

/** Get Supabase access token for authenticated printer endpoints */
async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/** Print Kitchen Order Ticket (KOT) directly to thermal printer via TCP socket / print agent */
export async function printKOTDirect(kot: KOTPrintPayload, silent = false): Promise<boolean> {
  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const now = new Date();
    const dateStr = kot.date || now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = kot.time || now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    const response = await fetch("/api/print-kot", {
      method: "POST",
      headers,
      body: JSON.stringify({
        kot: {
          orderNumber: kot.orderNumber ? `#${String(kot.orderNumber).padStart(3, "0")}` : "---",
          table: kot.table || "Dine-In",
          date: dateStr,
          time: timeStr,
          type: kot.type || "DINE-IN",
          items: kot.items,
        },
      }),
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.error || "Failed to print KOT");
    }

    if (!silent) {
      if (resData.queued) {
        toast.info("KOT queued for local thermal printer agent", { description: `Job ID: ${resData.jobId}` });
      } else {
        toast.success("KOT sent directly to Kitchen Printer!", { description: `Table: ${kot.table || "Order"}` });
      }
    }
    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Print failed";
    console.error("[PrinterService] KOT print error:", err);
    if (!silent) {
      toast.error(`KOT Print Error: ${errMsg}`);
    }
    return false;
  }
}

/** Print Customer Receipt directly to thermal printer */
export async function printReceiptDirect(receipt: ReceiptPrintPayload, silent = false): Promise<boolean> {
  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch("/api/print-receipt", {
      method: "POST",
      headers,
      body: JSON.stringify({ receipt }),
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.error || "Failed to print receipt");
    }

    if (!silent) {
      if (resData.queued) {
        toast.info("Receipt queued for thermal printer agent");
      } else {
        toast.success("Receipt printed successfully!");
      }
    }
    return true;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Print failed";
    console.error("[PrinterService] Receipt print error:", err);
    if (!silent) {
      toast.error(`Receipt Print Error: ${errMsg}`);
    }
    return false;
  }
}

/** Web Serial API ESC/POS silent USB printer support (for USB printers connected to PC) */
export async function printWebSerialESCPOS(text: string): Promise<boolean> {
  if (!("serial" in navigator)) {
    toast.error("Web Serial API not supported in this browser. Use Chrome/Edge or Network IP printer.");
    return false;
  }
  try {
    const navSerial = (navigator as unknown as { serial: { requestPort: () => Promise<unknown> } }).serial;
    const port = (await navSerial.requestPort()) as {
      open: (opts: { baudRate: number }) => Promise<void>;
      writable: { getWriter: () => { write: (data: Uint8Array) => Promise<void>; releaseLock: () => void } };
      close: () => Promise<void>;
    };

    await port.open({ baudRate: 9600 });
    const writer = port.writable.getWriter();
    const encoder = new TextEncoder();
    const data = encoder.encode(text + "\n\n\n\x1D\x56\x00"); // Include cut command
    await writer.write(data);
    writer.releaseLock();
    await port.close();
    toast.success("Printed silently via USB Thermal Printer!");
    return true;
  } catch (err) {
    console.error("[PrinterService] WebSerial print error:", err);
    toast.error("USB Serial print cancelled or failed");
    return false;
  }
}
