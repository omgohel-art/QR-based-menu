import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ImageUpload from "@/components/ImageUpload";
import { toast } from "sonner";
import { Building2, Receipt, FileText, Store, Loader2, Printer } from "lucide-react";

const GST_RATES = [5, 12, 18, 28];

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function validateGST(gst: string) {
  return GST_REGEX.test(gst.toUpperCase());
}

function formatGstRate(rate: number) {
  const half = rate / 2;
  return { cgst: half, sgst: half };
}

type BusinessData = {
  id: number;
  restaurantName: string;
  legalBusinessName: string;
  gstNumber: string;
  fssaiNumber: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  logoUrl: string | null;
  gstEnabled: boolean;
  gstRate: number;
  invoicePrefix: string;
  footerMessage: string;
  printerIp: string;
  printerPort: number;
  tagline: string;
  brandDescription: string;
  sinceYear: number | null;
  averageRating: number | null;
};

export default function BusinessSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businessSettings")
        .select("*")
        .limit(1)
        .single();
      if (error && error.code === "PGRST116") return null;
      if (error) throw error;
      return data as BusinessData | null;
    },
  });

  const [form, setForm] = useState({
    restaurantName: "",
    legalBusinessName: "",
    gstNumber: "",
    fssaiNumber: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    logoUrl: null as string | null,
    gstEnabled: false,
    gstRate: 18,
    invoicePrefix: "INV-",
    footerMessage: "",
    printerIp: "",
    printerPort: 9100,
    tagline: "",
    brandDescription: "",
    sinceYear: "" as string | number,
    averageRating: "" as string | number,
  });

  const [gstError, setGstError] = useState("");

  useEffect(() => {
    if (settings) {
      setForm({
        restaurantName: settings.restaurantName || "",
        legalBusinessName: settings.legalBusinessName || "",
        gstNumber: settings.gstNumber || "",
        fssaiNumber: settings.fssaiNumber || "",
        phone: settings.phone || "",
        email: settings.email || "",
        address: settings.address || "",
        city: settings.city || "",
        state: settings.state || "",
        pincode: settings.pincode || "",
        logoUrl: settings.logoUrl || null,
        gstEnabled: settings.gstEnabled ?? false,
        gstRate: settings.gstRate || 18,
        invoicePrefix: settings.invoicePrefix || "INV-",
        footerMessage: settings.footerMessage || "",
        printerIp: settings.printerIp || "",
        printerPort: settings.printerPort || 9100,
        tagline: settings.tagline || "",
        brandDescription: settings.brandDescription || "",
        sinceYear: settings.sinceYear || "",
        averageRating: settings.averageRating || "",
      });
    }
  }, [settings]);

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "gstNumber") setGstError("");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedGst = form.gstNumber.trim();
      if (trimmedGst && !validateGST(trimmedGst)) {
        setGstError("Invalid GST Number Format");
        throw new Error("Invalid GST Number Format");
      }
      const payload = {
        restaurantName: form.restaurantName.trim(),
        legalBusinessName: form.legalBusinessName.trim(),
        gstNumber: trimmedGst,
        fssaiNumber: form.fssaiNumber.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        logoUrl: form.logoUrl,
        gstEnabled: form.gstEnabled,
        gstRate: form.gstRate,
        invoicePrefix: form.invoicePrefix.trim() || "INV-",
        footerMessage: form.footerMessage.trim(),
        printerIp: form.printerIp.trim(),
        printerPort: form.printerPort || 9100,
        tagline: form.tagline.trim(),
        brandDescription: form.brandDescription.trim(),
        sinceYear: form.sinceYear ? Number(form.sinceYear) : null,
        averageRating: form.averageRating ? Number(form.averageRating) : null,
        updatedAt: new Date().toISOString(),
      };
      if (!payload.restaurantName) throw new Error("Restaurant Name is required");
      if (!payload.legalBusinessName) throw new Error("Legal Business Name is required");
      if (!payload.phone) throw new Error("Phone number is required");
      if (!payload.email) throw new Error("Email is required");
      if (!payload.address) throw new Error("Business Address is required");
      if (!payload.city) throw new Error("City is required");
      if (!payload.state) throw new Error("State is required");
      if (!payload.pincode) throw new Error("Pincode is required");

      if (settings?.id) {
        const { error } = await supabase
          .from("businessSettings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("businessSettings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["businessSettings"] });
      queryClient.invalidateQueries({ queryKey: ["brandIntro"] });
      toast.success("Business Information Updated Successfully");
    },
    onError: (err: Error) => {
      if (err.message !== "Invalid GST Number Format") {
        toast.error(err.message || "Failed to save");
      }
    },
  });

  const { cgst, sgst } = formatGstRate(form.gstRate);

  const previewData = {
    ...form,
    cgst,
    sgst,
    invoiceNumber: `${form.invoicePrefix || "INV-"}000001`,
    date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
    tableNumber: "T01",
    items: [
      { name: "Item 1", qty: 2, price: 150 },
      { name: "Item 2", qty: 1, price: 200 },
    ],
  };

  const subtotal = previewData.items.reduce((s, i) => s + i.qty * i.price, 0);
  const gstAmount = form.gstEnabled ? subtotal * (form.gstRate / 100) : 0;
  const cgstAmount = gstAmount / 2;
  const sgstAmount = gstAmount / 2;
  const grandTotal = subtotal + gstAmount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 md:p-6 bg-white">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Store className="w-5 h-5 md:w-6 md:h-6" />
          Business Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Restaurant Name *</Label>
            <Input value={form.restaurantName} onChange={(e) => updateField("restaurantName", e.target.value)} placeholder="MAMA Cafe" />
          </div>
          <div className="space-y-2">
            <Label>Legal Business Name *</Label>
            <Input value={form.legalBusinessName} onChange={(e) => updateField("legalBusinessName", e.target.value)} placeholder="MAMA Cafe Pvt. Ltd." />
          </div>
          <div className="space-y-2">
            <Label>GST Number *</Label>
            <Input value={form.gstNumber} onChange={(e) => updateField("gstNumber", e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" maxLength={15} className={gstError ? "border-red-500" : ""} />
            {gstError && <p className="text-xs text-red-500">{gstError}</p>}
          </div>
          <div className="space-y-2">
            <Label>FSSAI License Number</Label>
            <Input value={form.fssaiNumber} onChange={(e) => updateField("fssaiNumber", e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label>Phone Number *</Label>
            <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div className="space-y-2">
            <Label>Email Address *</Label>
            <Input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="contact@mamacafe.com" />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Business Address *</Label>
            <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} placeholder="123, Main Street" />
          </div>
          <div className="space-y-2">
            <Label>City *</Label>
            <Input value={form.city} onChange={(e) => updateField("city", e.target.value)} placeholder="Ahmedabad" />
          </div>
          <div className="space-y-2">
            <Label>State *</Label>
            <Input value={form.state} onChange={(e) => updateField("state", e.target.value)} placeholder="Gujarat" />
          </div>
          <div className="space-y-2">
            <Label>Pincode *</Label>
            <Input value={form.pincode} onChange={(e) => updateField("pincode", e.target.value)} placeholder="380001" />
          </div>
          <div className="space-y-2">
            <Label>Restaurant Logo</Label>
            <ImageUpload currentImageUrl={form.logoUrl} onImageChange={(url) => updateField("logoUrl", url)} />
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-white">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Store className="w-5 h-5 md:w-6 md:h-6" />
          Brand Introduction
        </h2>
        <p className="text-sm text-slate-500 mb-4">These fields appear on the customer menu to introduce your restaurant.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-2">
            <Label>Tagline</Label>
            <Input value={form.tagline} onChange={(e) => updateField("tagline", e.target.value)} placeholder="Crafted with Passion. Served with Love." />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Short Description</Label>
            <Textarea value={form.brandDescription} onChange={(e) => updateField("brandDescription", e.target.value)} placeholder="Fresh ingredients, handcrafted recipes and memorable dining experiences every single day." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Serving Since (Year)</Label>
            <Input type="number" value={form.sinceYear} onChange={(e) => updateField("sinceYear", e.target.value ? Number(e.target.value) : "")} placeholder="2016" min={1900} max={new Date().getFullYear()} />
          </div>
          <div className="space-y-2">
            <Label>Average Rating</Label>
            <Input type="number" value={form.averageRating} onChange={(e) => updateField("averageRating", e.target.value ? Number(e.target.value) : "")} placeholder="4.8" min={1} max={5} step={0.1} />
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-white">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Building2 className="w-5 h-5 md:w-6 md:h-6" />
          Billing Settings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
            <div>
              <Label className="text-base font-medium">GST Enabled</Label>
              <p className="text-sm text-slate-500 mt-0.5">{form.gstEnabled ? "GST will be added to invoices" : "No GST on invoices"}</p>
            </div>
            <button
              type="button"
              onClick={() => updateField("gstEnabled", !form.gstEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.gstEnabled ? "bg-green-500" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.gstEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
          <div className="space-y-2">
            <Label>GST Rate</Label>
            <select
              value={form.gstRate}
              onChange={(e) => updateField("gstRate", Number(e.target.value))}
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
            >
              {GST_RATES.map((rate) => (
                <option key={rate} value={rate}>{rate}%</option>
              ))}
            </select>
            {form.gstEnabled && (
              <p className="text-xs text-slate-500">
                CGST: {cgst}% &middot; SGST: {sgst}%
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-white">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <FileText className="w-5 h-5 md:w-6 md:h-6" />
          Invoice Settings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Invoice Prefix</Label>
            <Input value={form.invoicePrefix} onChange={(e) => updateField("invoicePrefix", e.target.value)} placeholder="INV-" />
            <p className="text-xs text-slate-500">Preview: {form.invoicePrefix || "INV-"}000001</p>
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Footer Message</Label>
            <Textarea
              value={form.footerMessage}
              onChange={(e) => updateField("footerMessage", e.target.value)}
              placeholder="Thank you for visiting!&#10;Visit Again!"
              rows={3}
            />
          </div>
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 md:w-5 md:h-5" />
            Invoice Preview
          </h2>
        </div>
        <div className="border border-slate-200 rounded-lg p-6 bg-white max-w-md mx-auto text-sm">
          <div className="text-center border-b border-slate-200 pb-4 mb-4">
            {form.logoUrl && (
              <img src={form.logoUrl} alt="Logo" className="h-14 mx-auto mb-2 object-contain" />
            )}
            <h3 className="text-lg font-bold text-slate-900">{form.restaurantName || "Restaurant Name"}</h3>
            <p className="text-slate-500 text-xs mt-0.5">{form.address || "Address"}</p>
            <p className="text-slate-500 text-xs">{form.city}{form.city && form.state ? ", " : ""}{form.state}</p>
            <p className="text-slate-500 text-xs">{form.phone}</p>
          </div>

          <div className="flex justify-between text-xs text-slate-600 mb-3">
            <span><strong>Invoice:</strong> {previewData.invoiceNumber}</span>
            <span><strong>Date:</strong> {previewData.date}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600 mb-4">
            <span><strong>Time:</strong> {previewData.time}</span>
            <span><strong>Table:</strong> {previewData.tableNumber}</span>
          </div>

          <table className="w-full text-xs mb-3">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1.5 font-semibold text-slate-700">Item</th>
                <th className="text-center py-1.5 font-semibold text-slate-700">Qty</th>
                <th className="text-right py-1.5 font-semibold text-slate-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {previewData.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-700">{item.name}</td>
                  <td className="py-1.5 text-center text-slate-700">{item.qty}</td>
                  <td className="py-1.5 text-right text-slate-700">₹{(item.qty * item.price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-slate-200 pt-3 space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            {form.gstEnabled && (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST ({cgst}%)</span>
                  <span>₹{cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST ({sgst}%)</span>
                  <span>₹{sgstAmount.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200">
              <span>Grand Total</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {form.footerMessage && (
            <div className="mt-4 pt-3 border-t border-slate-200 text-center">
              <p className="text-xs text-slate-500 whitespace-pre-line">{form.footerMessage}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 md:p-6 bg-white">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Printer className="w-5 h-5 md:w-6 md:h-6" />
          Thermal Printer
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Printer IP Address</Label>
            <Input value={form.printerIp} onChange={(e) => updateField("printerIp", e.target.value)} placeholder="192.168.1.100" />
            <p className="text-xs text-slate-500">Find this on the printer's network config page</p>
          </div>
          <div className="space-y-2">
            <Label>Printer Port</Label>
            <Input type="number" value={form.printerPort} onChange={(e) => updateField("printerPort", Number(e.target.value) || 9100)} placeholder="9100" />
            <p className="text-xs text-slate-500">Default: 9100</p>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full md:w-auto btn-sweep font-semibold"
        >
          {saveMutation.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </span>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
