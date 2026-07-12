import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";

export default function RefundPolicy() {
  return (
    <PageLayout title="Refund & Cancellation Policy" description="MAMA Cafe refund and cancellation policy for subscriptions.">
      <div className="container py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-blue-500">Legal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Refund & Cancellation Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: July 10, 2026</p>

          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">Subscription Refunds</h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>Refunds for MAMA Cafe platform subscriptions are handled as follows:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li><strong>Monthly Plans:</strong> No refunds for partial months. You may cancel at any time, and access will continue until the end of the current billing period.</li>
                  <li><strong>Annual Plans:</strong> Full refund within 14 days of purchase if the platform has not been used extensively. After 14 days, refunds are prorated for the remaining months.</li>
                  <li><strong>Trial Period:</strong> If you are on a free trial, you may cancel at any time without charge.</li>
                </ul>
                <p>All refund requests must be submitted via email to <a href="mailto:omjigneshgohel@gmail.com" className="text-blue-500 hover:underline">omjigneshgohel@gmail.com</a> and will be processed within 7-10 business days.</p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">Restaurant Food Refunds</h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>MAMA Cafe is a Software-as-a-Service (SaaS) platform. We do not prepare, sell, or deliver food.</p>
                <p>All food-related issues — including quality, quantity, incorrect items, or delivery problems — are the sole responsibility of the restaurant that prepared and served the order.</p>
                <p>If you have a complaint about food or service, please contact the restaurant directly. Restaurants have access to your order details through their MAMA Cafe dashboard and can process refunds or replacements at their discretion.</p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">Subscription Cancellation</h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <p>You may cancel your subscription at any time through your account settings or by contacting our support team.</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Cancellation takes effect at the end of the current billing period.</li>
                  <li>You will retain access to all features until the billing period ends.</li>
                  <li>No further charges will be made after cancellation.</li>
                  <li>Your data will be retained for 90 days after cancellation, after which it will be permanently deleted.</li>
                </ul>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3">Billing Policy</h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <ul className="list-disc pl-5 space-y-2">
                  <li>Billing occurs on the same day each month (or year for annual plans).</li>
                  <li>If payment fails, we will retry up to 3 times over 7 days.</li>
                  <li>Accounts with failed payments may be suspended until payment is resolved.</li>
                  <li>All prices are in Indian Rupees (INR) and are exclusive of applicable taxes.</li>
                </ul>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
