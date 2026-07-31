import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Clock, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, DataTable, MiniBar, exportCSV } from "./AnalyticsDrillDown";

export default function OrderAnalytics() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["analytics-orders-detail"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const { data: orders } = await supabase
        .from("orders")
        .select("id, orderStatus, paymentMethod, paymentStatus, submittedAt")
        .gte("submittedAt", thirtyDaysAgo.toISOString());
      if (!orders) return null;

      const todayOrders = orders.filter(o => new Date(o.submittedAt) >= today);
      const completed = orders.filter(o => o.orderStatus === "delivered");
      const pending = orders.filter(o => ["received", "preparing", "ready"].includes(o.orderStatus));
      const cancelled = orders.filter(o => o.orderStatus === "cancelled");

      const hourCount: Record<number, number> = {};
      orders.forEach(o => { const h = new Date(o.submittedAt).getHours(); hourCount[h] = (hourCount[h] || 0) + 1; });

      const dayCount: Record<string, number> = {};
      orders.forEach(o => { const d = new Date(o.submittedAt).toISOString().slice(0, 10); dayCount[d] = (dayCount[d] || 0) + 1; });

      const paymentMethods: Record<string, number> = {};
      orders.forEach(o => { if (o.paymentMethod) paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + 1; });

      const statusCount: Record<string, number> = {};
      orders.forEach(o => { statusCount[o.orderStatus] = (statusCount[o.orderStatus] || 0) + 1; });

      return {
        totalOrders: orders.length, todayOrders: todayOrders.length,
        completedOrders: completed.length, pendingOrders: pending.length, cancelledOrders: cancelled.length,
        peakHours: Object.entries(hourCount).map(([h, c]) => ({ hour: Number(h), count: c })).sort((a, b) => b.count - a.count),
        peakDays: Object.entries(dayCount).map(([d, c]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
        paymentMethods: Object.entries(paymentMethods).map(([m, c]) => ({ method: m, count: c })),
        statusBreakdown: Object.entries(statusCount).map(([s, c]) => ({ status: s, count: c })),
      };
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const handleExport = () => {
    if (!data) return;
    exportCSV(
      ["Status", "Count"],
      data.statusBreakdown?.map((s: any) => [s.status, s.count]) || [],
      `order-report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const statusColor = (s: string) => {
    if (s === "delivered") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    if (s === "cancelled") return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    if (s === "ready") return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
  };

  return (
    <AnalyticsDrillDown
      title="Order Analytics"
      icon={<ShoppingCart className="w-6 h-6" />}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics", href: "/" }, { label: "Orders" }]}
      search={search} onSearchChange={setSearch}
      onExport={handleExport} onPrint={() => window.print()} onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Orders" value={data?.totalOrders || 0} icon={<ShoppingCart className="w-4 h-4" />} color="blue" />
        <StatCard label="Today" value={data?.todayOrders || 0} icon={<Clock className="w-4 h-4" />} color="amber" />
        <StatCard label="Completed" value={data?.completedOrders || 0} icon={<CheckCircle className="w-4 h-4" />} color="green" />
        <StatCard label="Cancelled" value={data?.cancelledOrders || 0} icon={<XCircle className="w-4 h-4" />} color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Peak Ordering Hours</h3>
          <div className="space-y-2">
            {data?.peakHours?.slice(0, 12).map((h: any) => {
              const max = Math.max(...(data.peakHours?.map((x: any) => x.count) || [1]));
              return (
                <div key={h.hour} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-slate-500 text-xs">{String(h.hour).padStart(2, "0")}:00</span>
                  <div className="flex-1"><MiniBar value={h.count} max={max} color="bg-blue-500" /></div>
                  <span className="w-8 text-right text-xs text-slate-600 dark:text-slate-400">{h.count}</span>
                </div>
              );
            })}
            {!data?.peakHours?.length && <p className="text-sm text-slate-400 text-center py-4">No data</p>}
          </div>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Order Status Breakdown</h3>
          <div className="space-y-3">
            {data?.statusBreakdown?.map((s: any) => {
              const max = Math.max(...(data.statusBreakdown?.map((x: any) => x.count) || [1]));
              return (
                <div key={s.status} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge className={`${statusColor(s.status)} text-xs capitalize`}>{s.status}</Badge>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{s.count}</span>
                  </div>
                  <MiniBar value={s.count} max={max} color="bg-blue-500" />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Payment Methods</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data?.paymentMethods?.map((p: any) => (
            <div key={p.method} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-center">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{p.count}</p>
              <p className="text-xs text-slate-500 capitalize">{p.method}</p>
            </div>
          ))}
          {!data?.paymentMethods?.length && <p className="text-sm text-slate-400 text-center py-4 col-span-4">No payment data</p>}
        </div>
      </Card>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Daily Order Count</h3>
        <DataTable
          headers={["Date", "Orders"]}
          rows={data?.peakDays?.filter((d: any) => !search || d.date.includes(search))
            ?.map((d: any) => [d.date, d.count]) || []}
          empty="No order data"
        />
      </Card>
    </AnalyticsDrillDown>
  );
}
