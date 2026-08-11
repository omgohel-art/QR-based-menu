import { useEffect, useState, useCallback } from "react";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";
import { listQueued, deleteQueued, incrementRetry, queueSize } from "@/lib/offlineQueue";
import { toast } from "sonner";

interface SyncResult {
  synced: number;
  failed: number;
}

// Drains the IndexedDB order queue when the browser comes back online.
// Returns the number of orders successfully synced.
export function useOfflineOrderQueue() {
  const { isOnline } = useNetworkStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const n = await queueSize();
      setPending(n);
    } catch {
      /* IDB not available */
    }
  }, []);

  const drain = useCallback(async (): Promise<SyncResult> => {
    if (!isOnline) return { synced: 0, failed: 0 };
    setSyncing(true);
    const result: SyncResult = { synced: 0, failed: 0 };
    try {
      const items = await listQueued();
      for (const item of items) {
        if (item.id == null) continue;
        try {
          const res = await fetch("/api/order/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item.payload),
          });
          if (res.ok) {
            await deleteQueued(item.id);
            result.synced += 1;
          } else {
            const err = (await res.json().catch(() => ({}))).error || `HTTP ${res.status}`;
            await incrementRetry(item.id, err);
            result.failed += 1;
          }
        } catch (err: any) {
          await incrementRetry(item.id, err?.message || "network error");
          result.failed += 1;
        }
      }
    } finally {
      setSyncing(false);
      await refresh();
    }
    return result;
  }, [isOnline, refresh]);

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

  return { pending, syncing, drain, refresh };
}
