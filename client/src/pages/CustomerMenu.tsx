import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { Button } from "@/components/ui/button";
import { useCart, MAX_ITEM_QUANTITY } from "@/contexts/CartContext";
import { Search, Plus, Minus, ShoppingBag, UtensilsCrossed, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/marketing/Footer";
import SplashScreen from "@/components/SplashScreen";

import ImageGallery from "@/components/ImageGallery";
import OrderStatusBanner from "@/components/OrderStatusBanner";
import { toast } from "sonner";

interface MenuItemData {
  id: number;
  name: string;
  price: number | string;
  description?: string | null;
  imageUrl?: string | null;
  badge?: string | null;
  foodType?: string | null;
  categoryId: number;
  isAvailable?: boolean;
  tags?: string | null;
  displayOrder?: number;
}

const BADGE_ICONS: Record<string, { label: string; class: string }> = {
  veg: { label: "Veg", class: "veg" },
  "non-veg": { label: "Non-Veg", class: "non-veg" },
  spicy: { label: "Spicy", class: "spicy" },
  bestseller: { label: "Bestseller", class: "bestseller" },
  popular: { label: "Popular", class: "popular" },
  new: { label: "New", class: "new" },
};

function BadgeIcon({ type }: { type: string }) {
  const badge = BADGE_ICONS[type];
  if (!badge) return null;

  if (type === "veg") {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-50 border border-green-200">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4.5" stroke="#22c55e" strokeWidth="1" />
          <circle cx="5" cy="5" r="2" fill="#22c55e" />
        </svg>
        <span className="text-[9px] font-semibold text-green-700 uppercase leading-none">Veg</span>
      </div>
    );
  }

  if (type === "non-veg") {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 border border-red-200">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4.5" stroke="#ef4444" strokeWidth="1" />
          <circle cx="5" cy="5" r="2" fill="#ef4444" />
        </svg>
        <span className="text-[9px] font-semibold text-red-700 uppercase leading-none">Non-Veg</span>
      </div>
    );
  }

  if (type === "bestseller") {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1l1.18 2.39 2.64.38-1.91 1.87.45 2.63L5 6.75l-2.36 1.52.45-2.63-1.91-1.87 2.64-.38L5 1z" fill="#f59e0b" />
        </svg>
        <span className="text-[9px] font-semibold text-amber-700 uppercase leading-none">Bestseller</span>
      </div>
    );
  }

  if (type === "popular") {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-50 border border-orange-200">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1C3 1 2 3 2 4c0 2 3 5 3 5s3-3 3-5c0-1-1-3-3-3z" fill="#f97316" />
        </svg>
        <span className="text-[9px] font-semibold text-orange-700 uppercase leading-none">Popular</span>
      </div>
    );
  }

  if (type === "spicy") {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 border border-red-200">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3 9c1-2 4-3 4-6 0-1-.5-2-1.5-2C4 1 4 2 3 2c-.5 0-1 .5-1 1 0 .5.3 1 .8 1.5C2 5.5 2 7 3 9z" fill="#ef4444" />
          <path d="M6 7c.5-1 2-1.5 2-3 0-.5-.3-1-.8-1" stroke="#ef4444" strokeWidth="0.6" />
        </svg>
        <span className="text-[9px] font-semibold text-red-700 uppercase leading-none">Spicy</span>
      </div>
    );
  }

  if (type === "new") {
    return (
      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4.5" stroke="#3b82f6" strokeWidth="0.8" />
          <text x="5" y="6.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#3b82f6">N</text>
        </svg>
        <span className="text-[9px] font-semibold text-blue-700 uppercase leading-none">New</span>
      </div>
    );
  }

  return null;
}

export default function CustomerMenu() {
  const [, params] = useRoute("/table/:tableCode");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();

  const { addToCart, cart, cartTotal, cartItemCount, updateQuantity, setTableCode } = useCart();
  const { fmtPrice } = useFormatCurrency();
  const { user, profile } = useAuth();
  const isStaff = profile?.role === "admin" || profile?.role === "staff";
  const fromAdmin = isStaff && sessionStorage.getItem("fromAdmin") === "true";

  useEffect(() => { if (tableCode) setTableCode(tableCode); }, [tableCode, setTableCode]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const categoryRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const chipRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const [splashDone, setSplashDone] = useState(() => {
    return sessionStorage.getItem("splashShown") === "true";
  });

  const [scrollY, setScrollY] = useState(0);

  const [galleryImages, setGalleryImages] = useState<{ url: string; alt: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const [cartBounce, setCartBounce] = useState(false);
  const queryClient = useQueryClient();

  const SEARCH_DEBOUNCE_MS = 200;

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  const { data: menu, isLoading: menuLoading, error: menuError } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const [categoriesRes, itemsRes] = await Promise.all([
        fetch("/api/public/categories").then((r) => r.json()),
        fetch("/api/public/menu-items").then((r) => r.json()),
      ]);
      return { categories: categoriesRes, items: itemsRes };
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const { data: session, isLoading: sessionLoading, error: sessionError, refetch: refetchSession } = useQuery({
    queryKey: ["tableSession", tableCode],
    enabled: !!tableCode,
    refetchOnMount: true,
    staleTime: 0,
    retry: 1,
    queryFn: async () => {
      const { data: tableData, error: tableErr } = await supabase
        .from("tables")
        .select("*")
        .eq("tableCode", tableCode)
        .single();
      if (tableErr || !tableData) throw new Error("Table not found");

      const { data: sessionData, error: sessionErr } = await supabase
        .from("sessions")
        .select("*")
        .eq("tableId", tableData.id)
        .eq("status", "open")
        .maybeSingle();

      if (sessionErr) throw sessionErr;

      let activeSession = sessionData;

      if (!activeSession) {
        const { data: newSession, error: insertErr } = await supabase
          .from("sessions")
          .insert({ tableId: tableData.id, status: "open" })
          .select()
          .maybeSingle();

        if (insertErr || !newSession) {
          // Race condition: another request created a session. Re-fetch it.
          const { data: retrySession } = await supabase
            .from("sessions")
            .select("*")
            .eq("tableId", tableData.id)
            .eq("status", "open")
            .limit(1)
            .maybeSingle();
          if (!retrySession) throw insertErr || new Error("Failed to create session");
          activeSession = retrySession;
        } else {
          activeSession = newSession;
        }

        await supabase.from("tables").update({ status: "active", activeSessionId: activeSession.id }).eq("id", tableData.id);
      }

      return {
        session: {
          id: activeSession.id,
          tableLabel: tableData.label,
          status: activeSession.status,
          subtotal: activeSession.subtotal,
        },
      };
    },
  });

  const { data: bizSettings, isLoading: bizLoading, error: bizError } = useQuery({
    queryKey: ["brandIntro"],
    queryFn: async () => {
      const data = await fetch("/api/public/business-settings").then((r) => r.json());
      return data || null;
    },
    staleTime: 300_000,
  });

  const restaurantName = bizSettings?.restaurantName || "Menu";

  useEffect(() => {
    if (!menuLoading && !sessionLoading && !bizLoading && !initialLoaded) {
      setInitialLoaded(true);
    }
  }, [menuLoading, sessionLoading, bizLoading, initialLoaded]);

  const handleAdd = useCallback((item: MenuItemData) => {
    const existing = cart.find(c => c.menuItemId === item.id);
    if (existing && existing.quantity >= MAX_ITEM_QUANTITY) {
      toast.error(`Max ${MAX_ITEM_QUANTITY} per item`);
      return;
    }
    addToCart(item);
    setCartBounce(true);
    toast.success(`Added ${item.name}`);
    setTimeout(() => setCartBounce(false), 300);
  }, [addToCart, cart]);

  const groupedItems = useMemo(() => {
    if (!menu) return [];
    let items = menu.items;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase().replace(/\s+/g, " ").trim();
      const categories = menu.categories;
      const catIds = categories
        .filter((c: any) => c.name.toLowerCase().includes(q))
        .map((c: any) => c.id);
      items = items.filter((i: any) => {
        const nameMatch = i.name.toLowerCase().includes(q);
        const catMatch = catIds.includes(i.categoryId);
        const tagMatch = i.tags ? i.tags.toLowerCase().includes(q) : false;
        return nameMatch || catMatch || tagMatch;
      });
    }
    if (debouncedSearch) return [{ category: null, items }];

    return menu.categories
      .map((cat: any) => ({
        category: cat,
        items: items.filter((i: any) => i.categoryId === cat.id),
      }))
      .filter((g: any) => g.items.length > 0);
  }, [menu, debouncedSearch]);

  const scrollToCategory = (catId: number) => {
    const el = categoryRefs.current.get(catId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    if (!groupedItems.length || debouncedSearch) return;
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
      let bestId: number | null = null;
      let bestTop = Infinity;
      categoryRefs.current.forEach((el, id) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 160 && rect.top > -300) {
          if (bestId === null || rect.top > bestTop) {
            bestId = id;
            bestTop = rect.top;
          }
        }
      });
      if (bestId !== null) setActiveCategoryId(bestId);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [groupedItems, debouncedSearch]);

  useEffect(() => {
    if (activeCategoryId === null) return;
    const chip = chipRefs.current.get(activeCategoryId);
    if (chip) {
      chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeCategoryId]);

  useEffect(() => {
    if (!groupedItems.length || debouncedSearch) return;
    if (activeCategoryId === null && groupedItems[0]?.category) {
      setActiveCategoryId(groupedItems[0].category.id);
    }
  }, [groupedItems, debouncedSearch, activeCategoryId]);

  const getItemQuantity = (menuItemId: number) => cart.find((i) => i.menuItemId === menuItemId)?.quantity ?? 0;

  const handleImageClick = useCallback((item: MenuItemData, url: string, alt: string) => {
    setGalleryImages([{ url, alt }]);
    setGalleryIndex(0);
  }, []);

  const blurStrength = Math.min(12 + scrollY * 0.05, 24);
  const headerOpacity = Math.min(0.9 + scrollY * 0.0003, 0.97);
  const headerShadow = scrollY > 10
    ? `0 1px 3px rgba(74, 52, 40, ${Math.min(scrollY * 0.0004, 0.08)})`
    : "none";

  if (!initialLoaded) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] pb-32 animate-pulse">
        {/* Header skeleton - matches sticky header exactly */}
        <div className="px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {fromAdmin && <div className="w-9 h-9 rounded-xl bg-[#E8E0D4]/60" />}
              <div>
                <div className="h-8 w-36 bg-[#E8E0D4] rounded-md" />
                <div className="h-4 w-12 bg-[#E8E0D4] rounded-md mt-1.5" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-4 w-16 bg-[#E8E0D4] rounded-md" />
              <div className="h-5 w-14 bg-[#E8E0D4] rounded-md" />
            </div>
          </div>
        </div>

        {/* Tagline skeleton */}
        <div className="px-4 pt-3 pb-1">
          <div className="h-3 w-48 bg-[#E8E0D4] rounded-md" />
        </div>

        {/* Search bar skeleton - matches h-11 rounded-[14px] */}
        <div className="px-4 pt-4 pb-4">
          <div className="h-11 bg-white border border-[#E8E0D4]/60 rounded-[14px] flex items-center px-3.5 gap-2.5">
            <div className="w-4 h-4 bg-[#E8E0D4] rounded" />
            <div className="h-3 w-40 bg-[#E8E0D4]/60 rounded" />
          </div>
        </div>

        {/* Category pills skeleton - matches sticky pills bar */}
        <div className="px-4 py-3">
          <div className="flex gap-2 w-max">
            {[72, 88, 60, 96, 68, 80].map((w, i) => (
              <div key={i} className="px-4 py-2 rounded-full bg-[#E8E0D4]" style={{ width: `${w}px` }} />
            ))}
          </div>
        </div>

        {/* Menu items skeleton - matches exact card layout */}
        <div className="px-4 pt-5 space-y-7">
          {[1, 2].map((section) => (
            <div key={section}>
              {/* Category label - matches bg-[#C08A4D] px-4 py-2 rounded-lg inline-block */}
              <div className="bg-[#E8E0D4] px-4 py-2 rounded-lg inline-block mb-4">
                <div className="h-5 w-20 bg-white/40 rounded" />
              </div>
              {/* 2-col grid - matches grid-cols-2 gap-3 */}
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-[#FFFCF8] rounded-[16px] border border-[#E8E0D4]/60 overflow-hidden">
                    {/* Image area - matches aspect-[4/3] */}
                    <div className="aspect-[4/3] bg-[#F0EAE0]" />
                    {/* Content area - matches p-3 */}
                    <div className="p-3">
                      {/* Food type dot + name */}
                      <div className="flex items-start gap-1.5 mb-1">
                        <div className="w-3.5 h-3.5 rounded bg-[#E8E0D4] shrink-0 mt-0.5" />
                        <div className="h-4 bg-[#E8E0D4] rounded flex-1" />
                      </div>
                      {/* Description */}
                      <div className="h-2.5 bg-[#E8E0D4]/60 rounded w-full mb-0.5" />
                      <div className="h-2.5 bg-[#E8E0D4]/60 rounded w-2/3 mb-2" />
                      {/* Price + Add button */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="h-4 w-12 bg-[#E8E0D4] rounded" />
                        <div className="w-8 h-8 bg-[#E8E0D4] rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!menu || !session?.session) {
    const errorTitle = menuError ? "Unable to load menu" : "Unable to load table";
    const errorMessage = menuError
      ? "Could not load menu items. Please try again."
      : sessionError
        ? (sessionError as Error).message
        : "Please scan the QR code again";
    return (
      <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center px-4">
        <div className="text-center max-w-sm space-y-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#4A3428]/10 flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-[#4A3428]" />
          </div>
          <div>
            <p className="text-lg font-semibold text-[#4A3428] mb-1">{errorTitle}</p>
            <p className="text-sm text-[#8B7E72]">{errorMessage}</p>
          </div>
          <Button onClick={() => { if (menuError) queryClient.invalidateQueries({ queryKey: ['menu'] }); refetchSession(); }} variant="outline" className="rounded-xl">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (bizSettings?.restaurant_status === "closed") {
    return (
      <>
        {!splashDone && !bizLoading && !bizError && (
          <SplashScreen
            restaurantName={restaurantName}
            logoUrl={bizSettings?.logoUrl}
            onComplete={() => {
              sessionStorage.setItem("splashShown", "true");
              setSplashDone(true);
            }}
          />
        )}
        <div className="min-h-screen bg-[#F8F4EC] premium-bg">
          <div
            className="sticky top-0 z-40 border-b border-[#E8E0D4]/60"
            style={{
              backdropFilter: `blur(${blurStrength}px)`,
              WebkitBackdropFilter: `blur(${blurStrength}px)`,
              backgroundColor: `rgba(248, 244, 236, ${headerOpacity})`,
              boxShadow: headerShadow,
            }}
          >
            <div className="px-4 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {fromAdmin && (
                    <button onClick={() => { sessionStorage.removeItem("fromAdmin"); navigate("/admin"); }} className="w-9 h-9 rounded-xl bg-white/80 border border-[#E8E0D4] flex items-center justify-center text-[#8B7E72] hover:text-[#4A3428] hover:bg-white transition-all shadow-sm">
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div className="text-left">
                    <h1 className="text-[32px] font-bold text-[#4A3428] tracking-tight leading-none" style={{ fontFamily: "var(--font-caveat)" }}>{restaurantName}</h1>
                    <p className="text-lg text-[#8B7E72] mt-1 font-semibold tracking-tight" style={{ fontFamily: "var(--font-caveat)" }}>Menu</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center px-4 pt-24 pb-32 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-[#4A3428]/10 flex items-center justify-center">
              <span className="text-4xl">☕</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#4A3428]" style={{ fontFamily: "var(--font-caveat)" }}>We're Currently Closed</h2>
              <p className="text-sm text-[#8B7E72] max-w-xs mx-auto">We're currently closed. Please visit us during business hours.</p>
            </div>
          </div>
          <div className="mt-16">
            <Footer variant="menu" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {!splashDone && !bizLoading && !bizError && (
        <SplashScreen
          restaurantName={restaurantName}
          logoUrl={bizSettings?.logoUrl}
          onComplete={() => {
            sessionStorage.setItem("splashShown", "true");
            setSplashDone(true);
          }}
        />
      )}
      <div className="min-h-screen bg-[#F8F4EC] pb-32 premium-bg">
      <div
        className="sticky top-0 z-40 border-b border-[#E8E0D4]/60 transition-[backdrop-filter,background-color,box-shadow] duration-200"
        style={{
          backdropFilter: `blur(${blurStrength}px)`,
          WebkitBackdropFilter: `blur(${blurStrength}px)`,
          backgroundColor: `rgba(248, 244, 236, ${headerOpacity})`,
          boxShadow: headerShadow,
        }}
      >
        <div className="px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {fromAdmin && (
                <button onClick={() => { sessionStorage.removeItem("fromAdmin"); navigate("/admin"); }} className="w-9 h-9 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-[#E8E0D4] flex items-center justify-center text-[#8B7E72] hover:text-[#4A3428] hover:bg-white transition-all shadow-sm">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="text-left">
                <h1 className="text-[32px] font-bold text-[#4A3428] tracking-tight leading-none" style={{ fontFamily: "var(--font-caveat)" }}>{restaurantName}</h1>
                <p className="text-lg text-[#8B7E72] mt-1 font-semibold tracking-tight" style={{ fontFamily: "var(--font-caveat)" }}>Menu</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold text-[#8B7E72]" style={{ fontFamily: "var(--font-caveat)", fontSize: "18px" }}>Table total</span>
              <span className="text-xl font-bold text-[#4A3428]" style={{ fontFamily: "var(--font-caveat)" }}>
                {fmtPrice(session.session.subtotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <OrderStatusBanner sessionId={session.session.id} tableCode={tableCode!} />

      <div className="px-4 pt-3 pb-1">
        {bizSettings?.tagline && (
          <p className="text-sm text-[#8B7E72] italic">{bizSettings.tagline}</p>
        )}
      </div>

      <div className="px-4 pt-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7E72] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes, categories..."
            className="w-full h-11 pl-10 pr-4 rounded-[14px] bg-white border border-[#E8E0D4]/60 text-sm text-[#4A3428] placeholder:text-[#8B7E72]/50 focus:outline-none focus:ring-2 focus:ring-[#C08A4D]/15 focus:border-[#C08A4D]/40 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#E8E0D4] flex items-center justify-center text-[#8B7E72] hover:bg-[#D8D0C4] transition-colors text-[10px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {!debouncedSearch && groupedItems.length > 0 && (
        <div
          className="sticky top-[88px] z-30 border-b border-[#E8E0D4]/40 transition-[backdrop-filter,background-color] duration-200"
          style={{
            backdropFilter: `blur(${blurStrength}px)`,
            WebkitBackdropFilter: `blur(${blurStrength}px)`,
            backgroundColor: `rgba(248, 244, 236, ${headerOpacity})`,
          }}
        >
          <div className="px-4 py-3 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 w-max">
              {groupedItems.map((g: any) => {
                if (!g.category) return null;
                const isActive = activeCategoryId === g.category.id;
                return (
                  <button
                    key={g.category.id}
                    ref={(el) => { if (el) chipRefs.current.set(g.category!.id, el); }}
                    onClick={() => scrollToCategory(g.category!.id)}
                    className={cn(
                      "relative px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-200 whitespace-nowrap",
                      isActive
                        ? "bg-[#C08A4D] text-white border-[#C08A4D]"
                        : "text-[#4A3428] border-[#C08A4D]/40 hover:border-[#C08A4D]"
                    )}
                    style={{ fontFamily: "var(--font-caveat)", fontSize: "16px" }}
                  >
                    {g.category.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div ref={scrollContainerRef} className="px-4 pt-5 space-y-7">
        {search ? (
          <div className="grid grid-cols-2 gap-3">
            {groupedItems[0]?.items.length === 0 ? (
              <div className="col-span-2 text-center py-20 space-y-5">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-[#E8E0D4]/30 flex items-center justify-center">
                  <UtensilsCrossed className="w-7 h-7 text-[#8B7E72]/40" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-[#4A3428]">No matching dishes found</p>
                  <p className="text-sm text-[#8B7E72]">Try another keyword or browse categories</p>
                </div>
              </div>
            ) : (
              <>
                {groupedItems[0]?.items.filter((i: any) => i.isAvailable !== false).map((item: any) => (
                  <MenuItem
                    key={item.id}
                    item={item}
                    qty={getItemQuantity(item.id)}
                    onAdd={handleAdd}
                    onUpdateQty={updateQuantity}
                    onImageClick={(url, alt) => handleImageClick(item, url, alt)}
                    fmtPrice={fmtPrice}
                  />
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-7">
            {groupedItems.map((g: any) => {
              if (!g.category) return null;
              return (
              <div
                key={g.category.id}
                data-category-id={g.category.id}
                ref={(el) => { if (el) categoryRefs.current.set(g.category!.id, el); }}
                className="scroll-mt-[165px]"
              >
                <div className="bg-[#C08A4D] text-white px-4 py-2 rounded-lg mb-4 inline-block">
                  <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-caveat)" }}>{g.category.name}</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {g.items.filter((i: any) => i.isAvailable !== false).map((item: any) => (
                    <MenuItem
                      key={item.id}
                      item={item}
                      qty={getItemQuantity(item.id)}
                      onAdd={handleAdd}
                      onUpdateQty={updateQuantity}
                      onImageClick={(url, alt) => handleImageClick(item, url, alt)}
                      fmtPrice={fmtPrice}
                    />
                  ))}
                  {g.items.filter((i: any) => i.isAvailable === false).map((item: any) => (
                    <MenuItem
                      key={item.id}
                      item={item}
                      qty={0}
                      onAdd={() => {}}
                      onUpdateQty={() => {}}
                      onImageClick={() => {}}
                      soldOut
                      fmtPrice={fmtPrice}
                    />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {cartItemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-5 pt-3">
          <button
            onClick={() => navigate(`/table/${tableCode}/cart`)}
            className="w-full bg-[#4A3428] text-white rounded-[24px] py-[15px] px-5 flex items-center justify-between shadow-[0_4px_24px_rgba(74,52,40,0.15)]"
            style={cartBounce ? { transform: "scale(1.03)" } : {}}
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5" />
              <span className="font-medium">View Cart</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/60 font-medium">
                {cartItemCount} item{cartItemCount !== 1 ? "s" : ""}
              </span>
              <span className="text-lg font-bold" style={{ fontFamily: "var(--font-caveat)" }}>
                {fmtPrice(cartTotal)}
              </span>
            </div>
          </button>
        </div>
      )}

      {galleryImages.length > 0 && (
        <ImageGallery
          images={galleryImages}
          initialIndex={galleryIndex}
          onClose={() => setGalleryImages([])}
        />
      )}

      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
    </>
  );
}

function MenuItem({ item, qty, onAdd, onUpdateQty, onImageClick, soldOut, fmtPrice }: {
  item: MenuItemData;
  qty: number;
  onAdd: (item: MenuItemData) => void;
  onUpdateQty: (id: number, qty: number) => void;
  onImageClick?: (url: string, alt: string) => void;
  soldOut?: boolean;
  fmtPrice: (price: number | string) => string;
}) {
  const price = typeof item.price === "string" ? parseFloat(item.price) : item.price;
  const hasImage = !!item.imageUrl;
  const hasBadge = !!item.badge;
  const showFoodType = item.foodType === "veg" || item.foodType === "non-veg";

  return (
    <div className={`bg-[#FFFCF8] rounded-[16px] border border-[#E8E0D4]/60 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden ${soldOut ? "opacity-60" : ""}`}>
      {hasImage ? (
        <div
          className="aspect-[4/3] overflow-hidden cursor-pointer bg-[#F8F4EC] relative"
          onClick={() => !soldOut && onImageClick?.(item.imageUrl || "", item.name)}
        >
          <img
            src={item.imageUrl || ""}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
          {soldOut && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="bg-white/90 text-[#4A3428] text-xs font-bold px-3 py-1 rounded-full">Sold Out</span>
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-[4/3] bg-[#F0EAE0] flex items-center justify-center relative">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="#C08A4D" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
            <circle cx="24" cy="24" r="20" />
            <ellipse cx="24" cy="24" rx="10" ry="10" />
            <path d="M24 4 C24 4, 28 14, 24 24" />
            <path d="M24 44 C24 44, 20 34, 24 24" />
            <path d="M4 24 C4 24, 14 20, 24 24" />
            <path d="M44 24 C44 24, 34 28, 24 24" />
          </svg>
          {soldOut && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="bg-white/90 text-[#4A3428] text-xs font-bold px-3 py-1 rounded-full">Sold Out</span>
            </div>
          )}
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start gap-1.5 mb-1">
          {showFoodType && (
            item.foodType === "veg" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
                <rect x="0.5" y="0.5" width="13" height="13" rx="2.5" stroke="#22c55e" strokeWidth="1" />
                <circle cx="7" cy="7" r="3" fill="#22c55e" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 mt-0.5">
                <rect x="0.5" y="0.5" width="13" height="13" rx="2.5" stroke="#ef4444" strokeWidth="1" />
                <circle cx="7" cy="7" r="3" fill="#ef4444" />
              </svg>
            )
          )}
          <h3 className="text-sm font-semibold text-[#4A3428] leading-tight" style={{ fontFamily: "var(--font-caveat)", fontSize: "17px" }}>{item.name}</h3>
        </div>

        {hasBadge && (
          <div className="mb-1.5">
            <BadgeIcon type={item.badge || ""} />
          </div>
        )}

        {item.description && (
          <p className="text-[11px] text-[#8B7E72] leading-snug line-clamp-2 mb-2" style={{ fontFamily: "var(--font-caveat)", fontSize: "14px" }}>{item.description}</p>
        )}

        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-base font-bold text-[#C08A4D]" style={{ fontFamily: "var(--font-caveat)", fontSize: "18px" }}>{fmtPrice(price)}</span>
          {soldOut ? (
            <span className="text-[10px] text-slate-400 font-medium">Unavailable</span>
          ) : qty === 0 ? (
            <button
              onClick={() => onAdd(item)}
              className="w-8 h-8 rounded-full bg-[#C08A4D] text-white flex items-center justify-center hover:bg-[#A6753A] transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-[#F8F4EC] border border-[#E8E0D4] rounded-full px-1.5 py-0.5">
              <button
                onClick={() => onUpdateQty(item.id, qty - 1)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-[#8B7E72] hover:text-[#4A3428] hover:bg-white transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="min-w-[16px] text-center text-sm font-semibold text-[#4A3428]">{qty}</span>
              <button
                onClick={() => onUpdateQty(item.id, qty + 1)}
                className="w-6 h-6 flex items-center justify-center rounded-full text-[#8B7E72] hover:text-[#4A3428] hover:bg-white transition-colors"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
