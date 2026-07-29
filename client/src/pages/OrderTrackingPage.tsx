import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { CheckCircle, Clock, ChefHat, Utensils, ArrowLeft, ShoppingBag, Receipt } from "lucide-react";
import Footer from "@/components/marketing/Footer";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

const STATUS_ORDER: Record<string, number> = {
  received: 0,
  preparing: 1,
  ready: 2,
  delivered: 3,
  settled: 4,
};

const STATUS_STEPS = [
  { key: "received", label: "Order Received", icon: Clock },
  { key: "preparing", label: "Preparing", icon: ChefHat },
  { key: "ready", label: "Ready to Serve", icon: Utensils },
  { key: "delivered", label: "Served", icon: CheckCircle },
];

export default function OrderTrackingPage() {
  const [, params] = useRoute("/table/:tableCode/order/:orderId");
  const tableCode = params?.tableCode;
  const orderId = params?.orderId ? parseInt(params.orderId) : null;
  const [, navigate] = useLocation();
  const { fmtPrice } = useFormatCurrency();

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["trackingOrder", orderId],
    enabled: !!orderId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, orderNumber, orderStatus, paymentMethod, submittedAt")
        .eq("id", orderId!)
        .single();
      return data;
    },
  });

  const { data: orderItems } = useQuery({
    queryKey: ["trackingItems", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data: items } = await supabase
        .from("orderItems")
        .select("menuItemId, quantity, priceAtOrderTime, specialInstructions")
        .eq("orderId", orderId!);
      if (!items || items.length === 0) return [];
      const menuIds = Array.from(new Set(items.map(i => i.menuItemId)));
      const { data: menuItems } = await supabase
        .from("menuItems")
        .select("id, name, imageUrl")
        .in("id", menuIds);
      const nameMap = new Map((menuItems || []).map(m => [m.id, m.name]));
      return items.map(i => ({
        name: nameMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
        qty: i.quantity,
        price: parseFloat(i.priceAtOrderTime.toString()),
        instructions: i.specialInstructions || null,
      }));
    },
  });

  const { data: session } = useQuery({
    queryKey: ["trackingSession", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data: orderData } = await supabase
        .from("orders")
        .select("sessionId")
        .eq("id", orderId!)
        .single();
      if (!orderData) return null;
      const { data } = await supabase
        .from("sessions")
        .select("subtotal, taxAmount, serviceCharge, finalTotal")
        .eq("id", orderData.sessionId)
        .single();
      return data;
    },
  });

  const currentStatus = order?.orderStatus || "received";
  const currentIdx = STATUS_ORDER[currentStatus] ?? 0;
  const subtotal = orderItems?.reduce((s, i) => s + i.price * i.qty, 0) || 0;

  const handleBack = () => {
    navigate(`/table/${tableCode}`, { replace: true });
  };

  if (orderLoading) return <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center"><div className="animate-pulse text-[#8B7E72]">Loading order...</div></div>;
  if (!order) return <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center"><div className="text-center space-y-4"><p className="text-[#8B7E72]">Order not found</p><button onClick={handleBack} className="text-[#C08A4D]">Back to Menu</button></div></div>;

  return (
    <div className="min-h-screen bg-[#F8F4EC] flex flex-col">
      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-full bg-white border border-[#E8E0D4]/60 flex items-center justify-center text-[#4A3428] hover:bg-[#F8F4EC] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#4A3428]">Order Details</h1>
            <p className="text-xs text-[#8B7E72]">Track your order in real-time</p>
          </div>
        </div>

        {/* Order Number & Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#8B7E72]">Order Number</span>
            <span className="text-lg font-bold text-[#4A3428]">
              #{String(order?.orderNumber ?? orderId ?? 0).padStart(3, "0")}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-[#8B7E72]">Status</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {STATUS_STEPS[currentIdx]?.label || "Processing"}
            </span>
          </div>
          {order?.submittedAt && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#8B7E72]">Placed at</span>
              <span className="text-sm text-[#4A3428]">
                {new Date(order.submittedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
        </motion.div>

        {/* Status Tracker */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5"
        >
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={step.key} className="flex flex-col items-center gap-1.5 flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? isCurrent
                          ? "bg-[#C08A4D] text-white scale-110 shadow-md"
                          : "bg-emerald-100 text-emerald-600"
                        : "bg-slate-100 text-slate-300"
                    }`}
                  >
                    <StepIcon className="w-5 h-5" />
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight ${
                    isActive ? "text-[#4A3428]" : "text-slate-300"
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(currentIdx / (STATUS_STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </motion.div>

        {/* Items */}
        {orderItems && orderItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-4 h-4 text-[#C08A4D]" />
              <span className="text-sm font-semibold text-[#4A3428]">Items Ordered</span>
            </div>
            <div className="space-y-2.5 divide-y divide-[#E8E0D4]/40">
              {orderItems.map((item, i) => (
                <div key={i} className="pt-2 first:pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-[#4A3428] font-medium">{item.name}</span>
                      <span className="text-[#8B7E72] ml-1">x{item.qty}</span>
                    </div>
                    <span className="text-[#4A3428] font-semibold ml-3">{fmtPrice(item.price * item.qty)}</span>
                  </div>
                  {item.instructions && (
                    <p className="text-[11px] text-[#8B7E72] mt-0.5 italic">"{item.instructions}"</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Bill Summary */}
        {session && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-[20px] border border-[#E8E0D4]/60 shadow-[0_2px_20px_rgba(0,0,0,0.04)] p-5 space-y-2"
          >
            <span className="text-sm font-semibold text-[#4A3428]">Bill Summary</span>
            <div className="flex justify-between text-sm">
              <span className="text-[#8B7E72]">Subtotal</span>
              <span className="text-[#4A3428]">{fmtPrice(subtotal)}</span>
            </div>
            {parseFloat(session.serviceCharge?.toString() || "0") > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7E72]">Service Charge</span>
                <span className="text-[#4A3428]">{fmtPrice(parseFloat(session.serviceCharge.toString()))}</span>
              </div>
            )}
            {parseFloat(session.taxAmount?.toString() || "0") > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[#8B7E72]">Tax</span>
                <span className="text-[#4A3428]">{fmtPrice(parseFloat(session.taxAmount.toString()))}</span>
              </div>
            )}
            <div className="border-t border-[#E8E0D4] pt-2 flex justify-between text-sm font-bold">
              <span className="text-[#4A3428]">Total</span>
              <span className="text-[#C08A4D]">{fmtPrice(session.finalTotal)}</span>
            </div>
          </motion.div>
        )}

        {/* Back to Menu */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={handleBack}
          className="w-full py-3 px-6 rounded-[14px] border border-[#E8E0D4] text-[#4A3428] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-white transition-colors"
        >
          <ShoppingBag className="w-4 h-4" />
          Back to Menu
        </motion.button>
      </div>

      <div className="mt-8">
        <Footer variant="menu" />
      </div>
    </div>
  );
}
