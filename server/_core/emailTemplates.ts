// Email template for invoices.

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "\x26amp;")
    .replace(/</g, "\x26lt;")
    .replace(/>/g, "\x26gt;")
    .replace(/"/g, "\x26quot;")
    .replace(/'/g, "\x26#039;");
}

export interface InvoiceEmailData {
  restaurantName: string;
  logoUrl: string | null;
  invoiceNumber: string;
  sequentialInvoiceNumber?: string | null;
  orderNumber: number | null;
  tableLabel: string;
  orderDate: string;
  restaurantAddress: string;
  gstNumber: string | null;
  panNumber?: string | null;
  stateCode?: string | null;
  placeOfSupply?: string | null;
  isInterState?: boolean;
  sacCode?: string | null;
  items: Array<{ name: string; quantity: number; price: number; hsnCode?: string | null }>;
  subtotal: number;
  serviceCharge: number;
  taxAmount: number;
  gstRate: number;
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  gstEnabled: boolean;
  discountAmount: number;
  discountReason: string | null;
  finalTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  notes: string | null;
  invoiceUrl: string;
  footerMessage?: string;
  reviewLink?: string;
  customerName?: string | null;
  customerPhone?: string | null;
}

const RS = "\x26#8377;";
const EM_DASH = "\x26mdash;";
const GT = "\x26gt;";

function closeTd() { return "<" + "/td" + GT; }
function closeTr() { return "<" + "/tr" + GT; }
function closeTable() { return "<" + "/table" + GT; }
function closeTbody() { return "<" + "/tbody" + GT; }
function closeThead() { return "<" + "/thead" + GT; }
function closeP() { return "<" + "/p" + GT; }
function closeA() { return "<" + "/a" + GT; }
function closeDiv() { return "<" + "/div" + GT; }
function closeSpan() { return "<" + "/span" + GT; }
function closeStrong() { return "<" + "/strong" + GT; }
function closeH1() { return "<" + "/h1" + GT; }
function closeBody() { return "<" + "/body" + GT; }
function closeHtml() { return "<" + "/html" + GT; }
function closeHead() { return "<" + "/head" + GT; }

export function buildInvoiceEmailHtml(data: InvoiceEmailData): string {
  const isInterState = data.isInterState ?? false;
  const cgstRate = data.cgstRate ?? data.gstRate / 2;
  const sgstRate = data.sgstRate ?? data.gstRate / 2;
  const igstRate = data.igstRate ?? data.gstRate;

  const cgst = !isInterState && data.gstEnabled ? data.taxAmount / 2 : 0;
  const sgst = !isInterState && data.gstEnabled ? data.taxAmount / 2 : 0;
  const igst = isInterState && data.gstEnabled ? data.taxAmount : 0;

  const itemRows: string[] = [];
  for (const item of data.items) {
    const hsnCell = item.hsnCode
      ? "<td style=\"padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#8b7e72;font-size:12px;\">" + escapeHtml(item.hsnCode) + closeTd()
      : "<td style=\"padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#ccc;font-size:12px;\">" + EM_DASH + closeTd();
    itemRows.push(
      "<tr" + GT +
      "<td style=\"padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;\">" + escapeHtml(item.name) + closeTd() +
      hsnCell +
      "<td style=\"padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;text-align:center;\">" + escapeHtml(String(item.quantity)) + closeTd() +
      "<td style=\"padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;text-align:right;\">" + RS + item.price.toFixed(2) + closeTd() +
      "<td style=\"padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;text-align:right;\">" + RS + (item.quantity * item.price).toFixed(2) + closeTd() +
      closeTr()
    );
  }
  const itemsHtml = itemRows.join("");

  const footer = data.footerMessage || "Thank you for choosing us.<br/>We truly appreciate your visit and look forward to serving you again.<br/>If you have any questions regarding your order, please contact us.";

  let taxRows = "";
  if (data.gstEnabled) {
    if (isInterState) {
      taxRows = "<tr" + GT + "<td style=\"padding:3px 0;color:#8b7e72;font-size:13px;\">IGST (" + igstRate + "%)</td" + GT + "<td style=\"padding:3px 0;color:#4a3428;font-size:13px;text-align:right;\">" + RS + igst.toFixed(2) + closeTd() + closeTr();
    } else {
      taxRows =
        "<tr" + GT + "<td style=\"padding:3px 0;color:#8b7e72;font-size:13px;\">CGST (" + cgstRate + "%)</td" + GT + "<td style=\"padding:3px 0;color:#4a3428;font-size:13px;text-align:right;\">" + RS + cgst.toFixed(2) + closeTd() + closeTr() +
        "<tr" + GT + "<td style=\"padding:3px 0;color:#8b7e72;font-size:13px;\">SGST (" + sgstRate + "%)</td" + GT + "<td style=\"padding:3px 0;color:#4a3428;font-size:13px;text-align:right;\">" + RS + sgst.toFixed(2) + closeTd() + closeTr();
    }
  }

  const sellerParts: string[] = [];
  if (data.gstNumber) {
    sellerParts.push("<div style=\"color:#fff;font-size:11px;margin-top:4px;opacity:0.95;\">" + "<strong style=\"opacity:0.7;\">GSTIN</strong" + GT + " " + escapeHtml(data.gstNumber) + closeDiv());
  }
  if (data.panNumber) {
    sellerParts.push("<div style=\"color:#fff;font-size:11px;margin-top:2px;opacity:0.95;\">" + "<strong style=\"opacity:0.7;\">PAN</strong" + GT + " " + escapeHtml(data.panNumber) + closeDiv());
  }
  if (data.stateCode) {
    const place = data.placeOfSupply ? " " + EM_DASH + " " + escapeHtml(data.placeOfSupply) : "";
    sellerParts.push("<div style=\"color:#fff;font-size:11px;margin-top:2px;opacity:0.95;\">" + "<strong style=\"opacity:0.7;\">State</strong" + GT + " " + escapeHtml(data.stateCode) + place + closeDiv());
  }
  const sellerInfo = sellerParts.join("");

  let customerBlock = "";
  if (data.customerName || data.customerPhone) {
    customerBlock =
      "<div style=\"margin-top:8px;padding-top:8px;border-top:1px solid #e8e0d4;\">" +
      "<div style=\"color:#8b7e72;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;\">Bill To</div" + GT +
      (data.customerName ? "<div style=\"color:#4a3428;font-size:13px;font-weight:600;\">" + escapeHtml(data.customerName) + closeDiv() : "") +
      (data.customerPhone ? "<div style=\"color:#8b7e72;font-size:12px;\">" + escapeHtml(data.customerPhone) + closeDiv() : "") +
      closeDiv();
  }

  const sequentialRow = data.sequentialInvoiceNumber
    ? "<tr" + GT + "<td style=\"padding:4px 0;color:#8b7e72;font-size:13px;\">Invoice #</td" + GT + "<td style=\"padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;\">" + escapeHtml(data.sequentialInvoiceNumber) + closeTd() + closeTr()
    : "";

  const orderNumDisplay = escapeHtml(String(data.orderNumber || EM_DASH));

  const subtotalRow =
    "<tr" + GT + "<td style=\"padding:3px 0;color:#8b7e72;font-size:13px;\">Subtotal</td" + GT +
    "<td style=\"padding:3px 0;color:#4a3428;font-size:13px;text-align:right;\">" + RS + data.subtotal.toFixed(2) + closeTd() + closeTr();

  const scRow = data.serviceCharge > 0
    ? "<tr" + GT + "<td style=\"padding:3px 0;color:#8b7e72;font-size:13px;\">Service Charge" +
      (data.sacCode ? " <span style=\"color:#aaa;font-size:11px;\">(SAC " + escapeHtml(data.sacCode) + closeSpan() : "") +
      closeTd() +
      "<td style=\"padding:3px 0;color:#4a3428;font-size:13px;text-align:right;\">" + RS + data.serviceCharge.toFixed(2) + closeTd() + closeTr()
    : "";

  const discountRow = data.discountAmount > 0
    ? "<tr" + GT + "<td style=\"padding:3px 0;color:#ef4444;font-size:13px;\">Discount" +
      (data.discountReason ? " (" + escapeHtml(data.discountReason) + ")" : "") +
      closeTd() +
      "<td style=\"padding:3px 0;color:#ef4444;font-size:13px;text-align:right;\">-" + RS + data.discountAmount.toFixed(2) + closeTd() + closeTr()
    : "";

  const totalRow =
    "<tr" + GT + "<td style=\"padding:6px 0;border-top:2px solid #c08a4d;color:#4a3428;font-size:15px;font-weight:700;\">Total</td" + GT +
    "<td style=\"padding:6px 0;border-top:2px solid #c08a4d;color:#10b981;font-size:15px;font-weight:700;text-align:right;\">" + RS + data.finalTotal.toFixed(2) + closeTd() + closeTr();

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"" + closeHead(),
    "<body style=\"margin:0;padding:0;background:#f8f4ec;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;\">",
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">",
    "<tr" + GT + "<td align=\"center\" style=\"padding:32px 16px;\">",
    "<table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#fffcf8;border-radius:20px;box-shadow:0 4px 24px rgba(74,52,40,0.08);overflow:hidden;max-width:100%;\">",
    "<tr" + GT + "<td style=\"background:#c08a4d;padding:32px 40px;text-align:center;\">",
    data.logoUrl ? "<img src=\"" + escapeHtml(data.logoUrl) + "\" alt=\"" + escapeHtml(data.restaurantName) + "\" style=\"max-height:64px;margin-bottom:12px;border-radius:8px;\" />" : "",
    "<h1 style=\"margin:0;color:#fff;font-size:24px;font-weight:700;\">" + escapeHtml(data.restaurantName) + closeH1(),
    data.restaurantAddress ? "<p style=\"color:#fff;font-size:12px;margin:6px 0 0;opacity:0.9;\">" + escapeHtml(data.restaurantAddress) + closeP() : "",
    sellerInfo,
    closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:20px 40px 0;text-align:center;\"><p style=\"color:#4a3428;font-size:14px;margin:0;font-weight:600;letter-spacing:1px;\">TAX INVOICE</p" + GT + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:16px 40px 20px;\">",
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f8f4ec;border-radius:12px;padding:20px;\">",
    sequentialRow,
    "<tr" + GT + "<td style=\"padding:4px 0;color:#8b7e72;font-size:13px;\">Order #</td" + GT + "<td style=\"padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;\">" + orderNumDisplay + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:4px 0;color:#8b7e72;font-size:13px;\">Order Date</td" + GT + "<td style=\"padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;\">" + escapeHtml(data.orderDate) + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:4px 0;color:#8b7e72;font-size:13px;\">Table</td" + GT + "<td style=\"padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;\">" + escapeHtml(data.tableLabel) + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:4px 0;color:#8b7e72;font-size:13px;\">Amount Paid</td" + GT + "<td style=\"padding:4px 0;color:#10b981;font-size:13px;font-weight:700;text-align:right;\">" + RS + data.finalTotal.toFixed(2) + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:4px 0;color:#8b7e72;font-size:13px;\">Payment Status</td" + GT + "<td style=\"padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;text-transform:capitalize;\">" + escapeHtml(data.paymentStatus) + closeTd() + closeTr(),
    customerBlock,
    closeTable() + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:0 40px;\">",
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">",
    "<thead><tr" + GT +
    "<th style=\"padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:left;font-weight:600;\">Item</th" + GT +
    "<th style=\"padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:left;font-weight:600;\">HSN</th" + GT +
    "<th style=\"padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:center;font-weight:600;\">Qty</th" + GT +
    "<th style=\"padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:right;font-weight:600;\">Price</th" + GT +
    "<th style=\"padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:right;font-weight:600;\">Total</th" + GT +
    closeTr() + closeThead(),
    "<tbody>" + itemsHtml + closeTbody(),
    closeTable() + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:16px 40px;\">",
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">",
    subtotalRow,
    scRow,
    taxRows,
    discountRow,
    totalRow,
    closeTable() + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:0 40px 24px;\"><p style=\"color:#8b7e72;font-size:12px;margin:0;\">Payment: " + (data.paymentMethod === "online" ? "Online (Razorpay)" : "Counter") + closeP() + closeTd() + closeTr(),
    "<tr" + GT + "<td style=\"padding:24px 40px;background:#f8f4ec;text-align:center;\"><p style=\"color:#8b7e72;font-size:13px;margin:0;line-height:1.6;\">" + escapeHtml(footer) + closeP() + closeTd() + closeTr(),
    data.reviewLink ? "<tr" + GT + "<td style=\"padding:0 40px 24px;text-align:center;\"><p style=\"color:#4a3428;font-size:14px;margin:0 0 8px;font-weight:600;\">Enjoyed your meal? Leave us a review</p" + GT + "<a href=\"" + escapeHtml(data.reviewLink) + "\" style=\"color:#c08a4d;font-size:13px;text-decoration:underline;font-weight:500;\">" + escapeHtml(data.reviewLink) + closeA() + closeTd() + closeTr() : "",
    closeTable() + closeTd() + closeTr() + closeTable() + closeBody() + closeHtml(),
  ].join("");
}
