import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffLanguage } from "@/contexts/StaffLanguageContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import AdminAvatar from "@/components/admin/AdminAvatar";
import OnlineIndicator from "@/components/OnlineIndicator";
import StaffMailboxModal from "@/components/admin/StaffMailboxModal";
import ChangePassword from "@/components/admin/ChangePassword";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, LogOut, Eye, EyeOff, Shield, Mail, FileText, Sparkles, Download, Languages, BookOpen, ShoppingBag, Users, Key, Table } from "lucide-react";
import { toast } from "sonner";
import Footer from "@/components/marketing/Footer";
import OnboardingWizard, { isOnboardingDismissed } from "@/components/admin/OnboardingWizard";
import TrialBanner from "@/components/admin/TrialBanner";
import QuickPinSwitcher from "@/components/admin/QuickPinSwitcher";

// Lazy-loaded heavy components (only loaded when their tab/page is active)
const BusinessSettings = lazy(() => import("@/components/BusinessSettings"));
const ThermalReceipt = lazy(() => import("@/components/ThermalReceipt"));
const AnalyticsDashboard = lazy(() => import("@/components/AnalyticsDashboard"));
const SettledBills = lazy(() => import("@/components/admin/SettledBills"));
const OrderQueue = lazy(() => import("@/components/admin/OrderQueue"));
const TablesPanel = lazy(() => import("@/components/admin/TablesPanel"));
const MenuItemsPanel = lazy(() => import("@/components/admin/MenuItemsPanel"));
const MyProfile = lazy(() => import("@/components/admin/MyProfile"));
const EmailSettings = lazy(() => import("@/components/admin/EmailSettings"));
const ThemeSettings = lazy(() => import("@/components/admin/ThemeSettings"));
const NotificationEmail = lazy(() => import("@/components/admin/NotificationEmail"));
const TwoFactorAuth = lazy(() => import("@/components/admin/TwoFactorAuth"));
const ActiveSessions = lazy(() => import("@/components/admin/ActiveSessions"));
const AdminLoyaltyPanel = lazy(() => import("@/components/admin/AdminLoyaltyPanel"));
const AdminSpinPanel = lazy(() => import("@/components/admin/AdminSpinPanel"));
const BusinessPreferences = lazy(() => import("@/components/admin/BusinessPreferences"));
const TakeOrder = lazy(() => import("@/components/admin/TakeOrder"));
const AggregatorOrderModal = lazy(() => import("@/components/admin/AggregatorOrderModal"));
const AggregatorStatsCard = lazy(() => import("@/components/admin/AggregatorStatsCard"));
const StaffManagement = lazy(() => import("@/components/admin/StaffManagement"));
const StaffActivity = lazy(() => import("@/components/admin/StaffActivity"));
const StaffProfile = lazy(() => import("@/components/admin/StaffProfile"));
const InventoryPanel = lazy(() => import("@/components/admin/InventoryPanel"));
const RecipeManager = lazy(() => import("@/components/admin/RecipeManager"));
const SettledBillsHistory = lazy(() => import("@/components/admin/SettledBillsHistory"));
const EODReportModal = lazy(() => import("@/components/admin/EODReportModal"));
const Help = lazy(() => import("@/components/admin/Help"));
const ReservationsPanel = lazy(() => import("@/components/admin/ReservationsPanel"));
const WhatsAppSettingsPanel = lazy(() => import("@/components/admin/WhatsAppSettingsPanel"));
const GstReportsPanel = lazy(() => import("@/components/admin/GstReportsPanel"));
const DailyClosingInventory = lazy(() => import("@/components/admin/DailyClosingInventory"));

const TabFallback = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
          <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
          <div className="space-y-2 mb-4">
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="h-9 w-full bg-slate-200 dark:bg-slate-700 rounded-lg" />
        </div>
      ))}
    </div>
  </div>
);

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { profile, logout, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === "admin";
const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && ["orders", "orderqueue", "tables", "menu", "analytics", "inventory", "settings"].includes(tab)) return tab;
    return isAdmin ? "orders" : "orderqueue";
  });
  const isKitchenMode = !isAdmin;
  const [settingsSubTab, setSettingsSubTab] = useState<"general" | "business" | "whatsapp" | "gst">("general");
  const [avatarPage, setAvatarPage] = useState<string | null>(null);
  const [showEODModal, setShowEODModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => isOnboardingDismissed());
  const [showAggregatorModal, setShowAggregatorModal] = useState(false);
  const [showQuickPinSwitch, setShowQuickPinSwitch] = useState(false);
  const [showDailyClosing, setShowDailyClosing] = useState(false);
  const { locale, toggleLocale, t: st } = useStaffLanguage();

  useEffect(() => {
    if (!isAdmin || isOnboardingDismissed()) return;
    const timer = setTimeout(() => setShowOnboarding(true), 600);
    return () => clearTimeout(timer);
  }, [isAdmin]);

  const downloadExport = useCallback(async (path: string, filename: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Please log in again");
        return;
      }
      const res = await fetch(path, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  }, []);

  const handleAvatarNavigation = useCallback((page: string) => {
    if (page === "settings") { setActiveTab("settings"); setSettingsSubTab("business"); setAvatarPage(null); }
    else if (page === "back") {
      setAvatarPage((prev) => {
        const next = prev === "profile" || prev === null ? null : "profile";
        return next;
      });
    }
    else {
      setAvatarPage(page);
    }
  }, []);

  // Redirect staff away from admin-only tabs
  useEffect(() => {
    if (!profile) return;
    const adminTabs = ["orders", "tables", "menu", "analytics", "settings", "inventory"];
    if (!isAdmin && adminTabs.includes(activeTab)) {
      setActiveTab("orderqueue");
    }
  }, [profile]);

  // Settings States (seed from localStorage for instant persistence, then override from DB)
  const loadStoredSettings = () => {
    try {
      const raw = localStorage.getItem("cafeSettings");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };
  const storedSettings = loadStoredSettings();
  const [inactivityWindowMinutes, setInactivityWindowMinutes] = useState<string>(storedSettings.inactivityWindowMinutes ?? "75");
  const [saveInvoiceCustomerInfo, setSaveInvoiceCustomerInfo] = useState<boolean>(storedSettings.saveInvoiceCustomerInfo ?? true);

  // Thermal Print State
  const [printData, setPrintData] = useState<{ sessionId: number; table: any } | null>(null);

  // Business Settings Query (includes inactivityWindowMinutes)
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['businessSettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('businessSettings').select('*').single();
      if (error && error.code === 'PGRST116') {
        const { data: newSettings, error: insertError } = await supabase
          .from('businessSettings')
          .insert({ restaurantName: 'My Cafe', inactivityWindowMinutes: 75 })
          .select()
          .single();
        if (insertError) throw insertError;
        return newSettings;
      }
      if (error) throw error;
      return data;
    }
  });

  // Sync settings inputs when query loads
  useEffect(() => {
    if (settings) {
      setInactivityWindowMinutes(settings.inactivityWindowMinutes?.toString() || "75");
      setSaveInvoiceCustomerInfo(settings.saveInvoiceCustomerInfo ?? true);
    }
  }, [settings]);

  // Mutation to save settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (updated: { inactivityWindowMinutes: number; saveInvoiceCustomerInfo: boolean }) => {
      if (!settings?.id) {
        throw new Error("No settings record found to update");
      }
      const { error } = await supabase
        .from('businessSettings')
        .update({
          inactivityWindowMinutes: updated.inactivityWindowMinutes,
          saveInvoiceCustomerInfo: updated.saveInvoiceCustomerInfo,
        })
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: (_, updated) => {
      queryClient.invalidateQueries({ queryKey: ['businessSettings'] });
      localStorage.setItem(
        "cafeSettings",
        JSON.stringify({
          inactivityWindowMinutes: updated.inactivityWindowMinutes.toString(),
          saveInvoiceCustomerInfo: updated.saveInvoiceCustomerInfo,
        })
      );
      toast.success("Changes saved successfully!");
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 animate-pulse">
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-7 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
          <div className="flex gap-2 mb-6 md:mb-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-10 flex-1 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 md:p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                  <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-10 w-full max-w-sm bg-slate-200 dark:bg-slate-700 rounded-xl mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-4 md:p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-2">
                    <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                    <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
                  </div>
                  <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>
                <div className="space-y-2 mb-4">
                  <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                </div>
                <div className="h-9 w-full bg-slate-200 dark:bg-slate-700 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <style>{`
.delivery-check {
  cursor: pointer;
  position: relative;
  margin: auto;
  width: 18px;
  height: 18px;
  -webkit-tap-highlight-color: transparent;
  transform: translate3d(0, 0, 0);
}
.delivery-check:before {
  content: "";
  position: absolute;
  top: -15px;
  left: -15px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(34, 50, 84, 0.03);
  opacity: 0;
  transition: opacity 0.2s ease;
}
.delivery-check svg {
  position: relative;
  z-index: 1;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke: #c8ccd4;
  stroke-width: 1.5;
  transform: translate3d(0, 0, 0);
  transition: all 0.2s ease;
}
.delivery-check svg path {
  stroke-dasharray: 60;
  stroke-dashoffset: 0;
}
.delivery-check svg polyline {
  stroke-dasharray: 22;
  stroke-dashoffset: 66;
}
.delivery-check:hover:before {
  opacity: 1;
}
.delivery-check:hover svg {
  stroke: #22c55e;
}
.delivery-cbx:checked + .delivery-check svg {
  stroke: #22c55e;
}
.delivery-cbx:checked + .delivery-check svg path {
  stroke-dashoffset: 60;
  transition: all 0.3s linear;
}
.delivery-cbx:checked + .delivery-check svg polyline {
  stroke-dashoffset: 42;
  transition: all 0.2s linear;
  transition-delay: 0.15s;
}
      `}</style>
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 dark:text-white">{isKitchenMode ? st("kitchenPanel") : st("adminPanel")}</h1>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 mt-1">{isKitchenMode ? st("viewIncomingOrders") : st("manageCafeOperations")}</p>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={toggleLocale}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                title={st("language")}
              >
                <Languages className="w-4 h-4" />
                {st("switchTo")}
              </button>
              {isAdmin && !onboardingDismissed && (
                <button
                  type="button"
                  onClick={() => setShowOnboarding(true)}
                  className="hidden sm:flex px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold items-center gap-1.5 hover:bg-amber-100"
                >
                  <Sparkles className="w-4 h-4" />
                  Setup
                </button>
              )}
{isAdmin && (
                  <button
                    onClick={() => setShowEODModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <FileText className="w-4 h-4" /> EOD Z-Report
                  </button>
                )}
{isAdmin && !onboardingDismissed && (
                  <button
                    type="button"
                    onClick={() => setShowQuickPinSwitch(true)}
                    className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs font-semibold items-center gap-1.5 hover:bg-amber-100"
                    title="Quick Staff Switch (4-digit PIN)"
                  >
                    <Key className="w-4 h-4" />
                    PIN
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setShowDailyClosing(!showDailyClosing)}
                    className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold items-center gap-1.5"
                    title="Daily Closing Inventory"
                  >
                    <Table className="w-4 h-4" />
                    Inventory
                  </button>
                )}

                <StaffMailboxModal />
                <OnlineIndicator />
                <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-colors duration-300 ${
                  isAdmin
                    ? "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
                    : "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200"
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {isAdmin ? "Admin" : "Staff"}
                </span>
                <AdminAvatar onNavigate={handleAvatarNavigation} />
<QuickPinSwitcher
                  isOpen={showQuickPinSwitch}
                  onClose={() => setShowQuickPinSwitch(false)}
                  onSwitch={(userId) => {
                    queryClient.invalidateQueries({ queryKey: ["user_profiles"] });
                    setActiveTab(isAdmin ? "orders" : "orderqueue");
                  }}
                />
                <DailyClosingInventory
                  open={showDailyClosing}
                  onClose={() => setShowDailyClosing(false)}
                />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8 w-full">
        {avatarPage ? (
          <>
            <button
              onClick={() => setAvatarPage(null)}
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 mb-4 flex items-center gap-1"
            >
              {st("backToDashboard")}
            </button>
            <Suspense fallback={<TabFallback />}>
              {avatarPage === "profile" && (isAdmin ? <MyProfile onNavigate={handleAvatarNavigation} /> : <StaffProfile onNavigate={handleAvatarNavigation} />)}
              {avatarPage === "email" && <EmailSettings />}
              {avatarPage === "password" && <ChangePassword />}
              {avatarPage === "theme" && <ThemeSettings />}
              {avatarPage === "notification-email" && <NotificationEmail onNavigate={handleAvatarNavigation} />}
              {avatarPage === "two-factor" && <TwoFactorAuth onNavigate={handleAvatarNavigation} />}
              {avatarPage === "sessions" && <ActiveSessions onNavigate={handleAvatarNavigation} />}
              {avatarPage === "business-preferences" && <BusinessPreferences />}
              {avatarPage === "take-order" && <TakeOrder />}
              {avatarPage === "staff-management" && <StaffManagement onNavigate={handleAvatarNavigation} />}
              {avatarPage === "staff-activity" && <StaffActivity onNavigate={handleAvatarNavigation} />}
              {avatarPage === "staff-profile" && <StaffProfile onNavigate={handleAvatarNavigation} />}
              {avatarPage === "help" && <Help />}
            </Suspense>
          </>
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="sticky top-[96px] z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-sm">
            <TabsList className="flex overflow-x-auto scrollbar-hide w-full max-w-7xl mx-auto !h-auto !p-0 !bg-transparent !justify-start">
{!isKitchenMode && isAdmin && <TabsTrigger value="orders" className="!flex-none shrink-0 !rounded-none !border-x-0 !border-t-0 !border-b-2 !border-transparent data-[state=active]:!border-b-blue-500 data-[state=active]:!text-blue-600 data-[state=active]:!bg-transparent data-[state=active]:!shadow-none px-4 py-3 text-xs md:text-sm">{st("orders")}</TabsTrigger>}
               {!isKitchenMode && isAdmin && <TabsTrigger value="tables" className="!flex-none shrink-0 !rounded-none !border-x-0 !border-t-0 !border-b-2 !border-transparent data-[state=active]:!border-b-blue-500 data-[state=active]:!text-blue-600 data-[state=active]:!bg-transparent data-[state=active]:!shadow-none px-4 py-3 text-xs md:text-sm">{st("tables")}</TabsTrigger>}
               {!isKitchenMode && isAdmin && <TabsTrigger value="menu" className="!flex-none shrink-0 !rounded-none !border-x-0 !border-t-0 !border-b-2 !border-transparent data-[state=active]:!border-b-blue-500 data-[state=active]:!text-blue-600 data-[state=active]:!bg-transparent data-[state=active]:!shadow-none px-4 py-3 text-xs md:text-sm">{st("menu")}</TabsTrigger>}
               {!isKitchenMode && isAdmin && <TabsTrigger value="analytics" className="!flex-none shrink-0 !rounded-none !border-x-0 !border-t-0 !border-b-2 !border-transparent data-[state=active]:!border-b-blue-500 data-[state=active]:!text-blue-600 data-[state=active]:!bg-transparent data-[state=active]:!shadow-none px-4 py-3 text-xs md:text-sm">{st("analytics")}</TabsTrigger>}
               {!isKitchenMode && isAdmin && <TabsTrigger value="inventory" className="!flex-none shrink-0 !rounded-none !border-x-0 !border-t-0 !border-b-2 !border-transparent data-[state=active]:!border-b-blue-500 data-[state=active]:!text-blue-600 data-[state=active]:!bg-transparent data-[state=active]:!shadow-none px-4 py-3 text-xs md:text-sm">{st("inventory")}</TabsTrigger>}
               {!isKitchenMode && isAdmin && <TabsTrigger value="reservations" className="!flex-none shrink-0 !rounded-none !border-x-0 !border-t-0 !border-b-2 !border-transparent data-[state=active]:!border-b-blue-500 data-[state=active]:!text-blue-600 data-[state=active]:!bg-transparent data-[state=active]:!shadow-none px-4 py-3 text-xs md:text-sm">{st("reservations")}</TabsTrigger>}
            </TabsList>
          </div>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Orders</h2>
              <Button
                onClick={() => setShowAggregatorModal(true)}
                variant="default"
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <ShoppingBag className="w-4 h-4 mr-1" />
                Log Aggregator Order
             </Button>
           </div>
            <Suspense fallback={<TabFallback />}>
              <AggregatorStatsCard />
           </Suspense>
            <Suspense fallback={<TabFallback />}>
              <SettledBills onPrint={(data) => setPrintData(data)} />
           </Suspense>
         </TabsContent>

          <TabsContent value="orderqueue" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <OrderQueue />
            </Suspense>
          </TabsContent>

          <TabsContent value="tables" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <TablesPanel />
            </Suspense>
          </TabsContent>
          <TabsContent value="menu" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <MenuItemsPanel />
            </Suspense>
          </TabsContent>
          <TabsContent value="analytics" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <AnalyticsDashboard />
            </Suspense>
          </TabsContent>
           <TabsContent value="inventory" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <InventoryPanel />
           </Suspense>
            <Suspense fallback={<TabFallback />}>
              <RecipeManager />
           </Suspense>
         </TabsContent>
          <TabsContent value="reservations" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <ReservationsPanel />
            </Suspense>
          </TabsContent>
          <TabsContent value="rewards" className="space-y-6">
            <Suspense fallback={<TabFallback />}>
              <AdminLoyaltyPanel />
            </Suspense>
            <Suspense fallback={<TabFallback />}>
              <AdminSpinPanel />
            </Suspense>
          </TabsContent>
          <TabsContent value="settings" className="space-y-6">
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSettingsSubTab("general")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  settingsSubTab === "general"
                    ? "bg-slate-900 text-white dark:bg-slate-700"
                    : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                General Settings
             </button>
              <button
                onClick={() => setSettingsSubTab("business")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  settingsSubTab === "business"
                    ? "bg-slate-900 text-white dark:bg-slate-700"
                    : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                Business Info
             </button>
              <button
                onClick={() => setSettingsSubTab("whatsapp")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  settingsSubTab === "whatsapp"
                    ? "bg-slate-900 text-white dark:bg-slate-700"
                    : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                WhatsApp Daily Summary
             </button>
              <button
                onClick={() => setSettingsSubTab("gst")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  settingsSubTab === "gst"
                    ? "bg-slate-900 text-white dark:bg-slate-700"
                    : "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                GST Reports (GSTR-1)
             </button>
           </div>

            {settingsSubTab === "general" && (
            <>
            <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-4 md:mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5 md:w-6 md:h-6" />
                Cafe Settings
              </h2>
              {isLoadingSettings ? (
                <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="space-y-2">
                        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                        <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                      Inactivity Window (minutes)
                    </label>
                    <Input
                      type="number"
                      placeholder="75"
                      value={inactivityWindowMinutes}
                      onChange={(e) => setInactivityWindowMinutes(e.target.value)}
                      onBlur={() => {
                        const windowMin = parseInt(inactivityWindowMinutes);
                        if (!isNaN(windowMin) && settings?.id) {
                          supabase.from('businessSettings').update({ inactivityWindowMinutes: windowMin }).eq('id', settings.id).then(() => {
                            queryClient.invalidateQueries({ queryKey: ['businessSettings'] });
                            localStorage.setItem("cafeSettings", JSON.stringify({ ...loadStoredSettings(), inactivityWindowMinutes: windowMin.toString() }));
                            toast.success("Settings saved");
                          });
                        }
                      }}
                    />
                    <p className="text-xs text-slate-400">Service charge & GST are configured in Business Info → Billing Settings.</p>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <div>
                      <label className="text-sm font-medium text-slate-900 dark:text-white">Save customer info on settle/send</label>
                      <p className="text-xs text-slate-400 mt-0.5">When settling a bill or sending an invoice, save customer name & phone number to the settled bill history</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newVal = !saveInvoiceCustomerInfo;
                        setSaveInvoiceCustomerInfo(newVal);
                        if (settings?.id) {
                          supabase.from('businessSettings').update({ saveInvoiceCustomerInfo: newVal }).eq('id', settings.id).then(() => {
                            queryClient.invalidateQueries({ queryKey: ['businessSettings'] });
                            localStorage.setItem("cafeSettings", JSON.stringify({ ...loadStoredSettings(), saveInvoiceCustomerInfo: newVal }));
                            toast.success(newVal ? "Customer info saving enabled" : "Customer info saving disabled");
                          });
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${saveInvoiceCustomerInfo ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${saveInvoiceCustomerInfo ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                </div>
              )}
            </Card>

            <Suspense fallback={<TabFallback />}>
              <SettledBillsHistory />
            </Suspense>

            <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <Download className="w-5 h-5" />
                {st("exportData")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Download your menu and settled bills as CSV (you own this data).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => downloadExport("/api/admin/export/menu.csv", "menu-export.csv")}
                >
                  <Download className="w-4 h-4" />
                  Menu CSV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => downloadExport("/api/admin/export/orders.csv?days=30", "orders-30d.csv")}
                >
                  <Download className="w-4 h-4" />
                  Orders (30 days)
                </Button>
              </div>
            </Card>
            </>
            )}

            {settingsSubTab === "business" && (
              <Suspense fallback={<TabFallback />}>
                <BusinessSettings />
             </Suspense>
            )}

            {settingsSubTab === "whatsapp" && (
              <Suspense fallback={<TabFallback />}>
                <WhatsAppSettingsPanel />
             </Suspense>
            )}

            {settingsSubTab === "gst" && (
              <Suspense fallback={<TabFallback />}>
                <GstReportsPanel />
             </Suspense>
            )}
         </TabsContent>
       </Tabs>
      )}
     </div>

      {printData && (
        <Suspense fallback={null}>
          <ThermalReceipt
            data={settings}
            table={printData.table}
            printerIp={settings?.printerIp}
            printerPort={settings?.printerPort}
            onClose={() => setPrintData(null)}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <EODReportModal open={showEODModal} onClose={() => setShowEODModal(false)} />
      </Suspense>

      <TrialBanner />

      <Suspense fallback={null}>
        <AggregatorOrderModal open={showAggregatorModal} onClose={() => setShowAggregatorModal(false)} />
     </Suspense>

      {isAdmin && (
        <OnboardingWizard
          open={showOnboarding}
          onClose={() => {
            setShowOnboarding(false);
            setOnboardingDismissed(isOnboardingDismissed());
          }}
          onNavigateTab={(tab) => {
            setActiveTab(tab);
            setAvatarPage(null);
          }}
        />
      )}

      <Footer variant="admin" />
    </div>
  );
}
