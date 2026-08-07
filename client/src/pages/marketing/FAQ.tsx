import { useState } from "react";
import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const categories = [
  {
    name: "Ordering",
    questions: [
      { q: "How do customers place an order?", a: "They scan the table QR with their phone camera. The menu opens in the browser. They add items, submit, and choose pay at counter or online if configured. The order appears in your kitchen queue." },
      { q: "Can customers modify or cancel after placing?", a: "Before submit, yes. After submit, staff handle changes from the admin / order queue." },
      { q: "What if we're closed?", a: "Turn restaurant status to closed in settings. Guests see a closed screen and cannot place new orders." },
    ],
  },
  {
    name: "Payments",
    questions: [
      { q: "How do guests pay?", a: "Pay at counter is always available. Online payments use your own gateway account configured at go-live. We take no commission." },
      { q: "Can guests pay cash / UPI at the counter?", a: "Yes. Staff settle the table as paid in the Orders tab. You can also show a UPI ID QR from Business Settings." },
    ],
  },
  {
    name: "Getting started",
    questions: [
      { q: "How long to go live?", a: "With the Day-1 wizard, CSV menu import, and bulk QR PDF, most cafés can be ready the same day we install — plus a short staff walkthrough during service." },
      { q: "Can I import my menu?", a: "Yes. Use CSV import on the Menu tab (category, name, price, veg/non-veg, description)." },
      { q: "Do I need to be technical?", a: "For the install package, we handle hosting and keys. Day-to-day: add menu, print QRs, run kitchen queue — no coding." },
    ],
  },
  {
    name: "Printing",
    questions: [
      { q: "Will my LAN thermal printer work if the app is in the cloud?", a: "Yes — run the local print agent on a café PC/tablet on the same Wi‑Fi as the printer. The cloud app queues KOTs/bills; the agent prints them." },
      { q: "Can I print all table QRs at once?", a: "Yes. Tables tab → Download all QR PDF (print sheet)." },
    ],
  },
  {
    name: "Pricing & support",
    questions: [
      { q: "Is there a free SaaS trial?", a: "No self-serve subscription trial. We can pilot a few tables before final payment on an install deal." },
      { q: "Is this multi-location?", a: "No. This product is single-café. Extra outlets are a separate project." },
      { q: "How do I get help?", a: "WhatsApp or email during support hours. Install packages include 90 days go-live support." },
    ],
  },
  {
    name: "Data",
    questions: [
      { q: "Can I export my data?", a: "Yes. From Settings / Help area you can export menu and orders as CSV." },
      { q: "Who owns the data?", a: "You do. It's your café database. Export anytime." },
    ],
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState(categories[0].name);

  const currentCategory = categories.find((c) => c.name === activeCategory) || categories[0];

  return (
    <PageLayout title="FAQ" description="Honest answers about MAMA Cafe QR ordering for Indian cafés.">
      <div className="container py-12 md:py-16 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 text-center">FAQ</h1>
        <p className="text-muted-foreground text-center mb-10">Straight answers — no fake SaaS promises.</p>

        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {categories.map((c) => (
            <button
              key={c.name}
              onClick={() => {
                setActiveCategory(c.name);
                setOpenIndex(null);
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                activeCategory === c.name
                  ? "bg-amber-800 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-muted-foreground hover:bg-slate-200"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {currentCategory.questions.map((faq, i) => (
            <Card key={faq.q} className="overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                <span className="text-sm font-medium text-foreground pr-4">{faq.q}</span>
                <ChevronDown className={cn("w-4 h-4 shrink-0 transition-transform", openIndex === i && "rotate-180")} />
              </button>
              {openIndex === i && (
                <p className="px-4 pb-4 text-sm text-muted-foreground">{faq.a}</p>
              )}
            </Card>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
