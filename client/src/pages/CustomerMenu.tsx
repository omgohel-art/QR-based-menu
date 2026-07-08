import { useEffect, useState, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ShoppingCart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

export default function CustomerMenu() {
  const [, params] = useRoute("/table/:tableCode");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();

  const { addToCart, cartItemCount } = useCart();
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  // Fetch menu
  const { data: menu, isLoading: menuLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: async () => {
      const [categoriesRes, itemsRes] = await Promise.all([
        supabase.from('categories').select('*').order('displayOrder'),
        supabase.from('menuItems').select('*').eq('isAvailable', true).order('displayOrder')
      ]);
      return {
        categories: categoriesRes.data || [],
        items: itemsRes.data || [],
      };
    }
  });

  // Fetch table session
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['tableSession', tableCode],
    enabled: !!tableCode,
    refetchOnMount: true,
    staleTime: 0,
    queryFn: async () => {
      // 1. Get Table
      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('tableCode', tableCode)
        .single();
      
      if (tableError || !tableData) throw new Error("Table not found");

      // 2. Get Active Session
      let { data: sessionData } = await supabase
        .from('sessions')
        .select('*')
        .eq('tableId', tableData.id)
        .eq('status', 'open')
        .single();

      if (!sessionData) {
        const { data: newSession } = await supabase
          .from('sessions')
          .insert({ tableId: tableData.id, status: 'open' })
          .select()
          .single();
        sessionData = newSession;
        
        await supabase.from('tables').update({ status: 'active', activeSessionId: sessionData.id }).eq('id', tableData.id);
      }

      return {
        session: {
          id: sessionData.id,
          tableLabel: tableData.label,
          status: sessionData.status,
          subtotal: sessionData.subtotal,
        }
      };
    }
  });

  // Set initial category
  useEffect(() => {
    if (menu?.categories && menu.categories.length > 0 && selectedCategory === null) {
      setSelectedCategory(menu.categories[0]!.id);
    }
  }, [menu, selectedCategory]);

  const currentCategoryItems = useMemo(() => {
    if (!menu || !selectedCategory) return [];
    return (menu?.items ?? []).filter(item => item.categoryId === selectedCategory);
  }, [menu, selectedCategory]);

  if (menuLoading || sessionLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-amber-600 animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (!menu || !session?.session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <p className="text-red-600 font-semibold mb-4">Unable to load table</p>
          <p className="text-slate-600 mb-6">Please scan the QR code again</p>
          <Button onClick={() => navigate("/")} variant="default">
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Menu</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/table/${tableCode}/cart`)}
                className="relative p-2 text-slate-600 hover:text-amber-600 transition-colors"
              >
                <ShoppingCart className="w-6 h-6" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartItemCount}
                  </span>
                )}
              </button>
              <div className="text-right">
                <p className="text-xs text-slate-600">Table Total</p>
                <p className="text-2xl font-bold text-amber-600">
                  ₹{parseFloat(session.session.subtotal.toString()).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Category Tabs */}
        {(menu.categories?.length ?? 0) > 0 && (
          <Tabs value={selectedCategory?.toString() || ""} onValueChange={(val) => setSelectedCategory(parseInt(val))}>
            <TabsList className="w-full grid gap-2 mb-6 bg-white border border-slate-200">
              {menu.categories?.map(category => (
                <TabsTrigger key={category.id} value={category.id.toString()} className="text-sm">
                  {category.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 gap-4 mb-8">
          {currentCategoryItems.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-slate-600">No items in this category</p>
            </Card>
          ) : (
            currentCategoryItems.map(item => (
              <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-slate-600 line-clamp-2">{item.description}</p>
                      )}
                      <p className="text-lg font-bold text-amber-600 mt-1">
                        ₹{typeof item.price === 'string' ? parseFloat(item.price).toFixed(2) : (item.price as number).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => addToCart(item)}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Floating Cart Button */}
      {cartItemCount > 0 && (
        <button
          onClick={() => navigate(`/table/${tableCode}/cart`)}
          className="fixed bottom-6 right-6 z-50 bg-amber-600 hover:bg-amber-700 text-white rounded-full shadow-lg flex items-center gap-2 px-4 py-3 transition-all hover:scale-105"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="font-semibold">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
        </button>
      )}
    </div>
  );
}
