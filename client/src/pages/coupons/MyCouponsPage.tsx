import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  Copy,
  Check,
  Gift,
  Sparkles,
  Clock,
  AlertTriangle,
  Phone,
  Tag,
  Percent,
  Coffee,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

interface Coupon {
  id: number;
  walletId: number;
  code: string;
  discountPercent: number;
  status: "active" | "used" | "expired";
  redeemedAt: string | null;
  redeemedOrderId: string | null;
  expiresAt: string;
  createdAt: string;
  source: "loyalty" | "spin";
  rewardType: string;
  rewardLabel: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getStatusColor(status: string): "default" | "secondary" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "used":
      return "secondary";
    case "expired":
      return "destructive";
    default:
      return "secondary";
  }
}

function getStatusBgClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "used":
      return "bg-gray-500/15 text-gray-400 border-gray-500/20";
    case "expired":
      return "bg-red-500/15 text-red-400 border-red-500/20";
    default:
      return "";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Unused";
    case "used":
      return "Used";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function getSourceConfig(source: string) {
  if (source === "spin") {
    return {
      label: "Lucky Spin",
      icon: Sparkles,
      className: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
    };
  }
  return {
    label: "Loyalty",
    icon: Tag,
    className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  };
}

function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false);
  const daysLeft = daysUntil(coupon.expiresAt);
  const isExpiringSoon = daysLeft > 0 && daysLeft <= 7;

  const copyCode = () => {
    navigator.clipboard.writeText(coupon.code);
    setCopied(true);
    toast.success("Coupon code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const sourceConfig = getSourceConfig(coupon.source);
  const SourceIcon = sourceConfig.icon;

  const isActive = coupon.status === "active";
  const isUsed = coupon.status === "used";
  const isExpired = coupon.status === "expired";

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl border transition-all duration-300
        ${
          isActive
            ? "bg-gradient-to-br from-gray-900/80 via-gray-900/60 to-gray-950/80 border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5"
            : isUsed
            ? "bg-gradient-to-br from-gray-900/50 via-gray-900/30 to-gray-950/50 border-gray-700/30 opacity-60"
            : "bg-gradient-to-br from-gray-900/40 via-gray-900/20 to-gray-950/40 border-gray-700/20 opacity-50"
        }
      `}
    >
      <div className="p-5">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`
                flex items-center justify-center w-10 h-10 rounded-xl
                ${
                  isActive
                    ? "bg-emerald-500/15"
                    : isUsed
                    ? "bg-gray-500/15"
                    : "bg-red-500/10"
                }
              `}
            >
              {coupon.rewardType === "discount" ? (
                <Percent
                  className={`
                    w-5 h-5
                    ${isActive ? "text-emerald-400" : isUsed ? "text-gray-400" : "text-red-400"}
                  `}
                />
              ) : (
                <Coffee
                  className={`
                    w-5 h-5
                    ${isActive ? "text-emerald-400" : isUsed ? "text-gray-400" : "text-red-400"}
                  `}
                />
              )}
            </div>
            <div>
              <p
                className={`
                  text-sm font-semibold
                  ${isActive ? "text-emerald-300" : isUsed ? "text-gray-400" : "text-red-300"}
                `}
              >
                {coupon.rewardLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Source Badge */}
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                ${sourceConfig.className}
              `}
            >
              <SourceIcon className="w-3 h-3" />
              {sourceConfig.label}
            </span>

            {/* Status Badge */}
            <Badge className={`text-[10px] border ${getStatusBgClass(coupon.status)}`}>
              {getStatusLabel(coupon.status)}
            </Badge>
          </div>
        </div>

        {/* Expiry Warning */}
        {isActive && isExpiringSoon && (
          <div className="flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-medium text-amber-400">
              Expiring in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Coupon Code */}
        <div
          className={`
            flex items-center justify-between px-4 py-3 rounded-xl mb-3
            ${isActive ? "bg-gray-800/50 border border-gray-700/30" : "bg-gray-800/20 border border-gray-700/15"}
          `}
        >
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-gray-500" />
            <span
              className={`
                font-mono text-base tracking-wider font-bold
                ${isActive ? "text-gray-100" : "text-gray-400"}
              `}
            >
              {coupon.code}
            </span>
          </div>
          <button
            onClick={copyCode}
            className={`
              p-1.5 rounded-lg transition-all
              ${
                isActive
                  ? "hover:bg-gray-700/50 text-gray-400 hover:text-gray-200"
                  : "text-gray-500"
              }
            `}
            title="Copy code"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Dates */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock className="w-3 h-3" />
            <span>Created {formatDate(coupon.createdAt)}</span>
          </div>
          <div
            className={`
              flex items-center gap-1.5
              ${isActive && isExpiringSoon ? "text-amber-400" : "text-gray-500"}
            `}
          >
            <span>
              {isActive
                ? `Expires ${formatDate(coupon.expiresAt)}`
                : isUsed && coupon.redeemedAt
                ? `Redeemed ${formatDate(coupon.redeemedAt)}`
                : `Expired ${formatDate(coupon.expiresAt)}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyCouponsPage() {
  const [, params] = useRoute("/table/:tableCode/coupons");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const [phoneInput, setPhoneInput] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "expiring">("newest");

  const [phone, setPhone] = useState(() => {
    try { return localStorage.getItem(`cafe-customer-phone-${tableCode}`) || ""; } catch { return ""; }
  });
  const hasStoredPhone = !!phone;
  const [isVerified, setIsVerified] = useState(hasStoredPhone);

  const { data: coupons, isLoading, error } = useQuery<Coupon[]>({
    queryKey: ["my-coupons", phone],
    queryFn: async () => {
      const res = await fetch(`/api/loyalty/my-coupons/${phone}`);
      if (!res.ok) throw new Error("Failed to fetch coupons");
      return res.json();
    },
    enabled: !!phone && isVerified,
  });

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      toast.error("Please enter your phone number");
      return;
    }
    localStorage.setItem(`cafe-customer-phone-${tableCode}`, trimmed);
    setPhone(trimmed);
    setIsVerified(true);
  };

  const filteredCoupons = useMemo(() => {
    if (!coupons) return [];
    let filtered = [...coupons];

    if (activeTab === "unused") filtered = filtered.filter((c) => c.status === "active");
    if (activeTab === "used") filtered = filtered.filter((c) => c.status === "used");
    if (activeTab === "expired") filtered = filtered.filter((c) => c.status === "expired");

    if (sortBy === "newest") {
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      filtered.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    }

    return filtered;
  }, [coupons, activeTab, sortBy]);

  const unusedCount = coupons?.filter((c) => c.status === "active").length ?? 0;
  const usedCount = coupons?.filter((c) => c.status === "used").length ?? 0;
  const expiredCount = coupons?.filter((c) => c.status === "expired").length ?? 0;

  /* --- Phone Verification Screen --- */
  if (!isVerified) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
           <button
             onClick={() => navigate(tableCode ? `/table/${tableCode}` : "/")}
             className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors mb-8 text-sm"
           >
             <ArrowLeft className="w-4 h-4" />
             Back to Menu
           </button>

          <Card className="p-8 bg-gray-900/80 border-gray-800">
            <div className="flex flex-col items-center mb-8">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 mb-4">
                <Gift className="w-8 h-8 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-100 mb-1">My Coupons</h1>
              <p className="text-sm text-gray-500 text-center">
                Enter your phone number to view your rewards
              </p>
            </div>

            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  type="tel"
                  placeholder="Phone number"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="pl-10 bg-gray-800/50 border-gray-700/50 text-gray-100 placeholder-gray-600"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                View My Coupons
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  /* --- Main Coupons Screen --- */
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate(tableCode ? `/table/${tableCode}` : "/")}
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-400" />
              <h1 className="text-lg font-bold text-gray-100">My Coupons</h1>
            </div>
            <div className="w-12" />
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortBy("newest")}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${
                  sortBy === "newest"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                }
              `}
            >
              Newest First
            </button>
            <button
              onClick={() => setSortBy("expiring")}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${
                  sortBy === "expiring"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                }
              `}
            >
              Expiring Soon
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-8 pt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-gray-900/80 border border-gray-800/50 p-1 rounded-xl mb-6">
            <TabsTrigger
              value="all"
              className="flex-1 text-xs data-[state=active]:bg-gray-800 data-[state=active]:text-gray-100"
            >
              All ({coupons?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger
              value="unused"
              className="flex-1 text-xs data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-400"
            >
              Unused ({unusedCount})
            </TabsTrigger>
            <TabsTrigger
              value="used"
              className="flex-1 text-xs data-[state=active]:bg-gray-800 data-[state=active]:text-gray-100"
            >
              Used ({usedCount})
            </TabsTrigger>
            <TabsTrigger
              value="expired"
              className="flex-1 text-xs data-[state=active]:bg-red-500/15 data-[state=active]:text-red-400"
            >
              Expired ({expiredCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            {/* Loading */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Loading your coupons...</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-lg font-semibold text-gray-200 mb-1">Something went wrong</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Could not load your coupons. Please try again.
                </p>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  Try Again
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && filteredCoupons.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gray-800/50 flex items-center justify-center mb-5">
                  <Gift className="w-10 h-10 text-gray-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-200 mb-2">
                  {activeTab === "all"
                    ? "No coupons yet"
                    : activeTab === "unused"
                    ? "No unused coupons"
                    : activeTab === "used"
                    ? "No used coupons"
                    : "No expired coupons"}
                </h2>
                <p className="text-sm text-gray-500 max-w-xs mb-6">
                  {activeTab === "all"
                    ? "Start earning rewards by placing orders or trying your luck on the Lucky Spin!"
                    : "Try a different filter to see other coupons."}
                </p>
                {activeTab === "all" && (
                  <button
                    onClick={() => navigate(tableCode ? `/table/${tableCode}` : "/")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    Earn Rewards
                  </button>
                )}
              </div>
            )}

            {/* Coupon List */}
            {!isLoading && !error && filteredCoupons.length > 0 && (
              <div className="space-y-3">
                {filteredCoupons.map((coupon) => (
                  <CouponCard key={coupon.id} coupon={coupon} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
