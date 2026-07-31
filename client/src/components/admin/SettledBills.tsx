import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useNetworkStatus } from "@/contexts/NetworkStatusContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, TrendingUp, Search, Clock, Bell, CheckCircle, MessageCircle, Trash2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import SendInvoiceModal from "./SendInvoiceModal";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { OrderGridSkeleton } from "@/components/Skeletons";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import { notificationSound } from "@/services/notificationSound";

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface SettledBillsProps {
  onPrint?: (data: { sessionId: number; table: any }) => void;
  highlightOrderId?: number | null;
}

export default function SettledBills({ onPrint, highlightOrderId }: SettledBillsProps) {
  const queryClient = useQueryClient();
  const { fmtPrice } = useFormatCurrency();
  const { enabled: soundEnabled, volume: soundVolume } = useSoundSettings();
  const { isOffline } = useNetworkStatus();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetailsKey, setSessionDetailsKey] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const lastOrderIdsRef = useRef<Set<number>>(new Set());
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("saveInvoiceCustomerInfo").single();
      return data;
    },
    staleTime: 60_000,
  });
  const showCustomerInfo = settings?.saveInvoiceCustomerInfo ?? true;

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: "settle" | "markPaid" | "deleteEmpty";
    sessionId: number;
    tableId?: number;
    label?: string;
  } | null>(null);
  const [settleName, setSettleName] = useState("");
  const [settlePhone, setSettlePhone] = useState("");

  // Note: settled bills query removed — settled bills section was removed from Orders tab.
  // queryClient.invalidateQueries({ queryKey: ['settledBills'] }) is still called after settling.

  const { data: activeOrders, isLoading: isLoadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['activeTables'],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'open');

      if (!sessions || sessions.length === 0) return [];

      const sessionIds = sessions.map((s: any) => s.id);
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .in('sessionId', sessionIds)
        .order('id', { ascending: true });

      const orderIds = (orders || []).map((o: any) => o.id);
      const { data: orderItems } = orderIds.length > 0
        ? await supabase.from('orderItems').select('*').in('orderId', orderIds)
        : { data: [] };

      const menuItemIds = Array.from(new Set((orderItems || []).map((i: any) => i.menuItemId)));
      const allMenuItems: any[] = await fetch("/api/public/menu-items").then((r) => r.json());
      const menuItemMap = new Map<number, string>(allMenuItems.filter((m) => menuItemIds.includes(m.id)).map((m) => [m.id, m.name]));
      const menuPriceMap = new Map<number, number>(allMenuItems.filter((m) => menuItemIds.includes(m.id)).map((m) => [m.id, parseFloat(m.price.toString())]));

      const tableIds = sessions.map((s: any) => s.tableId);
      const { data: tables } = await supabase
        .from('tables')
        .select('id, label')
        .in('id', tableIds);
      const tableLabelMap = new Map((tables || []).map((t: any) => [t.id, t.label]));

      const tableMap = new Map<number, {
        tableLabel: string;
        sessionId: number;
        orders: Array<{
          id: number;
          orderNumber: number | null;
          submittedAt: string;
          status: string;
          paymentMethod: string | null;
          paymentStatus: string;
          subtotal: number;
          itemCount: number;
          items: Array<{
            id: number;
            menuItemName: string;
            quantity: number;
            priceAtOrderTime: number;
          }>;
        }>;
      }>();

      for (const session of sessions) {
        const tableLabel = tableLabelMap.get(session.tableId) || 'Unknown';
        const sessionOrders = (orders || []).filter((o: any) => o.sessionId === session.id);

        if (!tableMap.has(session.tableId)) {
          tableMap.set(session.tableId, {
            tableLabel,
            sessionId: session.id,
            orders: []
          });
        }

        const tableData = tableMap.get(session.tableId)!;

        for (const order of sessionOrders) {
          const items = (orderItems || [])
            .filter((i: any) => i.orderId === order.id)
            .map((i: any) => {
              const storedPrice = parseFloat(i.priceAtOrderTime?.toString() || '0');
              const price = storedPrice > 0 ? storedPrice : (menuPriceMap.get(i.menuItemId) || 0);
              return {
                id: i.id,
                menuItemName: menuItemMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
                quantity: i.quantity,
                priceAtOrderTime: price,
              };
            });

          const subtotal = items.reduce((acc: number, item: any) => acc + (item.priceAtOrderTime * item.quantity), 0);
          const itemCount = items.reduce((acc: number, item: any) => acc + item.quantity, 0);

          tableData.orders.push({
            id: order.id,
            orderNumber: order.orderNumber,
            submittedAt: order.submittedAt,
            status: order.orderStatus || 'received',
            paymentMethod: order.paymentMethod || null,
            paymentStatus: order.paymentStatus || 'pending',
            subtotal,
            itemCount,
            items,
          });
        }
      }

      const result: Array<{
        id: number;
        label: string;
        sessionId: number;
        customerName: string | null;
        customerPhone: string | null;
        orders: Array<{ id: number; orderNumber: number | null; submittedAt: string; status: string; paymentMethod: string | null; paymentStatus: string; subtotal: number; itemCount: number; items: Array<{ id: number; menuItemName: string; quantity: number; priceAtOrderTime: number }> }>;
        subtotal: number;
        serviceCharge: number;
        taxAmount: number;
        finalTotal: number;
        lastActivityAt: string;
        hasPaymentPending: boolean;
        hasPaymentMarked: boolean;
        oldestPendingOrder: { orderNumber: number | null; items: Array<{ id: number; menuItemName: string; quantity: number; priceAtOrderTime: number }>; subtotal: number } | null;
      }> = [];
      const tableEntries = Array.from(tableMap.entries());
      for (const [tableId, tableData] of tableEntries) {
        const sess = sessions.find((s: any) => s.tableId === tableId);
        const sessionSubtotal = tableData.orders.reduce((acc: number, o: any) => acc + o.subtotal, 0);
        const storedSc = sess ? parseFloat(sess.serviceCharge?.toString() || '0') : 0;
        const storedTax = sess ? parseFloat(sess.taxAmount?.toString() || '0') : 0;
        const storedFinal = sess ? parseFloat(sess.finalTotal?.toString() || '0') : 0;

        const pendingOrders = tableData.orders.filter((o: any) => o.status !== 'settled');
        const hasPaymentPending = pendingOrders.length > 0;
        const oldestPendingOrder = hasPaymentPending ? pendingOrders[0] : null;

        const hasPaymentMarked = hasPaymentPending && pendingOrders.every((o: any) => o.paymentMethod === 'online' || o.paymentStatus === 'paid');

        result.push({
          id: tableId,
          label: tableData.tableLabel,
          sessionId: tableData.sessionId,
          customerName: sess?.customerName || null,
          customerPhone: sess?.customerPhone || null,
          orders: tableData.orders,
          subtotal: sessionSubtotal,
          serviceCharge: storedSc,
          taxAmount: storedTax,
          finalTotal: storedFinal,
          lastActivityAt: tableData.orders[tableData.orders.length - 1]?.submittedAt || new Date().toISOString(),
          hasPaymentPending,
          hasPaymentMarked,
          oldestPendingOrder,
        });
      }

      return result;
    }
  });

  const { data: todayRevenue } = useQuery({
    queryKey: ['todayRevenue'],
    refetchInterval: 10000,
    queryFn: async () => {
      const res = await fetch("/api/admin/settled-bills/today-revenue");
      if (!res.ok) return 0;
      const data = await res.json();
      return data.total as number;
    }
  });

  const { data: bizSettings } = useQuery({
    queryKey: ['businessSettings'],
    queryFn: async () => {
      return fetch("/api/public/business-settings").then((r) => r.json());
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: sessionDetails } = useQuery({
    queryKey: ['sessionDetails', selectedSessionId, sessionDetailsKey],
    enabled: !!selectedSessionId,
    queryFn: async () => {
      if (!selectedSessionId) return null;

      const [sessionRes, bizData] = await Promise.all([
        supabase.from('sessions').select('*').eq('id', selectedSessionId).maybeSingle(),
        fetch("/api/public/business-settings").then((r) => r.json()),
      ]);

      const session = sessionRes.data;
      const scRate = bizData ? parseFloat(bizData.serviceChargePercentage?.toString() || "0") : 0;
      const gstEnabled = bizData?.gstEnabled ?? false;
      const gstRate = gstEnabled ? (parseFloat(bizData?.gstRate?.toString() || '0') || 0) : 0;

      const subtotal = session ? (parseFloat(session.subtotal) || 0) : 0;
      const computedServiceCharge = subtotal * (scRate / 100);
      const taxableAmount = gstEnabled ? subtotal + computedServiceCharge : 0;
      const computedTax = taxableAmount * (gstRate / 100);
      const cgst = computedTax / 2;
      const sgst = computedTax / 2;
      const computedFinalTotal = subtotal + computedServiceCharge + computedTax;

      const { data: orders } = await supabase.from('orders').select('*').eq('sessionId', selectedSessionId);

      let allItems: Array<{ id: number; orderId: number; menuItemId: number; quantity: number; priceAtOrderTime: number; menuItemName: string }> = [];
      let ordersWithNumbers: Array<{ id: number; orderNumber: number | null; submittedAt: string; status: string; items: Array<{ id: number; orderId: number; menuItemId: number; quantity: number; priceAtOrderTime: number; menuItemName: string }> }> = [];
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const { data: items } = await supabase.from('orderItems').select('*').in('orderId', orderIds);
        if (items && items.length > 0) {
          const menuItemIds = Array.from(new Set(items.map(i => i.menuItemId)));
          const allMenuItems: any[] = await fetch("/api/public/menu-items").then((r) => r.json());
          const menuItemMap = new Map<number, string>(allMenuItems.filter((m) => menuItemIds.includes(m.id)).map((m) => [m.id, m.name]));
          const menuPriceMap = new Map<number, number>(allMenuItems.filter((m) => menuItemIds.includes(m.id)).map((m) => [m.id, parseFloat(m.price.toString())]));
          allItems = items.map(i => {
            const storedPrice = parseFloat(i.priceAtOrderTime?.toString() || '0');
            const price = storedPrice > 0 ? storedPrice : (menuPriceMap.get(i.menuItemId) || 0);
            return { ...i, menuItemName: menuItemMap.get(i.menuItemId) || `Item #${i.menuItemId}`, priceAtOrderTime: price };
          });
        }
        const sortedOrders = [...orders].sort((a, b) => {
          if (a.orderNumber != null && b.orderNumber != null) return (a.orderNumber as number) - (b.orderNumber as number);
          return a.id - b.id;
        });
        ordersWithNumbers = sortedOrders.map(o => ({
          ...o,
          status: o.orderStatus || 'received',
          items: allItems.filter(i => i.orderId === o.id)
        }));
      }

      return {
        session: session ? {
          ...session,
          computedSubtotal: subtotal,
          computedServiceCharge,
          computedTax,
          cgst,
          sgst,
          gstEnabled,
          gstRate,
          computedFinalTotal,
        } : null,
        orders: orders || [],
        items: allItems,
        ordersWithNumbers
      };
    }
  });

  const markAsPaidMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const { error } = await supabase.from('orders').update({ paymentStatus: 'paid' }).eq('sessionId', sessionId).neq('orderStatus', 'settled');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      toast.success("Payment recorded");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const settleBillMutation = useMutation({
    mutationFn: async ({ sessionId, customerName, customerPhone }: { sessionId: number; customerName?: string; customerPhone?: string }) => {
      // Check setting before saving customer info
      const { data: settings } = await supabase.from("businessSettings").select("saveInvoiceCustomerInfo").single();
      const shouldSave = settings?.saveInvoiceCustomerInfo ?? true;
      const nameToSave = shouldSave && customerName ? customerName : null;
      const phoneToSave = shouldSave && customerPhone ? customerPhone : null;

      // Fetch session data
      const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
      if (!session) throw new Error("Session not found");

      // Fetch table label
      const { data: tableRow } = await supabase.from('tables').select('label').eq('id', session.tableId).single();
      const tableLabel = tableRow?.label || "Unknown";

      // Fetch orders and items for snapshot
      const { data: ordersList } = await supabase.from('orders').select('id').eq('sessionId', sessionId);
      const orderIds = ordersList?.map((o: any) => o.id) || [];
      let itemsSnapshot: any[] = [];
      if (orderIds.length > 0) {
        const { data: items } = await supabase.from('orderItems').select('*').in('orderId', orderIds);
        itemsSnapshot = (items || []).map((item: any) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          priceAtOrderTime: parseFloat(item.priceAtOrderTime?.toString() || "0"),
          specialInstructions: item.specialInstructions,
        }));
      }

      // Update orders to settled
      if (orderIds.length > 0) {
        await supabase.from('orders').update({ orderStatus: 'settled' }).in('id', orderIds);
      }

      // Save customer info and settle session
      const sessionUpdate: any = { status: 'settled', settledAt: new Date().toISOString() };
      if (nameToSave) sessionUpdate.customerName = nameToSave;
      if (phoneToSave) sessionUpdate.customerPhone = phoneToSave;
      await supabase.from('sessions').update(sessionUpdate).eq('id', sessionId);

      // Free up table
      await supabase.from('tables').update({ status: 'empty', activeSessionId: null }).eq('id', session.tableId);

      // Create orderHistories record
      const subtotal = parseFloat(session.subtotal?.toString() || "0");
      const tax = parseFloat(session.taxAmount?.toString() || "0");
      const service = parseFloat(session.serviceCharge?.toString() || "0");
      const discount = parseFloat(session.discountAmount?.toString() || "0");
      const finalTotal = Math.max(0, subtotal + service + tax - discount);

      await supabase.from('orderHistories').insert({
        sessionId,
        tableLabel,
        itemsSnapshot,
        editsSnapshot: [],
        subtotal: session.subtotal?.toString() || "0",
        taxAmount: session.taxAmount?.toString() || "0",
        serviceCharge: session.serviceCharge?.toString() || "0",
        discountAmount: session.discountAmount?.toString() || "0",
        discountReason: session.discountReason || null,
        finalTotal: finalTotal.toString(),
        customerName: nameToSave || session.customerName || null,
        customerPhone: phoneToSave || session.customerPhone || null,
        settledAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['todayRevenue'] });
      queryClient.invalidateQueries({ queryKey: ['settledBills'] });
      queryClient.invalidateQueries({ queryKey: ['settledBillsHistory'] });
      toast.success("Bill settled successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteEmptyMutation = useMutation({
    mutationFn: async ({ sessionId, tableId }: { sessionId: number; tableId: number }) => {
      await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', sessionId);
      await supabase.from('tables').update({ status: 'empty', activeSessionId: null }).eq('id', tableId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success("Empty table removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (activeOrders && activeOrders.length > 0) {
      const currentOrderIds = new Set<number>();
      activeOrders.forEach((table: any) => {
        table.orders?.forEach((o: any) => currentOrderIds.add(o.id));
      });

      if (lastOrderIdsRef.current.size > 0) {
        const newOrders = Array.from(currentOrderIds).filter(id => !lastOrderIdsRef.current.has(id));
        if (newOrders.length > 0) {
          if (soundEnabled) {
            notificationSound.play(soundVolume / 100);
          }
          toast.success("New order received!", { duration: 2000 });
        }
      }

      lastOrderIdsRef.current = currentOrderIds;
    }
  }, [activeOrders, soundEnabled, soundVolume]);

  useEffect(() => {
    if (highlightOrderId && cardsContainerRef.current) {
      const el = cardsContainerRef.current.querySelector(`[data-order-id="${highlightOrderId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-blue-500", "ring-offset-2"), 3000);
      }
    }
  }, [highlightOrderId, activeOrders]);

  const [sendInvoiceSessionId, setSendInvoiceSessionId] = useState<number | null>(null);

  return (
    <>
      <SendInvoiceModal
        open={sendInvoiceSessionId !== null}
        onOpenChange={(open) => { if (!open) setSendInvoiceSessionId(null); }}
        sessionId={sendInvoiceSessionId ?? 0}
        customerName={activeOrders?.find((t: any) => t.sessionId === sendInvoiceSessionId)?.customerName}
        customerPhone={activeOrders?.find((t: any) => t.sessionId === sendInvoiceSessionId)?.customerPhone}
      />

      {/* Confirmation Dialog for destructive actions */}
      <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              {confirmAction?.type === "settle" && "Settle Bill"}
              {confirmAction?.type === "markPaid" && "Mark as Paid"}
              {confirmAction?.type === "deleteEmpty" && "Delete Empty Session"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {confirmAction?.type === "settle" && (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  This will mark all orders as settled, close the session, and free up <strong>{confirmAction.label}</strong>. This action cannot be undone.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Customer Name</label>
                    <input
                      type="text"
                      value={settleName}
                      onChange={(e) => setSettleName(e.target.value)}
                      placeholder="Enter customer name"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Mobile Number</label>
                    <input
                      type="tel"
                      value={settlePhone}
                      onChange={(e) => setSettlePhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Enter 10-digit mobile"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </>
            )}
            {confirmAction?.type === "markPaid" && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This will mark all pending orders for <strong>{confirmAction.label}</strong> as paid. This action cannot be undone.
              </p>
            )}
            {confirmAction?.type === "deleteEmpty" && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This will delete the empty session for <strong>{confirmAction.label}</strong> and free up the table. This action cannot be undone.
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "deleteEmpty" ? "destructive" : "default"}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "settle") {
                  settleBillMutation.mutate({
                    sessionId: confirmAction.sessionId,
                    customerName: settleName.trim() || undefined,
                    customerPhone: settlePhone.trim() || undefined,
                  });
                } else if (confirmAction.type === "markPaid") {
                  markAsPaidMutation.mutate(confirmAction.sessionId);
                } else if (confirmAction.type === "deleteEmpty" && confirmAction.tableId) {
                  deleteEmptyMutation.mutate({ sessionId: confirmAction.sessionId, tableId: confirmAction.tableId });
                }
                setConfirmAction(null);
                setSettleName("");
                setSettlePhone("");
              }}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {isLoadingOrders ? (
          <>
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 md:p-6 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  </div>
                  <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </div>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Active Tables</p>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">{activeOrders?.length || 0}</p>
                </div>
                <Users className="w-8 md:w-10 h-8 md:h-10 text-blue-500 opacity-20" />
              </div>
            </Card>

            <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Items</p>
                  <p className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                    {activeOrders?.reduce((acc: number, t: any) => acc + t.orders.reduce((s: number, o: any) => s + o.itemCount, 0), 0) || 0}
                  </p>
                </div>
                <TrendingUp className="w-8 md:w-10 h-8 md:h-10 text-green-500 opacity-20" />
              </div>
            </Card>

            <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Total Revenue</p>
                  <p className="text-2xl md:text-3xl font-bold text-green-500">
                    {fmtPrice(todayRevenue || 0)}
                  </p>
                </div>
                <TrendingUp className="w-8 md:w-10 h-8 md:h-10 text-green-400 opacity-20" />
              </div>
            </Card>
          </>
        )}
      </div>

      {isLoadingOrders ? (
        <>
          <div className="h-10 w-full max-w-sm bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse mb-6" />
          <OrderGridSkeleton />
        </>
      ) : activeOrders && activeOrders.length > 0 ? (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search by table name..."
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-white dark:bg-slate-900"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" ref={cardsContainerRef}>
            {activeOrders
              .filter((t: any) => !orderSearch || t.label.toLowerCase().includes(orderSearch.toLowerCase()))
              .map(table => (
            <Card
              key={table.id}
              data-order-id={table.orders[table.orders.length - 1]?.id}
              className="p-4 md:p-6 hover:shadow-lg transition-shadow cursor-pointer bg-white dark:bg-slate-900"
              onClick={() => {
                setSelectedSessionId(table.sessionId);
                setSessionDetailsKey(k => k + 1);
                setShowDetails(true);
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{table.label}</h3>
                    {table.orders.reduce((acc: number, o: any) => acc + o.itemCount, 0) === 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmAction({ type: "deleteEmpty", sessionId: table.sessionId, tableId: table.id, label: table.label });
                        }}
                        className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 transition-colors"
                        disabled={deleteEmptyMutation.isPending}
                        title="Delete empty session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {table.customerName && (
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1">
                      {table.customerName}{table.customerPhone ? ` · ${table.customerPhone}` : ""}
                    </p>
                  )}
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {new Date(table.lastActivityAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {table.hasPaymentPending && table.oldestPendingOrder && (
                    <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400">
                      Payment pending
                    </Badge>
                  )}
                  {table.orders.map((o: any) => (
                    <div key={o.id} className="flex flex-wrap items-center gap-1 justify-end">
                      {o.status === 'delivered' ? (
                        <Badge className="text-xs bg-green-600">Served</Badge>
                      ) : o.status === 'received' || o.status === 'pending' ? (
                        <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400">
                          {o.status === 'received' ? 'Received' : 'Pending'}
                        </Badge>
                      ) : o.status === 'preparing' ? (
                        <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400">Preparing</Badge>
                      ) : o.status === 'ready' ? (
                        <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400">Ready</Badge>
                      ) : null}
                      {o.paymentMethod && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">{o.paymentMethod}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {table.orders.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {table.orders[table.orders.length - 1].items.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900 dark:text-white">{item.quantity}× {item.menuItemName}</span>
                      <span className="text-slate-600 dark:text-slate-400">{fmtPrice(item.priceAtOrderTime * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold text-slate-900 dark:text-white mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span>Subtotal</span>
                    <span>{fmtPrice(table.orders[table.orders.length - 1].subtotal)}</span>
                  </div>
                </div>
              )}

              {table.hasPaymentPending && table.oldestPendingOrder && (
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-2 mb-3">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">
                    Order #{table.oldestPendingOrder.orderNumber?.toString().padStart(3, '0') || '?'} (Payment Pending)
                  </p>
                  <div className="space-y-0.5">
                    {table.oldestPendingOrder.items.map((item: any) => (
                      <div key={item.id} className="flex justify-between text-xs text-blue-900 dark:text-blue-300">
                        <span>{item.quantity}× {item.menuItemName}</span>
                        <span>{fmtPrice(item.priceAtOrderTime * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-blue-900 dark:text-blue-300 mt-1 pt-1 border-t border-blue-200 dark:border-blue-800">
                    <span>Subtotal</span>
                    <span>{fmtPrice(table.oldestPendingOrder.subtotal)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Items</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {table.orders.reduce((acc: number, o: any) => acc + o.itemCount, 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Subtotal</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{fmtPrice(table.subtotal)}</span>
                </div>
                {table.serviceCharge > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">Service Charge</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{fmtPrice(table.serviceCharge)}</span>
                  </div>
                )}
                {table.taxAmount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400">GST</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{fmtPrice(table.taxAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total</span>
                  <span className="text-lg font-bold text-green-500">{fmtPrice(table.finalTotal)}</span>
                </div>
              </div>

              {table.hasPaymentMarked && bizSettings && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4 bg-slate-50 dark:bg-slate-800 text-xs" id={`invoice-${table.sessionId}`}>
                  <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-3 mb-3">
                    {bizSettings.logoUrl && (
                      <img src={bizSettings.logoUrl} alt="Logo" width={40} height={40} loading="lazy" className="h-10 mx-auto mb-1.5 object-contain" />
                    )}
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{bizSettings.restaurantName || 'Restaurant'}</h4>
                    <p className="text-slate-500 dark:text-slate-400">{bizSettings.address}{bizSettings.city ? `, ${bizSettings.city}` : ''}{bizSettings.state ? `, ${bizSettings.state}` : ''}</p>
                    <p className="text-slate-500 dark:text-slate-400">{bizSettings.phone}</p>
                    {bizSettings.gstNumber && <p className="text-slate-500 dark:text-slate-400">GST: {bizSettings.gstNumber}</p>}
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400 mb-2">
                    <span>Invoice: {bizSettings.invoicePrefix || 'INV-'}{String(table.sessionId).padStart(6, '0')}</span>
                    <span>{new Date().toLocaleDateString('en-IN')}</span>
                  </div>
                  <table className="w-full mb-2">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-1 font-semibold text-slate-700 dark:text-slate-300">Item</th>
                        <th className="text-center py-1 font-semibold text-slate-700 dark:text-slate-300">Qty</th>
                        <th className="text-right py-1 font-semibold text-slate-700 dark:text-slate-300">Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.orders.flatMap((o: any) => o.items).map((item: any, i: number) => (
                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-1 text-slate-700 dark:text-slate-300">{item.menuItemName}</td>
                          <td className="py-1 text-center text-slate-700 dark:text-slate-300">{item.quantity}</td>
                          <td className="py-1 text-right text-slate-700 dark:text-slate-300">{fmtPrice(item.priceAtOrderTime * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-1">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>Subtotal</span><span>{fmtPrice(table.subtotal)}</span></div>
                    {bizSettings.gstEnabled && bizSettings.gstRate > 0 && (
                      <>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>CGST ({bizSettings.gstRate / 2}%)</span><span>{fmtPrice((table.subtotal + (table.serviceCharge || 0)) * bizSettings.gstRate / 200)}</span></div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400"><span>SGST ({bizSettings.gstRate / 2}%)</span><span>{fmtPrice((table.subtotal + (table.serviceCharge || 0)) * bizSettings.gstRate / 200)}</span></div>
                      </>
                    )}
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span>Total</span>
                      <span className="text-green-500">{fmtPrice(table.finalTotal)}</span>
                    </div>
                  </div>
                  {bizSettings.footerMessage && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400 whitespace-pre-line">{bizSettings.footerMessage}</div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {table.hasPaymentPending && !table.hasPaymentMarked ? (
                  <>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSessionId(table.sessionId);
                        setSessionDetailsKey(k => k + 1);
                        setShowDetails(true);
                      }}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5"
                    >
                      View Details
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction({ type: "markPaid", sessionId: table.sessionId, label: table.label });
                      }}
                      variant="outline"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900 dark:hover:bg-emerald-500 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5"
                      disabled={markAsPaidMutation.isPending}
                    >
                      Mark as Paid
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmAction({ type: "settle", sessionId: table.sessionId, label: table.label });
                      }}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5"
                      disabled={settleBillMutation.isPending}
                    >
                      Settle Bill
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isOffline) {
                          toast.error("No Internet", { description: "WhatsApp sharing requires an internet connection." });
                          return;
                        }
                        setSendInvoiceSessionId(table.sessionId);
                      }}
                      disabled={isOffline}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900 dark:hover:bg-emerald-500 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <MessageCircle className="w-3.5 h-3.5 mr-2" />
                      {isOffline ? "Offline" : "Send via WhatsApp"}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      </>) : (
        <Card className="p-8 md:p-12 text-center bg-white dark:bg-slate-900">
          <Bell className="w-10 md:w-12 h-10 md:h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">No active tables</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Orders will appear here when customers place them</p>
        </Card>
      )}

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-full md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {sessionDetails && (
            <div className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Session Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Created</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {new Date(sessionDetails.session?.createdAt || '').toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Status</p>
                    <p className="font-semibold text-slate-900 dark:text-white capitalize">
                      {sessionDetails.session?.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Items</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {sessionDetails.items?.reduce((sum: number, i: any) => sum + i.quantity, 0)}
                    </p>
                  </div>
                  {sessionDetails.session?.customerName && (
                    <div>
                      <p className="text-slate-600 dark:text-slate-400">Customer</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {sessionDetails.session.customerName}
                        {sessionDetails.session.customerPhone ? ` (${sessionDetails.session.customerPhone})` : ""}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">Subtotal</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {fmtPrice(sessionDetails.session?.computedSubtotal)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">CGST ({((sessionDetails.session?.gstRate || 0) / 2).toFixed(1)}%)</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {fmtPrice(sessionDetails.session?.cgst || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 dark:text-slate-400">SGST ({((sessionDetails.session?.gstRate || 0) / 2).toFixed(1)}%)</p>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {fmtPrice(sessionDetails.session?.sgst || 0)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-slate-600 dark:text-slate-400">Final Total</p>
                    <p className="font-semibold text-green-500 text-lg">
                      {fmtPrice(sessionDetails.session?.computedFinalTotal)}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Orders ({sessionDetails.ordersWithNumbers?.length || 0})</h4>
                <div className="space-y-4">
                  {sessionDetails.ordersWithNumbers?.map((order: any) => (
                    <div key={order.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">#{order.orderNumber?.toString().padStart(3, '0') || order.id}</span>
                          {(() => {
                            switch (order.status) {
                              case 'delivered': return <Badge className="text-xs bg-green-600">Served</Badge>;
                              case 'received': case 'pending': return <Badge variant="outline" className="text-xs bg-yellow-50 dark:bg-yellow-950 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-400">Received</Badge>;
                              case 'preparing': return <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400">Preparing</Badge>;
                              case 'ready': return <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400">Ready</Badge>;
                              case 'settled': return <Badge className="text-xs bg-green-600">Paid</Badge>;
                              default: return null;
                            }
                          })()}
                          {order.paymentStatus === 'paid' && (
                            <Badge className="text-xs bg-blue-600">Online</Badge>
                          )}
                          {order.paymentStatus === 'pending' && order.paymentMethod === 'counter' && (
                            <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">Counter</Badge>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(order.submittedAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="space-y-1.5">
                        {order.items?.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              {item.delivered && (
                                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                              )}
                              <div>
                                <p className={`font-medium ${item.delivered ? 'text-green-700 dark:text-green-400' : 'text-slate-900 dark:text-white'}`}>{item.menuItemName}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {fmtPrice(typeof item.priceAtOrderTime === 'string'
                                    ? parseFloat(item.priceAtOrderTime)
                                    : (item.priceAtOrderTime as number))}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">{item.quantity}</Badge>
                          </div>
                        ))}
                        {order.items?.length === 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 italic">No items in this order</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
