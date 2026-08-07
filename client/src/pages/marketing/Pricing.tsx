import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, HelpCircle } from "lucide-react";
import { useLocation } from "wouter";

const packageFeatures = [
  "Single-café install (QR menu + kitchen queue + GST settle)",
  "Unlimited tables & menu items for your outlet",
  "Setup: business profile, GST, tables, QR stickers guidance",
  "CSV menu import & bulk QR print sheet",
  "Local print agent for LAN thermal KOT/bills",
  "Hindi + English kitchen / settle labels",
  "Staff accounts + owner admin",
  "Menu & orders CSV export",
  "90 days WhatsApp support after go-live",
];

const faqs = [
  { q: "Is this a monthly SaaS subscription?", a: "No. This is a one-time install for your café, plus optional monthly hosting/support after the warranty period." },
  { q: "Is there a free trial?", a: "We can run a short pilot on a few tables before final payment. There is no self-serve 14-day SaaS trial." },
  { q: "Does price include multi-location?", a: "No. This package is for one outlet. Multi-location is a separate custom engagement." },
  { q: "What about online payments?", a: "Pay-at-counter works out of the box. Online gateway setup (e.g. Razorpay) is configured during go-live if you already have an account." },
  { q: "What does monthly support cover?", a: "Hosting help, uptime, and bug fixes during café hours. New custom features are quoted separately." },
];

export default function Pricing() {
  const [, navigate] = useLocation();

  return (
    <PageLayout
      title="Pricing"
      description="Honest one-café install pricing for MAMA Cafe QR ordering — not fake SaaS tiers."
    >
      <section className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/20 dark:to-background py-16 md:py-24 text-center px-4">
        <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4">One café. One clear price.</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-12">
          No starter/pro/enterprise theatre. You pay for install + training + 90 days support.
        </p>

        <Card className="p-8 md:p-10 max-w-lg mx-auto text-left border-amber-600/40 ring-1 ring-amber-600/30">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wide mb-2">
            Go-live package
          </p>
          <h2 className="text-2xl font-bold text-foreground mb-1">Café install</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Quoted per café after a short call. Typical range for current product: ₹35,000–₹55,000 all-inclusive.
          </p>
          <div className="mb-6">
            <span className="text-4xl font-bold text-foreground">₹49,999</span>
            <span className="text-sm text-muted-foreground ml-2">indicative go-live</span>
            <p className="text-xs text-muted-foreground mt-2">
              Final quote depends on printer setup, menu size, and on-site vs remote install.
            </p>
          </div>
          <ul className="space-y-3 mb-8">
            {packageFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm">
                <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <span className="text-muted-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground mb-6">
            After 90 days: optional maintenance <strong className="text-foreground">₹1,000–₹1,500/month</strong> (hosting + WhatsApp support).
          </p>
          <Button onClick={() => navigate("/contact")} className="w-full rounded-full btn-sweep">
            Request a quote
          </Button>
        </Card>
        <p className="text-xs text-muted-foreground mt-6">Prices in INR. Taxes extra if applicable.</p>
      </section>

      <section className="bg-slate-50 dark:bg-slate-900/40 py-16 px-4">
        <div className="container max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center mb-8">Pricing FAQ</h2>
          <div className="space-y-4">
            {faqs.map((faq) => (
              <Card key={faq.q} className="p-5">
                <div className="flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{faq.q}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{faq.a}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
