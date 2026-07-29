import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Save, DollarSign, Coffee, Star } from "lucide-react";
import { toast } from "sonner";

const CURRENCIES = [
  { value: "INR", label: "₹ Indian Rupee (INR)", symbol: "₹" },
  { value: "USD", label: "$ US Dollar (USD)", symbol: "$" },
  { value: "EUR", label: "€ Euro (EUR)", symbol: "€" },
  { value: "GBP", label: "£ British Pound (GBP)", symbol: "£" },
];

export default function BusinessPreferences() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("*").single();
      return data;
    },
  });

  const [currency, setCurrency] = useState("INR");
  const [restaurantStatus, setRestaurantStatus] = useState("open");
  const [reviewLink, setReviewLink] = useState("");

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || "INR");
      setRestaurantStatus(settings.restaurant_status || "open");
      setReviewLink(settings.review_link || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("No settings record found");
      const { error } = await supabase
        .from("businessSettings")
        .update({
          currency,
          restaurant_status: restaurantStatus,
          review_link: reviewLink.trim() || null,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businessSettings"] });
      fetch("/api/public/invalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "businessSettings" }),
      });
      toast.success("Business preferences saved");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="space-y-6">
          {["Currency", "Tax & Charges", "Service Charge", "Receipt"].map((section) => (
            <div key={section} className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-5" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">Currency, restaurant status, invoice settings</p>

      {/* Currency */}
      <Card className="p-6 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Currency</h3>
        </div>
        <div className="relative">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all appearance-none cursor-pointer"
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Current: {CURRENCIES.find(c => c.value === currency)?.symbol} — Used across all price displays
        </p>
      </Card>

      {/* Restaurant Status */}
      <Card className="p-6 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 mb-4">
          <Coffee className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Restaurant Status</h3>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
          <div>
            <Label className="text-sm font-medium text-slate-900 dark:text-white">
              {restaurantStatus === "open" ? "Open" : "Closed"}
            </Label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {restaurantStatus === "open"
                ? "Customers can browse menu and place orders"
                : "Customers see: \"We're currently closed. Please visit us during business hours.\""}
            </p>
          </div>
          <Switch
            checked={restaurantStatus === "open"}
            onCheckedChange={(checked) => setRestaurantStatus(checked ? "open" : "closed")}
          />
        </div>
      </Card>

      {/* Review Link */}
      <Card className="p-6 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Default Rating Link</h3>
        </div>
        <Input
          type="url"
          value={reviewLink}
          onChange={(e) => setReviewLink(e.target.value)}
          placeholder="https://g.page/r/your-google-review-link"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Paste your Google Review, Zomato, or any review URL. After invoice email, customers see: "⭐ Enjoyed your meal? Leave us a review."
        </p>
      </Card>

      {/* Save Button */}
      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {saveMutation.isPending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
        ) : (
          <><Save className="w-4 h-4 mr-2" /> Save Preferences</>
        )}
      </Button>
    </div>
  );
}
