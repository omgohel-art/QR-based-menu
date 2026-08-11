import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingBag, Truck, HandPlatter, MoreHorizontal, ChevronDown, ChevronRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SourceStats { count: number; revenue: number; avgOrderValue: number; }
interface Stats {
  since: string;
  bySource: Record<string, SourceStats>;
  topItemsBySource?: Record<string, { menuItemId: number; name: string; quantity: number; revenue: number }[]>;
}

const SOURCE_META: Record<string, { label: string; Icon: typeof Truck; dot: string }> = {
  zomato:  { label: "Zomato",  Icon: Truck,           dot: "bg-red-500" },
  swiggy:  { label: "Swiggy",  Icon: Truck,           dot: "bg-orange-500" },
  manual:  { label: "Walk-in", Icon: HandPlatter,     dot: "bg-emerald-500" },
  other:   { label: "Other",   Icon: MoreHorizontal,  dot: "bg-slate-500" },
  direct:  { label: "QR orders", Icon: ShoppingBag,    dot: "bg-blue-500" },
};

function fmt(n: number): string {
  return "Rs." + Math.round(n).toLocaleString("en-IN");
}

export default function AggregatorStatsCard() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [windowHrs, setWindowHrs] = useState<number>(24);
  const [showOrders, setShowOrders] = useState(false);

  const { data } = useQuery<Stats>({
    queryKey: ["aggregator-stats", windowHrs],
    queryFn: async () => {
      const since = new Date(Date.now() - windowHrs * 60 * 60 * 1000).toISOString();
      const res = await fetch(`/api/aggregator/stats?since=${encodeURIComponent(since)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const ordersQuery = useQuery<any[]>({
    queryKey: ["aggregator-orders", windowHrs],
    queryFn: async () => {
      const since = new Date(Date.now() - windowHrs * 60 * 60 * 1000).toISOString();
      const res = await fetch(`/api/aggregator/orders?since=${encodeURIComponent(since)}&limit=50`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/aggregator/orders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to cancel");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("External order cancelled - inventory restored");
      qc.invalidateQueries({ queryKey: ["aggregator-orders"] });
      qc.invalidateQueries({ queryKey: ["aggregator-stats"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sourceOrder = ["zomato", "swiggy", "manual", "other", "direct"];
  const totals = data?.bySource || {};
  const grandCount = sourceOrder.reduce((sum, s) => sum + (totals[s]?.count || 0), 0);
  const grandRevenue = sourceOrder.reduce((sum, s) => sum + (totals[s]?.revenue || 0), 0);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Orders by source</h3>
          <span className="text-xs text-slate-400">({windowHrs}h)</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={windowHrs}
            onChange={(e) => setWindowHrs(parseInt(e.target.value, 10))}
            className="text-xs h-7 px-2 rounded-md border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700"
          >
            <option value={1}>Last 1h</option>
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={168}>Last 7d</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => setShowOrders((v) => !v)} className="text-xs h-7">
            {showOrders ? "Hide" : "View"} orders
            {showOrders ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-slate-100 dark:divide-slate-800">
        {sourceOrder.map((s) => {
          const meta = SOURCE_META[s];
          const stats = totals[s] || { count: 0, revenue: 0, avgOrderValue: 0 };
          const pct = grandCount > 0 ? Math.round((stats.count / grandCount) * 100) : 0;
          const isOpen = expanded === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setExpanded(isOpen ? null : s)}
              className={`text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isOpen ? "bg-slate-50 dark:bg-slate-800" : ""}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{meta.label}</span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{stats.count}</div>
              <div className="text-xs text-slate-500">{fmt(stats.revenue)}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{pct}% of orders</div>
            </button>
          );
        })}
      </div>

      {/* Expanded: top items per source */}
      {expanded && data?.topItemsBySource?.[expanded] && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">
            Top items - {SOURCE_META[expanded]?.label}
          </div>
          {data.topItemsBySource[expanded].length === 0 ? (
            <div className="text-xs text-slate-400 italic">No items yet</div>
          ) : (
            <div className="space-y-1">
              {data.topItemsBySource[expanded].slice(0, 5).map((it) => (
                <div key={it.menuItemId} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300 truncate flex-1">{it.name}</span>
                  <span className="text-slate-500 ml-2">{it.quantity}x</span>
                  <span className="text-slate-900 dark:text-white font-medium ml-2 w-16 text-right">{fmt(it.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Orders list */}
      {showOrders && (
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 max-h-96 overflow-y-auto">
          {ordersQuery.isLoading ? (
            <div className="text-xs text-slate-500">Loading...</div>
          ) : (ordersQuery.data || []).length === 0 ? (
            <div className="text-xs text-slate-400 italic">No external orders in this window</div>
          ) : (
            <div className="space-y-2">
              {(ordersQuery.data || []).map((o: any) => {
                const meta = SOURCE_META[o.orderSource] || SOURCE_META.other;
                const Icon = meta.Icon;
                const cancelled = o.orderStatus === "cancelled";
                return (
                  <div
                    key={o.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${cancelled ? "bg-red-50 border-red-200 line-through opacity-60" : "bg-white border-slate-200"}`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 ${meta.dot.replace("bg-", "text-")}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">#{o.orderNumber}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${meta.dot.replace("bg-", "bg-").replace("500", "100")} ${meta.dot.replace("bg-", "text-").replace("500", "700")}`}>
                          {meta.label}
                        </span>
                        {o.aggregatorOrderId && (
                          <span className="text-[10px] text-slate-500 font-mono">{o.aggregatorOrderId}</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 truncate">
                        {(o.items || []).map((it: any) => `${it.menuItemName || "Item"} x${it.quantity}`).join(", ") || "No items"}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {fmt(parseFloat(o.finalTotalAfterDiscount?.toString() || "0"))}
                        {" - "}
                        {o.paymentMethod === "aggregator" ? `Paid by ${meta.label}` : (o.paymentMethod || "cash")}
                      </div>
                    </div>
                    {!cancelled && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Cancel this external order? Inventory will be restored.")) {
                            cancelMutation.mutate(o.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Cancel order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex items-center justify-between">
        <span>Total: {grandCount} orders</span>
        <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(grandRevenue)}</span>
      </div>
    </div>
  );
}
