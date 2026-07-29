import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, Users, UtensilsCrossed } from "lucide-react";
import { TableGridSkeleton } from "@/components/Skeletons";
import { useLocation } from "wouter";

interface TakeOrderProps {
  onNavigate?: (page: string) => void;
}

export default function TakeOrder({ onNavigate }: TakeOrderProps) {
  const [, navigate] = useLocation();

  const { data: tables, isLoading } = useQuery({
    queryKey: ["tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tables")
        .select("id, label, tableCode, status")
        .order("label");
      if (error) throw error;
      return data;
    },
  });

  const handleSelectTable = (table: { id: number; label: string; tableCode: string }) => {
    sessionStorage.setItem("fromAdmin", "true");
    navigate(`/table/${table.tableCode}`);
  };

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => onNavigate?.("back")}
          className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Take Order</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Select a table to start taking an order.</p>
        </div>
      </div>

      {isLoading ? (
        <TableGridSkeleton />
      ) : !tables?.length ? (
        <Card className="p-12 bg-white dark:bg-slate-900 text-center">
          <UtensilsCrossed className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No Tables Found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Create tables in Table Settings first.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {tables.map((table) => (
            <button
              key={table.id}
              onClick={() => handleSelectTable(table)}
              className="group p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/10 transition-all text-center cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center mx-auto mb-3 group-hover:bg-amber-100 dark:group-hover:bg-amber-900 transition-colors">
                <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{table.label}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 capitalize">{table.status || "active"}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
