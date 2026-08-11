import { useQuery } from "@tanstack/react-query";
import { X, Clock, Sparkles } from "lucide-react";
import { useState } from "react";

interface TrialStatus {
  isInTrial: boolean;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  daysRemaining: number;
  hasLicense: boolean;
  licenseExpiresAt: string | null;
  isExpired: boolean;
  requiresUpgrade: boolean;
}

const DISMISS_KEY = "mama_trial_banner_dismissed_for";

export default function TrialBanner() {
  const [dismissedFor, setDismissedFor] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  const { data: status } = useQuery<TrialStatus>({
    queryKey: ["trial-status"],
    queryFn: async () => {
      const res = await fetch("/api/trial/status");
      if (!res.ok) throw new Error("Failed to load trial status");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (!status) return null;
  if (status.hasLicense) return null;
  if (!status.isInTrial && !status.isExpired) return null;
  if (status.isExpired) {
    return <ExpiredBanner />;
  }

  // Show only if daysRemaining <= 7 (so we don't spam users in the first week).
  const dismissKey = status.trialExpiresAt ?? "";
  if (dismissedFor === dismissKey) return null;
  if (status.daysRemaining > 7) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 flex items-center justify-between text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        <span>
          <strong>{status.daysRemaining} day{status.daysRemaining === 1 ? "" : "s"} left</strong> in your free trial.
          Contact support to upgrade.
       </span>
     </div>
      <button
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, dismissKey); } catch {}
          setDismissedFor(dismissKey);
        }}
        className="p-1 hover:bg-white/20 rounded transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
     </button>
   </div>
  );
}

function ExpiredBanner() {
  return (
    <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-center gap-3 text-sm font-medium">
      <Clock className="w-4 h-4" />
      <span>
        Your free trial has ended. Contact support to continue using MAMA Cafe.
     </span>
      <a
        href="mailto:support@mama-cafe.example"
        className="ml-2 underline hover:no-underline font-bold"
      >
        Contact Support
     </a>
   </div>
  );
}
