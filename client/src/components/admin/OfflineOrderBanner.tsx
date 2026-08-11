import { useOfflineOrderQueue } from "@/hooks/useOfflineOrderQueue";
import { CloudOff, RefreshCw, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";

export default function OfflineOrderBanner() {
  const { isOnline } = useNetworkStatus();
  const { pending, syncing, drain } = useOfflineOrderQueue();

  if (pending === 0) return null;

  return (
    <div
      className={`px-4 py-2 flex items-center justify-between text-sm border-b ${
        isOnline
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-orange-100 border-orange-300 text-orange-900"
      }`}
    >
      <div className="flex items-center gap-2">
        <CloudOff className="w-4 h-4" />
        <span>
          <strong>{pending}</strong> order{pending === 1 ? "" : "s"} waiting to sync.
          {!isOnline && " You're offline — they'll send automatically when back online."}
      </span>
    </div>
      {isOnline && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => drain()}
          disabled={syncing}
          className="text-xs h-7 border-amber-300 hover:bg-amber-100"
        >
          {syncing ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Syncing...
           </>
          ) : (
            <>
              <CheckCheck className="w-3 h-3 mr-1" />
              Sync now
           </>
          )}
      </Button>
      )}
  </div>
  );
}
