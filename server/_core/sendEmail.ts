/**
 * Email sender — uses Brevo HTTPS API (works on Render free tier where SMTP is blocked).
 * Sign up at https://www.brevo.com/ — free tier: 300 emails/day.
 * Get API key from Brevo Dashboard → Settings → SMTP & API → API Keys.
 * Set BREVO_API_KEY env var in Render.
 */
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const FROM_EMAIL = process.env.FROM_EMAIL || (process.env.GMAIL_USER ? `MAMA Cafe <${process.env.GMAIL_USER}>` : "MAMA Cafe <noreply@mama.cafe>");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  if (!BREVO_API_KEY) {
    console.log(`[OTP] Brevo API key not configured. OTP for ${email}: ${otp}`);
    throw new Error("Email service not configured");
  }

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;">
      <h1 style="font-size:20px;color:#1e293b;margin:0 0 8px;">MAMA Cafe</h1>
      <p style="color:#64748b;font-size:14px;margin:0 0 16px;">Your password reset code</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#5e7ff6;text-align:center;padding:24px;background:#f1f5f9;border-radius:12px;">${otp}</div>
      <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">This code expires in 5 minutes.</p>
    </div>
  `;

  // Brevo requires a plain email in the "sender" field — extract from "Name <email@x>" format
  const senderEmail = FROM_EMAIL.match(/<([^>]+)>/)?.[1] || FROM_EMAIL;

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "MAMA Cafe", email: senderEmail },
        to: [{ email }],
        subject: "Password Reset OTP - MAMA Cafe",
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[OTP] Brevo API error: ${res.status} ${errText}`);
      throw new Error(`Brevo send failed: ${res.status}`);
    }

    console.log(`[OTP] Email sent to ${email} via Brevo`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OTP] Email send failed: ${msg}`);
    throw new Error(`Failed to send email: ${msg}`);
  }
}
