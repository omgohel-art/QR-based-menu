interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CacheOptions {
  ttlMs: number;
  maxSize?: number;
}

export class TtlCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private keyOrder: string[] = [];
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(opts: CacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.maxSize = opts.maxSize ?? 500;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    if (this.store.has(key)) {
      const idx = this.keyOrder.indexOf(key);
      if (idx !== -1) this.keyOrder.splice(idx, 1);
    }
    this.evictIfNeeded();
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
    this.keyOrder.push(key);
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidateAll(): void {
    this.store.clear();
    this.keyOrder = [];
  }

  private evictIfNeeded(): void {
    while (this.store.size >= this.maxSize) {
      const oldest = this.keyOrder.shift();
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }
}

export const menuDataCache = new TtlCache<any[]>({ ttlMs: 5 * 60 * 1000 });
export const settingsCache = new TtlCache<any>({ ttlMs: 5 * 60 * 1000 });
