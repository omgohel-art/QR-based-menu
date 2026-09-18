import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRightLeft, GitMerge, Split, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface TableOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: { id: number; label: string; tableCode: string } | null;
  allTables: Array<{ id: number; label: string; tableCode: string }>;
}

export default function TableOperationsModal({ isOpen, onClose, table, allTables }: TableOperationsModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"transfer" | "merge" | "split">("transfer");
  const [targetTableCode, setTargetTableCode] = useState("");
  const [splitCount, setSplitCount] = useState(2);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !table) return null;

  const handleTransfer = async () => {
    if (!targetTableCode) {
      toast.error("Please select a target table");
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/tables/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          fromTableCode: table.tableCode,
          toTableCode: targetTableCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer failed");

      toast.success(data.message || "Table transferred successfully");
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      queryClient.invalidateQueries({ queryKey: ["activeTables"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to transfer table");
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (!targetTableCode) {
      toast.error("Please select a second table to merge");
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/tables/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          tableCode1: table.tableCode,
          tableCode2: targetTableCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");

      toast.success(data.message || "Tables merged successfully");
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      queryClient.invalidateQueries({ queryKey: ["activeTables"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to merge tables");
    } finally {
      setLoading(false);
    }
  };

  const handleSplit = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/tables/split-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          tableCode: table.tableCode,
          splitMethod: "equal",
          splitCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Split failed");

      toast.success(`Bill split equally into ${splitCount} parts (₹${data.perPerson} / person)`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to split bill");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center justify-between">
            <span>Table Operations: {table.label}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Action Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4">
          <button
            onClick={() => setActiveTab("transfer")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "transfer" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
          </button>
          <button
            onClick={() => setActiveTab("merge")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "merge" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <GitMerge className="w-3.5 h-3.5" /> Merge
          </button>
          <button
            onClick={() => setActiveTab("split")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "split" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Split className="w-3.5 h-3.5" /> Split Bill
          </button>
        </div>

        {/* Tab 1: Transfer Table */}
        {activeTab === "transfer" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Move all active orders and session from <b>{table.label}</b> to another empty table.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Select Target Table</label>
              <select
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                value={targetTableCode}
                onChange={(e) => setTargetTableCode(e.target.value)}
              >
                <option value="">-- Choose Target Table --</option>
                {allTables
                  .filter((t) => t.id !== table.id)
                  .map((t) => (
                    <option key={t.id} value={t.tableCode}>
                      {t.label}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              onClick={handleTransfer}
              disabled={loading || !targetTableCode}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Transfer Table Order
            </Button>
          </div>
        )}

        {/* Tab 2: Merge Tables */}
        {activeTab === "merge" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Combine active orders of <b>{table.label}</b> with another occupied table.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Select Table to Merge With</label>
              <select
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                value={targetTableCode}
                onChange={(e) => setTargetTableCode(e.target.value)}
              >
                <option value="">-- Choose Second Table --</option>
                {allTables
                  .filter((t) => t.id !== table.id)
                  .map((t) => (
                    <option key={t.id} value={t.tableCode}>
                      {t.label}
                    </option>
                  ))}
              </select>
            </div>
            <Button
              onClick={handleMerge}
              disabled={loading || !targetTableCode}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Merge Tables
            </Button>
          </div>
        )}

        {/* Tab 3: Split Bill */}
        {activeTab === "split" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Split the active bill for <b>{table.label}</b> equally among guests.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Number of People / Splits</label>
              <Input
                type="number"
                min={2}
                max={10}
                value={splitCount}
                onChange={(e) => setSplitCount(parseInt(e.target.value) || 2)}
                className="w-full"
              />
            </div>
            <Button
              onClick={handleSplit}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Calculate Equal Split ({splitCount} ways)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}