import { motion } from "framer-motion";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return {
      emoji: "☀️",
      title: "Good Morning",
      subtitle: "Start your day with something freshly brewed.",
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      emoji: "🌤",
      title: "Good Afternoon",
      subtitle: "Take a break and enjoy your favorite meal.",
    };
  }
  if (hour >= 17 && hour < 21) {
    return {
      emoji: "🌇",
      title: "Good Evening",
      subtitle: "Relax and enjoy a delicious dining experience.",
    };
  }
  return {
    emoji: "🌙",
    title: "Good Night",
    subtitle: "Late-night cravings deserve great food too.",
  };
}

export default function GreetingBanner() {
  const greeting = getGreeting();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="px-4 pt-5 pb-2"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{greeting.emoji}</span>
        <div>
          <h2 className="text-xl font-bold text-[#4A3428] tracking-tight">{greeting.title}</h2>
          <p className="text-base text-[#8B7E72] mt-0.5 leading-relaxed font-caveat">{greeting.subtitle}</p>
        </div>
      </div>
    </motion.div>
  );
}
