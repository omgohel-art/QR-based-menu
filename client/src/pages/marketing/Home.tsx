import { useLocation } from "wouter";
import PageLayout from "@/components/marketing/PageLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QrCode, Smartphone, BarChart3, CreditCard, ArrowRight, Check, Star } from "lucide-react";

const benefits = [
  { icon: QrCode, title: "Digital QR Menus", desc: "Replace printed menus with interactive digital menus. Update instantly." },
  { icon: Smartphone, title: "Mobile Ordering", desc: "Customers order from their phones. No app download needed." },
  { icon: BarChart3, title: "Smart Dashboard", desc: "Track orders, manage menu, and view analytics in real-time." },
  { icon: CreditCard, title: "Direct Payments", desc: "Payments go straight to your account. We take no commission." },
];

const stats = [
  { value: "500+", label: "Restaurants onboarded" },
  { value: "50K+", label: "Monthly orders processed" },
  { value: "99.9%", label: "Platform uptime" },
  { value: "4.8/5", label: "Customer rating" },
];

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <PageLayout title="QR Menu & Restaurant Management Platform" description="MAMA Cafe helps cafes and restaurants create digital QR menus, manage orders, and streamline operations. No app download needed for customers.">
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background py-16 md:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium mb-6">
            <Star className="w-4 h-4" />
            Trusted by 500+ restaurants
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight mb-6">
            Digital menus your customers will love
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-8">
            Replace physical menus with QR-based digital ordering. Customers scan, browse, and order from their phones. You manage everything from a single dashboard.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={() => navigate("/pricing")}
              className="btn-sweep rounded-full px-8 py-6 text-base"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              onClick={() => navigate("/faq")}
              variant="outline"
              className="btn-sweep rounded-full px-8 py-6 text-base"
            >
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-amber-50 dark:bg-amber-950/20 py-12">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl md:text-3xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white dark:bg-background py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">Everything you need to run your restaurant</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            From digital menus to order management, MAMA Cafe provides all the tools to modernize your restaurant operations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {benefits.map((benefit) => (
            <Card key={benefit.title} className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <benefit.icon className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{benefit.title}</h3>
              <p className="text-sm text-muted-foreground">{benefit.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-500 py-16">
        <div className="container text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Ready to digitize your restaurant?</h2>
          <p className="text-blue-100 mb-6 max-w-lg mx-auto">Join 500+ restaurants using MAMA Cafe. Start your free 14-day trial today.</p>
          <Button
            onClick={() => navigate("/pricing")}
            className="btn-sweep rounded-full px-8 py-6 text-base font-semibold"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    </PageLayout>
  );
}
