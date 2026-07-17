import { useEffect, useRef } from "react";
import { useSpring, useMotionValue, motion } from "framer-motion";

interface AnimatedPriceProps {
  value: number;
  prefix?: string;
  className?: string;
  decimals?: number;
}

export default function AnimatedPrice({ value, prefix = "", className = "", decimals = 2 }: AnimatedPriceProps) {
  const motionValue = useMotionValue(value);
  const springValue = useSpring(motionValue, {
    stiffness: 200,
    damping: 30,
    mass: 1,
  });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = `${prefix}${latest.toFixed(decimals)}`;
      }
    });
    return unsubscribe;
  }, [springValue, prefix, decimals]);

  return (
    <span className={className}>
      <motion.span ref={ref}>
        {prefix}{value.toFixed(decimals)}
      </motion.span>
    </span>
  );
}
