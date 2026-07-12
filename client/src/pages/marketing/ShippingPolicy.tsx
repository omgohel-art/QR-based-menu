import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { Truck } from "lucide-react";

export default function ShippingPolicy() {
  return (
    <PageLayout title="Shipping & Delivery Policy" description="MAMA Cafe shipping and delivery policy - we are a SaaS platform, no physical products are shipped.">
      <div className="container py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-blue-500">Legal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Shipping & Delivery Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: July 10, 2026</p>

          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">Digital Service Only</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                MAMA Cafe is a Software-as-a-Service (SaaS) platform. We do not ship any physical products. All services are delivered digitally through our web-based platform.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">Platform Access</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upon successful registration or payment, restaurant owners receive immediate access to their MAMA Cafe dashboard. Access credentials are delivered via email. No waiting period or physical delivery is involved.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">Customer Orders</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                When customers place orders through a restaurant's digital menu, the order is delivered electronically to the restaurant's dashboard. The restaurant is responsible for preparing and serving the food. MAMA Cafe facilitates the digital transmission of orders only.
              </p>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">No Physical Delivery</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                As a digital platform, there are no shipping charges, delivery timelines, or physical handling involved. All features, updates, and services are delivered digitally through the platform.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
