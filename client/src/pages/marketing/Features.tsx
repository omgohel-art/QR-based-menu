import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { QrCode, Smartphone, BarChart3, CreditCard, Shield, Headphones, Users, Zap, RefreshCw, Bell, Layout, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const features = [
  {
    icon: QrCode,
    title: "QR Menu Generator",
    description: "Unique QR per table. Guests scan with the phone camera and open your menu in the browser — no app download.",
  },
  {
    icon: Smartphone,
    title: "Mobile-Optimized Menu",
    description: "Categories, images, veg badges, variants, search. Built for phones first.",
  },
  {
    icon: Zap,
    title: "Kitchen Order Queue",
    description: "Orders appear live with sound alerts. Status flow: received → preparing → ready → served. Hindi labels for staff.",
  },
  {
    icon: Layout,
    title: "Admin Dashboard",
    description: "Orders, settle, tables, menu, inventory, loyalty, analytics, and settings in one place.",
  },
  {
    icon: BarChart3,
    title: "Analytics & EOD",
    description: "Revenue, popular items, table breakdown, and end-of-day style reporting.",
  },
  {
    icon: CreditCard,
    title: "Pay at counter + online",
    description: "Counter settlement always works. Connect your own payment gateway at go-live — we take no commission.",
  },
  {
    icon: Printer,
    title: "Local thermal printing",
    description: "KOT and bill printing via a small print agent on a café PC so LAN printers work even when the app is hosted in the cloud.",
  },
  {
    icon: Bell,
    title: "Service requests",
    description: "Call waiter / water / bill / clean from the guest phone — alerts staff in real time.",
  },
  {
    icon: RefreshCw,
    title: "Instant menu updates",
    description: "Change prices, mark sold out, CSV import — updates show on guest phones immediately.",
  },
  {
    icon: Users,
    title: "Staff vs admin",
    description: "Kitchen staff see the order queue. Owners get full admin, GST, inventory, and exports.",
  },
  {
    icon: Shield,
    title: "GST-ready billing",
    description: "CGST/SGST display, GSTIN, FSSAI field, invoice share via WhatsApp/email.",
  },
  {
    icon: Headphones,
    title: "Go-live support",
    description: "Install package includes setup and 90 days WhatsApp support during café hours — not a faceless SaaS ticket queue.",
  },
];

export default function Features() {
  const [, navigate] = useLocation();

  return (
    <PageLayout title="Features" description="MAMA Cafe features for a single Indian café: QR menus, kitchen queue, GST billing, local printing, and staff tools.">
      <section className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/20 dark:to-background py-16 md:py-24 px-4">
        <div className="text-center mb-4">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4">Built for one busy café</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Everything listed here works for a single outlet today. Multi-location is not included.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12 max-w-6xl mx-auto">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5 text-amber-700" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 dark:bg-slate-900/40 py-16 text-center px-4">
        <div className="container">
          <h2 className="text-2xl font-bold text-foreground mb-4">Ready for go-live?</h2>
          <p className="text-muted-foreground mb-6">Ask for an install quote — we set it up with you.</p>
          <Button onClick={() => navigate("/pricing")} className="btn-sweep rounded-full px-8 py-6">
            View pricing <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    </PageLayout>
  );
}
