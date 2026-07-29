import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft, Camera, Loader2, Trash2, Calendar,
  Key, Bell, Monitor, Globe, Save, X, Clock, LogIn, LogOut, Volume2, Play,
  Palmtree, Send,
} from "lucide-react";
import { toast } from "sonner";
import { ProfileSkeleton } from "@/components/Skeletons";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import { notificationSound } from "@/services/notificationSound";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

interface StaffProfileProps {
  onNavigate?: (page: string) => void;
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Google Chrome";
  if (ua.includes("Firefox")) return "Mozilla Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  return "Unknown Browser";
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown OS";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} at ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function StaffProfile({ onNavigate }: StaffProfileProps) {
  const { user, profile, updateProfile, logout } = useAuth();
  const { enabled: soundEnabled, volume: soundVolume, setEnabled: setSoundEnabled, setVolume: setSoundVolume } = useSoundSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [notifOrder, setNotifOrder] = useState(false);
  const [notifSystem, setNotifSystem] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [attendance, setAttendance] = useState<{ clockIn: string | null; clockOut: string | null }>({ clockIn: null, clockOut: null });
  const [leaveType, setLeaveType] = useState<"holiday" | "half-day">("holiday");
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const queryClient = useQueryClient();
  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setPhone(profile.phone || "");
      setPreview(profile.profile_image_url || null);
      setNotifOrder(profile.notif_order ?? false);
      setNotifSystem(profile.notif_system ?? false);
    }
  }, [profile]);

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const profileDate = profile.attendance_date ? new Date(profile.attendance_date).toISOString().slice(0, 10) : null;
    if (profileDate === today) {
      setAttendance({ clockIn: profile.attendance_clock_in, clockOut: profile.attendance_clock_out });
    } else {
      setAttendance({ clockIn: null, clockOut: null });
    }
  }, [profile]);

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ["leaveRequests"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const res = await fetch("/api/leave-requests", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const submitLeaveMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ leaveType, date: leaveDate, reason: leaveReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Leave request submitted");
      setLeaveDate("");
      setLeaveReason("");
      queryClient.invalidateQueries({ queryKey: ["leaveRequests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelLeaveMutation = useMutation({
    mutationFn: async (id: number) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to cancel");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Leave request cancelled");
      queryClient.invalidateQueries({ queryKey: ["leaveRequests"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleClockIn = async () => {
    setClockLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/auth/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "clock-in" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const p = data.profile;
      setAttendance({ clockIn: p?.attendance_clock_in || null, clockOut: null });
      toast.success("Clocked in successfully");
    } catch {
      toast.error("Failed to clock in");
    } finally {
      setClockLoading(false);
    }
  };

  const handleClockOut = async () => {
    setClockLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/auth/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "clock-out" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const p = data.profile;
      setAttendance({ clockIn: p?.attendance_clock_in || null, clockOut: p?.attendance_clock_out || null });
      toast.success("Clocked out successfully");
    } catch {
      toast.error("Failed to clock out");
    } finally {
      setClockLoading(false);
    }
  };

  const computeWorkingHours = (): string => {
    if (!attendance.clockIn) return "--";
    const start = new Date(attendance.clockIn);
    const end = attendance.clockOut ? new Date(attendance.clockOut) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  };

  const isClockedIn = !!attendance.clockIn && !attendance.clockOut;
  const isClockedOut = !!attendance.clockOut;

  const uploadFile = useCallback(async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) { toast.error("Invalid format. Use JPG, PNG, or WEBP."); return; }
    if (file.size > MAX_SIZE) { toast.error("File too large. Max 5 MB."); return; }
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch("/api/images/upload", {
        method: "POST",
        headers,
        body: file,
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Upload failed"); }
      const data = await res.json();
      setPreview(data.url);
      await updateProfile({ profile_image_url: data.url });
      toast.success("Photo uploaded and saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [updateProfile]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleRemovePhoto = async () => {
    setPreview(null);
    const { error } = await updateProfile({ profile_image_url: null });
    if (error) toast.error("Failed to remove photo");
    else toast.success("Photo removed");
  };

  const handleNotifToggle = async (field: "notif_order" | "notif_system", value: boolean) => {
    if (field === "notif_order") setNotifOrder(value);
    if (field === "notif_system") setNotifSystem(value);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/auth/my-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        toast.success("Notification preference saved");
      } else {
        toast.error("Failed to save notification preference");
      }
    } catch {
      toast.error("Failed to save notification preference");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/auth/my-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: name.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Profile saved successfully");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save profile");
      }
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto pb-24">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => onNavigate?.("back")}
            className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Staff Profile</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Profile not found</p>
          </div>
        </div>
        <Card className="p-8 bg-white dark:bg-slate-900 text-center">
          <p className="text-slate-500 dark:text-slate-400 mb-4">Your profile hasn't been set up yet. Please contact the admin.</p>
          <Button onClick={() => onNavigate?.("back")} className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">Go Back</Button>
        </Card>
      </div>
    );
  }

  const initial = (profile.name || "S").charAt(0).toUpperCase();
  const roleLabel = profile.role === "admin" ? "Admin" : profile.role.charAt(0).toUpperCase() + profile.role.slice(1);

  return (
    <div className="max-w-4xl mx-auto pb-32">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => onNavigate?.("back")}
          className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Staff Profile</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">View and manage your staff profile details.</p>
        </div>
      </div>

      <div className="space-y-6">
        <Card className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="relative flex flex-col items-center">
            <button
              onClick={handleRemovePhoto}
              className="absolute top-0 right-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Photo
            </button>

            <div className="relative group">
              <Avatar className="w-28 h-28 ring-4 ring-amber-100 dark:ring-amber-900">
                {preview ? (
                  <AvatarImage src={preview} alt="Profile" className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-amber-500 to-amber-600 text-white text-4xl font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center shadow-lg transition-all disabled:opacity-50 ring-2 ring-white dark:ring-slate-900"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
            </div>
            <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleFile} className="hidden" />

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-4">
              {profile.name || "Staff Member"}
            </h2>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  profile.role === "admin"
                    ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                    : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                }`}
              >
                {roleLabel}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Personal Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
              <Input value={user?.email || ""} disabled className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Email cannot be changed</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Role</label>
              <div className="relative">
                <Input value={roleLabel} disabled className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700" />
                <span
                  className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    profile.role === "admin"
                      ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400"
                      : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                  }`}
                >
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Attendance</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <LogIn className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Clock In</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {attendance.clockIn ? new Date(attendance.clockIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-950 flex items-center justify-center">
                <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Clock Out</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {attendance.clockOut ? new Date(attendance.clockOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Working Hours</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{computeWorkingHours()}</p>
              </div>
            </div>
            <div className="pt-2 flex items-center gap-3">
              {!isClockedIn ? (
                <Button
                  onClick={handleClockIn}
                  disabled={clockLoading}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  {clockLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  Clock In
                </Button>
              ) : (
                <Button
                  onClick={handleClockOut}
                  disabled={clockLoading}
                  className="bg-red-600 hover:bg-red-700 text-white gap-2"
                >
                  {clockLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  Clock Out
                </Button>
              )}
              {isClockedIn && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Active
                </div>
              )}
              {isClockedOut && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Done
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Palmtree className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Apply for Leave
          </h2>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setLeaveType("holiday")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  leaveType === "holiday"
                    ? "bg-emerald-600 text-white shadow-md"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                Holiday (Full Day)
              </button>
              <button
                onClick={() => setLeaveType("half-day")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  leaveType === "half-day"
                    ? "bg-amber-500 text-white shadow-md"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                Half Day
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Date</label>
              <Input
                type="date"
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
                min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Reason (optional)</label>
              <Input
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="e.g. Personal work, family event..."
              />
            </div>
            <Button
              onClick={() => submitLeaveMutation.mutate()}
              disabled={!leaveDate || submitLeaveMutation.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {submitLeaveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Submit Request
            </Button>
          </div>

          {leaveRequests.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Your Requests</p>
              <div className="space-y-2">
                {leaveRequests.map((lr: any) => (
                  <div key={lr.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        lr.leave_type === "holiday"
                          ? "bg-emerald-100 dark:bg-emerald-950"
                          : "bg-amber-100 dark:bg-amber-950"
                      }`}>
                        <Palmtree className={`w-4 h-4 ${
                          lr.leave_type === "holiday"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {lr.leave_type === "holiday" ? "Holiday" : "Half Day"} — {lr.date}
                        </p>
                        {lr.reason && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">{lr.reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        lr.status === "pending"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                          : lr.status === "approved"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      }`}>
                        {lr.status.charAt(0).toUpperCase() + lr.status.slice(1)}
                      </span>
                      {lr.status === "pending" && (
                        <button
                          onClick={() => cancelLeaveMutation.mutate(lr.id)}
                          className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 transition-colors"
                          title="Cancel request"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Account Security</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <Key className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Password</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Last changed: Never</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input value="************" disabled className="w-40 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 font-mono" />
              <Button
                variant="outline"
                onClick={() => onNavigate?.("password")}
                className="gap-2 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950"
              >
                <Key className="w-4 h-4" />
                Change Password
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Active Session</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Current Device</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">This Device</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center">
                <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Browser</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{detectBrowser()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Operating System</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{detectOS()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Login Time</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{formatDateTime(user?.created_at || null)}</p>
              </div>
            </div>
            <div className="pt-2">
              <Button
                variant="destructive"
                onClick={handleLogout}
                className="gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                <X className="w-4 h-4" />
                Log Out
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Notifications</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Order Notifications</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Get notified for new orders and updates</p>
                </div>
              </div>
              <button
                onClick={() => handleNotifToggle("notif_order", !notifOrder)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  notifOrder ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    notifOrder ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">System Notifications</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">System updates and announcements</p>
                </div>
              </div>
              <button
                onClick={() => handleNotifToggle("notif_system", !notifSystem)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                  notifSystem ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    notifSystem ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Notification Sound</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center">
                  <Volume2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Enable Notification Sounds</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Play a sound when new orders arrive</p>
                </div>
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/40 ${
                  soundEnabled ? "bg-purple-500" : "bg-slate-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    soundEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {soundEnabled && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Volume</label>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{soundVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(parseInt(e.target.value, 10))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-200 dark:bg-slate-700 accent-purple-500"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => notificationSound.play(soundVolume / 100)}
                  className="gap-1.5 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950"
                >
                  <Play className="w-3.5 h-3.5" />
                  Test Sound
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-600 text-white px-8 gap-2 h-11 rounded-xl font-semibold shadow-lg shadow-amber-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-amber-500/30"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
