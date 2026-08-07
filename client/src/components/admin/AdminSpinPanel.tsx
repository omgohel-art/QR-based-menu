import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Plus, Trash2, Loader2, History, Settings } from "lucide-react";

interface SpinReward {
  id: number;
  label: string;
  rewardType: string;
  rewardValue: number;
  color: string;
  probability: number;
  enabled: boolean;
}

export default function AdminSpinPanel() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("points");
  const [newValue, setNewValue] = useState("10");
  const [newColor, setNewColor] = useState("#C08A4D");
  const [newProb, setNewProb] = useState("10");

  const { data: config, isLoading } = useQuery({
    queryKey: ["spinConfigAdmin"],
    queryFn: async () => {
      const r = await fetch("/api/spin/config");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const { data: history } = useQuery({
    queryKey: ["spinHistoryAdmin"],
    queryFn: async () => {
      const r = await fetch("/api/spin/admin/history?limit=100");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      await fetch(`/api/spin/admin/rewards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spinConfigAdmin"] }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/spin/admin/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newLabel,
          rewardType: newType,
          rewardValue: Number(newValue),
          color: newColor,
          probability: Number(newProb),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spinConfigAdmin"] });
      setShowAdd(false);
      setNewLabel("");
      setNewType("points");
      setNewValue("10");
      setNewColor("#C08A4D");
      setNewProb("10");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/spin/admin/rewards/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["spinConfigAdmin"] }),
  });

  const rewards: SpinReward[] = config?.rewards || [];
  const totalProb = rewards.filter(r => r.enabled).reduce((sum, r) => sum + r.probability, 0);

  const typeLabels: Record<string, string> = {
    points: "Points",
    coupon: "Coupon",
    freeItem: "Free Item",
    none: "Try Again",
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-[#E8E0D4]">
      <CardHeader className="pb-3">
        <CardTitle className="text-[#4A3428] flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-600" /> Lucky Spin Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          </div>
        ) : (
          <>
            {/* Probability Warning */}
            {totalProb !== 100 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                ⚠️ Total probability: {totalProb}% (should be 100%)
              </div>
            )}

            {/* Wheel Rewards */}
            <div className="space-y-2">
              {rewards.map((reward) => (
                <div key={reward.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: reward.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#4A3428] truncate">{reward.label}</p>
                    <p className="text-[11px] text-[#8B7E72]">{typeLabels[reward.rewardType] || reward.rewardType} • {reward.probability}%</p>
                  </div>
                  <button
                    onClick={() => toggleMutation.mutate({ id: reward.id, enabled: !reward.enabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${reward.enabled ? "bg-green-500" : "bg-gray-300"}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${reward.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(reward.id)}
                    className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Reward */}
            {showAdd ? (
              <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
                <Input
                  placeholder="Label (e.g., 10 Points)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="points">Points</option>
                    <option value="coupon">Coupon</option>
                    <option value="freeItem">Free Item</option>
                    <option value="none">Try Again</option>
                  </select>
                  <Input
                    type="number"
                    placeholder="Value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                    <span className="text-xs text-[#8B7E72]">Color</span>
                  </div>
                  <Input
                    type="number"
                    placeholder="Probability %"
                    value={newProb}
                    onChange={(e) => setNewProb(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => addMutation.mutate()}
                    disabled={!newLabel || addMutation.isPending}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Add Reward
                  </Button>
                  <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-[#8B7E72]">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={() => setShowAdd(true)}
                variant="outline"
                className="w-full border-dashed border-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <Plus className="w-4 h-4 mr-2" /> Add Wheel Reward
              </Button>
            )}

            {/* Spin History */}
            {history && history.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-[#4A3428] flex items-center gap-2">
                  <History className="w-4 h-4 text-[#8B7E72]" /> Recent Spins
                </h4>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {history.slice(0, 20).map((h: any) => (
                    <div key={h.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: h.rewardColor || "#C08A4D" }} />
                        <span className="text-[#4A3428]">{h.rewardLabel}</span>
                      </div>
                      <span className="text-[11px] text-[#8B7E72]">{h.customerPhone}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Milestones Info */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-[#4A3428] flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#8B7E72]" /> Milestones
              </h4>
              <div className="space-y-1 text-sm text-[#8B7E72]">
                <p>• 50 points → 1 spin</p>
                <p>• 100 points → 3 spins</p>
                <p>• 150 points → 5 spins</p>
                <p className="text-xs italic mt-1">No more spins awarded after 150 points. Milestones claimed once per customer.</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
