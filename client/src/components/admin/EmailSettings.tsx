import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export default function EmailSettings() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("*").single();
      return data;
    },
  });

  const [senderName, setSenderName] = useState("");
  const [footerMessage, setFooterMessage] = useState("");

  useEffect(() => {
    if (settings) {
      setSenderName(settings.sender_name || "");
      setFooterMessage(settings.footerMessage || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("businessSettings")
        .update({
          sender_name: senderName.trim() || null,
          footerMessage: footerMessage.trim() || null,
        })
        .eq("id", settings?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businessSettings"] });
      toast.success("Email settings saved");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="p-6 md:p-8 bg-white dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
          <Mail className="w-5 h-5 text-amber-600" />
          Email Settings
        </h2>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Sender Name</label>
            <Input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="MAMA Cafe"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Name recipients see as the sender (e.g., MAMA Cafe)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Default Footer Message</label>
            <textarea
              value={footerMessage}
              onChange={(e) => setFooterMessage(e.target.value)}
              placeholder="Thank you for choosing us!"
              rows={3}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all resize-none"
            />
          </div>

        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full mt-6 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {saveMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
          ) : (
            <><Save className="w-4 h-4 mr-2" /> Save Settings</>
          )}
        </Button>
      </Card>
    </div>
  );
}
