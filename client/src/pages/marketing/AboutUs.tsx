import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { QrCode, Smartphone, BarChart3, CreditCard, Shield, Headphones } from "lucide-react";

const features = [
  {
    icon: QrCode,
    title: "Digital QR Menus",
    description: "Create stunning digital menus with QR codes. Customers scan and browse your menu instantly on their phones."
  },
  {
    icon: Smartphone,
    title: "Mobile Ordering",
    description: "Customers can browse, select, and place orders directly from their smartphones without waiting for staff."
  },
  {
    icon: BarChart3,
    title: "Admin Dashboard",
    description: "Track orders, manage menu items, view analytics, and handle table management from a single dashboard."
  },
  {
    icon: CreditCard,
    title: "Direct Payments",
    description: "Payments go directly to your own payment gateway account. We never hold or delay your funds."
  },
  {
    icon: Shield,
    title: "Secure Platform",
    description: "Enterprise-grade security with encrypted data, secure APIs, and role-based access controls."
  },
  {
    icon: Headphones,
    title: "Dedicated Support",
    description: "Our support team is available to help you with setup, customization, and any questions that arise."
  }
];

export default function AboutUs() {
  return (
    <PageLayout title="About Us" description="About MAMA Cafe - the modern QR menu and restaurant management platform for cafes and restaurants.">
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/20 dark:to-background py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Modernizing the way restaurants serve
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            MAMA Cafe is a comprehensive QR menu and restaurant management platform that helps cafes and restaurants digitize their menus, streamline ordering, improve customer experience, and simplify operations.
          </p>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="bg-amber-50 dark:bg-amber-950/20 py-16 md:py-20">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="p-8">
              <h2 className="text-2xl font-bold text-foreground mb-3">Our Mission</h2>
              <p className="text-muted-foreground leading-relaxed">
                To empower every restaurant and cafe with affordable, easy-to-use digital tools that enhance the dining experience, reduce operational friction, and help businesses grow.
              </p>
            </Card>
            <Card className="p-8">
              <h2 className="text-2xl font-bold text-foreground mb-3">Our Vision</h2>
              <p className="text-muted-foreground leading-relaxed">
                A world where every restaurant, regardless of size, can offer a seamless digital dining experience — from contactless menus to efficient order management.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="container py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">Why Choose MAMA Cafe?</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            We built MAMA Cafe to solve real problems that restaurant owners face every day.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-2">No More Physical Menus</h3>
            <p className="text-sm text-muted-foreground">Eliminate printing costs. Update your menu instantly, add new items, change prices, and mark items as sold out in real-time.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-2">Reduce Staff Workload</h3>
            <p className="text-sm text-muted-foreground">Customers browse and order directly from their phones. Your staff focuses on serving, not taking orders. Fewer errors, faster service.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-2">Direct Revenue</h3>
            <p className="text-sm text-muted-foreground">Payments go directly to your own Razorpay account. No holding period, no commission on transactions. What you earn is yours.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-2">Real-Time Order Management</h3>
            <p className="text-sm text-muted-foreground">Every order appears instantly on your dashboard. Track order status, manage queue, and ensure nothing gets missed.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-2">Insightful Analytics</h3>
            <p className="text-sm text-muted-foreground">Understand what sells best, peak ordering times, and revenue trends. Make data-driven decisions for your menu and operations.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-2">Simple Setup</h3>
            <p className="text-sm text-muted-foreground">Get started in minutes. Create your menu, generate QR codes for your tables, and go live. No technical expertise required.</p>
          </Card>
        </div>
      </section>
    </PageLayout>
  );
}
