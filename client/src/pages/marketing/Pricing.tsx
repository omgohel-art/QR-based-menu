import { useState } from "react";
import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, HelpCircle, QrCode, Smartphone, BarChart3, CreditCard, Shield, Headphones, Users, Zap } from "lucide-react";
import { useLocation } from "wouter";

const plans = [
  {
    name: "Starter",
    description: "Perfect for small cafes and new restaurants getting started with digital menus.",
    price: { monthly: 499, annual: 4999 },
    popular: false,
    features: [
      "Up to 20 menu items",
      "Up to 10 tables",
      "Digital QR menus",
      "Mobile ordering",
      "Order management dashboard",
      "Basic analytics",
      "Email support",
      "Single user access",
    ],
    icon: QrCode,
  },
  {
    name: "Professional",
    description: "Ideal for growing restaurants that need more capacity and advanced features.",
    price: { monthly: 999, annual: 9999 },
    popular: true,
    features: [
      "Unlimited menu items",
      "Unlimited tables",
      "Digital QR menus",
      "Mobile ordering",
      "Advanced order management",
      "Detailed analytics & reports",
      "Priority email & chat support",
      "Up to 5 user accounts",
      "Menu categorization",
      "Table management",
      "Order notifications",
    ],
    icon: Smartphone,
  },
  {
    name: "Enterprise",
    description: "For multi-location chains and large establishments needing full-scale solutions.",
    price: { monthly: 2499, annual: 24999 },
    popular: false,
    features: [
      "Everything in Professional",
      "Multi-location management",
      "Custom branding & themes",
      "Advanced analytics suite",
      "API access & integrations",
      "Dedicated account manager",
      "24/7 priority support",
      "Unlimited user accounts",
      "Custom feature requests",
      "SLA guarantee",
      "White-label option",
    ],
    icon: Zap,
  },
];

const faqs = [
  { q: "Can I switch plans later?", a: "Yes, you can upgrade or downgrade at any time. Changes take effect from the next billing cycle." },
  { q: "Is there a free trial?", a: "Yes, we offer a 14-day free trial on our Professional plan. No credit card required." },
  { q: "What payment methods do you accept?", a: "We accept all major credit cards, debit cards, UPI, and net banking through Razorpay." },
  { q: "Can I cancel anytime?", a: "Yes, you can cancel your subscription anytime. Access continues until the end of your billing period." },
  { q: "Do you charge setup fees?", a: "No, there are no setup fees. All plans include free setup and onboarding support." },
];

export default function Pricing() {
  const [, navigate] = useLocation();
  const [annual, setAnnual] = useState(false);

  return (
    <PageLayout title="Pricing" description="Choose the right MAMA Cafe plan for your restaurant. Starter, Professional, and Enterprise plans available.">
      {/* Header */}
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background py-16 md:py-24 text-center">
        <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4">Simple, transparent pricing</h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
          Choose the plan that fits your restaurant. No hidden fees, no surprises.
        </p>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative w-14 h-7 rounded-full transition-colors ${annual ? "bg-blue-500" : "bg-muted-foreground/30"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${annual ? "translate-x-7" : ""}`} />
          </button>
          <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
            Annual <span className="text-blue-500 font-semibold">(Save 17%)</span>
          </span>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card key={plan.name} className={`p-6 md:p-8 relative flex flex-col ${plan.popular ? "border-blue-500 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500" : ""}`}>
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 hover:bg-blue-600 text-white px-4">
                  Most Popular
                </Badge>
              )}

              <div className="mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-3">
                  <plan.icon className="w-5 h-5 text-blue-500" />
                </div>
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-3xl md:text-4xl font-bold text-foreground">
                  ₹{annual ? plan.price.annual.toLocaleString() : plan.price.monthly}
                </span>
                <span className="text-sm text-muted-foreground ml-1.5">/{annual ? "year" : "month"}</span>
                {annual && (
                  <p className="text-xs text-muted-foreground mt-1">₹{plan.price.monthly}/mo if paid monthly</p>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => navigate("/contact")}
                className={`w-full rounded-full btn-sweep ${plan.popular ? "text-blue-500" : "text-foreground"}`}
              >
                {plan.popular ? "Start Free Trial" : "Get Started"}
              </Button>
            </Card>
          ))}
        </div>

        {/* Note */}
        <p className="text-xs text-muted-foreground mt-6">All prices are in Indian Rupees (INR) and exclude applicable taxes.</p>
      </section>

      {/* FAQ */}
      <section className="bg-amber-50 dark:bg-amber-950/20 py-16">
        <div className="container max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <Card key={i} className="p-5">
                <div className="flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
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
