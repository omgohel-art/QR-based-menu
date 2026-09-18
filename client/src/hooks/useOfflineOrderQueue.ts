import { useEffect, useState, useCallback } from "react";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";
import { getPendingOfflineCount, syncOfflineQueue, queueOfflineOrder } from "@/lib/offlineQueue";
import { toast } from "sonner";

interface SyncResult {
  synced: number;
  failed: number;
}

interface OfflineOrderPayload {
  tableCode: string;
  items: Array<{
    menuItemId: number;
    name: string;
    price: number;
    quantity: number;
    variantSelections?: any;
    specialInstructions?: string;
  }>;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
}

// Drains the IndexedDB order queue when the browser comes back online.
// Returns the number of orders successfully synced.
export function useOfflineOrderQueue() {
  const { isOnline, pendingCount, syncQueue } = useNetworkStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const counts = await getPendingOfflineCount();
      setPending(counts.orders);
    } catch {
      /* IDB not available */
    }
  }, []);

  const drain = useCallback(async (): Promise<SyncResult> => {
    if (!isOnline) return { synced: 0, failed: 0 };
    setSyncing(true);
    const result: SyncResult = { synced: 0, failed: 0 };
    try {
      // Trigger sync via NetworkStatusContext
      await syncQueue();
      const counts = await getPendingOfflineCount();
      setPending(counts.orders);
      result.synced = 1;
    } catch (err: any) {
      result.failed = 1;
    } finally {
      setSyncing(false);
    }
    return result;
  }, [isOnline]);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 10_000);
    return () => clearInterval(i);
  }, [refresh]);

  // Auto-drain when going online.
  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    (async () => {
      const r = await drain();
      if (cancelled) return;
      if (r.synced > 0) {
        toast.success(`Synced ${r.synced} offline order${r.synced === 1 ? "" : "s"}`);
      }
      if (r.failed > 0) {
        toast.error(`Failed to sync ${r.failed} order${r.failed === 1 ? "" : "s"} — will retry`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, drain]);

  return { pending, syncing, drain, refresh, enqueueOrder: queueOfflineOrder };
}
