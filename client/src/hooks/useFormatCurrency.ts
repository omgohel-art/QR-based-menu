import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/utils";

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "\u20B9",
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
};

const TIME_FORMAT_MAP: Record<string, Intl.DateTimeFormatOptions> = {
  "12h": { hour: "2-digit", minute: "2-digit", hour12: true },
  "24h": { hour: "2-digit", minute: "2-digit", hour12: false },
};

const DATE_FORMAT_MAP: Record<string, Intl.DateTimeFormatOptions> = {
  "DD/MM/YYYY": { day: "2-digit", month: "2-digit", year: "numeric" },
  "MM/DD/YYYY": { day: "2-digit", month: "2-digit", year: "numeric" },
  "YYYY-MM-DD": { day: "2-digit", month: "2-digit", year: "numeric" },
};

export function useFormatCurrency() {
  const { data: settings } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("currency, time_format, date_format").single();
      return data;
    },
  });

  const currency = settings?.currency || "INR";
  const timeFormat = settings?.time_format || "12h";
  const dateFormat = settings?.date_format || "DD/MM/YYYY";

  const fmtPrice = (price: number | string) => formatPrice(price, currency);

  const fmtTime = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString("en-IN", TIME_FORMAT_MAP[timeFormat] || TIME_FORMAT_MAP["12h"]);
  };

  const fmtDate = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-IN", DATE_FORMAT_MAP[dateFormat] || DATE_FORMAT_MAP["DD/MM/YYYY"]);
  };

  const fmtDateTime = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-IN", {
      ...DATE_FORMAT_MAP[dateFormat],
      ...TIME_FORMAT_MAP[timeFormat],
    });
  };

  return { currency, fmtPrice, fmtTime, fmtDate, fmtDateTime, symbol: CURRENCY_SYMBOLS[currency] || "\u20B9" };
}
