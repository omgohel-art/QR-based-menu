import { useEffect, useState, useMemo, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Minus, ShoppingBag, UtensilsCrossed, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import Footer from "@/components/marketing/Footer";
import "@/components/LoadingRipple.css";

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

  const groupedItems = useMemo(() => {
    if (!menu) return [];
    let items = menu.items;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
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

  const getItemQuantity = (menuItemId: number) => cart.find((i) => i.menuItemId === menuItemId)?.quantity ?? 0;

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
    <div className="min-h-screen bg-[#F8F4EC] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#F8F4EC]/90 backdrop-blur-lg border-b border-[#E8E0D4]/60">
        <div className="px-4 py-5">
          <div className="flex items-center justify-between">
            <h1 className="text-[32px] font-bold text-[#4A3428] tracking-tight">Menu</h1>
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#8B7E72]">Table total</span>
              <span className="text-xl font-bold text-[#4A3428]">
                {(() => {
                  const p = formatPrice(session.session.subtotal.toString());
                  return <><span className="text-[#8B7E72]/70 text-base">{p.symbol}</span>{p.value}</>;
                })()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pt-6 pb-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B7E72] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes&hellip;"
            className="w-full h-11 pl-10 pr-4 rounded-[12px] bg-white border border-[#E8E0D4]/60 text-sm text-[#4A3428] placeholder:text-[#8B7E72]/50 focus:outline-none focus:ring-2 focus:ring-[#C08A4D]/15 focus:border-[#C08A4D]/40 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          />
        </div>
      </div>

      {/* Sticky Category Nav */}
      {!search && groupedItems.length > 0 && (
        <div className="sticky top-[76px] z-30 bg-[#F8F4EC]/90 backdrop-blur-lg border-b border-[#E8E0D4]/40">
          <div className="px-4 py-3 overflow-x-auto scrollbar-none">
            <div className="flex gap-2 w-max">
              {groupedItems.map((g) => (
                <button
                  key={g.category!.id}
                  ref={(el) => { if (el) chipRefs.current.set(g.category!.id, el); }}
                  onClick={() => scrollToCategory(g.category!.id)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium border transition-all duration-200 whitespace-nowrap",
                    activeCategoryId === g.category!.id
                      ? "bg-[#C08A4D] text-white border-[#C08A4D] font-semibold"
                      : "bg-white text-[#4A3428] border-[#C08A4D]/40 hover:border-[#C08A4D]"
                  )}
                >
                  {g.category!.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Category Sections */}
      <div ref={scrollContainerRef} className="px-4 pt-5 space-y-7">
        {search ? (
          <div className="space-y-3">
            {groupedItems[0]?.items.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E8E0D4]/30 flex items-center justify-center">
                  <Search className="w-6 h-6 text-[#8B7E72]/50" />
                </div>
                <p className="text-[#8B7E72] text-sm">No dishes found</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {groupedItems[0]?.items.map((item) => (
                  <MenuItem key={item.id} item={item} qty={getItemQuantity(item.id)} formatPrice={formatPrice} onAdd={addToCart} onUpdateQty={updateQuantity} />
                ))}
              </AnimatePresence>
            )}
          </div>
        ) : (
          groupedItems.map((g) => (
            <div
              key={g.category!.id}
              data-category-id={g.category!.id}
              ref={(el) => { if (el) categoryRefs.current.set(g.category!.id, el); }}
              className="scroll-mt-[140px]"
            >
              <div className="bg-[#C08A4D] text-white px-4 py-2 rounded-lg mb-4 inline-block">
                <h2 className="text-lg font-bold">{g.category!.name}</h2>
              </div>
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {g.items.map((item) => (
                    <MenuItem key={item.id} item={item} qty={getItemQuantity(item.id)} formatPrice={formatPrice} onAdd={addToCart} onUpdateQty={updateQuantity} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))
        )}
      </div>

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
                transition={{ duration: 0.1, ease: "easeIn" }}
                onClick={() => navigate(`/table/${tableCode}/cart`)}
                className="w-full bg-[#4A3428] text-white rounded-[24px] py-[15px] px-5 flex items-center justify-between shadow-[0_4px_24px_rgba(74,52,40,0.15)]"
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="w-5 h-5" />
                  <span className="font-medium">View Cart</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/60 font-medium">{cartItemCount} item{cartItemCount !== 1 ? "s" : ""}</span>
                  <span className="text-lg font-bold">
                    {(() => {
                      const t = cart.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2);
                      return <><span className="text-white/60 font-medium">{"\u20B9"}</span>{t}</>;
                    })()}
                  </span>
                </div>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-16">
        <Footer variant="menu" />
      </div>
    </div>
  );
}

function MenuItem({ item, qty, formatPrice, onAdd, onUpdateQty }: {
  item: any;
  qty: number;
  formatPrice: (p: number | string) => { symbol: string; value: string };
  onAdd: (item: any) => void;
  onUpdateQty: (id: number, qty: number) => void;
}) {
  const { symbol, value } = formatPrice(item.price);
  const hasImage = !!item.imageUrl;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="bg-white rounded-[16px] border border-[#E8E0D4]/60 shadow-[0_1px_8px_rgba(0,0,0,0.04)] p-3 flex items-center gap-3">
        {/* Thumbnail */}
        {hasImage ? (
          <div className="w-[72px] h-[72px] rounded-[12px] overflow-hidden bg-[#F8F4EC] shrink-0">
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="w-[72px] h-[72px] rounded-[12px] bg-[#F8F4EC] flex items-center justify-center shrink-0">
            <ImageOff className="w-5 h-5 text-[#C08A4D]/30" />
          </div>
        )}

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-[#4A3428] leading-snug">{item.name}</h3>
          {item.description && (
            <p className="text-xs text-[#8B7E72] mt-0.5 leading-snug line-clamp-2">{item.description}</p>
          )}
          <p className="mt-1.5 text-[15px] font-bold text-[#C08A4D]">
            <span className="text-[#8B7E72]/50 font-medium text-xs">{symbol}</span>{value}
          </p>
        </div>

        {/* Add / Quantity */}
        {qty === 0 ? (
          <motion.button
            whileTap={{ scale: 0.93 }}
            transition={{ duration: 0.1, ease: "easeIn" }}
            onClick={() => onAdd(item)}
            className="shrink-0 h-9 px-4 rounded-[10px] bg-white border border-[#C08A4D] text-[#C08A4D] text-sm font-semibold flex items-center justify-center hover:bg-[#C08A4D] hover:text-white transition-all"
          >
            Add
          </motion.button>
        ) : (
          <div className="shrink-0 flex items-center gap-0.5 bg-[#F8F4EC] border border-[#E8E0D4]/60 rounded-[10px] px-0.5 py-0.5">
            <motion.button
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.1, ease: "easeIn" }}
              onClick={() => onUpdateQty(item.id, qty - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[#8B7E72] hover:text-[#4A3428] hover:bg-[#E8E0D4]/40 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </motion.button>
            <span className="min-w-[20px] text-center text-sm font-semibold text-[#4A3428]">{qty}</span>
            <motion.button
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.1, ease: "easeIn" }}
              onClick={() => onUpdateQty(item.id, qty + 1)}
              className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[#8B7E72] hover:text-[#4A3428] hover:bg-[#E8E0D4]/40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
