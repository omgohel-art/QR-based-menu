interface CreateOrderResponse {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

interface VerifyResponse {
  success: boolean;
  isDuplicate?: boolean;
  orderId?: number;
}

export async function createRazorpayOrder(amount: number, currency = "INR", receipt?: string): Promise<CreateOrderResponse> {
  const res = await fetch("/api/payment/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency, receipt }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create payment order");
  }
  return res.json();
}

export function openRazorpayCheckout(options: {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { contact?: string; email?: string };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
}): void {
  const rzp = new (window as any).Razorpay(options);
  rzp.on("payment.failed", (response: any) => {
    throw new Error(response.error?.description || "Payment failed");
  });
  rzp.open();
}

export async function verifyPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  tableCode: string;
  items: Array<{ menuItemId: number; quantity: number }>;
  submissionId: string;
  deviceToken: string;
  settings: { serviceChargePercentage: number; taxPercentage: number };
}): Promise<VerifyResponse> {
  const res = await fetch("/api/payment/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Payment verification failed");
  }
  return res.json();
}

export function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
    document.body.appendChild(script);
  });
}
