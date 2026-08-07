import { useEffect, useState, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { CheckCircle, ShoppingBag, Clock, ChefHat, Utensils, ChevronDown, ChevronUp, Receipt, ArrowRight, Star } from "lucide-react";
import Footer from "@/components/marketing/Footer";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { calculatePoints } from "@/hooks/useLoyalty";

interface SuccessState {
  tableCode: string;
  orderId?: number;
  orderNumber?: number;
  total: number;
}

function getSuccessState(): SuccessState | null {
  try {
    const raw = sessionStorage.getItem("paymentSuccess");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const STATUS_ORDER: Record<string, number> = {
  received: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
  settled: 4,
};

const STATUS_STEPS = [
  { key: "received", label: "Order Received", icon: Clock },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready to Serve", icon: Utensils },
  { key: "delivered", label: "Served", icon: CheckCircle },
];

const AUTO_DISMISS_MS = 20000;

export default function OrderSuccessPage() {
  const [, params] = useRoute("/table/:tableCode/payment/success");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const [state, setState] = useState<SuccessState | null>(null);
  const [countdown, setCountdown] = useState(Math.ceil(AUTO_DISMISS_MS / 1000));
  const [showBill, setShowBill] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const cancelledRef = useRef(false);
  const { fmtPrice } = useFormatCurrency();
  cancelledRef.current = cancelled;

  useEffect(() => {
    const s = getSuccessState();
    if (s && s.tableCode === tableCode) {
      setState(s);
    } else if (!s || s.tableCode !== tableCode) {
      navigate(`/table/${tableCode || ""}`, { replace: true });
    }
  }, [tableCode, navigate]);

  const { data: orderStatus } = useQuery({
    queryKey: ["orderStatus", state?.orderId],
    enabled: !!state?.orderId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("orderStatus, submittedAt")
        .eq("id", state!.orderId)
        .single();
      return data as { orderStatus: string; submittedAt: string } | null;
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ["orderBill", state?.orderId],
    enabled: !!state?.orderId,
    queryFn: async () => {
      const { data: items } = await supabase
        .from("orderItems")
        .select("menuItemId, quantity, priceAtOrderTime")
        .eq("orderId", state!.orderId);
      if (!items || items.length === 0) return [];
      const menuIds = Array.from(new Set(items.map(i => i.menuItemId)));
      const { data: menuItems } = await supabase
        .from("menuItems")
        .select("id, name")
        .in("id", menuIds);
      const nameMap = new Map((menuItems || []).map(m => [m.id, m.name]));
      return items.map(i => ({
        name: nameMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
        qty: i.quantity,
        price: parseFloat(i.priceAtOrderTime.toString()),
      }));
    },
  });

  const itemSubtotal = orderItems?.reduce((s, i) => s + i.price * i.qty, 0) || 0;

  const handleContinue = useCallback(() => {
    sessionStorage.removeItem("paymentSuccess");
    navigate(`/table/${tableCode}`, { replace: true });
  }, [tableCode, navigate]);

  const handleViewOrder = useCallback(() => {
    cancelledRef.current = true;
    if (state?.orderId) {
      navigate(`/table/${tableCode}/order/${state.orderId}`, { replace: true });
    }
  }, [state?.orderId, tableCode, navigate]);

  const currentStatus = orderStatus?.orderStatus || "received";
  const currentIdx = STATUS_ORDER[currentStatus] ?? 0;

  useEffect(() => {
    if (!state) return;
    setCountdown(Math.ceil(AUTO_DISMISS_MS / 1000));
    setCancelled(false);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          if (!cancelledRef.current) handleContinue();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state, handleContinue]);

  if (!state) return <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center"><div className="animate-pulse text-[#8B7E72]">Loading...</div></div>;

  return (
    <div className="min-h-screen bg-[#F8F4EC] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-sm w-full text-center space-y-6">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 250, damping: 18, delay: 0.1 }}
            className="w-20 h-20 mx-auto rounded-full bg-[#C08A4D]/10 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 15 }}
            >
              <CheckCircle className="w-10 h-10 text-[#C08A4D]" strokeWidth={2} />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.35 }}
          >
            <h1 className="text-2xl font-bold text-[#4A3428]">Order Placed!</h1>
            <p className="text-[#8B7E72] mt-2">Your order is being prepared.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.35 }}
            className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-2.5 text-left"
          >
            {(() => {
              const displayOrder = state?.orderNumber ?? state?.orderId;
              return displayOrder != null ? (
                <div className="flex justify-between text-sm">
                  <span className="text-[#8B7E72]">Order Number</span>
                  <span className="font-bold text-[#4A3428]">#{String(displayOrder).padStart(3, "0")}</span>
                </div>
              ) : null;
            })()}
            <div className="flex justify-between text-sm">
              <span className="text-[#8B7E72]">Amount</span>
              <span className="font-semibold text-[#C08A4D]">{fmtPrice(state?.total ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8B7E72]">Status</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {STATUS_STEPS[currentIdx]?.label || "Processing"}
              </span>
            </div>
          </motion.div>

          {/* Loyalty Points Earned */}
          {(() => {
            const pts = calculatePoints(state?.total ?? 0);
            if (pts <= 0) return null;
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.35 }}
                className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-[20px] p-5 text-left"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-5 h-5 text-amber-500" fill="currentColor" />
                  <h3 className="text-sm font-bold text-[#4A3428]">Loyalty Points Earned</h3>
                </div>
                <p className="text-xl font-bold text-[#C08A4D]" style={{ fontFamily: "var(--font-caveat)" }}>+{pts} Points</p>
                <p className="text-[11px] text-[#8B7E72] mt-1">Points have been added to your wallet.</p>
              </motion.div>
            );
          })()}

          {/* Bill Details */}
          {orderItems && orderItems.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.35 }}
            >
              <button
                onClick={() => setShowBill(!showBill)}
                className="w-full flex items-center justify-between bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#C08A4D]" />
                  <span className="text-sm font-semibold text-[#4A3428]">View Bill</span>
                </div>
                {showBill ? <ChevronUp className="w-4 h-4 text-[#8B7E72]" /> : <ChevronDown className="w-4 h-4 text-[#8B7E72]" />}
              </button>
              {showBill && (
                <div className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 mt-2 text-left space-y-3">
                  <div className="space-y-2 divide-y divide-[#E8E0D4]/40">
                    {orderItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm pt-2 first:pt-0">
                        <div className="flex-1 min-w-0">
                          <span className="text-[#4A3428] font-medium">{item.name}</span>
                          <span className="text-[#8B7E72] ml-1">×{item.qty}</span>
                        </div>
                        <span className="text-[#4A3428] font-semibold ml-3">{fmtPrice(item.price * item.qty)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-[#E8E0D4] pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8B7E72]">Subtotal</span>
                      <span className="text-[#4A3428]">{fmtPrice(itemSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-[#4A3428]">Total</span>
                      <span className="text-[#C08A4D]">{fmtPrice(state?.total ?? 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Status Tracker */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.35 }}
            className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5"
          >
            <div className="flex items-center justify-between">
              {STATUS_STEPS.map((step, i) => {
                const StepIcon = step.icon;
                const isActive = i <= currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={step.key} className="flex flex-col items-center gap-1.5 flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isActive
                          ? isCurrent
                            ? "bg-[#C08A4D] text-white scale-110 shadow-md"
                            : "bg-emerald-100 text-emerald-600"
                          : "bg-slate-100 text-slate-300"
                      }`}
                    >
                      <StepIcon className="w-4 h-4" />
                    </div>
                    <span className={`text-[9px] font-medium text-center leading-tight ${
                      isActive ? "text-[#4A3428]" : "text-slate-300"
                    }`}>
                      {step.label}
                    </span>
                    {i < STATUS_STEPS.length - 1 && (
                      <div
                        className={`absolute h-0.5 w-full top-4 -right-1/2 ${
                          i < currentIdx ? "bg-emerald-400" : "bg-slate-200"
                        }`}
                        style={{ display: "none" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${((currentIdx) / (STATUS_STEPS.length - 1)) * 100}%` }}
              />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            className="bg-amber-50 border border-amber-200 rounded-[14px] p-4 text-sm text-amber-800"
          >
            Your order has been sent to the kitchen. Track the progress above in real-time.
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.3 }}
            className="space-y-2.5"
          >
            <button
              onClick={handleViewOrder}
              className="w-full py-3 px-6 rounded-[14px] bg-[#4A3428] hover:bg-[#4A3428]/90 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              View Order
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleContinue}
              className="w-full py-3 px-6 rounded-[14px] border border-[#E8E0D4] text-[#4A3428] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#F8F4EC] transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              {cancelled ? "Continue Browsing" : `Continue Browsing (${countdown}s)`}
            </button>
            {!cancelled && (
              <button
                onClick={() => setCancelled(true)}
                className="w-full text-xs text-[#8B7E72] hover:text-[#4A3428] transition-colors"
              >
                Stay on this page
              </button>
            )}
          </motion.div>
        </div>
      </div>

      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}
