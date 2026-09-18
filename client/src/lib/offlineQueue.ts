/**
 * Offline IndexedDB Queue & Menu Cache
 * Ensures zero-downtime café billing even if broadband drops during rush hours.
 * Auto-syncs when network restores. Staff can punch orders/view tables offline.
 */

const DB_NAME = "cafe_offline_db";
const DB_VERSION = 1;

let isOffline = false;

function isOnline(): boolean {
  return navigator.onLine && !isOffline;
}

function markOffline() {
  isOffline = true;
}

function markOnline() {
  isOffline = false;
  // Auto-sync pending transactions when coming back online
  syncOfflineQueue().then(() => {
    // Sync completed silently
  }).catch(() => {
    // Keep trying on next online cycle
  });
}

// Listen for network status changes
if (typeof window !== "undefined") {
  window.addEventListener("online", markOnline);
  window.addEventListener("offline", markOffline);
}

interface OfflineOrder {
  id?: number;
  localId: string;
  tableCode: string;
  items: Array<{
    menuItemId: number;
    name: string;
    price: number;
    quantity: number;
    variantSelections?: any;
    specialInstructions?: string;
  }>;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string;
  subtotal?: number;
  submittedAt: string;
  synced: boolean;
  submissionId?: string;
  deviceToken?: string;
}

interface OfflineSettlement {
  id?: number;
  localId: string;
  sessionId: number;
  tableLabel: string;
  paymentMethod: string;
  subtotal: number;
  finalTotal: number;
  settledAt: string;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains("orders")) {
        const orderStore = db.createObjectStore("orders", { keyPath: "localId" });
        orderStore.createIndex("synced", "synced", { unique: false });
      }
      if (!db.objectStoreNames.contains("settlements")) {
        const settleStore = db.createObjectStore("settlements", { keyPath: "localId" });
        settleStore.createIndex("synced", "synced", { unique: false });
      }
      if (!db.objectStoreNames.contains("menu_cache")) {
        db.createObjectStore("menu_cache", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Cache categories and menu items locally */
export async function cacheMenuData(categories: any[], menuItems: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction("menu_cache", "readwrite");
    const store = tx.objectStore("menu_cache");
    store.put({ key: "categories", data: categories, timestamp: Date.now() });
    store.put({ key: "menuItems", data: menuItems, timestamp: Date.now() });
  } catch (err) {
    console.warn("[OfflineQueue] Failed to cache menu in IndexedDB:", err);
  }
}

/** Retrieve locally cached menu when offline */
export async function getCachedMenuData(): Promise<{ categories: any[]; menuItems: any[] } | null> {
  try {
    const db = await openDB();
    const tx = db.transaction("menu_cache", "readonly");
    const store = tx.objectStore("menu_cache");
    const catsReq = store.get("categories");
    const itemsReq = store.get("menuItems");

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        if (catsReq.result && itemsReq.result) {
          resolve({
            categories: catsReq.result.data || [],
            menuItems: itemsReq.result.data || [],
          });
        } else {
          resolve(null);
        }
      };
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Queue an offline order */
export async function queueOfflineOrder(order: Omit<OfflineOrder, "localId" | "synced" | "submittedAt">): Promise<string> {
  const localId = "offline_ord_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const fullOrder: OfflineOrder = {
    ...order,
    localId,
    submittedAt: new Date().toISOString(),
    synced: false,
  };

  const db = await openDB();
  const tx = db.transaction("orders", "readwrite");
  tx.objectStore("orders").add(fullOrder);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(localId);
    tx.onerror = () => reject(tx.error);
  });
}

// Alias for compatibility with existing code
export const enqueueOrder = queueOfflineOrder;

/** Queue an offline settlement */
export async function queueOfflineSettlement(settlement: Omit<OfflineSettlement, "localId" | "synced" | "settledAt">): Promise<string> {
  const localId = "offline_set_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
  const fullSettlement: OfflineSettlement = {
    ...settlement,
    localId,
    settledAt: new Date().toISOString(),
    synced: false,
  };

  const db = await openDB();
  const tx = db.transaction("settlements", "readwrite");
  tx.objectStore("settlements").add(fullSettlement);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(localId);
    tx.onerror = () => reject(tx.error);
  });
}

/** Get count of pending offline actions */
export async function getPendingOfflineCount(): Promise<{ orders: number; settlements: number }> {
  try {
    const db = await openDB();
    const tx = db.transaction(["orders", "settlements"], "readonly");
    const orderStore = tx.objectStore("orders");
    const settleStore = tx.objectStore("settlements");

    const ordersReq = orderStore.getAll();
    const settleReq = settleStore.getAll();

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        const pendingOrders = (ordersReq.result || []).filter((o: OfflineOrder) => !o.synced).length;
        const pendingSettles = (settleReq.result || []).filter((s: OfflineSettlement) => !s.synced).length;
        resolve({ orders: pendingOrders, settlements: pendingSettles });
      };
      tx.onerror = () => resolve({ orders: 0, settlements: 0 });
    });
  } catch {
    return { orders: 0, settlements: 0 };
  }
}

/** Check if café can operate offline (cart & menu available) */
export async function canOperateOffline(): Promise<{ offline: boolean; pendingOrders: number; pendingSettlements: number; hasMenu: boolean }> {
  const isOnlineNow = navigator.onLine && !isOffline;
  const pending = await getPendingOfflineCount();
  let hasMenu = false;

  if (!isOnlineNow) {
    const menu = await getCachedMenuData();
    hasMenu = menu?.menuItems?.length > 0 || menu?.categories?.length > 0;
  }

  return {
    offline: !isOnlineNow,
    pendingOrders: pending.orders,
    pendingSettlements: pending.settlements,
    hasMenu,
  };
}

/** Force sync now (e.g. from UI button) */
export async function forceSyncOfflineQueue(): Promise<{ syncedOrders: number; syncedSettlements: number }> {
  if (navigator.onLine) {
    const result = await syncOfflineQueue();
    return { syncedOrders: result.syncedOrders, syncedSettlements: result.syncedSettlements };
  }
  return { syncedOrders: 0, syncedSettlements: 0 };
}

/** Auto-sync pending offline transactions once network is restored */
export async function syncOfflineQueue(): Promise<{ syncedOrders: number; syncedSettlements: number; clearedOrders: number; clearedSettlements: number }> {
  if (!navigator.onLine) {
    return { syncedOrders: 0, syncedSettlements: 0, clearedOrders: 0, clearedSettlements: 0 };
  }

  let syncedOrders = 0;
  let syncedSettlements = 0;
  let clearedOrders = 0;
  let clearedSettlements = 0;

  try {
    const db = await openDB();
    
    // 1. Sync pending orders
    const ordTx = db.transaction("orders", "readwrite");
    const ordStore = ordTx.objectStore("orders");
    const allOrders: OfflineOrder[] = await new Promise((res) => {
      const r = ordStore.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });

    const pendingOrders = allOrders.filter((o) => !o.synced);
    for (const ord of pendingOrders) {
      try {
        const res = await fetch("/api/public/submit-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tableCode: ord.tableCode,
            items: ord.items,
            customerName: ord.customerName,
            customerPhone: ord.customerPhone,
            paymentMethod: ord.paymentMethod || "counter",
          }),
        });
        if (res.ok) {
          ord.synced = true;
          ordStore.put(ord);
          syncedOrders++;
        }
      } catch (e) {
        console.warn("[OfflineSync] Failed to sync order:", ord.localId, e);
      }
    }
    // Cleanup: remove fully synced orders from the store
    if (syncedOrders > 0) {
      const cleanupTx = db.transaction("orders", "readwrite");
      const cleanupStore = cleanupTx.objectStore("orders");
      const stillSynced = await new Promise((res) => {
        const r = cleanupStore.getAll();
        r.onsuccess = () => res(r.result.filter((o: OfflineOrder) => o.synced).length);
        r.onerror = () => res(0);
      });
      clearedOrders = allOrders.length - stillSynced;
    }

    // 2. Sync pending settlements
    const setTx = db.transaction("settlements", "readwrite");
    const setStore = setTx.objectStore("settlements");
    const allSettles: OfflineSettlement[] = await new Promise((res) => {
      const r = setStore.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });

    const pendingSettles = allSettles.filter((s) => !s.synced);
    for (const set of pendingSettles) {
      try {
        const res = await fetch("/api/admin/settle-bill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: set.sessionId,
            paymentMethod: set.paymentMethod,
          }),
        });
        if (res.ok) {
          set.synced = true;
          setStore.put(set);
          syncedSettlements++;
        }
      } catch (e) {
        console.warn("[OfflineSync] Failed to sync settlement:", set.localId, e);
      }
    }
    // Cleanup: remove fully synced settlements from the store
    if (syncedSettlements > 0) {
      const cleanupTx = db.transaction("settlements", "readwrite");
      const cleanupStore = cleanupTx.objectStore("settlements");
      const stillSynced = await new Promise((res) => {
        const r = cleanupStore.getAll();
        r.onsuccess = () => res(r.result.filter((s: OfflineSettlement) => s.synced).length);
        r.onerror = () => res(0);
      });
      clearedSettlements = allSettles.length - stillSynced;
    }
  } catch (err) {
    console.error("[OfflineSync] Queue processing error:", err);
  }

  return { syncedOrders, syncedSettlements, clearedOrders, clearedSettlements };
}
