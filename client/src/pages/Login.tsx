import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { FullPageSpinner } from "@/components/Skeletons";

export default function Login() {
  const { login, user, profile, loading } = useAuth();
  const [, navigate] = useLocation();
  const [loginMode, setLoginMode] = useState<"email" | "pin">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      if (profile?.must_change_password) {
        navigate("/force-change-password", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    }
  }, [user, profile, navigate]);

  if (loading) {
    return <FullPageSpinner />;
  }

  if (user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      if (loginMode === "pin") {
        // Validate PIN against API, then login with the staff's email + PIN login password
        try {
          const res = await fetch(`/api/auth/pin-login/${pin}`);
          const data = await res.json();
          if (data.valid && data.email) {
            const PIN_LOGIN_PASSWORD = import.meta.env.VITE_PIN_LOGIN_PASSWORD || "pinlogin2024";
            const result = await login(data.email, PIN_LOGIN_PASSWORD);
            if (result.error) setError(result.error);
          } else {
            setError(data.error || "Invalid 4-digit PIN");
          }
        } catch {
          setError("Failed to validate PIN. Please try again.");
        }
      } else {
        const result = await login(email, password);
        if (result.error) {
          setError(result.error);
        }
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setIsSubmitting(false);
  };

  const handlePinDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError("");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/25">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">MAMA Cafe</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your dashboard</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl mb-4 border border-slate-200">
          <button
            type="button"
            onClick={() => { setLoginMode("email"); setError(""); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              loginMode === "email" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Email Sign In
          </button>
          <button
            type="button"
            onClick={() => { setLoginMode("pin"); setError(""); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              loginMode === "pin" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            🔑 Staff 4-Digit PIN
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loginMode === "pin" ? (
            <div className="space-y-4 text-center">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Enter Staff PIN
              </label>

              {/* PIN Dots */}
              <div className="flex justify-center items-center gap-3 py-2">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      pin.length > idx ? "bg-blue-600 border-blue-600 scale-110" : "border-slate-300 bg-slate-50"
                    }`}
                  />
                ))}
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handlePinDigit(num)}
                    className="h-12 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 font-bold text-slate-800 text-lg hover:border-blue-300 active:scale-95 transition-all"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPin("")}
                  className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-semibold text-slate-600 transition-all"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handlePinDigit("0")}
                  className="h-12 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 font-bold text-slate-800 text-lg hover:border-blue-300 active:scale-95 transition-all"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPin(pin.slice(0, -1))}
                  className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-semibold text-slate-600 transition-all flex items-center justify-center"
                >
                  ⌫
                </button>
              </div>
            </div>
          ) : (
            <>
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
                  onClick={() => navigate("/forgot-password-otp")}
                  className="text-sm text-blue-500 hover:text-blue-700 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isSubmitting || (loginMode === "pin" && pin.length !== 4)}
            className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                {loginMode === "pin" ? "Fast PIN Sign In" : "Sign In"}
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          MAMA Cafe — Restaurant Management System
        </p>
      </div>
    </div>
  );
}
