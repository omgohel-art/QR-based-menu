import { ReactNode } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Printer, RefreshCw, Search, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AnalyticsDrillDownProps {
  title: string;
  icon: ReactNode;
  breadcrumbs: { label: string; href?: string }[];
  search?: string;
  onSearchChange?: (v: string) => void;
  onExport?: () => void;
  onPrint?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
  children: ReactNode;
}

export function AnalyticsDrillDown({
  title, icon, breadcrumbs, search, onSearchChange, onExport, onPrint, onRefresh, loading, children
}: AnalyticsDrillDownProps) {
  const [, navigate] = useLocation();

  const handleBack = () => navigate("/?tab=analytics");

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 flex-wrap">
        {breadcrumbs.map((b, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3 h-3" />}
            {b.href ? (
              <button onClick={() => navigate(b.href!)} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{b.label}</button>
            ) : (
              <span className="text-slate-900 dark:text-white font-medium">{b.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="text-blue-600 dark:text-blue-400">{icon}</div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onSearchChange && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search..." value={search || ""} onChange={(e) => onSearchChange(e.target.value)} className="pl-9 w-48" />
            </div>
          )}
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          )}
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint} className="gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          )}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? <LoadingSkeleton /> : children}
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-7 w-16" /></Card>
        ))}
      </div>
      <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>
    </div>
  );
}

export function StatCard({ label, value, sub, icon, color = "blue" }: {
  label: string; value: string | number; sub?: string; icon?: ReactNode; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-950 text-blue-600",
    green: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600",
    amber: "bg-amber-50 dark:bg-amber-950 text-amber-600",
    red: "bg-red-50 dark:bg-red-950 text-red-600",
    purple: "bg-purple-50 dark:bg-purple-950 text-purple-600",
    slate: "bg-slate-50 dark:bg-slate-800 text-slate-600",
  };
  return (
    <Card className="p-4 bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
        {icon && <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>{icon}</div>}
      </div>
      <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </Card>
  );
}

export function DataTable({ headers, rows, empty }: { headers: string[]; rows: (string | number | ReactNode)[][]; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {headers.map((h, i) => (
              <th key={i} className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="text-center py-8 text-slate-400">{empty || "No data"}</td></tr>
          ) : rows.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              {row.map((cell, ci) => <td key={ci} className="py-3 px-4 text-slate-700 dark:text-slate-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MiniBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function exportCSV(headers: string[], rows: (string | number)[][], filename: string) {
  const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function formatINR(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
}
