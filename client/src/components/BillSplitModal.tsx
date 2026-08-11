import { useState } from "react";
import { Users, X, Calculator, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { nanoid } from "nanoid";

interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

interface BillSplitModalProps {
  open: boolean;
  onClose: () => void;
  totalAmount: number;
  cartItems?: CartItem[];
  submissionId?: string;
  onPayShare?: (shareAmount: number, personIndex: number) => Promise<void>;
}

type PaymentStatus = "pending" | "paid";

export default function BillSplitModal({
  open,
  onClose,
  totalAmount,
  cartItems = [],
  submissionId,
  onPayShare,
}: BillSplitModalProps) {
  const { fmtPrice } = useFormatCurrency();
  const [peopleCount, setPeopleCount] = useState(2);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 2 }, () => ""));
  const [paymentStatuses, setPaymentStatuses] = useState<PaymentStatus[]>(() =>
    Array.from({ length: 2 }, () => "pending")
  );

  // Recompute names/statuses arrays when peopleCount changes
  const setCount = (n: number) => {
    setPeopleCount(n);
    setNames((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("");
      while (next.length > n) next.pop();
      return next;
    });
    setPaymentStatuses((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("pending");
      while (next.length > n) next.pop();
      return next;
    });
  };

  const baseShare = Math.floor((totalAmount / peopleCount) * 100) / 100;
  const remainder = +(totalAmount - baseShare * peopleCount).toFixed(2);
  // First person absorbs the rounding remainder so the total adds up exactly.

  const handlePayShare = async (idx: number) => {
    if (onPayShare) {
      try {
        await onPayShare(idx === 0 ? +(baseShare + remainder).toFixed(2) : baseShare, idx);
        setPaymentStatuses((prev) => {
          const next = [...prev];
          next[idx] = "paid";
          return next;
        });
        toast.success(`Person ${idx + 1} paid their share`);
      } catch (err: any) {
        toast.error(err?.message || "Payment failed for this person");
      }
    } else {
      // Mark paid locally (calculator-only mode)
      setPaymentStatuses((prev) => {
        const next = [...prev];
        next[idx] = "paid";
        return next;
      });
    }
  };

  const allPaid = paymentStatuses.every((s) => s === "paid");
  const paidTotal = paymentStatuses.reduce((sum, s, idx) => {
    if (s !== "paid") return sum;
    return sum + (idx === 0 ? +(baseShare + remainder).toFixed(2) : baseShare);
  }, 0);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 relative space-y-4 max-h-[90vh] overflow-y-auto"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
         </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Calculator className="w-5 h-5" />
           </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Split Bill</h3>
              <p className="text-xs text-slate-500">Split equally or let each person pay separately</p>
           </div>
         </div>

          {/* Total */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Total</span>
            <span className="text-xl font-bold text-amber-600">
              {fmtPrice(totalAmount)}
           </span>
         </div>

          {/* Number of people */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
              Number of People
           </label>
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-2">
              <button
                disabled={peopleCount <= 1}
                onClick={() => setCount(peopleCount - 1)}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                -
             </button>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-lg font-bold text-slate-800">{peopleCount} guests</span>
             </div>
              <button
                onClick={() => setCount(Math.min(20, peopleCount + 1))}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                +
             </button>
           </div>
         </div>

          {/* Per-person list with pay buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
              Each Person Pays
           </label>
            {Array.from({ length: peopleCount }).map((_, idx) => {
              const amount = idx === 0 ? +(baseShare + remainder).toFixed(2) : baseShare;
              const paid = paymentStatuses[idx] === "paid";
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 p-3 rounded-xl border ${
                    paid
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex-1">
                    <Input
                      placeholder={`Person ${idx + 1}${idx === 0 ? " (gets extra Rs." + remainder.toFixed(2) + ")" : ""}`}
                      value={names[idx] || ""}
                      onChange={(e) => {
                        const next = [...names];
                        next[idx] = e.target.value;
                        setNames(next);
                      }}
                      className="h-8 text-sm"
                      disabled={paid}
                    />
                 </div>
                  <div className="text-sm font-bold text-slate-700 min-w-[80px] text-right">
                    {fmtPrice(amount)}
                 </div>
                  <button
                    onClick={() => handlePayShare(idx)}
                    disabled={paid}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${
                      paid
                        ? "bg-emerald-500 text-white cursor-default"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {paid ? (
                      <>
                        <Check className="w-3 h-3" /> Paid
                      </>
                    ) : (
                      <>Pay</>
                    )}
                 </button>
               </div>
              );
            })}
         </div>

          {/* Footer summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Collected</span>
              <span className="font-bold text-slate-900">{fmtPrice(paidTotal)}</span>
           </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Remaining</span>
              <span className="font-bold text-amber-600">{fmtPrice(+(totalAmount - paidTotal).toFixed(2))}</span>
           </div>
         </div>

          <Button
            onClick={onClose}
            className="w-full"
            variant={allPaid ? "default" : "outline"}
            disabled={!allPaid && paymentStatuses.some((s) => s === "paid")}
          >
            {allPaid ? "All Paid — Close" : "Close"}
         </Button>
       </motion.div>
     </div>
   </AnimatePresence>
  );
}

// Inline lightweight input to avoid an extra import; mirrors ui/input
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none ${props.className || ""}`}
    />
  );
}
