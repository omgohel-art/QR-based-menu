import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Package, AlertTriangle, XCircle, DollarSign, Plus, Search, Filter,
  Edit2, Trash2, ArrowUpDown, History, Download, RefreshCw, Loader2,
  ChevronLeft, ChevronRight, Minus, TrendingUp, TrendingDown, Clock,
} from "lucide-react";

const CATEGORIES = [
  "Coffee Beans", "Tea", "Milk & Dairy", "Bread & Bakery",
  "Vegetables", "Fruits", "Sauces", "Syrups", "Spices",
  "Beverages", "Packaging", "Cleaning Supplies", "Other",
];

const UNITS = ["kg", "g", "L", "ml", "pcs", "bottles", "packets", "boxes"];

const ADJUST_REASONS = ["Purchase", "Waste", "Damage", "Expired", "Correction", "Other"];

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  sku: string | null;
  currentStock: string;
  unit: string;
  minimumStock: string;
  maximumStock: string;
  purchasePrice: string;
  supplier: string | null;
  lastRestockedAt: string | null;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HistoryEntry {
  id: number;
  itemId: number;
  itemName: string;
  quantityChanged: string;
  beforeQuantity: string;
  afterQuantity: string;
  action: string;
  reason: string;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

interface DashboardData {
  totalItems: number;
  lowStock: number;
  outOfStock: number;
  totalValue: number;
  recentItems: Array<{
    id: number;
    name: string;
    category: string;
    currentStock: string;
    unit: string;
    updatedAt: string;
  }>;
}

function getStockStatus(item: InventoryItem): { label: string; color: string; variant: "default" | "secondary" | "destructive" } {
  const stock = parseFloat(item.currentStock || "0");
  const min = parseFloat(item.minimumStock || "0");
  if (stock <= 0) return { label: "Out of Stock", color: "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400", variant: "destructive" };
  if (stock <= min) return { label: "Low Stock", color: "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-400", variant: "secondary" };
  return { label: "In Stock", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400", variant: "default" };
}

function formatCurrency(val: number): string {
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const emptyForm = {
  name: "", category: "Other", sku: "", currentStock: "0", unit: "pcs",
  minimumStock: "0", maximumStock: "0", purchasePrice: "0", supplier: "",
  lastRestockedAt: "", expiryDate: "", notes: "",
};

export default function InventoryPanel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("items");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustAction, setAdjustAction] = useState<"add" | "remove">("add");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("Purchase");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);

  const [historyItemId, setHistoryItemId] = useState<number | undefined>();

  const updateField = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  // Dashboard
  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ["inventory", "dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/inventory/dashboard");
      if (!r.ok) throw new Error("Failed to load dashboard");
      return r.json();
    },
    staleTime: 30_000,
  });

  // Items
  const { data: itemsData, isLoading: itemsLoading } = useQuery<{ items: InventoryItem[]; total: number }>({
    queryKey: ["inventory", "items", search, filterCategory, filterStatus, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCategory) params.set("category", filterCategory);
      if (filterStatus) params.set("status", filterStatus);
      params.set("page", page.toString());
      params.set("limit", "50");
      const r = await fetch(`/api/inventory/items?${params}`);
      if (!r.ok) throw new Error("Failed to load items");
      return r.json();
    },
    staleTime: 15_000,
  });

  // History
  const { data: historyData, isLoading: historyLoading } = useQuery<{ items: HistoryEntry[]; total: number }>({
    queryKey: ["inventory", "history", historyItemId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (historyItemId) params.set("itemId", historyItemId.toString());
      params.set("limit", "100");
      const r = await fetch(`/api/inventory/history?${params}`);
      if (!r.ok) throw new Error("Failed to load history");
      return r.json();
    },
    staleTime: 10_000,
  });

  const totalPages = itemsData ? Math.ceil(itemsData.total / 50) : 1;

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const body = { ...data, currentStock: data.currentStock || "0", minimumStock: data.minimumStock || "0", maximumStock: data.maximumStock || "0", purchasePrice: data.purchasePrice || "0" };
      const url = editingItem ? `/api/inventory/items/${editingItem.id}` : "/api/inventory/items";
      const method = editingItem ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save item");
      }
      return r.json();
    },
    onSuccess: () => {
      toast.success(editingItem ? "Item updated" : "Item created");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setShowAddEdit(false);
      setEditingItem(null);
      setForm(emptyForm);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Adjust stock mutation
  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustItem || !adjustQty) throw new Error("Missing data");
      const r = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: adjustItem.id, action: adjustAction, quantity: adjustQty, reason: adjustReason }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to adjust stock");
      }
      return r.json();
    },
    onSuccess: () => {
      toast.success("Stock adjusted");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setShowAdjust(false);
      setAdjustItem(null);
      setAdjustQty("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/inventory/items/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete item");
      }
      return r.json();
    },
    onSuccess: () => {
      toast.success("Item deleted");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      setShowDeleteConfirm(false);
      setDeletingItem(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openAdd = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setShowAddEdit(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      category: item.category,
      sku: item.sku || "",
      currentStock: item.currentStock,
      unit: item.unit,
      minimumStock: item.minimumStock,
      maximumStock: item.maximumStock,
      purchasePrice: item.purchasePrice,
      supplier: item.supplier || "",
      lastRestockedAt: item.lastRestockedAt ? new Date(item.lastRestockedAt).toISOString().split("T")[0] : "",
      expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split("T")[0] : "",
      notes: item.notes || "",
    });
    setShowAddEdit(true);
  };

  const openAdjust = (item: InventoryItem, action: "add" | "remove") => {
    setAdjustItem(item);
    setAdjustAction(action);
    setAdjustQty("");
    setAdjustReason("Purchase");
    setShowAdjust(true);
  };

  const exportCSV = useCallback(() => {
    if (!itemsData?.items?.length) return;
    const headers = ["Name", "Category", "SKU", "Stock", "Unit", "Min Stock", "Max Stock", "Price", "Supplier", "Status", "Last Restocked", "Expiry"];
    const rows = itemsData.items.map((item) => {
      const status = getStockStatus(item);
      return [item.name, item.category, item.sku || "", item.currentStock, item.unit, item.minimumStock, item.maximumStock, item.purchasePrice, item.supplier || "", status.label, formatDate(item.lastRestockedAt), formatDate(item.expiryDate)];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }, [itemsData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Inventory Management</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track and manage your stock levels</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={openAdd} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>
      </div>

      {/* Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Total Items</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{dashboard.totalItems}</p>
                </div>
                <Package className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Low Stock</p>
                  <p className="text-2xl font-bold text-amber-600">{dashboard.lowStock}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Out of Stock</p>
                  <p className="text-2xl font-bold text-red-600">{dashboard.outOfStock}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Inventory Value</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(dashboard.totalValue)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="items" className="gap-2"><Package className="w-4 h-4" /> Items</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><History className="w-4 h-4" /> History</TabsTrigger>
        </TabsList>

        {/* Items Tab */}
        <TabsContent value="items" className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Search items..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
                <SelectItem value="expiring">Expiring Soon</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Items Table */}
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 dark:border-slate-800">
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsLoading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : !itemsData?.items?.length ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No items found</TableCell></TableRow>
                    ) : (
                      itemsData.items.map((item) => {
                        const status = getStockStatus(item);
                        return (
                          <TableRow key={item.id} className="border-slate-100 dark:border-slate-800">
                            <TableCell>
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                                {item.sku && <p className="text-xs text-slate-400">SKU: {item.sku}</p>}
                              </div>
                            </TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{item.category}</Badge></TableCell>
                            <TableCell className="text-center">
                              <span className="font-mono text-sm">{item.currentStock} {item.unit}</span>
                              {parseFloat(item.minimumStock) > 0 && (
                                <p className="text-[10px] text-slate-400">Min: {item.minimumStock}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={status.variant} className={`text-xs ${status.color}`}>{status.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">₹{parseFloat(item.purchasePrice || "0").toFixed(2)}</TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-400">{item.supplier || "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600" onClick={() => openAdjust(item, "add")} title="Add Stock">
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => openAdjust(item, "remove")} title="Remove Stock">
                                  <Minus className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)} title="Edit">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => { setDeletingItem(item); setShowDeleteConfirm(true); }} title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={historyItemId?.toString() || "all"} onValueChange={(v) => setHistoryItemId(v === "all" ? undefined : parseInt(v))}>
              <SelectTrigger className="w-[240px]"><SelectValue placeholder="Filter by item" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {itemsData?.items?.map((item) => <SelectItem key={item.id} value={item.id.toString()}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 dark:border-slate-800">
                      <TableHead>Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                      <TableHead className="text-center">Changed</TableHead>
                      <TableHead className="text-center">Before</TableHead>
                      <TableHead className="text-center">After</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyLoading ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : !historyData?.items?.length ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No history entries</TableCell></TableRow>
                    ) : (
                      historyData.items.map((entry) => (
                        <TableRow key={entry.id} className="border-slate-100 dark:border-slate-800">
                          <TableCell className="text-sm">{formatDateTime(entry.createdAt)}</TableCell>
                          <TableCell className="font-medium text-sm">{entry.itemName}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={entry.action === "add" ? "default" : "destructive"} className={`gap-1 ${entry.action === "add" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"}`}>
                              {entry.action === "add" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {entry.action === "add" ? "Added" : "Removed"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            <span className={entry.action === "add" ? "text-emerald-600" : "text-red-600"}>
                              {entry.action === "add" ? "+" : "−"}{Math.abs(parseFloat(entry.quantityChanged)).toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm text-slate-500">{parseFloat(entry.beforeQuantity).toFixed(2)}</TableCell>
                          <TableCell className="text-center font-mono text-sm">{parseFloat(entry.afterQuantity).toFixed(2)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{entry.reason}</Badge></TableCell>
                          <TableCell className="text-sm text-slate-500">{entry.userName || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddEdit} onOpenChange={(open) => { if (!open) { setShowAddEdit(false); setEditingItem(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Item Name *</Label>
                <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="e.g. Arabica Coffee Beans" />
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => updateField("category", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => updateField("sku", e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Unit *</Label>
                <Select value={form.unit} onValueChange={(v) => updateField("unit", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Purchase Price (₹)</Label>
                <Input type="number" step="0.01" min="0" value={form.purchasePrice} onChange={(e) => updateField("purchasePrice", e.target.value)} />
              </div>
              <div>
                <Label>Current Stock</Label>
                <Input type="number" step="0.001" min="0" value={form.currentStock} onChange={(e) => updateField("currentStock", e.target.value)} />
              </div>
              <div>
                <Label>Minimum Stock</Label>
                <Input type="number" step="0.001" min="0" value={form.minimumStock} onChange={(e) => updateField("minimumStock", e.target.value)} />
              </div>
              <div>
                <Label>Maximum Stock</Label>
                <Input type="number" step="0.001" min="0" value={form.maximumStock} onChange={(e) => updateField("maximumStock", e.target.value)} />
              </div>
              <div>
                <Label>Supplier</Label>
                <Input value={form.supplier} onChange={(e) => updateField("supplier", e.target.value)} placeholder="Supplier name" />
              </div>
              <div>
                <Label>Last Restocked</Label>
                <Input type="date" value={form.lastRestockedAt} onChange={(e) => updateField("lastRestockedAt", e.target.value)} />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={form.expiryDate} onChange={(e) => updateField("expiryDate", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Optional notes..." rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddEdit(false); setEditingItem(null); }}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={showAdjust} onOpenChange={(open) => { if (!open) setShowAdjust(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {adjustAction === "add" ? <TrendingUp className="w-5 h-5 text-emerald-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
              {adjustAction === "add" ? "Add Stock" : "Remove Stock"}
            </DialogTitle>
          </DialogHeader>
          {adjustItem && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="font-medium text-slate-900 dark:text-white">{adjustItem.name}</p>
                <p className="text-sm text-slate-500">Current: {adjustItem.currentStock} {adjustItem.unit}</p>
              </div>
              <div>
                <Label>{adjustAction === "add" ? "Quantity to Add" : "Quantity to Remove"} *</Label>
                <Input type="number" step="0.001" min="0" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} placeholder="Enter quantity" autoFocus />
              </div>
              <div>
                <Label>Reason *</Label>
                <Select value={adjustReason} onValueChange={setAdjustReason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ADJUST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {adjustQty && parseFloat(adjustQty) > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm">
                  <p>After adjustment: <span className="font-mono font-bold">
                    {adjustAction === "add"
                      ? (parseFloat(adjustItem.currentStock || "0") + parseFloat(adjustQty)).toFixed(2)
                      : Math.max(0, parseFloat(adjustItem.currentStock || "0") - parseFloat(adjustQty)).toFixed(2)
                    } {adjustItem.unit}
                  </span></p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjust(false)}>Cancel</Button>
            <Button onClick={() => adjustMutation.mutate()} disabled={adjustMutation.isPending || !adjustQty || parseFloat(adjustQty) <= 0}
              className={adjustAction === "add" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}>
              {adjustMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete <strong>{deletingItem?.name}</strong>? This will also delete all history entries for this item.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
