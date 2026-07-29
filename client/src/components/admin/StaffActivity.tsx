import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Users, Timer, Globe, RefreshCw, Palmtree, Check, X } from "lucide-react";
import { toast } from "sonner";
import { ActivityCardSkeleton } from "@/components/Skeletons";

interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string;
  lastSignIn: string | null;
  createdAt: string;
  department: string | null;
  shift: string | null;
  attendanceClockIn: string | null;
  attendanceClockOut: string | null;
  attendanceDate: string | null;
  lastLoginAt: string | null;
}

interface StaffActivityProps {
  onNavigate?: (page: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function computeWorkingHours(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn) return "--";
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  const diffMs = end - start;
  if (diffMs < 0) return "--";
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function StaffActivity({ onNavigate }: StaffActivityProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStaff = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
      await new Promise((r) => setTimeout(r, 2000));
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/auth/staff", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff || []);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    const interval = setInterval(() => fetchStaff(), 30000);
    return () => clearInterval(interval);
  }, [fetchStaff]);

  const todayStr = new Date().toISOString().split("T")[0];

  const { data: leaveRequests = [], refetch: refetchLeaves } = useQuery({
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
    refetchInterval: 15000,
  });

  const reviewLeaveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "rejected" }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(`/api/admin/leave-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast.success(`Leave request ${vars.status}`);
      queryClient.invalidateQueries({ queryKey: ["adminLeaveRequests"] });
    },
    onError: () => toast.error("Failed to update leave request"),
  });

  const pendingLeaves = leaveRequests.filter((lr: any) => lr.status === "pending");
  const processedLeaves = leaveRequests.filter((lr: any) => lr.status !== "pending");

  const getStatus = (s: StaffMember) => {
    const clockedInToday = s.attendanceDate === todayStr && !!s.attendanceClockIn;
    const currentlyClockedIn = clockedInToday && !s.attendanceClockOut;
    if (currentlyClockedIn) return "online";
    if (clockedInToday) return "away";
    return "offline";
  };

  const statusColors: Record<string, string> = {
    online: "bg-green-500",
    away: "bg-orange-500",
    offline: "bg-slate-400",
  };

  const statusLabels: Record<string, string> = {
    online: "Online",
    away: "Clocked Out",
    offline: "Offline",
  };

  const sortedStaff = [...staff].sort((a, b) => {
    const order: Record<string, number> = { online: 0, away: 1, offline: 2 };
    return order[getStatus(a)] - order[getStatus(b)];
  });

  const onlineCount = staff.filter((s) => getStatus(s) === "online").length;
  const totalCount = staff.length;

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Staff Activity</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Real-time overview of all staff members</p>
        </div>
        <button
          onClick={() => fetchStaff(true)}
          disabled={refreshing}
          className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading || refreshing ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="space-y-1.5">
                    <div className="h-6 w-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <ActivityCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : sortedStaff.length === 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{onlineCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Online Now</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Staff</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCount - onlineCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Offline</p>
                </div>
              </div>
            </Card>
          </div>
          <Card className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">No staff members</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Add staff through Staff Management</p>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{onlineCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Online Now</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Staff</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalCount - onlineCount}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Offline</p>
                </div>
              </div>
            </Card>
          </div>
          <div className="space-y-3">
          {sortedStaff.map((s) => {
            const status = getStatus(s);
            const initials = (s.name || s.email).charAt(0).toUpperCase();
            return (
              <Card key={s.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg font-bold text-slate-600 dark:text-slate-300">
                      {initials}
                    </div>
                    <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${statusColors[status]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.name || s.email}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        s.role === "admin"
                          ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                          : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                      }`}>
                        {s.role === "admin" ? "Admin" : s.role.charAt(0).toUpperCase() + s.role.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.email}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-xs">
                    <div className="text-center">
                      <p className="text-slate-400 dark:text-slate-500 mb-0.5">Clock In</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">{formatTime(s.attendanceClockIn)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400 dark:text-slate-500 mb-0.5">Clock Out</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">{formatTime(s.attendanceClockOut)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400 dark:text-slate-500 mb-0.5">Hours</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">{computeWorkingHours(s.attendanceClockIn, s.attendanceClockOut)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                    <span className={`text-xs font-medium ${
                      status === "online" ? "text-green-600 dark:text-green-400" :
                      status === "away" ? "text-orange-600 dark:text-orange-400" :
                      "text-slate-500 dark:text-slate-400"
                    }`}>
                      {statusLabels[status]}
                    </span>
                  </div>
                </div>
                <div className="sm:hidden mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-around text-xs">
                  <div className="text-center">
                    <p className="text-slate-400 dark:text-slate-500">In: {formatTime(s.attendanceClockIn)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 dark:text-slate-500">Out: {formatTime(s.attendanceClockOut)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 dark:text-slate-500">Hours: {computeWorkingHours(s.attendanceClockIn, s.attendanceClockOut)}</p>
                  </div>
                </div>
              </Card>
            );
          })}
          </div>

          {leaveRequests.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Palmtree className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Leave Requests</h2>
                  {pendingLeaves.length > 0 && (
                    <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5">
                      {pendingLeaves.length}
                    </span>
                  )}
                </div>
              </div>

              {pendingLeaves.length > 0 && (
                <div className="space-y-2 mb-4">
                  {pendingLeaves.map((lr: any) => (
                    <Card key={lr.id} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            lr.leave_type === "holiday"
                              ? "bg-emerald-100 dark:bg-emerald-950"
                              : "bg-amber-100 dark:bg-amber-950"
                          }`}>
                            <Palmtree className={`w-5 h-5 ${
                              lr.leave_type === "holiday"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{lr.staffName}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {lr.leave_type === "holiday" ? "Holiday" : "Half Day"} — {lr.date}
                            </p>
                            {lr.reason && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{lr.reason}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => reviewLeaveMutation.mutate({ id: lr.id, status: "approved" })}
                            disabled={reviewLeaveMutation.isPending}
                            className="bg-green-600 hover:bg-green-700 text-white gap-1 h-8 text-xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reviewLeaveMutation.mutate({ id: lr.id, status: "rejected" })}
                            disabled={reviewLeaveMutation.isPending}
                            className="text-red-600 border-red-200 hover:bg-red-50 gap-1 h-8 text-xs"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {processedLeaves.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-2">Processed</p>
                  {processedLeaves.map((lr: any) => (
                    <Card key={lr.id} className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm opacity-70">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            lr.leave_type === "holiday"
                              ? "bg-emerald-100 dark:bg-emerald-950"
                              : "bg-amber-100 dark:bg-amber-950"
                          }`}>
                            <Palmtree className={`w-4 h-4 ${
                              lr.leave_type === "holiday"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{lr.staffName}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                              {lr.leave_type === "holiday" ? "Holiday" : "Half Day"} — {lr.date}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          lr.status === "approved"
                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        }`}>
                          {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
