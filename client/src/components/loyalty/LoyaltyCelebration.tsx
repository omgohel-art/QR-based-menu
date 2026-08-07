import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Gift, X, PartyPopper, Sparkles } from "lucide-react";

interface LoyaltyCelebrationProps {
  earned: number;
  totalPoints: number;
  milestoneReached: boolean;
  newCouponsCount: number;
  onClose: () => void;
}

export default function LoyaltyCelebration({ earned, totalPoints, milestoneReached, newCouponsCount, onClose }: LoyaltyCelebrationProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <Card
        className="w-full max-w-sm p-8 bg-white dark:bg-slate-900 shadow-2xl border-0 text-center relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Confetti dots */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                backgroundColor: ["#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#8B5CF6"][i % 5],
                animationDelay: `${Math.random() * 2}s`,
                opacity: 0.6,
              }}
            />
          ))}
        </div>

        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>

        <div className="relative z-10">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-4 animate-bounce">
            <PartyPopper className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Congratulations! 🎉
          </h2>

          <p className="text-slate-500 dark:text-slate-400 mb-4">
            You earned <span className="font-bold text-amber-600 text-lg">+{earned}</span> Loyalty Points!
          </p>

          <div className="flex items-center justify-center gap-2 mb-2">
            <Star className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Total: <span className="font-bold text-amber-600">{totalPoints}</span> points
            </span>
          </div>

          {milestoneReached && (
            <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/50 dark:border-amber-800/30">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Gift className="w-5 h-5 text-amber-600" />
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                🎁 New 5% OFF Coupon{newCouponsCount > 1 ? "s" : ""} Unlocked!
              </p>
              <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                Check your Rewards page to use {newCouponsCount > 1 ? "them" : "it"}
              </p>
            </div>
          )}

          <Button onClick={onClose} className="w-full mt-6 bg-amber-600 hover:bg-amber-700 text-white">
            Awesome!
          </Button>
        </div>
      </Card>
    </div>
  );
}
