import { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle, ShoppingBag, ArrowRight } from "lucide-react";
import Footer from "@/components/marketing/Footer";

interface SuccessState {
  tableCode: string;
  orderId?: number;
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

const AUTO_DISMISS_MS = 8000;

export default function OrderSuccessPage() {
  const [, params] = useRoute("/table/:tableCode/payment/success");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const [state, setState] = useState<SuccessState | null>(null);
  const [countdown, setCountdown] = useState(Math.ceil(AUTO_DISMISS_MS / 1000));

  useEffect(() => {
    const s = getSuccessState();
    if (s && s.tableCode === tableCode) {
      setState(s);
    }
  }, [tableCode]);

  const handleContinue = useCallback(() => {
    sessionStorage.removeItem("paymentSuccess");
    navigate(`/table/${tableCode}`, { replace: true });
  }, [tableCode, navigate]);

  useEffect(() => {
    if (!state) return;
    setCountdown(Math.ceil(AUTO_DISMISS_MS / 1000));
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          handleContinue();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state, handleContinue]);

  return (
    <div className="min-h-screen bg-[#F8F4EC] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-6">
          {/* Animated checkmark */}
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

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.35 }}
          >
            <h1 className="text-2xl font-bold text-[#4A3428]">Payment Successful!</h1>
            <p className="text-[#8B7E72] mt-2 font-caveat text-lg">Your order has been sent to the kitchen.</p>
          </motion.div>

          {/* Order details card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.35 }}
            className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-2.5 text-left"
          >
            {state?.orderId != null && (
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7E72]">Order Number</span>
                <span className="font-bold text-[#4A3428]">#{String(state.orderId).padStart(3, "0")}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-[#8B7E72]">Amount Paid</span>
              <span className="font-semibold text-[#C08A4D]">{"\u20B9"}{state?.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8B7E72]">Payment Status</span>
              <span className="inline-flex items-center gap-1 text-[#C08A4D] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#C08A4D]" />
                Paid
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8B7E72]">Estimated Time</span>
              <span className="font-semibold text-[#4A3428]">15–20 min</span>
            </div>
          </motion.div>

          {/* Info box */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="bg-[#F8F4EC] border border-[#E8E0D4] rounded-[14px] p-4 text-sm text-[#4A3428]"
          >
            Your order has been sent to the kitchen. You&apos;ll be notified when it&apos;s ready.
          </motion.div>

          {/* Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            className="space-y-2.5"
          >
            <button
              onClick={handleContinue}
              className="w-full py-3 px-6 rounded-[14px] bg-[#4A3428] hover:bg-[#4A3428]/90 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              Continue Browsing
            </button>
            <button
              onClick={handleContinue}
              className="w-full py-3 px-6 rounded-[14px] border border-[#E8E0D4] text-[#4A3428] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#F8F4EC] transition-colors"
            >
              Auto-close in {countdown}s
            </button>
          </motion.div>
        </div>
      </div>
      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}
