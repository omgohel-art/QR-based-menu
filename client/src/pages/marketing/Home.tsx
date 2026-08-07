import { useLocation } from "wouter";
import PageLayout from "@/components/marketing/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QrCode, Smartphone, BarChart3, UtensilsCrossed, ArrowRight, Check } from "lucide-react";

const benefits = [
  { icon: QrCode, title: "QR table menus", desc: "Unique QR per table. Guests scan and order in the browser — no app download." },
  { icon: Smartphone, title: "Kitchen order queue", desc: "Orders land on a kitchen tablet with status flow: received → preparing → ready → served." },
  { icon: UtensilsCrossed, title: "GST billing & settle", desc: "CGST/SGST, service charge, settle bills, WhatsApp invoice share, EOD report." },
  { icon: BarChart3, title: "Built for one café", desc: "Menu, tables, inventory, loyalty, staff logins — installed and supported for your outlet." },
];

const included = [
  "Unlimited menu items & tables for your café",
  "Pay at counter + online payments (your gateway)",
  "Thermal KOT/bill printing via local print agent",
  "Setup wizard, CSV menu import, bulk QR PDF",
  "Hindi + English staff kitchen UI",
  "90 days go-live support when purchased with install",
];

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <PageLayout
      title="Single-café QR ordering & kitchen system"
      description="MAMA Cafe is a single-outlet QR menu, kitchen queue, and GST billing system for Indian cafés. We install it for you."
    >
      <section className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/20 dark:to-background py-16 md:py-28">
        <div className="max-w-3xl mx-auto text-center px-4">
          <p className="text-sm font-semibold tracking-wide text-amber-800 dark:text-amber-400 mb-4 uppercase">
            For one café · Installed & supported
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight mb-6">
            MAMA Cafe
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-8">
            Guests scan the table QR, order from their phone, and your kitchen sees it live.
            GST settle, inventory, and staff tools included — built for Indian cafés, not enterprise SaaS theatre.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => navigate("/contact")} className="btn-sweep rounded-full px-8 py-6 text-base">
              Talk about go-live
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button onClick={() => navigate("/pricing")} variant="outline" className="btn-sweep rounded-full px-8 py-6 text-base">
              See pricing
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-background py-16 md:py-20">
        <div className="text-center mb-12 px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">What you get</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            One café. Real dinner-rush tools. No fake “500 restaurants” claims.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto px-4">
          {benefits.map((benefit) => (
            <Card key={benefit.title} className="p-6">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                <benefit.icon className="w-5 h-5 text-amber-700 dark:text-amber-400" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground">{benefit.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 dark:bg-slate-900/40 py-16">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-foreground mb-6 text-center">Included with install package</h2>
          <ul className="space-y-3">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="text-center mt-10">
            <Button onClick={() => navigate("/contact")} className="btn-sweep rounded-full px-8 py-6">
              Request a quote
            </Button>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
