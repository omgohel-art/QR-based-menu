import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Palmtree, Check, X, Mail } from "lucide-react";
import { toast } from "sonner";

interface LeaveRequestAdminProps {
  onNavigate?: (page: string) => void;
}

export default function LeaveRequestAdmin({ onNavigate }: LeaveRequestAdminProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("all");

  const { data: leaveRequests = [], isLoading } = useQuery({
    queryKey: ["adminLeaveRequests"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const res = await fetch("/api/admin/leave-requests", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "rejected" }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(`/api/admin/leave-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast.success(`Leave request ${vars.status}`);
      queryClient.invalidateQueries({ queryKey: ["adminLeaveRequests"] });
    },
    onError: () => toast.error("Failed to update leave request"),
  });

  const filtered = filter === "all" ? leaveRequests : leaveRequests.filter((lr: any) => lr.status === filter);
  const pendingCount = leaveRequests.filter((lr: any) => lr.status === "pending").length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => onNavigate?.("back")}
          className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            Staff Leave Requests
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Review and manage holiday / half-day applications</p>
        </div>
        {pendingCount > 0 && (
          <span className="min-w-[24px] h-6 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold px-2">
            {pendingCount}
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "pending", "approved", "rejected"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === tab
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <Palmtree className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">
            {filter === "pending" ? "No pending requests" : `No ${filter} requests`}
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Staff leave requests will appear here
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((lr: any) => (
            <Card key={lr.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    lr.leave_type === "holiday"
                      ? "bg-emerald-100 dark:bg-emerald-950"
                      : "bg-amber-100 dark:bg-amber-950"
                  }`}>
                    <Palmtree className={`w-6 h-6 ${
                      lr.leave_type === "holiday"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{lr.staffName}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        lr.status === "pending"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                          : lr.status === "approved"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      }`}>
                        {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lr.leave_type === "holiday" ? "Holiday (Full Day)" : "Half Day"} — {lr.date}
                    </p>
                    {lr.reason && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">"{lr.reason}"</p>
                    )}
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Applied {new Date(lr.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                {lr.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => reviewMutation.mutate({ id: lr.id, status: "approved" })}
                      disabled={reviewMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white gap-1 h-9"
                    >
                      <Check className="w-4 h-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reviewMutation.mutate({ id: lr.id, status: "rejected" })}
                      disabled={reviewMutation.isPending}
                      className="text-red-600 border-red-200 hover:bg-red-50 gap-1 h-9"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
