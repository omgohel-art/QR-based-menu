import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2, Send, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import Footer from "@/components/marketing/Footer";

export default function CartPage() {
  const [, params] = useRoute("/table/:tableCode/cart");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { cart, cartTotal, cartItemCount, updateQuantity, removeFromCart, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceToken] = useState(() => nanoid(16));

  const { data: session } = useQuery({
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
        .single();

      if (!sessionData) throw new Error("No active session");

      return {
        id: sessionData.id,
        tableLabel: tableData.label,
        subtotal: sessionData.subtotal,
      };
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["cafeSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("cafeSettings").select("*").single();
      return {
        taxPercentage: data ? parseFloat(data.taxPercentage.toString()) : 0,
        serviceChargePercentage: data ? parseFloat(data.serviceChargePercentage.toString()) : 0,
      };
    },
  });

  const serviceCharge = cartTotal * ((settings?.serviceChargePercentage || 0) / 100);
  const taxAmount = (cartTotal + serviceCharge) * ((settings?.taxPercentage || 0) / 100);
  const finalTotal = cartTotal + serviceCharge + taxAmount;

  const { data: menu } = useQuery({
    queryKey: ["cartMenu", tableCode],
    queryFn: async () => {
      const { data } = await supabase.from("menuItems").select("*").eq("isAvailable", true);
      return { items: data || [] };
    },
  });

  const submitOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { tableCode, items, submissionId, deviceToken } = payload;

      const { data: tableData } = await supabase.from("tables").select("*").eq("tableCode", tableCode).single();
      if (!tableData) throw new Error("Table not found");

      let { data: sessionData } = await supabase.from("sessions").select("*").eq("tableId", tableData.id).eq("status", "open").single();
      if (!sessionData) throw new Error("No active session");

      const { data: existingOrder } = await supabase.from("orders").select("*").eq("submissionId", submissionId).single();
      if (existingOrder) return { success: true, isDuplicate: true };

      // Get next order number (gracefully skip if column doesn't exist yet)
      let orderNumber: number | null = null;
      try {
        const { data: counterData, error: rpcErr } = await supabase.rpc("get_next_order_number").single();
        if (!rpcErr && counterData) {
          orderNumber = counterData as number;
        }
      } catch {}
      if (orderNumber === null) {
        try {
          const { data: maxOrd } = await supabase.from("orders").select("orderNumber").order("orderNumber", { ascending: false }).limit(1);
          orderNumber = (maxOrd && maxOrd[0]?.orderNumber != null ? (maxOrd[0].orderNumber as number) : 0) + 1;
        } catch {
          orderNumber = null;
        }
      }

      const insertPayload: any = {
        sessionId: sessionData.id,
        submissionId,
        deviceToken,
      };
      if (orderNumber !== null) insertPayload.orderNumber = orderNumber;

      const { data: newOrder, error: orderError } = await supabase.from("orders").insert(insertPayload).select().single();

      if (orderError) throw orderError;

      let totalAdded = 0;
      const orderItemsToInsert = items.map((item: any) => {
        const menuItem = menu?.items.find((m: any) => m.id === item.menuItemId);
        const price = menuItem ? parseFloat(menuItem.price.toString()) : 0;
        totalAdded += price * item.quantity;
        return {
          orderId: newOrder.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          priceAtOrderTime: price,
        };
      });

      await supabase.from("orderItems").insert(orderItemsToInsert);

      const currentSubtotal = parseFloat(sessionData.subtotal.toString());
      const newSubtotal = currentSubtotal + totalAdded;
      const sc = newSubtotal * ((settings?.serviceChargePercentage || 0) / 100);
      const tax = (newSubtotal + sc) * ((settings?.taxPercentage || 0) / 100);
      await supabase.from("sessions").update({
        subtotal: newSubtotal,
        serviceCharge: sc,
        taxAmount: tax,
        finalTotal: newSubtotal + sc + tax,
        lastActivityAt: new Date().toISOString(),
      }).eq("id", sessionData.id);

      return { success: true };
    },
    onSuccess: () => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["cartSession", tableCode] });
      toast.success("Order placed successfully!");
      navigate(`/table/${tableCode}`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to place order");
    },
  });

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      toast.error("Your cart is empty");
      return;
    }
    setIsSubmitting(true);
    try {
      await submitOrderMutation.mutateAsync({
        tableCode: tableCode || "",
        items: cart.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
        })),
        submissionId: nanoid(),
        deviceToken,
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
              <h1 className="text-xl font-bold text-menu-primary">Cart</h1>
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
              <h2 className="text-lg font-semibold text-menu-primary">Your cart is empty</h2>
              <p className="text-sm text-menu-muted">Add some items from the menu</p>
            </div>
            <Button
              onClick={() => navigate(`/table/${tableCode}`)}
              className="bg-menu-accent hover:bg-menu-accent/90 text-white rounded-[12px]"
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
                <div className="bg-white rounded-[20px] border border-menu-border/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-medium text-menu-primary">{item.name}</h3>
                      <p className="text-sm text-menu-muted mt-0.5">
                        <span className="text-menu-muted/60">₹</span>{item.price.toFixed(2)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
                    <span className="text-base font-bold text-menu-accent">
                      <span className="text-menu-muted/60 font-medium">₹</span>{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {cart.length > 0 && (
          <>
            {/* Summary */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.2, ease: "easeOut" }}
            >
              <div className="bg-white rounded-[20px] border border-menu-border/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-menu-muted">Subtotal ({cartItemCount} items)</span>
                  <span className="text-menu-primary font-medium">
                    <span className="text-menu-muted/60">₹</span>{cartTotal.toFixed(2)}
                  </span>
                </div>
                {settings && settings.serviceChargePercentage > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-menu-muted">Service Charge ({settings.serviceChargePercentage}%)</span>
                    <span className="text-menu-primary font-medium">
                      <span className="text-menu-muted/60">₹</span>{serviceCharge.toFixed(2)}
                    </span>
                  </div>
                )}
                {settings && settings.taxPercentage > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-menu-muted">GST ({settings.taxPercentage}%)</span>
                    <span className="text-menu-primary font-medium">
                      <span className="text-menu-muted/60">₹</span>{taxAmount.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="border-t border-menu-border/30 pt-3 flex justify-between">
                  <span className="font-semibold text-menu-primary">Total</span>
                  <span className="text-lg font-bold text-menu-accent">
                    <span className="text-menu-accent/60 font-medium">₹</span>{finalTotal.toFixed(2)}
                  </span>
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
                onClick={handleSubmitOrder}
                disabled={isSubmitting || cart.length === 0}
                className="w-full bg-menu-accent hover:bg-menu-accent/90 disabled:bg-menu-accent/40 disabled:cursor-not-allowed text-white rounded-[16px] py-[15px] px-5 flex items-center justify-center gap-2 font-semibold text-base transition-colors shadow-[0_2px_12px_rgba(245,158,11,0.2)]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Submitting…
                  </span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Place Order
                  </>
                )}
              </motion.button>
              <Button
                onClick={() => navigate(`/table/${tableCode}`)}
                variant="outline"
                className="w-full rounded-[16px] border-menu-border/60 text-menu-muted hover:text-menu-primary"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Continue Ordering
              </Button>
            </motion.div>
          </>
        )}
      </div>

      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}