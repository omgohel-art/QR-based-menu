import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid, Clock, DollarSign } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, DataTable, MiniBar, formatINR } from "./AnalyticsDrillDown";

export default function TableBreakdownAnalytics() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["analytics-table-breakdown-detail"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const { data: allTables } = await supabase.from("tables").select("id, label, status");
      const { data: open } = await supabase
        .from("sessions").select("id, tableId, createdAt, lastActivityAt, finalTotal").eq("status", "open");
      const { data: settled } = await supabase
        .from("sessions").select("tableId, finalTotal, createdAt, settledAt")
        .eq("status", "settled").gte("settledAt", thirtyDaysAgo.toISOString());

      if (!allTables) return [];

      return allTables.map((t: any) => {
        const active = (open || []).filter((s: any) => s.tableId === t.id);
        const history = (settled || []).filter((s: any) => s.tableId === t.id);
        const totalRevenue = history.reduce((sum: number, s: any) => sum + parseFloat(s.finalTotal?.toString() || "0"), 0);
        const activeRevenue = active.reduce((sum: number, s: any) => sum + parseFloat(s.finalTotal?.toString() || "0"), 0);
        const avgDuration = history.length
          ? Math.round(history.reduce((sum: number, s: any) => {
              if (s.settledAt && s.createdAt) return sum + (new Date(s.settledAt).getTime() - new Date(s.createdAt).getTime()) / 60000;
              return sum;
            }, 0) / history.length)
          : 0;

        return {
          label: t.label, status: t.status,
          isActive: active.length > 0,
          activeSession: active[0] || null,
          sessionCount30d: history.length,
          revenue30d: totalRevenue,
          activeRevenue,
          avgDuration,
        };
      });
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const filtered = data?.filter((t: any) =>
    !search || t.label.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const occupied = filtered.filter((t: any) => t.isActive).length;
  const free = filtered.filter((t: any) => !t.isActive).length;

  return (
    <AnalyticsDrillDown
      title="Table Utilization"
      icon={<LayoutGrid className="w-6 h-6" />}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics", href: "/" }, { label: "Table Utilization" }]}
      search={search} onSearchChange={setSearch}
      onPrint={() => window.print()} onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Tables" value={filtered.length} icon={<LayoutGrid className="w-4 h-4" />} color="blue" />
        <StatCard label="Occupied Now" value={occupied} color="green" />
        <StatCard label="Available" value={free} color="slate" />
        <StatCard label="Utilization" value={filtered.length ? `${Math.round((occupied / filtered.length) * 100)}%` : "0%"} color="amber" />
      </div>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Table Grid</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {filtered.map((t: any) => (
            <div key={t.label} className={`relative p-3 rounded-xl border-2 text-center transition-all ${
              t.isActive
                ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-600"
                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            }`}>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{t.label}</p>
              <Badge variant={t.isActive ? "default" : "outline"} className={`text-[9px] mt-1 ${t.isActive ? "bg-emerald-500" : ""}`}>
                {t.isActive ? "Active" : "Free"}
              </Badge>
              {t.isActive && t.activeSession && (
                <p className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatINR(t.activeSession.finalTotal || 0)}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Detailed Table History (30 days)</h3>
        <DataTable
          headers={["Table", "Status", "Sessions", "Revenue", "Avg Duration", "Active Revenue"]}
          rows={filtered.map((t: any) => [
            <Badge variant="outline" key={t.label}>{t.label}</Badge>,
            <Badge variant={t.isActive ? "default" : "outline"} className={t.isActive ? "bg-emerald-500" : ""} key={t.label}>
              {t.isActive ? "Active" : "Free"}
            </Badge>,
            t.sessionCount30d,
            formatINR(t.revenue30d),
            `${t.avgDuration}m`,
            t.isActive ? formatINR(t.activeRevenue) : "\u2014",
          ])}
          empty="No table data"
        />
      </Card>
    </AnalyticsDrillDown>
  );
}
