import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, QrCode, Copy, Check, FileDown, Loader2 } from "lucide-react";
import QRCode from 'qrcode';
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { TableGridSkeleton } from "@/components/Skeletons";

export default function TablesPanel() {
  const queryClient = useQueryClient();
  const [newTableLabel, setNewTableLabel] = useState("");
  const [editingTable, setEditingTable] = useState<{ id: number; label: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'table'; id: number; name: string } | null>(null);
  const [qrTable, setQrTable] = useState<{ tableCode: string; label: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [bulkQrBusy, setBulkQrBusy] = useState(false);

  const { data: tablesData, isLoading: isTablesLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      const { data } = await supabase.from('tables').select('*').order('label');
      return data || [];
    }
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
    onError: (error: Error) => toast.error(error.message),
  });

  const updateTableMutation = useMutation({
    mutationFn: async ({ id, label }: { id: number; label: string }) => {
      const { error } = await supabase.from('tables').update({ label }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, label }) => {
      await queryClient.cancelQueries({ queryKey: ['tables'] });
      const prev = queryClient.getQueryData<any[]>(['tables']);
      queryClient.setQueryData<any[]>(['tables'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, label } : t))
      );
      return { prev };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tables'], ctx.prev);
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
      setEditingTable(null);
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('tables').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tables'] });
      const prev = queryClient.getQueryData<any[]>(['tables']);
      const deletedTable = prev?.find((t) => t.id === id);
      queryClient.setQueryData<any[]>(['tables'], (old) =>
        old?.filter((t) => t.id !== id)
      );
      return { prev, deletedTable };
    },
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['tables'], ctx.prev);
      toast.error(error.message);
    },
    onSuccess: (_data, _vars, ctx) => {
      if (ctx?.deletedTable) {
        toast(`Table "${ctx.deletedTable.label}" deleted`, {
          action: {
            label: "Undo",
            onClick: async () => {
              const { error } = await supabase.from('tables').insert({
                tableCode: ctx.deletedTable.tableCode,
                label: ctx.deletedTable.label,
              });
              if (error) {
                toast.error("Failed to undo deletion");
              } else {
                toast.success(`Table "${ctx.deletedTable.label}" restored`);
              }
              queryClient.invalidateQueries({ queryKey: ['tables'] });
              queryClient.invalidateQueries({ queryKey: ['activeTables'] });
            },
          },
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      queryClient.invalidateQueries({ queryKey: ['activeTables'] });
    },
  });

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

  const handleBulkQrPdf = async () => {
    if (!tablesData?.length) {
      toast.error("Create tables first");
      return;
    }
    setBulkQrBusy(true);
    try {
      const cards: { label: string; dataUrl: string }[] = [];
      for (const table of tablesData) {
        const url = `${window.location.origin}/table/${table.tableCode}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 280,
          margin: 2,
          color: { dark: "#1e293b", light: "#ffffff" },
        });
        cards.push({ label: table.label, dataUrl });
      }

      const w = window.open("", "_blank");
      if (!w) {
        toast.error("Allow pop-ups to print the QR sheet");
        return;
      }
      const html = `<!DOCTYPE html><html><head><title>Table QR Codes</title>
        <style>
          @page { margin: 12mm; }
          body { font-family: system-ui, sans-serif; margin: 0; color: #0f172a; }
          h1 { font-size: 18px; margin: 0 0 16px; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; break-inside: avoid; }
          .card img { width: 140px; height: 140px; }
          .label { font-weight: 700; font-size: 14px; margin-top: 8px; }
          .hint { font-size: 10px; color: #64748b; margin-top: 4px; word-break: break-all; }
          @media print { button { display: none; } }
        </style></head><body>
        <button onclick="window.print()" style="margin-bottom:12px;padding:8px 14px;cursor:pointer">Print / Save as PDF</button>
        <h1>Table QR codes — scan to order</h1>
        <div class="grid">
          ${cards
            .map(
              (c) =>
                `<div class="card"><img src="${c.dataUrl}" alt="${c.label}" /><div class="label">${c.label}</div><div class="hint">Scan to open menu</div></div>`
            )
            .join("")}
        </div>
        <script>setTimeout(() => window.print(), 400);</script>
        </body></html>`;
      w.document.write(html);
      w.document.close();
      toast.success("QR print sheet opened — use Print → Save as PDF");
    } catch {
      toast.error("Failed to generate QR sheet");
    } finally {
      setBulkQrBusy(false);
    }
  };

  return (
    <>
      <TabsContent value="tables" className="space-y-6">
        <Card className="p-4 md:p-6 bg-white dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Tables</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={bulkQrBusy || !tablesData?.length}
                onClick={handleBulkQrPdf}
              >
                {bulkQrBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Download all QR PDF
              </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white font-medium rounded-lg transition-all duration-200">
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
                    className="w-full"
                  >
                    Create
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {isTablesLoading ? (
            <TableGridSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tablesData?.map((table: any) => (
                <Card key={table.id} className="p-3 md:p-5 border border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{table.label}</h3>
                    <span className={`text-xs px-2 py-1 rounded font-mono ${table.status === 'empty' ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400'}`}>
                      {table.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono break-all mb-4 bg-slate-50 dark:bg-slate-800 p-2 rounded">
                    Code: {table.tableCode}
                  </p>

                  <p className="text-xs text-slate-400 dark:text-slate-500 font-mono break-all mb-4 line-clamp-1">
                    {window.location.origin}/table/{table.tableCode}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      onClick={() => handleCopyUrl(table.tableCode, table.id)}
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs gap-1.5"
                    >
                      {copiedId === table.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === table.id ? "Copied" : "Copy URL"}
                    </Button>
                    <Button
                      onClick={() => handleShowQr(table.tableCode, table.label)}
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-xs gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      QR Code
                    </Button>
                    <Button
                      onClick={() => setEditingTable({ id: table.id, label: table.label })}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={() => setConfirmDelete({ type: 'table', id: table.id, name: table.label })}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
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
                className="w-full"
              >
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          {confirmDelete && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Are you sure you want to delete "{confirmDelete.name}"? All associated sessions and orders will remain in the database.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    deleteTableMutation.mutate(confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={qrTable !== null} onOpenChange={(open) => !open && setQrTable(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{qrTable?.label} — QR Code</DialogTitle>
          </DialogHeader>
          {qrTable && (
            <div className="flex flex-col items-center gap-4 py-4">
              {qrDataUrl ? (
                <>
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${qrTable.label}`}
                    width={256}
                    height={256}
                    className="w-64 h-64 rounded-lg border border-slate-200 dark:border-slate-700"
                  />
                  <Button
                    onClick={() => {
                      const link = document.createElement("a");
                      link.download = `QR-${qrTable.label.replace(/\s+/g, "_")}.png`;
                      link.href = qrDataUrl;
                      link.click();
                    }}
                    className="w-full gap-2"
                  >
                    Download
                  </Button>
                </>
              ) : (
                <p className="text-sm text-red-500 py-8">Failed to generate QR code. Please try again.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
