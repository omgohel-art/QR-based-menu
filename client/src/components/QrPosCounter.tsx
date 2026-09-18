import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clipboard, Loader2, Printer, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import "./QrPosCounter.css";

interface MenuItem {
  id: number;
  name: string;
  price: number;
  imageUrl?: string | null;
  category?: string;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface QrPosState {
  cart: CartItem[];
  cartTotal: number;
  cartItemCount: number;
  isLoading: boolean;
  isPrinting: boolean;
}

const DEFAULT_CATEGORIES = [
  { id: "coffee", name: "Coffee & Beverages", icon: "coffee" },
  { id: "food", name: "Food & Snacks", icon: "utensils" },
  { id: "dessert", name: "Desserts & Sweets", icon: "sparkles" },
];

export default function QrPosCounter() {
  const queryClient = useQueryClient();
  const { fmtPrice } = useFormatCurrency();

  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MenuItem["category"] | null>(null);

  // Fetch menu items grouped by category
  const { data: menuItems = [] } = useQuery({
    queryKey: ["public-menu-items"],
    queryFn: async () => {
      const res = await fetch("/api/public/menu-items");
      if (!res.ok) throw new Error("Failed to load menu");
      return res.json();
    },
    staleTime: 60_000,
  });

  // Group menu by category for display
  const groupedMenu = useRef<Map<MenuItem["category"], MenuItem[]>>(new Map());
  useEffect(() => {
    DEFAULT_CATEGORIES.forEach((cat) => groupedMenu.current.set(cat.id, []));
    (menuItems || []).forEach((item) => {
      const cat = item.category || "food";
      const items = groupedMenu.current.get(cat) || [];
      groupedMenu.current.set(cat, [...items, item]);
    });
  }, [menuItems]);

  // Add item to cart
  const addToCart = (item: MenuItem, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { ...item, quantity }];
    });
    recalcCart();
  };

  // Remove item from cart
  const removeFromCart = (itemId: number) => {
    setCart((prev) => prev.filter((i) => i.id !== itemId));
    recalcCart();
  };

  // Recalculate cart totals
  const recalcCart = () => {
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    setCartTotal(total);
    setCartItemCount(count);
  };

  // Print KOT + Receipt + Cash Drawer
  const handlePrintAndPay = async (paymentMethod: "cash" | "upi" | "card") => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }

    setIsPrinting(true);
    setIsLoading(true);

    try {
      // 1. Create order without tableCode (walk-in / counter order)
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token;

      const orderItems = cart.map((item) => ({
        menuItemId: item.id,
        quantity: item.quantity,
        priceAtOrderTime: item.price,
        delivered: false,
        variantSelections: [],
        specialInstructions: "",
      }));

      const res = await fetch("/api/order/counter-submit", {
        method: "POST",
        headers: token
          ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
          : { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableCode: "", // No table - counter order
          items: orderItems,
          customerName: "Walk-in Customer",
          customerPhone: "",
          paymentMethod,
          subtotal: cartTotal,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit order");
      }

      const orderData = await res.json();

      // 2. Print KOT to kitchen (routes to kitchen printer automatically)
      const kotRes = await fetch("/api/print-kot", {
        method: "POST",
        headers: token
          ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
          : { "Content-Type": "application/json" },
        body: JSON.stringify({
          kot: {
            orderNumber: orderData?.orderNumber,
            table: "Counter",
            date: new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
            time: new Date().toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
            type: "COUNTER",
            items: cart.map((it) => ({
              name: it.name,
              qty: it.quantity,
            })),
          },
        }),
      });

      if (!kotRes.ok) {
        const kotError = await kotRes.json();
        console.error("KOT print error:", kotError);
        // Don't fail the whole transaction if KOT fails
      }

      // 3. Print receipt to counter printer
      const receiptRes = await fetch("/api/print-receipt", {
        method: "POST",
        headers: token
          ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
          : { "Content-Type": "application/json" },
        body: JSON.stringify({
          printerIp: "", // Will use counter printer from settings
          printerPort: 9100,
          receipt: {
            restaurantName: "Your Café",
            address: "",
            city: "",
            state: "",
            phone: "",
            gstNumber: "",
            invoicePrefix: "INV-",
            sessionId: orderData?.orderId || 0,
            date: new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
            time: new Date().toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
            table: "Counter",
            orders: orderData?.orderNumber ? `#${String(orderData.orderNumber).padStart(3, "0")}` : "",
            items: cart.map((it) => ({
              name: it.name,
              qty: it.quantity,
              price: it.price,
            })),
            subtotal: cartTotal,
            serviceCharge: 0,
            gstEnabled: false,
            gstHalf: 0,
            cgst: 0,
            sgst: 0,
            grandTotal: cartTotal,
            payment: paymentMethod,
            footerMessage: "Thank you for visiting!",
            // isKOT flag is handled internally by the server route
          },
        }),
      });

      if (!receiptRes.ok) {
        const receiptError = await receiptRes.json();
        console.error("Receipt print error:", receiptError);
      }

      // 4. Cash drawer kick (only for cash payments)
      if (paymentMethod === "cash") {
        try {
          const KICK_CASH_DRAWER = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
          // Send to counter printer - attempt kick even if print was queued
          await fetch("/api/print-receipt", {
            method: "POST",
            headers: token
              ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
              : { "Content-Type": "application/json" },
            body: JSON.stringify({
              printerIp: "",
              printerPort: 9100,
              receipt: {
                restaurantName: "Your Café",
                invoicePrefix: "INV-",
                sessionId: orderData?.orderId || 0,
                table: "Counter",
                payment: "Cash",
                // Minimal receipt data - we just need the drawer kick
              },
            }),
          });
        } catch (err) {
          console.error("Cash drawer kick failed:", err);
        }
      }

      // Success - clear cart and show success
      setCart([]);
      setCartTotal(0);
      setCartItemCount(0);

      // Auto-dismiss after 2 seconds, or stay open if user wants details
      toast.success("Order placed & printed!", {
        description: `₹${cartTotal.toLocaleString("en-IN")} — ${paymentMethod === "cash" ? "Cash drawer opened" : ""}`,
        action: {
          label: "View Order",
          onClick: () => {
            queryClient.invalidateQueries({ queryKey: ["orderQueue"] });
            // Navigate to order success or keep on this screen
          },
        },
        duration: 3000,
      });
    } catch (err: any) {
      console.error("QSR POS error:", err);
      toast.error(err.message || "Failed to place order");
    } finally {
      setIsPrinting(false);
      setIsLoading(false);
    }
  };

  // Category button styles
  const categoryButtonClass = (cat: MenuItem["category"]) => {
    if (selectedCategory === cat) {
      return "border-blue-600 text-blue-600 bg-blue-50";
    }
    return "border-slate-300 text-slate-600 hover:border-slate-500 hover:text-slate-800";
  };

  // Render category buttons
  const categoryButtons = DEFAULT_CATEGORIES.map((cat) => (
    <Button
      key={cat.id}
      size="sm"
      className="w-full mb-2 {categoryButtonClass(cat.id)}"
      onClick={() => setSelectedCategory(cat.id as any)}
    >
      {cat.name}
    </Button>
  ));

  // Render menu items for selected category
  const itemsInCategory = selectedCategory
    ? (groupedMenu.current.get(selectedCategory) || [])
    : [];

  const renderedItems = itemsInCategory.slice(0, 12).map((item) => (
    <Card
      key={item.id}
      className="p-3 mb-2 border rounded border-slate-200 hover:border-blue-500 transition-all"
      onClick={() => addToCart(item, 1)}
    >
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-10 h-10 object-cover rounded-t-md mb-2"
        />
      )}
      <div className="flex flex-col flex-1">
        <div className="text-sm font-medium text-slate-900 truncate">{item.name}</div>
        <div className="text-xs text-slate-500">₹${item.price.toFixed(0)}</div>
      </div>
    </Card>
  ));

  // Empty state
  const emptyState = selectedCategory
    ? itemsInCategory.length === 0
      ? <p className="text-center text-slate-400 py-8">No items in this category</p>
      : null
    : <p className="text-center text-slate-400 py-8">Select a category above</p>;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 p-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          <svg
            className="w-5 h-5 mr-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
            <circle
              cx="3"
              cy="3"
              r="1"
              fill="currentColor"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              d="l21.5 21.5M15 12l3 3m0 0l3 3m-3-3l-3-3m-6 6l3-3m3 3m-6-6l-3 3m3-3"
            />
          </svg>
          Counter POS
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Quick billing for walk-in customers</p>
      </div>

      {/* Category Tabs */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        {categoryButtons}
      </div>

      {/* Menu Grid or Empty State */}
      <div className="flex-1 p-4 flex flex-col overflow-y-auto">
        {selectedCategory ? (
          <div className="grid grid-cols-2 gap-2">{renderedItems}</div>
        ) : (
          <div>{emptyState}</div>
        )}
      </div>

      {/* Cart Side panel */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <div className="flex justify-between items-start mb-3">
          <span>Items: {cartItemCount}</span>
          <span className="font-medium text-slate-900 dark:text-white">₹{cartTotal.toLocaleString("en-IN")}</span>
        </div>

        {/* Payment Buttons */}
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handlePrintAndPay("cash")}
            disabled={isPrinting}
          >
            <svg
              className="w-4 h-4 mr-2 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Pay ₹{cartTotal.toLocaleString("en-IN")} — Cash
          </Button>

          <Button
            size="lg"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-absolute"
            onClick={() => handlePrintAndPay("upi")}
            disabled={isPrinting}
          >
            <svg
              className="w-4 h-4 mr-2"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2v4m0 4v7m4-12v15" />
            </svg>
            Pay via UPI
          </Button>

          <Button
            size="lg"
            className="w-full bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handlePrintAndPay("card")}
            disabled={isPrinting}
          >
            <svg
              className="w-4 h-4 mr-2"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2v4m0 4v7m4-12v15" />
            </svg>
            Pay by Card
          </Button>
        </div>

        {/* Quick clear */}
        <Button
          size="sm"
          variant="outline"
          className="w-full text-sm mt-3"
          onClick={() => {
            setCart([]);
            setCartTotal(0);
            setCartItemCount(0);
          }}
        >
          Clear Cart
        </Button>
      </div>
    </div>
  );
}