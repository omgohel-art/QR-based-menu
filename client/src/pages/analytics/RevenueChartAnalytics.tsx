import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AnalyticsDrillDown, StatCard, exportCSV, formatINR } from "./AnalyticsDrillDown";

const PERIODS = [
  { label: "7 Days", value: 7 },
  { label: "30 Days", value: 30 },
  { label: "90 Days", value: 90 },
  { label: "365 Days", value: 365 },
];

export default function RevenueChartAnalytics() {
  const [days, setDays] = useState(30);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["analytics-revenue-chart", days],
    queryFn: async () => {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const { data: sessions } = await supabase
        .from("sessions")
        .select("subtotal, serviceCharge, taxAmount, settledAt")
        .eq("status", "settled")
        .gte("settledAt", startDate.toISOString());
      if (!sessions) return [];

      const daily: Record<string, number> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        daily[d.toISOString().slice(0, 10)] = 0;
      }
      for (const s of sessions) {
        const key = new Date(s.settledAt).toISOString().slice(0, 10);
        if (daily[key] !== undefined) {
          daily[key] += parseFloat(s.subtotal?.toString() || "0")
            + parseFloat(s.serviceCharge?.toString() || "0")
            + parseFloat(s.taxAmount?.toString() || "0");
        }
      }
      return Object.entries(daily).map(([date, revenue]) => ({ date, revenue }));
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const total = data?.reduce((s: number, d: any) => s + d.revenue, 0) || 0;
  const avg = data?.length ? total / data.length : 0;
  const max = data?.length ? Math.max(...data.map((d: any) => d.revenue)) : 1;
  const min = data?.length ? Math.min(...data.map((d: any) => d.revenue)) : 0;
  const chartHeight = 300;

  const handleExport = () => {
    if (!data) return;
    exportCSV(
      ["Date", "Revenue"],
      data.map((d: any) => [d.date, d.revenue.toFixed(2)]),
      `revenue-chart-${days}d-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  return (
    <AnalyticsDrillDown
      title="Revenue Dashboard"
      icon={<BarChart3 className="w-6 h-6" />}
      breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Analytics", href: "/" }, { label: "Revenue Chart" }]}
      onExport={handleExport} onPrint={() => window.print()} onRefresh={() => refetch()}
      loading={isLoading}
    >
      <div className="flex gap-2 mb-4 flex-wrap">
        {PERIODS.map(p => (
          <Button key={p.value} variant={days === p.value ? "default" : "outline"} size="sm"
            onClick={() => setDays(p.value)}>{p.label}</Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Revenue" value={formatINR(total)} icon={<TrendingUp className="w-4 h-4" />} color="green" />
        <StatCard label="Daily Average" value={formatINR(avg)} color="blue" />
        <StatCard label="Peak Day" value={formatINR(max)} icon={<TrendingUp className="w-4 h-4" />} color="amber" />
        <StatCard label="Lowest Day" value={formatINR(min)} icon={<TrendingDown className="w-4 h-4" />} color="slate" />
      </div>

      <Card className="p-5 bg-white dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Revenue Trend ({days} days)</h3>
        <div className="relative" style={{ height: chartHeight + 40 }}>
          {data && data.length > 0 && (() => {
            const W = 800;
            const H = chartHeight;
            const pad = { top: 20, bottom: 30, left: 50, right: 10 };
            const plotW = W - pad.left - pad.right;
            const plotH = H - pad.top - pad.bottom;
            const maxVal = max || 1;

            const step = data.length > 1 ? plotW / (data.length - 1) : plotW / 2;
            const points = data.map((d: any, i: number) => ({
              x: pad.left + i * step,
              y: pad.top + plotH - (d.revenue / maxVal) * plotH,
              ...d,
            }));

            const linePath = points.map((p: any, i: number) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
            const areaPath = `${linePath} L ${points[points.length - 1].x} ${pad.top + plotH} L ${points[0].x} ${pad.top + plotH} Z`;

            const yTicks = 4;
            const yLines = Array.from({ length: yTicks + 1 }, (_, i) => ({
              val: (maxVal / yTicks) * i,
              y: pad.top + plotH - (i / yTicks) * plotH,
            }));

            const labelStep = data.length <= 10 ? 1 : data.length <= 30 ? 3 : Math.ceil(data.length / 12);

            return (
              <svg viewBox={`0 0 ${W} ${H + 40}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="areaGradChart" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {yLines.map(({ val, y }, i) => (
                  <g key={i}>
                    <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={i === 0 ? "0" : "4,4"} />
                    <text x={pad.left - 8} y={y + 3} textAnchor="end" className="text-[8px]" fill="#94a3b8">
                      {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
                    </text>
                  </g>
                ))}
                <path d={areaPath} fill="url(#areaGradChart)" />
                <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p: any, i: number) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r="3" fill="white" stroke="#3b82f6" strokeWidth="1.5" />
                    {i % labelStep === 0 && (
                      <text x={p.x} y={pad.top + plotH + 16} textAnchor="middle" className="text-[7px]" fill="#94a3b8">
                        {p.date.slice(5)}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            );
          })()}
          {(!data || data.length === 0) && <p className="text-sm text-slate-400 text-center py-8">No revenue data</p>}
        </div>
      </Card>
    </AnalyticsDrillDown>
  );
}
