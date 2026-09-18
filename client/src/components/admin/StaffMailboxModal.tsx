import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Droplets, Receipt, Sparkles, Inbox, CheckCircle2, Clock, Trash2, Check, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export interface ServiceRequestItem {
  id: number;
  tableCode: string;
  requestType: string;
  requestLabel: string;
  status: string;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bgColor: string }> = {
  waiter: { icon: Bell, color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-100 dark:bg-amber-950/40" },
  water: { icon: Droplets, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-950/40" },
  bill: { icon: Receipt, color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-100 dark:bg-emerald-950/40" },
  clean: { icon: Sparkles, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-100 dark:bg-purple-950/40" },
};

function formatTimeAgo(dateStr: string) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  } catch {
    return dateStr;
  }
}

interface StaffMailboxModalProps {
  triggerClassName?: string;
}

export default function StaffMailboxModal({ triggerClassName }: StaffMailboxModalProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  // Fetch tables to map tableCode to label
  const { data: tablesData } = useQuery({
    queryKey: ["tables"],
    queryFn: async () => {
      const { data } = await supabase.from("tables").select("tableCode, label");
      return data || [];
    },
  });

  const getTableLabel = (tableCode: string) => {
    const found = tablesData?.find((t) => t.tableCode === tableCode || t.label === tableCode);
    return found?.label || tableCode;
  };

  // Fetch service requests
  const { data: serviceRequests = [], isLoading, isFetching, refetch } = useQuery<ServiceRequestItem[]>({
    queryKey: ["serviceRequests"],
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("serviceRequests")
        .select("*")
        .order("createdAt", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as ServiceRequestItem[];
    },
  });

  // Mark request as resolved mutation
  const resolveMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("serviceRequests")
        .update({ status: "resolved", updatedAt: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
      toast.success("Request marked as completed!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update status");
    },
  });

  // Delete request mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("serviceRequests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
      toast.success("Request dismissed");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete request");
    },
  });

  const pendingRequests = serviceRequests.filter((r) => r.status === "pending");
  const pendingCount = pendingRequests.length;
  const displayedRequests = filter === "pending" ? pendingRequests : serviceRequests;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={
            triggerClassName ||
            "relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-slate-700 dark:text-slate-200"
          }
          title="Staff Mailbox / Waiter Calls"
        >
          <div className="relative">
            <Inbox className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 animate-pulse shadow-md">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </div>
          <span className="hidden md:inline text-xs font-semibold">
            Mailbox {pendingCount > 0 && `(${pendingCount})`}
          </span>
        </button>
      </DialogTrigger>

      <DialogContent showCloseButton={false} className="max-w-md w-full p-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Staff Mailbox
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="rounded-full text-[10px] px-2 py-0.5 animate-pulse">
                    {pendingCount} Pending
                  </Badge>
                )}
              </DialogTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Incoming table calls & waiter requests
              </p>
            </div>
          </div>

          {/* Action Buttons: Refresh & Close aligned side-by-side */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Refresh requests"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-amber-500" : ""}`} />
            </button>
            <DialogClose className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X className="w-4 h-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </DialogHeader>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setFilter("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === "pending"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
            }`}
          >
            Pending Calls ({pendingCount})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === "all"
                ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
            }`}
          >
            All History ({serviceRequests.length})
          </button>
        </div>

        {/* Requests List */}
        <div className="max-h-[380px] overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading requests...
            </div>
          ) : displayedRequests.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-80" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {filter === "pending" ? "All calls resolved!" : "No service requests found"}
              </p>
              <p className="text-xs text-slate-400">
                {filter === "pending" ? "No active table requests right now." : "Requests will appear here when customers call staff."}
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {displayedRequests.map((req) => {
                const isPending = req.status === "pending";
                const config = TYPE_CONFIG[req.requestType] || TYPE_CONFIG.waiter;
                const IconComponent = config.icon;
                const tableLabel = getTableLabel(req.tableCode);

                return (
                  <motion.div
                    key={req.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isPending
                        ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 shadow-sm"
                        : "bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-75"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${config.bgColor}`}>
                          <IconComponent className={`w-5 h-5 ${config.color}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {req.requestLabel}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold uppercase tracking-wider bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                            >
                              Table {tableLabel}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formatTimeAgo(req.createdAt)}</span>
                            <span>•</span>
                            <span className={`font-semibold ${isPending ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {isPending ? "Pending Action" : "Resolved"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        {isPending ? (
                          <Button
                            size="sm"
                            onClick={() => resolveMutation.mutate(req.id)}
                            disabled={resolveMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-semibold px-2.5 rounded-lg shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5 mr-1" /> Complete
                          </Button>
                        ) : (
                          <button
                            onClick={() => deleteMutation.mutate(req.id)}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 transition-colors"
                            title="Dismiss"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
