import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { t, type StaffLocale, type StaffMessageKey, statusLabel } from "@/lib/staffI18n";

interface StaffLanguageContextValue {
  locale: StaffLocale;
  setLocale: (locale: StaffLocale) => void;
  toggleLocale: () => void;
  t: (key: StaffMessageKey) => string;
  statusLabel: (status: string) => string;
}

const StaffLanguageContext = createContext<StaffLanguageContextValue | null>(null);

const STORAGE_KEY = "mama_staff_locale";

export function StaffLanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<StaffLocale>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "hi" ? "hi" : "en";
    } catch {
      return "en";
    }
  });

  const setLocale = useCallback((next: StaffLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "hi" : "en");
  }, [locale, setLocale]);

  const value: StaffLanguageContextValue = {
    locale,
    setLocale,
    toggleLocale,
    t: (key) => t(locale, key),
    statusLabel: (status) => statusLabel(locale, status),
  };

  return (
    <StaffLanguageContext.Provider value={value}>{children}</StaffLanguageContext.Provider>
  );
}

export function useStaffLanguage() {
  const ctx = useContext(StaffLanguageContext);
  if (!ctx) {
    return {
      locale: "en" as StaffLocale,
      setLocale: () => {},
      toggleLocale: () => {},
      t: (key: StaffMessageKey) => t("en", key),
      statusLabel: (status: string) => statusLabel("en", status),
    };
  }
  return ctx;
}
