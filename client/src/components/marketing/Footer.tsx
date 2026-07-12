import { Link } from "wouter";
import { QrCode, Mail, Phone, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface FooterProps {
  variant?: "default" | "admin" | "menu";
}

const footerLinks = {
  Product: [
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/faq", label: "FAQ" },
    { href: "/about", label: "About Us" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/refund", label: "Refund Policy" },
    { href: "/shipping", label: "Shipping Policy" },
  ],
  Support: [
    { href: "/contact", label: "Contact Us" },
    { href: "/faq", label: "FAQ" },
  ],
};

export default function Footer({ variant = "default" }: FooterProps) {
  const isMenu = variant === "menu";
  const isAdmin = variant === "admin";

  return (
    <footer className={cn(
      "border-t",
      isMenu ? "border-menu-border/40 bg-menu-card" :
      isAdmin ? "border-slate-200 bg-white" :
      "border-border/40 bg-muted/30"
    )}>
      <div className="container py-14 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 md:gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            {isMenu ? (
              <div className={cn("flex items-center gap-2.5 font-bold text-xl", "text-menu-primary")}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", "bg-menu-accent")}>
                  <QrCode className="w-5 h-5 text-white" />
                </div>
                MAMA Cafe
              </div>
            ) : (
              <Link href="/" className={cn("flex items-center gap-2.5 font-bold text-xl", "text-foreground")}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", "bg-blue-500")}>
                  <QrCode className="w-5 h-5 text-white" />
                </div>
                MAMA Cafe
              </Link>
            )}
            <p className={cn(
              "text-sm mt-4 max-w-sm",
              isMenu ? "text-menu-muted" : "text-muted-foreground"
            )}>
              The modern QR menu and restaurant management platform helping cafes and restaurants digitize their menus, streamline ordering, and improve customer experience.
            </p>
            <div className={cn(
              "space-y-2.5 text-sm mt-8",
              isMenu ? "text-menu-muted" : "text-muted-foreground"
            )}>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <a href="mailto:omjigneshgohel@gmail.com" className="hover:text-foreground transition-colors">omjigneshgohel@gmail.com</a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>+91 63594 28185</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>Ahmedabad, Gujarat, India</span>
              </div>
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className={cn(
                "font-semibold text-sm mb-5",
                isMenu ? "text-menu-primary" : "text-foreground"
              )}>{title}</h4>
              <ul className="space-y-4">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "text-sm transition-colors",
                        isMenu ? "text-menu-muted hover:text-menu-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className={cn(
        "border-t",
        isMenu ? "border-menu-border/40" :
        isAdmin ? "border-slate-200" :
        "border-border/40"
      )}>
        <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className={cn(
            "text-xs",
            isMenu ? "text-menu-muted" : "text-muted-foreground"
          )}>
            &copy; {new Date().getFullYear()} MAMA Cafe. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className={cn(
              "text-xs transition-colors",
              isMenu ? "text-menu-muted hover:text-menu-primary" : "text-muted-foreground hover:text-foreground"
            )}>Privacy</Link>
            <Link href="/terms" className={cn(
              "text-xs transition-colors",
              isMenu ? "text-menu-muted hover:text-menu-primary" : "text-muted-foreground hover:text-foreground"
            )}>Terms</Link>
            <Link href="/refund" className={cn(
              "text-xs transition-colors",
              isMenu ? "text-menu-muted hover:text-menu-primary" : "text-muted-foreground hover:text-foreground"
            )}>Refunds</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
