import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, ShoppingBag, ArrowRight, Star, Gift } from "lucide-react";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface OrderSuccessModalProps {
  open: boolean;
  orderNumber?: number | null;
  tableLabel?: string;
  total?: number;
  onContinue: () => void;
  onViewOrder?: () => void;
}

const AUTO_DISMISS_MS = 20000;

export default function OrderSuccessModal({
  open,
  orderNumber,
  tableLabel,
  total,
  onContinue,
  onViewOrder,
}: OrderSuccessModalProps) {
  const [countdown, setCountdown] = useState(Math.ceil(AUTO_DISMISS_MS / 1000));
  const [cancelled, setCancelled] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<{ discountPercent: number; code: string } | null>(null);
  const [spinsAwarded, setSpinsAwarded] = useState(0);
  const { fmtPrice } = useFormatCurrency();
  const cancelledRef = useRef(false);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;
  cancelledRef.current = cancelled;

  useEffect(() => {
    if (!open) return;
    setCountdown(Math.ceil(AUTO_DISMISS_MS / 1000));
    setCancelled(false);
    try {
      const pts = parseInt(sessionStorage.getItem("loyaltyPointsEarned") || "0", 10);
      if (pts > 0) setEarnedPoints(pts);
      const spins = parseInt(sessionStorage.getItem("loyaltySpinsAwarded") || "0", 10);
      if (spins > 0) setSpinsAwarded(spins);
      const coupon = sessionStorage.getItem("loyaltyAppliedCoupon");
      if (coupon) setAppliedCoupon(JSON.parse(coupon));
    } catch {}
    sessionStorage.removeItem("loyaltyPointsEarned");
    sessionStorage.removeItem("loyaltySpinsAwarded");
    sessionStorage.removeItem("loyaltyAppliedCoupon");
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          if (!cancelledRef.current) onContinueRef.current();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

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
                {orderNumber != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#8B7E72]">Order Number</span>
                    <span className="font-bold text-[#4A3428]">#{String(orderNumber).padStart(3, "0")}</span>
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
                    <span className="font-bold text-[#C08A4D]">{fmtPrice(total ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-[#8B7E72]">Estimated Time</span>
                  <span className="font-semibold text-[#4A3428]">15–20 min</span>
                </div>
              </motion.div>

              {/* Loyalty Points Earned */}
              {earnedPoints > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.55, duration: 0.3 }}
                  className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-[14px] p-4 mb-6"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Star className="w-4 h-4 text-amber-500" fill="currentColor" />
                    <span className="text-sm font-bold text-[#4A3428]">Loyalty Points Earned</span>
                  </div>
                  <p className="text-lg font-bold text-[#C08A4D]">+{earnedPoints} Points</p>
                </motion.div>
              )}

              {/* Lucky Spins Unlocked */}
              {spinsAwarded > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6, duration: 0.3 }}
                  className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/60 rounded-[14px] p-4 mb-6"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">🎰</span>
                    <span className="text-sm font-bold text-[#4A3428]">Lucky Spin Unlocked!</span>
                  </div>
                  <p className="text-lg font-bold text-orange-600">+{spinsAwarded} Lucky Spin{spinsAwarded !== 1 ? "s" : ""}</p>
                  <p className="text-[11px] text-[#8B7E72] mt-1">Spin the wheel to win rewards!</p>
                </motion.div>
              )}

              {/* Coupon Unlocked */}
              {appliedCoupon && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6, duration: 0.3 }}
                  className="bg-green-50 border border-green-200/60 rounded-[14px] p-4 mb-6"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Gift className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-bold text-green-700">Coupon Applied</span>
                  </div>
                  <p className="text-sm text-green-600">{appliedCoupon.discountPercent}% OFF — {appliedCoupon.code}</p>
                </motion.div>
              )}

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
                  {!cancelled && <span className="text-[#8B7E72] text-xs ml-1">({countdown}s)</span>}
                </button>
                {!cancelled && (
                  <button
                    onClick={() => setCancelled(true)}
                    className="w-full text-xs text-[#8B7E72] hover:text-[#4A3428] transition-colors py-1"
                  >
                    Stay on this page
                  </button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
