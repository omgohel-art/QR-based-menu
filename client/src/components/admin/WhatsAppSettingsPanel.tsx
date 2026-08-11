import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageCircle, Loader2, Send, Clock, Bell, Eye, History } from "lucide-react";

interface WhatsAppSettings {
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  whatsappProvider: string;
  whatsappApiUrl: string | null;
  whatsappApiKeyMasked: string | null;
  dailySummaryEnabled: boolean;
  summaryHour: number;
  summaryMinute: number;
  lowStockAlertsEnabled: boolean;
}

interface SummaryHistoryItem {
  id: number;
  summaryDate: string;
  sentAt: string;
  channel: string;
  status: string;
  errorMessage: string | null;
}

interface PreviewResponse {
  summary: any;
  message: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

export default function WhatsAppSettingsPanel() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    whatsappEnabled: false,
    whatsappNumber: "",
    whatsappProvider: "webhook",
    whatsappApiUrl: "",
    whatsappApiKey: "",
    dailySummaryEnabled: false,
    summaryHour: 23,
    summaryMinute: 0,
    lowStockAlertsEnabled: true,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["whatsappSettings"],
    queryFn: async () => {
      const r = await fetch("/api/whatsapp/settings", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load settings");
      return r.json() as Promise<{ settings: WhatsAppSettings | null }>;
    },
  });

  const { data: historyData } = useQuery({
    queryKey: ["whatsappHistory"],
    queryFn: async () => {
      const r = await fetch("/api/whatsapp/history", { credentials: "include" });
      if (!r.ok) return { items: [] };
      return r.json() as Promise<{ items: SummaryHistoryItem[] }>;
    },
  });

  useEffect(() => {
    if (settingsData?.settings) {
      setForm({
        whatsappEnabled: settingsData.settings.whatsappEnabled,
        whatsappNumber: settingsData.settings.whatsappNumber || "",
        whatsappProvider: settingsData.settings.whatsappProvider || "webhook",
        whatsappApiUrl: settingsData.settings.whatsappApiUrl || "",
        whatsappApiKey: "",
        dailySummaryEnabled: settingsData.settings.dailySummaryEnabled,
        summaryHour: settingsData.settings.summaryHour,
        summaryMinute: settingsData.settings.summaryMinute,
        lowStockAlertsEnabled: settingsData.settings.lowStockAlertsEnabled,
      });
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/whatsapp/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return r.json();
    },
    onSuccess: () => {
      toast.success("WhatsApp settings saved");
      queryClient.invalidateQueries({ queryKey: ["whatsappSettings"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send");
      }
      return r.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success(`Test summary sent via ${data.channel}`);
        queryClient.invalidateQueries({ queryKey: ["whatsappHistory"] });
      } else {
        toast.error(data.error || "Send failed");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/whatsapp/summary-preview", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to preview");
      return r.json() as Promise<PreviewResponse>;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setPreviewOpen(true);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6 bg-white">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading WhatsApp settings...
       </div>
     </Card>
    );
  }

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const summaryTimeLabel = `${String(form.summaryHour).padStart(2, "0")}:${String(form.summaryMinute).padStart(2, "0")}`;

  return (
    <Card className="p-4 md:p-6 bg-white">
      <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-2 flex items-center gap-2">
        <MessageCircle className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
        Daily WhatsApp Summary
     </h2>
      <p className="text-sm text-slate-600 mb-6">
        Get a daily summary of revenue, top items, and low stock alerts sent to your WhatsApp at a chosen time.
        Designed for Indian cafe owners who want a daily pulse without logging in.
     </p>

      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
          <div>
            <Label className="text-base font-medium">Enable WhatsApp</Label>
            <p className="text-sm text-slate-500 mt-0.5">
              Turn on to start receiving daily summaries on WhatsApp
           </p>
         </div>
          <button
            type="button"
            onClick={() => update("whatsappEnabled", !form.whatsappEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.whatsappEnabled ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              form.whatsappEnabled ? "translate-x-6" : "translate-x-1"
            }`} />
         </button>
       </div>

        {form.whatsappEnabled && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Your WhatsApp Number</Label>
                <Input
                  value={form.whatsappNumber}
                  onChange={(e) => update("whatsappNumber", e.target.value)}
                  placeholder="9876543210"
                  maxLength={15}
                />
                <p className="text-xs text-slate-500">10-digit Indian number, with or without +91</p>
             </div>

              <div className="space-y-2">
                <Label>WhatsApp Provider</Label>
                <select
                  value={form.whatsappProvider}
                  onChange={(e) => update("whatsappProvider", e.target.value)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                >
                  <option value="webhook">Generic Webhook (Wati, AiSensy, Interakt, etc.)</option>
                  <option value="twilio">Twilio WhatsApp API</option>
               </select>
                <p className="text-xs text-slate-500">
                  {form.whatsappProvider === "twilio"
                    ? "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM env vars"
                    : "Provide a webhook URL that forwards to WhatsApp (most Indian providers supported)"}
               </p>
             </div>

              {form.whatsappProvider === "webhook" && (
                <>
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <Input
                      value={form.whatsappApiUrl}
                      onChange={(e) => update("whatsappApiUrl", e.target.value)}
                      placeholder="https://your-provider.com/api/send"
                    />
                 </div>
                  <div className="space-y-2">
                    <Label>API Key / Token</Label>
                    <Input
                      type="password"
                      value={form.whatsappApiKey}
                      onChange={(e) => update("whatsappApiKey", e.target.value)}
                      placeholder={settingsData?.settings?.whatsappApiKeyMasked || "your-api-key"}
                    />
                    <p className="text-xs text-slate-500">Leave blank to keep existing key</p>
                 </div>
                </>
              )}
           </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Daily Summary Schedule
             </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                  <div>
                    <Label className="text-base font-medium">Send daily summary</Label>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Today's revenue, orders, top items and alerts at the time below
                   </p>
                 </div>
                  <button
                    type="button"
                    onClick={() => update("dailySummaryEnabled", !form.dailySummaryEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.dailySummaryEnabled ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.dailySummaryEnabled ? "translate-x-6" : "translate-x-1"
                    }`} />
                 </button>
               </div>

                {form.dailySummaryEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Hour (24h, IST</Label>
                      <select
                        value={form.summaryHour}
                        onChange={(e) => update("summaryHour", Number(e.target.value))}
                        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                      >
                        {HOURS.map((h) => (
                          <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                        ))}
                     </select>
                   </div>
                    <div className="space-y-2">
                      <Label>Minute</Label>
                      <select
                        value={form.summaryMinute}
                        onChange={(e) => update("summaryMinute", Number(e.target.value))}
                        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
                      >
                        {MINUTES.map((m) => (
                          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                        ))}
                     </select>
                   </div>
                    <div className="col-span-2 text-xs text-slate-500">
                      Summary will be sent daily at <strong>{summaryTimeLabel} IST</strong>
                   </div>
                 </div>
                )}
             </div>
           </div>

            <div className="border-t pt-6">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Bell className="w-4 h-4" /> Instant Alerts
             </h3>
              <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                <div>
                  <Label className="text-base font-medium">Low-stock alerts</Label>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Get a WhatsApp message the moment an ingredient drops below minimum stock
                 </p>
               </div>
                <button
                  type="button"
                  onClick={() => update("lowStockAlertsEnabled", !form.lowStockAlertsEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.lowStockAlertsEnabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.lowStockAlertsEnabled ? "translate-x-6" : "translate-x-1"
                  }`} />
               </button>
             </div>
           </div>

            <div className="flex flex-wrap gap-3 pt-4 border-t">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Settings
             </Button>
              <Button
                variant="outline"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                Preview Summary
             </Button>
              <Button
                variant="outline"
                onClick={() => sendTestMutation.mutate()}
                disabled={sendTestMutation.isPending || !form.whatsappNumber}
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              >
                {sendTestMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send Test Now
             </Button>
           </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800 mb-2">Need a WhatsApp provider</p>
              <p>
                Popular Indian providers (Wati, AiSensy, Interakt) let you send WhatsApp messages from your business number.
                Pick one, copy your "Send Message" webhook URL and API key, paste them above.
             </p>
           </div>

            {historyData && historyData.items && historyData.items.length > 0 && (
              <div className="border-t pt-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <History className="w-4 h-4" /> Recent Sends
               </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Sent At</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Channel</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                     </tr>
                   </thead>
                    <tbody>
                      {historyData.items.map((h) => (
                        <tr key={h.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{h.summaryDate}</td>
                          <td className="px-3 py-2 text-slate-600">{new Date(h.sentAt).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2">{h.channel}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              h.status === "sent" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                            }`}>
                              {h.status}
                           </span>
                            {h.errorMessage && <div className="text-xs text-red-600 mt-1">{h.errorMessage}</div>}
                         </td>
                       </tr>
                      ))}
                   </tbody>
                 </table>
               </div>
             </div>
            )}
          </>
        )}
     </div>

      {previewOpen && previewData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Summary Preview</h3>
              <button onClick={() => setPreviewOpen(false)} className="text-slate-400 hover:text-slate-600">x</button>
           </div>
            <div className="flex-1 overflow-y-auto p-6 bg-[#ECE5DD]">
              <div className="bg-white rounded-lg p-4 shadow-sm whitespace-pre-wrap font-mono text-sm">
                {previewData.message}
             </div>
           </div>
            <div className="px-6 py-3 border-t bg-slate-50 text-xs text-slate-500">
              This is how the summary will look on WhatsApp
           </div>
         </div>
       </div>
      )}
   </Card>
  );
}
