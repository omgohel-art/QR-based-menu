import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent,
  DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Shield, Loader2, ShoppingBag, Table, Palette, Box,
  Users as Users2, BarChart3, Users, Calendar, FileText,
  Settings, Image, Mail, User, Mail as MailIcon, Shield as ShieldIcon,
  Activity, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StaffMember {
  id: string;
  email: string;
  name: string;
  role: string;
  employmentStatus: string;
}

const SECTIONS = [
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "tables", label: "Tables", icon: Table },
  { key: "menu", label: "Menu", icon: Palette },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "inventory", label: "Inventory", icon: Box },
  { key: "customers", label: "Customers", icon: Users },
  { key: "staffManagement", label: "Staff Management", icon: Users2 },
  { key: "bookings", label: "Bookings", icon: Calendar },
  { key: "reports", label: "Reports / EOD Z-Report", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "externalOrders", label: "External Orders", icon: Image },
  { key: "payments", label: "Payments / Billing", icon: Mail },
];

const DEFAULT_PERMISSIONS = {
  orders: false, tables: false, menu: false, analytics: false,
  inventory: false, customers: false, staffManagement: false,
  bookings: false, reports: false, settings: false,
  externalOrders: false, payments: false,
};

const PRESETS = [
  {
    name: "Kitchen Staff",
    description: "Orders + Tables access",
    permissions: {
      orders: true, tables: true, menu: false, analytics: false,
      inventory: false, customers: false, staffManagement: false,
      bookings: false, reports: false, settings: false,
      externalOrders: false, payments: false,
    },
  },
  {
    name: "Billing Staff",
    description: "Orders, Tables, Billing, Customers",
    permissions: {
      orders: true, tables: true, menu: false, analytics: false,
      inventory: false, customers: true, staffManagement: false,
      bookings: false, reports: false, settings: false,
      externalOrders: false, payments: true,
    },
  },
  {
    name: "Manager",
    description: "Most sections except Staff and Settings",
    permissions: {
      orders: true, tables: true, menu: true, analytics: true,
      inventory: true, customers: true, staffManagement: false,
      bookings: true, reports: true, settings: false,
      externalOrders: true, payments: true,
    },
  },
  {
    name: "Custom",
    description: "Set permissions manually",
    permissions: DEFAULT_PERMISSIONS,
  },
];

interface StaffAccessPermissionsProps {
  open: boolean;
  onClose: () => void;
  staff: StaffMember | null;
  onPermissionsUpdated?: () => void;
}

export default function StaffAccessPermissions({ open, onClose, staff, onPermissionsUpdated }: StaffAccessPermissionsProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { isAdmin } = useAuth();

  const initPermissions = useCallback(() => {
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setLoading(false);
  }, []);

  const fetchPermissions = useCallback(async () => {
    if (!staff?.id) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        initPermissions();
        return;
      }
      const res = await fetch(`/api/auth/staff-permissions/${staff.id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok && data.permissions) {
        const perms = data.permissions;
        setPermissions({
          orders: perms.orders ?? false,
          tables: perms.tables ?? false,
          menu: perms.menu ?? false,
          analytics: perms.analytics ?? false,
          inventory: perms.inventory ?? false,
          customers: perms.customers ?? false,
          staffManagement: perms.staffManagement ?? false,
          bookings: perms.bookings ?? false,
          reports: perms.reports ?? false,
          settings: perms.settings ?? false,
          externalOrders: perms.externalOrders ?? false,
          payments: perms.payments ?? false,
        });
      } else {
        initPermissions();
      }
    } catch (err) {
      console.error("Error fetching staff permissions:", err);
      initPermissions();
    }
  }, [staff?.id, initPermissions]);

  useEffect(() => {
    if (open && staff?.id) {
      fetchPermissions();
    }
  }, [open, staff?.id, fetchPermissions]);

  const savePermissions = async () => {
    if (!staff?.id) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("No session");

      const res = await fetch(`/api/auth/staff-permissions/${staff.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(permissions),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save permissions");

      toast.success(`Permissions saved for ${staff.name || staff.email || "Staff Member"}`);
      onClose();
      onPermissionsUpdated?.();
    } catch (err: unknown) {
      console.error("Error saving staff permissions:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  if (!staff || !isAdmin) {
    return null;
  }

  const statusColor = staff.employmentStatus === "inactive"
    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  const statusLabel = staff.employmentStatus === "inactive" ? "Inactive" : "Active";

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900">
        <DialogHeader className="pb-2">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                {staff.name || "Staff Member"}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                {staff.email}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold uppercase text-slate-600 dark:text-slate-300">
                  {staff.role?.toUpperCase() || "STAFF"}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${statusColor}`}>
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
          <DialogDescription className="text-slate-500 dark:text-slate-400 mt-4">
            Configure which sections this staff member can access.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="p-4 space-x-2 border-t border-slate-200 dark:border-slate-700">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={savePermissions}
            disabled={saving || loading}
            className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
              </>
            ) : (
              "Save Permissions"
            )}
          </Button>
        </DialogFooter>

        {/* Presets */}
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Quick Presets
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setPermissions({ ...preset.permissions })}
                className="text-left p-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {preset.name}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Permissions Toggle Grid */}
        <div className="space-y-3 p-4 max-h-[50vh] overflow-y-auto">
          {SECTIONS.map((section) => {
            const isOn = permissions[section.key] ?? true;
            return (
              <div
                key={section.key}
                className="flex items-center justify-between p-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
              >
                <div className="flex items-center gap-3">
                  <section.icon className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {section.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    onClick={() => {
                      setPermissions((prev) => ({
                        ...prev,
                        [section.key]: !isOn,
                      }));
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isOn ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        isOn ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}