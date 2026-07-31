import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, IndianRupee, BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, DataTable, MiniBar, exportCSV, formatINR } from "./AnalyticsDrillDown";

function formatPct(n: number) { return `${n >= 0 ? "+" : ""}${n}%`; }

export default function RevenueAnalytics() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["analytics-revenue-detail"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const { data: sessions } = await supabase
        .from("sessions")
        .select("subtotal, serviceCharge, taxAmount, discountAmount, finalTotal, settledAt, tableId")
        .eq("status", "settled")
        .gte("settledAt", thirtyDaysAgo.toISOString());
      if (!sessions) return null;

      const { data: tablesList } = await supabase.from("tables").select("id, label");
      const tableMap = new Map((tablesList || []).map((t: any) => [t.id, t.label]));

      const all = sessions.map(s => ({
        revenue: parseFloat(s.finalTotal?.toString() || "0"),
        settledAt: new Date(s.settledAt),
        table: tableMap.get(s.tableId) || "Unknown",
      }));

      const todayRev = all.filter(s => s.settledAt >= today).reduce((sum, s) => sum + s.revenue, 0);
      const yesterdayRev = all.filter(s => s.settledAt >= yesterday && s.settledAt < today).reduce((sum, s) => sum + s.revenue, 0);
      const totalRev = all.reduce((sum, s) => sum + s.revenue, 0);

      const hourlyRev: Record<number, number> = {};
      all.filter(s => s.settledAt >= today).forEach(s => { hourlyRev[s.settledAt.getHours()] = (hourlyRev[s.settledAt.getHours()] || 0) + s.revenue; });

      const dailyRev: Record<string, number> = {};
      all.forEach(s => { const key = s.settledAt.toISOString().slice(0, 10); dailyRev[key] = (dailyRev[key] || 0) + s.revenue; });

      const tableRev: Record<string, number> = {};
      all.forEach(s => { tableRev[s.table] = (tableRev[s.table] || 0) + s.revenue; });

      const amounts = all.map(s => s.revenue);

      return {
        todayRevenue: todayRev, yesterdayRevenue: yesterdayRev, totalRevenue: totalRev,
        hourlyRevenue: Object.entries(hourlyRev).map(([h, v]) => ({ hour: Number(h), revenue: v })),
        dailyRevenue: Object.entries(dailyRev).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => a.date.localeCompare(b.date)),
        tableRevenue: Object.entries(tableRev).map(([table, revenue]) => ({ table, revenue })).sort((a, b) => b.revenue - a.revenue),
        highestBill: amounts.length ? Math.max(...amounts) : 0,
        lowestBill: amounts.length ? Math.min(...amounts) : 0,
        totalBills: all.length,
        growthPercent: yesterdayRev > 0 ? Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100) : 0,
      };
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const handleExport = () => {
    if (!data) return;
    exportCSV(
      ["Date", "Revenue"],
      data.dailyRevenue?.map((d: any) => [d.date, d.revenue.toFixed(2)]) || [],
      `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const filteredTables = data?.tableRevenue?.filter((t: any) =>
    !search || t.table.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <AnalyticsDrillDown
      title="Revenue Analytics"
      icon={<IndianRupee className="w-6 h-6" />}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics", href: "/" }, { label: "Revenue" }]}
      search={search} onSearchChange={setSearch}
      onExport={handleExport} onPrint={() => window.print()} onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Today's Revenue" value={formatINR(data?.todayRevenue || 0)} icon={<IndianRupee className="w-4 h-4" />} color="green" sub={formatPct(data?.growthPercent || 0)} />
        <StatCard label="Yesterday" value={formatINR(data?.yesterdayRevenue || 0)} icon={<TrendingDown className="w-4 h-4" />} color="slate" />
        <StatCard label="Total Revenue" value={formatINR(data?.totalRevenue || 0)} icon={<BarChart3 className="w-4 h-4" />} color="blue" sub={`${data?.totalBills || 0} bills`} />
        <StatCard label="Growth" value={formatPct(data?.growthPercent || 0)} icon={<TrendingUp className="w-4 h-4" />} color={data?.growthPercent >= 0 ? "green" : "red"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Revenue by Hour (Today)</h3>
          <div className="space-y-2">
            {data?.hourlyRevenue?.map((h: any) => {
              const max = Math.max(...(data.hourlyRevenue?.map((x: any) => x.revenue) || [1]));
              return (
                <div key={h.hour} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-slate-500 text-xs">{String(h.hour).padStart(2, "0")}:00</span>
                  <div className="flex-1"><MiniBar value={h.revenue} max={max} color="bg-emerald-500" /></div>
                  <span className="w-20 text-right font-mono text-xs text-slate-700 dark:text-slate-300">{formatINR(h.revenue)}</span>
                </div>
              );
            })}
            {!data?.hourlyRevenue?.length && <p className="text-sm text-slate-400 text-center py-4">No data</p>}
          </div>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Revenue by Table</h3>
          <div className="space-y-2">
            {filteredTables.map((t: any) => {
              const max = Math.max(...filteredTables.map((x: any) => x.revenue), 1);
              return (
                <div key={t.table} className="flex items-center gap-3 text-sm">
                  <span className="w-16 text-slate-600 dark:text-slate-400 text-xs truncate">{t.table}</span>
                  <div className="flex-1"><MiniBar value={t.revenue} max={max} color="bg-blue-500" /></div>
                  <span className="w-20 text-right font-mono text-xs text-slate-700 dark:text-slate-300">{formatINR(t.revenue)}</span>
                </div>
              );
            })}
            {!filteredTables.length && <p className="text-sm text-slate-400 text-center py-4">No data</p>}
          </div>
        </Card>
      </div>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Revenue by Day</h3>
        <DataTable
          headers={["Date", "Revenue", "% of Total"]}
          rows={data?.dailyRevenue?.map((d: any) => [
            d.date,
            formatINR(d.revenue),
            data.totalRevenue > 0 ? `${Math.round((d.revenue / data.totalRevenue) * 100)}%` : "0%",
          ]) || []}
          empty="No daily revenue data"
        />
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Highest Bill" value={formatINR(data?.highestBill || 0)} icon={<TrendingUp className="w-4 h-4" />} color="amber" />
        <StatCard label="Lowest Bill" value={formatINR(data?.lowestBill || 0)} icon={<TrendingDown className="w-4 h-4" />} color="slate" />
        <StatCard label="Avg Bill" value={formatINR(data?.totalBills > 0 ? (data?.totalRevenue || 0) / data.totalBills : 0)} color="purple" />
        <StatCard label="Total Bills" value={data?.totalBills || 0} color="blue" />
      </div>
    </AnalyticsDrillDown>
  );
}
