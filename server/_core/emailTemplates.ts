function escapeHtml(str: string): string {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export interface InvoiceEmailData {
  restaurantName: string;
  logoUrl: string | null;
  invoiceNumber: string;
  orderNumber: number | null;
  tableLabel: string;
  orderDate: string;
  restaurantAddress: string;
  gstNumber: string | null;
  items: Array<{ name: string; quantity: number; price: number }>;
  subtotal: number;
  serviceCharge: number;
  taxAmount: number;
  gstRate: number;
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
}

export function buildInvoiceEmailHtml(data: InvoiceEmailData): string {
  const cgst = data.gstEnabled ? data.taxAmount / 2 : 0;
  const sgst = data.gstEnabled ? data.taxAmount / 2 : 0;

  const itemsHtml = data.items.map((item) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;">${escapeHtml(item.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;text-align:center;">${escapeHtml(String(item.quantity))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;text-align:right;">₹${item.price.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e8e0d4;color:#4a3428;font-size:14px;text-align:right;">₹${(item.quantity * item.price).toFixed(2)}</td>
    </tr>
  `).join("");

  const footer = data.footerMessage || `Thank you for choosing us.<br/>We truly appreciate your visit and look forward to serving you again.<br/>If you have any questions regarding your order, please contact us.`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f4ec;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fffcf8;border-radius:20px;box-shadow:0 4px 24px rgba(74,52,40,0.08);overflow:hidden;max-width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#c08a4d;padding:32px 40px;text-align:center;">
              ${data.logoUrl ? `<img src="${escapeHtml(data.logoUrl)}" alt="${escapeHtml(data.restaurantName)}" style="max-height:64px;margin-bottom:12px;border-radius:8px;" />` : ""}
              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">${escapeHtml(data.restaurantName)}</h1>
            </td>
          </tr>
          <!-- Thank you message -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="color:#4a3428;font-size:18px;margin:0 0 4px;font-weight:600;">Thank you for dining with us!</p>
              <p style="color:#8b7e72;font-size:14px;margin:0 0 20px;">We appreciate your visit and hope to serve you again soon. Below is your invoice.</p>
            </td>
          </tr>
          <!-- View Invoice Button -->
          <tr>
            <td style="padding:0 40px 24px;text-align:center;">
              <a href="${escapeHtml(data.invoiceUrl)}" style="display:inline-block;padding:14px 32px;background:#4a3428;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;">View Invoice</a>
            </td>
          </tr>
          <!-- Invoice summary -->
          <tr>
            <td style="padding:0 40px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f4ec;border-radius:12px;padding:20px;">
                <tr>
                  <td style="padding:4px 0;color:#8b7e72;font-size:13px;">Invoice Number</td>
                  <td style="padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(data.invoiceNumber)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#8b7e72;font-size:13px;">Order Date</td>
                  <td style="padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(data.orderDate)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#8b7e72;font-size:13px;">Table</td>
                  <td style="padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(data.tableLabel)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#8b7e72;font-size:13px;">Amount Paid</td>
                  <td style="padding:4px 0;color:#10b981;font-size:13px;font-weight:700;text-align:right;">₹${data.finalTotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#8b7e72;font-size:13px;">Payment Status</td>
                  <td style="padding:4px 0;color:#4a3428;font-size:13px;font-weight:600;text-align:right;text-transform:capitalize;">${escapeHtml(data.paymentStatus)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Items table -->
          <tr>
            <td style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <thead>
                  <tr>
                    <th style="padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:left;font-weight:600;">Item</th>
                    <th style="padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:center;font-weight:600;">Qty</th>
                    <th style="padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:right;font-weight:600;">Price</th>
                    <th style="padding:8px 12px;border-bottom:2px solid #c08a4d;color:#4a3428;font-size:13px;text-align:right;font-weight:600;">Total</th>
                  </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
              </table>
            </td>
          </tr>
          <!-- Totals -->
          <tr>
            <td style="padding:16px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:3px 0;color:#8b7e72;font-size:13px;">Subtotal</td><td style="padding:3px 0;color:#4a3428;font-size:13px;text-align:right;">₹${data.subtotal.toFixed(2)}</td></tr>
                ${data.serviceCharge > 0 ? `<tr><td style="padding:3px 0;color:#8b7e72;font-size:13px;">Service Charge</td><td style="padding:3px 0;color:#4a3428;font-size:13px;text-align:right;">₹${data.serviceCharge.toFixed(2)}</td></tr>` : ""}
                ${data.gstEnabled ? `
                <tr><td style="padding:3px 0;color:#8b7e72;font-size:13px;">CGST (${data.gstRate / 2}%)</td><td style="padding:3px 0;color:#4a3428;font-size:13px;text-align:right;">₹${cgst.toFixed(2)}</td></tr>
                <tr><td style="padding:3px 0;color:#8b7e72;font-size:13px;">SGST (${data.gstRate / 2}%)</td><td style="padding:3px 0;color:#4a3428;font-size:13px;text-align:right;">₹${sgst.toFixed(2)}</td></tr>
                ` : ""}
                ${data.discountAmount > 0 ? `<tr><td style="padding:3px 0;color:#ef4444;font-size:13px;">Discount${data.discountReason ? ` (${escapeHtml(data.discountReason)})` : ""}</td><td style="padding:3px 0;color:#ef4444;font-size:13px;text-align:right;">-₹${data.discountAmount.toFixed(2)}</td></tr>` : ""}
                <tr><td style="padding:6px 0;border-top:2px solid #c08a4d;color:#4a3428;font-size:15px;font-weight:700;">Total</td><td style="padding:6px 0;border-top:2px solid #c08a4d;color:#10b981;font-size:15px;font-weight:700;text-align:right;">₹${data.finalTotal.toFixed(2)}</td></tr>
              </table>
            </td>
          </tr>
          <!-- Payment info -->
          <tr>
            <td style="padding:0 40px 24px;">
              <p style="color:#8b7e72;font-size:12px;margin:0;">Payment: ${data.paymentMethod === "online" ? "Online (Razorpay)" : "Counter"}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background:#f8f4ec;text-align:center;">
              <p style="color:#8b7e72;font-size:13px;margin:0;line-height:1.6;">${escapeHtml(footer)}</p>
              ${data.restaurantAddress ? `<p style="color:#8b7e72;font-size:11px;margin:8px 0 0;">${escapeHtml(data.restaurantAddress)}</p>` : ""}
            </td>
          </tr>
          ${data.reviewLink ? `
          <!-- Review -->
          <tr>
            <td style="padding:0 40px 24px;text-align:center;">
              <p style="color:#4a3428;font-size:14px;margin:0 0 8px;font-weight:600;">⭐ Enjoyed your meal? Leave us a review.</p>
              <a href="${escapeHtml(data.reviewLink)}" style="color:#c08a4d;font-size:13px;text-decoration:underline;font-weight:500;">${escapeHtml(data.reviewLink)}</a>
            </td>
          </tr>
          ` : ""}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
