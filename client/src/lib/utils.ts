import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "\u20B9",
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
};

export function formatPrice(price: number | string, currency?: string) {
  const n = (typeof price === "string" ? parseFloat(price) : price).toFixed(2);
  const sym = CURRENCY_SYMBOLS[currency || "INR"] || "\u20B9";
  return `${sym}${n}`;
}
