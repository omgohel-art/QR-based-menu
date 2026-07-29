import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { X, Clock, ChefHat, Utensils, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const STATUS_STEPS = [
  { key: "received", label: "Received", icon: Clock, color: "text-slate-500" },
  { key: "preparing", label: "Preparing", icon: ChefHat, color: "text-amber-500" },
  { key: "ready", label: "Ready", icon: Utensils, color: "text-blue-500" },
  { key: "delivered", label: "Served", icon: CheckCircle, color: "text-emerald-500" },
];

const STATUS_ORDER: Record<string, number> = {
  received: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
  settled: 4,
};

interface Props {
  sessionId: number;
  tableCode: string;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "received": return "Order Received";
    case "preparing": return "Being Prepared";
    case "ready": return "Ready to Serve";
    case "delivered": return "Served";
    case "settled": return "Completed";
    default: return status;
  }
}

export default function OrderStatusBanner({ sessionId, tableCode }: Props) {
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => {
    try {
      const raw = sessionStorage.getItem(`dismissedOrders_${tableCode}`);
      return new Set<number>(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const [expanded, setExpanded] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["recentOrders", sessionId],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("id, orderNumber, orderStatus, submittedAt")
        .eq("sessionId", sessionId)
        .gte("submittedAt", oneHourAgo)
        .neq("orderStatus", "settled")
        .order("submittedAt", { ascending: false });
      return (data || []) as { id: number; orderNumber: number | null; orderStatus: string; submittedAt: string }[];
    },
  });

  const visibleOrders = (orders || []).filter(o => !dismissedIds.has(o.id));
  const dismissedOrders = (orders || []).filter(o => dismissedIds.has(o.id));
  if (visibleOrders.length === 0 && dismissedOrders.length === 0) return null;

  if (visibleOrders.length === 0) {
    return (
      <div className="mx-4 mt-3 mb-1">
        <div className="bg-white rounded-[16px] border border-slate-200/60 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{dismissedOrders.length} dismissed order{dismissedOrders.length > 1 ? "s" : ""}</span>
            <button
              onClick={() => {
                setDismissedIds(new Set());
                sessionStorage.removeItem(`dismissedOrders_${tableCode}`);
              }}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium"
            >
              Show all
            </button>
          </div>
        </div>
      </div>
    );
  }

  const latest = visibleOrders[0];
  const currentIdx = STATUS_ORDER[latest.orderStatus] ?? 0;
  const progressPct = (currentIdx / (STATUS_STEPS.length - 1)) * 100;

  return (
    <div className="mx-4 mt-3 mb-1">
      <div className="bg-white rounded-[16px] border border-emerald-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="text-sm font-semibold text-[#4A3428]">
                  Order #{String(latest.orderNumber || latest.id).padStart(3, "0")}
                </span>
                <span className="text-xs text-emerald-600 font-medium ml-auto">
                  {getStatusLabel(latest.orderStatus)}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setDismissedIds(prev => {
                  const next = new Set(prev);
                  next.add(latest.id);
                  sessionStorage.setItem(`dismissedOrders_${tableCode}`, JSON.stringify(Array.from(next)));
                  return next;
                });
              }}
              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-2">
            {STATUS_STEPS.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={step.key} className="flex flex-col items-center gap-0.5">
                  <StepIcon className={`w-3.5 h-3.5 ${isActive ? step.color : "text-slate-300"}`} />
                  <span className={`text-[8px] font-medium ${isActive ? "text-[#4A3428]" : "text-slate-300"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {visibleOrders.length > 1 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-slate-500 hover:text-slate-700 border-t border-slate-100 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {visibleOrders.length - 1} more order{visibleOrders.length - 1 > 1 ? "s" : ""}
            </button>
            {expanded && (
              <div className="px-4 pb-3 space-y-2 border-t border-slate-100 pt-2">
                {visibleOrders.slice(1).map(order => {
                  const idx = STATUS_ORDER[order.orderStatus] ?? 0;
                  return (
                    <div key={order.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#4A3428]">
                        #{String(order.orderNumber || order.id).padStart(3, "0")}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(idx / (STATUS_STEPS.length - 1)) * 100}%` }} />
                        </div>
                        <span className="text-emerald-600 font-medium">{getStatusLabel(order.orderStatus)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
