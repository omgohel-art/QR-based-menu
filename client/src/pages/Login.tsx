import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, LogIn, UtensilsCrossed } from "lucide-react";
import "@/components/LoadingRipple.css";

export default function Login() {
  const { login, user, profile, loading } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kitchenMode, setKitchenMode] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="ld-ripple"><div /><div /></div>
      </div>
    );
  }

  if (user) {
    if (profile?.must_change_password) {
      navigate("/force-change-password", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.error) {
        setError(result.error);
        setIsSubmitting(false);
      } else {
        if (kitchenMode) {
          localStorage.setItem("kitchenMode", "true");
          navigate("/", { replace: true });
        }
      }
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25">
            {kitchenMode ? <UtensilsCrossed className="w-7 h-7 text-white" /> : <span className="text-white font-bold text-xl">M</span>}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{kitchenMode ? "Kitchen Panel" : "MAMA Cafe"}</h1>
          <p className="text-sm text-slate-500 mt-1">{kitchenMode ? "Kitchen staff login" : "Sign in to your dashboard"}</p>
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
              autoComplete="email"
              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full h-11 px-4 pr-11 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate("/forgot-password")}
              className="text-sm text-blue-500 hover:text-blue-700 hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          MAMA Cafe — Restaurant Management System
        </p>
        <button
          onClick={() => { setKitchenMode(!kitchenMode); setError(""); }}
          className="mt-3 w-full text-center text-sm text-amber-600 hover:text-amber-700 hover:underline"
        >
          {kitchenMode ? "Back to Admin Login" : "Access to kitchen panel"}
        </button>
      </div>
    </div>
  );
}
