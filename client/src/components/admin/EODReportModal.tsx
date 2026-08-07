import { useState } from "react";
import { X, Printer, Calendar, FileText, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface EODReportModalProps {
  open: boolean;
  onClose: () => void;
}

// ── helpers ────────────────────────────────────────────────────────────────

function todayIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// ── component ──────────────────────────────────────────────────────────────

export default function EODReportModal({ open, onClose }: EODReportModalProps) {
  const { fmtPrice } = useFormatCurrency();
  const [selectedDate, setSelectedDate] = useState(todayIST());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["eod-report", selectedDate],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      // Date range in UTC (IST = UTC+5:30)
      const dayStart = new Date(selectedDate + "T00:00:00+05:30").toISOString();
      const dayEnd   = new Date(selectedDate + "T23:59:59+05:30").toISOString();

      // 1. Settled sessions for the day
      const { data: sessions, error: sessErr } = await supabase
        .from("sessions")
        .select("subtotal, serviceCharge, taxAmount, discountAmount, finalTotal, settledAt")
        .eq("status", "settled")
        .gte("settledAt", dayStart)
        .lte("settledAt", dayEnd);

      if (sessErr) throw sessErr;

      const grossSales     = (sessions || []).reduce((s, r) => s + parseFloat(r.finalTotal?.toString()  || "0"), 0);
      const totalDiscount  = (sessions || []).reduce((s, r) => s + parseFloat(r.discountAmount?.toString() || "0"), 0);
      const totalTax       = (sessions || []).reduce((s, r) => s + parseFloat(r.taxAmount?.toString()    || "0"), 0);
      const totalSC        = (sessions || []).reduce((s, r) => s + parseFloat(r.serviceCharge?.toString() || "0"), 0);
      const netSales       = grossSales - totalDiscount;
      const totalOrders    = (sessions || []).length;
      const avgBill        = totalOrders > 0 ? grossSales / totalOrders : 0;

      // 2. Top selling items via orderHistories.itemsSnapshot
      const { data: histories, error: histErr } = await supabase
        .from("orderHistories")
        .select("itemsSnapshot, settledAt")
        .gte("settledAt", dayStart)
        .lte("settledAt", dayEnd);

      if (histErr) throw histErr;

      // itemsSnapshot is an array of { menuItemId, quantity, priceAtOrderTime }
      const itemMap: Record<number, { qty: number; revenue: number }> = {};
      (histories || []).forEach((h: any) => {
        const snapshot: any[] = Array.isArray(h.itemsSnapshot) ? h.itemsSnapshot : [];
        snapshot.forEach((item) => {
          const id = item.menuItemId;
          if (!itemMap[id]) itemMap[id] = { qty: 0, revenue: 0 };
          itemMap[id].qty     += Number(item.quantity) || 0;
          itemMap[id].revenue += (Number(item.priceAtOrderTime) || 0) * (Number(item.quantity) || 0);
        });
      });

      // Resolve names for top IDs
      const topIds = Object.entries(itemMap)
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 5)
        .map(([id]) => Number(id));

      let nameMap: Record<number, string> = {};
      if (topIds.length > 0) {
        const { data: menuItems } = await supabase
          .from("menuItems")
          .select("id, name")
          .in("id", topIds);
        (menuItems || []).forEach((m: any) => { nameMap[m.id] = m.name; });
      }

      const topItems = topIds.map((id) => ({
        name: nameMap[id] || `Item #${id}`,
        count: itemMap[id].qty,
        revenue: itemMap[id].revenue,
      }));

      // 3. Payment method breakdown from orders in those sessions
      // We check orders table for payment methods recorded on that day
      const { data: dayOrders } = await supabase
        .from("orders")
        .select("paymentMethod")
        .gte("submittedAt", dayStart)
        .lte("submittedAt", dayEnd)
        .not("paymentMethod", "is", null);

      const paymentMap: Record<string, number> = {};
      (dayOrders || []).forEach((o: any) => {
        if (o.paymentMethod) {
          paymentMap[o.paymentMethod] = (paymentMap[o.paymentMethod] || 0) + 1;
        }
      });
      const paymentMethods = Object.entries(paymentMap).map(([method, count]) => ({ method, count }));

      return { grossSales, netSales, totalDiscount, totalTax, totalSC, totalOrders, avgBill, topItems, paymentMethods };
    },
  });

  const handlePrint = () => window.print();

  if (!open) return null;

  const cgst = (data?.totalTax ?? 0) / 2;
  const sgst = (data?.totalTax ?? 0) / 2;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto space-y-6 print:shadow-none print:border-none print:p-0 print:max-h-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 print:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">End of Day (EOD) Z-Report</h2>
                <p className="text-xs text-slate-500">Daily Financial & Operational Summary</p>
              </div>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <button
                onClick={() => refetch()}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                title="Refresh data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" /> Print Z-Report
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200 print:bg-white print:border-none">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">Report Date:</span>
            <input
              type="date"
              value={selectedDate}
              max={todayIST()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white px-3 py-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          {/* Loading / Error / Content */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Loading report data…</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-red-500">
              <AlertCircle className="w-8 h-8" />
              <p className="text-sm font-medium">Could not load data. Please try again.</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl transition"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Financial Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Gross Sales</p>
                  <p className="text-lg font-bold text-slate-900">{fmtPrice(data?.grossSales ?? 0)}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 space-y-1">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Net Sales</p>
                  <p className="text-lg font-bold text-emerald-800">{fmtPrice(data?.netSales ?? 0)}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 space-y-1">
                  <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Total Orders</p>
                  <p className="text-lg font-bold text-blue-900">{data?.totalOrders ?? 0}</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 space-y-1">
                  <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Avg Bill (AOV)</p>
                  <p className="text-lg font-bold text-amber-900">{fmtPrice(data?.avgBill ?? 0)}</p>
                </div>
              </div>

              {/* Tax & Charges Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                  Tax & Charges Breakdown
                </div>
                <div className="divide-y divide-slate-100 text-sm">
                  <div className="px-4 py-2.5 flex justify-between">
                    <span className="text-slate-600">Discounts Given</span>
                    <span className={`font-semibold ${(data?.totalDiscount ?? 0) > 0 ? "text-red-600" : "text-slate-400"}`}>
                      {(data?.totalDiscount ?? 0) > 0 ? `-${fmtPrice(data!.totalDiscount)}` : fmtPrice(0)}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between">
                    <span className="text-slate-600">CGST Collected (2.5%)</span>
                    <span className="font-semibold text-slate-800">{fmtPrice(cgst)}</span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between">
                    <span className="text-slate-600">SGST Collected (2.5%)</span>
                    <span className="font-semibold text-slate-800">{fmtPrice(sgst)}</span>
                  </div>
                  {(data?.totalSC ?? 0) > 0 && (
                    <div className="px-4 py-2.5 flex justify-between">
                      <span className="text-slate-600">Service Charges</span>
                      <span className="font-semibold text-slate-800">{fmtPrice(data!.totalSC)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Mode & Top Items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Payment Breakdown */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Payment Mode Breakdown</h4>
                  {(data?.paymentMethods ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">No payment data for this date.</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {(data?.paymentMethods ?? []).map((pm) => (
                        <div key={pm.method} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded-xl">
                          <span className="text-slate-600 capitalize">{pm.method.replace(/_/g, " ")}</span>
                          <span className="font-bold text-slate-800">{pm.count} order{pm.count !== 1 ? "s" : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Selling Items */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Top Selling Items Today</h4>
                  {(data?.topItems ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">No orders found for this date.</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {(data?.topItems ?? []).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-50 px-3 py-1.5 rounded-xl">
                          <span className="text-slate-700 font-medium truncate max-w-[140px]">{item.name}</span>
                          <span className="text-xs text-slate-500 font-mono">
                            x{item.count} ({fmtPrice(item.revenue)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-2 text-center text-xs text-slate-400 print:block">
                Report generated at {new Date().toLocaleTimeString()} • MAMA Cafe Z-Report System
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
