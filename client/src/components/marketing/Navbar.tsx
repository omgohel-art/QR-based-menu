import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun, Menu, X, QrCode } from "lucide-react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, navigate] = useLocation();
  const { theme, toggleTheme, switchable } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 font-bold text-xl text-foreground">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          MAMA Cafe
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {switchable && toggleTheme && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
          )}
            <Button
              onClick={() => navigate("/pricing")}
              className="hidden md:inline-flex btn-sweep rounded-full px-6"
            >
              Get Started
            </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border/40">
          <div className="container py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                {link.label}
              </Link>
            ))}
            <Button
              onClick={() => { setMobileOpen(false); navigate("/pricing"); }}
              className="w-full btn-sweep rounded-full"
            >
              Get Started
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
