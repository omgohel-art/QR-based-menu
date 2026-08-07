interface QueueItem {
  id: number;
  orderNumber: number | null;
  tableLabel: string;
  submittedAt: string;
  orderStatus: string;
  paymentMethod: string | null;
  paymentStatus: string;
  items: QueueItemRow[];
}

interface QueueItemRow {
  id: number;
  menuItemName: string;
  quantity: number;
  delivered: boolean;
}

interface DbSession {
  id: number;
  tableId: number;
  status: string;
  [key: string]: unknown;
}

interface DbOrder {
  id: number;
  sessionId: number;
  orderNumber: number | null;
  submittedAt: string;
  orderStatus: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  [key: string]: unknown;
}

interface DbOrderItem {
  id: number;
  orderId: number;
  menuItemId: number;
  quantity: number;
  delivered: boolean;
  [key: string]: unknown;
}

interface DbTable {
  id: number;
  label: string;
  [key: string]: unknown;
}

interface DbMenuItem {
  id: number;
  name: string;
  [key: string]: unknown;
}

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, CheckCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { OrderGridSkeleton } from "@/components/Skeletons";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import { notificationSound } from "@/services/notificationSound";
import { useStaffLanguage } from "@/contexts/StaffLanguageContext";

interface OrderQueueProps {
  highlightOrderId?: number | null;
}

export default function OrderQueue({ highlightOrderId }: OrderQueueProps) {
  const queryClient = useQueryClient();
  const { t, statusLabel } = useStaffLanguage();
  const { enabled: soundEnabled, volume: soundVolume } = useSoundSettings();
  const lastOrderIdsRef = useRef<Set<number>>(new Set());
  const [selectedQueueOrder, setSelectedQueueOrder] = useState<QueueItem | null>(null);
  const [showQueueDetail, setShowQueueDetail] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ itemId: number; itemName: string; action: 'serve' | 'undo' } | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  const { data: orderQueue, isLoading: isLoadingQueue } = useQuery({
    queryKey: ['orderQueue'],
    refetchInterval: 3000,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'open');

      if (!sessions || sessions.length === 0) return [];

      const sessionIds = (sessions as DbSession[]).map((s) => s.id);
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .in('sessionId', sessionIds)
        .not('orderStatus', 'in', '("delivered","settled")')
        .order('id', { ascending: true });

      if (!orders || orders.length === 0) return [];

      const orderIds = (orders as DbOrder[]).map((o) => o.id);
      const { data: orderItems } = await supabase
        .from('orderItems')
        .select('*')
        .in('orderId', orderIds);

      const menuItemIds = Array.from(new Set((orderItems as DbOrderItem[] || []).map((i) => i.menuItemId)));
      const allMenuItems = await fetch("/api/public/menu-items").then((r) => r.json());
      const menuItemMap = new Map((allMenuItems as DbMenuItem[]).filter((m) => menuItemIds.includes(m.id)).map((m) => [m.id, m.name]));

      const tableIds = (sessions as DbSession[]).map((s) => s.tableId);
      const { data: tables } = await supabase
        .from('tables')
        .select('id, label')
        .in('id', tableIds);
      const tableLabelMap = new Map((tables as DbTable[] || []).map((t) => [t.id, t.label]));

      const result: QueueItem[] = [];
      for (const session of sessions as DbSession[]) {
        const sessionOrders = (orders as DbOrder[]).filter((o) => o.sessionId === session.id);
        for (const order of sessionOrders) {
          const items: QueueItemRow[] = (orderItems as DbOrderItem[] || [])
            .filter((i) => i.orderId === order.id)
            .map((i) => ({
              id: i.id,
              menuItemName: menuItemMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
              quantity: i.quantity,
              delivered: i.delivered,
            }));

          result.push({
            id: order.id,
            orderNumber: order.orderNumber,
            tableLabel: tableLabelMap.get(session.tableId) || 'Unknown',
            submittedAt: order.submittedAt,
            orderStatus: order.orderStatus || 'received',
            paymentMethod: order.paymentMethod || null,
            paymentStatus: order.paymentStatus || 'pending',
            items,
          });
        }
      }

      return result;
    }
  });

  const printKOTMutation = useMutation({
    mutationFn: async (order: QueueItem) => {
      const kot = {
        orderNumber: order.orderNumber,
        table: order.tableLabel,
        date: new Date(order.submittedAt).toLocaleDateString(),
        time: new Date(order.submittedAt).toLocaleTimeString(),
        type: "DINE-IN",
        items: order.items.map((i) => ({
          name: i.menuItemName,
          qty: i.quantity,
          variantSelections: [], // we will fill this once we fetch it properly
          specialInstructions: "", // we will fill this once we fetch it properly
        })),
      };
      
      const { data: auth } = await supabase.auth.getSession();
      const token = auth.session?.access_token || localStorage.getItem("token");
      const res = await fetch("/api/print-kot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ kot })
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to print KOT");
      }
      return res.json();
    },
    onSuccess: (data: { queued?: boolean; message?: string }) => {
      toast.success(data?.queued ? (data.message || "KOT queued for print agent") : "KOT printed successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      const { error } = await supabase.from('orders').update({ orderStatus: status }).eq('id', orderId);
      if (error) throw error;
      
      // Reverse loyalty points if order is cancelled
      if (status === 'cancelled') {
        try {
          // Get the order's session to find customerPhone
          const { data: order } = await supabase.from('orders').select('sessionId, loyaltyPointsEarned, loyaltyReversed').eq('id', orderId).single();
          if (order && order.loyaltyPointsEarned > 0 && !order.loyaltyReversed) {
            const { data: session } = await supabase.from('sessions').select('customerPhone').eq('id', order.sessionId).single();
            if (session?.customerPhone) {
              await fetch('/api/loyalty/reverse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerPhone: session.customerPhone, orderId }),
              });
            }
          }
        } catch (err) {
          console.error('Failed to reverse loyalty points:', err);
        }
      }
    },
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['orderQueue'] });
      const prev = queryClient.getQueryData<QueueItem[]>(['orderQueue']);
      queryClient.setQueryData<QueueItem[]>(['orderQueue'], (old) =>
        old?.map((o) => (o.id === orderId ? { ...o, orderStatus: status } : o))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['orderQueue'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orderQueue'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
    },
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const { error } = await supabase.from('orders').update({ orderStatus: 'delivered' }).eq('id', orderId);
      if (error) throw error;
    },
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: ['orderQueue'] });
      const prev = queryClient.getQueryData<QueueItem[]>(['orderQueue']);
      queryClient.setQueryData<QueueItem[]>(['orderQueue'], (old) =>
        old?.map((o) => (o.id === orderId ? { ...o, orderStatus: 'delivered' } : o))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['orderQueue'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orderQueue'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
    },
  });

  const markItemDeliveredMutation = useMutation({
    mutationFn: async ({ itemId, orderId }: { itemId: number; orderId: number }) => {
      const { error } = await supabase.from('orderItems').update({ delivered: true }).eq('id', itemId);
      if (error) throw error;
      const { data: remaining } = await supabase
        .from('orderItems')
        .select('id')
        .eq('orderId', orderId)
        .eq('delivered', false);
      if (!remaining || remaining.length === 0) {
        await supabase.from('orders').update({ orderStatus: 'delivered' }).eq('id', orderId);
      }
      return { allDelivered: !remaining || remaining.length === 0 };
    },
    onMutate: async ({ itemId, orderId }) => {
      await queryClient.cancelQueries({ queryKey: ['orderQueue'] });
      const prev = queryClient.getQueryData<QueueItem[]>(['orderQueue']);
      queryClient.setQueryData<QueueItem[]>(['orderQueue'], (old) =>
        old?.map((o) => o.id === orderId ? {
          ...o,
          items: o.items.map((it) => it.id === itemId ? { ...it, delivered: true } : it),
          orderStatus: o.items.every((it) => it.id === itemId || it.delivered) ? 'delivered' : o.orderStatus,
        } : o)
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['orderQueue'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orderQueue'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
    },
  });

  const undoMarkItemDeliveredMutation = useMutation({
    mutationFn: async ({ itemId, orderId }: { itemId: number; orderId: number }) => {
      const { error } = await supabase.from('orderItems').update({ delivered: false }).eq('id', itemId);
      if (error) throw error;
      await supabase.from('orders').update({ orderStatus: 'received' }).eq('id', orderId).eq('orderStatus', 'delivered');
    },
    onMutate: async ({ itemId, orderId }) => {
      await queryClient.cancelQueries({ queryKey: ['orderQueue'] });
      const prev = queryClient.getQueryData<QueueItem[]>(['orderQueue']);
      queryClient.setQueryData<QueueItem[]>(['orderQueue'], (old) =>
        old?.map((o) => o.id === orderId ? {
          ...o,
          items: o.items.map((it) => it.id === itemId ? { ...it, delivered: false } : it),
          orderStatus: 'received',
        } : o)
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['orderQueue'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orderQueue'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
    },
  });

  useEffect(() => {
    if (orderQueue && orderQueue.length > 0) {
      const currentOrderIds = new Set(orderQueue.map((o) => o.id));
      if (lastOrderIdsRef.current.size > 0) {
        const newOrders = Array.from(currentOrderIds).filter((id) => !lastOrderIdsRef.current.has(id));
        if (newOrders.length > 0 && soundEnabled) {
          notificationSound.play(soundVolume / 100);
        }
      }
      lastOrderIdsRef.current = currentOrderIds;
    }
  }, [orderQueue, soundEnabled, soundVolume]);

  useEffect(() => {
    if (highlightOrderId && cardsContainerRef.current) {
      const el = cardsContainerRef.current.querySelector(`[data-order-id="${highlightOrderId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-blue-500", "ring-offset-2"), 3000);
      }
    }
  }, [highlightOrderId, orderQueue]);

  return (
    <div className="space-y-6">
      {isLoadingQueue ? (
        <OrderGridSkeleton />
      ) : orderQueue && orderQueue.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" ref={cardsContainerRef}>
          {orderQueue.map(order => (
            <Card
              key={order.id}
              data-order-id={order.id}
              className="p-4 md:p-5 bg-white dark:bg-slate-900 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedQueueOrder(order);
                setShowQueueDetail(true);
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{order.tableLabel}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {new Date(order.submittedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                    order.orderStatus === 'preparing' ? 'bg-amber-100 text-amber-700' :
                    order.orderStatus === 'ready' ? 'bg-blue-100 text-blue-700' :
                    order.orderStatus === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {statusLabel(order.orderStatus || 'received')}
                  </span>
                  <Badge variant="outline" className="text-xs font-mono">
                    #{order.orderNumber?.toString().padStart(3, '0') || order.id}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                {order.items.map((item: QueueItemRow) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className={`text-slate-900 dark:text-white ${item.delivered ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                      {item.quantity}× {item.menuItemName}
                    </span>
                    {item.delivered && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                ))}
              </div>

              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedQueueOrder(order);
                  setShowQueueDetail(true);
                }}
                className="w-full min-h-12 text-base bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900 dark:hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all duration-200 gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {t("manageItems")}
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 md:p-12 text-center bg-white dark:bg-slate-900">
          <CheckCircle className="w-10 md:w-12 h-10 md:h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">{t("noPendingOrders")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{t("ordersAppearHere")}</p>
        </Card>
      )}

      {/* Order Queue Item Detail Dialog */}
      <Dialog open={showQueueDetail} onOpenChange={(open) => { setShowQueueDetail(open); if (!open) setSelectedQueueOrder(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex justify-between items-center pr-8">
              <span>{selectedQueueOrder?.tableLabel} — #{selectedQueueOrder?.orderNumber?.toString().padStart(3, '0') || ''}</span>
              {selectedQueueOrder && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => printKOTMutation.mutate(selectedQueueOrder)}
                  disabled={printKOTMutation.isPending}
                  className="gap-2 min-h-10"
                >
                  <Printer className="w-4 h-4" />
                  {t("printKot")}
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedQueueOrder && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(selectedQueueOrder.submittedAt).toLocaleTimeString()}
              </p>
              <div className="space-y-3">
                {selectedQueueOrder.items.map((item: QueueItemRow) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <input
                      type="checkbox"
                      id={`delivery-cbx-${item.id}`}
                      className="delivery-cbx hidden"
                      checked={item.delivered}
                      onChange={() => {
                        if (!item.delivered) {
                          setConfirmDialog({ itemId: item.id, itemName: `${item.quantity}× ${item.menuItemName}`, action: 'serve' });
                        } else {
                          setConfirmDialog({ itemId: item.id, itemName: `${item.quantity}× ${item.menuItemName}`, action: 'undo' });
                        }
                      }}
                    />
                    <label htmlFor={`delivery-cbx-${item.id}`} className="delivery-check flex-shrink-0">
                      <svg viewBox="0 0 24 24" width="18" height="18">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                        <polyline points="7 12 10 15 17 8" />
                      </svg>
                    </label>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${item.delivered ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                        {item.quantity}× {item.menuItemName}
                      </p>
                    </div>
                    {item.delivered && (
                      <span className="text-xs text-green-600 font-medium">{t("served")}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => { setShowQueueDetail(false); setSelectedQueueOrder(null); }}
                >
                  {t("close")}
                </Button>
                <div className="flex-1 flex gap-2">
                  {selectedQueueOrder && (() => {
                    const allDelivered = selectedQueueOrder.items?.every((i: QueueItemRow) => i.delivered);
                    const nextStatuses = [
                      ...(!allDelivered ? [{ key: 'preparing' as const, label: t("preparing"), color: 'bg-amber-500 hover:bg-amber-600' }] : []),
                      ...(!allDelivered ? [{ key: 'ready' as const, label: t("ready"), color: 'bg-blue-500 hover:bg-blue-600' }] : []),
                      { key: 'delivered' as const, label: t("served"), color: 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900 dark:hover:bg-emerald-500' },
                    ];
                    return nextStatuses.map(s => (
                      <Button
                        key={s.key}
                        className={`flex-1 text-white text-sm min-h-11 font-semibold ${s.color}`}
                        onClick={() => {
                          updateOrderStatusMutation.mutate({ orderId: selectedQueueOrder.id, status: s.key });
                          if (s.key === 'delivered') {
                            setTimeout(() => {
                              setShowQueueDetail(false);
                              setSelectedQueueOrder(null);
                            }, 300);
                          }
                        }}
                      >
                        {s.label}
                      </Button>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}
          {confirmDialog && (
            <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-lg p-6">
              <p className="text-base font-semibold text-slate-900 dark:text-white text-center mb-1">
                {confirmDialog.action === 'serve' ? t("confirmServed") : t("undoServed")}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">"{confirmDialog.itemName}"</p>
              <div className="flex gap-3 w-full">
                <Button
                  variant="outline"
                  className="flex-1 min-h-11"
                  onClick={() => setConfirmDialog(null)}
                >
                  {t("cancel")}
                </Button>
                <Button
                  disabled={markItemDeliveredMutation.isPending || undoMarkItemDeliveredMutation.isPending}
                  className={`flex-1 min-h-11 ${confirmDialog.action === 'serve' ? 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-400 dark:text-slate-900 dark:hover:bg-emerald-500' : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200'} text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50`}
                  onClick={() => {
                    const item = confirmDialog;
                    setConfirmDialog(null);
                    const currentOrder = selectedQueueOrder;
                    if (item.action === 'serve') {
                      setSelectedQueueOrder((prev: QueueItem | null) => {
                        if (!prev) return prev;
                        const updatedItems = prev.items.map((it: QueueItemRow) =>
                          it.id === item.itemId ? { ...it, delivered: true } : it
                        );
                        const allDone = updatedItems.every((it: QueueItemRow) => it.delivered);
                        if (allDone && currentOrder) {
                          setTimeout(() => {
                            markDeliveredMutation.mutate(currentOrder.id);
                            setShowQueueDetail(false);
                            setSelectedQueueOrder(null);
                          }, 400);
                        }
                        return { ...prev, items: updatedItems };
                      });
                      if (currentOrder) markItemDeliveredMutation.mutate({ itemId: item.itemId, orderId: currentOrder.id });
                    } else {
                      setSelectedQueueOrder((prev: QueueItem | null) => {
                        if (!prev) return prev;
                        const updatedItems = prev.items.map((it: QueueItemRow) =>
                          it.id === item.itemId ? { ...it, delivered: false } : it
                        );
                        return { ...prev, items: updatedItems };
                      });
                      if (currentOrder) undoMarkItemDeliveredMutation.mutate({ itemId: item.itemId, orderId: currentOrder.id });
                    }
                  }}
                >
                  {confirmDialog.action === 'serve' ? t("confirm") : t("yesUndo")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
