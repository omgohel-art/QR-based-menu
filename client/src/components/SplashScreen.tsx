import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const THEME = {
  bg: "#F8F4EC",
  primary: "#4A3428",
  secondary: "#8B7E72",
  accent: "#C08A4D",
  card: "#FFFCF8",
  border: "#E8E0D4",
};

interface SplashScreenProps {
  restaurantName: string;
  logoUrl?: string | null;
  onComplete: () => void;
}

export default function SplashScreen({ restaurantName, logoUrl, onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 800);
    const t3 = setTimeout(() => setPhase(3), 1200);
    const t4 = setTimeout(() => setPhase(4), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  useEffect(() => {
    if (phase === 4) {
      const t = setTimeout(onComplete, 400);
      return () => clearTimeout(t);
    }
  }, [phase, onComplete]);

  return (
    <AnimatePresence>
      {phase < 4 && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ backgroundColor: THEME.bg }}
        >
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            {/* Logo */}
            <AnimatePresence>
              {phase >= 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden shadow-lg"
                  style={{ backgroundColor: THEME.card, border: `1px solid ${THEME.border}` }}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={restaurantName} className="w-full h-full object-cover" />
                  ) : (
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={THEME.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V20H6Z" />
                      <line x1="6" y1="17" x2="18" y2="17" />
                    </svg>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Restaurant Name */}
            <AnimatePresence>
              {phase >= 1 && (
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="text-3xl font-bold tracking-tight"
                  style={{ color: THEME.primary, fontFamily: "var(--font-caveat)" }}
                >
                  {restaurantName}
                </motion.h1>
              )}
            </AnimatePresence>

            {/* Welcome text */}
            <AnimatePresence>
              {phase >= 2 && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="text-xl font-semibold"
                  style={{ color: THEME.primary, fontFamily: "var(--font-caveat)" }}
                >
                  Welcome to {restaurantName}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Subtitle */}
            <AnimatePresence>
              {phase >= 3 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm"
                  style={{ color: THEME.secondary }}
                >
                  Preparing your menu...
                </motion.p>
              )}
            </AnimatePresence>

            {/* Loader dots */}
            <AnimatePresence>
              {phase >= 3 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-1.5 mt-2"
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: THEME.accent }}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
