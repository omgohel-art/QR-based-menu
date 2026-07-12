import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { QrCode, Smartphone, BarChart3, CreditCard, Shield, Headphones, Users, Zap, RefreshCw, Bell, Layout, Globe } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const features = [
  {
    icon: QrCode,
    title: "QR Menu Generator",
    description: "Generate unique QR codes for each table. Customers scan with their phone camera and instantly access your digital menu. No app download required."
  },
  {
    icon: Smartphone,
    title: "Mobile-Optimized Menu",
    description: "Beautiful, responsive digital menus that look great on any device. Organize items by category, add descriptions, prices, and images."
  },
  {
    icon: Zap,
    title: "Real-Time Ordering",
    description: "Orders appear instantly on your dashboard as customers place them. Receive sound notifications so you never miss an order."
  },
  {
    icon: Layout,
    title: "Admin Dashboard",
    description: "Comprehensive dashboard to manage orders, menu items, categories, tables, and settings. Track order status and manage your entire operation."
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    description: "Understand your best-selling items, peak hours, revenue trends, and customer preferences. Make data-driven decisions for your menu."
  },
  {
    icon: CreditCard,
    title: "Direct Payment Gateway",
    description: "Connect your own Razorpay account. Payments go directly to you. We take zero commission on transactions."
  },
  {
    icon: Bell,
    title: "Order Notifications",
    description: "Real-time audio and visual notifications for new orders. Never miss an order with desktop and mobile alerts."
  },
  {
    icon: RefreshCw,
    title: "Instant Menu Updates",
    description: "Update prices, mark items as sold out, add new items, or change descriptions in real-time. Changes reflect immediately."
  },
  {
    icon: Users,
    title: "Multi-Table Management",
    description: "Manage unlimited tables. Each table has its own QR code and order history. Track which table ordered what, when."
  },
  {
    icon: Globe,
    title: "Multi-Location Support",
    description: "Manage multiple restaurant locations from a single account. Enterprise plan supports unlimited locations."
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description: "Enterprise-grade security with encrypted data transmission, secure authentication, and 99.9% platform uptime guarantee."
  },
  {
    icon: Headphones,
    title: "Dedicated Support",
    description: "Our team helps you with setup, customization, and troubleshooting. Professional and Enterprise plans include priority support."
  },
];

export default function Features() {
  const [, navigate] = useLocation();

  return (
    <PageLayout title="Features" description="Explore MAMA Cafe features - QR menus, mobile ordering, admin dashboard, analytics, direct payments, and more.">
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background py-16 md:py-24">
        <div className="text-center mb-4">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-4">All features, no fluff</h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Everything you need to digitize your restaurant operations and provide a seamless dining experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-amber-50 dark:bg-amber-950/20 py-16 text-center">
        <div className="container">
          <h2 className="text-2xl font-bold text-foreground mb-4">Ready to get started?</h2>
          <p className="text-muted-foreground mb-6">Join 500+ restaurants using MAMA Cafe.</p>
          <Button onClick={() => navigate("/pricing")} className="btn-sweep rounded-full px-8 py-6">
            View Pricing <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    </PageLayout>
  );
}
