// Minimal IndexedDB wrapper for the offline order queue.
// Stores: { id, type: 'order', payload, createdAt, retries }
// Synced by /client/src/hooks/useOfflineOrderQueue.ts.

const DB_NAME = "mama_offline";
const DB_VERSION = 1;
const STORE = "queued_orders";

export interface QueuedOrder {
  id?: number;
  type: "order";
  payload: {
    submissionId: string;
    tableCode: string;
    items: { menuItemId: number; quantity: number; notes?: string }[];
    customerName?: string;
    customerPhone?: string;
    paymentMethod: "upi" | "cash" | "counter";
    finalTotal?: number;
    deviceToken: string;
  };
  createdAt: number;
  retries: number;
  lastError?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOrder(payload: QueuedOrder["payload"]): Promise<number> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.add({
      type: "order",
      payload,
      createdAt: Date.now(),
      retries: 0,
    } as QueuedOrder);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function listQueued(): Promise<QueuedOrder[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result || []) as QueuedOrder[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteQueued(id: number): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function incrementRetry(id: number, err: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const get = store.get(id);
    get.onsuccess = () => {
      const row = get.result as QueuedOrder | undefined;
      if (!row) return resolve();
      row.retries = (row.retries || 0) + 1;
      row.lastError = err;
      const put = store.put(row);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

export async function queueSize(): Promise<number> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}
