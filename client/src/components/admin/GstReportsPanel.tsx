import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileText, Download, Loader2, Receipt, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface Gstr1Summary {
  period: { month: string; from: string; to: string };
  businessDetails: {
    gstin: string | null;
    legalName: string | null;
    tradeName: string | null;
    stateCode: string | null;
    isInterState: boolean;
    gstRate: number;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
  };
  summary: {
    totalInvoices: number;
    totalTaxableValue: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalCess: number;
    totalInvoiceValue: number;
  };
  hsnSummary: Array<{
    hsnCode: string;
    totalQuantity: number;
    totalTaxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
  }>;
  b2cInvoices: Array<{
    invoiceNumber: string;
    invoiceDate: string;
    placeOfSupply: string | null;
    customerName: string;
    customerPhone: string | null;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    invoiceValue: number;
  }>;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function GstReportsPanel() {
  const [month, setMonth] = useState<string>(currentMonthKey());

  const { data, isLoading, error } = useQuery<Gstr1Summary>({
    queryKey: ["gstr1", month],
    queryFn: async () => {
      const r = await fetch(`/api/reports/gstr1?month=${month}`, { credentials: "include" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load report");
      }
      return r.json();
    },
  });

  const handleDownloadCsv = async () => {
    try {
      const r = await fetch(`/api/reports/gstr1?month=${month}&format=csv`, { credentials: "include" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Download failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GSTR1_${month}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("GSTR-1 CSV downloaded");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Card className="p-4 md:p-6 bg-white">
      <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-2 flex items-center gap-2">
        <Receipt className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
        GST Reports (GSTR-1)
     </h2>
      <p className="text-sm text-slate-600 mb-6">
        Generate monthly outward-supply reports for Indian GST filing.
        Includes HSN-wise summary and B2C invoice register. Configure HSN codes on each menu item and GSTIN in Business Settings.
     </p>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="space-y-2">
          <Label>Month</Label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
          />
       </div>
        <Button variant="outline" onClick={handleDownloadCsv} disabled={!data}>
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Download CSV
       </Button>
     </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading report...
       </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {(error as Error).message}
       </div>
      )}

      {data && (
        <>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-slate-500 text-xs">GSTIN</div>
                <div className="font-medium">{data.businessDetails.gstin || "Not configured"}</div>
             </div>
              <div>
                <div className="text-slate-500 text-xs">Legal Name</div>
                <div className="font-medium">{data.businessDetails.legalName || "—"}</div>
             </div>
              <div>
                <div className="text-slate-500 text-xs">Trade Name</div>
                <div className="font-medium">{data.businessDetails.tradeName || "—"}</div>
             </div>
              <div>
                <div className="text-slate-500 text-xs">State Code</div>
                <div className="font-medium">{data.businessDetails.stateCode || "—"}</div>
             </div>
           </div>
         </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SummaryCard label="Invoices" value={data.summary.totalInvoices.toString()} />
            <SummaryCard label="Taxable Value" value={formatCurrency(data.summary.totalTaxableValue)} />
            <SummaryCard
              label={data.businessDetails.isInterState ? "IGST" : "CGST + SGST"}
              value={formatCurrency(
                data.businessDetails.isInterState
                  ? data.summary.totalIgst
                  : data.summary.totalCgst + data.summary.totalSgst
              )}
            />
            <SummaryCard label="Total Value" value={formatCurrency(data.summary.totalInvoiceValue)} accent />
         </div>

          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" /> HSN-wise Summary
           </h3>
            {data.hsnSummary.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
                No invoices in {month}. Configure HSN codes on menu items for accurate filing.
             </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">HSN</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Qty</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Taxable</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">CGST</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">SGST</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">IGST</th>
                   </tr>
                 </thead>
                  <tbody>
                    {data.hsnSummary.map((row) => (
                      <tr key={row.hsnCode} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono">{row.hsnCode}</td>
                        <td className="px-3 py-2 text-right">{row.totalQuantity}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.totalTaxableValue)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.cgst)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.sgst)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(row.igst)}</td>
                     </tr>
                    ))}
                 </tbody>
               </table>
             </div>
            )}
         </div>

          {data.b2cInvoices.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" /> B2C Invoice Register ({data.b2cInvoices.length})
             </h3>
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Invoice #</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Customer</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Value</th>
                   </tr>
                 </thead>
                  <tbody>
                    {data.b2cInvoices.map((inv, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{new Date(inv.invoiceDate).toLocaleDateString("en-IN")}</td>
                        <td className="px-3 py-2">{inv.customerName}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(inv.invoiceValue)}</td>
                     </tr>
                    ))}
                 </tbody>
               </table>
             </div>
           </div>
          )}
        </>
      )}
   </Card>
  );
}

function SummaryCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${accent ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${accent ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
   </div>
  );
}
