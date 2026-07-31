import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, TrendingUp, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, DataTable, MiniBar, exportCSV, formatINR } from "./AnalyticsDrillDown";

export default function PopularItemsAnalytics() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["analytics-products-detail"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const { data: orderItemsList } = await supabase
        .from("orderItems")
        .select("menuItemId, quantity, priceAtOrderTime, orderId");
      const { data: ordersList } = await supabase
        .from("orders").select("id, submittedAt").gte("submittedAt", thirtyDaysAgo.toISOString());
      const { data: menuList } = await supabase.from("menuItems").select("id, name, price, categoryId");
      const { data: catList } = await supabase.from("categories").select("id, name");

      if (!orderItemsList || !ordersList) return null;

      const orderIds = new Set(ordersList.map((o: any) => o.id));
      const relevantItems = orderItemsList.filter((oi: any) => orderIds.has(oi.orderId));

      const aggregated: Record<number, { count: number; revenue: number }> = {};
      relevantItems.forEach((oi: any) => {
        const id = oi.menuItemId;
        if (!aggregated[id]) aggregated[id] = { count: 0, revenue: 0 };
        aggregated[id].count += oi.quantity;
        aggregated[id].revenue += parseFloat(oi.priceAtOrderTime?.toString() || "0") * oi.quantity;
      });

      const catMap = new Map((catList || []).map((c: any) => [c.id, c.name]));
      const menuMap = new Map((menuList || []).map((m: any) => [m.id, m]));

      const items = Object.entries(aggregated)
        .map(([id, stats]) => {
          const m = menuMap.get(Number(id));
          return {
            menuItemId: Number(id),
            name: m?.name || `Item #${id}`,
            count: stats.count,
            revenue: stats.revenue,
            avgPrice: stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0,
            category: m ? (catMap.get(m.categoryId) || "Uncategorized") : "Unknown",
          };
        })
        .sort((a, b) => b.count - a.count);

      const catPerf: Record<string, { count: number; revenue: number }> = {};
      items.forEach(i => {
        if (!catPerf[i.category]) catPerf[i.category] = { count: 0, revenue: 0 };
        catPerf[i.category].count += i.count;
        catPerf[i.category].revenue += i.revenue;
      });

      return {
        items,
        categoryPerformance: Object.entries(catPerf).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.revenue - a.revenue),
        totalItemsSold: items.reduce((s, i) => s + i.count, 0),
        totalItemRevenue: items.reduce((s, i) => s + i.revenue, 0),
      };
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const filtered = data?.items?.filter((i: any) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const handleExport = () => {
    if (!data) return;
    exportCSV(
      ["Item", "Category", "Qty Sold", "Revenue", "Avg Price"],
      filtered.map((i: any) => [i.name, i.category, i.count, i.revenue.toFixed(2), i.avgPrice]),
      `products-report-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  return (
    <AnalyticsDrillDown
      title="Product Analytics"
      icon={<Star className="w-6 h-6" />}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics", href: "/" }, { label: "Products" }]}
      search={search} onSearchChange={setSearch}
      onExport={handleExport} onPrint={() => window.print()} onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Items Sold" value={data?.totalItemsSold || 0} icon={<Package className="w-4 h-4" />} color="blue" />
        <StatCard label="Total Revenue" value={formatINR(data?.totalItemRevenue || 0)} icon={<TrendingUp className="w-4 h-4" />} color="green" />
        <StatCard label="Unique Items" value={data?.items?.length || 0} color="purple" />
        <StatCard label="Categories" value={data?.categoryPerformance?.length || 0} color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" /> Top Selling Items
          </h3>
          <div className="space-y-3">
            {filtered.slice(0, 10).map((item: any, i: number) => {
              const maxCount = filtered[0]?.count || 1;
              const pct = Math.round((item.count / maxCount) * 100);
              const medal = i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-orange-400 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500";
              return (
                <div key={item.menuItemId}>
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${medal}`}>{i + 1}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate flex-1">{item.name}</span>
                    <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item.count} sold</span>
                  </div>
                  <div className="ml-9"><MiniBar value={item.count} max={maxCount} color={i === 0 ? "bg-amber-500" : i === 1 ? "bg-slate-400" : i === 2 ? "bg-orange-400" : "bg-blue-400"} /></div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 bg-white dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Category Performance</h3>
          <div className="space-y-3">
            {data?.categoryPerformance?.map((cat: any) => {
              const max = Math.max(...(data.categoryPerformance?.map((c: any) => c.revenue) || [1]));
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{cat.name}</span>
                    <span className="font-mono text-xs">{formatINR(cat.revenue)}</span>
                  </div>
                  <MiniBar value={cat.revenue} max={max} color="bg-purple-500" />
                  <p className="text-[10px] text-slate-400">{cat.count} items sold</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">All Items</h3>
        <DataTable
          headers={["Item", "Category", "Qty Sold", "Revenue", "Avg Price"]}
          rows={filtered.map((i: any) => [
            <span key={i.menuItemId} className="font-medium">{i.name}</span>,
            <Badge variant="outline" key={i.menuItemId} className="text-xs">{i.category}</Badge>,
            i.count,
            formatINR(i.revenue),
            formatINR(i.avgPrice),
          ])}
          empty="No items found"
        />
      </Card>
    </AnalyticsDrillDown>
  );
}
