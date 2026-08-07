import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Gift, Users, Settings, Search, Loader2, Plus, Minus, Trophy, Ticket, History, ToggleLeft, ToggleRight, Save } from "lucide-react";
import { toast } from "sonner";

interface MilestoneConfig {
  points: number;
  spins: number;
  couponPercent: number;
  enabled: boolean;
}

const DEFAULT_MILESTONES: MilestoneConfig[] = [
  { points: 50, spins: 1, couponPercent: 5, enabled: true },
  { points: 100, spins: 3, couponPercent: 10, enabled: true },
  { points: 150, spins: 5, couponPercent: 15, enabled: true },
];

export default function AdminLoyaltyPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adjustModal, setAdjustModal] = useState<{ phone: string; name: string } | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [detailWallet, setDetailWallet] = useState<any>(null);
  const [couponSearch, setCouponSearch] = useState("");

  // Settings
  const { data: settings } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("loyaltyEnabled,loyaltyRewardPercent,loyaltyPointsThreshold").single();
      return data || { loyaltyEnabled: true, loyaltyRewardPercent: 5, loyaltyPointsThreshold: 100 };
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: any) => {
      const { data: s } = await supabase.from("businessSettings").select("id").single();
      if (s) await supabase.from("businessSettings").update(updates).eq("id", s.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businessSettings"] });
      toast.success("Settings saved");
    },
  });

  // Milestone config
  const [milestoneConfig, setMilestoneConfig] = useState<MilestoneConfig[]>(DEFAULT_MILESTONES);
  
  const { data: milestoneData } = useQuery({
    queryKey: ["milestoneConfig"],
    queryFn: async () => {
      const r = await fetch("/api/loyalty/milestone-config");
      if (!r.ok) return DEFAULT_MILESTONES;
      return r.json();
    },
  });

  // Update local state when data loads
  if (milestoneData && JSON.stringify(milestoneData) !== JSON.stringify(milestoneConfig)) {
    setMilestoneConfig(milestoneData);
  }

  const updateMilestoneMutation = useMutation({
    mutationFn: async (config: MilestoneConfig[]) => {
      const r = await fetch("/api/loyalty/milestone-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestoneConfig"] });
      toast.success("Milestone settings saved");
    },
    onError: () => toast.error("Failed to save milestone settings"),
  });

  // Wallets
  const { data: wallets, isLoading: walletsLoading } = useQuery({
    queryKey: ["loyaltyAdminWallets"],
    queryFn: async () => {
      const r = await fetch("/api/loyalty/admin/wallets");
      return r.json();
    },
  });

  // Coupons
  const { data: coupons } = useQuery({
    queryKey: ["loyaltyAdminCoupons"],
    queryFn: async () => {
      const r = await fetch("/api/loyalty/admin/coupons");
      return r.json();
    },
  });

  // Wallet detail
  const { data: walletDetail } = useQuery({
    queryKey: ["loyaltyWallet", detailWallet?.customerPhone],
    enabled: !!detailWallet?.customerPhone,
    queryFn: async () => {
      const r = await fetch(`/api/loyalty/wallet/${detailWallet.customerPhone}`);
      return r.json();
    },
  });

  const { data: allCoupons = [] } = useQuery({
    queryKey: ["adminCoupons"],
    queryFn: async () => {
      const r = await fetch("/api/loyalty/admin/coupons");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const deactivateCouponMutation = useMutation({
    mutationFn: async (couponId: string) => {
      const r = await fetch(`/api/loyalty/admin/coupons/${couponId}/deactivate`, { method: "PATCH" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminCoupons"] });
      queryClient.invalidateQueries({ queryKey: ["loyaltyAdminCoupons"] });
      toast.success("Coupon deactivated");
    },
    onError: () => toast.error("Failed to deactivate coupon"),
  });

  const expireCouponMutation = useMutation({
    mutationFn: async (couponId: string) => {
      const r = await fetch(`/api/loyalty/admin/coupons/${couponId}/expire`, { method: "PATCH" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminCoupons"] });
      queryClient.invalidateQueries({ queryKey: ["loyaltyAdminCoupons"] });
      toast.success("Coupon expired");
    },
    onError: () => toast.error("Failed to expire coupon"),
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/loyalty/admin/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: adjustModal?.phone,
          points: parseInt(adjustPoints),
          reason: adjustReason || "Admin adjustment",
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyaltyAdminWallets"] });
      setAdjustModal(null);
      setAdjustPoints("");
      setAdjustReason("");
      toast.success("Points adjusted");
    },
    onError: () => toast.error("Failed to adjust points"),
  });

  const filteredWallets = (wallets || []).filter((w: any) =>
    !search || w.customerPhone?.includes(search) || w.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCoupons = (coupons || []).filter((c: any) => c.status === "active");
  const redeemedCoupons = (coupons || []).filter((c: any) => c.status === "redeemed");

  const filteredCoupons = (allCoupons as any[]).filter(
    (c: any) =>
      !couponSearch ||
      c.code?.toLowerCase().includes(couponSearch.toLowerCase()) ||
      c.customerPhone?.includes(couponSearch) ||
      c.customerName?.toLowerCase().includes(couponSearch.toLowerCase())
  );

  const totalCoupons = (allCoupons as any[]).length;
  const activeCouponCount = (allCoupons as any[]).filter((c: any) => c.status === "active").length;
  const usedCouponCount = (allCoupons as any[]).filter((c: any) => c.status === "used" || c.status === "redeemed").length;
  const expiredCouponCount = (allCoupons as any[]).filter((c: any) => c.status === "expired").length;

  return (
    <div className="space-y-6">
      {/* Loyalty Settings */}
      <Card className="p-4 md:p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-amber-600" />
          Loyalty Settings
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">Enable Loyalty System</label>
              <p className="text-xs text-slate-400 mt-0.5">Customers earn points on paid orders</p>
            </div>
            <button
              onClick={() => updateSettingsMutation.mutate({ loyaltyEnabled: !settings?.loyaltyEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings?.loyaltyEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings?.loyaltyEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Coupon Discount %</label>
              <Input
                type="number"
                value={settings?.loyaltyRewardPercent || 5}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 5;
                  updateSettingsMutation.mutate({ loyaltyRewardPercent: val });
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Points per Coupon</label>
              <Input
                type="number"
                value={settings?.loyaltyPointsThreshold || 100}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 100;
                  updateSettingsMutation.mutate({ loyaltyPointsThreshold: val });
                }}
              />
            </div>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Point Tiers</p>
            <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-1">
              ₹500→5pts, ₹1000→15pts, ₹1500→20pts, ₹2000→30pts, ₹2500→35pts, ₹3000→45pts, ₹3500→50pts, ₹4000→60pts (+10pts per extra ₹500)
            </p>
          </div>
        </div>
      </Card>

      {/* Milestone Configuration */}
      <Card className="p-4 md:p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-600" />
            Milestone Rewards
          </h2>
          <Button
            size="sm"
            onClick={() => updateMilestoneMutation.mutate(milestoneConfig)}
            disabled={updateMilestoneMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {updateMilestoneMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save
          </Button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Configure what customers can redeem at each milestone</p>
        
        <div className="space-y-3">
          {milestoneConfig.map((milestone, idx) => (
            <div key={milestone.points} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm font-bold text-amber-600">
                    {milestone.points}
                  </div>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{milestone.points} Points</span>
                </div>
                <button
                  onClick={() => {
                    const newConfig = [...milestoneConfig];
                    newConfig[idx] = { ...newConfig[idx], enabled: !newConfig[idx].enabled };
                    setMilestoneConfig(newConfig);
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${milestone.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${milestone.enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
                </button>
              </div>
              
              {milestone.enabled && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Lucky Spins</label>
                    <Input
                      type="number"
                      size="sm"
                      value={milestone.spins}
                      onChange={(e) => {
                        const newConfig = [...milestoneConfig];
                        newConfig[idx] = { ...newConfig[idx], spins: parseInt(e.target.value) || 1 };
                        setMilestoneConfig(newConfig);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-0.5 block">Coupon Discount %</label>
                    <Input
                      type="number"
                      size="sm"
                      value={milestone.couponPercent}
                      onChange={(e) => {
                        const newConfig = [...milestoneConfig];
                        newConfig[idx] = { ...newConfig[idx], couponPercent: parseInt(e.target.value) || 5 };
                        setMilestoneConfig(newConfig);
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-center">
          <Users className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{wallets?.length || 0}</p>
          <p className="text-xs text-slate-400">Customers</p>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-center">
          <Star className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-amber-600">{wallets?.reduce((s: number, w: any) => s + (w.currentPoints || 0), 0) || 0}</p>
          <p className="text-xs text-slate-400">Points Issued</p>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-center">
          <Ticket className="w-5 h-5 text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-600">{activeCoupons.length}</p>
          <p className="text-xs text-slate-400">Active Coupons</p>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-center">
          <Gift className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-purple-600">{redeemedCoupons.length}</p>
          <p className="text-xs text-slate-400">Redeemed</p>
        </Card>
      </div>

      {/* Customer Wallets */}
      <Card className="p-4 md:p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-600" />
          Customer Wallets
        </h2>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search by phone or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {walletsLoading ? (
          <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>
        ) : filteredWallets.length === 0 ? (
          <p className="text-center py-8 text-slate-400 text-sm">No customers in the loyalty program yet</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Active Coupons</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWallets.map((w: any) => {
                  const walletCoupons = (coupons || []).filter((c: any) => c.walletId === w.id && c.status === "active");
                  return (
                    <TableRow key={w.id}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{w.customerName || "—"}</p>
                          <p className="text-[10px] text-slate-400">{w.customerPhone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-amber-600">{w.currentPoints}</span>
                        <span className="text-[10px] text-slate-400 ml-1">({w.lifetimeEarned} earned)</span>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{walletCoupons.length}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetailWallet(w)}>
                            <History className="w-3 h-3 mr-1" /> History
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdjustModal({ phone: w.customerPhone, name: w.customerName })}>
                            <Plus className="w-3 h-3 mr-1" /> Adjust
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Adjust Points Dialog */}
      <Dialog open={adjustModal !== null} onOpenChange={(open) => { if (!open) setAdjustModal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-600" />
              Adjust Points — {adjustModal?.name || adjustModal?.phone}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Points (use negative to deduct)</label>
              <Input type="number" placeholder="e.g. 50 or -20" value={adjustPoints} onChange={(e) => setAdjustPoints(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Reason</label>
              <Input placeholder="e.g. Bonus reward" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            </div>
            <Button onClick={() => adjustMutation.mutate()} disabled={!adjustPoints || adjustMutation.isPending} className="w-full">
              {adjustMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wallet Detail Dialog */}
      <Dialog open={detailWallet !== null} onOpenChange={(open) => { if (!open) setDetailWallet(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-600" />
              {detailWallet?.customerName || detailWallet?.customerPhone} — Rewards History
            </DialogTitle>
          </DialogHeader>
          {walletDetail ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                  <p className="text-lg font-bold text-amber-600">{walletDetail.wallet.currentPoints}</p>
                  <p className="text-[10px] text-slate-400">Current</p>
                </div>
                <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <p className="text-lg font-bold text-green-600">{walletDetail.wallet.lifetimeEarned}</p>
                  <p className="text-[10px] text-slate-400">Earned</p>
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <p className="text-lg font-bold text-red-500">{walletDetail.wallet.lifetimeRedeemed}</p>
                  <p className="text-[10px] text-slate-400">Redeemed</p>
                </div>
              </div>
              {walletDetail.coupons?.length > 0 && (
                <>
                  <Separator />
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Coupons</h4>
                  <div className="space-y-1">
                    {walletDetail.coupons.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-sm py-1">
                        <span className="font-mono text-xs">{c.code}</span>
                        <Badge className={c.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}>
                          {c.status} — {c.discountPercent}% off
                        </Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {walletDetail.transactions?.length > 0 && (
                <>
                  <Separator />
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Transactions</h4>
                  <div className="space-y-1">
                    {walletDetail.transactions.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between text-sm py-1">
                        <span className="text-slate-600 dark:text-slate-400 text-xs">{t.description}</span>
                        <span className={`font-bold text-xs ${t.type === "earn" ? "text-green-600" : t.type === "redeem" ? "text-red-500" : "text-blue-600"}`}>
                          {t.type === "earn" ? "+" : "-"}{t.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>
          )}
        </DialogContent>
      </Dialog>

      {/* Coupon Management */}
      <Card className="p-4 md:p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <Ticket className="w-5 h-5 text-green-600" />
          Coupon Management
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
            <p className="text-lg font-bold text-slate-900 dark:text-white">{totalCoupons}</p>
            <p className="text-[10px] text-slate-400">Total</p>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg text-center">
            <p className="text-lg font-bold text-green-600">{activeCouponCount}</p>
            <p className="text-[10px] text-green-500">Active</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-center">
            <p className="text-lg font-bold text-blue-600">{usedCouponCount}</p>
            <p className="text-[10px] text-blue-500">Used</p>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-center">
            <p className="text-lg font-bold text-red-500">{expiredCouponCount}</p>
            <p className="text-[10px] text-red-400">Expired</p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by code or phone..."
            value={couponSearch}
            onChange={(e) => setCouponSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {filteredCoupons.length === 0 ? (
          <p className="text-center py-8 text-slate-400 text-sm">No coupons found</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCoupons.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{c.code}</span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm text-slate-900 dark:text-white">{c.customerName || "—"}</p>
                        <p className="text-[10px] text-slate-400">{c.customerPhone}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {c.discountPercent ? `${c.discountPercent}% OFF` : c.freeItemName || "Reward"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={c.source === "spin" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}>
                        {c.source === "spin" ? "Spin" : "Loyalty"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        c.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        c.status === "used" || c.status === "redeemed" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-500">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-slate-500">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}</span>
                    </TableCell>
                    <TableCell>
                      {c.status === "active" && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700"
                            onClick={() => deactivateCouponMutation.mutate(c.id)}
                            disabled={deactivateCouponMutation.isPending}
                          >
                            Deactivate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-orange-600 hover:text-orange-700"
                            onClick={() => expireCouponMutation.mutate(c.id)}
                            disabled={expireCouponMutation.isPending}
                          >
                            Expire
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
