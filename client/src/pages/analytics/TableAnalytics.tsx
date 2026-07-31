import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, DataTable, MiniBar, formatINR } from "./AnalyticsDrillDown";

export default function TableAnalytics() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["analytics-tables-detail"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const { data: allTables } = await supabase.from("tables").select("id, label, status");
      const { data: settled } = await supabase
        .from("sessions")
        .select("id, tableId, finalTotal, createdAt, settledAt")
        .eq("status", "settled")
        .gte("settledAt", thirtyDaysAgo.toISOString());
      const { data: open } = await supabase
        .from("sessions")
        .select("id, tableId, createdAt, lastActivityAt")
        .eq("status", "open");

      if (!allTables) return null;

      const occupied = open?.length || 0;
      const free = allTables.length - occupied;

      const tableStats: Record<string, { sessions: number; revenue: number; totalMins: number }> = {};
      allTables.forEach((t: any) => { tableStats[t.label] = { sessions: 0, revenue: 0, totalMins: 0 }; });

      (settled || []).forEach((s: any) => {
        const label = allTables.find((t: any) => t.id === s.tableId)?.label || "Unknown";
        if (!tableStats[label]) tableStats[label] = { sessions: 0, revenue: 0, totalMins: 0 };
        tableStats[label].sessions++;
        tableStats[label].revenue += parseFloat(s.finalTotal?.toString() || "0");
        if (s.settledAt && s.createdAt) {
          tableStats[label].totalMins += Math.round((new Date(s.settledAt).getTime() - new Date(s.createdAt).getTime()) / 60000);
        }
      });

      const tableData = Object.entries(tableStats).map(([label, stats]) => ({
        label, ...stats,
        avgDuration: stats.sessions > 0 ? Math.round(stats.totalMins / stats.sessions) : 0,
        avgRevenue: stats.sessions > 0 ? Math.round(stats.revenue / stats.sessions) : 0,
      })).sort((a, b) => b.revenue - a.revenue);

      const mostOccupied = tableData.length ? tableData.reduce((a, b) => a.sessions > b.sessions ? a : b) : null;
      const leastOccupied = tableData.filter(t => t.sessions > 0).length
        ? tableData.filter(t => t.sessions > 0).reduce((a, b) => a.sessions < b.sessions ? a : b) : null;

      return {
        totalTables: allTables.length, occupied, free, tableData,
        mostOccupied: mostOccupied?.label, leastOccupied: leastOccupied?.label,
        avgOccupancyTime: tableData.length ? Math.round(tableData.reduce((s, t) => s + t.avgDuration, 0) / tableData.length) : 0,
      };
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const filtered = data?.tableData?.filter((t: any) =>
    !search || t.label.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <AnalyticsDrillDown
      title="Table Analytics"
      icon={<Users className="w-6 h-6" />}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics", href: "/" }, { label: "Tables" }]}
      search={search} onSearchChange={setSearch}
      onPrint={() => window.print()} onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Tables" value={data?.totalTables || 0} icon={<Users className="w-4 h-4" />} color="blue" />
        <StatCard label="Occupied" value={data?.occupied || 0} color="green" sub={`${data?.free || 0} free`} />
        <StatCard label="Most Used" value={data?.mostOccupied || "\u2014"} icon={<TrendingUp className="w-4 h-4" />} color="amber" />
        <StatCard label="Avg Duration" value={`${data?.avgOccupancyTime || 0}m`} icon={<Clock className="w-4 h-4" />} color="purple" />
      </div>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Table Performance (30 days)</h3>
        <DataTable
          headers={["Table", "Sessions", "Revenue", "Avg Revenue", "Avg Duration"]}
          rows={filtered.map((t: any) => [
            <Badge variant="outline" key={t.label}>{t.label}</Badge>,
            t.sessions,
            formatINR(t.revenue),
            formatINR(t.avgRevenue),
            `${t.avgDuration}m`,
          ])}
          empty="No table data"
        />
      </Card>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Revenue by Table</h3>
        <div className="space-y-2">
          {filtered.map((t: any) => {
            const max = Math.max(...filtered.map((x: any) => x.revenue), 1);
            return (
              <div key={t.label} className="flex items-center gap-3 text-sm">
                <span className="w-16 text-slate-600 dark:text-slate-400 text-xs truncate">{t.label}</span>
                <div className="flex-1"><MiniBar value={t.revenue} max={max} color="bg-blue-500" /></div>
                <span className="w-20 text-right font-mono text-xs">{formatINR(t.revenue)}</span>
              </div>
            );
          })}
          {!filtered.length && <p className="text-sm text-slate-400 text-center py-4">No data</p>}
        </div>
      </Card>
    </AnalyticsDrillDown>
  );
}
