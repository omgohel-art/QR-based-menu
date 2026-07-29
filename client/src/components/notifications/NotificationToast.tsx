import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useNotifications, type Notification } from "@/contexts/NotificationContext";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import { notificationSound } from "@/services/notificationSound";
import { X, ShoppingCart, Info } from "lucide-react";

const TOAST_DURATION = 8000;
const TOAST_LINGER = 300;

interface ActiveToast {
  notification: Notification;
  progress: number;
  paused: boolean;
  exiting: boolean;
}

export function NotificationToastQueue() {
  const { notifications } = useNotifications();
  const { enabled: soundEnabled, volume: soundVolume } = useSoundSettings();
  const [location] = useLocation();
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const progressIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Don't show toasts or play sounds on customer-facing pages
  const isCustomerPage = location.startsWith("/table/");

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => t.notification.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.notification.id !== id));
      timersRef.current.delete(id);
      progressIntervalsRef.current.delete(id);
    }, TOAST_LINGER);
  }, []);

  const startTimer = useCallback((id: string) => {
    const interval = setInterval(() => {
      setToasts((prev) => prev.map((t) => {
        if (t.notification.id !== id || t.paused) return t;
        const newProgress = t.progress + (100 / (TOAST_DURATION / 50));
        if (newProgress >= 100) {
          setTimeout(() => dismissToast(id), 0);
          return { ...t, progress: 100 };
        }
        return { ...t, progress: newProgress };
      }));
    }, 50);
    progressIntervalsRef.current.set(id, interval);
  }, [dismissToast]);

  useEffect(() => {
    if (notifications.length === 0 || isCustomerPage) return;
    const latest = notifications[0];
    if (processedIdsRef.current.has(latest.id)) return;
    processedIdsRef.current.add(latest.id);

    if (soundEnabled) {
      notificationSound.play(soundVolume / 100);
    }

    setToasts((prev) => {
      if (prev.some((t) => t.notification.id === latest.id)) return prev;
      const next = [...prev, { notification: latest, progress: 0, paused: false, exiting: false }];
      return next.slice(-3);
    });

    startTimer(latest.id);
  }, [notifications, soundEnabled, soundVolume, startTimer]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      progressIntervalsRef.current.forEach((i) => clearInterval(i));
    };
  }, []);

  if (toasts.length === 0 || isCustomerPage) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => {
        const isOrder = toast.notification.type === "order";
        const Icon = isOrder ? ShoppingCart : Info;
        return (
          <div
            key={toast.notification.id}
            onMouseEnter={() => setToasts((prev) => prev.map((t) =>
              t.notification.id === toast.notification.id ? { ...t, paused: true } : t
            ))}
            onMouseLeave={() => {
              setToasts((prev) => prev.map((t) =>
                t.notification.id === toast.notification.id ? { ...t, paused: false } : t
              ));
            }}
            className={`pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${
              toast.exiting ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                isOrder ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-blue-100 dark:bg-blue-900/30"
              }`}>
                <Icon className={`w-4 h-4 ${isOrder ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {toast.notification.title}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  {toast.notification.body}
                </p>
              </div>
              <button
                onClick={() => dismissToast(toast.notification.id)}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-1 bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full transition-all duration-75 ${
                  isOrder ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${toast.progress}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default NotificationToastQueue;
