import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Minus, ShoppingBag, UtensilsCrossed, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import Footer from "@/components/marketing/Footer";
import "@/components/LoadingRipple.css";
import "@/components/MenuCardStack.css";
import ImageGallery from "@/components/ImageGallery";
import FlyingItem from "@/components/FlyingItem";
import AnimatedPrice from "@/components/AnimatedPrice";
import RecentlyViewed, { useRecentlyViewed } from "@/components/RecentlyViewed";
import CafeDecorations from "@/components/CafeDecorations";
import GreetingBanner from "@/components/GreetingBanner";
import BrandIntro from "@/components/BrandIntro";

function formatPrice(price: number | string) {
  const n = (typeof price === "string" ? parseFloat(price) : price).toFixed(2);
  return { symbol: "\u20B9", value: n };
}

export default function CustomerMenu() {
  const [, params] = useRoute("/table/:tableCode");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();

  const { addToCart, cart, cartItemCount, updateQuantity } = useCart();
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const categoryRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const chipRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const cartBtnRef = useRef<HTMLDivElement>(null);

  // Feature 2: Glassmorphism scroll tracking
  const [scrollY, setScrollY] = useState(0);

  // Fly to cart state
  const [flyingItem, setFlyingItem] = useState<{
    sourceRect: DOMRect;
    item: { id: number; name: string; price: number | string; imageUrl?: string | null };
  } | null>(null);

  // Gallery state
  const [galleryImages, setGalleryImages] = useState<{ url: string; alt: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Cart bounce
  const [cartBounce, setCartBounce] = useState(false);
  const [countPop, setCountPop] = useState(false);
  const favoritesRef = useRef<HTMLDivElement>(null);

  // Feature 6: Recently Viewed
  const { items: recentItems, addItem: addRecentItem } = useRecentlyViewed();

  const { data: menu, isLoading: menuLoading } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const [categoriesRes, itemsRes] = await Promise.all([
        supabase.from("categories").select("*").order("displayOrder"),
        supabase.from("menuItems").select("*").eq("isAvailable", true).order("name"),
      ]);
      return {
        categories: categoriesRes.data || [],
        items: itemsRes.data || [],
      };
    },
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["tableSession", tableCode],
    enabled: !!tableCode,
    refetchOnMount: true,
    staleTime: 0,
    queryFn: async () => {
      const { data: tableData } = await supabase
        .from("tables")
        .select("*")
        .eq("tableCode", tableCode)
        .single();
      if (!tableData) throw new Error("Table not found");

      let { data: sessionData } = await supabase
        .from("sessions")
        .select("*")
        .eq("tableId", tableData.id)
        .eq("status", "open")
        .single();

      if (!sessionData) {
        const { data: newSession } = await supabase
          .from("sessions")
          .insert({ tableId: tableData.id, status: "open" })
          .select()
          .single();
        sessionData = newSession;
        await supabase.from("tables").update({ status: "active", activeSessionId: sessionData.id }).eq("id", tableData.id);
      }

      return {
        session: {
          id: sessionData.id,
          tableLabel: tableData.label,
          status: sessionData.status,
          subtotal: sessionData.subtotal,
        },
      };
    },
  });

  useEffect(() => {
    if (!menuLoading && !sessionLoading && !initialLoaded) {
      setInitialLoaded(true);
    }
  }, [menuLoading, sessionLoading, initialLoaded]);

  const { data: favorites } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const { data: orderItems } = await supabase
        .from("orderItems")
        .select("menuItemId")
        .limit(5000);
      if (!orderItems || orderItems.length === 0) return [];

      const counts: Record<number, number> = {};
      for (const oi of orderItems) {
        counts[oi.menuItemId] = (counts[oi.menuItemId] || 0) + 1;
      }

      const sorted = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      const topIds = sorted.map(([id]) => parseInt(id));
      if (!topIds.length) return [];

      const { data: items } = await supabase
        .from("menuItems")
        .select("*")
        .in("id", topIds)
        .eq("isAvailable", true);

      return topIds
        .map((id) => items?.find((i) => i.id === id))
        .filter(Boolean);
    },
    staleTime: 60_000,
  });

  const { data: bizSettings } = useQuery({
    queryKey: ["brandIntro"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("tagline, brandDescription, sinceYear, averageRating").limit(1).single();
      return data || null;
    },
    staleTime: 300_000,
  });

  const handleAddWithFly = useCallback((item: any, sourceRect: DOMRect) => {
    if (!cartBtnRef.current) return;
    setFlyingItem({ sourceRect, item });
    // Feature 6: Track recently viewed on add
    addRecentItem(item);
    setTimeout(() => {
      addToCart(item);
      setCartBounce(true);
      setCountPop(true);
      setTimeout(() => { setCartBounce(false); setCountPop(false); }, 400);
    }, 550);
  }, [addToCart, addRecentItem]);

  const handleFlyComplete = useCallback(() => {
    setFlyingItem(null);
  }, []);

  const groupedItems = useMemo(() => {
    if (!menu) return [];
    let items = menu.items;
    if (search) {
      const q = search.toLowerCase().replace(/\s+/g, " ").trim();
      const categories = menu.categories;
      const catIds = categories
        .filter((c) => c.name.toLowerCase().includes(q))
        .map((c) => c.id);
      items = items.filter((i) => {
        const nameMatch = i.name.toLowerCase().includes(q);
        const catMatch = catIds.includes(i.categoryId);
        const tagMatch = i.tags ? i.tags.toLowerCase().includes(q) : false;
        return nameMatch || catMatch || tagMatch;
      });
    }
    if (search) return [{ category: null, items }];

    return menu.categories
      .map((cat) => ({
        category: cat,
        items: items.filter((i) => i.categoryId === cat.id),
      }))
      .filter((g) => g.items.length > 0);
  }, [menu, search]);

  const scrollToCategory = (catId: number) => {
    const el = categoryRefs.current.get(catId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    if (!groupedItems.length || search) return;
    const onScroll = () => {
      setScrollY(window.scrollY);
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
  }, [groupedItems, search]);

  useEffect(() => {
    if (activeCategoryId === null) return;
    const chip = chipRefs.current.get(activeCategoryId);
    if (chip) {
      chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeCategoryId]);

  useEffect(() => {
    if (!groupedItems.length || search) return;
    if (activeCategoryId === null && groupedItems[0]?.category) {
      setActiveCategoryId(groupedItems[0].category.id);
    }
  }, [groupedItems, search, activeCategoryId]);

  // Wheel-to-horizontal scroll for favorites
  useEffect(() => {
    const el = favoritesRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      if ((e.deltaY > 0 && atEnd) || (e.deltaY < 0 && atStart)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * 1.5;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const getItemQuantity = (menuItemId: number) => cart.find((i) => i.menuItemId === menuItemId)?.quantity ?? 0;

  // Feature 6: Track recently viewed on image click
  const handleImageClick = useCallback((item: any, url: string, alt: string) => {
    addRecentItem(item);
    setGalleryImages([{ url, alt }]);
    setGalleryIndex(0);
  }, [addRecentItem]);

  // Feature 2: Dynamic glassmorphism values
  const blurStrength = Math.min(12 + scrollY * 0.05, 24);
  const headerOpacity = Math.min(0.9 + scrollY * 0.0003, 0.97);
  const headerShadow = scrollY > 10
    ? `0 1px 3px rgba(74, 52, 40, ${Math.min(scrollY * 0.0004, 0.08)})`
    : "none";

  if (!initialLoaded) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center">
        <div className="ld-ripple">
          <div />
          <div />
        </div>
      </div>
    );
  }

  if (!menu || !session?.session) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] flex items-center justify-center px-4">
        <div className="text-center max-w-sm space-y-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#4A3428]/10 flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-[#4A3428]" />
          </div>
          <div>
            <p className="text-lg font-semibold text-[#4A3428] mb-1">Unable to load table</p>
            <p className="text-sm text-[#8B7E72]">Please scan the QR code again</p>
          </div>
          <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F4EC] pb-32 premium-bg">
      {/* Feature 3: Subtle decorative elements */}
      <CafeDecorations />
      {/* Feature 2: Glassmorphism Header */}
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
            <div className="text-left">
              <h1 className="text-[32px] font-bold text-[#4A3428] tracking-tight leading-none">MAMA Cafe</h1>
              <p className="text-lg text-[#8B7E72] mt-1 font-semibold tracking-tight font-caveat text-xl">Menu</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#8B7E72]">Table total</span>
              <span className="text-xl font-bold text-[#4A3428]">
                <AnimatedPrice
                  value={parseFloat(session.session.subtotal.toString())}
                  prefix={"₹"}
                  className="text-[#4A3428]"
                  decimals={2}
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 4: Dynamic greeting */}
      <GreetingBanner />

      {/* Feature 5: Brand intro */}
      <BrandIntro
        tagline={bizSettings?.tagline}
        description={bizSettings?.brandDescription}
        sinceYear={bizSettings?.sinceYear}
        averageRating={bizSettings?.averageRating}
      />

      {/* Search */}
      <div className="px-4 pt-6 pb-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7E72] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes, categories&hellip;"
            className="w-full h-11 pl-10 pr-4 rounded-[14px] bg-white border border-[#E8E0D4]/60 text-sm text-[#4A3428] placeholder:text-[#8B7E72]/50 focus:outline-none focus:ring-2 focus:ring-[#C08A4D]/15 focus:border-[#C08A4D]/40 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)] font-caveat text-base"
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

      {/* Customer Favorites Section */}
      {!search && favorites && favorites.length > 0 && (
        <div className="px-4 pt-1 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-4 h-4 text-[#C08A4D] fill-[#C08A4D]" />
            <h2 className="text-lg font-bold text-[#4A3428]">Customer Favorites</h2>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-10 bg-gradient-to-r from-[#F8F4EC] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 z-10 bg-gradient-to-l from-[#F8F4EC] to-transparent" />
            <div
              ref={favoritesRef}
              className="favorites-scroll flex gap-3 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {favorites.map((item: any) => (
                <div key={item.id} className="flex-shrink-0 w-[45vw] max-w-[220px]">
                  <MenuItem
                    item={item}
                    qty={getItemQuantity(item.id)}
                    formatPrice={formatPrice}
                    onAdd={addToCart}
                    onUpdateQty={updateQuantity}
                    onAddWithFly={handleAddWithFly}
                    onImageClick={(url, alt) => handleImageClick(item, url, alt)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feature 6: Recently Viewed Section */}
      {!search && recentItems.length > 0 && (
        <RecentlyViewed
          items={recentItems}
          getItemQuantity={getItemQuantity}
          onAdd={addToCart}
          onUpdateQty={updateQuantity}
          onAddWithFly={handleAddWithFly}
          onImageClick={(url, alt) => {
            const item = recentItems.find((i) => i.imageUrl === url);
            if (item) handleImageClick(item, url, alt);
            else {
              setGalleryImages([{ url, alt }]);
              setGalleryIndex(0);
            }
          }}
          formatPrice={formatPrice}
        />
      )}

      {/* Feature 1: Animated Category Nav with sliding indicator */}
      {!search && groupedItems.length > 0 && (
        <div
          className="sticky top-[100px] z-30 border-b border-[#E8E0D4]/40 transition-[backdrop-filter,background-color] duration-200"
          style={{
            backdropFilter: `blur(${blurStrength}px)`,
            WebkitBackdropFilter: `blur(${blurStrength}px)`,
            backgroundColor: `rgba(248, 244, 236, ${headerOpacity})`,
          }}
        >
          <div className="px-4 py-3 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 w-max relative">
              {groupedItems.map((g) => {
                const isActive = activeCategoryId === g.category!.id;
                return (
                  <button
                    key={g.category!.id}
                    ref={(el) => { if (el) chipRefs.current.set(g.category!.id, el); }}
                    onClick={() => scrollToCategory(g.category!.id)}
                    className={cn(
                      "relative px-4 py-2 rounded-full text-sm font-medium border transition-colors duration-200 whitespace-nowrap font-caveat text-base",
                      isActive
                        ? "text-white border-transparent"
                        : "text-[#4A3428] border-[#C08A4D]/40 hover:border-[#C08A4D]"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="category-pill-bg"
                        className="absolute inset-0 bg-[#C08A4D] rounded-full"
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 35,
                          mass: 0.8,
                        }}
                      />
                    )}
                    <span className="relative z-10">{g.category!.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Category Sections */}
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
              <AnimatePresence mode="popLayout">
                {groupedItems[0]?.items.map((item) => (
                  <MenuItem
                    key={item.id}
                    item={item}
                    qty={getItemQuantity(item.id)}
                    formatPrice={formatPrice}
                    onAdd={addToCart}
                    onUpdateQty={updateQuantity}
                    onAddWithFly={handleAddWithFly}
                    onImageClick={(url, alt) => handleImageClick(item, url, alt)}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        ) : (
          <div className="space-y-7">
            {groupedItems.map((g) => (
              <div
                key={g.category!.id}
                data-category-id={g.category!.id}
                ref={(el) => { if (el) categoryRefs.current.set(g.category!.id, el); }}
                className="scroll-mt-[165px]"
              >
                <div className="bg-[#C08A4D] text-white px-4 py-2 rounded-lg mb-4 inline-block font-caveat">
                  <h2 className="text-lg font-bold">{g.category!.name}</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {g.items.map((item) => (
                    <MenuItem
                      key={item.id}
                      item={item}
                      qty={getItemQuantity(item.id)}
                      formatPrice={formatPrice}
                      onAdd={addToCart}
                      onUpdateQty={updateQuantity}
                      onAddWithFly={handleAddWithFly}
                      onImageClick={(url, alt) => handleImageClick(item, url, alt)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden cart ref anchor for fly animation */}
      <div ref={cartBtnRef} className="fixed bottom-8 left-1/2 -translate-x-1/2 w-0 h-0 pointer-events-none z-50 opacity-0" />

      {/* Floating Cart Bar */}
      <AnimatePresence>
        {cartItemCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-5 pt-3"
          >
            <div className="">
              <motion.button
                whileTap={{ scale: 0.97 }}
                animate={cartBounce ? { scale: [1, 1.06, 1] } : {}}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onClick={() => navigate(`/table/${tableCode}/cart`)}
                className="w-full bg-[#4A3428] text-white rounded-[24px] py-[15px] px-5 flex items-center justify-between shadow-[0_4px_24px_rgba(74,52,40,0.15)] font-caveat text-lg"
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-5 h-5" />
                  <span className="font-medium font-caveat text-lg">View Cart</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/60 font-medium">
                    <span key={countPop ? "pop" : "idle"} className={`inline-block ${countPop ? "cart-count-pop" : ""}`}>
                      {cartItemCount}
                    </span> item{cartItemCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-lg font-bold">
                    <AnimatedPrice
                      value={cart.reduce((s, i) => s + i.price * i.quantity, 0)}
                      prefix={"₹"}
                      className="text-white"
                      decimals={2}
                    />
                  </span>
                </div>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flying item animation */}
      {flyingItem && (
        <FlyingItem
          sourceRect={flyingItem.sourceRect}
          targetRect={cartBtnRef.current?.getBoundingClientRect() || flyingItem.sourceRect}
          imageUrl={flyingItem.item.imageUrl}
          name={flyingItem.item.name}
          onComplete={handleFlyComplete}
        />
      )}

      {/* Image Gallery */}
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
  );
}

function MenuItem({ item, qty, formatPrice, onAdd, onUpdateQty, onAddWithFly, onImageClick }: {
  item: any;
  qty: number;
  formatPrice: (p: number | string) => { symbol: string; value: string };
  onAdd: (item: any) => void;
  onUpdateQty: (id: number, qty: number) => void;
  onAddWithFly?: (item: any, sourceRect: DOMRect) => void;
  onImageClick?: (url: string, alt: string) => void;
}) {
  const { symbol, value } = formatPrice(item.price);
  const hasImage = !!item.imageUrl;
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const handleAdd = () => {
    if (onAddWithFly && addBtnRef.current) {
      const imgEl = addBtnRef.current.closest(".menu-stack")?.querySelector(".menu-card-img-wrap img, .menu-card-img-placeholder");
      const rect = imgEl ? imgEl.getBoundingClientRect() : addBtnRef.current.getBoundingClientRect();
      onAddWithFly(item, rect);
    } else {
      onAdd(item);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="menu-stack">
        <div className="card-bg-before" />
        <div className="card-bg-after" />

        {/* Image or placeholder */}
        {hasImage ? (
          <div
            className="menu-card-img-wrap cursor-pointer"
            onClick={() => onImageClick?.(item.imageUrl, item.name)}
          >
            <img
              src={item.imageUrl}
              alt={item.name}
              loading="lazy"
            />
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
            <span className="placeholder-subtitle">Freshly prepared and waiting to be photographed.</span>
          </div>
        )}

        {/* Badge */}
        {item.badge && (
          <div className={`menu-card-badge menu-card-badge-${item.badge}`}>
            {item.badge === "veg" && "🌱 Veg"}
            {item.badge === "spicy" && "🌶 Spicy"}
            {item.badge === "bestseller" && "⭐ Bestseller"}
            {item.badge === "popular" && "🔥 Popular"}
            {item.badge === "new" && "🆕 New"}
          </div>
        )}

        {/* Content */}
        <div className="menu-card-content">
          <h3 className="menu-card-name">{item.name}</h3>
          {item.description && (
            <p className="text-[11px] text-[#8B7E72] mt-1 leading-snug line-clamp-2">{item.description}</p>
          )}
          <div className="menu-card-bottom">
            <p className="menu-card-price">
              <span className="menu-card-price-symbol">{symbol}</span>
              <AnimatedPrice value={parseFloat(value)} decimals={2} />
            </p>
            {qty === 0 ? (
              <button
                ref={addBtnRef}
                onClick={handleAdd}
                className="menu-card-add-btn"
              >
                <Plus />
              </button>
            ) : (
              <div className="menu-card-qty">
                <button onClick={() => onUpdateQty(item.id, qty - 1)}>
                  <Minus />
                </button>
                <span>{qty}</span>
                <button onClick={() => onUpdateQty(item.id, qty + 1)}>
                  <Plus />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
