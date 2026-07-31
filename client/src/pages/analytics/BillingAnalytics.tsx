import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Receipt, IndianRupee, Percent, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, exportCSV, formatINR } from "./AnalyticsDrillDown";

export default function BillingAnalytics() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["analytics-billing-detail"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const { data: oh } = await supabase
        .from("orderHistories")
        .select("subtotal, taxAmount, serviceCharge, discountAmount, finalTotal, settledAt, sessionId");
      if (!oh) return null;

      const filtered = oh.filter((b: any) => new Date(b.settledAt) >= thirtyDaysAgo);
      const todayBills = filtered.filter((b: any) => new Date(b.settledAt) >= today);
      const amounts = filtered.map((b: any) => parseFloat(b.finalTotal?.toString() || "0"));
      const discounts = filtered.map((b: any) => parseFloat(b.discountAmount?.toString() || "0"));
      const taxes = filtered.map((b: any) => parseFloat(b.taxAmount?.toString() || "0"));

      const sessionIds = filtered.map((b: any) => b.sessionId).filter(Boolean);
      const paymentMethods: Record<string, number> = {};
      if (sessionIds.length > 0) {
        const { data: relatedOrders } = await supabase
          .from("orders").select("paymentMethod").in("sessionId", sessionIds);
        (relatedOrders || []).forEach((o: any) => {
          if (o.paymentMethod) paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + 1;
        });
      }

      return {
        totalBills: filtered.length, todayBills: todayBills.length,
        totalRevenue: amounts.reduce((s, v) => s + v, 0),
        avgBillAmount: amounts.length ? amounts.reduce((s, v) => s + v, 0) / amounts.length : 0,
        highestBill: amounts.length ? Math.max(...amounts) : 0,
        lowestBill: amounts.length ? Math.min(...amounts) : 0,
        totalDiscounts: discounts.reduce((s, v) => s + v, 0),
        totalTaxes: taxes.reduce((s, v) => s + v, 0),
        paymentMethods: Object.entries(paymentMethods).map(([m, c]) => ({ method: m, count: c })),
      };
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const handleExport = () => {
    if (!data) return;
    exportCSV(
      ["Metric", "Value"],
      [
        ["Total Bills", data.totalBills],
        ["Today's Bills", data.todayBills],
        ["Total Revenue", data.totalRevenue?.toFixed(2)],
        ["Avg Bill", data.avgBillAmount?.toFixed(2)],
        ["Highest Bill", data.highestBill?.toFixed(2)],
        ["Lowest Bill", data.lowestBill?.toFixed(2)],
        ["Total Discounts", data.totalDiscounts?.toFixed(2)],
        ["Total Taxes", data.totalTaxes?.toFixed(2)],
      ],
      `billing-report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  return (
    <AnalyticsDrillDown
      title="Billing Analytics"
      icon={<Receipt className="w-6 h-6" />}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics", href: "/" }, { label: "Billing" }]}
      search={search} onSearchChange={setSearch}
      onExport={handleExport} onPrint={() => window.print()} onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Bills Today" value={data?.todayBills || 0} icon={<Receipt className="w-4 h-4" />} color="blue" />
        <StatCard label="Total Bills" value={data?.totalBills || 0} icon={<FileText className="w-4 h-4" />} color="slate" />
        <StatCard label="Avg Bill" value={formatINR(data?.avgBillAmount || 0)} icon={<IndianRupee className="w-4 h-4" />} color="green" />
        <StatCard label="Discounts Given" value={formatINR(data?.totalDiscounts || 0)} icon={<Percent className="w-4 h-4" />} color="red" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Highest Bill" value={formatINR(data?.highestBill || 0)} color="amber" />
        <StatCard label="Lowest Bill" value={formatINR(data?.lowestBill || 0)} color="slate" />
        <StatCard label="Total Revenue" value={formatINR(data?.totalRevenue || 0)} color="green" />
        <StatCard label="Taxes Collected" value={formatINR(data?.totalTaxes || 0)} color="purple" />
      </div>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Payment Method Breakdown</h3>
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
    </AnalyticsDrillDown>
  );
}
