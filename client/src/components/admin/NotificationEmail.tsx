import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Mail, Loader2, ArrowLeft, CheckCircle, AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";

interface NotificationEmailProps {
  onNavigate?: (page: string) => void;
}

export default function NotificationEmail({ onNavigate }: NotificationEmailProps) {
  const { user, logout } = useAuth();
  const currentEmail = user?.email || "";
  const [newEmail, setNewEmail] = useState(currentEmail);
  const [changeSuccess, setChangeSuccess] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isChanged = newEmail !== currentEmail;
  const isValid = emailRegex.test(newEmail);
  const canSubmit = isChanged && isValid;

  const checkDuplicate = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check email");
      return data;
    },
  });

  const verifyPassword = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      return data;
    },
  });

  const changeEmail = useMutation({
    mutationFn: async (email: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const res = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ newEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change email");
      return data;
    },
    onSuccess: async () => {
      setChangeSuccess(true);
      setPasswordOpen(false);
      toast.success("Email updated successfully! Please sign in again.");
      setTimeout(() => {
        logout();
      }, 2000);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = async () => {
    if (!isValid) { toast.error("Invalid email address"); return; }
    setPassword("");
    setPasswordError("");
    setPasswordOpen(true);
  };

  const handleConfirmPassword = async () => {
    if (!password) { setPasswordError("Password is required"); return; }
    setPasswordError("");

    try {
      await verifyPassword.mutateAsync({ email: currentEmail, password });
      changeEmail.mutate(newEmail);
    } catch {
      setPasswordError("Incorrect password. Please try again.");
    }
  };

  const handleReset = () => {
    setNewEmail(currentEmail);
    setChangeSuccess(false);
  };

  return (
    <Card className="max-w-2xl mx-auto p-6 md:p-8 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3 mb-6">
        {onNavigate && (
          <button
            onClick={() => onNavigate("back")}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Notification Email</h2>
        </div>
      </div>

      {changeSuccess ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Email Updated!</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Your email has been changed to <strong>{newEmail}</strong>. You'll be signed out in a moment — please sign in with your new email.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Current Email</label>
            <Input value={currentEmail} disabled className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">New Email</label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="newemail@example.com"
              className={newEmail && !emailRegex.test(newEmail) ? "border-red-400 focus:border-red-400 focus:ring-red-500/20" : ""}
            />
            {newEmail && !emailRegex.test(newEmail) && (
              <p className="text-xs text-red-500 dark:text-red-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Invalid email format
              </p>
            )}
            {newEmail && emailRegex.test(newEmail) && newEmail !== currentEmail && (
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                A verification email will be sent to your new address.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || changeEmail.isPending || checkDuplicate.isPending}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 flex-1"
            >
              {checkDuplicate.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checking...</>
              ) : (
                <><Mail className="w-4 h-4 mr-2" /> Send Verification</>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={!isChanged}>
              Reset
            </Button>
          </div>
        </div>
      )}

      <Dialog open={passwordOpen} onOpenChange={(open) => { if (!open) setPasswordOpen(false); }}>
        <DialogContent className="bg-white dark:bg-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              Confirm Your Password
            </DialogTitle>
            <DialogDescription>
              Enter your current password to confirm the email change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmPassword(); }}
                placeholder="Enter your password"
                autoFocus
                className={passwordError ? "border-red-400 focus:border-red-400 focus:ring-red-500/20" : ""}
              />
              {passwordError && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {passwordError}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleConfirmPassword}
                disabled={!password || verifyPassword.isPending || changeEmail.isPending}
                className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 flex-1"
              >
                {verifyPassword.isPending || changeEmail.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                ) : (
                  "Confirm & Send"
                )}
              </Button>
              <Button variant="outline" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
