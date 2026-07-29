import { useState, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed, CreditCard, ImageOff, User, Phone } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import Footer from "@/components/marketing/Footer";
import PaymentModal from "@/components/PaymentModal";
import OrderSuccessModal from "@/components/OrderSuccessModal";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

export default function CartPage() {
  const [, params] = useRoute("/table/:tableCode/cart");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { cart, cartTotal, cartItemCount, updateQuantity, removeFromCart, clearCart, setTableCode } = useCart();
  const { fmtPrice } = useFormatCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceToken] = useState(() => nanoid(16));
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successOrderNumber, setSuccessOrderNumber] = useState<number | null>(null);
  const [successTotal, setSuccessTotal] = useState(0);
  const [itemNotes, setItemNotes] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem(`cafe-item-notes-${tableCode}`) || "{}"); } catch { return {}; }
  });

  const [customerName, setCustomerName] = useState(() => {
    try { return localStorage.getItem(`cafe-customer-name-${tableCode}`) || ""; } catch { return ""; }
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    try { return localStorage.getItem(`cafe-customer-phone-${tableCode}`) || ""; } catch { return ""; }
  });
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => { localStorage.setItem(`cafe-item-notes-${tableCode}`, JSON.stringify(itemNotes)); }, [itemNotes, tableCode]);
  useEffect(() => { localStorage.setItem(`cafe-customer-name-${tableCode}`, customerName); }, [customerName, tableCode]);
  useEffect(() => { localStorage.setItem(`cafe-customer-phone-${tableCode}`, customerPhone); }, [customerPhone, tableCode]);

  const sanitizePhone = (raw: string): string => {
    let digits = raw.replace(/[\s\-\(\)\+]/g, "");
    if (digits.startsWith("00")) digits = digits.substring(2);
    if (!digits.startsWith("91") && digits.length === 10) digits = "91" + digits;
    return digits;
  };

  const validateCustomerInfo = (): boolean => {
    let valid = true;
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (!trimmedName) {
      setNameError("Please enter your name");
      valid = false;
    } else if (trimmedName.length > 128) {
      setNameError("Name is too long");
      valid = false;
    } else {
      setNameError("");
    }

    if (!trimmedPhone) {
      setPhoneError("Please enter your phone number");
      valid = false;
    } else {
      const sanitized = sanitizePhone(trimmedPhone);
      if (!/^\d{10,15}$/.test(sanitized)) {
        setPhoneError("Enter a valid 10-digit Indian mobile number");
        valid = false;
      } else {
        setPhoneError("");
      }
    }

    return valid;
  };

  useEffect(() => { if (tableCode) setTableCode(tableCode); }, [tableCode, setTableCode]);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["cartSession", tableCode],
    enabled: !!tableCode,
    queryFn: async () => {
      const { data: tableData } = await supabase
        .from("tables")
        .select("*")
        .eq("tableCode", tableCode)
        .single();
      if (!tableData) throw new Error("Table not found");

      const { data: sessionData } = await supabase
        .from("sessions")
        .select("*")
        .eq("tableId", tableData.id)
        .eq("status", "open")
        .maybeSingle();

      if (!sessionData) {
        const { data: settledSession } = await supabase
          .from("sessions")
          .select("status")
          .eq("tableId", tableData.id)
          .order("createdAt", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (settledSession) {
          throw new Error("Your previous session has ended. Please scan the QR code again to start fresh.");
        }
        throw new Error("No active session at this table. Please scan the QR code to get started.");
      }

      return {
        id: sessionData.id,
        tableLabel: tableData.label,
        subtotal: sessionData.subtotal,
      };
    },
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["cartSettings"],
    queryFn: async () => {
      const biz = await fetch("/api/public/business-settings").then((r) => r.json());
      const gstEnabled = biz?.gstEnabled ?? false;
      const gstRate = gstEnabled ? parseFloat(biz?.gstRate?.toString() || "0") : 0;
      return {
        serviceChargePercentage: biz ? parseFloat(biz.serviceChargePercentage?.toString() || "0") : 0,
        gstEnabled,
        gstRate,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  const serviceCharge = cartTotal * ((settings?.serviceChargePercentage || 0) / 100);
  const taxableAmount = settings?.gstEnabled ? cartTotal + serviceCharge : 0;
  const taxAmount = taxableAmount * ((settings?.gstRate || 0) / 100);
  const finalTotal = cartTotal + serviceCharge + taxAmount;

  const dismissSuccessModal = useCallback(() => {
    setShowSuccessModal(false);
    navigate(`/table/${tableCode}`);
  }, [tableCode, navigate]);

  // Prices come from the cart itself, no separate menu query needed
  const submitOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { tableCode, items, submissionId, deviceToken, customerName, customerPhone } = payload;

      const res = await fetch("/api/order/counter-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableCode, items, submissionId, deviceToken, customerName, customerPhone }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit order");
      return data;
    },
    onSuccess: (_data, variables) => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["cartSession", tableCode] });
      setSuccessOrderNumber(_data?.orderNumber ?? _data?.orderId ?? null);
      setSuccessTotal(finalTotal);
      setShowSuccessModal(true);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to place order");
    },
  });

  const handleSubmitOrder = async (payMethod: "counter" | "online") => {
    if (cart.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (!validateCustomerInfo()) return;

    const sanitizedPhone = sanitizePhone(customerPhone.trim());
    const trimmedName = customerName.trim();

    if (payMethod === "online") {
      const paymentState = {
        tableCode: tableCode || "",
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          notes: itemNotes[item.menuItemId] || null,
        })),
        subtotal: cartTotal,
        serviceCharge: serviceCharge,
        taxAmount: taxAmount,
        finalTotal: finalTotal,
        serviceChargePercentage: settings?.serviceChargePercentage || 0,
        gstRate: settings?.gstRate || 0,
        gstEnabled: settings?.gstEnabled || false,
        customerName: trimmedName,
        customerPhone: sanitizedPhone,
        savedAt: Date.now(),
      };
      sessionStorage.setItem("paymentState", JSON.stringify(paymentState));
      navigate(`/table/${tableCode}/payment`);
      return;
    }

    setIsSubmitting(true);
    try {
      await submitOrderMutation.mutateAsync({
        tableCode: tableCode || "",
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: itemNotes[item.menuItemId] || null,
        })),
        submissionId: nanoid(),
        deviceToken,
        customerName: trimmedName,
        customerPhone: sanitizedPhone,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!tableCode) {
    return (
      <div className="min-h-screen bg-menu-bg flex items-center justify-center px-4">
        <div className="text-center max-w-sm space-y-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-menu-primary mb-1">Invalid table</p>
            <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl">Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (sessionLoading || settingsLoading) {
    return (
      <div className="min-h-screen bg-menu-bg flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-slate-300 dark:border-slate-600 border-t-slate-900 dark:border-t-white rounded-full animate-spin" />
          <p className="text-sm text-menu-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-menu-bg">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-menu-bg/90 backdrop-blur-lg border-b border-menu-border/60">
        <div className="max-w-lg mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.93 }}
                transition={{ duration: 0.1, ease: "easeIn" }}
                onClick={() => navigate(`/table/${tableCode}`)}
                className="w-9 h-9 flex items-center justify-center rounded-[12px] text-menu-muted hover:text-menu-primary hover:bg-menu-border/30 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </motion.button>
              <h1 className="text-xl font-bold text-menu-primary" style={{ fontFamily: "var(--font-caveat)" }}>Cart</h1>
            </div>
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-menu-muted" />
              <span className="font-semibold text-menu-primary">{cartItemCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        {cart.length === 0 ? (
          <div className="text-center py-20 space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-menu-border/20 flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-menu-muted/50" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-menu-primary" style={{ fontFamily: "var(--font-caveat)" }}>Your cart is empty</h2>
              <p className="text-sm text-menu-muted" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Add some items from the menu</p>
            </div>
            <Button
              onClick={() => navigate(`/table/${tableCode}`)}
              className="bg-menu-accent hover:bg-menu-accent/90 text-white rounded-[12px]"
              style={{ fontFamily: "var(--font-caveat)" }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Browse Menu
            </Button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {cart.map((item) => (
              <motion.div
                key={item.menuItemId}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="bg-white rounded-[20px] border border-menu-border/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-4">
                  <div className="flex items-center gap-3">
                    {item.imageUrl ? (
                      <div className="w-16 h-16 rounded-[12px] overflow-hidden bg-menu-bg shrink-0">
                        <img src={item.imageUrl} alt={item.name} width={80} height={80} loading="lazy" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-[12px] bg-menu-bg flex items-center justify-center shrink-0">
                        <ImageOff className="w-5 h-5 text-menu-muted/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-medium text-menu-primary" style={{ fontFamily: "var(--font-caveat)", fontSize: "17px" }}>{item.name}</h3>
                      <p className="text-sm text-menu-muted mt-0.5">
                        {fmtPrice(item.price)} each
                      </p>
                      <input
                        value={itemNotes[item.menuItemId] || ""}
                        onChange={(e) => setItemNotes(prev => ({ ...prev, [item.menuItemId]: e.target.value }))}
                        placeholder="Special instructions..."
                        className="mt-1.5 w-full text-xs px-2 py-1 rounded-md bg-menu-bg border border-menu-border/40 text-menu-primary placeholder:text-menu-muted/40 focus:outline-none focus:ring-1 focus:ring-menu-accent/30"
                        maxLength={200}
                      />
                      {(itemNotes[item.menuItemId]?.length || 0) > 100 && (
                        <p className="text-[10px] text-menu-muted/60 text-right mt-0.5">
                          {(itemNotes[item.menuItemId]?.length || 0)}/200
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 flex-col">
                      <div className="flex items-center gap-1 bg-menu-bg border border-menu-border/60 rounded-[12px] px-1 py-0.5">
                        <motion.button
                          whileTap={{ scale: 0.93 }}
                          transition={{ duration: 0.1, ease: "easeIn" }}
                          onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-[8px] text-menu-muted hover:text-menu-primary hover:bg-menu-border/30 transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </motion.button>
                        <span className="min-w-[18px] text-center text-sm font-semibold text-menu-primary">
                          {item.quantity}
                        </span>
                        <motion.button
                          whileTap={{ scale: 0.93 }}
                          transition={{ duration: 0.1, ease: "easeIn" }}
                          onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-[8px] text-menu-muted hover:text-menu-primary hover:bg-menu-border/30 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </motion.button>
                      </div>
                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        transition={{ duration: 0.1, ease: "easeIn" }}
                        onClick={() => removeFromCart(item.menuItemId)}
                        className="w-7 h-7 flex items-center justify-center rounded-[8px] text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  </div>
                  <div className="text-right mt-3 pt-3 border-t border-menu-border/30">
                    <span className="text-base font-bold text-menu-accent" style={{ fontFamily: "var(--font-caveat)", fontSize: "18px" }}>
                      {fmtPrice(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {cart.length > 0 && (
          <>
            {/* Customer Info */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04, duration: 0.2, ease: "easeOut" }}
            >
              <div className="bg-white rounded-[20px] border border-menu-border/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-menu-accent" />
                  <h3 className="text-sm font-semibold text-menu-primary" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>
                    Your Details
                  </h3>
                  <span className="text-[10px] text-menu-muted bg-menu-border/30 px-1.5 py-0.5 rounded-full">Required</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-menu-muted mb-1" style={{ fontFamily: "var(--font-caveat)", fontSize: "14px" }}>
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-menu-muted/50" />
                      <input
                        type="text"
                        placeholder="e.g. Rahul Sharma"
                        value={customerName}
                        onChange={(e) => { setCustomerName(e.target.value); setNameError(""); }}
                        maxLength={128}
                        className={`w-full h-10 pl-9 pr-3 rounded-xl border text-sm text-menu-primary placeholder:text-menu-muted/40 focus:outline-none focus:ring-1 bg-menu-bg transition-colors ${
                          nameError ? "border-red-400 focus:ring-red-300" : "border-menu-border/60 focus:ring-menu-accent/30"
                        }`}
                        style={{ fontFamily: "var(--font-caveat)" }}
                      />
                    </div>
                    {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-menu-muted mb-1" style={{ fontFamily: "var(--font-caveat)", fontSize: "14px" }}>
                      WhatsApp / Mobile Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-menu-muted/50" />
                      <input
                        type="tel"
                        placeholder="e.g. 98765 43210"
                        value={customerPhone}
                        onChange={(e) => { setCustomerPhone(e.target.value); setPhoneError(""); }}
                        maxLength={15}
                        className={`w-full h-10 pl-9 pr-3 rounded-xl border text-sm text-menu-primary placeholder:text-menu-muted/40 focus:outline-none focus:ring-1 bg-menu-bg transition-colors ${
                          phoneError ? "border-red-400 focus:ring-red-300" : "border-menu-border/60 focus:ring-menu-accent/30"
                        }`}
                        style={{ fontFamily: "var(--font-caveat)" }}
                      />
                    </div>
                    {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                    <p className="text-[10px] text-menu-muted/50 mt-1">+91 added automatically if missing. Used for invoice delivery.</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Summary */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.2, ease: "easeOut" }}
            >
              <div className="bg-white rounded-[20px] border border-menu-border/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-menu-muted" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Subtotal ({cartItemCount} items)</span>
                  <span className="text-menu-primary font-medium" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>{fmtPrice(cartTotal)}</span>
                </div>
                {settings && settings.serviceChargePercentage > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-menu-muted" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Service Charge ({settings.serviceChargePercentage}%)</span>
                    <span className="text-menu-primary font-medium" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>{fmtPrice(serviceCharge)}</span>
                  </div>
                )}
                {settings?.gstEnabled && settings.gstRate > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-menu-muted" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>CGST ({settings.gstRate / 2}%)</span>
                      <span className="text-menu-primary font-medium" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>{fmtPrice(taxAmount / 2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-menu-muted" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>SGST ({settings.gstRate / 2}%)</span>
                      <span className="text-menu-primary font-medium" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>{fmtPrice(taxAmount / 2)}</span>
                    </div>
                  </>
                )}
                <div className="border-t border-menu-border/30 pt-3 flex justify-between">
                  <span className="font-semibold text-menu-primary" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Total</span>
                  <span className="text-lg font-bold text-menu-accent" style={{ fontFamily: "var(--font-caveat)", fontSize: "20px" }}>{fmtPrice(finalTotal)}</span>
                </div>
              </div>
            </motion.div>

            {/* Buttons */}
            <motion.div
              className="space-y-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.2, ease: "easeOut" }}
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.1, ease: "easeIn" }}
                onClick={() => setShowPaymentModal(true)}
                disabled={isSubmitting || cart.length === 0}
                className="w-full bg-menu-accent hover:bg-menu-accent/90 disabled:bg-menu-accent/40 disabled:cursor-not-allowed text-white rounded-[16px] py-[15px] px-5 flex items-center justify-center gap-2 font-semibold text-base transition-colors shadow-[0_2px_12px_rgba(192,138,77,0.25)]"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    Place Order
                  </>
                )}
              </motion.button>
              <Button
                onClick={() => navigate(`/table/${tableCode}`)}
                variant="outline"
                className="w-full rounded-[16px] border-menu-border/60 text-menu-muted hover:text-menu-primary"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Continue Ordering
              </Button>
            </motion.div>
          </>
        )}
      </div>

      <PaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSelectPayOnline={() => {
          setShowPaymentModal(false);
          handleSubmitOrder("online");
        }}
        onSelectPayAtCounter={() => {
          setShowPaymentModal(false);
          handleSubmitOrder("counter");
        }}
        finalTotal={finalTotal}
      />

      <OrderSuccessModal
        open={showSuccessModal}
        orderNumber={successOrderNumber}
        tableLabel={session?.tableLabel}
        total={successTotal}
        onContinue={dismissSuccessModal}
        onViewOrder={dismissSuccessModal}
      />

      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}