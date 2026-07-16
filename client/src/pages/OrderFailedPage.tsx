import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { XCircle, RefreshCw, ArrowLeft } from "lucide-react";
import Footer from "@/components/marketing/Footer";

export default function OrderFailedPage() {
  const [, params] = useRoute("/table/:tableCode/payment/failed");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();

  const handleRetry = () => {
    sessionStorage.removeItem("paymentFailed");
    navigate(`/table/${tableCode}/payment`, { replace: true });
  };

  const handleBackToCart = () => {
    sessionStorage.removeItem("paymentFailed");
    navigate(`/table/${tableCode}/cart`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payment Failed</h1>
            <p className="text-slate-500 mt-2">
              Your payment could not be processed. Your card has not been charged.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full py-3 px-6 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Payment
            </button>
            <button
              onClick={handleBackToCart}
              className="w-full py-3 px-6 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Cart
            </button>
          </div>
        </div>
      </div>
      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}
