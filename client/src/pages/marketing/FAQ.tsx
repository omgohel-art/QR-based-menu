import { useState } from "react";
import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const categories = [
  {
    name: "Ordering",
    questions: [
      { q: "How do customers place an order?", a: "Customers scan the QR code on their table using their phone camera. The digital menu opens in their browser. They select items, add to cart, and place the order. The order appears instantly on the restaurant's admin dashboard." },
      { q: "Can customers modify or cancel their order?", a: "Customers can modify their cart before placing the order. Once placed, modifications must be handled by the restaurant staff through the admin dashboard." },
      { q: "What happens if a customer orders when the restaurant is closed?", a: "You can set operating hours in your dashboard. Orders placed outside these hours will be queued or blocked based on your preference." },
      { q: "Can customers place orders from multiple tables at once?", a: "Each table has a unique QR code linked to that table. Orders are associated with specific tables for easy management." },
    ],
  },
  {
    name: "Payments",
    questions: [
      { q: "How do customers pay for their orders?", a: "Customers pay directly through your integrated payment gateway (e.g., Razorpay). MAMA Cafe does not handle any payment processing." },
      { q: "Does MAMA Cafe charge a commission on transactions?", a: "No. MAMA Cafe does not charge any commission on transactions. Payments go directly to your own payment gateway account." },
      { q: "What payment gateways do you support?", a: "We currently support Razorpay. More payment gateway integrations are coming soon." },
      { q: "Can customers pay with cash?", a: "Yes, you can enable a 'Cash' payment option in your settings. The order will be marked as 'Pay at Table' or 'Cash' accordingly." },
    ],
  },
  {
    name: "Restaurant Onboarding",
    questions: [
      { q: "How do I set up my digital menu?", a: "After registering, go to the admin dashboard → Menu tab. Create categories (e.g., Beverages, Starters) and add items with names, descriptions, prices, and images." },
      { q: "How long does it take to get started?", a: "Most restaurants go live within 30 minutes. Create your menu, generate QR codes for your tables, print and place them." },
      { q: "Can I import my existing menu?", a: "Currently, items must be added manually through the dashboard. Bulk import via CSV/Excel is coming soon." },
      { q: "Do I need technical skills to use MAMA Cafe?", a: "No. MAMA Cafe is designed for non-technical users. The dashboard is intuitive and easy to navigate." },
      { q: "Can I customize the look of my digital menu?", a: "Yes, the Professional and Enterprise plans include branding and theme customization options." },
    ],
  },
  {
    name: "QR Menus",
    questions: [
      { q: "How do QR codes work?", a: "Each table gets a unique QR code. When scanned, it opens your restaurant's digital menu directly in the customer's browser. No app download required." },
      { q: "Can I generate QR codes for specific tables?", a: "Yes, each table has its own unique QR code. You can generate and print QR codes from the admin dashboard." },
      { q: "What if a customer doesn't have a smartphone?", a: "Traditional menus can still be used alongside our digital system. We recommend keeping a few physical menus as backup." },
      { q: "Can I update my menu in real-time?", a: "Yes, any changes you make in the dashboard are reflected instantly. Mark items as unavailable, change prices, or add new items on the fly." },
    ],
  },
  {
    name: "Subscriptions & Billing",
    questions: [
      { q: "Is there a free trial?", a: "Yes, we offer a 14-day free trial on the Professional plan with no credit card required." },
      { q: "Can I cancel my subscription?", a: "Yes, you can cancel anytime from your account settings. Access continues until the end of your billing period." },
      { q: "What happens to my data after cancellation?", a: "Your data is retained for 90 days after cancellation. You can export your data anytime. After 90 days, data is permanently deleted." },
      { q: "Can I switch plans?", a: "Yes, you can upgrade or downgrade your plan anytime. Changes take effect from the next billing cycle." },
    ],
  },
  {
    name: "Customer Support",
    questions: [
      { q: "How do I get help?", a: "You can reach us via email at omjigneshgohel@gmail.com, through the contact form on our website, or use the in-app chat (Professional and Enterprise plans)." },
      { q: "What are your support hours?", a: "Our support team is available Monday to Saturday, 9 AM to 6 PM IST. Enterprise customers get 24/7 priority support." },
      { q: "Do you offer training for my staff?", a: "Yes, we provide onboarding assistance for all plans. Enterprise plans include dedicated training sessions for your entire team." },
      { q: "Is there a knowledge base or documentation?", a: "Yes, we have comprehensive documentation and video tutorials available in your dashboard to help you get the most out of MAMA Cafe." },
    ],
  },
  {
    name: "Data & Privacy",
    questions: [
      { q: "Is my data secure?", a: "Yes, we use industry-standard encryption for data in transit (SSL/TLS) and at rest. Our infrastructure is hosted on secure cloud servers." },
      { q: "Do you share customer data with third parties?", a: "We do not sell or share customer data with third parties except as necessary to provide our services (e.g., payment gateways)." },
      { q: "Can I export my data?", a: "Yes, you can export your menu data, order history, and analytics reports from your dashboard anytime." },
    ],
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState(categories[0].name);

  const currentCategory = categories.find(c => c.name === activeCategory) || categories[0];
  const allQuestions = categories.flatMap(c => c.questions);

  return (
    <PageLayout title="FAQ" description="Frequently asked questions about MAMA Cafe - ordering, payments, onboarding, QR menus, subscriptions, and support.">
      <div className="bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Everything you need to know about MAMA Cafe. Can't find what you're looking for?{" "}
              <a href="/contact" className="text-blue-500 hover:underline">Contact us</a>.
            </p>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat.name
                    ? "bg-blue-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Questions */}
          <div className="space-y-3">
            {currentCategory.questions.map((faq, idx) => {
              const globalIndex = allQuestions.indexOf(faq);
              return (
                <Card
                  key={idx}
                  className={cn(
                    "p-0 transition-shadow cursor-pointer hover:shadow-md",
                    openIndex === globalIndex && "ring-1 ring-blue-500"
                  )}
                  onClick={() => setOpenIndex(openIndex === globalIndex ? null : globalIndex)}
                >
                  <div className="flex items-start gap-3 p-5">
                    <HelpCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground text-sm pr-6">{faq.q}</h3>
                      <div className={cn(
                        "overflow-hidden transition-all",
                        openIndex === globalIndex ? "max-h-96 mt-2" : "max-h-0"
                      )}>
                        <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                      </div>
                    </div>
                    <ChevronDown className={cn(
                      "w-4 h-4 text-muted-foreground mt-1 shrink-0 transition-transform",
                      openIndex === globalIndex && "rotate-180"
                    )} />
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Still have questions */}
          <div className="mt-12 text-center">
            <Card className="p-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <h2 className="font-semibold text-foreground mb-2">Still have questions?</h2>
              <p className="text-sm text-muted-foreground mb-4">
                We're here to help. Reach out to our support team.
              </p>
              <a
                href="/contact"
                className="btn-sweep inline-flex items-center px-6 py-2.5 rounded-full text-sm font-medium"
              >
                Contact Us
              </a>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
