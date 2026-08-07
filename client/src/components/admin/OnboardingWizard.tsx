import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Circle, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";

const DONE_KEY = "mama_onboarding_done";

type StepId = "business" | "gst" | "tables" | "menu" | "printer" | "done";

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
}

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export default function OnboardingWizard({ open, onClose, onNavigateTab }: OnboardingWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<StepId>("business");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstNumber, setGstNumber] = useState("");
  const [gstRate, setGstRate] = useState("5");
  const [tableCount, setTableCount] = useState("8");
  const [printerIp, setPrinterIp] = useState("");

  const { data: settings } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: tables } = useQuery({
    queryKey: ["tables"],
    queryFn: async () => {
      const { data } = await supabase.from("tables").select("id");
      return data || [];
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ["menuItems"],
    queryFn: async () => {
      const { data } = await supabase.from("menuItems").select("id");
      return data || [];
    },
  });

  const checklist = useMemo(() => {
    const hasName = Boolean(settings?.restaurantName && settings.restaurantName !== "My Cafe");
    const hasTables = (tables?.length || 0) > 0;
    const hasMenu = (menuItems?.length || 0) > 0;
    const hasPrinter = Boolean(settings?.printerIp);
    return [
      { id: "business" as const, label: "Café name & phone", done: hasName },
      { id: "gst" as const, label: "GST settings", done: Boolean(settings?.gstNumber) || Boolean(settings?.restaurantName && settings.restaurantName !== "My Cafe") },
      { id: "tables" as const, label: "Create tables", done: hasTables },
      { id: "menu" as const, label: "Add menu (or CSV import)", done: hasMenu },
      { id: "printer" as const, label: "Printer IP (optional)", done: hasPrinter },
    ];
  }, [settings, tables, menuItems]);

  const saveBusiness = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("Settings not ready");
      const restaurantName = (name.trim() || settings?.restaurantName || "").trim();
      if (!restaurantName) throw new Error("Enter café name");
      const { error } = await supabase
        .from("businessSettings")
        .update({
          restaurantName,
          phone: (phone.trim() || settings?.phone || null) as string | null,
          gstEnabled,
          gstNumber: gstNumber.trim() || null,
          gstRate: Number(gstRate) || 5,
          printerIp: printerIp.trim() || settings.printerIp || null,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businessSettings"] });
      toast.success("Business details saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createTables = useMutation({
    mutationFn: async () => {
      const n = Math.min(Math.max(Number(tableCount) || 0, 1), 50);
      const rows = Array.from({ length: n }, (_, i) => ({
        label: `Table ${i + 1}`,
        tableCode: nanoid(10),
        status: "empty",
      }));
      const { error } = await supabase.from("tables").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      toast.success("Tables created — print QRs from Tables tab");
      setStep("menu");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = () => {
    markOnboardingDone();
    toast.success("Setup complete. Print table QRs and train kitchen staff.");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Day-1 café setup</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mb-4">
          {checklist.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              {c.done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300" />
              )}
              <button type="button" className="text-left hover:underline" onClick={() => setStep(c.id)}>
                {c.label}
              </button>
            </div>
          ))}
        </div>

        {step === "business" && (
          <Card className="p-4 space-y-3 border-slate-200">
            <p className="text-sm font-medium">1. Café identity</p>
            <Input
              placeholder="Café name"
              value={name || settings?.restaurantName || ""}
              onChange={(e) => setName(e.target.value)}
            />
            <Input placeholder="Phone" value={phone || settings?.phone || ""} onChange={(e) => setPhone(e.target.value)} />
            <Button
              className="w-full gap-2"
              onClick={() => {
                if (!name && settings?.restaurantName) setName(settings.restaurantName);
                saveBusiness.mutate(undefined, { onSuccess: () => setStep("gst") });
              }}
              disabled={saveBusiness.isPending}
            >
              Save & continue <ArrowRight className="w-4 h-4" />
            </Button>
          </Card>
        )}

        {step === "gst" && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-medium">2. GST</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} />
              Enable GST on bills
            </label>
            {gstEnabled && (
              <>
                <Input placeholder="GSTIN" value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} />
                <Input placeholder="GST rate %" value={gstRate} onChange={(e) => setGstRate(e.target.value)} />
              </>
            )}
            <Button
              className="w-full gap-2"
              onClick={() => saveBusiness.mutate(undefined, { onSuccess: () => setStep("tables") })}
              disabled={saveBusiness.isPending}
            >
              Save & continue <ArrowRight className="w-4 h-4" />
            </Button>
          </Card>
        )}

        {step === "tables" && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-medium">3. Tables</p>
            <p className="text-xs text-muted-foreground">Creates Table 1…N with unique QR codes.</p>
            <Input type="number" min={1} max={50} value={tableCount} onChange={(e) => setTableCount(e.target.value)} />
            <Button className="w-full" onClick={() => createTables.mutate()} disabled={createTables.isPending}>
              Create tables
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep("menu")}>
              Skip — I already have tables
            </Button>
          </Card>
        )}

        {step === "menu" && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-medium">4. Menu</p>
            <p className="text-xs text-muted-foreground">
              Add items in the Menu tab, or use <strong>Import CSV</strong> (category, name, price, foodType, description).
            </p>
            <Button
              className="w-full"
              onClick={() => {
                onNavigateTab("menu");
                onClose();
              }}
            >
              Open Menu tab
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep("printer")}>
              Continue
            </Button>
          </Card>
        )}

        {step === "printer" && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-medium">5. Thermal printer (optional)</p>
            <p className="text-xs text-muted-foreground">
              Enter LAN IP (e.g. 192.168.1.100). If the app is hosted in the cloud, also run{" "}
              <code className="text-[11px]">scripts/print-agent.mjs</code> on a café PC.
            </p>
            <Input
              placeholder="192.168.1.100"
              value={printerIp || settings?.printerIp || ""}
              onChange={(e) => setPrinterIp(e.target.value)}
            />
            <Button
              className="w-full"
              onClick={() => saveBusiness.mutate(undefined, { onSuccess: () => setStep("done") })}
              disabled={saveBusiness.isPending}
            >
              Save printer
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setStep("done")}>
              Skip for now
            </Button>
          </Card>
        )}

        {step === "done" && (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-medium">Ready for service</p>
            <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
              <li>Tables → Download all QR PDF → print & stick on tables</li>
              <li>Open Order Queue on kitchen tablet (Hindi toggle in header)</li>
              <li>Test one order: scan QR → cart → pay at counter → KOT</li>
              <li>Settle bill from Orders tab</li>
            </ol>
            <Button className="w-full" onClick={finish}>
              Finish setup
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onNavigateTab("tables");
                onClose();
              }}
            >
              Go to Tables / QR
            </Button>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
