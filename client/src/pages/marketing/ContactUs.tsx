import { useState } from "react";
import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, Clock, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const SUPPORT_EMAIL = "omjigneshgohel@gmail.com";
const SUPPORT_PHONE = "+916359428185";
const SUPPORT_PHONE_DISPLAY = "+91 63594 28185";

export default function ContactUs() {
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = [
      `Name: ${formData.name}`,
      `Email: ${formData.email}`,
      "",
      formData.message,
    ].join("\n");
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(formData.subject || "MAMA Cafe enquiry")}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    toast.success("Opening your email app — send the message from there.");
  };

  const whatsappHref = `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, "")}?text=${encodeURIComponent(
    "Hi, I'm interested in MAMA Cafe go-live for my café."
  )}`;

  return (
    <PageLayout title="Contact Us" description="Contact MAMA Cafe for go-live quotes, support, and café install questions.">
      <div className="container py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Contact Us</h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Reach us on WhatsApp or email. We reply during café support hours — no fake “message sent” forms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Email</h3>
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-muted-foreground mt-1 hover:underline block">
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </Card>

            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Phone / WhatsApp</h3>
                <p className="text-sm text-muted-foreground mt-1">{SUPPORT_PHONE_DISPLAY}</p>
                <p className="text-sm text-muted-foreground">Mon–Sat, 10 AM – 10 PM IST (café hours)</p>
              </div>
            </Card>

            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Based in</h3>
                <p className="text-sm text-muted-foreground mt-1">Ahmedabad, Gujarat, India</p>
                <p className="text-sm text-muted-foreground">Remote install available nationwide</p>
              </div>
            </Card>

            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Support hours</h3>
                <p className="text-sm text-muted-foreground mt-1">Monday – Saturday: 10 AM – 10 PM IST</p>
                <p className="text-sm text-muted-foreground">Sunday: emergency WhatsApp only</p>
              </div>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
            <Button asChild className="rounded-full btn-sweep">
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp us
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("MAMA Cafe go-live quote")}`}>
                <Mail className="w-4 h-4 mr-2" />
                Email a quote request
              </a>
            </Button>
          </div>

          <Card className="p-6 md:p-8">
            <h2 className="text-xl font-semibold text-foreground mb-2">Draft an email</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This opens your email app with the message filled in. Nothing is stored on our servers from this form.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                  <Input
                    placeholder="Your name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Subject</label>
                <Input
                  placeholder="Go-live quote / support"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Message</label>
                <Textarea
                  placeholder="Café name, city, approx tables, and what you need..."
                  rows={5}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" className="btn-sweep rounded-full px-8">
                <Send className="w-4 h-4 mr-2" />
                Open in email app
              </Button>
            </form>
          </Card>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              For quick answers, see the{" "}
              <button onClick={() => navigate("/faq")} className="text-amber-700 hover:underline font-medium">
                FAQ
              </button>
              .
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
