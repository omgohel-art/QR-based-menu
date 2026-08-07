import { useState } from "react";
import { Users, X, Calculator, DollarSign, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

interface BillSplitModalProps {
  open: boolean;
  onClose: () => void;
  totalAmount: number;
  cartItems?: { name: string; price: number; quantity: number }[];
}

export default function BillSplitModal({ open, onClose, totalAmount, cartItems = [] }: BillSplitModalProps) {
  const { fmtPrice } = useFormatCurrency();
  const [peopleCount, setPeopleCount] = useState(2);
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");

  const perPersonAmount = totalAmount > 0 ? totalAmount / peopleCount : 0;

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 relative space-y-5"
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
              <h3 className="text-lg font-bold text-slate-900" style={{ fontFamily: "var(--font-caveat)", fontSize: "20px" }}>
                Split Bill Calculator
              </h3>
              <p className="text-xs text-slate-500">Calculate individual shares for table bill</p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setSplitMode("equal")}
              className={`flex-1 py-2 rounded-lg transition-all ${
                splitMode === "equal" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Split Equally
            </button>
          </div>

          {/* Equal Split Section */}
          {splitMode === "equal" && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Total Bill Amount</span>
                <span className="text-xl font-bold text-amber-600" style={{ fontFamily: "var(--font-caveat)" }}>
                  {fmtPrice(totalAmount)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                  Number of People
                </label>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-2">
                  <button
                    disabled={peopleCount <= 1}
                    onClick={() => setPeopleCount(p => Math.max(1, p - 1))}
                    className="w-10 h-10 rounded-xl bg-white border border-slate-200 font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition-colors"
                  >
                    -
                  </button>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-lg font-bold text-slate-800">{peopleCount} guests</span>
                  </div>
                  <button
                    onClick={() => setPeopleCount(p => Math.min(20, p + 1))}
                    className="w-10 h-10 rounded-xl bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Per Person Result */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 text-center space-y-1">
                <p className="text-xs text-amber-700 font-medium">Each Person Pays</p>
                <p className="text-3xl font-extrabold text-amber-800" style={{ fontFamily: "var(--font-caveat)" }}>
                  {fmtPrice(perPersonAmount)}
                </p>
                <p className="text-[11px] text-amber-600/80">
                  {peopleCount} × {fmtPrice(perPersonAmount)} = {fmtPrice(totalAmount)}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-colors"
          >
            Done
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
