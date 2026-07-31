import { useNetworkStatus } from "@/contexts/NetworkStatusContext";
import { Wifi, WifiOff } from "lucide-react";

export default function OnlineIndicator() {
  const { isOnline } = useNetworkStatus();

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors duration-300 ${
        isOnline
          ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
          : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
      }`}
      title={isOnline ? "Connected to internet" : "No internet connection"}
    >
      {isOnline ? (
        <Wifi className="w-3 h-3" />
      ) : (
        <WifiOff className="w-3 h-3" />
      )}
      <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
    </div>
  );
}
