import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Camera, Loader2, Shield, Clock, Calendar,
  Mail, Lock, ChevronRight, Trash2, User, Monitor,
  Settings, Volume2, VolumeX, Play,
} from "lucide-react";
import { toast } from "sonner";
import { useSoundSettings } from "@/contexts/SoundSettingsContext";
import { notificationSound } from "@/services/notificationSound";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "(GMT+05:30) Asia/Kolkata" },
  { value: "Asia/Dubai", label: "(GMT+04:00) Asia/Dubai" },
  { value: "Asia/Singapore", label: "(GMT+08:00) Asia/Singapore" },
  { value: "Europe/London", label: "(GMT+00:00) Europe/London" },
  { value: "America/New_York", label: "(GMT-05:00) America/New_York" },
  { value: "America/Los_Angeles", label: "(GMT-08:00) America/Los_Angeles" },
];

interface MyProfileProps {
  onNavigate?: (page: string) => void;
}

export default function MyProfile({ onNavigate }: MyProfileProps) {
  const { user, profile, updateProfile } = useAuth();
  const { enabled: soundEnabled, volume: soundVolume, setEnabled: setSoundEnabled, setVolume: setSoundVolume } = useSoundSettings();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [timezone, setTimezone] = useState(profile?.timezone || "Asia/Kolkata");
  const [preview, setPreview] = useState<string | null>(profile?.profile_image_url || null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(profile?.name || "");
    setPhone(profile?.phone || "");
    setTimezone(profile?.timezone || "Asia/Kolkata");
    setPreview(profile?.profile_image_url || null);
  }, [profile]);

  const businessName = profile?.name || "MAMA";
  const initial = businessName.charAt(0).toUpperCase();
  const userEmail = user?.email || "";
  const userRole = profile?.role || "admin";
  const roleLabel = userRole === "admin" ? "Owner" : userRole.charAt(0).toUpperCase() + userRole.slice(1);
  const createdDate = user?.created_at ? new Date(user.created_at) : new Date();
  const lastLoginDate = profile?.last_login_at ? new Date(profile.last_login_at) : null;

  const formatDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const formatTime = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

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
      toast.success("Photo uploaded");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleRemovePhoto = () => {
    setPreview(null);
    toast.success("Photo removed");
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateProfile({
      name: name.trim() || null,
      phone: phone.trim() || null,
      profile_image_url: preview,
      timezone,
    });
    if (error) toast.error(error);
    else toast.success("Profile updated successfully");
    setSaving(false);
  };

  const handleDeleteAccount = async () => {
    setDeleteOpen(false);
    const { error } = await supabase.rpc("delete_user_account");
    if (error) {
      toast.error("Account deletion is not yet available through the dashboard. Please contact support.");
    } else {
      toast.success("Account deletion request submitted");
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => onNavigate?.("back")}
          className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profile Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage your personal information and account details.</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Avatar Card */}
        <Card className="p-8 bg-white dark:bg-slate-900">
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
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">JPG, PNG, WEBP — Max 5 MB</p>
          </div>
        </Card>

        {/* Personal Information */}
        <Card className="p-6 bg-white dark:bg-slate-900">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
              <Input value={userEmail} disabled className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700" />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Email cannot be changed here. Contact support.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            {/* Role Card */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{roleLabel}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Full access to all features</p>
                </div>
              </div>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Timezone</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all appearance-none cursor-pointer"
                >
                  {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 rotate-90 pointer-events-none" />
              </div>
            </div>
          </div>
        </Card>

        {/* Account Overview */}
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">About Your Account</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Account Created</span>
              </div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDate(createdDate)}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{formatTime(createdDate)}</p>
            </Card>

            <Card className="p-5 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Last Login</span>
              </div>
              {lastLoginDate ? (
                <>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDate(lastLoginDate)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{formatTime(lastLoginDate)}</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">Active now</span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">Today</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">Active now</span>
                  </div>
                </>
              )}
            </Card>

            <Card className="p-5 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">Account Status</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">Verified</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Your account is secure</p>
            </Card>
          </div>
        </div>

        {/* Additional Information — admin only */}
        {userRole === "admin" && (
        <Card className="p-6 bg-white dark:bg-slate-900">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Additional Information</h2>
          <div className="space-y-1">
            {/* Business Preferences */}
            <button
              onClick={() => onNavigate?.("business-preferences")}
              className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Business Preferences</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Currency, restaurant status, invoice settings</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
              </div>
            </button>

            <div className="h-px bg-slate-100 dark:bg-slate-800 mx-4" />

            {/* Notification Email */}
            <button
              onClick={() => onNavigate?.("notification-email")}
              className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Notification Email</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">All important notifications will be sent here</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">{userEmail}</span>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
              </div>
            </button>

            <div className="h-px bg-slate-100 dark:bg-slate-800 mx-4" />

            {/* Password */}
            <button
              onClick={() => onNavigate?.("password")}
              className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Password</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Last changed: Never</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">Change Password</span>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
              </div>
            </button>

            {/* Active Sessions */}
            <button
              onClick={() => onNavigate?.("sessions")}
              className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Active Sessions</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Manage your active sessions on different devices</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">Manage</span>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
              </div>
            </button>
          </div>
        </Card>
        )}

        {/* Notification Sound */}
        <Card className="p-6 bg-white dark:bg-slate-900">
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

        <div className="flex items-center justify-between">
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400">
                <Trash2 className="w-4 h-4" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. All your data will be permanently deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-600 text-white px-6 gap-2"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              <>Save Changes</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
