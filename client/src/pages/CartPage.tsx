import { useState, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2, UtensilsCrossed, CreditCard, ImageOff, User, Phone, Gift, Ticket, X, Star, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import Footer from "@/components/marketing/Footer";
import PaymentModal from "@/components/PaymentModal";
import OrderSuccessModal from "@/components/OrderSuccessModal";
import CallWaiterButton from "@/components/CallWaiterButton";
import BillSplitModal from "@/components/BillSplitModal";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useLoyalty, useLoyaltyTiers, useSpinStatus, calculatePoints, getNextMilestone, getCurrentTierPoints, type LoyaltyCoupon } from "@/hooks/useLoyalty";

export default function CartPage() {
  const [, params] = useRoute("/table/:tableCode/cart");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { cart, cartTotal, cartItemCount, updateQuantity, removeFromCart, clearCart, setTableCode, addToCart } = useCart();
  const { fmtPrice } = useFormatCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceToken] = useState(() => nanoid(16));
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [successOrderNumber, setSuccessOrderNumber] = useState<number | null>(null);
  const [successTotal, setSuccessTotal] = useState(0);
  const [appliedCoupon, setAppliedCoupon] = useState<(LoyaltyCoupon & { rewardType?: string; rewardLabel?: string }) | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponTab, setCouponTab] = useState<"wallet" | "manual">("wallet");
  const [walletCoupons, setWalletCoupons] = useState<LoyaltyCoupon[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [validateLoading, setValidateLoading] = useState(false);
  const [validatedCoupon, setValidatedCoupon] = useState<{ valid: boolean; coupon?: any; error?: string } | null>(null);
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

  const { hasPhone, wallet, activeCoupons, pointsToNext, progressPercent, nextReward } = useLoyalty(tableCode, customerPhone || undefined);
  const { data: tiersData } = useLoyaltyTiers();
  const { data: spinData } = useSpinStatus(wallet?.customerPhone);
  const tiers = tiersData?.tiers || [];
  const loyaltyEnabled = tiersData?.loyaltyEnabled ?? true;
  const loyaltyThreshold = tiersData?.loyaltyPointsThreshold ?? 100;

  const sanitizePhone = (raw: string): string => {
    let digits = raw.replace(/[\s\-\(\)\+]/g, "");
    if (digits.startsWith("00")) digits = digits.substring(2);
    if (!digits.startsWith("91") && digits.length === 10) digits = "91" + digits;
    return digits;
  };

  const fetchWalletCoupons = useCallback(async () => {
    if (!customerPhone.trim()) return;
    setWalletLoading(true);
    try {
      const phone = sanitizePhone(customerPhone.trim());
      const res = await fetch(`/api/loyalty/my-coupons/${phone}`);
      if (res.ok) {
        const data = await res.json();
        setWalletCoupons(data.coupons || []);
      }
    } catch { /* silent */ } finally {
      setWalletLoading(false);
    }
  }, [customerPhone]);

  useEffect(() => {
    if (couponTab === "wallet" && customerPhone.trim()) fetchWalletCoupons();
  }, [couponTab, customerPhone, fetchWalletCoupons]);

  const handleValidateCouponCode = async () => {
    const code = couponInput.trim();
    if (!code) return;
    if (!customerPhone.trim()) { toast.error("Enter your phone number first"); return; }
    setValidateLoading(true);
    setValidatedCoupon(null);
    try {
      const phone = sanitizePhone(customerPhone.trim());
      const res = await fetch(`/api/loyalty/validate-coupon/${encodeURIComponent(code)}?phone=${phone}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setValidatedCoupon({ valid: true, coupon: data.coupon });
      } else {
        setValidatedCoupon({ valid: false, error: data.error || "Invalid coupon code" });
      }
    } catch {
      setValidatedCoupon({ valid: false, error: "Failed to validate coupon" });
    } finally {
      setValidateLoading(false);
    }
  };

  const applyCouponFromObject = (coupon: LoyaltyCoupon & { rewardType?: string; rewardLabel?: string }) => {
    setAppliedCoupon(coupon);
    setCouponError("");
    toast.success(`Coupon ${coupon.code} applied! ${coupon.discountPercent}% off`);
  };

  const validateCustomerInfo = (): boolean => {
    let valid = true;
    let firstErrorField: HTMLElement | null = null;
    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();

    if (!trimmedName) {
      setNameError("Please enter your name");
      valid = false;
      firstErrorField = firstErrorField || document.getElementById("customer-name-input");
    } else if (trimmedName.length > 128) {
      setNameError("Name is too long");
      valid = false;
      firstErrorField = firstErrorField || document.getElementById("customer-name-input");
    } else {
      setNameError("");
    }

    if (!trimmedPhone) {
      setPhoneError("Please enter your phone number");
      valid = false;
      firstErrorField = firstErrorField || document.getElementById("customer-phone-input");
    } else {
      const sanitized = sanitizePhone(trimmedPhone);
      if (!/^\d{10,15}$/.test(sanitized)) {
        setPhoneError("Enter a valid 10-digit Indian mobile number");
        valid = false;
        firstErrorField = firstErrorField || document.getElementById("customer-phone-input");
      } else {
        setPhoneError("");
      }
    }

    if (!valid) {
      setTimeout(() => {
        if (firstErrorField) {
          firstErrorField.scrollIntoView({ behavior: "smooth", block: "center" });
          firstErrorField.focus();
        }
      }, 100);
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

  const { data: menuItemsPublic = [] } = useQuery({
    queryKey: ["menuItemsPublic"],
    queryFn: async () => {
      const res = await fetch("/api/public/menu-items");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const upsellItems = (Array.isArray(menuItemsPublic) ? menuItemsPublic : [])
    .filter((i: any) => !cart.some((c) => c.menuItemId === i.id) && i.isAvailable !== false)
    .slice(0, 4);

  const serviceCharge = cartTotal * ((settings?.serviceChargePercentage || 0) / 100);
  const taxableAmount = settings?.gstEnabled ? cartTotal + serviceCharge : 0;
  const taxAmount = taxableAmount * ((settings?.gstRate || 0) / 100);
  const finalTotal = cartTotal + serviceCharge + taxAmount;

  const loyaltyPointsEarnable = getCurrentTierPoints(finalTotal, tiers);
  const couponDiscount = appliedCoupon
    ? appliedCoupon.rewardType === "freeItem"
      ? cart.length > 0 ? Math.min(...cart.map(i => i.price)) : 0
      : finalTotal * (appliedCoupon.discountPercent / 100)
    : 0;
  const totalAfterCoupon = finalTotal - couponDiscount;

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
      queryClient.invalidateQueries({ queryKey: ["loyalty", customerPhone] });
      queryClient.invalidateQueries({ queryKey: ["spinStatus", customerPhone] });
      setSuccessOrderNumber(_data?.orderNumber ?? _data?.orderId ?? null);
      setSuccessTotal(totalAfterCoupon);
      // Use actual earned points from server response
      const actualPoints = _data?.loyaltyPointsEarned ?? 0;
      sessionStorage.setItem("loyaltyPointsEarned", String(actualPoints));
      if (_data?.spinsAwarded > 0) {
        sessionStorage.setItem("loyaltySpinsAwarded", String(_data.spinsAwarded));
      }
      if (appliedCoupon) {
        sessionStorage.setItem("loyaltyAppliedCoupon", JSON.stringify(appliedCoupon));
      }
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

    if (!validateCustomerInfo()) {
      return;
    }

    const sanitizedPhone = customerPhone.trim() ? sanitizePhone(customerPhone.trim()) : "";
    const trimmedName = customerName.trim() || `Guest (${tableCode || "Table"})`;

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
        finalTotal: totalAfterCoupon,
        discountAmount: couponDiscount,
        appliedCouponCode: appliedCoupon?.code || null,
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
        appliedCouponCode: appliedCoupon?.code || null,
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
            {/* Smart Upsell / Popular Pairings */}
            {upsellItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02, duration: 0.2, ease: "easeOut" }}
              >
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-[20px] border border-amber-200/80 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>
                      Popular Pairings — Add to your order
                    </h3>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {upsellItems.map((upsell: any) => (
                      <div
                        key={upsell.id}
                        className="min-w-[140px] max-w-[150px] bg-white rounded-2xl p-3 border border-amber-100 flex flex-col justify-between shrink-0 shadow-sm hover:shadow transition-shadow"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-800 line-clamp-1" style={{ fontFamily: "var(--font-caveat)", fontSize: "15px" }}>
                            {upsell.name}
                          </p>
                          <p className="text-xs font-bold text-amber-600 mt-1" style={{ fontFamily: "var(--font-caveat)" }}>
                            {fmtPrice(upsell.price)}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            addToCart({ id: upsell.id, name: upsell.name, price: upsell.price, imageUrl: upsell.imageUrl });
                            toast.success(`Added ${upsell.name}`);
                          }}
                          className="mt-2 w-full py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Customer Info */}
            <motion.div
              id="customer-details"
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
                  <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Required</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-menu-muted mb-1" style={{ fontFamily: "var(--font-caveat)", fontSize: "14px" }}>
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-menu-muted/50" />
                      <input
                        id="customer-name-input"
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
                        id="customer-phone-input"
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
                {appliedCoupon && couponDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>
                      {appliedCoupon.rewardType === "freeItem" ? "Free Item Discount" : `Discount (${appliedCoupon.discountPercent}% off)`}
                    </span>
                    <span className="text-green-600 font-medium" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>-{fmtPrice(couponDiscount)}</span>
                  </div>
                )}
                <div className="border-t border-menu-border/30 pt-3 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-menu-primary block" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Total</span>
                    <button
                      type="button"
                      onClick={() => setShowSplitModal(true)}
                      className="text-xs text-amber-600 font-semibold underline underline-offset-2 flex items-center gap-1 hover:text-amber-700 mt-0.5"
                    >
                      Split Bill
                    </button>
                  </div>
                  <span className="text-lg font-bold text-menu-accent" style={{ fontFamily: "var(--font-caveat)", fontSize: "20px" }}>{fmtPrice(totalAfterCoupon)}</span>
                </div>
              </div>
            </motion.div>

            {/* Loyalty Rewards */}
            {cart.length > 0 && loyaltyEnabled && (() => {
              const nextMilestone = getNextMilestone(finalTotal, tiers);
              const currentPoints = getCurrentTierPoints(finalTotal, tiers);
              const spendMore = nextMilestone ? nextMilestone.minSpend - finalTotal : 0;
              const milestoneReached = !nextMilestone && currentPoints > 0;
              const progressInCurrentMilestone = (() => {
                if (tiers.length === 0) return 0;
                const prevTier = [...tiers].reverse().find(t => t.minSpend <= finalTotal);
                const prevSpend = prevTier ? prevTier.minSpend : 0;
                const nextTier = tiers.find(t => t.minSpend > finalTotal);
                const rangeStart = prevSpend;
                const rangeEnd = nextTier ? nextTier.minSpend : prevSpend + 500;
                const rangeTotal = rangeEnd - rangeStart;
                if (rangeTotal <= 0) return 100;
                return Math.min(100, Math.round(((finalTotal - rangeStart) / rangeTotal) * 100));
              })();

              return (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.07, duration: 0.2, ease: "easeOut" }}
                >
                  <div className={`rounded-[20px] border p-5 space-y-4 transition-all duration-500 ${
                    milestoneReached
                      ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200/60"
                      : "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/60"
                  }`}>
                    {/* Header */}
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        milestoneReached ? "bg-green-100" : "bg-amber-100"
                      }`}>
                        {milestoneReached ? (
                          <span className="text-sm">🎉</span>
                        ) : (
                          <Gift className="w-4 h-4 text-amber-600" />
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-[#4A3428]" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>
                        Loyalty Rewards
                      </h3>
                    </div>

                    {milestoneReached ? (
                      /* Milestone Reached Celebration */
                      <div className="text-center py-1 space-y-2">
                        <p className="text-lg font-bold text-green-700" style={{ fontFamily: "var(--font-caveat)" }}>
                          🎉 Great!
                        </p>
                        <p className="text-sm text-green-600">
                          You've reached the {fmtPrice(tiers[tiers.length - 1].minSpend)} milestone.
                        </p>
                        <p className="text-xs text-green-500">
                          You'll earn {currentPoints} Loyalty Points after completing payment.
                        </p>
                      </div>
                    ) : nextMilestone ? (
                      <>
                        {/* Spend More Prompt */}
                        <div className="text-center">
                          <p className="text-sm text-[#8B7E72]" style={{ fontFamily: "var(--font-caveat)", fontSize: "15px" }}>
                            Spend <span className="font-bold text-[#C08A4D]">{fmtPrice(spendMore)}</span> more to reach{" "}
                            <span className="font-bold text-[#C08A4D]">{fmtPrice(nextMilestone.minSpend)}</span> and earn{" "}
                            <span className="font-bold text-[#C08A4D]">{nextMilestone.points} Loyalty Points</span>
                          </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="h-2.5 bg-amber-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${Math.max(progressInCurrentMilestone, 2)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-[#8B7E72]">
                            <span>{fmtPrice(0)}</span>
                            <span>{fmtPrice(nextMilestone.minSpend)}</span>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {/* Current Reward Breakdown */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/60 rounded-xl px-3 py-2.5 space-y-0.5">
                        <p className="text-[10px] text-[#8B7E72] uppercase tracking-wider">Current Total</p>
                        <p className="text-base font-bold text-[#4A3428]" style={{ fontFamily: "var(--font-caveat)" }}>{fmtPrice(finalTotal)}</p>
                      </div>
                      <div className="bg-white/60 rounded-xl px-3 py-2.5 space-y-0.5">
                        <p className="text-[10px] text-[#8B7E72] uppercase tracking-wider">Points You'll Earn</p>
                        <p className="text-base font-bold text-[#C08A4D]" style={{ fontFamily: "var(--font-caveat)" }}>
                          {currentPoints > 0 ? `${currentPoints} Points` : "0 Points"}
                        </p>
                      </div>
                      {nextMilestone && (
                        <>
                          <div className="bg-white/60 rounded-xl px-3 py-2.5 space-y-0.5">
                            <p className="text-[10px] text-[#8B7E72] uppercase tracking-wider">Next Milestone</p>
                            <p className="text-base font-bold text-[#4A3428]" style={{ fontFamily: "var(--font-caveat)" }}>{fmtPrice(nextMilestone.minSpend)}</p>
                          </div>
                          <div className="bg-white/60 rounded-xl px-3 py-2.5 space-y-0.5">
                            <p className="text-[10px] text-[#8B7E72] uppercase tracking-wider">Spend</p>
                            <p className="text-base font-bold text-[#C08A4D]" style={{ fontFamily: "var(--font-caveat)" }}>{fmtPrice(spendMore)} More</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Current Points Balance */}
                    {wallet && (
                      <div className="pt-2 border-t border-amber-200/40">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#8B7E72]">Your Points: {wallet.currentPoints}</span>
                          <span className="text-[11px] text-[#8B7E72]">{wallet.currentPoints < loyaltyThreshold ? `${loyaltyThreshold - wallet.currentPoints} pts to coupon` : "Coupon available!"}</span>
                        </div>
                        <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden mt-1.5">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max((wallet.currentPoints / loyaltyThreshold) * 100, 2))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {!hasPhone && (
                      <p className="text-[11px] text-[#8B7E72] text-center">Enter your phone number in details above to start earning</p>
                    )}
                  </div>
                </motion.div>
              );
            })()}

            {/* Spin Milestone Preview */}
            {cart.length > 0 && loyaltyEnabled && hasPhone && spinData && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2, ease: "easeOut" }}
              >
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/60 rounded-[20px] p-4 shadow-[0_2px_12px_rgba(192,138,77,0.08)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎰</span>
                      <div>
                        <p className="text-sm font-bold text-[#4A3428]" style={{ fontFamily: "var(--font-caveat)", fontSize: "15px" }}>Lucky Spin</p>
                        <p className="text-[11px] text-[#8B7E72]">
                          {spinData.available > 0
                            ? `${spinData.available} spin${spinData.available !== 1 ? "s" : ""} available`
                            : spinData.nextMilestone
                              ? `${spinData.nextMilestone.points - spinData.lifetimeEarned} more pts to unlock ${spinData.nextMilestone.spins} spin${spinData.nextMilestone.spins !== 1 ? "s" : ""}`
                              : "All milestones claimed!"
                          }
                        </p>
                      </div>
                    </div>
                    {spinData.available > 0 && (
                      <button
                        onClick={() => navigate(`/table/${tableCode}/spin`)}
                        className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 bg-orange-100 px-3 py-1.5 rounded-full hover:bg-orange-200 transition-colors"
                      >
                        Spin Now
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Coupon Section — Applied State */}
            {cart.length > 0 && loyaltyEnabled && appliedCoupon && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.2, ease: "easeOut" }}
              >
                <div className="bg-white rounded-[20px] border border-menu-border/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-emerald-700" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Coupon Applied</h3>
                        <p className="text-[10px] text-emerald-500">{appliedCoupon.code}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setAppliedCoupon(null); setCouponInput(""); setValidatedCoupon(null); }}
                      className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-emerald-700" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>
                        {appliedCoupon.rewardType === "freeItem" ? "Free Item" : `${appliedCoupon.discountPercent}% OFF`}
                      </p>
                      <p className="text-sm font-bold text-emerald-700" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>
                        -{fmtPrice(couponDiscount)}
                      </p>
                    </div>
                    {appliedCoupon.rewardLabel && (
                      <p className="text-[11px] text-emerald-600">{appliedCoupon.rewardLabel}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Coupon Section — Selection */}
            {cart.length > 0 && loyaltyEnabled && !appliedCoupon && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08, duration: 0.2, ease: "easeOut" }}
              >
                <div className="bg-white rounded-[20px] border border-menu-border/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Ticket className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-menu-primary" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Apply Coupon</h3>
                  </div>

                  {/* Tabs */}
                  <div className="flex rounded-xl bg-menu-bg border border-menu-border/40 p-0.5">
                    <button
                      onClick={() => { setCouponTab("wallet"); setValidatedCoupon(null); }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                        couponTab === "wallet"
                          ? "bg-white text-menu-primary shadow-sm"
                          : "text-menu-muted hover:text-menu-primary"
                      }`}
                      style={{ fontFamily: "var(--font-caveat)", fontSize: "14px" }}
                    >
                      My Coupons
                    </button>
                    <button
                      onClick={() => { setCouponTab("manual"); setValidatedCoupon(null); }}
                      className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                        couponTab === "manual"
                          ? "bg-white text-menu-primary shadow-sm"
                          : "text-menu-muted hover:text-menu-primary"
                      }`}
                      style={{ fontFamily: "var(--font-caveat)", fontSize: "14px" }}
                    >
                      Enter Code
                    </button>
                  </div>

                  {/* Wallet Tab */}
                  {couponTab === "wallet" && (
                    <div className="space-y-2">
                      {walletLoading ? (
                        <div className="flex justify-center py-6">
                          <div className="w-5 h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />
                        </div>
                      ) : walletCoupons.length === 0 ? (
                        <div className="text-center py-6 space-y-2">
                          <div className="w-10 h-10 mx-auto rounded-xl bg-menu-bg flex items-center justify-center">
                            <Gift className="w-5 h-5 text-menu-muted/40" />
                          </div>
                          <p className="text-xs text-menu-muted" style={{ fontFamily: "var(--font-caveat)", fontSize: "14px" }}>No coupons yet. Earn rewards to get coupons!</p>
                        </div>
                      ) : (
                        walletCoupons.map((coupon) => (
                          <div key={coupon.id} className="flex items-center justify-between bg-menu-bg border border-menu-border/40 rounded-xl px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-menu-primary" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>{coupon.code}</p>
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  {coupon.code.startsWith("L") ? "Loyalty" : coupon.code.startsWith("S") ? "Spin" : "Coupon"}
                                </span>
                              </div>
                              <p className="text-xs text-menu-muted mt-0.5">{coupon.discountPercent}% off your order</p>
                              {coupon.expiresAt && (
                                <p className="text-[10px] text-menu-muted/60 mt-0.5">Expires: {new Date(coupon.expiresAt).toLocaleDateString()}</p>
                              )}
                            </div>
                            <button
                              onClick={() => applyCouponFromObject({ ...coupon, rewardType: "discount", rewardLabel: `${coupon.discountPercent}% off your order` })}
                              className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-3"
                              style={{ fontFamily: "var(--font-caveat)" }}
                            >
                              Apply
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Manual Code Tab */}
                  {couponTab === "manual" && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Enter coupon code"
                          value={couponInput}
                          onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setValidatedCoupon(null); }}
                          className="flex-1 h-10 px-3 rounded-xl border border-menu-border/60 bg-menu-bg text-sm text-menu-primary placeholder:text-menu-muted/40 focus:outline-none focus:ring-1 focus:ring-menu-accent/30 font-mono tracking-wider"
                          maxLength={20}
                        />
                        <button
                          onClick={handleValidateCouponCode}
                          disabled={!couponInput.trim() || validateLoading}
                          className="px-4 h-10 text-xs font-semibold text-white bg-menu-accent hover:bg-menu-accent/90 disabled:bg-menu-accent/40 disabled:cursor-not-allowed rounded-xl transition-colors shrink-0"
                          style={{ fontFamily: "var(--font-caveat)" }}
                        >
                          {validateLoading ? (
                            <span className="flex items-center gap-1">
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Checking
                            </span>
                          ) : "Validate"}
                        </button>
                      </div>

                      {validatedCoupon && (
                        <div className={`rounded-xl px-4 py-3 border ${
                          validatedCoupon.valid
                            ? "bg-emerald-50 border-emerald-200/60"
                            : "bg-red-50 border-red-200/60"
                        }`}>
                          {validatedCoupon.valid ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                <p className="text-sm font-bold text-emerald-700" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>
                                  Valid — {validatedCoupon.coupon.discountPercent}% OFF
                                </p>
                              </div>
                              <p className="text-[11px] text-emerald-600">{validatedCoupon.coupon.code} · {validatedCoupon.coupon.rewardLabel || "Discount on your order"}</p>
                              <button
                                onClick={() => {
                                  applyCouponFromObject({ ...validatedCoupon.coupon, rewardType: "discount", rewardLabel: validatedCoupon.coupon.rewardLabel || `${validatedCoupon.coupon.discountPercent}% off your order` });
                                  setCouponInput("");
                                  setValidatedCoupon(null);
                                }}
                                className="w-full text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 py-2 rounded-lg transition-colors"
                                style={{ fontFamily: "var(--font-caveat)" }}
                              >
                                Apply Coupon
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2">
                              <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold text-red-700" style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}>Invalid Coupon</p>
                                <p className="text-[11px] text-red-500">{validatedCoupon.error}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {!validatedCoupon && hasPhone && wallet && wallet.currentPoints >= loyaltyThreshold && (
                        <p className="text-[11px] text-menu-muted/60 text-center">Or check My Coupons tab — you may have rewards waiting!</p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

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
        finalTotal={totalAfterCoupon}
      />

      <OrderSuccessModal
        open={showSuccessModal}
        orderNumber={successOrderNumber}
        tableLabel={session?.tableLabel}
        total={successTotal}
        onContinue={dismissSuccessModal}
        onViewOrder={dismissSuccessModal}
      />

      <BillSplitModal
        open={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        totalAmount={totalAfterCoupon}
      />

      <div className="mt-16">
        <Footer variant="menu" />
      </div>

      <CallWaiterButton tableCode={tableCode} />
    </div>
  );
}