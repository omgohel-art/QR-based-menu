import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Minus, Plus, ShoppingCart, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useCart } from "@/contexts/CartContext";

export default function CartPage() {
  const [, params] = useRoute("/table/:tableCode/cart");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { cart, cartTotal, cartItemCount, updateQuantity, removeFromCart, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceToken] = useState(() => nanoid(16));

  const { data: session } = useQuery({
    queryKey: ['cartSession', tableCode],
    enabled: !!tableCode,
    queryFn: async () => {
      const { data: tableData } = await supabase
        .from('tables')
        .select('*')
        .eq('tableCode', tableCode)
        .single();
      if (!tableData) throw new Error("Table not found");

      const { data: sessionData } = await supabase
        .from('sessions')
        .select('*')
        .eq('tableId', tableData.id)
        .eq('status', 'open')
        .single();

      if (!sessionData) throw new Error("No active session");

      return {
        id: sessionData.id,
        tableLabel: tableData.label,
        subtotal: sessionData.subtotal,
      };
    }
  });

  const { data: settings } = useQuery({
    queryKey: ['cafeSettings'],
    queryFn: async () => {
      const { data } = await supabase.from('cafeSettings').select('*').single();
      return {
        taxPercentage: data ? parseFloat(data.taxPercentage.toString()) : 0,
        serviceChargePercentage: data ? parseFloat(data.serviceChargePercentage.toString()) : 0,
      };
    }
  });

  const serviceCharge = cartTotal * ((settings?.serviceChargePercentage || 0) / 100);
  const taxAmount = (cartTotal + serviceCharge) * ((settings?.taxPercentage || 0) / 100);
  const finalTotal = cartTotal + serviceCharge + taxAmount;

  const { data: menu } = useQuery({
    queryKey: ['cartMenu', tableCode],
    queryFn: async () => {
      const { data } = await supabase.from('menuItems').select('*').eq('isAvailable', true);
      return { items: data || [] };
    }
  });

  const submitOrderMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { tableCode, items, submissionId, deviceToken } = payload;

      const { data: tableData } = await supabase.from('tables').select('*').eq('tableCode', tableCode).single();
      if (!tableData) throw new Error("Table not found");

      let { data: sessionData } = await supabase.from('sessions').select('*').eq('tableId', tableData.id).eq('status', 'open').single();
      if (!sessionData) throw new Error("No active session");

      const { data: existingOrder } = await supabase.from('orders').select('*').eq('submissionId', submissionId).single();
      if (existingOrder) return { success: true, isDuplicate: true };

      const { data: newOrder, error: orderError } = await supabase.from('orders').insert({
        sessionId: sessionData.id,
        submissionId,
        deviceToken
      }).select().single();

      if (orderError) throw orderError;

      let totalAdded = 0;
      const orderItemsToInsert = items.map((item: any) => {
        const menuItem = menu?.items.find(m => m.id === item.menuItemId);
        const price = menuItem ? parseFloat(menuItem.price.toString()) : 0;
        totalAdded += price * item.quantity;
        return {
          orderId: newOrder.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          priceAtOrderTime: price
        };
      });

      await supabase.from('orderItems').insert(orderItemsToInsert);

      const currentSubtotal = parseFloat(sessionData.subtotal.toString());
      const newSubtotal = currentSubtotal + totalAdded;
      const sc = newSubtotal * ((settings?.serviceChargePercentage || 0) / 100);
      const tax = (newSubtotal + sc) * ((settings?.taxPercentage || 0) / 100);
      await supabase.from('sessions').update({
        subtotal: newSubtotal,
        serviceCharge: sc,
        taxAmount: tax,
        finalTotal: newSubtotal + sc + tax,
        lastActivityAt: new Date().toISOString()
      }).eq('id', sessionData.id);

      return { success: true };
    },
    onSuccess: () => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['cartSession', tableCode] });
      toast.success("Order placed successfully!");
      navigate(`/table/${tableCode}`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to place order");
    }
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
        items: cart.map(item => ({
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <p className="text-red-600 font-semibold mb-4">Invalid table</p>
          <Button onClick={() => navigate("/")} variant="default">Go Home</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => navigate(`/table/${tableCode}`)}
                variant="ghost"
                size="sm"
                className="text-slate-600"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Your Cart</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-amber-600" />
              <span className="text-lg font-bold text-amber-600">{cartItemCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cart Items */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {cart.length === 0 ? (
          <Card className="p-12 text-center">
            <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">Your cart is empty</h2>
            <p className="text-slate-500 mb-6">Add some items from the menu</p>
            <Button
              onClick={() => navigate(`/table/${tableCode}`)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Browse Menu
            </Button>
          </Card>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              {cart.map(item => (
                <Card key={item.menuItemId} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900">{item.name}</h3>
                      <p className="text-sm text-slate-500">₹{item.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <Button
                        onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-8 text-center font-semibold text-lg">{item.quantity}</span>
                      <Button
                        onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 p-0"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => removeFromCart(item.menuItemId)}
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right mt-2">
                    <span className="text-amber-600 font-bold">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            {/* Summary */}
            <Card className="p-6 mb-6">
              <div className="space-y-3">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal ({cartItemCount} items)</span>
                  <span>₹{cartTotal.toFixed(2)}</span>
                </div>
                {settings && settings.serviceChargePercentage > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Service Charge ({settings.serviceChargePercentage}%)</span>
                    <span>₹{serviceCharge.toFixed(2)}</span>
                  </div>
                )}
                {settings && settings.taxPercentage > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>GST ({settings.taxPercentage}%)</span>
                    <span>₹{taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-3 flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-amber-600">₹{finalTotal.toFixed(2)}</span>
                </div>
              </div>
            </Card>

            <div className="space-y-3">
              <Button
                onClick={handleSubmitOrder}
                disabled={isSubmitting || cart.length === 0}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-lg text-lg"
              >
                <Send className="w-5 h-5 mr-2" />
                {isSubmitting ? "Submitting..." : "Place Order"}
              </Button>
              <Button
                onClick={() => navigate(`/table/${tableCode}`)}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Continue Ordering
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
