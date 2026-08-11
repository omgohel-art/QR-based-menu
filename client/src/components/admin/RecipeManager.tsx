import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChefHat, Plus, Trash2, Loader2, Package } from "lucide-react";

interface RecipeRow {
  id: number;
  menuItemId: number;
  inventoryItemId: number;
  quantityRequired: string;
  inventoryName: string;
  inventoryUnit: string;
  currentStock: string;
  minimumStock: string;
}

interface MenuItemRow {
  id: number;
  name: string;
  hsnCode: string | null;
  recipeCount: number;
}

interface InventoryItemRow {
  id: number;
  name: string;
  unit: string;
  currentStock: string;
}

export default function RecipeManager() {
  const queryClient = useQueryClient();
  const [editingMenuItemId, setEditingMenuItemId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRecipeMenuItemId, setNewRecipeMenuItemId] = useState<number | null>(null);
  const [newRecipeInventoryItemId, setNewRecipeInventoryItemId] = useState<number | null>(null);
  const [newRecipeQuantity, setNewRecipeQuantity] = useState("");

  const { data: menuItems } = useQuery({
    queryKey: ["recipes-menu-items"],
    queryFn: async () => {
      const r = await fetch("/api/recipes/menu-items", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      const d = await r.json();
      return d.items as MenuItemRow[];
    },
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ["inventory-items-list"],
    queryFn: async () => {
      const r = await fetch("/api/inventory/items?limit=100", { credentials: "include" });
      if (!r.ok) return [] as InventoryItemRow[];
      const d = await r.json();
      return (d.items || []) as InventoryItemRow[];
    },
  });

  const { data: recipes, isLoading } = useQuery({
    queryKey: ["recipes", editingMenuItemId],
    enabled: editingMenuItemId !== null,
    queryFn: async () => {
      const r = await fetch(`/api/recipes/menu-item/${editingMenuItemId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      const d = await r.json();
      return d.items as RecipeRow[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          menuItemId: newRecipeMenuItemId,
          inventoryItemId: newRecipeInventoryItemId,
          quantityRequired: parseFloat(newRecipeQuantity),
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return r.json();
    },
    onSuccess: () => {
      toast.success("Recipe added");
      setAddOpen(false);
      setNewRecipeMenuItemId(null);
      setNewRecipeInventoryItemId(null);
      setNewRecipeQuantity("");
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-menu-items"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/recipes/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast.success("Recipe removed");
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["recipes-menu-items"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-amber-600" />
          Recipe Mapping
       </CardTitle>
        <p className="text-sm text-slate-500 mt-1">
          Define which ingredients are used per menu item. When an order is placed, ingredients are auto-deducted
          from inventory, and items are auto-disabled if their ingredients run out.
       </p>
     </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label>Select menu item</Label>
            <select
              className="border-input focus-visible:border-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
              value={editingMenuItemId ?? ""}
              onChange={(e) => setEditingMenuItemId(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">— Choose a menu item —</option>
              {menuItems?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.recipeCount > 0 ? `(${m.recipeCount} ingredient${m.recipeCount > 1 ? "s" : ""})` : "(no recipe)"}
               </option>
              ))}
           </select>
         </div>
          <Button
            onClick={() => setAddOpen(true)}
            disabled={!editingMenuItemId}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Ingredient
         </Button>
       </div>

        {editingMenuItemId !== null && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
              Recipe: {menuItems?.find((m) => m.id === editingMenuItemId)?.name || ""}
           </div>
            {isLoading ? (
              <div className="p-6 flex items-center justify-center text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading recipe...
             </div>
            ) : !recipes || recipes.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                No ingredients mapped yet. Add the first one above.
             </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-y border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">Ingredient</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Quantity per Item</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Current Stock</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">Actions</th>
                 </tr>
               </thead>
                <tbody>
                  {recipes.map((r) => {
                    const currentStock = parseFloat(r.currentStock || "0");
                    const minStock = parseFloat(r.minimumStock || "0");
                    const status = currentStock <= 0 ? "Out" : currentStock <= minStock ? "Low" : "OK";
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-slate-400" />
                            {r.inventoryName}
                         </div>
                       </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {parseFloat(r.quantityRequired).toFixed(3)} {r.inventoryUnit}
                       </td>
                        <td className="px-3 py-2 text-right">
                          <span className={
                            status === "Out" ? "text-red-600 font-semibold" :
                            status === "Low" ? "text-amber-600 font-semibold" : "text-slate-700"
                          }>
                            {currentStock.toFixed(3)} {r.inventoryUnit}
                         </span>
                       </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(r.id)}
                            disabled={deleteMutation.isPending}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                         </Button>
                       </td>
                     </tr>
                    );
                  })}
               </tbody>
             </table>
            )}
         </div>
        )}
     </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Ingredient</DialogTitle>
         </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Inventory Item</Label>
              <select
                className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none"
                value={newRecipeInventoryItemId ?? ""}
                onChange={(e) => setNewRecipeInventoryItemId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">— Choose ingredient —</option>
                {inventoryItems?.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} ({it.unit}) — {parseFloat(it.currentStock || "0").toFixed(2)} available
                 </option>
                ))}
             </select>
           </div>
            <div className="space-y-2">
              <Label>Quantity per Item Sold</Label>
              <Input
                type="number"
                step="0.001"
                placeholder="e.g. 30 (grams) or 200 (ml)"
                value={newRecipeQuantity}
                onChange={(e) => setNewRecipeQuantity(e.target.value)}
              />
              <p className="text-xs text-slate-500">
                How much of this ingredient is consumed per order of the selected menu item.
             </p>
           </div>
         </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!newRecipeInventoryItemId || !newRecipeQuantity || parseFloat(newRecipeQuantity) <= 0 || addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   </Card>
  );
}
