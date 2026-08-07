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
  Upload,
  Printer,
  Download,
} from "lucide-react";

const quickGuides = [
  { icon: <SparklesIcon />, color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", title: "Day-1 setup", desc: "Click Setup in the header. Set café name, GST, create tables, import menu CSV, optional printer IP." },
  { icon: <QrCode className="w-5 h-5" />, color: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400", title: "Tables & QR codes", desc: "Create tables, then Download all QR PDF. Print and stick one QR per table." },
  { icon: <Upload className="w-5 h-5" />, color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400", title: "CSV menu import", desc: "Menu tab → CSV template → fill category,name,price,foodType → Import CSV." },
  { icon: <ClipboardList className="w-5 h-5" />, color: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400", title: "Kitchen queue", desc: "Toggle हिंदी/EN in the header. Update status: Received → Preparing → Ready → Served. Print KOT." },
  { icon: <Receipt className="w-5 h-5" />, color: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400", title: "Settling bills", desc: "Orders tab → mark paid → settle. Share invoice on WhatsApp if needed." },
  { icon: <Printer className="w-5 h-5" />, color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", title: "Thermal printing", desc: "Set printer LAN IP in Business Settings. If hosted in cloud, run scripts/print-agent.mjs on a café PC." },
  { icon: <Download className="w-5 h-5" />, color: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400", title: "Export your data", desc: "Settings → General → Export menu CSV or orders CSV anytime." },
  { icon: <Settings className="w-5 h-5" />, color: "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400", title: "Business settings", desc: "GST, logo, UPI ID display, service charge, open/closed status." },
  { icon: <Users className="w-5 h-5" />, color: "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400", title: "Staff accounts", desc: "Staff see Order Queue (+ take order). Admins see everything." },
  { icon: <BarChart3 className="w-5 h-5" />, color: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400", title: "Analytics & EOD", desc: "Analytics tab for trends. EOD Z-Report button for end-of-day totals." },
];

function SparklesIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </svg>
  );
}

const faqs = [
  { q: "How do I add a new menu item?", a: "Menu tab → New Item, or Import CSV for many items at once." },
  { q: "How does a customer place an order?", a: "Scan table QR → browse → cart → pay at counter or online → kitchen sees it in Order Queue." },
  { q: "How do I settle a bill?", a: "Orders tab → find the table → Mark as Paid → Settle Bill." },
  { q: "KOT won't print from cloud hosting?", a: "Expected. Run the local print agent on a café PC (same Wi‑Fi as the printer) with PRINT_AGENT_SECRET matching the server." },
  { q: "How do I switch kitchen UI to Hindi?", a: "Click हिंदी / EN in the top-right of the admin header." },
  { q: "Can I export my data if I leave?", a: "Yes — Settings → Export Menu CSV and Orders CSV." },
  { q: "Can staff see admin features?", a: "No. Staff mainly see the Order Queue. Only admin can manage menu, tables, analytics, settings." },
];

export default function Help() {
  const version = "1.1.0";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="p-6 md:p-8 bg-white dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          Owner handbook
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Dinner-rush checklist: Setup → Menu/CSV → Print QRs → Kitchen tablet on Order Queue → test one order → settle.
        </p>

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
