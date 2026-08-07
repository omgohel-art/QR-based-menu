import { useState } from "react";
import { Bell, Droplets, Receipt, Sparkles, X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface CallWaiterButtonProps {
  tableCode?: string;
}

export default function CallWaiterButton({ tableCode }: CallWaiterButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<string | null>(null);

  const requestOptions = [
    { type: "waiter", label: "Call Waiter", icon: Bell, color: "bg-amber-500 text-white" },
    { type: "water", label: "Bring Water", icon: Droplets, color: "bg-blue-500 text-white" },
    { type: "bill", label: "Request Bill", icon: Receipt, color: "bg-emerald-500 text-white" },
    { type: "clean", label: "Clean Table", icon: Sparkles, color: "bg-purple-500 text-white" },
  ];

  const handleSendRequest = async (type: string, label: string) => {
    if (!tableCode) return;
    setLoadingType(type);
    try {
      const res = await fetch("/api/public/call-waiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableCode, requestType: type, requestLabel: label }),
      });

      if (res.ok) {
        toast.success(`Staff notified: ${label}!`, {
          description: "A waiter will be with you shortly.",
        });
        setIsOpen(false);
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error || "Failed to notify staff. Please try again.");
      }
    } catch {
      toast.error("Failed to notify staff. Please check your connection and try again.");
    } finally {
      setLoadingType(null);
    }
  };

  if (!tableCode) return null;

  return (
    <>
      {/* Floating Bell Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium px-4 py-3 rounded-full shadow-lg shadow-orange-500/25 border border-white/20 backdrop-blur-md"
        style={{ fontFamily: "var(--font-caveat, sans-serif)", fontSize: "16px" }}
      >
        <Bell className="w-5 h-5 animate-pulse" />
        <span>Call Staff</span>
      </motion.button>

      {/* Service Request Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-amber-100 relative space-y-4"
            >
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center space-y-1">
                <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
                  <Bell className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-800" style={{ fontFamily: "var(--font-caveat, sans-serif)" }}>
                  Need Assistance?
                </h3>
                <p className="text-xs text-slate-500">Tap below to alert the staff at your table instantly</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {requestOptions.map((opt) => {
                  const IconComponent = opt.icon;
                  const isSubmitting = loadingType === opt.type;
                  return (
                    <button
                      key={opt.type}
                      disabled={loadingType !== null}
                      onClick={() => handleSendRequest(opt.type, opt.label)}
                      className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 transition-all group active:scale-95"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-transform group-hover:scale-110 ${opt.color}`}>
                        {isSubmitting ? <Check className="w-5 h-5 animate-bounce" /> : <IconComponent className="w-5 h-5" />}
                      </div>
                      <span className="text-xs font-semibold text-slate-700 group-hover:text-amber-800" style={{ fontFamily: "var(--font-caveat, sans-serif)", fontSize: "15px" }}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
