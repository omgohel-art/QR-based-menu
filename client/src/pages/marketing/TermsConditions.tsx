import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";

const sections = [
  {
    title: "Acceptance of Terms",
    content: "By accessing or using MAMA Cafe, you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, you must not use our platform. Continued use of the platform constitutes acceptance of any changes to these terms."
  },
  {
    title: "Account Registration",
    content: "You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activities under your account. You must notify us immediately of any unauthorized use of your account."
  },
  {
    title: "Restaurant Responsibilities",
    content: "Restaurants are responsible for: (a) ensuring menu items, prices, and descriptions are accurate and up to date; (b) fulfilling all orders received through the platform; (c) complying with all applicable food safety and hygiene regulations; (d) handling customer complaints and food-related issues directly; (e) maintaining their own payment gateway integration."
  },
  {
    title: "Customer Responsibilities",
    content: "Customers are responsible for providing accurate order information and ensuring they have the means to pay for orders. Any disputes regarding food quality, quantity, or delivery must be resolved directly with the restaurant."
  },
  {
    title: "Subscription Terms",
    content: "Subscription plans are billed monthly or annually as selected during registration. Payments are processed through our integrated payment gateway. Subscription fees are non-refundable except as outlined in our Refund Policy. We reserve the right to change pricing with 30 days notice."
  },
  {
    title: "Intellectual Property",
    content: "MAMA Cafe, the MAMA Cafe logo, and all related trademarks are our intellectual property. Restaurants retain ownership of their menu content, images, and branding materials uploaded to the platform. You may not copy, modify, or reverse engineer any part of our platform without written consent."
  },
  {
    title: "Payment Gateway Disclaimer",
    content: "MAMA Cafe facilitates connections between restaurants and payment gateways but does not process or store payment card information directly. All payment transactions are handled by third-party payment gateways. We are not responsible for any issues arising from payment processing, including transaction failures, delays, or chargebacks."
  },
  {
    title: "Platform Limitations",
    content: "We strive to maintain 99.9% uptime but do not guarantee uninterrupted service. We reserve the right to perform maintenance, updates, or modifications that may temporarily affect availability. We are not liable for losses resulting from platform downtime, data loss, or technical issues beyond our reasonable control."
  },
  {
    title: "Account Suspension",
    content: "We may suspend accounts that violate these terms, engage in fraudulent activity, or pose a security risk. Suspended accounts will be notified via email. We will work with you to resolve issues leading to suspension where possible."
  },
  {
    title: "Termination",
    content: "Either party may terminate the agreement with 30 days written notice. Upon termination, your account and data will be permanently deleted within 90 days. We recommend exporting your data before terminating your account."
  },
  {
    title: "Limitation of Liability",
    content: "MAMA Cafe shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform. Our total liability is limited to the amount you have paid us in the 12 months preceding the claim."
  },
  {
    title: "Governing Law",
    content: "These terms are governed by the laws of India. Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka."
  }
];

export default function TermsConditions() {
  return (
    <PageLayout title="Terms & Conditions" description="MAMA Cafe terms and conditions for using our QR menu and restaurant management platform.">
      <div className="container py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-blue-500">Legal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Terms & Conditions</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: July 10, 2026</p>

          <p className="text-muted-foreground mb-8">
            Please read these Terms & Conditions carefully before using the MAMA Cafe platform. By using our services, you agree to be bound by these terms.
          </p>

          <div className="space-y-6">
            {sections.map((section) => (
              <Card key={section.title} className="p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3">{section.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
