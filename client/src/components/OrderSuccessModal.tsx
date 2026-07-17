import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, ShoppingBag, ArrowRight } from "lucide-react";

interface OrderSuccessModalProps {
  open: boolean;
  orderId?: number | null;
  tableLabel?: string;
  total?: number;
  onContinue: () => void;
  onViewOrder?: () => void;
}

const AUTO_DISMISS_MS = 8000;

export default function OrderSuccessModal({
  open,
  orderId,
  tableLabel,
  total,
  onContinue,
  onViewOrder,
}: OrderSuccessModalProps) {
  const [countdown, setCountdown] = useState(Math.ceil(AUTO_DISMISS_MS / 1000));

  useEffect(() => {
    if (!open) return;
    setCountdown(Math.ceil(AUTO_DISMISS_MS / 1000));
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          onContinue();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, onContinue]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(74, 52, 40, 0.4)", backdropFilter: "blur(6px)" }}
          onClick={onContinue}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 26, mass: 0.8 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[24px] shadow-[0_20px_60px_rgba(74,52,40,0.2)] w-full max-w-sm overflow-hidden"
          >
            {/* Top accent bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#C08A4D] via-[#d4a76a] to-[#C08A4D]" />

            <div className="px-6 pt-8 pb-6 text-center">
              {/* Animated checkmark */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 250, damping: 18, delay: 0.15 }}
                className="w-20 h-20 mx-auto rounded-full bg-[#C08A4D]/10 flex items-center justify-center mb-5"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.35, type: "spring", stiffness: 300, damping: 15 }}
                >
                  <CheckCircle className="w-10 h-10 text-[#C08A4D]" strokeWidth={2} />
                </motion.div>
              </motion.div>

              {/* Title */}
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
                className="text-xl font-bold text-[#4A3428] mb-1.5"
              >
                Order Placed Successfully!
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                className="text-base text-[#8B7E72] mb-6 font-caveat"
              >
                Your order has been sent to the kitchen.
              </motion.p>

              {/* Order details */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.3 }}
                className="bg-[#F8F4EC] rounded-[16px] p-4 mb-6 space-y-2.5"
              >
                {orderId != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8B7E72]">Order Number</span>
                    <span className="font-bold text-[#4A3428]">#{String(orderId).padStart(3, "0")}</span>
                  </div>
                )}
                {tableLabel && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8B7E72]">Table</span>
                    <span className="font-semibold text-[#4A3428]">{tableLabel}</span>
                  </div>
                )}
                {total != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8B7E72]">Amount</span>
                    <span className="font-bold text-[#C08A4D]">{"\u20B9"}{total.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[#8B7E72]">Estimated Time</span>
                  <span className="font-semibold text-[#4A3428]">15–20 min</span>
                </div>
              </motion.div>

              {/* Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.3 }}
                className="space-y-2.5"
              >
                {onViewOrder && (
                  <button
                    onClick={onViewOrder}
                    className="w-full py-3 px-5 rounded-[14px] bg-[#4A3428] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#4A3428]/90 transition-colors"
                  >
                    View Order
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onContinue}
                  className="w-full py-3 px-5 rounded-[14px] border border-[#E8E0D4] text-[#4A3428] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#F8F4EC] transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Continue Browsing
                  <span className="text-[#8B7E72] text-xs ml-1">({countdown}s)</span>
                </button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
