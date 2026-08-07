import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useNotifications } from "@/contexts/NotificationContext";

const TABLE_KEY_MAP: Record<string, string[][]> = {
  sessions: [
    ["activeTables"],
    ["settledBills"],
    ["todayRevenue"],
    ["analytics", "dailyRevenue"],
    ["analytics", "todayStats"],
    ["analytics-revenue-detail"],
    ["analytics-revenue-chart"],
    ["analytics-tables-detail"],
    ["analytics-table-breakdown-detail"],
    ["analytics-orders-detail"],
    ["analytics-billing-detail"],
  ],
  orders: [
    ["orderQueue"],
    ["recentOrders"],
    ["activeTables"],
    ["analytics", "popularItems"],
    ["analytics-orders-detail"],
    ["analytics-billing-detail"],
  ],
  orderItems: [
    ["analytics", "popularItems"],
    ["orderBill"],
    ["orderStatus"],
    ["analytics-products-detail"],
  ],
  orderHistories: [
    ["analytics-revenue-detail"],
    ["analytics-billing-detail"],
    ["analytics-revenue-chart"],
    ["settledBillsHistory"],
  ],
  menuItems: [
    ["menuItems"],
  ],
  businessSettings: [
    ["businessSettings"],
    ["brandIntro"],
    ["cartSettings"],
    ["bizSettingsPayment"],
  ],
};

export default function RealtimeSubscriptions() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const enable = () => {
      setReady(true);
      document.removeEventListener("click", enable);
      document.removeEventListener("keydown", enable);
      document.removeEventListener("touchstart", enable);
    };
    document.addEventListener("click", enable, { once: true });
    document.addEventListener("keydown", enable, { once: true });
    document.addEventListener("touchstart", enable, { once: true });
    return () => {
      document.removeEventListener("click", enable);
      document.removeEventListener("keydown", enable);
      document.removeEventListener("touchstart", enable);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const channels = Object.entries(TABLE_KEY_MAP).map(([table, keys]) =>
      supabase
        .channel(`realtime:${table}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          (payload) => {
            keys.forEach(key =>
              queryClient.invalidateQueries({ queryKey: key })
            );

            if (table === "orders" && payload.eventType === "INSERT") {
              const row = payload.new as Record<string, unknown>;
              const orderNumber = row.orderNumber as number | null;
              const orderId = row.id as number;
              addNotification({
                type: "order",
                title: `New Order #${orderNumber?.toString().padStart(3, "0") || orderId}`,
                body: "A new order has been placed. Check the order queue.",
                orderId,
                orderNumber: orderNumber ?? undefined,
              });
            }
            if (table === "serviceRequests" && payload.eventType === "INSERT") {
              const row = payload.new as Record<string, unknown>;
              const tableCode = row.tableCode as string | undefined;
              const requestLabel = row.requestLabel as string | undefined;
              addNotification({
                type: "system",
                title: requestLabel ? `Service request: ${requestLabel}` : "Service request received",
                body: `Table ${tableCode || "unknown"} needs assistance.`,
              });
            }
          }
        )
        .subscribe()
    );

    return () => {
      channels.forEach(c => supabase.removeChannel(c));
    };
  }, [ready, queryClient, addNotification]);

  return null;
}
