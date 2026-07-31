import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Search, IndianRupee, ChevronLeft, ChevronRight, Loader2, CalendarIcon, X, User, Phone, Clock, Hash } from "lucide-react";
import { format } from "date-fns";

interface SettledBill {
  id: number;
  sessionId: number;
  tableLabel: string;
  itemsSnapshot: any[];
  editsSnapshot: any[];
  customerName: string | null;
  customerPhone: string | null;
  subtotal: string;
  taxAmount: string;
  serviceCharge: string;
  discountAmount: string;
  discountReason: string | null;
  finalTotal: string;
  settledAt: string | null;
  createdAt: string;
}

function formatCurrency(val: number): string {
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function BillItems({ sessionId, itemsSnapshot, getItemName }: { sessionId: number; itemsSnapshot: any; getItemName: (id: number) => string }) {
  let parsed: any[] = [];
  if (itemsSnapshot) {
    const raw = typeof itemsSnapshot === "string" ? (() => { try { return JSON.parse(itemsSnapshot); } catch { return []; } })() : itemsSnapshot;
    if (Array.isArray(raw)) parsed = raw;
  }

  const { data: fetchedItems, isLoading } = useQuery({
    queryKey: ["billItems", sessionId],
    queryFn: async () => {
      const { data: ordersList } = await supabase.from("orders").select("id").eq("sessionId", sessionId);
      const orderIds = ordersList?.map((o: any) => o.id) || [];
      if (orderIds.length === 0) return [];
      const { data: items } = await supabase.from("orderItems").select("menuItemId,quantity,priceAtOrderTime").in("orderId", orderIds);
      return items || [];
    },
    enabled: parsed.length === 0,
    staleTime: 60_000,
  });

  const items = parsed.length > 0 ? parsed : fetchedItems || [];

  if (isLoading && parsed.length === 0) {
    return <Loader2 className="w-4 h-4 animate-spin text-slate-400" />;
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 italic">No items recorded</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] px-1 py-0">{item.quantity}x</Badge>
            <span className="text-slate-900 dark:text-white">{getItemName(item.menuItemId)}</span>
          </div>
          <span className="font-mono text-slate-600 dark:text-slate-400">
            {formatCurrency((item.priceAtOrderTime || 0) * (item.quantity || 1))}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SettledBillsHistory() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailBill, setDetailBill] = useState<SettledBill | null>(null);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";

  const { data, isLoading } = useQuery<{ items: SettledBill[]; total: number }>({
    queryKey: ["settledBillsHistory", search, page, dateStr],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from("orderHistories")
        .select("*")
        .order("settledAt", { ascending: false });
      if (error) throw error;

      let filtered = items || [];

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((b: any) =>
          (b.tableLabel || "").toLowerCase().includes(q) ||
          (b.customerName || "").toLowerCase().includes(q) ||
          String(b.id).includes(q)
        );
      }

      if (dateStr) {
        filtered = filtered.filter((b: any) => {
          const istDate = new Date(b.settledAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
          const parts = istDate.split("/");
          const formatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
          return formatted === dateStr;
        });
      }

      const total = filtered.length;
      const offset = (page - 1) * 20;
      const paged = filtered.slice(offset, offset + 20);

      return { items: paged, total };
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const totalPages = data ? Math.ceil(data.total / 20) : 1;
  const dayTotal = data?.items?.reduce((sum, bill) => sum + parseFloat(bill.finalTotal?.toString() || "0"), 0) || 0;

  // Fetch menu item names for the detail dialog
  const { data: menuItemsMap } = useQuery<Record<number, string>>({
    queryKey: ["menuItemsMap"],
    queryFn: async () => {
      const { data } = await supabase.from("menuItems").select("id,name");
      if (!data) return {};
      const map: Record<number, string> = {};
      data.forEach((item: any) => { map[item.id] = item.name; });
      return map;
    },
    staleTime: 60_000,
  });

  const getItemName = (menuItemId: number) => menuItemsMap?.[menuItemId] || `Item #${menuItemId}`;

  return (
    <>
      <Card className="p-4 md:p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <IndianRupee className="w-5 h-5 md:w-6 md:h-6" />
            Settled Bills History
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data?.total || 0} bills{dateStr ? ` on ${formatDate(dateStr)}` : ""}
          </p>
        </div>

        {/* Calendar + Search */}
        <div className="flex flex-wrap gap-3 mb-4">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 w-full sm:w-auto justify-start">
                <CalendarIcon className="w-4 h-4" />
                {selectedDate ? format(selectedDate, "dd MMM yyyy") : "Pick a date"}
                {selectedDate && (
                  <X
                    className="w-3.5 h-3.5 ml-1 text-slate-400 hover:text-slate-600"
                    onClick={(e) => { e.stopPropagation(); setSelectedDate(undefined); setPage(1); }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(day) => { setSelectedDate(day); setPage(1); setCalendarOpen(false); }}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button variant="ghost" size="sm" onClick={() => { setSelectedDate(new Date()); setPage(1); }}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); setSelectedDate(d); setPage(1); }}>
            Yesterday
          </Button>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by table, customer, or bill #..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
        </div>

        {/* Day summary */}
        {dateStr && data?.items && data.items.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">
              {data.items.length} bills on {formatDate(dateStr)}
            </span>
            <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
              {formatCurrency(dayTotal)}
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-800">
                <TableHead>Bill</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : !data?.items?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                    {search || dateStr ? "No bills match your filters" : "No settled bills yet"}
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((bill) => (
                  <TableRow
                    key={bill.id}
                    className="border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={() => setDetailBill(bill)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white text-sm">#{bill.id}</p>
                        <p className="text-[10px] text-slate-400">Session {bill.sessionId}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{bill.tableLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      {bill.customerName ? (
                        <div>
                          <p className="text-sm text-slate-900 dark:text-white">{bill.customerName}</p>
                          {bill.customerPhone && <p className="text-[10px] text-slate-400">{bill.customerPhone}</p>}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">Walk-in</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-sm font-semibold text-emerald-600">
                        {formatCurrency(parseFloat(bill.finalTotal?.toString() || "0"))}
                      </span>
                      {parseFloat(bill.discountAmount?.toString() || "0") > 0 && (
                        <p className="text-[10px] text-red-500">
                          -{formatCurrency(parseFloat(bill.discountAmount?.toString() || "0"))} disc
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {bill.settledAt
                          ? new Date(bill.settledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </p>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2 py-3 border-t border-slate-200 dark:border-slate-800 mt-4">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bill Detail Dialog */}
      <Dialog open={detailBill !== null} onOpenChange={(open) => { if (!open) setDetailBill(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          {detailBill && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <IndianRupee className="w-5 h-5 text-emerald-600" />
                  Bill #{detailBill.id}
                </DialogTitle>
                <DialogDescription>
                  {detailBill.tableLabel} &middot; {detailBill.settledAt ? new Date(detailBill.settledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                </DialogDescription>
              </DialogHeader>

              {/* Customer Info */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2">
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Customer Details</h4>
                {detailBill.customerName ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{detailBill.customerName}</span>
                    </div>
                    {detailBill.customerPhone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{detailBill.customerPhone}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">Walk-in customer</p>
                )}
              </div>

              <Separator />

              {/* Items */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Items Ordered</h4>
                <BillItems sessionId={detailBill.sessionId} itemsSnapshot={detailBill.itemsSnapshot} getItemName={getItemName} />
              </div>

              <Separator />

              {/* Pricing Breakdown */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                  <span className="font-mono text-slate-900 dark:text-white">{formatCurrency(parseFloat(detailBill.subtotal?.toString() || "0"))}</span>
                </div>
                {parseFloat(detailBill.serviceCharge?.toString() || "0") > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Service Charge</span>
                    <span className="font-mono text-slate-900 dark:text-white">{formatCurrency(parseFloat(detailBill.serviceCharge?.toString() || "0"))}</span>
                  </div>
                )}
                {parseFloat(detailBill.taxAmount?.toString() || "0") > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Tax (GST)</span>
                    <span className="font-mono text-slate-900 dark:text-white">{formatCurrency(parseFloat(detailBill.taxAmount?.toString() || "0"))}</span>
                  </div>
                )}
                {parseFloat(detailBill.discountAmount?.toString() || "0") > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Discount {detailBill.discountReason ? `(${detailBill.discountReason})` : ""}</span>
                    <span className="font-mono">-{formatCurrency(parseFloat(detailBill.discountAmount?.toString() || "0"))}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span className="text-slate-900 dark:text-white">Total</span>
                  <span className="font-mono text-emerald-600">{formatCurrency(parseFloat(detailBill.finalTotal?.toString() || "0"))}</span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
