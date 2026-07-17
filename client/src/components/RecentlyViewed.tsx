import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Plus } from "lucide-react";
import AnimatedPrice from "./AnimatedPrice";
import "@/components/MenuCardStack.css";

const STORAGE_KEY = "cafe-recently-viewed";
const MAX_ITEMS = 6;

export interface RecentItem {
  id: number;
  name: string;
  price: number;
  imageUrl?: string | null;
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const addItem = useCallback((item: Omit<RecentItem, "price"> & { price: number | string }) => {
    const parsed: RecentItem = {
      id: item.id,
      name: item.name,
      price: typeof item.price === "string" ? parseFloat(item.price) : item.price,
      imageUrl: item.imageUrl,
    };
    setItems((prev) => {
      const filtered = prev.filter((i) => i.id !== parsed.id);
      const next = [parsed, ...filtered].slice(0, MAX_ITEMS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { items, addItem };
}

interface RecentlyViewedProps {
  items: RecentItem[];
  getItemQuantity: (id: number) => number;
  onAdd: (item: any) => void;
  onUpdateQty: (id: number, qty: number) => void;
  onAddWithFly?: (item: any, sourceRect: DOMRect) => void;
  onImageClick?: (url: string, alt: string) => void;
  formatPrice: (p: number | string) => { symbol: string; value: string };
}

export default function RecentlyViewed({
  items,
  getItemQuantity,
  onAdd,
  onUpdateQty,
  onAddWithFly,
  onImageClick,
  formatPrice,
}: RecentlyViewedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setAtStart(el.scrollLeft <= 4);
      setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, [items]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const s = el.scrollLeft <= 0;
      const e_ = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      if ((e.deltaY > 0 && e_) || (e.deltaY < 0 && s)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * 1.5;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <div className="px-4 pt-1 pb-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-[#C08A4D]" />
        <h2 className="text-lg font-bold text-[#4A3428]">Recently Viewed</h2>
      </div>
      <div className="relative">
        {!atStart && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-10 bg-gradient-to-r from-[#F8F4EC] to-transparent" />
        )}
        {!atEnd && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 z-10 bg-gradient-to-l from-[#F8F4EC] to-transparent" />
        )}
        <div
          ref={scrollRef}
          className="favorites-scroll flex gap-3 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {items.map((item) => {
            const qty = getItemQuantity(item.id);
            return (
              <div key={item.id} className="flex-shrink-0 w-[45vw] max-w-[220px]">
                <div className="menu-stack">
                  <div className="card-bg-before" />
                  <div className="card-bg-after" />
                  {item.imageUrl ? (
                    <div
                      className="menu-card-img-wrap cursor-pointer"
                      onClick={() => onImageClick?.(item.imageUrl || "", item.name)}
                    >
                      <img src={item.imageUrl} alt={item.name} loading="lazy" />
                    </div>
                  ) : (
                    <div className="menu-card-img-placeholder">
                      <svg className="placeholder-icon" viewBox="0 0 48 48" fill="none" stroke="#4A3428" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="24" cy="24" r="20" />
                        <ellipse cx="24" cy="24" rx="10" ry="10" />
                        <path d="M24 4 C24 4, 28 14, 24 24" />
                        <path d="M24 44 C24 44, 20 34, 24 24" />
                        <path d="M4 24 C4 24, 14 20, 24 24" />
                        <path d="M44 24 C44 24, 34 28, 24 24" />
                      </svg>
                      <span className="placeholder-title">Photo Coming Soon</span>
                    </div>
                  )}
                  <div className="menu-card-content">
                    <h3 className="menu-card-name">{item.name}</h3>
                    <div className="menu-card-bottom">
                      <p className="menu-card-price">
                        <AnimatedPrice value={typeof item.price === "string" ? parseFloat(item.price) : item.price} prefix={"₹"} className="menu-card-price-symbol" decimals={2} />
                      </p>
                      {qty === 0 ? (
                        <button
                          onClick={(e) => {
                            const btn = e.currentTarget;
                            const imgEl = btn.closest(".menu-stack")?.querySelector(".menu-card-img-wrap img, .menu-card-img-placeholder");
                            const rect = imgEl ? imgEl.getBoundingClientRect() : btn.getBoundingClientRect();
                            if (onAddWithFly) {
                              onAddWithFly(item, rect);
                            } else {
                              onAdd(item);
                            }
                          }}
                          className="menu-card-add-btn"
                        >
                          <Plus />
                        </button>
                      ) : (
                        <div className="menu-card-qty">
                          <button onClick={() => onUpdateQty(item.id, qty - 1)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          </button>
                          <span>{qty}</span>
                          <button onClick={() => onUpdateQty(item.id, qty + 1)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
