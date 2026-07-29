import { Card } from "@/components/ui/card";
import {
  HelpCircle,
  ChevronRight,
  QrCode,
  ClipboardList,
  Receipt,
  Settings,
  Users,
  BarChart3,
} from "lucide-react";

const quickGuides = [
  { icon: <QrCode className="w-5 h-5" />, color: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400", title: "Tables & QR Codes", desc: "Create tables and generate QR codes for customers to scan and order." },
  { icon: <ClipboardList className="w-5 h-5" />, color: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400", title: "Managing Orders", desc: "View incoming orders, update status (Received → Preparing → Ready → Served)." },
  { icon: <Receipt className="w-5 h-5" />, color: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400", title: "Settling Bills", desc: "Mark as paid, settle the bill, and send invoice emails to customers." },
  { icon: <Settings className="w-5 h-5" />, color: "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400", title: "Business Settings", desc: "Set restaurant name, GST, service charge, logo, and printer config." },
  { icon: <Users className="w-5 h-5" />, color: "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400", title: "Staff Accounts", desc: "Create staff logins with limited access to Order Queue only." },
  { icon: <BarChart3 className="w-5 h-5" />, color: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400", title: "Analytics", desc: "View daily revenue, popular items, and 7-day revenue trends." },
];

const faqs = [
  { q: "How do I add a new menu item?", a: "Go to Menu tab, click New Menu Item, fill in the name, price, category, and optional image. Save to add it to the menu." },
  { q: "How does a customer place an order?", a: "Customer scans the QR code on their table → browses the menu → adds items to cart → submits order. It appears in your Order Queue instantly." },
  { q: "How do I settle a bill?", a: "Go to Orders tab → find the table → click Mark as Paid → then Settle Bill. The table becomes available again." },
  { q: "How do I send an invoice?", a: "After settling, click Send Invoice on the settled bill card, enter the customer's email, and send." },
  { q: "How do I change the restaurant name or logo?", a: "Go to Settings → Business Info. Update the name, upload a logo, and save." },
  { q: "How do I set up GST?", a: "Go to Settings → Business Info → enable GST, set the GST rate. It will auto-calculate on all bills." },
  { q: "How do I connect a thermal printer?", a: "Go to Settings → Business Info → enter the printer IP and port. Use the Print button on settled bills to test." },
  { q: "Can staff see admin-only features?", a: "No. Staff accounts only see the Order Queue. Only admin accounts can access Orders, Tables, Menu, Analytics, and Settings." },
];

export default function Help() {
  const version = "1.0.1";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="p-6 md:p-8 bg-white dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          Quick Guides
        </h2>

        <div className="space-y-3">
          {quickGuides.map((guide) => (
            <div key={guide.title} className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${guide.color}`}>
                {guide.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{guide.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{guide.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950">
          <span className="text-sm text-slate-700 dark:text-slate-300">Version</span>
          <span className="text-sm font-semibold text-slate-900 dark:text-white ml-auto">v{version}</span>
        </div>
      </Card>

      <Card className="p-6 md:p-8 bg-white dark:bg-slate-900">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Frequently Asked Questions</h3>
        <div className="space-y-2">
          {faqs.map((faq) => (
            <details key={faq.q} className="group">
              <summary className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                <span className="text-sm font-medium text-slate-900 dark:text-white">{faq.q}</span>
                <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 group-open:rotate-90 transition-transform" />
              </summary>
              <p className="text-sm text-slate-600 dark:text-slate-400 px-3 pt-2 pb-3">{faq.a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
