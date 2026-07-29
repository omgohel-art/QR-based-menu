import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Monitor, Smartphone, Globe, MapPin, Clock, LogOut, Loader2, ArrowLeft, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { SessionCardSkeleton } from "@/components/Skeletons";

interface SessionInfo {
  id: string;
  user_agent: string;
  ip: string;
  created_at: string;
  is_current: boolean;
  browser: string;
  os: string;
  device: string;
  location: string;
}

interface ActiveSessionsProps {
  onNavigate?: (page: string) => void;
}

function parseUA(ua: string) {
  let browser = "Unknown";
  let os = "Unknown";
  let device = "Desktop";

  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Opera|OPR/i.test(ua)) browser = "Opera";

  if (/Windows|Win64/i.test(ua)) os = "Windows";
  else if (/Mac/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) { os = "Android"; device = "Mobile"; }
  else if (/iPhone|iPad/i.test(ua)) { os = "iOS"; device = "Mobile"; }

  if (/Mobile|Android|iPhone|iPad/i.test(ua)) device = "Mobile";

  return { browser, os, device };
}

export default function ActiveSessions({ onNavigate }: ActiveSessionsProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutOtherOpen, setLogoutOtherOpen] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentSessionId = session?.access_token ? await getSessionIdFromToken(session.access_token) : null;

      const res = await fetch("/api/auth/sessions", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to load sessions");
      const data = await res.json();

      const enriched: SessionInfo[] = (data.sessions || []).map((s: any) => {
        const ua = s.user_agent || "";
        const parsed = parseUA(ua);
        return {
          id: s.id,
          user_agent: ua,
          ip: s.ip || "Unknown",
          created_at: s.created_at,
          is_current: s.id === currentSessionId,
          ...parsed,
          location: s.location || "Unknown",
        };
      });
      setSessions(enriched);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load sessions");
    }
    setLoading(false);
  };

  const getSessionIdFromToken = async (token: string): Promise<string | null> => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload.session_id || null;
    } catch {
      return null;
    }
  };

  const handleLogoutOthers = async () => {
    setLoggingOut(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/auth/sessions/logout-others", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to logout other sessions");
      toast.success("Other sessions logged out successfully");
      setLogoutOtherOpen(false);
      loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to logout other sessions");
    }
    setLoggingOut(false);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const getDeviceIcon = (device: string) => {
    if (device === "Mobile") return <Smartphone className="w-5 h-5" />;
    return <Monitor className="w-5 h-5" />;
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 md:p-8">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto p-6 md:p-8 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3 mb-6">
        {onNavigate && (
          <button
            onClick={() => onNavigate("back")}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Active Sessions</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your active sessions across devices</p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <ShieldAlert className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No active sessions found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`rounded-xl border p-4 ${
                s.is_current
                  ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/50"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
              } transition-colors`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    s.is_current ? "bg-amber-100 dark:bg-amber-950" : "bg-slate-100 dark:bg-slate-800"
                  }`}>
                    {getDeviceIcon(s.device)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{s.browser} on {s.os}</p>
                      {s.is_current && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5 mt-1">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Globe className="w-3 h-3" />
                        <span>IP: {s.ip}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3 h-3" />
                        <span>Location: {s.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>Logged in: {formatDate(s.created_at)}</span>
                      </div>
                    </div>
                    {s.device !== "Desktop" && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <Smartphone className="w-3 h-3" />
                        <span>Device: {s.device}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {sessions.length > 1 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <AlertDialog open={logoutOtherOpen} onOpenChange={setLogoutOtherOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 w-full">
                    <LogOut className="w-4 h-4" />
                    Log Out From Other Devices
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Log out other devices?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will sign out all other active sessions except your current one.
                      You may need to log in again on those devices.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLogoutOthers}
                      disabled={loggingOut}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {loggingOut ? "Logging out..." : "Log Out Others"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
