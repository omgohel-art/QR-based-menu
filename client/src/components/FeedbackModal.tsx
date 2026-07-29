import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Star } from "lucide-react";

interface FeedbackModalProps {
  open: boolean;
  sessionId: number;
  tableLabel: string;
  onClose: () => void;
  onDone: () => void;
}

export default function FeedbackModal({ open, sessionId, tableLabel, onClose, onDone }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("feedback").insert({
        sessionId,
        tableLabel,
        rating,
        comment: comment.trim() || null,
      });
      if (error) throw error;
    },
    onMutate: () => {
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-5">
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-900">How was your experience?</h3>
          <p className="text-sm text-slate-500 mt-1">Your feedback helps us improve</p>
        </div>

        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
              <button
                  key={star}
                  aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
              <Star
                className={`w-8 h-8 ${
                  star <= (hoveredRating || rating)
                    ? "fill-amber-400 text-amber-400"
                    : "text-slate-200"
                }`}
              />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your thoughts (optional)..."
          className="w-full h-20 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
          maxLength={500}
        />

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Skip
          </Button>
          <Button
            onClick={() => rating > 0 && submitMutation.mutate()}
            disabled={rating === 0 || submitMutation.isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitMutation.isPending ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
