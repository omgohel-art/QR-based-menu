import { useNetworkStatus } from "@/contexts/NetworkStatusContext";
import { AlertTriangle, Wifi, WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const { isOffline, wasOffline } = useNetworkStatus();

  if (wasOffline) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950 border-b border-emerald-200 dark:border-emerald-800 px-4 py-2.5 flex items-center justify-center gap-2 text-sm animate-in slide-in-from-top-0 duration-500">
        <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-emerald-700 dark:text-emerald-300 font-medium">
          Connected
        </span>
        <span className="text-emerald-600 dark:text-emerald-400">
          — You're back online.
        </span>
      </div>
    );
  }

  if (isOffline) {
    return (
      <div className="bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-4 py-2.5 flex items-center justify-center gap-2 text-sm animate-in slide-in-from-top-0 duration-300">
        <WifiOff className="w-4 h-4 text-red-600 dark:text-red-400" />
        <span className="text-red-700 dark:text-red-300 font-medium">
          Offline Mode
        </span>
        <span className="text-red-600 dark:text-red-400">
          — Internet connection lost. Some features are temporarily unavailable.
        </span>
      </div>
    );
  }

  return null;
}
