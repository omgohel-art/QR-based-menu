import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Trophy, Clock, Gift, Loader2, Star, Sparkles, History } from "lucide-react";

interface SpinReward {
  id: number;
  label: string;
  rewardType: string;
  rewardValue: number;
  color: string;
  probability: number;
  enabled: boolean;
}

interface SpinStatus {
  available: number;
  used: number;
  totalSpinsUsed: number;
  lifetimeEarned: number;
  currentPoints: number;
  nextMilestone: { points: number; spins: number } | null;
  unclaimedMilestones: { points: number; spins: number }[];
  history: any[];
  milestones: any[];
}

function sanitizePhone(raw: string): string {
  let digits = raw.replace(/[\s\-\(\)\+]/g, "");
  if (digits.startsWith("00")) digits = digits.substring(2);
  if (!digits.startsWith("91") && digits.length === 10) digits = "91" + digits;
  return digits;
}

const SPIN_MILESTONES = [
  { points: 50, spins: 1 },
  { points: 100, spins: 3 },
  { points: 150, spins: 5 },
];

export default function LuckySpinPage() {
  const [, params] = useRoute("/table/:tableCode/spin");
  const tableCode = params?.tableCode;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [phoneInput, setPhoneInput] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState<{ label: string; color: string; type: string } | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tableCode && !verifiedPhone) {
      try {
        const saved = localStorage.getItem(`cafe-customer-phone-${tableCode}`);
        if (saved) {
          const sanitized = sanitizePhone(saved);
          if (sanitized.length >= 10) setVerifiedPhone(sanitized);
        }
      } catch {}
    }
  }, [tableCode, verifiedPhone]);

  const { data: config } = useQuery({
    queryKey: ["spinConfig"],
    queryFn: async () => {
      const r = await fetch("/api/spin/config");
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: status, isLoading: statusLoading } = useQuery<SpinStatus>({
    queryKey: ["spinStatus", verifiedPhone],
    enabled: !!verifiedPhone,
    queryFn: async () => {
      const r = await fetch(`/api/spin/status/${verifiedPhone}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 10000,
  });

  const playMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/spin/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerPhone: verifiedPhone }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || "Spin failed");
      }
      return r.json();
    },
    onSuccess: (data) => {
      const rewards = config?.rewards || [];
      const idx = rewards.findIndex((r: SpinReward) => r.id === data.reward.id);
      const segmentAngle = 360 / Math.max(rewards.length, 1);
      const targetAngle = 360 - (idx * segmentAngle + segmentAngle / 2);
      const fullRotations = 5 + Math.floor(Math.random() * 3);
      setRotation((prev) => prev + fullRotations * 360 + targetAngle - (prev % 360));

      setTimeout(() => {
        setShowResult({ label: data.reward.label, color: data.reward.color, type: data.reward.rewardType });
        setSpinning(false);
        queryClient.invalidateQueries({ queryKey: ["spinStatus", verifiedPhone] });
      }, 4500);
    },
    onError: (err: any) => {
      setSpinning(false);
    },
  });

  const handleSpin = useCallback(() => {
    if (spinning || !status || status.available <= 0) return;
    setSpinning(true);
    setShowResult(null);
    playMutation.mutate();
  }, [spinning, status, playMutation]);

  const rewards = config?.rewards || [];
  const segmentAngle = 360 / Math.max(rewards.length, 1);

  const verifyMutation = useMutation({
    mutationFn: async (phone: string) => {
      const sanitized = sanitizePhone(phone);
      const r = await fetch(`/api/spin/status/${sanitized}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (_data, variables) => {
      const sanitized = sanitizePhone(variables);
      setVerifiedPhone(sanitized);
      try {
        if (tableCode) localStorage.setItem(`cafe-customer-phone-${tableCode}`, sanitized);
      } catch {}
    },
  });

  if (!verifiedPhone) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-[24px] shadow-xl w-full max-w-sm p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 flex items-center justify-center">
            <Trophy className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-[#4A3428]">Lucky Spin</h1>
          <p className="text-sm text-[#8B7E72]">Enter your phone number to spin the wheel</p>
          <Input
            type="tel"
            placeholder="10-digit mobile number"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
            onKeyDown={(e) => e.key === "Enter" && phoneInput.length === 10 && verifyMutation.mutate(phoneInput)}
            className="text-center text-lg tracking-wider"
          />
          <Button
            onClick={() => verifyMutation.mutate(phoneInput)}
            disabled={phoneInput.length !== 10 || verifyMutation.isPending}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
          >
            {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Start Spinning
          </Button>
          <Button variant="ghost" className="w-full text-[#8B7E72]" onClick={() => navigate(`/table/${tableCode}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Menu
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-6 pb-8">
        <div className="max-w-lg mx-auto">
          <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 mb-4 -ml-2" onClick={() => navigate(`/table/${tableCode}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">Lucky Spin</h1>
              <p className="text-white/80 text-sm">Spin the wheel to win rewards!</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto -mt-4 px-4 space-y-4">
        {/* Available Spins */}
        <div className="bg-white rounded-[20px] shadow-lg p-5 text-center">
          <p className="text-sm text-[#8B7E72]">Available Spins</p>
          <p className="text-4xl font-bold text-amber-600" style={{ fontFamily: "var(--font-caveat)" }}>{status?.available || 0}</p>
          {status?.nextMilestone && (
            <p className="text-xs text-[#8B7E72] mt-1">
              {status.nextMilestone.points - status.lifetimeEarned} more points to unlock {status.nextMilestone.spins} Lucky Spins
            </p>
          )}
        </div>

        {/* Wheel */}
        <div className="bg-white rounded-[20px] shadow-lg p-6 flex flex-col items-center">
          <div className="relative w-72 h-72 mb-4">
            {/* Pointer */}
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
              <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[20px] border-t-amber-600 drop-shadow-md" />
            </div>
            {/* Wheel */}
            <div
              ref={wheelRef}
              className="w-full h-full rounded-full border-4 border-amber-600 shadow-inner transition-transform duration-[4500ms] ease-[cubic-bezier(0.17,0.67,0.12,0.99)]"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <svg viewBox="0 0 300 300" className="w-full h-full">
                {rewards.map((reward: SpinReward, i: number) => {
                  const startAngle = i * segmentAngle;
                  const endAngle = (i + 1) * segmentAngle;
                  const startRad = (startAngle * Math.PI) / 180;
                  const endRad = (endAngle * Math.PI) / 180;
                  const x1 = 150 + 140 * Math.cos(startRad);
                  const y1 = 150 + 140 * Math.sin(startRad);
                  const x2 = 150 + 140 * Math.cos(endRad);
                  const y2 = 150 + 140 * Math.sin(endRad);
                  const largeArc = segmentAngle > 180 ? 1 : 0;
                  const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180;
                  const textX = 150 + 85 * Math.cos(midAngle);
                  const textY = 150 + 85 * Math.sin(midAngle);
                  const textRotation = (startAngle + endAngle) / 2;

                  return (
                    <g key={reward.id}>
                      <path
                        d={`M150,150 L${x1},${y1} A140,140 0 ${largeArc},1 ${x2},${y2} Z`}
                        fill={reward.color}
                        stroke="white"
                        strokeWidth="2"
                      />
                      <text
                        x={textX}
                        y={textY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize="11"
                        fontWeight="bold"
                        transform={`rotate(${textRotation}, ${textX}, ${textY})`}
                      >
                        {reward.label}
                      </text>
                    </g>
                  );
                })}
                {/* Center circle */}
                <circle cx="150" cy="150" r="28" fill="white" stroke="#d97706" strokeWidth="3" />
                <text x="150" y="155" textAnchor="middle" fill="#d97706" fontSize="10" fontWeight="bold">SPIN</text>
              </svg>
            </div>
          </div>

          {/* Spin Button */}
          <button
            onClick={handleSpin}
            disabled={spinning || !status || status.available <= 0}
            className={`w-full py-4 rounded-[16px] font-bold text-lg transition-all ${
              spinning || !status || status.available <= 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-lg hover:shadow-xl active:scale-95"
            }`}
          >
            {spinning ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Spinning...
              </span>
            ) : !status || status.available <= 0 ? (
              "No Spins Available"
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" /> Spin Now ({status.available} left)
              </span>
            )}
          </button>
        </div>

        {/* Result Modal */}
        {showResult && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowResult(null)}>
            <div className="bg-white rounded-[24px] p-8 text-center space-y-4 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: showResult.color + "20" }}>
                <Gift className="w-8 h-8" style={{ color: showResult.color }} />
              </div>
              <h2 className="text-xl font-bold text-[#4A3428]">You Won!</h2>
              <p className="text-lg font-bold" style={{ color: showResult.color, fontFamily: "var(--font-caveat)" }}>{showResult.label}</p>
              <p className="text-xs text-[#8B7E72]">
                {showResult.type === "points" && "Points added to your wallet"}
                {showResult.type === "coupon" && "Coupon added to your account"}
                {showResult.type === "freeItem" && "Show this to the staff"}
                {showResult.type === "none" && "Better luck next time!"}
              </p>
              <Button onClick={() => setShowResult(null)} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Milestones */}
        <div className="bg-white rounded-[20px] shadow-lg p-5 space-y-3">
          <h3 className="font-bold text-[#4A3428] flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" /> Spin Milestones
          </h3>
          <div className="space-y-2">
            {SPIN_MILESTONES.map((m) => {
              const claimed = (status?.milestones || []).some((c: any) => c.milestonePoints === m.points);
              const progress = Math.min(100, ((status?.lifetimeEarned || 0) / m.points) * 100);
              return (
                <div key={m.points} className={`flex items-center justify-between p-3 rounded-xl border ${claimed ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200/40"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${claimed ? "bg-green-100" : "bg-amber-100"}`}>
                      {claimed ? <span className="text-sm">✓</span> : <Trophy className="w-4 h-4 text-amber-600" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#4A3428]">{m.points} Points → {m.spins} Spin{m.spins > 1 ? "s" : ""}</p>
                      {!claimed && (
                        <div className="w-24 h-1.5 bg-amber-100 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                  {claimed && <span className="text-xs text-green-600 font-medium">Claimed</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-[20px] shadow-lg p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{status?.totalSpinsUsed || 0}</p>
            <p className="text-xs text-[#8B7E72] mt-1">Spins Used</p>
          </div>
          <div className="bg-white rounded-[20px] shadow-lg p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{status?.lifetimeEarned || 0}</p>
            <p className="text-xs text-[#8B7E72] mt-1">Lifetime Points</p>
          </div>
        </div>

        {/* History */}
        {status?.history && status.history.length > 0 && (
          <div className="bg-white rounded-[20px] shadow-lg p-5 space-y-3">
            <h3 className="font-bold text-[#4A3428] flex items-center gap-2">
              <History className="w-4 h-4 text-[#8B7E72]" /> Spin History
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {status.history.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: (h.rewardColor || h.rewardType === "points" ? "#C08A4D" : h.rewardType === "coupon" ? "#ec4899" : "#9ca3af") + "20" }}>
                      <Gift className="w-4 h-4" style={{ color: h.rewardColor || h.rewardType === "points" ? "#C08A4D" : h.rewardType === "coupon" ? "#ec4899" : "#9ca3af" }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#4A3428]">{h.rewardLabel}</p>
                      <p className="text-[10px] text-[#8B7E72]">{new Date(h.spunAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
