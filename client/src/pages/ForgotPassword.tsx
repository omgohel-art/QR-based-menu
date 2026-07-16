import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (sendError) {
        setError(sendError.message);
        setIsSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sign In
        </button>

        {sent ? (
          <div className="text-center bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-green-500" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Check Your Email</h1>
            <p className="text-sm text-slate-500">
              We've sent a password reset link to <strong className="text-slate-700">{email}</strong>
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
                <Mail className="w-7 h-7 text-blue-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Forgot Password</h1>
              <p className="text-sm text-slate-500 mt-1">
                Enter your email and we'll send you a reset link
              </p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-lg shadow-blue-500/25"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
