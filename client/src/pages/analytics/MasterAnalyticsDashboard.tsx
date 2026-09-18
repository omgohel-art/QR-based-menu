import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Clock, CheckCircle, XCircle, TrendingUp, MapPin, DollarSign, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, DataTable, MiniBar, exportCSV, formatINR } from "./AnalyticsDrillDown";

type AnalyticsSource = "direct" | "zomato" | "swiggy" | "walkin" | "other";

interface MasterAnalyticsData {
  totalOrders: number;
  todayOrders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  peakHours: Array<{ hour: number; count: number }>;
  peakDays: Array<{ date: string; count: number }>;
  paymentMethods: Array<{ method: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  totalRevenue: number;
  onlineRevenue: number;
  cashRevenue: number;
}

export default function MasterAnalyticsDashboard() {
  const [selectedSource, setSelectedSource] = useState<AnalyticsSource | null>(null);
  const queryClient = useQueryClient();

  const sources: AnalyticsSource[] = ["direct", "zomato", "swiggy", "walkin", "other"];

  const handleSourceChange = (source: AnalyticsSource) => {
    setSelectedSource(source);
    queryClient.invalidateQueries({ queryKey: ["master-analytics"] });
  };

  const hasSource = selectedSource ? selectedSource : "direct";

  const { data, isLoading, refetch } = useQuery<MasterAnalyticsData>({
    queryKey: ["master-analytics", hasSource],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const { data: allOrders } = await supabase
        .from("orders")
        .select("id, orderStatus, paymentMethod, paymentStatus, submittedAt, finalTotal, orderSource")
        .gte("submittedAt", thirtyDaysAgo.toISOString());

      if (!allOrders) return null;

      const orders = selectedSource
        ? allOrders.filter((o: any) => o.orderSource === selectedSource)
        : allOrders.filter((o: any) => sources.includes(o.orderSource || "direct"));

      const todayOrders = orders.filter(o => new Date(o.submittedAt) >= today);
      const completed = orders.filter(o => o.orderStatus === "delivered");
      const pending = orders.filter(o => ["received", "preparing", "ready"].includes(o.orderStatus));
      const cancelled = orders.filter(o => o.orderStatus === "cancelled");

      const hourCount: Record<number, number> = {};
      orders.forEach((o: any) => { const h = new Date(o.submittedAt).getHours(); hourCount[h] = (hourCount[h] || 0) + 1; });

      const dayCount: Record<string, number> = {};
      orders.forEach((o: any) => { const d = new Date(o.submittedAt).toISOString().slice(0, 10); dayCount[d] = (dayCount[d] || 0) + 1; });

      const paymentMethods: Record<string, number> = {};
      orders.forEach((o: any) => { if (o.paymentMethod) paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + 1; });

      const statusCount: Record<string, number> = {};
      orders.forEach((o: any) => { statusCount[o.orderStatus] = (statusCount[o.orderStatus] || 0) + 1; });

      const totalRevenue = orders.reduce((sum: number, o: any) => sum + (parseFloat(o.finalTotal?.toString() || "0") || 0), 0);

      // Calculate online vs cash revenue
      let onlineRevenue = 0;
      let cashRevenue = 0;
      orders.forEach((o: any) => {
        const amount = parseFloat(o.finalTotal?.toString() || "0") || 0;
        if (o.paymentMethod === "online" || o.paymentMethod === "razorpay" || o.paymentMethod === "upi") {
          onlineRevenue += amount;
        } else if (o.paymentMethod === "counter" || o.paymentMethod === "cash") {
          cashRevenue += amount;
        }
      });

      return {
        totalOrders: orders.length,
        todayOrders: todayOrders.length,
        completedOrders: completed.length,
        pendingOrders: pending.length,
        cancelledOrders: cancelled.length,
        peakHours: Object.entries(hourCount).map(([h, c]: [string, number]) => ({ hour: Number(h), count: c })).sort((a, b) => b.count - a.count),
        peakDays: Object.entries(dayCount).map(([d, c]: [string, number]) => ({ date: d, count: c })).sort((a, b) => a.date.localeCompare(b.date)),
        paymentMethods: Object.entries(paymentMethods).map(([m, c]: [string, number]) => ({ method: m, count: c })),
        statusBreakdown: Object.entries(statusCount).map(([s, c]: [string, number]) => ({ status: s, count: c })),
        totalRevenue,
        onlineRevenue,
        cashRevenue,
      };
    },
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  if (!data) {
    return (
      <AnalyticsDrillDown
        title="Master Analytics"
        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-1.99-1.24H5a2 2 0 0 0-1 1.73l7 4a2 2 0 0 0 1.99-1.24l7 4a2 2 0 0 0 1.99 1.24H21z"/></svg>}
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics" }]}
        onExport={() => {}}
        onPrint={() => window.print()}
        onRefresh={() => refetch()}
        loading={isLoading}
      >
        <div className="min-h-[400px] flex items-center justify-center text-slate-500">
          <div className="text-center">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Loading analytics data...</p>
          </div>
        </div>
      </AnalyticsDrillDown>
    );
  }

  const max = Math.max(...data.peakHours.map((x: any) => x.count) || [1]);

  return (
    <AnalyticsDrillDown
      title="Master Analytics"
      icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-1.99-1.24H5a2 2 0 0 0-1 1.73l7 4a2 2 0 0 0 1.99-1.24l7 4a2 2 0 0 0 1.99 1.24H21z"/></svg>}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics" }]}
      onExport={() => exportCSV([["Source", "Orders"], data.statusBreakdown?.map((s: any) => [s.status, s.count]) || []], `master-analytics-${new Date().toISOString().slice(0, 10)}.csv`)}
      onPrint={() => window.print()}
      onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setSelectedSource(null)}
          className={selectedSource === null ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700 border border-primary-400 hover:text-primary-900"}
        >
          <Search className="w-4 h-4 mr-2" /> All Sources
        </button>
        {sources.map((source) => {
          const sourceLabels: Record<AnalyticsSource, { label: string; icon: typeof ShoppingCart; color: string }> = {
            direct: { label: "Direct QR", icon: ShoppingCart, color: "blue" },
            zomato: { label: "Zomato", icon: ShoppingCart, color: "red" },
            swiggy: { label: "Swiggy", icon: ShoppingCart, color: "orange" },
            walkin: { label: "Walk-In", icon: MapPin, color: "emerald" },
            other: { label: "Other", icon: ShoppingCart, color: "slate" },
          };
          const { label, icon: Icon, color } = sourceLabels[source];
          return (
            <button
              key={source}
              onClick={() => handleSourceChange(source)}
              className={selectedSource === source ? "bg-primary-600 text-white" : "bg-primary-100 text-primary-700 border border-primary-400 hover:text-primary-900"}
            >
              <Icon className={`w-4 h-4 text-${color}-600` } /> {label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Orders" value={data.totalOrders || 0} icon={<ShoppingCart className="w-4 h-4" />} color="blue" />
        <StatCard label="Today" value={data.todayOrders || 0} icon={<Clock className="w-4 h-4" />} color="amber" />
        <StatCard label="Completed" value={data.completedOrders || 0} icon={<CheckCircle className="w-4 h-4" />} color="green" />
        <StatCard label="Cancelled" value={data.cancelledOrders || 0} icon={<XCircle className="w-4 h-4" />} color="red" />
        <StatCard label="Online Revenue" value={`₹${data.onlineRevenue?.toLocaleString("en-IN") || "0"}`} icon={<DollarSign className="w-4 h-4" />} color="emerald" />
        <StatCard label="Cash Revenue" value={`₹${data.cashRevenue?.toLocaleString("en-IN") || "0"}`} icon={<DollarSign className="w-4 h-4" />} color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Peak Ordering Hours</h3>
          <div className="space-y-2">
            {data.peakHours.slice(0, 12).map((h: any) => {
              return (
                <div key={h.hour} className="flex items-center gap-3 text-sm">
                  <span className="w-10 text-slate-500 text-xs">{String(h.hour).padStart(2, "0")}:00</span>
                  <div className="flex-1"><MiniBar value={h.count} max={max} color="bg-blue-500" /></div>
                  <span className="w-8 text-right text-xs text-slate-600 dark:text-slate-400">{h.count}</span>
                </div>
              );
            })}
            {!data.peakHours?.length && <p className="text-sm text-slate-400 text-center py-4">No data</p>}
          </div>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Order Status Breakdown</h3>
          <div className="space-y-3">
            {data.statusBreakdown.map((s: any) => {
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
          {data.paymentMethods.map((p: any) => (
            <div key={p.method} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-center">
              <p className="text-lg font-bold text-slate-900 dark:text-white">{p.count}</p>
              <p className="text-xs text-slate-500 capitalize">{p.method}</p>
            </div>
          ))}
          {!data.paymentMethods?.length && <p className="text-sm text-slate-400 text-center py-4 col-span-4">No payment data</p>}
        </div>
      </Card>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Daily Order Count</h3>
        <DataTable
          headers={["Date", "Orders"]}
          rows={data.peakDays?.filter((d: any) => !data.totalOrders || true)?.map((d: any) => [d.date, d.count]) || []}
          empty="No order data"
        />
      </Card>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Total Revenue</h3>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">₹${data.totalRevenue?.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) || "0"}</p>
          <p className="text-sm text-slate-500">Last 30 days</p>
        </div>
      </Card>
    </AnalyticsDrillDown>
  );
}

function statusColor(s: string) {
  if (s === "delivered") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
  if (s === "cancelled") return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  if (s === "ready") return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
}