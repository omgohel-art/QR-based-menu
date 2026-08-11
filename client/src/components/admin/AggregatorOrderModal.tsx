import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, X, ShoppingBag, Truck, HandPlatter, MoreHorizontal,
  Save, Search, ChevronDown, AlertCircle, CheckCircle2, Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface MenuItem {
  id: number;
  name: string;
  price: number | string;
  categoryId?: number | null;
  isAvailable?: boolean;
}

interface LineItem {
  key: string;
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
  notes: string;
}

type Source = "zomato" | "swiggy" | "manual" | "other";

const SOURCES: { id: Source; label: string; Icon: typeof Truck; color: string; badge: string; idLabel: string }[] = [
  { id: "zomato", label: "Zomato", Icon: Truck, color: "text-red-600", badge: "bg-red-100 text-red-700 border-red-200", idLabel: "Zomato Order ID" },
  { id: "swiggy", label: "Swiggy", Icon: Truck, color: "text-orange-600", badge: "bg-orange-100 text-orange-700 border-orange-200", idLabel: "Swiggy Order ID" },
  { id: "manual", label: "Walk-in", Icon: HandPlatter, color: "text-emerald-600", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", idLabel: "Order Reference" },
  { id: "other", label: "Other", Icon: MoreHorizontal, color: "text-slate-600", badge: "bg-slate-100 text-slate-700 border-slate-200", idLabel: "Order Reference" },
];

const PAYMENT_FOR_SOURCE: Record<Source, { id: string; label: string }[]> = {
  zomato: [{ id: "aggregator", label: "Paid by Zomato" }],
  swiggy: [{ id: "aggregator", label: "Paid by Swiggy" }],
  manual: [
    { id: "cash", label: "Cash" },
    { id: "upi", label: "UPI" },
    { id: "card", label: "Card" },
    { id: "counter", label: "Pay at Counter" },
  ],
  other: [
    { id: "cash", label: "Cash" },
    { id: "upi", label: "UPI" },
    { id: "card", label: "Card" },
    { id: "counter", label: "Pay at Counter" },
    { id: "aggregator", label: "Paid by Aggregator" },
  ],
};

interface Props {
  open: boolean;
  onClose: () => void;
}

function genKey(): string {
  return Math.random().toString(36).slice(2, 9);
}

function formatRupees(n: number): string {
  return "Rs." + n.toFixed(2);
}

export default function AggregatorOrderModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [source, setSource] = useState<Source>("zomato");
  const [aggregatorOrderId, setAggregatorOrderId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "card" | "counter" | "aggregator">("aggregator");
  const [items, setItems] = useState<LineItem[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [showMenuPicker, setShowMenuPicker] = useState(false);
  const [editingNotesKey, setEditingNotesKey] = useState<string | null>(null);
  const submitGuard = useRef(false);

  // Reset state when modal opens.
  useEffect(() => {
    if (open) {
      submitGuard.current = false;
    }
  }, [open]);

  // Fetch menu items (public endpoint, no auth required).
  const menuQuery = useQuery<MenuItem[]>({
    queryKey: ["menu-items-public"],
    queryFn: async () => {
      const res = await fetch("/api/public/menu-items");
      if (!res.ok) throw new Error("Failed to load menu");
      return res.json();
    },
    enabled: open,
    staleTime: 60_000,
  });

  // Existing customer lookup (debounced).
  const phoneDigits = customerPhone.replace(/[^0-9]/g, "");
  const lookupQuery = useQuery({
    queryKey: ["external-customer-lookup", phoneDigits],
    queryFn: async () => {
      if (!phoneDigits || phoneDigits.length < 10) return { found: false };
      const res = await fetch(`/api/aggregator/customers/lookup?phone=${encodeURIComponent(phoneDigits)}`);
      if (!res.ok) return { found: false };
      return res.json() as Promise<{ found: boolean; customerName?: string; lifetimeEarned?: number }>;
    },
    enabled: phoneDigits.length >= 10,
    staleTime: 30_000,
  });

  // When a match is found and the staff hasn't entered a name yet, prefill it.
  useEffect(() => {
    if (lookupQuery.data?.found && lookupQuery.data.customerName && !customerName.trim()) {
      setCustomerName(lookupQuery.data.customerName);
    }
  }, [lookupQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // When source changes, ensure payment method is valid.
  useEffect(() => {
    const allowed = PAYMENT_FOR_SOURCE[source].map((p) => p.id);
    if (!allowed.includes(paymentMethod)) {
      setPaymentMethod(allowed[0] as any);
    }
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const sourceMeta = SOURCES.find((s) => s.id === source)!;

  const filteredMenu = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    const list = menuQuery.data || [];
    if (!q) return list.filter((m) => m.isAvailable !== false).slice(0, 50);
    return list
      .filter((m) => m.isAvailable !== false)
      .filter((m) => (m.name || "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [menuQuery.data, menuSearch]);

  // Totals (mirroring the server-side calculation so the displayed total is consistent).
  const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  // Service charge + GST come from the server at submission time, but we estimate here
  // so the staff sees a believable total. The server is the source of truth.
  const [taxConfig, setTaxConfig] = useState<{ gstEnabled: boolean; gstRate: number; serviceChargePercentage: number }>({ gstEnabled: false, gstRate: 0, serviceChargePercentage: 0 });
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/public/business-settings");
        if (!res.ok) return;
        const s = await res.json();
        setTaxConfig({
          gstEnabled: s?.gstEnabled === true,
          gstRate: parseFloat(s?.gstRate?.toString() || "0") || 0,
          serviceChargePercentage: parseFloat(s?.serviceChargePercentage?.toString() || "0") || 0,
        });
      } catch {}
    })();
  }, [open]);

  const serviceCharge = +(subtotal * (taxConfig.serviceChargePercentage / 100)).toFixed(2);
  const taxable = taxConfig.gstEnabled ? subtotal + serviceCharge : 0;
  const taxAmount = +(taxable * (taxConfig.gstRate / 100)).toFixed(2);
  const total = +(subtotal + serviceCharge + taxAmount).toFixed(2);

  const validation = useMemo(() => {
    if (items.length === 0) return "Add at least one menu item";
    for (const it of items) {
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) return `Invalid quantity for ${it.name}`;
      if (!Number.isFinite(it.price) || it.price <= 0) return `Invalid price for ${it.name}`;
    }
    if (phoneDigits && !/^\d{10,15}$/.test(phoneDigits)) return "Phone must be 10-15 digits";
    if (customerName.length > 128) return "Customer name too long";
    return null;
  }, [items, phoneDigits, customerName]);

  const submit = useMutation({
    mutationFn: async () => {
      if (submitGuard.current) throw new Error("Already submitting");
      if (validation) throw new Error(validation);
      submitGuard.current = true;
      try {
        const res = await fetch("/api/aggregator/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            aggregatorOrderId: aggregatorOrderId.trim() || undefined,
            customerName: customerName.trim() || undefined,
            customerPhone: phoneDigits || undefined,
            paymentMethod,
            notes: notes.trim() || undefined,
            items: items.map((it) => ({
              menuItemId: it.menuItemId,
              quantity: it.quantity,
              notes: it.notes || undefined,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          submitGuard.current = false;
          throw new Error(data.error || "Failed to log order");
        }
        return data;
      } catch (err) {
        submitGuard.current = false;
        throw err;
      }
    },
    onSuccess: (data) => {
      const sourceLabel = SOURCES.find((s) => s.id === source)?.label;
      toast.success(
        data.existingCustomer
          ? `Order #${data.orderNumber} logged to ${sourceLabel} - ${data.loyaltyPointsEarned || 0} pts awarded`
          : `Order #${data.orderNumber} logged to ${sourceLabel}`,
        { duration: 4000 }
      );
      // Invalidate every query that depends on order data so all panels refresh.
      qc.invalidateQueries({ queryKey: ["aggregator-orders"] });
      qc.invalidateQueries({ queryKey: ["aggregator-stats"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["loyalty", data.customerPhone] });
      qc.invalidateQueries({ queryKey: ["spinStatus", data.customerPhone] });
      qc.invalidateQueries({ queryKey: ["menu-items-public"] });
      reset();
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to log order");
    },
  });

  const reset = () => {
    setCustomerName("");
    setCustomerPhone("");
    setAggregatorOrderId("");
    setNotes("");
    setItems([]);
    setMenuSearch("");
    setShowMenuPicker(false);
    setEditingNotesKey(null);
  };

  const addMenuItem = (m: MenuItem) => {
    const price = parseFloat(String(m.price));
    if (!Number.isFinite(price) || price <= 0) {
      toast.error(`${m.name} has no valid price - please fix in menu`);
      return;
    }
    setItems((prev) => {
      // If the same item is already in the cart, just bump the quantity.
      const existing = prev.find((it) => it.menuItemId === m.id);
      if (existing) {
        return prev.map((it) => (it.key === existing.key ? { ...it, quantity: it.quantity + 1 } : it));
      }
      return [
        ...prev,
        { key: genKey(), menuItemId: m.id, name: m.name, price, quantity: 1, notes: "" },
      ];
    });
    setShowMenuPicker(false);
    setMenuSearch("");
  };

  const setQuantity = (key: string, q: number) => {
    if (!Number.isFinite(q)) q = 1;
    q = Math.max(1, Math.min(99, Math.floor(q)));
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, quantity: q } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const setItemNotes = (key: string, n: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, notes: n.slice(0, 240) } : it)));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Add External Order</h2>
              <p className="text-xs text-slate-500">Zomato / Swiggy / Walk-in / Other</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {/* Source picker */}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-2 block uppercase tracking-wider">Order source</label>
            <div className="grid grid-cols-4 gap-2">
              {SOURCES.map((s) => {
                const Icon = s.Icon;
                const active = source === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSource(s.id)}
                    className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 transition-all ${
                      active ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? "text-blue-600" : s.color}`} />
                    <span className={`text-xs font-semibold ${active ? "text-blue-700" : "text-slate-600"}`}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Source-specific order ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                {sourceMeta.idLabel}{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input
                value={aggregatorOrderId}
                onChange={(e) => setAggregatorOrderId(e.target.value.slice(0, 64))}
                placeholder={
                  source === "zomato" ? "e.g. ZMT-789012"
                  : source === "swiggy" ? "e.g. SWG-123456"
                  : "e.g. walk-in 42"
                }
                inputMode="text"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Payment method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
              >
                {PAYMENT_FOR_SOURCE[source].map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Customer phone{" "}
                <span className="text-slate-400 font-normal">(optional, 10 digits)</span>
              </label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 15))}
                placeholder="10-digit mobile"
                inputMode="numeric"
              />
              {lookupQuery.data?.found && (
                <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Existing customer found{lookupQuery.data.lifetimeEarned ? ` - ${Math.round(lookupQuery.data.lifetimeEarned)} lifetime pts` : ""}</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Customer name{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value.slice(0, 128))}
                placeholder="e.g. Rahul"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Menu items
              </label>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setShowMenuPicker(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Item
              </Button>
            </div>

            {items.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowMenuPicker(true)}
                className="w-full p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-sm text-slate-500 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
              >
                <Search className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                Click to browse the menu and add items
              </button>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.key} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">{it.name}</div>
                        <div className="text-xs text-slate-500">
                          {formatRupees(it.price)} each
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQuantity(it.key, it.quantity - 1)}
                          className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={it.quantity}
                          onChange={(e) => setQuantity(it.key, parseInt(e.target.value || "1", 10))}
                          className="w-14 h-7 text-center text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setQuantity(it.key, it.quantity + 1)}
                          className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 w-20 text-right">
                        {formatRupees(it.price * it.quantity)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(it.key)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {editingNotesKey === it.key ? (
                      <Input
                        value={it.notes}
                        onChange={(e) => setItemNotes(it.key, e.target.value)}
                        onBlur={() => setEditingNotesKey(null)}
                        onKeyDown={(e) => { if (e.key === "Enter") setEditingNotesKey(null); }}
                        placeholder="Item note (e.g. extra spicy, no onion)"
                        autoFocus
                        className="h-7 text-xs"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingNotesKey(it.key)}
                        className="text-xs text-slate-500 hover:text-blue-600 truncate w-full text-left"
                      >
                        {it.notes || "+ Add note"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">
              Order notes{" "}
              <span className="text-slate-400 font-normal">(optional, applies to whole order)</span>
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 240))}
              placeholder="e.g. customer requested less sugar"
            />
          </div>

          {/* Totals breakdown */}
          <div className="border-t border-slate-200 pt-4 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-slate-900 font-medium">{formatRupees(subtotal)}</span>
            </div>
            {taxConfig.serviceChargePercentage > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Service charge ({taxConfig.serviceChargePercentage}%)</span>
                <span className="text-slate-900">{formatRupees(serviceCharge)}</span>
              </div>
            )}
            {taxConfig.gstEnabled && taxConfig.gstRate > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Tax / GST ({taxConfig.gstRate}%)</span>
                <span className="text-slate-900">{formatRupees(taxAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-base font-bold border-t border-slate-200 pt-2 mt-2">
              <span className="text-slate-900">Total</span>
              <span className="text-slate-900">{formatRupees(total)}</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Final total is computed by the server from the actual menu prices and tax settings.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-shrink-0 bg-slate-50">
          {validation ? (
            <div className="flex items-center gap-2 text-xs text-amber-700 min-w-0">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{validation}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>Ready to log</span>
            </div>
          )}
          <div className="flex gap-2 flex-shrink-0">
            <Button variant="outline" onClick={onClose} disabled={submit.isPending}>Cancel</Button>
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || !!validation}
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
            >
              <Save className="w-4 h-4 mr-1" />
              {submit.isPending ? "Logging..." : "Log Order"}
            </Button>
          </div>
        </div>
      </div>

      {/* Menu picker overlay */}
      {showMenuPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center gap-2">
              <Search className="w-5 h-5 text-slate-400" />
              <Input
                autoFocus
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder="Search menu items..."
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => { setShowMenuPicker(false); setMenuSearch(""); }}
                className="p-2 rounded-full hover:bg-slate-100"
                aria-label="Close menu picker"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {menuQuery.isLoading ? (
                <div className="text-center text-sm text-slate-500 py-8">Loading menu...</div>
              ) : filteredMenu.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-8">No matching items</div>
              ) : (
                <div className="space-y-1">
                  {filteredMenu.map((m) => {
                    const price = parseFloat(String(m.price));
                    const inCart = items.find((it) => it.menuItemId === m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => addMenuItem(m)}
                        disabled={!Number.isFinite(price) || price <= 0}
                        className="w-full flex items-center gap-2 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">{m.name}</div>
                          {!Number.isFinite(price) || price <= 0 ? (
                            <div className="text-xs text-red-600">No valid price</div>
                          ) : (
                            <div className="text-xs text-slate-500">{formatRupees(price)}</div>
                          )}
                        </div>
                        {inCart && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                            {inCart.quantity} in cart
                          </span>
                        )}
                        <ChevronDown className="w-4 h-4 -rotate-90 text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
