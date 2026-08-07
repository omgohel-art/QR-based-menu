import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Eye, EyeOff, CheckCircle } from "lucide-react";
import { FullPageSpinner } from "@/components/Skeletons";

export default function ResetPassword() {
  const { user, updatePassword } = useAuth();
  const [, navigate] = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const hash = window.location.hash;
    const query = window.location.search;

    // Supabase may send tokens in the hash (#access_token=...) or query (?access_token=...)
    const tokenSource = (hash && hash.includes("access_token")) ? hash.substring(1) : (query && query.includes("access_token") ? query.substring(1) : "");
    const params = new URLSearchParams(tokenSource);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const errorDescription = params.get("error_description");

    if (errorDescription) {
      setError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
      setInitializing(false);
      return;
    }

    if (accessToken && refreshToken) {
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ error }) => {
        if (error) setError("Invalid or expired reset link");
        setInitializing(false);
        // Clean the URL so a refresh doesn't replay the tokens
        window.history.replaceState(null, "", window.location.pathname);
      });
    } else {
      // No tokens in URL — check if there's already a session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          // Show error instead of silently redirecting, so user knows the link is bad
          setError("Invalid or expired reset link. Please request a new one.");
          setInitializing(false);
          return;
        }
        setInitializing(false);
      });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^a-zA-Z0-9]/.test(newPassword)) {
      setError("Password does not meet requirements");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updatePassword(newPassword, true);
      if (result.error) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (initializing) {
    return <FullPageSpinner />;
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="w-14 h-14 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Password Reset Successful</h1>
          <p className="text-sm text-slate-500 mb-6">You can now sign in with your new password.</p>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login", { replace: true });
            }}
            className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (error && initializing === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
            <Shield className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Reset Link Invalid</h1>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => navigate("/forgot-password", { replace: true })}
            className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors"
          >
            Request a New Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Reset Your Password</h1>
          <p className="text-sm text-slate-500 mt-1">Enter your new password</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                className="w-full h-11 px-4 pr-11 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 space-y-0.5">
                {(() => {
                  const reqs = [
                    { label: "Minimum 8 characters", met: newPassword.length >= 8 },
                    { label: "One lowercase letter", met: /[a-z]/.test(newPassword) },
                    { label: "One uppercase letter", met: /[A-Z]/.test(newPassword) },
                    { label: "One number", met: /[0-9]/.test(newPassword) },
                    { label: "One symbol", met: /[^a-zA-Z0-9]/.test(newPassword) },
                  ];
                  const allMet = reqs.every(r => r.met);
                  if (allMet) return null;
                  return reqs.map((req) => (
                    <li key={req.label} className={`text-xs flex items-center gap-1.5 list-none ${req.met ? "text-green-600" : "text-slate-400"}`}>
                      <span className={req.met ? "text-green-500" : "text-slate-300"}>{req.met ? "\u2713" : "\u2022"}</span>
                      {req.label}
                    </li>
                  ));
                })()}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              className="w-full h-11 px-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !newPassword || !confirmPassword || newPassword.length < 8 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^a-zA-Z0-9]/.test(newPassword) || newPassword !== confirmPassword}
            className="w-full h-11 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              "Reset Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
