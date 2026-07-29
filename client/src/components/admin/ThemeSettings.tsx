import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Palette, Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/contexts/ThemeContext";

const themes: { value: Theme; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "light", label: "Light", icon: <Sun className="w-5 h-5" />, desc: "Always light mode" },
  { value: "dark", label: "Dark", icon: <Moon className="w-5 h-5" />, desc: "Always dark mode" },
  { value: "system", label: "System", icon: <Monitor className="w-5 h-5" />, desc: "Follows your system preference" },
];

export default function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-lg mx-auto">
      <Card className="p-6 md:p-8 bg-white dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
          <Palette className="w-5 h-5 text-amber-600" />
          Theme Settings
        </h2>

        <div className="space-y-3">
          {themes.map((t) => (
            <button
              key={t.value}
              onClick={() => setTheme(t.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                theme === t.value
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                  : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                theme === t.value ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}>
                {t.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.desc}</p>
              </div>
              {theme === t.value && (
                <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white dark:bg-slate-900" />
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
