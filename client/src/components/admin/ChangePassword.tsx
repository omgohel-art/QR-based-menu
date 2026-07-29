import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2, Check, Eye, EyeOff, Shield, Users } from "lucide-react";
import { toast } from "sonner";

const MIN_LENGTH = 8;

function getStrength(password: string): { score: number; label: string; color: string; bg: string } {
  let score = 0;
  if (password.length >= MIN_LENGTH) score += 25;
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 20;
  if (/[0-9]/.test(password)) score += 20;
  if (/[^a-zA-Z0-9]/.test(password)) score += 20;

  if (score < 30) return { score, label: "Weak", color: "text-red-500", bg: "bg-red-500" };
  if (score < 50) return { score, label: "Fair", color: "text-orange-500", bg: "bg-orange-500" };
  if (score < 70) return { score, label: "Good", color: "text-yellow-500", bg: "bg-yellow-500" };
  if (score < 90) return { score, label: "Strong", color: "text-lime-500", bg: "bg-lime-500" };
  return { score: 100, label: "Very Strong", color: "text-green-600", bg: "bg-green-500" };
}

export default function ChangePassword() {
  const { user, updatePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  const strength = getStrength(newPass);

  const requirements = [
    { label: "Minimum 8 characters", met: newPass.length >= MIN_LENGTH },
    { label: "One lowercase letter", met: /[a-z]/.test(newPass) },
    { label: "One uppercase letter", met: /[A-Z]/.test(newPass) },
    { label: "One number", met: /[0-9]/.test(newPass) },
    { label: "One symbol", met: /[^a-zA-Z0-9]/.test(newPass) },
  ];

  const handleSubmit = async () => {
    if (!current) { toast.error("Enter your current password"); return; }
    if (newPass !== confirm) { toast.error("Passwords do not match"); return; }
    if (strength.score < 50) { toast.error("Password too weak"); return; }

    setSubmitting(true);
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user?.email || "",
      password: current,
    });
    if (reAuthError) {
      toast.error("Current password is incorrect");
      setSubmitting(false);
      return;
    }

    const { error } = await updatePassword(newPass, true);
    if (error) {
      toast.error(error);
    } else {
      setSuccess(true);
      setCurrent("");
      setNewPass("");
      setConfirm("");
      toast.success("Password updated successfully");
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <Card className="max-w-lg mx-auto p-8 bg-white dark:bg-slate-900 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Password Updated</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Your password has been changed successfully.</p>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg mx-auto p-6 md:p-8 bg-white dark:bg-slate-900">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
        <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        Change Password
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Current Password</label>
          <div className="relative">
            <Input type={showCurrent ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Enter current password" className="pr-10" />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            disabled={resetCooldown > 0}
            onClick={async () => {
              if (!user?.email) { toast.error("No email found"); return; }
              const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: `${window.location.origin}/admin`,
              });
              if (error) toast.error(error.message);
              else {
                toast.success("Password reset link sent to your email");
                setResetCooldown(45);
                const interval = setInterval(() => {
                  setResetCooldown((prev) => {
                    if (prev <= 1) { clearInterval(interval); return 0; }
                    return prev - 1;
                  });
                }, 1000);
              }
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1.5 inline-block disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed"
          >
            {resetCooldown > 0 ? `Resend in ${resetCooldown}s` : "Forgot password?"}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">New Password</label>
          <div className="relative">
            <Input type={showNew ? "text" : "password"} value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Enter new password" className="pr-10" />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {newPass && (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full ${strength.bg} transition-all`} style={{ width: `${strength.score}%` }} />
              </div>
              <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>
            </div>
          )}
          {newPass && !requirements.every(r => r.met) && (
            <div className="mt-2 space-y-0.5">
              {requirements.map((req) => (
                <li key={req.label} className={`text-xs flex items-center gap-1.5 list-none ${req.met ? "text-green-600 dark:text-green-400" : "text-slate-400 dark:text-slate-500"}`}>
                  <span className={req.met ? "text-green-500" : "text-slate-300 dark:text-slate-600"}>{req.met ? "✓" : "•"}</span>
                  {req.label}
                </li>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Confirm New Password</label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" />
          {newPass && confirm && newPass !== confirm && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">Passwords do not match</p>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={submitting || !current || !newPass || !confirm || !requirements.every(r => r.met)} className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
          {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating...</> : <><Lock className="w-4 h-4 mr-2" /> Update Password</>}
        </Button>
      </div>
    </Card>
  );
}
