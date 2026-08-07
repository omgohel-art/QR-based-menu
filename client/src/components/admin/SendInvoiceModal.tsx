import { useState, useEffect } from "react";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageCircle, CheckCircle, AlertCircle, User, Phone, WifiOff } from "lucide-react";
import { toast } from "sonner";

interface SendInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: number;
  customerName?: string | null;
  customerPhone?: string | null;
}

function sanitizePhone(raw: string): string {
  let digits = raw.replace(/[\s\-\(\)\+]/g, "");
  if (digits.startsWith("00")) {
    digits = digits.substring(2);
  }
  if (!digits.startsWith("91") && digits.length === 10) {
    digits = "91" + digits;
  }
  return digits;
}

function validatePhone(raw: string): { valid: boolean; error?: string; sanitized?: string } {
  if (!raw || raw.trim().length === 0) {
    return { valid: false, error: "Customer phone number is required." };
  }
  const sanitized = sanitizePhone(raw);
  if (!/^\d{10,15}$/.test(sanitized)) {
    return { valid: false, error: "Invalid phone number. Enter a 10-digit Indian mobile number." };
  }
  return { valid: true, sanitized };
}

function buildInvoiceMessage(data: {
  restaurantName: string;
  invoiceNumber: string;
  finalTotal: number;
  orderDate: string;
  invoiceUrl?: string;
  customerName?: string;
  reviewLink?: string;
}): string {
  const lines = [
    `Hello${data.customerName ? ` ${data.customerName}` : ""},`,
    ``,
    `Thank you for visiting ${data.restaurantName}!`,
    ``,
    `Your order has been completed successfully.`,
  ];

  if (data.invoiceNumber) {
    lines.push(``, `Invoice No: ${data.invoiceNumber}`);
  }
  lines.push(`Total: Rs. ${data.finalTotal.toFixed(2)}`);

  if (data.invoiceUrl) {
    lines.push(``, `View your invoice:`, data.invoiceUrl);
  }

  lines.push(``, `We truly appreciate your visit and hope to serve you again soon.`);

  if (data.reviewLink) {
    lines.push("");
    lines.push("⭐ Enjoyed your meal? Leave us a review:");
    lines.push(data.reviewLink);
  }

  lines.push("");
  lines.push(`- Team ${data.restaurantName}`);

  return lines.join("\n");
}

export default function SendInvoiceModal({ open, onOpenChange, sessionId, customerName, customerPhone }: SendInvoiceModalProps) {
  const { isOffline } = useNetworkStatus();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(customerName || "");
      if (customerPhone) {
        const raw = customerPhone.startsWith("91") && customerPhone.length === 12
          ? customerPhone.substring(2)
          : customerPhone;
        setPhone(raw);
      } else {
        setPhone("");
      }
      setDone(false);
      setError(null);
    }
  }, [open, customerName, customerPhone]);

  const handleSend = async () => {
    setError(null);

    if (isOffline) {
      setError("No internet connection. WhatsApp sharing requires an online connection.");
      return;
    }

    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.valid) {
      setError(phoneCheck.error!);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/invoice/${sessionId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate invoice");
      }

      const invoiceData = await res.json();
      const resolvedName = name.trim() || customerName || undefined;

      const message = buildInvoiceMessage({
        restaurantName: invoiceData.restaurantName || "Restaurant",
        invoiceNumber: invoiceData.invoiceNumber,
        finalTotal: invoiceData.finalTotal || 0,
        orderDate: invoiceData.orderDate || new Date().toLocaleDateString("en-IN"),
        invoiceUrl: invoiceData.invoiceUrl,
        customerName: resolvedName,
        reviewLink: invoiceData.reviewLink,
      });

      const whatsappUrl = `https://wa.me/${phoneCheck.sanitized}?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, "_blank");

      // Save customer info to orderHistories
      const resolvedPhone = phoneCheck.sanitized || customerPhone || undefined;
      if (resolvedName || resolvedPhone) {
        fetch(`/api/invoice/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, email: "whatsapp", customerName: resolvedName, customerPhone: resolvedPhone }),
        }).catch(() => {});
      }

      setDone(true);
      toast.success("WhatsApp is ready. Review the message and press Send.");
    } catch (err: any) {
      setError(err.message || "Failed to generate invoice. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            Send Invoice via WhatsApp
          </DialogTitle>
          <DialogDescription>
            Review customer details and send the invoice via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <CheckCircle className="w-12 h-12 text-green-500" />
            <p className="text-green-600 font-medium">WhatsApp opened!</p>
            <p className="text-sm text-slate-500 text-center">
              Review the message in WhatsApp and press <strong>Send</strong>.
            </p>
            <Button variant="outline" onClick={handleClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Customer Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Used to personalize the invoice message.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                WhatsApp / Mobile Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="tel"
                  placeholder="e.g. 98765 43210"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Country code +91 is added automatically if missing.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={loading || !phone.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating invoice...</>
              ) : (
                <><MessageCircle className="w-4 h-4 mr-2" /> Send via WhatsApp</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
