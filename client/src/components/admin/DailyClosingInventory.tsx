import { useState, useEffect } from "react";
import { Table, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFormatCurrency } from "@/hooks/useFormatCurrency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface InventoryItem {
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  lastCounted: string;
  notes?: string;
}

interface DailyClosingInventoryProps {
  open: boolean;
  onClose: () => void;
}

export default function DailyClosingInventory({ open, onClose }: DailyClosingInventoryProps) {
  if (!open) return null;

  const queryClient = useQueryClient();
  const { fmtPrice } = useFormatCurrency();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const defaultInventory: InventoryItem[] = [
      {
        name: "Fresh Milk",
        unit: "Packet (1 Litre)",
        currentStock: 12,
        minStock: 5,
        maxStock: 20,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
      {
        name: "Coffee Beans",
        unit: "kg",
        currentStock: 3.5,
        minStock: 1,
        maxStock: 5,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
      {
        name: "Burger Buns",
        unit: "Pack (6 pcs)",
        currentStock: 8,
        minStock: 3,
        maxStock: 15,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
      {
        name: "Syrup - Chocolate",
        unit: "Bottle (750ml)",
        currentStock: 4,
        minStock: 2,
        maxStock: 10,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
      {
        name: "Syrup - Caramel",
        unit: "Bottle (750ml)",
        currentStock: 3,
        minStock: 2,
        maxStock: 10,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
      {
        name: "Whipped Cream",
        unit: "Can",
        currentStock: 6,
        minStock: 2,
        maxStock: 10,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
      {
        name: "Disposable Cups",
        unit: "Packet (50 pcs)",
        currentStock: 5,
        minStock: 3,
        maxStock: 15,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
      {
        name: "Sugar Packets",
        unit: "Box (100 pcs)",
        currentStock: 12,
        minStock: 5,
        maxStock: 30,
        lastCounted: new Date().toLocaleDateString("en-IN"),
      },
    ];
    setInventory(defaultInventory);
    setLoading(false);
  }, []);

  const handleCountUpdate = async (itemId: number, newStock: number) => {
    let itemName = "";
    setInventory((prev) =>
      prev.map((item, index) => {
        if (index === itemId) {
          itemName = item.name;
          return { ...item, currentStock: newStock, lastCounted: new Date().toLocaleDateString("en-IN") };
        }
        return item;
      })
    );
    await queryClient.invalidateQueries({ queryKey: ["inventory"] });
    toast.success(`Stock updated for ${itemName}`);
  };

  const handleLowStockItems = inventory.filter((item) => item.currentStock <= item.minStock);

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="w-8 h-8 mx-auto animate-spin" /></div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <Card className="max-w-2xl w-full p-6 bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex flex-row justify-between items-center mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Table className="w-5 h-5 text-amber-500" /> Daily Closing Inventory
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          {showSuccess && (
            <div className="bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200/50 rounded-md p-3 mb-4">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Inventory saved successfully!
              </span>
            </div>
          )}

          <p className="text-sm text-slate-500 dark:text-slate-400">
            End-of-day stock count for your café supplies
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inventory.map((item, index) => (
              <div key={index} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white text-sm">{item.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.unit} · Last: {item.lastCounted}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    item.currentStock <= item.minStock
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 animate-pulse"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  }`}>
                    {item.currentStock} {item.unit.split(" ")[0]}
                  </span>
                </div>

                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCountUpdate(index, item.currentStock + 1)}
                    className="flex-1 h-8 text-xs bg-white dark:bg-slate-800"
                    disabled={item.currentStock >= item.maxStock}
                  >
                    +1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCountUpdate(index, Math.max(0, item.currentStock - 1))}
                    className="flex-1 h-8 text-xs bg-white dark:bg-slate-800"
                    disabled={item.currentStock <= 0}
                  >
                    -1
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {handleLowStockItems.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200/50 rounded-lg flex items-start gap-3">
              <span className="text-red-500 text-lg">⚠️</span>
              <div>
                <p className="font-medium text-red-600 dark:text-red-400 text-sm">
                  {handleLowStockItems.length} item(s) at or below minimum stock level
                </p>
                <p className="text-xs text-red-400 dark:text-red-300">
                  {handleLowStockItems.map(i => i.name).join(", ")} need reordering soon.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Tracked Items: {inventory.length}
            </span>
            <Button
              onClick={onClose}
              className="px-6 py-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90"
            >
              Done / Close
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}