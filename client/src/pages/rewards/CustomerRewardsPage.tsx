import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Star, Gift, Trophy, History, ChevronRight, Ticket, Clock, CheckCircle, ArrowLeft, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { useRoute, useLocation } from "wouter";

function formatCurrency(val: number): string {
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function sanitizePhone(raw: string): string {
  let digits = raw.replace(/[\s\-\(\)\+]/g, "");
  if (digits.startsWith("00")) digits = digits.substring(2);
  if (!digits.startsWith("91") && digits.length === 10) digits = "91" + digits;
  return digits;
}

export default function CustomerRewardsPage() {
  const [, params] = useRoute("/table/:tableCode/rewards");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [phoneInput, setPhoneInput] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Auto-detect phone from localStorage (saved during cart/checkout)
  useEffect(() => {
    if (tableCode && !verifiedPhone) {
      try {
        const saved = localStorage.getItem(`cafe-customer-phone-${tableCode}`);
        if (saved) {
          const sanitized = sanitizePhone(saved);
          if (sanitized.length >= 10) {
            setVerifiedPhone(sanitized);
          }
        }
      } catch {}
    }
  }, [tableCode, verifiedPhone]);

  const { data, isLoading } = useQuery({
    queryKey: ["loyaltyWallet", verifiedPhone],
    enabled: !!verifiedPhone,
    queryFn: async () => {
      const r = await fetch(`/api/loyalty/wallet/${verifiedPhone}`);
      if (!r.ok) throw new Error("Failed to load wallet");
      return r.json();
    },
    staleTime: 10_000,
  });

  const { data: spinData } = useQuery({
    queryKey: ["spinStatus", verifiedPhone],
    enabled: !!verifiedPhone,
    queryFn: async () => {
      const r = await fetch(`/api/spin/status/${verifiedPhone}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 10_000,
  });

  const verifyMutation = useMutation({
    mutationFn: async (phone: string) => {
      const sanitized = sanitizePhone(phone);
      const r = await fetch(`/api/loyalty/wallet/${sanitized}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (_data, variables) => {
      const sanitized = sanitizePhone(variables);
      setVerifiedPhone(sanitized);
      try {
        if (tableCode) localStorage.setItem(`cafe-customer-phone-${tableCode}`, sanitized);
      } catch {}
    },
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!verifiedPhone) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm p-6 bg-white dark:bg-slate-900 shadow-xl border-0">
          <div className="text-center mb-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Loyalty Rewards</h1>
            <p className="text-sm text-slate-500 mt-1">Enter your phone number to view rewards</p>
          </div>
          <div className="space-y-3">
            <Input
              type="tel"
              placeholder="Enter 10-digit mobile number"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
              onKeyDown={(e) => e.key === "Enter" && phoneInput.length === 10 && verifyMutation.mutate(phoneInput)}
              className="text-center text-lg tracking-wider"
            />
            <Button
              onClick={() => verifyMutation.mutate(phoneInput)}
              disabled={phoneInput.length !== 10 || verifyMutation.isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Star className="w-4 h-4 mr-2" />}
              View My Rewards
            </Button>
          </div>
          <Button variant="ghost" className="w-full mt-3 text-slate-500" onClick={() => navigate(`/table/${tableCode}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Menu
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-6 pb-10">
        <div className="max-w-lg mx-auto">
          <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 mb-4 -ml-2" onClick={() => navigate(`/table/${tableCode}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-8 h-8" />
            <div>
              <p className="text-sm text-white/80">Welcome back!</p>
              <p className="text-lg font-bold">{data?.wallet?.customerName || verifiedPhone}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto -mt-6 px-4 space-y-4">
        {/* Points Card */}
        <Card className="p-6 bg-white dark:bg-slate-900 shadow-lg border-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-slate-500">Current Points</p>
              <p className="text-4xl font-bold text-amber-600">{data?.wallet?.currentPoints || 0}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Lifetime Earned</p>
              <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">{data?.wallet?.lifetimeEarned || 0}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Progress to next reward</span>
              <span className="font-medium text-amber-600">{data?.progress || 0}/{100} pts</span>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${data?.progressPercent || 0}%`,
                  background: "linear-gradient(90deg, #F59E0B, #F97316)",
                }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {data?.pointsToNext || 100} more points until your next <span className="font-semibold text-amber-600">🎁 {data?.nextReward || 5}% OFF Coupon</span>
            </p>
          </div>
        </Card>

        {/* Lucky Spin */}
        {verifiedPhone && (
          <Card className="p-5 bg-white dark:bg-slate-900 shadow-lg border-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-2xl">
                  🎰
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Lucky Spin</h3>
                  <p className="text-sm text-slate-500">
                    {spinData && spinData.available > 0
                      ? `${spinData.available} spin${spinData.available !== 1 ? "s" : ""} available`
                      : "Earn points to unlock spins"
                    }
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate(`/table/${tableCode}/spin`)}
                className={spinData && spinData.available > 0
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                  : "border-orange-200 text-orange-600 hover:bg-orange-50"
                }
                variant={spinData && spinData.available > 0 ? "default" : "outline"}
              >
                {spinData && spinData.available > 0 ? "Spin Now" : "View Wheel"}
              </Button>
            </div>
          </Card>
        )}

        {/* Milestone Redemption */}
        {verifiedPhone && data?.milestones && (
          <Card className="p-5 bg-white dark:bg-slate-900 shadow-lg border-0">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-amber-600" />
              Milestone Rewards
            </h3>
            <p className="text-xs text-slate-500 mb-4">Choose how to redeem your milestone points</p>
            
            <div className="space-y-3">
              {data.milestones.filter((m: any) => m.enabled).map((milestone: any) => {
                const isRedeemed = milestone.redeemed;
                const isReached = milestone.reached;
                const canAfford = (data?.wallet?.currentPoints || 0) >= milestone.points;
                const progress = Math.min(100, ((data?.wallet?.lifetimeEarned || 0) / milestone.points) * 100);
                
                return (
                  <div key={milestone.points} className={`p-4 rounded-xl border ${isRedeemed ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800/30" : isReached ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/30" : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isRedeemed ? "bg-green-100 text-green-600" : isReached ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                          {isRedeemed ? "✓" : milestone.points}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{milestone.points} Points</p>
                          {isRedeemed && (
                            <p className="text-[10px] text-green-600">Redeemed for {milestone.rewardType === "spins" ? `${milestone.spinsAwarded} spins` : `${milestone.couponPercent}% coupon`}</p>
                          )}
                        </div>
                      </div>
                      {!isReached && (
                        <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                    
                    {!isRedeemed && isReached && (
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                          disabled={!canAfford}
                          onClick={async () => {
                            try {
                              const r = await fetch("/api/loyalty/redeem-milestone", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ customerPhone: verifiedPhone, milestonePoints: milestone.points, rewardType: "spins" }),
                              });
                              if (r.ok) {
                                queryClient.invalidateQueries({ queryKey: ["loyaltyWallet", verifiedPhone] });
                                queryClient.invalidateQueries({ queryKey: ["spinStatus", verifiedPhone] });
                              }
                            } catch {}
                          }}
                        >
                          🎡 {milestone.spins} Spin{milestone.spins > 1 ? "s" : ""}
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs"
                          disabled={!canAfford}
                          onClick={async () => {
                            try {
                              const r = await fetch("/api/loyalty/redeem-milestone", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ customerPhone: verifiedPhone, milestonePoints: milestone.points, rewardType: "coupon" }),
                              });
                              if (r.ok) {
                                queryClient.invalidateQueries({ queryKey: ["loyaltyWallet", verifiedPhone] });
                              }
                            } catch {}
                          }}
                        >
                          🎁 {milestone.couponPercent}% OFF
                        </Button>
                      </div>
                    )}
                    
                    {!isRedeemed && !isReached && (
                      <p className="text-[10px] text-slate-400 mt-1">Need {milestone.points - (data?.wallet?.lifetimeEarned || 0)} more lifetime points</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Available Coupons */}
        <Card className="p-5 bg-white dark:bg-slate-900 shadow-lg border-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-600" />
              Available Coupons
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{data?.activeCoupons?.length || 0}</Badge>
            </h3>
            <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700 text-xs" onClick={() => navigate(`/table/${tableCode}/coupons`)}>
              View All <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>
          {data?.activeCoupons?.length > 0 ? (
            <div className="space-y-2">
              {data.activeCoupons.map((coupon: any) => (
                <div key={coupon.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                      {coupon.discountPercent}%
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{coupon.discountPercent}% OFF</p>
                      <p className="text-[10px] text-slate-400 font-mono">{coupon.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => copyCode(coupon.code)}>
                      {copiedCode === coupon.code ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">Active</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Ticket className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No coupons yet. Keep ordering!</p>
            </div>
          )}
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 bg-white dark:bg-slate-900 shadow-lg border-0 text-center">
            <p className="text-2xl font-bold text-amber-600">{data?.wallet?.lifetimeEarned || 0}</p>
            <p className="text-xs text-slate-400 mt-1">Lifetime Earned</p>
          </Card>
          <Card className="p-4 bg-white dark:bg-slate-900 shadow-lg border-0 text-center">
            <p className="text-2xl font-bold text-green-600">{data?.wallet?.lifetimeRedeemed || 0}</p>
            <p className="text-xs text-slate-400 mt-1">Points Redeemed</p>
          </Card>
        </div>

        {/* History */}
        <Card className="p-5 bg-white dark:bg-slate-900 shadow-lg border-0">
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
            <History className="w-5 h-5 text-slate-400" />
            Points History
          </h3>
          {data?.transactions?.length > 0 ? (
            <div className="space-y-2">
              {data.transactions.map((txn: any) => (
                <div key={txn.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${txn.type === "earn" ? "bg-green-100 dark:bg-green-900/30" : txn.type === "redeem" ? "bg-red-100 dark:bg-red-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`}>
                      {txn.type === "earn" ? <Star className="w-4 h-4 text-green-600" /> : txn.type === "redeem" ? <Gift className="w-4 h-4 text-red-600" /> : <Sparkles className="w-4 h-4 text-blue-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{txn.description}</p>
                      <p className="text-[10px] text-slate-400">{new Date(txn.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${txn.type === "earn" ? "text-green-600" : txn.type === "redeem" ? "text-red-500" : "text-blue-600"}`}>
                    {txn.type === "earn" ? "+" : "-"}{txn.points}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <Clock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No transactions yet</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
