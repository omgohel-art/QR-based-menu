import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ImageUpload from "@/components/ImageUpload";
import { Plus, Trash2, Pencil, Search, ChevronUp, ChevronDown, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";

export default function MenuItemsPanel() {
  const queryClient = useQueryClient();
  const { fmtPrice } = useFormatCurrency();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemData, setNewItemData] = useState({
    categoryId: null as number | null,
    name: "",
    description: "",
    price: "" as string | number,
    imageUrl: null as string | null,
    foodType: "veg" as string,
    badge: null as string | null,
  });
  const [menuSearch, setMenuSearch] = useState("");
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<{ id: number; name: string; description: string; price: number; categoryId: number; imageUrl: string | null; foodType: string; badge: string | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'category' | 'item'; id: number; name: string } | null>(null);
  const [confirmDisableAll, setConfirmDisableAll] = useState<{ categoryId: number; categoryName: string; itemCount: number } | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000,
  });

  const { data: menuItems } = useQuery({
    queryKey: ['menuItems'],
    queryFn: async () => {
      const { data, error } = await supabase.from('menuItems').select('*');
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 1000,
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const maxOrder = categories?.reduce((max, c) => Math.max(max, c.displayOrder ?? 0), 0) ?? 0;
      const { error } = await supabase.from('categories').insert({ name, displayOrder: maxOrder + 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCategoryName("");
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success("Category created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { error } = await supabase.from('categories').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] });
      const prev = queryClient.getQueryData<any[]>(['categories']);
      queryClient.setQueryData<any[]>(['categories'], (old) =>
        old?.map((c) => (c.id === id ? { ...c, name } : c))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['categories'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingCategory(null);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data: items } = await supabase.from('menuItems').select('id').eq('categoryId', id);
      if (items && items.length > 0) {
        throw new Error("Cannot delete category because it contains menu items. Delete the menu items first.");
      }
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] });
      const prev = queryClient.getQueryData<any[]>(['categories']);
      queryClient.setQueryData<any[]>(['categories'], (old) =>
        old?.filter((c) => c.id !== id)
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['categories'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const createMenuItemMutation = useMutation({
    mutationFn: async (item: any) => {
      const categoryItems = menuItems?.filter(m => m.categoryId === item.categoryId) ?? [];
      const maxOrder = categoryItems.reduce((max, m) => Math.max(max, m.displayOrder ?? 0), 0);
      const payload: any = {
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        isAvailable: true,
        displayOrder: maxOrder + 1,
        foodType: item.foodType || "veg",
      };
      if (item.imageUrl) payload.imageUrl = item.imageUrl;
      if (item.badge) payload.badge = item.badge;
      const { error } = await supabase.from('menuItems').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewItemData({ categoryId: 0, name: "", description: "", price: 0, imageUrl: null, foodType: "veg", badge: null });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success("Menu item created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: async (item: any) => {
      const payload: any = {
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        foodType: item.foodType || "veg",
      };
      if (item.badge) payload.badge = item.badge;
      else payload.badge = null;
      if (item.imageUrl !== undefined) payload.imageUrl = item.imageUrl;
      if (item.isAvailable !== undefined) payload.isAvailable = item.isAvailable;
      const { error } = await supabase.from('menuItems').update(payload).eq('id', item.id);
      if (error) throw error;
    },
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ['menuItems'] });
      const prev = queryClient.getQueryData<any[]>(['menuItems']);
      queryClient.setQueryData<any[]>(['menuItems'], (old) =>
        old?.map((m) => (m.id === item.id ? { ...m, name: item.name, description: item.description, price: item.price, categoryId: item.categoryId, foodType: item.foodType, badge: item.badge, imageUrl: item.imageUrl !== undefined ? item.imageUrl : m.imageUrl, isAvailable: item.isAvailable !== undefined ? item.isAvailable : m.isAvailable } : m))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['menuItems'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      fetch("/api/public/invalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: "menuItems" }) });
    },
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const { error } = await supabase.from('menuItems').delete().eq('id', itemId);
      if (error) throw error;
    },
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: ['menuItems'] });
      const prev = queryClient.getQueryData<any[]>(['menuItems']);
      const deletedItem = prev?.find((m) => m.id === itemId);
      queryClient.setQueryData<any[]>(['menuItems'], (old) =>
        old?.filter((m) => m.id !== itemId)
      );
      return { prev, deletedItem };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['menuItems'], ctx.prev);
      toast.error(error.message);
    },
    onSuccess: (_data, _vars, ctx) => {
      if (ctx?.deletedItem) {
        toast(`"${ctx.deletedItem.name}" deleted`, {
          action: {
            label: "Undo",
            onClick: async () => {
              const { error } = await supabase.from('menuItems').insert({
                categoryId: ctx.deletedItem.categoryId,
                name: ctx.deletedItem.name,
                description: ctx.deletedItem.description,
                price: ctx.deletedItem.price,
                imageUrl: ctx.deletedItem.imageUrl,
                foodType: ctx.deletedItem.foodType || "veg",
                badge: ctx.deletedItem.badge,
                isAvailable: ctx.deletedItem.isAvailable,
                displayOrder: ctx.deletedItem.displayOrder,
              });
              if (error) {
                toast.error("Failed to undo deletion");
              } else {
                toast.success(`"${ctx.deletedItem.name}" restored`);
              }
              queryClient.invalidateQueries({ queryKey: ['menuItems'] });
            },
          },
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
  });

  const reorderCategoryMutation = useMutation({
    mutationFn: async ({ id, newOrder }: { id: number; newOrder: number }) => {
      const { error } = await supabase.from('categories').update({ displayOrder: newOrder }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, newOrder }) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] });
      const prev = queryClient.getQueryData<any[]>(['categories']);
      queryClient.setQueryData<any[]>(['categories'], (old) =>
        old?.map((c) => (c.id === id ? { ...c, displayOrder: newOrder } : c))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['categories'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: number; isAvailable: boolean }) => {
      const { error } = await supabase.from('menuItems').update({ isAvailable }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: ['menuItems'] });
      const prev = queryClient.getQueryData<any[]>(['menuItems']);
      queryClient.setQueryData<any[]>(['menuItems'], (old) =>
        old?.map((m) => (m.id === id ? { ...m, isAvailable } : m))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['menuItems'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      fetch("/api/public/invalidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: "menuItems" }) });
    },
  });

  return (
    <>
      <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Categories</h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-lg transition-all duration-200">
                <Plus className="w-4 h-4" />
                New Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Category</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
                <Button
                  onClick={() => createCategoryMutation.mutate(newCategoryName)}
                  className="w-full"
                  disabled={createCategoryMutation.isPending}
                >
                  {createCategoryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories?.map((category: any) => (
            <Card key={category.id} className="p-4 border border-slate-200 dark:border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{category.name}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  {menuItems?.filter((i: any) => i.categoryId === category.id).length || 0} items
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  onClick={() => {
                    const sorted = [...(categories || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
                    const idx = sorted.findIndex((c) => c.id === category.id);
                    if (idx > 0) {
                      const prev = sorted[idx - 1];
                      reorderCategoryMutation.mutate({ id: category.id, newOrder: (prev.displayOrder ?? 0) - 1 });
                      reorderCategoryMutation.mutate({ id: prev.id, newOrder: (category.displayOrder ?? 0) });
                    }
                  }}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-slate-700"
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => {
                    const sorted = [...(categories || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
                    const idx = sorted.findIndex((c) => c.id === category.id);
                    if (idx < sorted.length - 1) {
                      const next = sorted[idx + 1];
                      reorderCategoryMutation.mutate({ id: category.id, newOrder: (next.displayOrder ?? 0) + 1 });
                      reorderCategoryMutation.mutate({ id: next.id, newOrder: (category.displayOrder ?? 0) });
                    }
                  }}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-slate-700"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => setEditingCategory({ id: category.id, name: category.name })}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-600 dark:text-slate-400 hover:text-blue-500"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => setConfirmDelete({ type: 'category', id: category.id, name: category.name })}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Menu Items</h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-lg transition-all duration-200">
                <Plus className="w-4 h-4" />
                New Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Menu Item</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <select
                  value={newItemData.categoryId ?? 0}
                  onChange={(e) => setNewItemData({ ...newItemData, categoryId: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                >
                  <option value={0}>Select Category</option>
                  {categories?.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <Input
                  placeholder="Item name"
                  value={newItemData.name}
                  onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })}
                />
                <Input
                  placeholder="Description"
                  value={newItemData.description}
                  onChange={(e) => setNewItemData({ ...newItemData, description: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Price"
                  step="0.01"
                  value={newItemData.price}
                  onChange={(e) => setNewItemData({ ...newItemData, price: parseFloat(e.target.value) })}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Food Type</label>
                    <select
                      value={newItemData.foodType}
                      onChange={(e) => setNewItemData({ ...newItemData, foodType: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="veg">🟢 Veg</option>
                      <option value="non-veg">🔴 Non-Veg</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Badge</label>
                    <select
                      value={newItemData.badge || ""}
                      onChange={(e) => setNewItemData({ ...newItemData, badge: e.target.value || null })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="">None</option>
                      <option value="bestseller">⭐ Bestseller</option>
                      <option value="popular">🔥 Popular</option>
                      <option value="new">🆕 New</option>
                      <option value="spicy">🌶 Spicy</option>
                    </select>
                  </div>
                </div>
                <ImageUpload
                  currentImageUrl={newItemData.imageUrl}
                  onImageChange={(url) => setNewItemData({ ...newItemData, imageUrl: url })}
                />
                <Button
                  onClick={() => {
                    if (newItemData.categoryId != null && newItemData.name && Number(newItemData.price) > 0) {
                      createMenuItemMutation.mutate(newItemData);
                    } else {
                      toast.error("Please fill all fields");
                    }
                  }}
                  className="w-full"
                  disabled={createMenuItemMutation.isPending}
                >
                  {createMenuItemMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
          {categories?.filter((c: any) => menuItems?.some((i: any) => i.categoryId === c.id)).map((category: any) => (
            <button
              key={category.id}
              onClick={() => document.getElementById(`admin-cat-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="px-4 py-2 rounded-full text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 hover:border-blue-300 transition-all whitespace-nowrap"
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            placeholder="Search menu items..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all bg-white dark:bg-slate-900"
          />
        </div>

        <div className="space-y-6">
          {categories?.map((category: any) => {
            let catItems = menuItems?.filter((i: any) => i.categoryId === category.id) || [];
            if (menuSearch) {
              const q = menuSearch.toLowerCase();
              catItems = catItems.filter((i: any) =>
                i.name.toLowerCase().includes(q) ||
                (i.description || "").toLowerCase().includes(q)
              );
            }
            if (catItems.length === 0) return null;

  return (
              <div key={category.id} id={`admin-cat-${category.id}`} className="scroll-mt-20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{category.name}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={async () => {
                        const ids = catItems.map((i: any) => i.id);
                        queryClient.setQueryData<any[]>(['menuItems'], (old) =>
                          old?.map((m) => (ids.includes(m.id) ? { ...m, isAvailable: true } : m))
                        );
                        const { error } = await supabase.from('menuItems').update({ isAvailable: true }).in('id', ids);
                        if (error) {
                          queryClient.invalidateQueries({ queryKey: ['menuItems'] });
                          toast.error(error.message);
                        } else {
                          toast.success(`Enabled all ${catItems.length} items in ${category.name}`);
                        }
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-colors"
                    >
                      Enable All
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDisableAll({ categoryId: category.id, categoryName: category.name, itemCount: catItems.length });
                      }}
                      className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
                    >
                      Disable All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {catItems.map((item: any) => (
                    <Card key={item.id} className="p-3 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:shadow-md transition-shadow flex flex-col">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} width={200} height={112} loading="lazy" className="w-full h-28 rounded-lg object-cover mb-2" />
                      ) : (
                        <div className="w-full h-28 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                          <span className="text-xs text-slate-400 dark:text-slate-500">No image</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {(item.foodType === "veg" || item.foodType === "non-veg") && (
                            <span className={`inline-block w-3 h-3 rounded-sm border-2 ${item.foodType === "veg" ? "border-green-500 bg-green-500" : "border-red-500 bg-red-500"}`}>
                              <span className={`block w-1.5 h-1.5 rounded-full mx-auto mt-[1px] ${item.foodType === "veg" ? "bg-white" : "bg-white"}`} />
                            </span>
                          )}
                          <h4 className="font-semibold text-sm text-slate-900 dark:text-white truncate">{item.name}</h4>
                          {item.badge && (
                            <span className="text-[9px] font-semibold uppercase px-1 py-0.5 rounded border leading-none whitespace-nowrap shrink-0"
                              style={{
                                color: item.badge === 'bestseller' ? '#d97706' : item.badge === 'popular' ? '#ea580c' : item.badge === 'new' ? '#2563eb' : item.badge === 'spicy' ? '#dc2626' : '#64748b',
                                borderColor: item.badge === 'bestseller' ? '#fcd34d' : item.badge === 'popular' ? '#fdba74' : item.badge === 'new' ? '#93c5fd' : item.badge === 'spicy' ? '#fca5a5' : '#cbd5e1',
                                backgroundColor: item.badge === 'bestseller' ? '#fffbeb' : item.badge === 'popular' ? '#fff7ed' : item.badge === 'new' ? '#eff6ff' : item.badge === 'spicy' ? '#fef2f2' : '#f8fafc',
                              }}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{item.description}</p>}
                        <p className="text-sm font-bold text-green-500 mt-1">{fmtPrice(typeof item.price === 'string' ? parseFloat(item.price) : (item.price as number))}</p>
                      </div>
                      <div className="flex gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <Button
                            onClick={() => setEditingMenuItem({
                              id: item.id,
                              name: item.name,
                              description: item.description || "",
                              price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
                              categoryId: item.categoryId,
                              imageUrl: item.imageUrl || null,
                              foodType: item.foodType || "veg",
                              badge: item.badge || null
                            })}
                          size="sm"
                          variant="ghost"
                           className="flex-1 h-7 text-xs text-slate-600 dark:text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => toggleAvailabilityMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                          size="sm"
                          variant="ghost"
                           className={`flex-1 h-7 text-xs ${item.isAvailable ? 'text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950' : 'text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950'}`}
                        >
                          <Ban className="w-3 h-3 mr-1" />
                          {item.isAvailable ? 'Out of Stock' : 'In Stock'}
                        </Button>
                        <Button
                          onClick={() => setConfirmDelete({ type: 'item', id: item.id, name: item.name })}
                          size="sm"
                          variant="ghost"
                           className="flex-1 h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Edit Category Dialog */}
      <Dialog open={editingCategory !== null} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <div className="space-y-4">
              <Input
                placeholder="Category name"
                value={editingCategory.name}
                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              />
              <Button
                onClick={() => updateCategoryMutation.mutate({ id: editingCategory.id, name: editingCategory.name })}
                className="w-full"
                disabled={updateCategoryMutation.isPending}
              >
                {updateCategoryMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Menu Item Dialog */}
      <Dialog open={editingMenuItem !== null} onOpenChange={(open) => !open && setEditingMenuItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Menu Item</DialogTitle>
          </DialogHeader>
          {editingMenuItem && (
            <div className="space-y-4">
              <select
                value={editingMenuItem.categoryId}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, categoryId: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              >
                <option value={0}>Select Category</option>
                {categories?.map((cat: any) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <Input
                placeholder="Item name"
                value={editingMenuItem.name}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, name: e.target.value })}
              />
              <Input
                placeholder="Description"
                value={editingMenuItem.description}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, description: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Price"
                step="0.01"
                value={editingMenuItem.price}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, price: parseFloat(e.target.value) })}
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Food Type</label>
                  <select
                    value={editingMenuItem.foodType}
                    onChange={(e) => setEditingMenuItem({ ...editingMenuItem, foodType: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    <option value="veg">🟢 Veg</option>
                    <option value="non-veg">🔴 Non-Veg</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Badge</label>
                  <select
                    value={editingMenuItem.badge || ""}
                    onChange={(e) => setEditingMenuItem({ ...editingMenuItem, badge: e.target.value || null })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    <option value="">None</option>
                    <option value="bestseller">⭐ Bestseller</option>
                    <option value="popular">🔥 Popular</option>
                    <option value="new">🆕 New</option>
                    <option value="spicy">🌶 Spicy</option>
                  </select>
                </div>
              </div>
              <ImageUpload
                currentImageUrl={editingMenuItem.imageUrl}
                onImageChange={(url) => setEditingMenuItem({ ...editingMenuItem, imageUrl: url })}
              />
              <Button
                onClick={() => {
                  if (editingMenuItem.categoryId && editingMenuItem.name && editingMenuItem.price > 0) {
                    updateMenuItemMutation.mutate(editingMenuItem);
                  } else {
                    toast.error("Please fill all fields");
                  }
                }}
                className="w-full"
                disabled={updateMenuItemMutation.isPending}
              >
                {updateMenuItemMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          {confirmDelete && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {confirmDelete.type === 'category' && `Are you sure you want to delete category "${confirmDelete.name}"?`}
                {confirmDelete.type === 'item' && `Delete "${confirmDelete.name}"? This action cannot be undone.`}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    if (confirmDelete.type === 'category') deleteCategoryMutation.mutate(confirmDelete.id);
                    else if (confirmDelete.type === 'item') deleteMenuItemMutation.mutate(confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Disable All Dialog */}
      <Dialog open={confirmDisableAll !== null} onOpenChange={(open) => !open && setConfirmDisableAll(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disable All Items</DialogTitle>
          </DialogHeader>
          {confirmDisableAll && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This will hide all {confirmDisableAll.itemCount} items in <strong>{confirmDisableAll.categoryName}</strong> from customers. They will not be able to order these items.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmDisableAll(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={async () => {
                    const catItemsList = menuItems?.filter(i => i.categoryId === confirmDisableAll.categoryId) || [];
                    const ids = catItemsList.map((i: any) => i.id);
                    queryClient.setQueryData<any[]>(['menuItems'], (old) =>
                      old?.map((m) => (ids.includes(m.id) ? { ...m, isAvailable: false } : m))
                    );
                    const { error } = await supabase.from('menuItems').update({ isAvailable: false }).in('id', ids);
                    if (error) {
                      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
                      toast.error(error.message);
                    } else {
                      toast.success(`Disabled all ${ids.length} items in ${confirmDisableAll.categoryName}`);
                    }
                    setConfirmDisableAll(null);
                  }}
                >
                  Disable All
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
