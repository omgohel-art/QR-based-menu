import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Settings, Clock, Users, TrendingUp, RefreshCw, Bell, Pencil, QrCode, Copy, Check, Receipt } from "lucide-react";
import QRCode from 'qrcode';
import { toast } from "sonner";
import { nanoid } from "nanoid";

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("orders");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTableLabel, setNewTableLabel] = useState("");
  const [newItemData, setNewItemData] = useState({
    categoryId: 0,
    name: "",
    description: "",
    price: 0,
  });

  // Orders State
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetailsKey, setSessionDetailsKey] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [lastOrderTime, setLastOrderTime] = useState<number>(0);

  // Edit States
  const [editingTable, setEditingTable] = useState<{ id: number; label: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<{ id: number; name: string; description: string; price: number; categoryId: number } | null>(null);

  // QR / Seed States
  const seedingRef = useRef(false);
  const [qrTable, setQrTable] = useState<{ tableCode: string; label: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

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
  const [taxPercentage, setTaxPercentage] = useState<string>(storedSettings.taxPercentage ?? "0");
  const [serviceChargePercentage, setServiceChargePercentage] = useState<string>(storedSettings.serviceChargePercentage ?? "0");
  const [inactivityWindowMinutes, setInactivityWindowMinutes] = useState<string>(storedSettings.inactivityWindowMinutes ?? "75");

  // Queries
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').order('displayOrder');
      return data || [];
    }
  });

  const { data: menuItems } = useQuery({
    queryKey: ['menuItems'],
    queryFn: async () => {
      const { data } = await supabase.from('menuItems').select('*');
      return data || [];
    }
  });

  const { data: tablesData, isLoading: isTablesLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      const { data } = await supabase.from('tables').select('*').order('label');
      return data || [];
    }
  });

  // Cafe Settings Query
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['cafeSettings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cafeSettings').select('*').limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        return data[0];
      } else {
        const { data: newSettings, error: insertError } = await supabase
          .from('cafeSettings')
          .insert({
            taxPercentage: 0,
            serviceChargePercentage: 0,
            inactivityWindowMinutes: 75
          })
          .select()
          .single();
        if (insertError) throw insertError;
        return newSettings;
      }
    }
  });

  // Sync settings inputs when query loads
  useEffect(() => {
    if (settings) {
      setTaxPercentage(settings.taxPercentage?.toString() || "0");
      setServiceChargePercentage(settings.serviceChargePercentage?.toString() || "0");
      setInactivityWindowMinutes(settings.inactivityWindowMinutes?.toString() || "75");
    }
  }, [settings]);

  // Mutation to save settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (updated: { taxPercentage: number; serviceChargePercentage: number; inactivityWindowMinutes: number }) => {
      if (!settings?.id) {
        throw new Error("No settings record found to update");
      }
      const { error } = await supabase
        .from('cafeSettings')
        .update({
          taxPercentage: updated.taxPercentage,
          serviceChargePercentage: updated.serviceChargePercentage,
          inactivityWindowMinutes: updated.inactivityWindowMinutes
        })
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: (_, updated) => {
      queryClient.invalidateQueries({ queryKey: ['cafeSettings'] });
      localStorage.setItem(
        "cafeSettings",
        JSON.stringify({
          taxPercentage: updated.taxPercentage.toString(),
          serviceChargePercentage: updated.serviceChargePercentage.toString(),
          inactivityWindowMinutes: updated.inactivityWindowMinutes.toString(),
        })
      );
      toast.success("Changes saved successfully!");
    },
    onError: (error: any) => toast.error(error.message),
  });
  
  // Cafe Settings
  const { data: cafeSettings } = useQuery({
    queryKey: ['cafeSettings'],
    queryFn: async () => {
      const { data } = await supabase.from('cafeSettings').select('*').single();
      return {
        taxPercentage: data ? parseFloat(data.taxPercentage.toString()) : 0,
        serviceChargePercentage: data ? parseFloat(data.serviceChargePercentage.toString()) : 0,
      };
    }
  });

  // Today's revenue across all sessions (active + settled)
  const { data: todayRevenue } = useQuery({
    queryKey: ['todayRevenue'],
    refetchInterval: 10000,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: settingsData } = await supabase.from('cafeSettings').select('*').limit(1);
      const scRate = settingsData && settingsData.length > 0 ? parseFloat(settingsData[0].serviceChargePercentage.toString()) : 0;
      const taxRate = settingsData && settingsData.length > 0 ? parseFloat(settingsData[0].taxPercentage.toString()) : 0;

      const { data: sessions } = await supabase
        .from('sessions')
        .select('subtotal')
        .gte('createdAt', todayStart.toISOString());

      let total = 0;
      if (sessions) {
        for (const s of sessions) {
          const subtotal = parseFloat(s.subtotal) || 0;
          const sc = subtotal * (scRate / 100);
          const tax = (subtotal + sc) * (taxRate / 100);
          total += subtotal + sc + tax;
        }
      }
      return total;
    }
  });

  // Settled bills
  const { data: settledBills } = useQuery({
    queryKey: ['settledBills'],
    refetchInterval: 10000,
    queryFn: async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data: settingsData } = await supabase.from('cafeSettings').select('*').limit(1);
      const scRate = settingsData && settingsData.length > 0 ? parseFloat(settingsData[0].serviceChargePercentage.toString()) : 0;
      const taxRate = settingsData && settingsData.length > 0 ? parseFloat(settingsData[0].taxPercentage.toString()) : 0;

      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'settled')
        .gte('createdAt', oneYearAgo.toISOString())
        .order('settledAt', { ascending: false });

      if (!sessions || sessions.length === 0) return [];

      const tableIds = sessions.map((s: any) => s.tableId);
      const { data: tables } = await supabase
        .from('tables')
        .select('id, label')
        .in('id', tableIds);
      const tableLabelMap = new Map((tables || []).map((t: any) => [t.id, t.label]));

      return sessions.map((s: any) => {
        const subtotal = parseFloat(s.subtotal) || 0;
        const sc = subtotal * (scRate / 100);
        const tax = (subtotal + sc) * (taxRate / 100);
        return {
          id: s.id,
          tableLabel: tableLabelMap.get(s.tableId) || 'Unknown',
          subtotal,
          serviceCharge: sc,
          taxAmount: tax,
          finalTotal: subtotal + sc + tax,
          settledAt: s.settledAt,
          createdAt: s.createdAt,
        };
      });
    }
  });

  // Orders Queries
  const { data: activeTables, isLoading: isLoadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['activeTables'],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data: settingsData } = await supabase.from('cafeSettings').select('*').single();
      const scRate = settingsData ? parseFloat(settingsData.serviceChargePercentage.toString()) : 0;
      const taxRate = settingsData ? parseFloat(settingsData.taxPercentage.toString()) : 0;

      const { data: tables } = await supabase.from('tables').select('*');
      if (!tables) return [];

      const result = [];
      for (const table of tables) {
        const { data: session } = await supabase.from('sessions')
          .select('*')
          .eq('tableId', table.id)
          .eq('status', 'open')
          .single();
          
        if (session) {
          const { data: orders } = await supabase.from('orders')
            .select('id')
            .eq('sessionId', session.id);

          let itemCount = 0;

          if (orders && orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            const { data: items } = await supabase.from('orderItems')
              .select('quantity')
              .in('orderId', orderIds);

            if (items) {
              items.forEach(item => {
                itemCount += item.quantity;
              });
            }
          }

          const subtotal = parseFloat(session.subtotal) || 0;
          const sc = subtotal * (scRate / 100);
          const tax = (subtotal + sc) * (taxRate / 100);

          result.push({
            id: table.id,
            label: table.label,
            status: table.status,
            sessionId: session.id,
            subtotal,
            serviceCharge: sc,
            taxAmount: tax,
            finalTotal: subtotal + sc + tax,
            itemCount,
            lastActivityAt: session.lastActivityAt,
          });
        }
      }
      return result;
    }
  });

  const { data: sessionDetails } = useQuery({
    queryKey: ['sessionDetails', selectedSessionId, sessionDetailsKey],
    enabled: !!selectedSessionId,
    queryFn: async () => {
      if (!selectedSessionId) return null;
      
      const [sessionRes, settingsRes] = await Promise.all([
        supabase.from('sessions').select('*').eq('id', selectedSessionId).single(),
        supabase.from('cafeSettings').select('*').single(),
      ]);
      
      const session = sessionRes.data;
      const settingsData = settingsRes.data;
      const scRate = settingsData ? parseFloat(settingsData.serviceChargePercentage.toString()) : 0;
      const taxRate = settingsData ? parseFloat(settingsData.taxPercentage.toString()) : 0;

      const subtotal = session ? (parseFloat(session.subtotal) || 0) : 0;
      const computedServiceCharge = subtotal * (scRate / 100);
      const computedTax = (subtotal + computedServiceCharge) * (taxRate / 100);

      const { data: orders } = await supabase.from('orders').select('*').eq('sessionId', selectedSessionId);
      
      let allItems: any[] = [];
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const { data: items } = await supabase.from('orderItems').select('*').in('orderId', orderIds);
        if (items && items.length > 0) {
          const menuItemIds = Array.from(new Set(items.map(i => i.menuItemId)));
          const { data: menuItems } = await supabase.from('menuItems').select('id, name').in('id', menuItemIds);
          const menuItemMap = new Map((menuItems || []).map(m => [m.id, m.name]));
          allItems = items.map(i => ({ ...i, menuItemName: menuItemMap.get(i.menuItemId) || `Item #${i.menuItemId}` }));
        }
      }

      return {
        session: session ? {
          ...session,
          computedSubtotal: subtotal,
          computedServiceCharge,
          computedTax,
          computedFinalTotal: subtotal + computedServiceCharge + computedTax,
        } : null,
        orders: orders || [],
        items: allItems
      };
    }
  });

  // Mutations
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('categories').insert({ name, displayOrder: 0 });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCategoryName("");
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success("Category created");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { error } = await supabase.from('categories').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success("Category updated");
      setEditingCategory(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      // Check if there are menu items under this category
      const { data: items } = await supabase.from('menuItems').select('id').eq('categoryId', id);
      if (items && items.length > 0) {
        throw new Error("Cannot delete category because it contains menu items. Delete the menu items first.");
      }
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success("Category deleted");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createMenuItemMutation = useMutation({
    mutationFn: async (item: any) => {
      const { error } = await supabase.from('menuItems').insert({
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        isAvailable: true,
        displayOrder: 0
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewItemData({ categoryId: 0, name: "", description: "", price: 0 });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success("Menu item created");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: async (item: any) => {
      const { error } = await supabase.from('menuItems').update({
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price
      }).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success("Menu item updated");
      setEditingMenuItem(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMenuItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const { error } = await supabase.from('menuItems').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success("Menu item deleted");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createTableMutation = useMutation({
    mutationFn: async (label: string) => {
      const tableCode = nanoid(10);
      const { error } = await supabase.from('tables').insert({
        label,
        tableCode,
        status: 'empty'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewTableLabel("");
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success("Table created");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ id, label }: { id: number; label: string }) => {
      const { error } = await supabase.from('tables').update({ label }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      toast.success("Table updated");
      setEditingTable(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('tables').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      toast.success("Table deleted");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const settleSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const { data: session } = await supabase.from('sessions').select('tableId').eq('id', sessionId).single();
      if (!session) throw new Error("Session not found");
      await supabase.from('sessions').update({
        status: 'settled',
        settledAt: new Date().toISOString()
      }).eq('id', sessionId);
      await supabase.from('tables').update({
        status: 'empty',
        activeSessionId: null
      }).eq('id', session.tableId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['todayRevenue'] });
      queryClient.invalidateQueries({ queryKey: ['settledBills'] });
      toast.success("Payment settled successfully");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteBillMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      await supabase.from('sessions').update({ status: 'archived' }).eq('id', sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settledBills'] });
      toast.success("Bill removed from list");
    },
    onError: (error: any) => toast.error(error.message),
  });

  // Seed 12 default tables if none exist
  useEffect(() => {
    if (tablesData && tablesData.length === 0 && !seedingRef.current && !isTablesLoading) {
      seedingRef.current = true;
      const seedTables = async () => {
        const tableLabels = Array.from({ length: 12 }, (_, i) => `Table ${i + 1}`);
        const tableInserts = tableLabels.map(label => ({
          label,
          tableCode: nanoid(10),
          status: 'empty' as const,
        }));
        const { error } = await supabase.from('tables').insert(tableInserts);
        if (error) {
          toast.error("Failed to seed tables: " + error.message);
        } else {
          await queryClient.invalidateQueries({ queryKey: ['tables'] });
          toast.success("12 tables generated!");
        }
        seedingRef.current = false;
      };
      seedTables();
    }
  }, [tablesData, isTablesLoading, queryClient]);

  const handleShowQr = async (code: string, label: string) => {
    const url = `${window.location.origin}/table/${code}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 350, margin: 2, color: { dark: '#1e293b' } });
      setQrDataUrl(dataUrl);
      setQrTable({ tableCode: code, label });
    } catch {
      toast.error("Failed to generate QR code");
    }
  };

  const handleCopyUrl = async (code: string, tableId: number) => {
    const url = `${window.location.origin}/table/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(tableId);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Table URL copied!");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  // Orders Notification
  useEffect(() => {
    if (activeTables && activeTables.length > 0) {
      const now = Date.now();
      const hasNewOrders = activeTables.some(table => {
        const lastActivity = new Date(table.lastActivityAt).getTime();
        return lastActivity > lastOrderTime;
      });

      if (hasNewOrders && lastOrderTime > 0) {
        const audio = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
        audio.play().catch(() => {});
        toast.success("New order received!", { duration: 2000 });
      }

      setLastOrderTime(now);
    }
  }, [activeTables, lastOrderTime]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Admin Panel</h1>
              <p className="text-sm text-slate-600 mt-1">Manage cafe operations (Supabase mode)</p>
            </div>
            {activeTab === 'orders' && (
              <Button onClick={() => refetchOrders()} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh Orders
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8 bg-white border border-slate-200">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="tables">Table Management</TabsTrigger>
            <TabsTrigger value="menu">Menu Management</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card className="p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Active Tables</p>
                    <p className="text-3xl font-bold text-slate-900">{activeTables?.length || 0}</p>
                  </div>
                  <Users className="w-10 h-10 text-blue-500 opacity-20" />
                </div>
              </Card>

              <Card className="p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Total Items</p>
                    <p className="text-3xl font-bold text-slate-900">
                      {activeTables?.reduce((sum, t) => sum + t.itemCount, 0) || 0}
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-green-500 opacity-20" />
                </div>
              </Card>

              <Card className="p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
                    <p className="text-3xl font-bold text-amber-600">
                      ₹{(todayRevenue || 0).toFixed(2)}
                    </p>
                  </div>
                  <TrendingUp className="w-10 h-10 text-amber-500 opacity-20" />
                </div>
              </Card>
            </div>

            {isLoadingOrders ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-amber-600 animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Loading orders...</p>
              </div>
            ) : activeTables && activeTables.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTables.map(table => (
                  <Card
                    key={table.id}
                    className="p-6 hover:shadow-lg transition-shadow cursor-pointer bg-white"
                    onClick={() => {
                      setSelectedSessionId(table.sessionId);
                      setSessionDetailsKey(k => k + 1);
                      setShowDetails(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">{table.label}</h3>
                        <p className="text-xs text-slate-600 mt-1">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(table.lastActivityAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Badge
                        variant={table.status === 'active' ? 'default' : 'secondary'}
                        className={table.status === 'active' ? 'bg-green-600' : 'bg-amber-600'}
                      >
                        {table.status === 'active' ? 'Active' : 'Flagged'}
                      </Badge>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Items</span>
                        <span className="font-semibold text-slate-900">{table.itemCount}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Subtotal</span>
                        <span className="font-semibold text-slate-900">₹{table.subtotal.toFixed(2)}</span>
                      </div>
                      {table.serviceCharge > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">Service Charge</span>
                          <span className="font-semibold text-slate-900">₹{table.serviceCharge.toFixed(2)}</span>
                        </div>
                      )}
                      {table.taxAmount > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-600">GST</span>
                          <span className="font-semibold text-slate-900">₹{table.taxAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                        <span className="text-sm font-semibold text-slate-700">Total</span>
                        <span className="text-lg font-bold text-amber-600">₹{table.finalTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSessionId(table.sessionId);
                          setSessionDetailsKey(k => k + 1);
                          setShowDetails(true);
                        }}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        View Details
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          settleSessionMutation.mutate(table.sessionId);
                        }}
                        variant="outline"
                        className="flex-1 border-green-600 text-green-700 hover:bg-green-50"
                      >
                        Mark as Paid
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center bg-white">
                <Bell className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 font-medium">No active tables</p>
                <p className="text-sm text-slate-500 mt-2">Orders will appear here when customers place them</p>
              </Card>
            )}

            {/* Session Details Dialog */}
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Order Details</DialogTitle>
                </DialogHeader>
                {sessionDetails && (
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-slate-900 mb-3">Session Information</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-slate-600">Created</p>
                          <p className="font-semibold text-slate-900">
                            {new Date(sessionDetails.session?.createdAt || '').toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Status</p>
                          <p className="font-semibold text-slate-900 capitalize">
                            {sessionDetails.session?.status}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Items</p>
                          <p className="font-semibold text-slate-900">
                            {sessionDetails.items?.reduce((sum, i) => sum + i.quantity, 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Subtotal</p>
                          <p className="font-semibold text-slate-900">
                            ₹{sessionDetails.session?.computedSubtotal.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">Service Charge</p>
                          <p className="font-semibold text-slate-900">
                            ₹{sessionDetails.session?.computedServiceCharge.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-600">GST</p>
                          <p className="font-semibold text-slate-900">
                            ₹{sessionDetails.session?.computedTax.toFixed(2)}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-600">Final Total</p>
                          <p className="font-semibold text-amber-600 text-lg">
                            ₹{sessionDetails.session?.computedFinalTotal.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-900 mb-3">Items Ordered</h4>
                      <div className="space-y-2">
                        {sessionDetails.items?.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div>
                              <p className="font-medium text-slate-900">{item.menuItemName}</p>
                              <p className="text-xs text-slate-600">
                                ₹{typeof item.priceAtOrderTime === 'string'
                                  ? parseFloat(item.priceAtOrderTime).toFixed(2)
                                  : (item.priceAtOrderTime as number).toFixed(2)}
                              </p>
                            </div>
                            <Badge variant="outline">{item.quantity}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Table Management Tab */}
          <TabsContent value="tables" className="space-y-6">
            <Card className="p-6 bg-white">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Tables</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-amber-600 hover:bg-amber-700">
                      <Plus className="w-4 h-4" />
                      New Table
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Table</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Input
                        placeholder="Table label (e.g., Table 1)"
                        value={newTableLabel}
                        onChange={(e) => setNewTableLabel(e.target.value)}
                      />
                      <Button
                        onClick={() => createTableMutation.mutate(newTableLabel)}
                        className="w-full bg-amber-600 hover:bg-amber-700"
                      >
                        Create
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {isTablesLoading ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-amber-600 animate-spin mx-auto mb-3"></div>
                  <p className="text-slate-600 text-sm">Loading tables...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tablesData?.map((table: any) => (
                    <Card key={table.id} className="p-5 border border-slate-200 flex flex-col bg-white hover:shadow-lg transition-shadow">
                      {/* Top row: Label + Status */}
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-xl font-bold text-slate-900">{table.label}</h3>
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono">
                          {table.status}
                        </span>
                      </div>

                      {/* Table code */}
                      <p className="text-xs text-slate-500 font-mono break-all mb-4 bg-slate-50 p-2 rounded">
                        Code: {table.tableCode}
                      </p>

                      {/* URL preview */}
                      <p className="text-xs text-slate-400 font-mono break-all mb-4 line-clamp-1">
                        {window.location.origin}/table/{table.tableCode}
                      </p>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-slate-100">
                        <Button
                          onClick={() => handleCopyUrl(table.tableCode, table.id)}
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs gap-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50"
                        >
                          {copiedId === table.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === table.id ? "Copied" : "Copy URL"}
                        </Button>
                        <Button
                          onClick={() => handleShowQr(table.tableCode, table.label)}
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs gap-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          QR Code
                        </Button>
                        <Button
                          onClick={() => setEditingTable({ id: table.id, label: table.label })}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-amber-600"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete ${table.label}?`)) {
                              deleteTableMutation.mutate(table.id);
                            }
                          }}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* Menu Management Tab */}
          <TabsContent value="menu" className="space-y-6">
            <Card className="p-6 bg-white">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Categories</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-amber-600 hover:bg-amber-700">
                      <Plus className="w-4 h-4" />
                      New Category
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Category</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Input
                        placeholder="Category name"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                      />
                      <Button
                        onClick={() => createCategoryMutation.mutate(newCategoryName)}
                        className="w-full bg-amber-600 hover:bg-amber-700"
                      >
                        Create
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categories?.map((category: any) => (
                  <Card key={category.id} className="p-4 border border-slate-200 flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-slate-900">{category.name}</h3>
                      <p className="text-xs text-slate-600 mt-1">
                        {menuItems?.filter((i: any) => i.categoryId === category.id).length || 0} items
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setEditingCategory({ id: category.id, name: category.name })}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-600 hover:text-amber-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete category "${category.name}"?`)) {
                            deleteCategoryMutation.mutate(category.id);
                          }
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>

            <Card className="p-6 bg-white">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-900">Menu Items</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2 bg-amber-600 hover:bg-amber-700">
                      <Plus className="w-4 h-4" />
                      New Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Menu Item</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <select
                        value={newItemData.categoryId}
                        onChange={(e) => setNewItemData({ ...newItemData, categoryId: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md"
                      >
                        <option value={0}>Select Category</option>
                        {categories?.map((cat: any) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      <Input
                        placeholder="Item name"
                        value={newItemData.name}
                        onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })}
                      />
                      <Input
                        placeholder="Description"
                        value={newItemData.description}
                        onChange={(e) => setNewItemData({ ...newItemData, description: e.target.value })}
                      />
                      <Input
                        type="number"
                        placeholder="Price"
                        step="0.01"
                        value={newItemData.price}
                        onChange={(e) => setNewItemData({ ...newItemData, price: parseFloat(e.target.value) })}
                      />
                      <Button
                        onClick={() => {
                          if (newItemData.categoryId && newItemData.name && newItemData.price > 0) {
                            createMenuItemMutation.mutate(newItemData);
                          } else {
                            toast.error("Please fill all fields");
                          }
                        }}
                        className="w-full bg-amber-600 hover:bg-amber-700"
                      >
                        Create
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-3">
                {menuItems?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900">{item.name}</h4>
                      {item.description && <p className="text-xs text-slate-500 mb-1">{item.description}</p>}
                      <p className="text-sm text-slate-600">₹{typeof item.price === 'string' ? parseFloat(item.price).toFixed(2) : (item.price as number).toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setEditingMenuItem({
                          id: item.id,
                          name: item.name,
                          description: item.description || "",
                          price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
                          categoryId: item.categoryId
                        })}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-600 hover:text-amber-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
                            deleteMenuItemMutation.mutate(item.id);
                          }
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="p-6 bg-white">
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Settings className="w-6 h-6" />
                Cafe Settings
              </h2>
              {isLoadingSettings ? (
                <div className="text-center py-6">
                  <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-amber-600 animate-spin mx-auto mb-2"></div>
                  <p className="text-slate-600 text-sm">Loading settings...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-2">
                      Tax Percentage
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      value={taxPercentage}
                      onChange={(e) => setTaxPercentage(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-2">
                      Service Charge Percentage
                    </label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      value={serviceChargePercentage}
                      onChange={(e) => setServiceChargePercentage(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-900 mb-2">
                      Inactivity Window (minutes)
                    </label>
                    <Input
                      type="number"
                      placeholder="75"
                      value={inactivityWindowMinutes}
                      onChange={(e) => setInactivityWindowMinutes(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={() => {
                      updateSettingsMutation.mutate({
                        taxPercentage: parseFloat(taxPercentage || "0"),
                        serviceChargePercentage: parseFloat(serviceChargePercentage || "0"),
                        inactivityWindowMinutes: parseInt(inactivityWindowMinutes || "75")
                      });
                    }}
                    disabled={updateSettingsMutation.isPending}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </Card>

            {/* Settled Bills */}
            <Card className="p-6 bg-white">
              <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Receipt className="w-6 h-6" />
                Settled Bills
              </h2>
              <p className="text-xs text-slate-500 mb-4">Bills are automatically deleted after 1 year.</p>
              {!settledBills || settledBills.length === 0 ? (
                <p className="text-slate-500 text-sm">No settled bills yet.</p>
              ) : (
                <>
                  {(() => {
                    const groups: Record<string, typeof settledBills> = {};
                    for (const bill of settledBills) {
                      const dateKey = new Date(bill.settledAt).toLocaleDateString();
                      if (!groups[dateKey]) groups[dateKey] = [];
                      groups[dateKey].push(bill);
                    }
                    return Object.entries(groups).map(([date, bills]) => (
                      <div key={date} className="mb-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-3 border-b border-slate-200 pb-2">{date}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {bills.map(bill => (
                            <Card key={bill.id} className="p-4 border border-slate-200">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-slate-900">{bill.tableLabel}</h4>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">
                                    {new Date(bill.settledAt).toLocaleTimeString()}
                                  </span>
                                  <button
                                    onClick={() => deleteBillMutation.mutate(bill.id)}
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Subtotal</span>
                                  <span>₹{bill.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-600">Service Charge</span>
                                  <span>₹{bill.serviceCharge.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-600">GST</span>
                                  <span>₹{bill.taxAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-semibold border-t border-slate-200 pt-1 mt-1">
                                  <span className="text-slate-700">Total</span>
                                  <span className="text-amber-600">₹{bill.finalTotal.toFixed(2)}</span>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Table Dialog */}
      <Dialog open={editingTable !== null} onOpenChange={(open) => !open && setEditingTable(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Table</DialogTitle>
          </DialogHeader>
          {editingTable && (
            <div className="space-y-4">
              <Input
                placeholder="Table label (e.g., Table 1)"
                value={editingTable.label}
                onChange={(e) => setEditingTable({ ...editingTable, label: e.target.value })}
              />
              <Button
                onClick={() => updateTableMutation.mutate({ id: editingTable.id, label: editingTable.label })}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={editingCategory !== null} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <div className="space-y-4">
              <Input
                placeholder="Category name"
                value={editingCategory.name}
                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
              />
              <Button
                onClick={() => updateCategoryMutation.mutate({ id: editingCategory.id, name: editingCategory.name })}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Menu Item Dialog */}
      <Dialog open={editingMenuItem !== null} onOpenChange={(open) => !open && setEditingMenuItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Menu Item</DialogTitle>
          </DialogHeader>
          {editingMenuItem && (
            <div className="space-y-4">
              <select
                value={editingMenuItem.categoryId}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, categoryId: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              >
                <option value={0}>Select Category</option>
                {categories?.map((cat: any) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <Input
                placeholder="Item name"
                value={editingMenuItem.name}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, name: e.target.value })}
              />
              <Input
                placeholder="Description"
                value={editingMenuItem.description}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, description: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Price"
                step="0.01"
                value={editingMenuItem.price}
                onChange={(e) => setEditingMenuItem({ ...editingMenuItem, price: parseFloat(e.target.value) })}
              />
              <Button
                onClick={() => {
                  if (editingMenuItem.categoryId && editingMenuItem.name && editingMenuItem.price > 0) {
                    updateMenuItemMutation.mutate(editingMenuItem);
                  } else {
                    toast.error("Please fill all fields");
                  }
                }}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrTable !== null} onOpenChange={(open) => !open && setQrTable(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{qrTable?.label} — QR Code</DialogTitle>
          </DialogHeader>
          {qrTable && qrDataUrl && (
            <div className="flex flex-col items-center gap-4 py-4">
              <img
                src={qrDataUrl}
                alt={`QR code for ${qrTable.label}`}
                className="w-64 h-64 rounded-lg border border-slate-200"
              />
              <p className="text-xs text-slate-500 text-center break-all font-mono">
                {window.location.origin}/table/{qrTable.tableCode}
              </p>
              <Button
                onClick={() => handleCopyUrl(qrTable.tableCode, -1)}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
              >
                {copiedId === -1 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedId === -1 ? "Copied!" : "Copy URL"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
