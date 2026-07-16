const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL = process.env.FROM_EMAIL || "MAMA Cafe <onboarding@resend.dev>";

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log(`[OTP] Email not configured. OTP for ${email}: ${otp}`);
    return;
  }

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:16px;">
      <h1 style="font-size:20px;color:#1e293b;margin:0 0 8px;">MAMA Cafe</h1>
      <p style="color:#64748b;font-size:14px;margin:0 0 16px;">Your password reset code</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#5e7ff6;text-align:center;padding:24px;background:#f1f5f9;border-radius:12px;">${otp}</div>
      <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">This code expires in 5 minutes.</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject: "Password Reset OTP - MAMA Cafe", html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[OTP] Email send failed: ${err}`);
    throw new Error("Failed to send email");
  }

  console.log(`[OTP] Email sent to ${email}`);
}
