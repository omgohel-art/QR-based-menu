import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogTrigger, DialogContent,
  DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Users, Lock, Eye, EyeOff, Loader2, Shield, ShieldCheck,
  Mail, UserPlus, UserMinus, UserCheck, Search,
} from "lucide-react";
import { StaffListSkeleton } from "@/components/Skeletons";
import { toast } from "sonner";

interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string;
  lastSignIn: string | null;
  createdAt: string;
  department: string | null;
  shift: string | null;
  attendanceClockIn: string | null;
  attendanceClockOut: string | null;
  attendanceDate: string | null;
  lastLoginAt: string | null;
  employmentStatus: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score += 25;
  if (/[a-z]/.test(pw)) score += 15;
  if (/[A-Z]/.test(pw)) score += 20;
  if (/[0-9]/.test(pw)) score += 20;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 20;
  if (score < 30) return { score, label: "Weak", color: "text-red-500", bg: "bg-red-500" };
  if (score < 50) return { score, label: "Fair", color: "text-orange-500", bg: "bg-orange-500" };
  if (score < 70) return { score, label: "Good", color: "text-yellow-500", bg: "bg-yellow-500" };
  if (score < 90) return { score, label: "Strong", color: "text-lime-500", bg: "bg-lime-500" };
  return { score: 100, label: "Very Strong", color: "text-green-600", bg: "bg-green-500" };
}

interface Props {
  onNavigate?: (page: string) => void;
}

export default function StaffManagement({ onNavigate }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Add Staff state
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", password: "", name: "", phone: "", role: "", shift: "" });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addShowPw, setAddShowPw] = useState(false);
  const addStrength = getStrength(addForm.password);

  // Deactivate state
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<StaffMember | null>(null);

  const strength = getStrength(newPassword);

  const fetchStaff = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setLoading(false); return; }
    try {
      const res = await fetch("/api/auth/staff", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) setStaff(data.staff || []);
      else toast.error(data.error || "Failed to load staff");
    } catch {
      toast.error("Failed to load staff");
    }
    setLoading(false);
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleSetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (strength.score < 50) { toast.error("Password is too weak"); return; }

    setSubmitting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setSubmitting(false); return; }

    try {
      const res = await fetch("/api/auth/set-staff-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: resetTarget.id, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Password updated for ${resetTarget.email}`);
        setResetTarget(null);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast.error(data.error || "Failed to update password");
      }
    } catch {
      toast.error("Failed to update password");
    }
    setSubmitting(false);
  };

  const handleAddStaff = async () => {
    if (!addForm.email || !addForm.password) { toast.error("Email and password required"); return; }
    if (addStrength.score < 50) { toast.error("Password is too weak"); return; }

    setAddSubmitting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setAddSubmitting(false); return; }

    try {
      const res = await fetch("/api/auth/create-staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: addForm.email,
          password: addForm.password,
          name: addForm.name || undefined,
          phone: addForm.phone || undefined,
          role: addForm.role || undefined,
          shift: addForm.shift || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Staff account created for ${addForm.email}`);
        setShowAddStaff(false);
        setAddForm({ email: "", password: "", name: "", phone: "", role: "", shift: "" });
        fetchStaff();
      } else {
        toast.error(data.error || "Failed to create staff");
      }
    } catch {
      toast.error("Failed to create staff");
    }
    setAddSubmitting(false);
  };

  const handleDeactivate = async (member: StaffMember) => {
    setDeactivating(member.id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setDeactivating(null); return; }

    const isInactive = member.employmentStatus === "inactive";
    const endpoint = isInactive ? "reactivate" : "deactivate";

    try {
      const res = await fetch(`/api/auth/staff/${member.id}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(isInactive ? `${member.email} reactivated` : `${member.email} deactivated`);
        fetchStaff();
      } else {
        toast.error(data.error || "Failed");
      }
    } catch {
      toast.error("Failed");
    }
    setDeactivating(null);
  };

  const q = searchQuery.toLowerCase();
  const filtered = q
    ? staff.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    : staff;
  const activeStaff = filtered.filter((s) => s.employmentStatus !== "inactive");
  const inactiveStaff = filtered.filter((s) => s.employmentStatus === "inactive");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card className="p-6 md:p-8 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Staff Accounts
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">{staff.length} total</span>
            <Button
              onClick={() => setShowAddStaff(true)}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white gap-2"
              size="sm"
            >
              <UserPlus className="w-4 h-4" />
              Add Staff
            </Button>
          </div>
        </div>

        {staff.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9"
            />
          </div>
        )}

        {loading ? (
          <StaffListSkeleton />
        ) : staff.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No staff accounts found.</p>
        ) : (
          <>
            {/* Active Staff */}
            {activeStaff.length > 0 && (
              <div className="space-y-3">
                {activeStaff.map((s) => {
                  return (
                    <div
                      key={s.id}
                      className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
                    >
                      {/* Top: Avatar, Name/Email, Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            {s.role === "admin" ? (
                              <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <Shield className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {s.name || "Staff Member"}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <Mail className="w-3 h-3" />
                              <span>{s.email}</span>
                            </div>
                            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold uppercase text-slate-600 dark:text-slate-300">
                              {s.role}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-slate-100 dark:border-slate-800 my-4" />

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setResetTarget(s); setNewPassword(""); setConfirmPassword(""); }}
                          className="gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Set Password
                        </Button>
                        {s.role !== "admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDeactivate(s)}
                            disabled={deactivating === s.id}
                            className="gap-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-800"
                          >
                            {deactivating === s.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="w-3.5 h-3.5" />
                            )}
                            Deactivate
                          </Button>
                        )}
                        <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
                          Last login: {formatDate(s.lastSignIn)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Inactive Staff */}
            {inactiveStaff.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">
                  Inactive ({inactiveStaff.length})
                </h3>
                <div className="space-y-2">
                  {inactiveStaff.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 opacity-60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 truncate">
                            {s.name || s.email}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{s.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDeactivate(s)}
                        disabled={deactivating === s.id}
                        className="text-green-600 dark:text-green-400 border-green-200 dark:border-green-800"
                      >
                        {deactivating === s.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <UserCheck className="w-3 h-3 mr-1" />
                        )}
                        Reactivate
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Set Password Dialog */}
      <Dialog open={resetTarget !== null} onOpenChange={(open) => { if (!open) { setResetTarget(null); setNewPassword(""); setConfirmPassword(""); } }}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              Set Password for {resetTarget?.email}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              This will immediately replace their current password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">New Password</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-400"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full ${strength.bg} transition-all`} style={{ width: `${strength.score}%` }} />
                  </div>
                  <p className={`text-xs font-medium ${strength.color}`}>{strength.label}</p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Confirm Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={submitting}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleSetPassword}
              disabled={submitting || !newPassword || !confirmPassword || newPassword !== confirmPassword || strength.score < 50}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : "Set Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Staff Dialog */}
      <Dialog open={showAddStaff} onOpenChange={(open) => { if (!open) setShowAddStaff(false); }}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add New Staff</DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Create a new staff account. They can log in immediately with the password you set.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Name <span className="text-xs text-red-500 dark:text-red-400 font-normal">(Required)</span></label>
                <Input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Phone</label>
                <Input
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email <span className="text-xs text-red-500 dark:text-red-400 font-normal">(Required)</span></label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                placeholder="staff@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Role <span className="text-xs text-red-500 dark:text-red-400 font-normal">(Required)</span></label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-white"
                >
                  <option value="" disabled>Choose a role</option>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Shift</label>
                <Input
                  value={addForm.shift}
                  onChange={(e) => setAddForm({ ...addForm, shift: e.target.value })}
                  placeholder="e.g. Morning (9AM-5PM)"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Password <span className="text-xs text-red-500 dark:text-red-400 font-normal">(Required)</span></label>
              <div className="relative">
                <Input
                  type={addShowPw ? "text" : "password"}
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="Min. 8 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setAddShowPw(!addShowPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-400"
                >
                  {addShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {addForm.password && (
                <div className="mt-3 space-y-2">
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full ${addStrength.bg} transition-all duration-300`} style={{ width: `${addStrength.score}%` }} />
                  </div>
                  <p className={`text-xs font-semibold ${addStrength.color}`}>{addStrength.label}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {[
                      { label: "At least 8 characters", check: addForm.password.length >= 8 },
                      { label: "One uppercase letter", check: /[A-Z]/.test(addForm.password) },
                      { label: "One lowercase letter", check: /[a-z]/.test(addForm.password) },
                      { label: "One number", check: /[0-9]/.test(addForm.password) },
                      { label: "One special character", check: /[^a-zA-Z0-9]/.test(addForm.password) },
                    ].map((r) => (
                      <span key={r.label} className={`text-xs flex items-center gap-1.5 transition-colors duration-300 ${r.check ? "text-green-600 dark:text-green-400" : "text-red-400 dark:text-red-500"}`}>
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px] shrink-0 transition-all duration-300 ${r.check ? "border-green-500 bg-green-500 text-white" : "border-red-300 dark:border-red-600"}`}>
                          {r.check && "✓"}
                        </span>
                        {r.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={addSubmitting}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAddStaff}
              disabled={addSubmitting || !addForm.name.trim() || !addForm.email || !addForm.role || !addForm.password || addStrength.score < 50}
              className="bg-slate-700 hover:bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
            >
              {addSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate/Reactivate Confirmation Dialog */}
      <Dialog open={confirmDeactivate !== null} onOpenChange={(open) => { if (!open) setConfirmDeactivate(null); }}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              {confirmDeactivate?.employmentStatus === "inactive" ? "Reactivate Staff Member" : "Deactivate Staff Member"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {confirmDeactivate?.employmentStatus === "inactive"
                ? `This will restore ${confirmDeactivate?.email}'s access to the system. They will be able to log in again.`
                : `This will revoke ${confirmDeactivate?.email}'s access to the system. They will not be able to log in until reactivated.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (confirmDeactivate) {
                  handleDeactivate(confirmDeactivate);
                  setConfirmDeactivate(null);
                }
              }}
              disabled={deactivating === confirmDeactivate?.id}
              className={confirmDeactivate?.employmentStatus === "inactive"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
              }
            >
              {deactivating === confirmDeactivate?.id ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                confirmDeactivate?.employmentStatus === "inactive" ? "Reactivate" : "Deactivate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
