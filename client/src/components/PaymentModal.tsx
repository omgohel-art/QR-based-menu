import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CreditCard, Store, X } from "lucide-react";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSelectPayOnline: () => void;
  onSelectPayAtCounter: () => void;
  finalTotal: number;
}

export default function PaymentModal({ open, onClose, onSelectPayOnline, onSelectPayAtCounter, finalTotal }: PaymentModalProps) {
  const [selected, setSelected] = useState<"online" | "counter" | null>(null);

  const handleContinue = () => {
    if (selected === "online") {
      onSelectPayOnline();
    } else if (selected === "counter") {
      onSelectPayAtCounter();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">Choose Payment Method</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-sm font-medium text-slate-700">
                  Total: <span className="text-lg font-bold text-blue-600">₹{finalTotal.toFixed(2)}</span>
                </p>

                <button
                  onClick={() => setSelected("online")}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    selected === "online"
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      selected === "online" ? "bg-blue-500" : "bg-slate-100"
                    }`}>
                      <CreditCard className={`w-5 h-5 ${selected === "online" ? "text-white" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold ${selected === "online" ? "text-blue-700" : "text-slate-900"}`}>
                        Pay Online
                      </h3>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Pay securely using UPI, Card, Net Banking
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      selected === "online" ? "border-blue-500 bg-blue-500" : "border-slate-300"
                    }`}>
                      {selected === "online" && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSelected("counter")}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    selected === "counter"
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      selected === "counter" ? "bg-blue-500" : "bg-slate-100"
                    }`}>
                      <Store className={`w-5 h-5 ${selected === "counter" ? "text-white" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold ${selected === "counter" ? "text-blue-700" : "text-slate-900"}`}>
                        Pay at Counter
                      </h3>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Place your order now and pay after dining
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      selected === "counter" ? "border-blue-500 bg-blue-500" : "border-slate-300"
                    }`}>
                      {selected === "counter" && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex gap-3 p-5 border-t border-slate-100">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={!selected}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-500 text-white font-semibold hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
