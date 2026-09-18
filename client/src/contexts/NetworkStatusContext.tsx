import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { syncOfflineQueue, getPendingOfflineCount } from "@/lib/offlineQueue";
import { toast } from "sonner";

interface NetworkStatusContextType {
  isOnline: boolean;
  isOffline: boolean;
  wasOffline: boolean;
  pendingCount: { orders: number; settlements: number };
  syncQueue: () => Promise<void>;
}

const NetworkStatusContext = createContext<NetworkStatusContextType | null>(null);

export function useNetworkStatus(): NetworkStatusContextType {
  const ctx = useContext(NetworkStatusContext);
  if (!ctx) {
    throw new Error("useNetworkStatus must be used within NetworkStatusProvider");
  }
  return ctx;
}

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState({ orders: 0, settlements: 0 });

  const refreshPendingCount = async () => {
    const counts = await getPendingOfflineCount();
    setPendingCount(counts);
  };

  const syncQueue = async () => {
    if (!navigator.onLine) return;
    const { syncedOrders, syncedSettlements } = await syncOfflineQueue();
    if (syncedOrders > 0 || syncedSettlements > 0) {
      toast.success("Offline data synced successfully", {
        description: `Synced ${syncedOrders} order(s) and ${syncedSettlements} bill(s).`,
      });
    }
    await refreshPendingCount();
  };

  useEffect(() => {
    refreshPendingCount();

    const handleOnline = async () => {
      setIsOnline(true);
      setIsOffline(false);
      setWasOffline(true);
      setTimeout(() => setWasOffline(false), 5000);
      await syncQueue();
    };

    const handleOffline = () => {
      setIsOffline(true);
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <NetworkStatusContext.Provider value={{ isOnline, isOffline, wasOffline, pendingCount, syncQueue }}>
      {children}
    </NetworkStatusContext.Provider>
  );
}