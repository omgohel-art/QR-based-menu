import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

type FlyingItemProps = {
  sourceRect: DOMRect;
  targetRect: DOMRect;
  imageUrl?: string | null;
  name: string;
  onComplete: () => void;
};

export default function FlyingItem({ sourceRect, targetRect, imageUrl, name, onComplete }: FlyingItemProps) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      onComplete();
    }, 600);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const startX = sourceRect.left + sourceRect.width / 2 - 24;
  const startY = sourceRect.top + sourceRect.height / 2 - 24;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top;

  return createPortal(
    !done && (
      <motion.div
        initial={{ x: startX, y: startY, scale: 1, opacity: 1 }}
        animate={{ x: endX, y: endY, scale: 0.3, opacity: 0.6 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
        className="fixed top-0 left-0 z-[9998] pointer-events-none"
      >
        {imageUrl ? (
          <div className="w-12 h-12 rounded-xl overflow-hidden shadow-xl border-2 border-white">
            <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl bg-[#C08A4D] shadow-xl border-2 border-white flex items-center justify-center">
            <span className="text-white text-lg font-bold">+1</span>
          </div>
        )}
      </motion.div>
    ),
    document.body
  );
}
