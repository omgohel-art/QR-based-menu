import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Lock, Shield, CreditCard } from "lucide-react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import {
  createRazorpayOrder,
  openRazorpayCheckout,
  verifyPayment,
  loadRazorpayScript,
} from "@/services/paymentService";
import Footer from "@/components/marketing/Footer";

interface PaymentState {
  tableCode: string;
  items: Array<{ menuItemId: number; name: string; quantity: number; price: number }>;
  subtotal: number;
  serviceCharge: number;
  taxAmount: number;
  finalTotal: number;
  serviceChargePercentage: number;
  taxPercentage: number;
}

function getPaymentState(): PaymentState | null {
  try {
    const raw = sessionStorage.getItem("paymentState");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function PaymentPage() {
  const [, params] = useRoute("/table/:tableCode/payment");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const { clearCart } = useCart();
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  useEffect(() => {
    if (tableCode) {
      const state = getPaymentState();
      if (!state || state.tableCode !== tableCode) {
        navigate(`/table/${tableCode}/cart`, { replace: true });
        return;
      }
      setPaymentState(state);
    }
  }, [tableCode, navigate]);

  useEffect(() => {
    loadRazorpayScript()
      .then(() => setSdkLoaded(true))
      .catch((err) => toast.error(err.message));
  }, []);

  const handlePayment = async () => {
    if (!paymentState || !tableCode) return;
    setIsProcessing(true);

    try {
      const orderData = await createRazorpayOrder(paymentState.finalTotal);

      openRazorpayCheckout({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "MAMA Cafe",
        description: `Order for Table ${tableCode}`,
        order_id: orderData.razorpayOrderId,
        prefill: {},
        handler: async (response) => {
          const submissionId = nanoid();
          const deviceToken = nanoid(16);

          try {
            const settingsData = {
              serviceChargePercentage: paymentState.serviceChargePercentage,
              taxPercentage: paymentState.taxPercentage,
            };

            const result = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              tableCode,
              items: paymentState.items.map((item) => ({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
              })),
              submissionId,
              deviceToken,
              settings: settingsData,
            });

            if (result.success) {
              clearCart();
              sessionStorage.removeItem("paymentState");
              const successState = {
                tableCode,
                orderId: result.orderId,
                total: paymentState.finalTotal,
              };
              sessionStorage.setItem("paymentSuccess", JSON.stringify(successState));
              navigate(`/table/${tableCode}/payment/success`, { replace: true });
            }
          } catch (err: any) {
            toast.error(err.message || "Payment verification failed");
            const failState = { tableCode, message: err.message || "Payment verification failed" };
            sessionStorage.setItem("paymentFailed", JSON.stringify(failState));
            navigate(`/table/${tableCode}/payment/failed`, { replace: true });
          }
        },
        modal: {
          ondismiss: () => {
            setIsProcessing(false);
          },
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to initialize payment");
      setIsProcessing(false);
    }
  };

  if (!paymentState) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 flex items-center justify-center">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <p className="mt-4 font-semibold text-slate-700">No payment data found</p>
          <button
            onClick={() => navigate(`/table/${tableCode}/cart`)}
            className="mt-3 text-sm text-blue-500 hover:underline"
          >
            Return to cart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">
        <button
          onClick={() => navigate(`/table/${tableCode}/cart`)}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Cart
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
            <CreditCard className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">MAMA Cafe</h1>
          <p className="text-slate-500 mt-1">Complete your payment</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4 space-y-4">
          <h2 className="font-semibold text-slate-900">Order Summary</h2>

          <div className="divide-y divide-slate-100">
            {paymentState.items.map((item) => (
              <div key={item.menuItemId} className="flex items-center justify-between py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                  <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                </div>
                <span className="text-sm font-medium text-slate-900 ml-4">
                  ₹{(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-700">₹{paymentState.subtotal.toFixed(2)}</span>
            </div>
            {paymentState.serviceCharge > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Service Charge ({paymentState.serviceChargePercentage}%)</span>
                <span className="text-slate-700">₹{paymentState.serviceCharge.toFixed(2)}</span>
              </div>
            )}
            {paymentState.taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">GST ({paymentState.taxPercentage}%)</span>
                <span className="text-slate-700">₹{paymentState.taxAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1.5">
              <span className="font-semibold text-slate-900">Grand Total</span>
              <span className="text-lg font-bold text-blue-600">₹{paymentState.finalTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Payment Method</span>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Lock className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Razorpay</p>
              <p className="text-xs text-slate-500">Secured by 128-bit SSL</p>
            </div>
          </div>
        </div>

        <button
          onClick={handlePayment}
          disabled={isProcessing || !sdkLoaded}
          className="w-full py-4 px-6 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold text-lg transition-colors shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Processing…
            </span>
          ) : !sdkLoaded ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Loading…
            </span>
          ) : (
            <>
              <Lock className="w-5 h-5" />
              Pay Securely
              <span className="text-blue-200 font-normal">₹{paymentState.finalTotal.toFixed(2)}</span>
            </>
          )}
        </button>

        <p className="text-center text-xs text-slate-400 mt-4 flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" />
          Your payment information is secure and encrypted
        </p>
      </div>

      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}
