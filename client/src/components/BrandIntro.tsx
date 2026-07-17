import { motion } from "framer-motion";
import { Star } from "lucide-react";

interface BrandIntroProps {
  tagline?: string | null;
  description?: string | null;
  sinceYear?: number | null;
  averageRating?: number | null;
}

export default function BrandIntro({ tagline, description, sinceYear, averageRating }: BrandIntroProps) {
  const hasContent = tagline || description || sinceYear || averageRating;
  if (!hasContent) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.15 }}
      className="px-4 pt-3 pb-4"
    >
      <div className="bg-white/60 backdrop-blur-sm rounded-[16px] border border-[#E8E0D4]/40 p-5 space-y-2.5">
        {tagline && (
          <p className="text-xl font-bold text-[#C08A4D] font-caveat leading-snug tracking-tight">
            &ldquo;{tagline}&rdquo;
          </p>
        )}
        {description && (
          <p className="text-sm text-[#4A3428]/80 leading-relaxed">
            {description}
          </p>
        )}
        {(sinceYear || averageRating) && (
          <div className="flex items-center gap-4 pt-1.5">
            {sinceYear && (
              <span className="text-xs font-semibold text-[#8B7E72] tracking-wide uppercase">
                Est. {sinceYear}
              </span>
            )}
            {averageRating && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#C08A4D]">
                <Star className="w-3.5 h-3.5 fill-[#C08A4D] text-[#C08A4D]" />
                {Number(averageRating).toFixed(1)} Average Rating
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
