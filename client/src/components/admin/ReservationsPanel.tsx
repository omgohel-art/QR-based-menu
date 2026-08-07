import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, Check, X, Trash2, Loader2, Users, Phone, Clock, BookOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Reservation = {
  id: number;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  pax: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-300",
  confirmed: "bg-green-100 text-green-700 border-green-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
  completed: "bg-blue-100 text-blue-700 border-blue-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReservationsPanel() {
  const queryClient = useQueryClient();
  const [filterDate, setFilterDate] = useState(todayStr());
  const [filterStatus, setFilterStatus] = useState<string>("");

  const { data: reservations, isLoading } = useQuery<Reservation[]>({
    queryKey: ["reservations", filterDate, filterStatus],
    queryFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const url = new URL("/api/admin/reservations", window.location.origin);
      if (filterDate) url.searchParams.set("date", filterDate);
      if (filterStatus) url.searchParams.set("status", filterStatus);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch reservations");
      return res.json();
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const token = (await supabase.auth.getSession()).access_token?.access_token;
      const res = await fetch(`/api/admin/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Reservation updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteReservation = useMutation({
    mutationFn: async (id: number) => {
      const token = (await supabase.auth.getSession()).access_token?.access_token;
      const res = await fetch(`/api/admin/reservations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Reservation deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Book className="w-5 h-5 md:w-6 md:h-6" />
          Table Reservations
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
          <option value="completed">Completed</option>
        </select>

        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["reservations"] })}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg animate-pulse">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      ) : !reservations || reservations.length === 0 ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="font-medium">No reservations found</p>
          <p className="text-sm mt-1">Reservations for {filterDate} will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300" />
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Customer
                  </div>
                </th>
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300 hidden md:table-cell">
                  <div className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" /> Phone
                  </div>
                </th>
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Date
                  </div>
                </th>
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Time
                  </div>
                </th>
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300">Guests</th>
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300">Status</th>
                <th className="py-3 px-3 font-medium text-slate-600 dark:text-slate-300 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                      {r.customerName.charAt(0).toUpperCase()}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <p className="font-medium text-slate-900 dark:text-white">{r.customerName}</p>
                    {r.notes && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-32">{r.notes}</p>}
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300 hidden md:table-cell">
                    <a href={`tel:${r.customerPhone}`} className="hover:text-blue-500 transition-colors">
                      {r.customerPhone}
                    </a>
                  </td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.date}</td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{r.time}</td>
                  <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{r.pax}</td>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[r.status] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === "pending" && (
                        <>
                          <button
                            onClick={() => updateStatus.mutate({ id: r.id, status: "confirmed" })}
                            disabled={updateStatus.isPending}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                            title="Confirm"
                          >
                            {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => updateStatus.mutate({ id: r.id, status: "cancelled" })}
                            disabled={updateStatus.isPending}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {r.status === "confirmed" && (
                        <button
                          onClick={() => updateStatus.mutate({ id: r.id, status: "completed" })}
                          disabled={updateStatus.isPending}
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          title="Mark completed"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete reservation for ${r.customerName}?`)) {
                            deleteReservation.mutate(r.id);
                          }
                        }}
                        disabled={deleteReservation.isPending}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}