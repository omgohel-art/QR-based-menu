import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ImageUpload from "@/components/ImageUpload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Settings, Clock, Users, TrendingUp, RefreshCw, Bell, Pencil, QrCode, Copy, Check, Receipt, AlertTriangle, CheckCircle, LogOut, Eye, EyeOff, Shield } from "lucide-react";
import QRCode from 'qrcode';
import { toast } from "sonner";
import { nanoid } from "nanoid";
import Footer from "@/components/marketing/Footer";
import DateRangePicker from "@/components/DateRangePicker";
import "@/components/LoadingRipple.css";

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("kitchenMode") === "true" ? "orderqueue" : "orders";
  });
  const isKitchenMode = localStorage.getItem("kitchenMode") === "true";
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTableLabel, setNewTableLabel] = useState("");
  const [newItemData, setNewItemData] = useState({
    categoryId: 0,
    name: "",
    description: "",
    price: 0,
    imageUrl: null as string | null,
  });

  // Orders State
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sessionDetailsKey, setSessionDetailsKey] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [lastOrderTime, setLastOrderTime] = useState<number>(0);

  // Edit States
  const [editingTable, setEditingTable] = useState<{ id: number; label: string } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<{ id: number; name: string; description: string; price: number; categoryId: number; imageUrl: string | null } | null>(null);

  // Change Password State
  const [cpCurrent, setCpCurrent] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpShow, setCpShow] = useState(false);
  const [cpSubmitting, setCpSubmitting] = useState(false);
  const [cpError, setCpError] = useState("");
  const [cpSuccess, setCpSuccess] = useState("");

  // Settled Bills Date Filter
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateStr(new Date()));

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
      const { data } = await supabase.from('menuItems').select('*').order('name');
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
      const { data: settingsData } = await supabase.from('cafeSettings').select('*').limit(1);
      const scRate = settingsData && settingsData.length > 0 ? parseFloat(settingsData[0].serviceChargePercentage.toString()) : 0;
      const taxRate = settingsData && settingsData.length > 0 ? parseFloat(settingsData[0].taxPercentage.toString()) : 0;

      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'settled')
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

  // Orders Queries - Individual orders as separate cards
  const { data: activeOrders, isLoading: isLoadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ['activeTables'],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data: settingsData } = await supabase.from('cafeSettings').select('*').single();
      const scRate = settingsData ? parseFloat(settingsData.serviceChargePercentage.toString()) : 0;
      const taxRate = settingsData ? parseFloat(settingsData.taxPercentage.toString()) : 0;

      // Get all open sessions
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'open');

      if (!sessions || sessions.length === 0) return [];

      // Get all orders for these sessions
      const sessionIds = sessions.map((s: any) => s.id);
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .in('sessionId', sessionIds)
        .order('id', { ascending: true });

      if (!orders || orders.length === 0) return [];

      // Get all order items
      const orderIds = orders.map((o: any) => o.id);
      const { data: orderItems } = await supabase
        .from('orderItems')
        .select('*')
        .in('orderId', orderIds);

      // Get menu item names
      const menuItemIds = Array.from(new Set((orderItems || []).map((i: any) => i.menuItemId)));
      const { data: menuItemsData } = await supabase
        .from('menuItems')
        .select('id, name')
        .in('id', menuItemIds);
      const menuItemMap = new Map((menuItemsData || []).map((m: any) => [m.id, m.name]));

      // Get table labels
      const tableIds = sessions.map((s: any) => s.tableId);
      const { data: tables } = await supabase
        .from('tables')
        .select('id, label')
        .in('id', tableIds);
      const tableLabelMap = new Map((tables || []).map((t: any) => [t.id, t.label]));

      // Group orders by table
      const tableMap = new Map<number, {
        tableLabel: string;
        sessionId: number;
        orders: Array<{
          id: number;
          orderNumber: number | null;
          submittedAt: string;
          status: string;
          paymentMethod: string | null;
          paymentStatus: string;
          subtotal: number;
          itemCount: number;
          items: Array<{
            id: number;
            menuItemName: string;
            quantity: number;
            priceAtOrderTime: number;
          }>;
        }>;
      }>();

      for (const session of sessions) {
        const tableLabel = tableLabelMap.get(session.tableId) || 'Unknown';
        const sessionOrders = orders.filter((o: any) => o.sessionId === session.id);
        
        if (!tableMap.has(session.tableId)) {
          tableMap.set(session.tableId, {
            tableLabel,
            sessionId: session.id,
            orders: []
          });
        }

        const tableData = tableMap.get(session.tableId)!;

        for (const order of sessionOrders) {
          const items = (orderItems || [])
            .filter((i: any) => i.orderId === order.id)
            .map((i: any) => ({
              id: i.id,
              menuItemName: menuItemMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
              quantity: i.quantity,
              priceAtOrderTime: parseFloat(i.priceAtOrderTime.toString()),
            }));
          
          const subtotal = items.reduce((acc: number, item: any) => acc + (item.priceAtOrderTime * item.quantity), 0);
          const itemCount = items.reduce((acc: number, item: any) => acc + item.quantity, 0);

          tableData.orders.push({
            id: order.id,
            orderNumber: order.orderNumber,
            submittedAt: order.submittedAt,
            status: order.status || 'pending',
            paymentMethod: order.paymentMethod || null,
            paymentStatus: order.paymentStatus || 'pending',
            subtotal,
            itemCount,
            items,
          });
        }
      }

      // Convert to array and calculate totals
      const result: any[] = [];
      const tableEntries = Array.from(tableMap.entries());
      for (const [tableId, tableData] of tableEntries) {
        const sessionSubtotal = tableData.orders.reduce((acc: number, o: any) => acc + o.subtotal, 0);
        const sc = sessionSubtotal * (scRate / 100);
        const tax = (sessionSubtotal + sc) * (taxRate / 100);
        
        // Check if there are any unpaid orders (pending or delivered, not settled)
        const pendingOrders = tableData.orders.filter((o: any) => o.status !== 'settled');
        const hasPaymentPending = pendingOrders.length > 0;
        const oldestPendingOrder = hasPaymentPending ? pendingOrders[0] : null;

        result.push({
          id: tableId,
          label: tableData.tableLabel,
          sessionId: tableData.sessionId,
          orders: tableData.orders,
          subtotal: sessionSubtotal,
          serviceCharge: sc,
          taxAmount: tax,
          finalTotal: sessionSubtotal + sc + tax,
          lastActivityAt: tableData.orders[tableData.orders.length - 1]?.submittedAt || new Date().toISOString(),
          hasPaymentPending,
          oldestPendingOrder,
        });
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
      let ordersWithNumbers: any[] = [];
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const { data: items } = await supabase.from('orderItems').select('*').in('orderId', orderIds);
        if (items && items.length > 0) {
          const menuItemIds = Array.from(new Set(items.map(i => i.menuItemId)));
          const { data: menuItemsData } = await supabase.from('menuItems').select('id, name').in('id', menuItemIds);
          const menuItemMap = new Map((menuItemsData || []).map(m => [m.id, m.name]));
          allItems = items.map(i => ({ ...i, menuItemName: menuItemMap.get(i.menuItemId) || `Item #${i.menuItemId}` }));
        }
        // Sort orders by orderNumber if available, else by id
        const sortedOrders = [...orders].sort((a, b) => {
          if (a.orderNumber != null && b.orderNumber != null) return (a.orderNumber as number) - (b.orderNumber as number);
          return a.id - b.id;
        });
        ordersWithNumbers = sortedOrders.map(o => ({
          ...o,
          items: allItems.filter(i => i.orderId === o.id)
        }));
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
        items: allItems,
        ordersWithNumbers
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
      const payload: any = {
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        isAvailable: true,
        displayOrder: 0
      };
      if (item.imageUrl) payload.imageUrl = item.imageUrl;
      const { error } = await supabase.from('menuItems').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewItemData({ categoryId: 0, name: "", description: "", price: 0, imageUrl: null });
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
      toast.success("Menu item created");
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMenuItemMutation = useMutation({
    mutationFn: async (item: any) => {
      const payload: any = {
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price
      };
      if (item.imageUrl !== undefined) payload.imageUrl = item.imageUrl;
      const { error } = await supabase.from('menuItems').update(payload).eq('id', item.id);
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

  // Settle individual order
  const settleOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const { error } = await supabase.from('orders').update({ status: 'settled' }).eq('id', orderId);
      if (error) throw error;
      
      // Check if all orders in the session are settled
      const { data: order } = await supabase.from('orders').select('sessionId').eq('id', orderId).single();
      if (order) {
        const { data: allOrders } = await supabase.from('orders').select('status').eq('sessionId', order.sessionId);
        const allSettled = allOrders?.every(o => o.status === 'settled') ?? false;
        
        if (allSettled) {
          const { data: session } = await supabase.from('sessions').select('tableId').eq('id', order.sessionId).single();
          await supabase.from('sessions').update({
            status: 'settled',
            settledAt: new Date().toISOString()
          }).eq('id', order.sessionId);
          if (session) {
            await supabase.from('tables').update({
              status: 'empty',
              activeSessionId: null
            }).eq('id', session.tableId);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['todayRevenue'] });
      queryClient.invalidateQueries({ queryKey: ['settledBills'] });
      toast.success("Order marked as paid");
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

  // Order Queue - pending orders not yet delivered
  const { data: orderQueue, isLoading: isLoadingQueue } = useQuery({
    queryKey: ['orderQueue'],
    refetchInterval: 3000,
    queryFn: async () => {
      // Get all open sessions
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'open');

      if (!sessions || sessions.length === 0) return [];

      // Get all orders for these sessions
      const sessionIds = sessions.map((s: any) => s.id);
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .in('sessionId', sessionIds)
        .eq('status', 'pending')
        .order('id', { ascending: true });

      if (!orders || orders.length === 0) return [];

      // Get all order items
      const orderIds = orders.map((o: any) => o.id);
      const { data: orderItems } = await supabase
        .from('orderItems')
        .select('*')
        .in('orderId', orderIds);

      // Get menu item names
      const menuItemIds = Array.from(new Set((orderItems || []).map((i: any) => i.menuItemId)));
      const { data: menuItemsData } = await supabase
        .from('menuItems')
        .select('id, name')
        .in('id', menuItemIds);
      const menuItemMap = new Map((menuItemsData || []).map((m: any) => [m.id, m.name]));

      // Get table labels
      const tableIds = sessions.map((s: any) => s.tableId);
      const { data: tables } = await supabase
        .from('tables')
        .select('id, label')
        .in('id', tableIds);
      const tableLabelMap = new Map((tables || []).map((t: any) => [t.id, t.label]));

      // Build order queue
      const result: any[] = [];
      for (const session of sessions) {
        const sessionOrders = orders.filter((o: any) => o.sessionId === session.id);
        for (const order of sessionOrders) {
          const items = (orderItems || [])
            .filter((i: any) => i.orderId === order.id)
            .map((i: any) => ({
              id: i.id,
              menuItemName: menuItemMap.get(i.menuItemId) || `Item #${i.menuItemId}`,
              quantity: i.quantity,
            }));

          result.push({
            id: order.id,
            orderNumber: order.orderNumber,
            tableLabel: tableLabelMap.get(session.tableId) || 'Unknown',
            submittedAt: order.submittedAt,
            paymentMethod: order.paymentMethod || null,
            paymentStatus: order.paymentStatus || 'pending',
            items,
          });
        }
      }

      return result;
    }
  });

  // Mark order as delivered
  const markDeliveredMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orderQueue'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      toast.success("Order marked as delivered");
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
    if (activeOrders && activeOrders.length > 0) {
      const now = Date.now();
      const hasNewOrders = activeOrders.some(table => {
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
  }, [activeOrders, lastOrderTime]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900">{isKitchenMode ? "Kitchen Panel" : "Admin Panel"}</h1>
              <p className="text-xs md:text-sm text-slate-600 mt-1">{isKitchenMode ? "View incoming orders" : "Manage cafe operations"}</p>
            </div>
            {!isKitchenMode && activeTab === 'orders' && (
              <Button onClick={() => refetchOrders()} variant="outline" size="sm" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh Orders</span>
                <span className="sm:hidden">Refresh</span>
              </Button>
            )}
            {isKitchenMode && (
              <Button onClick={async () => { localStorage.removeItem("kitchenMode"); await logout(); navigate("/login", { replace: true }); }} variant="outline" size="sm" className="gap-2 text-red-500 border-red-200 hover:bg-red-50">
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full overflow-x-auto mb-6 md:mb-8 bg-white border border-slate-200">
            {!isKitchenMode && <TabsTrigger value="orders" className="flex-1 min-w-0 text-xs md:text-sm whitespace-nowrap">Orders</TabsTrigger>}
            <TabsTrigger value="orderqueue" className="flex-1 min-w-0 text-xs md:text-sm whitespace-nowrap">Order Queue</TabsTrigger>
            {!isKitchenMode && <TabsTrigger value="tables" className="flex-1 min-w-0 text-xs md:text-sm whitespace-nowrap">Tables</TabsTrigger>}
            {!isKitchenMode && <TabsTrigger value="menu" className="flex-1 min-w-0 text-xs md:text-sm whitespace-nowrap">Menu</TabsTrigger>}
            {!isKitchenMode && <TabsTrigger value="settings" className="flex-1 min-w-0 text-xs md:text-sm whitespace-nowrap">Settings</TabsTrigger>}
          </TabsList>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card className="p-4 md:p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Active Tables</p>
                    <p className="text-2xl md:text-3xl font-bold text-slate-900">{activeOrders?.length || 0}</p>
                  </div>
                  <Users className="w-8 md:w-10 h-8 md:h-10 text-blue-500 opacity-20" />
                </div>
              </Card>

              <Card className="p-4 md:p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Total Items</p>
                    <p className="text-2xl md:text-3xl font-bold text-slate-900">
                      {activeOrders?.reduce((acc: number, t: any) => acc + t.orders.reduce((s: number, o: any) => s + o.itemCount, 0), 0) || 0}
                    </p>
                  </div>
                  <TrendingUp className="w-8 md:w-10 h-8 md:h-10 text-green-500 opacity-20" />
                </div>
              </Card>

              <Card className="p-4 md:p-6 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Total Revenue</p>
                    <p className="text-2xl md:text-3xl font-bold text-green-500">
                      ₹{(todayRevenue || 0).toFixed(2)}
                    </p>
                  </div>
                  <TrendingUp className="w-8 md:w-10 h-8 md:h-10 text-green-400 opacity-20" />
                </div>
              </Card>
            </div>

            {isLoadingOrders ? (
              <div className="flex items-center justify-center py-16">
                <div className="ld-ripple">
                  <div />
                  <div />
                </div>
              </div>
            ) : activeOrders && activeOrders.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeOrders.map(table => (
                  <Card
                    key={table.id}
                    className="p-4 md:p-6 hover:shadow-lg transition-shadow cursor-pointer bg-white"
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
                      <div className="flex flex-col items-end gap-1">
                        {table.hasPaymentPending && table.oldestPendingOrder && (
                          <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300 text-blue-600">
                            Payment pending
                          </Badge>
                        )}
                        {table.orders.map((o: any) => (
                          <div key={o.id} className="flex flex-wrap items-center gap-1 justify-end">
                            {o.status === 'delivered' && (
                              <Badge className="text-xs bg-green-600">Served</Badge>
                            )}
                            {o.status === 'pending' && (
                              <Badge variant="outline" className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700">Pending</Badge>
                            )}
                            {o.paymentMethod && (
                              <span className="text-[10px] text-slate-400 uppercase">{o.paymentMethod}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Latest Order Items */}
                    {table.orders.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {table.orders[table.orders.length - 1].items.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-900">{item.quantity}× {item.menuItemName}</span>
                            <span className="text-slate-600">₹{(item.priceAtOrderTime * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between text-sm font-semibold text-slate-900 mt-1 pt-1 border-t border-slate-200">
                          <span>Subtotal</span>
                          <span>₹{table.orders[table.orders.length - 1].subtotal.toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Payment Pending Box */}
                    {table.hasPaymentPending && table.oldestPendingOrder && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3">
                        <p className="text-xs font-semibold text-blue-800 mb-1">
                          Order #{table.oldestPendingOrder.orderNumber?.toString().padStart(3, '0') || '?'} (Payment Pending)
                        </p>
                        <div className="space-y-0.5">
                          {table.oldestPendingOrder.items.map((item: any) => (
                            <div key={item.id} className="flex justify-between text-xs text-blue-900">
                              <span>{item.quantity}× {item.menuItemName}</span>
                              <span>₹{(item.priceAtOrderTime * item.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs font-semibold text-blue-900 mt-1 pt-1 border-t border-blue-200">
                          <span>Subtotal</span>
                          <span>₹{table.oldestPendingOrder.subtotal.toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Items</span>
                        <span className="font-semibold text-slate-900">
                          {table.orders.reduce((acc: number, o: any) => acc + o.itemCount, 0)}
                        </span>
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
                        <span className="text-lg font-bold text-green-500">₹{table.finalTotal.toFixed(2)}</span>
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
                        className="flex-1 btn-sweep"
                      >
                        View Details
                      </Button>
                      {table.hasPaymentPending && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (table.oldestPendingOrder) {
                              settleOrderMutation.mutate(table.oldestPendingOrder.id);
                            }
                          }}
                          variant="outline"
                          className="flex-1 btn-sweep-green"
                        >
                          Mark as Paid
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 md:p-12 text-center bg-white">
                <Bell className="w-10 md:w-12 h-10 md:h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 font-medium">No active tables</p>
                <p className="text-sm text-slate-500 mt-2">Orders will appear here when customers place them</p>
              </Card>
            )}

            {/* Session Details Dialog */}
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
              <DialogContent className="max-w-full md:max-w-2xl">
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
                          <p className="font-semibold text-green-500 text-lg">
                            ₹{sessionDetails.session?.computedFinalTotal.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-900 mb-3">Orders ({sessionDetails.ordersWithNumbers?.length || 0})</h4>
                      <div className="space-y-4">
                        {sessionDetails.ordersWithNumbers?.map(order => (
                          <div key={order.id} className="border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">#{order.orderNumber?.toString().padStart(3, '0') || order.id}</span>
                                {order.status === 'delivered' && (
                                  <Badge className="text-xs bg-green-600">Served</Badge>
                                )}
                                {order.status === 'pending' && (
                                  <Badge variant="outline" className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700">Pending</Badge>
                                )}
                                {order.status === 'settled' && (
                                  <Badge className="text-xs bg-green-600">Paid</Badge>
                                )}
                                {order.paymentStatus === 'paid' && (
                                  <Badge className="text-xs bg-blue-600">Online</Badge>
                                )}
                                {order.paymentStatus === 'pending' && order.paymentMethod === 'counter' && (
                                  <Badge variant="outline" className="text-xs bg-slate-50 border-slate-300 text-slate-600">Counter</Badge>
                                )}
                              </div>
                              <span className="text-xs text-slate-500">{new Date(order.submittedAt).toLocaleTimeString()}</span>
                            </div>
                            <div className="space-y-1.5">
                              {order.items?.map((item: any) => (
                                <div key={item.id} className="flex items-center justify-between text-sm">
                                  <div>
                                    <p className="font-medium text-slate-900">{item.menuItemName}</p>
                                    <p className="text-xs text-slate-500">
                                      ₹{typeof item.priceAtOrderTime === 'string'
                                        ? parseFloat(item.priceAtOrderTime).toFixed(2)
                                        : (item.priceAtOrderTime as number).toFixed(2)}
                                    </p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">{item.quantity}</Badge>
                                </div>
                              ))}
                              {order.items?.length === 0 && (
                                <p className="text-xs text-slate-500 italic">No items in this order</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Order Queue Tab */}
          <TabsContent value="orderqueue" className="space-y-6">
            {isLoadingQueue ? (
              <div className="flex items-center justify-center py-16">
                <div className="ld-ripple">
                  <div />
                  <div />
                </div>
              </div>
            ) : orderQueue && orderQueue.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {orderQueue.map(order => (
                  <Card key={order.id} className="p-4 md:p-5 bg-white hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{order.tableLabel}</h3>
                        <p className="text-xs text-slate-600 mt-1">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(order.submittedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">
                        #{order.orderNumber?.toString().padStart(3, '0') || order.id}
                      </Badge>
                    </div>

                    <div className="space-y-1.5 mb-4">
                      {order.items.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-900">{item.quantity}× {item.menuItemName}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={() => markDeliveredMutation.mutate(order.id)}
                      className="w-full btn-sweep-green gap-2"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Delivered
                    </Button>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 md:p-12 text-center bg-white">
                <CheckCircle className="w-10 md:w-12 h-10 md:h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 font-medium">No pending orders</p>
                <p className="text-sm text-slate-500 mt-2">Orders will appear here when customers place them</p>
              </Card>
            )}
          </TabsContent>

          {/* Table Management Tab */}
          <TabsContent value="tables" className="space-y-6">
            <Card className="p-4 md:p-6 bg-white">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">Tables</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2 btn-sweep">
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
                        className="w-full btn-sweep"
                      >
                        Create
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {isTablesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="ld-ripple">
                    <div />
                    <div />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tablesData?.map((table: any) => (
                    <Card key={table.id} className="p-3 md:p-5 border border-slate-200 flex flex-col bg-white hover:shadow-lg transition-shadow">
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
                          className="flex-1 text-xs gap-1.5 text-slate-600 hover:text-blue-500 hover:bg-blue-50"
                        >
                          {copiedId === table.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === table.id ? "Copied" : "Copy URL"}
                        </Button>
                        <Button
                          onClick={() => handleShowQr(table.tableCode, table.label)}
                          variant="ghost"
                          size="sm"
                          className="flex-1 text-xs gap-1.5 text-slate-600 hover:text-blue-500 hover:bg-blue-50"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          QR Code
                        </Button>
                        <Button
                          onClick={() => setEditingTable({ id: table.id, label: table.label })}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-blue-500"
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
            <Card className="p-4 md:p-6 bg-white">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">Categories</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2 btn-sweep">
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
                        className="w-full btn-sweep"
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
                        className="h-8 w-8 text-slate-600 hover:text-blue-500"
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

            <Card className="p-4 md:p-6 bg-white">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">Menu Items</h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2 btn-sweep">
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
                      <ImageUpload
                        currentImageUrl={newItemData.imageUrl}
                        onImageChange={(url) => setNewItemData({ ...newItemData, imageUrl: url })}
                      />
                      <Button
                        onClick={() => {
                          if (newItemData.categoryId && newItemData.name && newItemData.price > 0) {
                            createMenuItemMutation.mutate(newItemData);
                          } else {
                            toast.error("Please fill all fields");
                          }
                        }}
                        className="w-full btn-sweep"
                      >
                        Create
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
                {categories?.filter((c: any) => menuItems?.some((i: any) => i.categoryId === c.id)).map((category: any) => (
                  <button
                    key={category.id}
                    onClick={() => document.getElementById(`admin-cat-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="px-4 py-2 rounded-full text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all whitespace-nowrap"
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              <div className="space-y-6">
                {categories?.map((category: any) => {
                  const catItems = menuItems?.filter((i: any) => i.categoryId === category.id) || [];
                  if (catItems.length === 0) return null;
                  return (
                    <div key={category.id} id={`admin-cat-${category.id}`} className="scroll-mt-20">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{category.name}</h3>
                      <div className="space-y-3">
                        {catItems.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3 flex-1">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                                  <span className="text-xs text-slate-400">No img</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <h4 className="font-semibold text-slate-900 truncate">{item.name}</h4>
                                {item.description && <p className="text-xs text-slate-500 truncate">{item.description}</p>}
                                <p className="text-sm text-slate-600">₹{typeof item.price === 'string' ? parseFloat(item.price).toFixed(2) : (item.price as number).toFixed(2)}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => setEditingMenuItem({
                                  id: item.id,
                                  name: item.name,
                                  description: item.description || "",
                                  price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
                                  categoryId: item.categoryId,
                                  imageUrl: item.imageUrl || null
                                })}
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-600 hover:text-blue-500"
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
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="p-4 md:p-6 bg-white">
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4 md:mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5 md:w-6 md:h-6" />
                Cafe Settings
              </h2>
              {isLoadingSettings ? (
                <div className="flex items-center justify-center py-16">
                  <div className="ld-ripple">
                    <div />
                    <div />
                  </div>
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
                    className="w-full btn-sweep font-semibold"
                  >
                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </Card>

            {/* Daily Revenue */}
            <Card className="p-4 md:p-6 bg-white">
              <h2 className="text-lg md:text-2xl font-bold text-slate-900 flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 md:w-6 md:h-6" />
                Daily Revenue
              </h2>
              {!settledBills || settledBills.length === 0 ? (
                <p className="text-slate-500 text-sm">No revenue recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const groups: Record<string, typeof settledBills> = {};
                    for (const bill of settledBills) {
                      const dateKey = new Date(bill.settledAt).toLocaleDateString();
                      if (!groups[dateKey]) groups[dateKey] = [];
                      groups[dateKey].push(bill);
                    }
                    return Object.entries(groups)
                      .sort((a, b) => new Date(b[1][0].settledAt).getTime() - new Date(a[1][0].settledAt).getTime())
                      .map(([date, bills]) => (
                        <div key={date} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0 text-sm">
                          <span className="text-slate-800">{date}</span>
                          <span className="font-semibold text-green-500">
                            ₹{bills.reduce((sum, b) => sum + (b.finalTotal || 0), 0).toFixed(2)}
                          </span>
                        </div>
                      ));
                  })()}
                </div>
              )}
            </Card>

            {/* Settled Bills */}
            <Card className="p-4 md:p-6 bg-white">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg md:text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 md:w-6 md:h-6" />
                  Settled Bills
                </h2>
                {settledBills && settledBills.length > 0 && (
                  <span className="text-sm md:text-lg font-bold text-green-500">
                    Total: ₹{settledBills
                      .filter((bill) => toLocalDateStr(new Date(bill.settledAt)) === selectedDate)
                      .reduce((sum, bill) => sum + (bill.finalTotal || 0), 0)
                      .toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <DateRangePicker
                  value={selectedDate}
                  onChange={setSelectedDate}
                />
              </div>
              <p className="text-xs text-slate-500 mb-4">Bills are automatically deleted after 1 year.</p>
              {(() => {
                if (!settledBills || settledBills.length === 0) {
                  return <p className="text-slate-500 text-sm">No settled bills yet.</p>;
                }
                const filteredBills = settledBills.filter(
                  (bill) => toLocalDateStr(new Date(bill.settledAt)) === selectedDate
                );
                if (filteredBills.length === 0) {
                  return <p className="text-slate-500 text-sm">No bills for this date.</p>;
                }
                const dayTotal = filteredBills.reduce((sum, b) => sum + (b.finalTotal || 0), 0);
                return (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                      <h3 className="text-lg font-semibold text-slate-800">
                        {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      </h3>
                      <span className="text-sm font-bold text-green-500">
                        ₹{dayTotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredBills.map(bill => (
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
                              <span className="text-green-500">₹{bill.finalTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </Card>

            {/* Security */}
            <Card className="p-4 md:p-6 bg-white">
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4 md:mb-6 flex items-center gap-2">
                <Shield className="w-5 h-5 md:w-6 md:h-6" />
                Security
              </h2>

              {cpSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
                  {cpSuccess}
                </div>
              )}
              {cpError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
                  {cpError}
                </div>
              )}

              <div className="space-y-4 mb-6">
                <h3 className="text-sm font-semibold text-slate-800">Change Password</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Current Password</label>
                  <Input
                    type={cpShow ? "text" : "password"}
                    value={cpCurrent}
                    onChange={(e) => setCpCurrent(e.target.value)}
                    placeholder="Current password"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">New Password</label>
                  <Input
                    type={cpShow ? "text" : "password"}
                    value={cpNew}
                    onChange={(e) => setCpNew(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm New Password</label>
                  <Input
                    type={cpShow ? "text" : "password"}
                    value={cpConfirm}
                    onChange={(e) => setCpConfirm(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCpShow(!cpShow)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                  >
                    {cpShow ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {cpShow ? "Hide" : "Show"} passwords
                  </button>
                </div>
                <Button
                  onClick={async () => {
                    setCpError("");
                    setCpSuccess("");
                    if (cpNew.length < 8) { setCpError("Password must be at least 8 characters"); return; }
                    if (cpNew !== cpConfirm) { setCpError("Passwords do not match"); return; }
                    setCpSubmitting(true);
                    try {
                      const session = await supabase.auth.getSession();
                      const email = session.data.session?.user?.email;
                      if (!email) { setCpError("Session error. Please re-login."); setCpSubmitting(false); return; }
                      const { error: reAuthError } = await supabase.auth.signInWithPassword({ email, password: cpCurrent });
                      if (reAuthError) { setCpError("Current password is incorrect"); setCpSubmitting(false); return; }
                      const { error: updateError } = await supabase.auth.updateUser({ password: cpNew });
                      if (updateError) { setCpError(updateError.message); setCpSubmitting(false); return; }
                      setCpCurrent(""); setCpNew(""); setCpConfirm("");
                      setCpSuccess("Password changed successfully!");
                      setTimeout(() => setCpSuccess(""), 4000);
                    } catch { setCpError("Network error. Please try again."); }
                    setCpSubmitting(false);
                  }}
                  disabled={cpSubmitting}
                  className="w-full btn-sweep font-semibold"
                >
                  {cpSubmitting ? "Saving..." : "Save Password"}
                </Button>
              </div>

              <div className="text-center pt-2">
                <button
                  onClick={() => navigate("/forgot-password-otp")}
                  className="text-sm text-blue-500 hover:text-blue-700 hover:underline"
                >
                  Forget Password?
                </button>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <Button
                  onClick={async () => { await logout(); navigate("/login"); }}
                  variant="outline"
                  className="w-full gap-2 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </Button>
              </div>
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
                className="w-full btn-sweep"
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
                className="w-full btn-sweep"
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
              <ImageUpload
                currentImageUrl={editingMenuItem.imageUrl}
                onImageChange={(url) => setEditingMenuItem({ ...editingMenuItem, imageUrl: url })}
              />
              <Button
                onClick={() => {
                  if (editingMenuItem.categoryId && editingMenuItem.name && editingMenuItem.price > 0) {
                    updateMenuItemMutation.mutate(editingMenuItem);
                  } else {
                    toast.error("Please fill all fields");
                  }
                }}
                className="w-full btn-sweep"
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
                className="w-full btn-sweep gap-2"
              >
                {copiedId === -1 ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedId === -1 ? "Copied!" : "Copy URL"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="mt-16">
        <Footer variant="admin" />
      </div>
    </div>
  );
}
