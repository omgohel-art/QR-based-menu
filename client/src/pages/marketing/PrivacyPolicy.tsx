import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { Shield } from "lucide-react";

const sections = [
  {
    title: "Information We Collect",
    content: "When you register for a MAMA Cafe account, we collect your name, email address, phone number, business name, business address, and payment information. When customers place orders through our platform, we collect their name, order details, and table information. We do not collect sensitive personal information beyond what is necessary to provide our services."
  },
  {
    title: "Restaurant Account Information",
    content: "We collect and store information provided during account registration, including business name, contact details, billing information, menu items, pricing data, and table configurations. This information is used solely to provide and improve our platform services."
  },
  {
    title: "Customer Order Information",
    content: "When customers place orders through a restaurant's digital menu, we collect order details, menu item selections, quantities, special instructions, and table numbers. This information is shared with the respective restaurant to fulfill the order. We do not store customer payment card information."
  },
  {
    title: "Cookies",
    content: "We use essential cookies to maintain your session, remember your preferences, and ensure the platform functions correctly. Analytics cookies help us understand how our platform is used so we can improve it. You can control cookie preferences through your browser settings."
  },
  {
    title: "Analytics",
    content: "We use analytics tools to track platform usage, page views, feature adoption, and performance metrics. This data is aggregated and anonymized where possible. We use this information to improve our platform, fix issues, and understand user behavior patterns."
  },
  {
    title: "Data Security",
    content: "We implement industry-standard security measures including SSL/TLS encryption for all data in transit, encrypted storage for sensitive data, regular security audits, and access controls. Our infrastructure is hosted on secure cloud servers with physical and network security measures in place."
  },
  {
    title: "Third-Party Services",
    content: "We integrate with third-party payment gateways (such as Razorpay) for processing payments. These providers have their own privacy policies governing the use of your payment information. We do not store complete payment card information on our servers."
  },
  {
    title: "User Rights",
    content: "You have the right to access, correct, or delete your account information at any time. You can export your data, update your profile, or request account deletion through your account settings. We will respond to data requests within 30 days."
  },
  {
    title: "Contact Information",
    content: "For privacy-related inquiries, contact us at omjigneshgohel@gmail.com or write to us at: MAMA Cafe, Ahmedabad, Gujarat, India."
  }
];

export default function PrivacyPolicy() {
  return (
    <PageLayout title="Privacy Policy" description="MAMA Cafe privacy policy - how we collect, use, and protect your data.">
      <div className="container py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-blue-500">Legal</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: July 10, 2026</p>

          <p className="text-muted-foreground mb-8">
            At MAMA Cafe, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our QR menu and restaurant management platform.
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
