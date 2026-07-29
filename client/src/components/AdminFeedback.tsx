import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Star, StarHalf, MessageSquare, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

export default function AdminFeedback() {
  const [expandedComment, setExpandedComment] = useState<number | null>(null);
  const [filterRating, setFilterRating] = useState<number | null>(null);

  // Aggregate stats (small query, always fast)
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["adminFeedbackStats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/feedback/stats");
      if (!res.ok) throw new Error("Failed to fetch feedback stats");
      return res.json() as Promise<{ average: number; total: number; distribution: { rating: number; count: number }[] }>;
    },
  });

  // Paginated feedback list
  const {
    data: feedbackPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: feedbackLoading,
  } = useInfiniteQuery({
    queryKey: ["adminFeedback"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam);
      const res = await fetch(`/api/admin/feedback?${params}`);
      if (!res.ok) throw new Error("Failed to fetch feedback");
      return res.json() as Promise<{ data: any[]; nextCursor: string | null; hasMore: boolean }>;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  const allFeedback = feedbackPages?.pages.flatMap(p => p.data) ?? [];
  const average = stats?.average ?? 0;
  const distribution = stats?.distribution ?? [];
  const total = stats?.total ?? 0;

  const filtered = filterRating
    ? allFeedback.filter(f => f.rating === filterRating)
    : allFeedback;

  const isLoading = statsLoading || feedbackLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
              <div className="h-7 w-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 md:p-5 bg-white">
          <p className="text-sm text-slate-500 mb-1">Average Rating</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl md:text-3xl font-bold text-slate-900">{average.toFixed(1)}</span>
            <StarRating rating={Math.round(average)} size={14} />
          </div>
        </Card>
        <Card className="p-4 md:p-5 bg-white">
          <p className="text-sm text-slate-500 mb-1">Total Feedback</p>
          <span className="text-2xl md:text-3xl font-bold text-slate-900">{total}</span>
        </Card>
        <Card className="p-4 md:p-5 bg-white">
          <p className="text-sm text-slate-500 mb-1">5-Star Ratings</p>
          <span className="text-2xl md:text-3xl font-bold text-emerald-600">
            {distribution.find(d => d.rating === 5)?.count || 0}
          </span>
        </Card>
        <Card className="p-4 md:p-5 bg-white">
          <p className="text-sm text-slate-500 mb-1">1-Star Ratings</p>
          <span className="text-2xl md:text-3xl font-bold text-red-500">
            {distribution.find(d => d.rating === 1)?.count || 0}
          </span>
        </Card>
      </div>

      {/* Distribution */}
      {total > 0 && (
        <Card className="p-4 md:p-5 bg-white">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Rating Distribution</h3>
          <div className="space-y-2">
            {distribution.map(({ rating, count }) => (
              <div key={rating} className="flex items-center gap-3">
                <button
                  onClick={() => setFilterRating(filterRating === rating ? null : rating)}
                  className={`text-sm font-medium min-w-[12px] text-right hover:text-slate-900 transition-colors ${
                    filterRating === rating ? "text-slate-900 underline" : "text-slate-500"
                  }`}
                >
                  {rating}
                </button>
                <Star size={14} className="text-amber-400 fill-amber-400 shrink-0" />
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 min-w-[28px] text-right">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Feedback list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No feedback yet</p>
          <p className="text-xs mt-1">Customer feedback will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <Card key={f.id} className="p-4 bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <StarRating rating={f.rating} size={14} />
                    <span className="text-xs font-medium text-slate-400">
                      {new Date(f.createdAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{f.tableLabel}</span>
                    <span>Session #{f.sessionId}</span>
                  </div>
                </div>
              </div>
              {f.comment && (
                <div className="mt-2">
                  <button
                    onClick={() => setExpandedComment(expandedComment === f.id ? null : f.id)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    {expandedComment === f.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {expandedComment === f.id ? "Hide comment" : "View comment"}
                  </button>
                  {expandedComment === f.id && (
                    <p className="mt-1.5 text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{f.comment}</p>
                  )}
                </div>
              )}
            </Card>
          ))}

          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading more...
                </>
              ) : (
                "Load more feedback"
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
