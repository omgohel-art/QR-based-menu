import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Star, Clock, Users, Utensils, ArrowRight } from "lucide-react";

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

const cardHover = "cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 hover:ring-blue-200 dark:hover:ring-blue-800";

export default function AnalyticsDashboard() {
  const [, navigate] = useLocation();

  const { data: dailyRevenue } = useQuery({
    queryKey: ["analytics", "dailyRevenue"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: sessions } = await supabase
        .from("sessions")
        .select("subtotal, serviceCharge, taxAmount, settledAt")
        .eq("status", "settled")
        .gte("settledAt", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (!sessions) return [];

      const daily: Record<string, number> = {};
      for (const s of sessions) {
        const dateKey = new Date(s.settledAt).toISOString().slice(0, 10);
        const subtotal = parseFloat(s.subtotal?.toString() || "0");
        const sc = parseFloat(s.serviceCharge?.toString() || "0");
        const tax = parseFloat(s.taxAmount?.toString() || "0");
        daily[dateKey] = (daily[dateKey] || 0) + subtotal + sc + tax;
      }

      const result: { date: string; revenue: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        result.push({ date: key, revenue: daily[key] || 0 });
      }
      return result;
    },
  });

  const { data: popularItems } = useQuery({
    queryKey: ["analytics", "popularItems"],
    queryFn: async () => {
      const res = await fetch("/api/admin/popular-items");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: activeTables } = useQuery({
    queryKey: ["analytics", "activeTables"],
    queryFn: async () => {
      const res = await fetch("/api/admin/active-tables");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: todayStats } = useQuery({
    queryKey: ["analytics", "todayStats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: sessions } = await supabase
        .from("sessions")
        .select("subtotal, serviceCharge, taxAmount, finalTotal")
        .eq("status", "settled")
        .gte("settledAt", today.toISOString());

      const { data: openSessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("status", "open");

      const { data: orders } = await supabase
        .from("orders")
        .select("id")
        .gte("submittedAt", today.toISOString());

      return {
        revenue: sessions ? sessions.reduce((s, sess) => s + parseFloat(sess.finalTotal?.toString() || "0"), 0) : 0,
        orders: orders?.length || 0,
        activeTables: openSessions?.length || 0,
        settledCount: sessions?.length || 0,
      };
    },
  });

  const maxRevenue = dailyRevenue ? Math.max(...dailyRevenue.map(d => d.revenue), 1) : 1;
  const chartHeight = 300;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`p-4 bg-white dark:bg-slate-900 ${cardHover}`} onClick={() => navigate("/analytics/revenue")}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Today's Revenue</p>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatINR(todayStats?.revenue || 0)}</p>
              <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-500 font-medium">
                View details <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent>Click to view revenue analytics</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`p-4 bg-white dark:bg-slate-900 ${cardHover}`} onClick={() => navigate("/analytics/orders")}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Orders Today</p>
                <Utensils className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{todayStats?.orders || 0}</p>
              <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-500 font-medium">
                View details <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent>Click to view order analytics</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`p-4 bg-white dark:bg-slate-900 ${cardHover}`} onClick={() => navigate("/analytics/tables")}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active Tables</p>
                <Users className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{todayStats?.activeTables || 0}</p>
              <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-500 font-medium">
                View details <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent>Click to view table analytics</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`p-4 bg-white dark:bg-slate-900 ${cardHover}`} onClick={() => navigate("/analytics/billing")}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Bills Settled</p>
                <TrendingDown className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{todayStats?.settledCount || 0}</p>
              <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-500 font-medium">
                View details <ArrowRight className="w-3 h-3" />
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent>Click to view billing analytics</TooltipContent>
        </Tooltip>
      </div>

      {/* 7-Day Revenue Chart */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className={`p-5 bg-white dark:bg-slate-900 ${cardHover}`} onClick={() => navigate("/analytics/revenue-chart")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">7-Day Revenue Trend</h3>
              <div className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                Full dashboard <ArrowRight className="w-3 h-3" />
              </div>
            </div>
            <div className="relative" style={{ height: chartHeight + 40 }}>
              {dailyRevenue && dailyRevenue.length > 0 && (() => {
                const W = 800;
                const H = chartHeight;
                const pad = { top: 20, bottom: 30, left: 50, right: 10 };
                const plotW = W - pad.left - pad.right;
                const plotH = H - pad.top - pad.bottom;
                const maxVal = maxRevenue;

                const points = dailyRevenue.map((d, i) => ({
                  x: pad.left + (i / (dailyRevenue.length - 1 || 1)) * plotW,
                  y: pad.top + plotH - (d.revenue / maxVal) * plotH,
                  ...d,
                }));

                const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                const areaPath = `${linePath} L ${points[points.length - 1].x} ${pad.top + plotH} L ${points[0].x} ${pad.top + plotH} Z`;

                const yTicks = 4;
                const yLines = Array.from({ length: yTicks + 1 }, (_, i) => {
                  const val = (maxVal / yTicks) * i;
                  const y = pad.top + plotH - (i / yTicks) * plotH;
                  return { val, y };
                });

                return (
                  <svg viewBox={`0 0 ${W} ${H + 40}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
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

                    <path d={areaPath} fill="url(#areaGrad)" />
                    <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                    {points.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#10b981" strokeWidth="2" />
                        <text x={p.x} y={pad.top + plotH + 16} textAnchor="middle" className="text-[9px]" fill="#94a3b8">
                          {p.date.slice(5)}
                        </text>
                        {p.revenue > 0 && (
                          <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[8px] font-medium" fill="#475569">
                            {formatINR(p.revenue)}
                          </text>
                        )}
                      </g>
                    ))}
                  </svg>
                );
              })()}
              {(!dailyRevenue || dailyRevenue.length === 0) && (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No revenue data yet</p>
              )}
            </div>
          </Card>
        </TooltipTrigger>
        <TooltipContent>Click to view full revenue dashboard</TooltipContent>
      </Tooltip>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Popular Items */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`p-5 bg-white dark:bg-slate-900 ${cardHover}`} onClick={() => navigate("/analytics/products")}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-0 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  Popular Items (30 days)
                </h3>
                <div className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                  View all <ArrowRight className="w-3 h-3" />
                </div>
              </div>
              <div className="space-y-3">
                {popularItems?.slice(0, 5).map((item: any, i: number) => {
                  const maxCount = popularItems[0]?.count || 1;
                  const pct = Math.round((item.count / maxCount) * 100);
                  const medal = i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-orange-400 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400";
                  return (
                    <div key={item.menuItemId} className="group">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${medal}`}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate flex-1">{item.name}</span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{item.count} sold</span>
                      </div>
                      <div className="ml-9 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            i === 0 ? "bg-gradient-to-r from-amber-400 to-amber-500" :
                            i === 1 ? "bg-gradient-to-r from-slate-300 to-slate-400" :
                            i === 2 ? "bg-gradient-to-r from-orange-300 to-orange-400" :
                            "bg-gradient-to-r from-blue-300 to-blue-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {(!popularItems || popularItems.length === 0) && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No sales data yet</p>
                )}
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent>Click to view product analytics</TooltipContent>
        </Tooltip>

        {/* Active Tables Breakdown */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`p-5 bg-white dark:bg-slate-900 ${cardHover}`} onClick={() => navigate("/analytics/table-breakdown")}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-0 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  Active Tables Breakdown
                </h3>
                <div className="flex items-center gap-1 text-[10px] text-blue-500 font-medium">
                  View all <ArrowRight className="w-3 h-3" />
                </div>
              </div>
              <div className="space-y-3">
                {activeTables?.map((t: any) => {
                  const maxTotal = Math.max(...activeTables.map((x: any) => x.finalTotal), 1);
                  const pct = Math.round((t.finalTotal / maxTotal) * 100);
                  return (
                    <div key={t.sessionId}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-500 text-white">
                            {t.tableLabel}
                          </span>
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {t.tableLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span>{t.orderCount} order{t.orderCount !== 1 ? "s" : ""}</span>
                          <span>{t.itemCount} item{t.itemCount !== 1 ? "s" : ""}</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{formatINR(t.finalTotal)}</span>
                        </div>
                      </div>
                      <div className="ml-8 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="ml-8 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        Active for {t.minsActive < 60 ? `${t.minsActive}m` : `${Math.floor(t.minsActive / 60)}h ${t.minsActive % 60}m`}
                      </p>
                    </div>
                  );
                })}
                {(!activeTables || activeTables.length === 0) && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No active tables right now</p>
                )}
              </div>
            </Card>
          </TooltipTrigger>
          <TooltipContent>Click to view table utilization</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
