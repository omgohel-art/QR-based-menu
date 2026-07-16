import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { CheckCircle, ArrowLeft, ShoppingBag } from "lucide-react";
import Footer from "@/components/marketing/Footer";

interface SuccessState {
  tableCode: string;
  orderId?: number;
  total: number;
}

function getSuccessState(): SuccessState | null {
  try {
    const raw = sessionStorage.getItem("paymentSuccess");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function OrderSuccessPage() {
  const [, params] = useRoute("/table/:tableCode/payment/success");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const [state, setState] = useState<SuccessState | null>(null);

  useEffect(() => {
    const s = getSuccessState();
    if (s && s.tableCode === tableCode) {
      setState(s);
    }
  }, [tableCode]);

  const handleContinue = () => {
    sessionStorage.removeItem("paymentSuccess");
    navigate(`/table/${tableCode}`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payment Successful!</h1>
            <p className="text-slate-500 mt-2">Your order has been placed</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Order ID</span>
              <span className="font-medium text-slate-900">
                {state?.orderId ? `#${state.orderId}` : 'Processing'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Amount Paid</span>
              <span className="font-semibold text-green-600">₹{state?.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Payment Status</span>
              <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Paid
              </span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            Your order has been sent to the kitchen. You'll be notified when it's ready.
          </div>

          <button
            onClick={handleContinue}
            className="w-full py-3 px-6 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            Continue Ordering
          </button>
        </div>
      </div>
      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}
