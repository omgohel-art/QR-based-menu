import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { User, LogOut, Lock, Key, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import { notificationSound } from "@/services/notificationSound";

interface QuickPinSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitch: (userId: string) => void;
}

export default function QuickPinSwitcher({ isOpen, onClose, onSwitch }: QuickPinSwitcherProps) {
  const { profile, refreshProfile, login: supabaseLogin } = useAuth();
  const { enabled: soundEnabled, volume: soundVolume } = useSoundSettings();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showKeypad, setShowKeypad] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const attemptCount = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setError("");
      setShowKeypad(true);
      attemptCount.current = 0;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleNumberPress = useCallback((num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
      setError("");
    }
  }, [pin.length]);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  }, []);

  const handleClear = useCallback(() => {
    setPin("");
    setError("");
  }, []);

  const handleSubmit = async () => {
    if (pin.length !== 4) {
      setError("Enter 4-digit PIN");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        attemptCount.current += 1;
        setError(data.error || "Invalid PIN");
        if (attemptCount.current >= 3) {
          setShowKeypad(false);
          setTimeout(() => {
            setShowKeypad(true);
            attemptCount.current = 0;
          }, 3000);
        }
        if (soundEnabled) {
          notificationSound.play(soundVolume / 100);
        }
        setLoading(false);
        return;
      }

      // PIN verified - sign in with Supabase using the returned user info
      // We need to create a session. Since we have the user ID, we can use the admin session
      // For now, let's use the profile data to switch the active staff
      
      // Update the auth context by refreshing
      await refreshProfile();
      
      // Notify parent to switch active staff
      onSwitch(data.profile.auth_user_id);
      
      if (soundEnabled) {
        notificationSound.play(soundVolume / 100);
      }
      
      toast.success(`Switched to ${data.profile.name || "Staff"}`, {
        description: `Role: ${data.profile.role}`,
      });
      
      onClose();
    } catch (err) {
      console.error("PIN switch error:", err);
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Quick Staff Switch
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {profile && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-white truncate">
                  Currently: {profile.name || "Staff"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                  {profile.role}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  onClose();
                  setTimeout(() => supabaseLogin("", ""), 100); // Trigger logout flow
                }}
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                title="Logout completely"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Enter 4-Digit PIN
            </label>
            
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4].map((i) => (
                <Input
                  key={i}
                  ref={i === 1 ? inputRef : undefined}
                  type="password"
                  maxLength={1}
                  value={pin[i - 1] || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && /^\d$/.test(val)) {
                      setPin((prev) => prev.slice(0, i - 1) + val + prev.slice(i));
                      if (i < 4) {
                        const nextInput = document.querySelector(
                          `input[data-pin-index="${i + 1}"]`
                        ) as HTMLInputElement;
                        nextInput?.focus();
                      }
                    } else if (!val && i > 1) {
                      // Handle backspace from next input
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !pin[i - 1] && i > 1) {
                      const prevInput = document.querySelector(
                        `input[data-pin-index="${i - 1}"]`
                      ) as HTMLInputElement;
                      prevInput?.focus();
                    }
                  }}
                  data-pin-index={i}
                  className="w-12 h-16 text-center text-2xl font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={loading || !showKeypad}
                />
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center animate-shake" role="alert">
                {error}
              </p>
            )}

            {!showKeypad && (
              <p className="text-sm text-amber-500 text-center">
                Too many attempts. Please wait...
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2" role="group" aria-label="PIN keypad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "backspace"].map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                className="h-14 text-xl font-medium transition-all active:scale-95 disabled:opacity-50"
                onClick={() => {
                  if (!loading && showKeypad) {
                    if (key === "backspace") handleBackspace();
                    else if (key !== null) handleNumberPress(String(key));
                  }
                }}
                disabled={loading || !showKeypad}
              >
                {key === "backspace" ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : key === null ? (
                  <div className="w-8 h-8" />
                ) : (
                  key
                )}
              </Button>
            ))}
          </div>

          <Button
            className="w-full h-12 text-lg font-semibold"
            onClick={handleSubmit}
            disabled={loading || pin.length !== 4 || !showKeypad}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Switching...
              </>
            ) : (
              <>
                <Key className="w-5 h-5 mr-2" />
                Switch Staff
              </>
            )}
          </Button>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleClear}
            disabled={loading}
          >
            Clear PIN
          </Button>

          <p className="text-xs text-center text-slate-400 dark:text-slate-500">
            PINs are set by admin in Staff Management
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}