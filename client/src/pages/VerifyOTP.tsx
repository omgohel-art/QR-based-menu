import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export default function VerifyOTP() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || "";

  const [otp, setOtp] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  if (!email) {
    navigate("/forgot-password-otp", { replace: true });
    return null;
  }

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[value.length - 1];
    }
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const code = otp.join("");
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect code");
        setIsSubmitting(false);
        return;
      }
      navigate(`/set-new-password?email=${encodeURIComponent(email)}&otp=${code}`);
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").trim();
    if (/^\d{4}$/.test(pasted)) {
      const digits = pasted.split("");
      setOtp(digits);
      inputRefs[3].current?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate(`/forgot-password-otp`)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Verify OTP</h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter the 4-digit code sent to <strong className="text-slate-700">{email}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-center gap-3" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={inputRefs[i]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                autoFocus={i === 0}
                className="w-14 h-14 text-center text-2xl font-bold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || otp.join("").length !== 4}
            className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              "Verify"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
