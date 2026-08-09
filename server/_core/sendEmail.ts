import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
const FROM_EMAIL = process.env.FROM_EMAIL || (GMAIL_USER ? `MAMA Cafe <${GMAIL_USER}>` : "MAMA Cafe <noreply@mama.cafe>");

let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (!_transporter && GMAIL_USER && GMAIL_APP_PASSWORD) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return _transporter;
}

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[OTP] Gmail SMTP not configured (missing GMAIL_USER or GMAIL_APP_PASSWORD). OTP for ${email}: ${otp}`);
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

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to: email,
      subject: "Password Reset OTP - MAMA Cafe",
      html,
    });
    console.log(`[OTP] Email sent to ${email} (messageId: ${info.messageId})`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OTP] Email send failed: ${msg}`);
    throw new Error(`Failed to send email: ${msg}`);
  }
}
