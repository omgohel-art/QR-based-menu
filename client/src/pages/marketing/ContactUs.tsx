import { useState } from "react";
import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function ContactUs() {
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      toast.success("Message sent! We'll get back to you within 24 hours.");
      setFormData({ name: "", email: "", subject: "", message: "" });
      setSubmitting(false);
    }, 1000);
  };

  return (
    <PageLayout title="Contact Us" description="Get in touch with MAMA Cafe. Contact our support team for help with your QR menu and restaurant management platform.">
      <div className="container py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Contact Us</h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Have a question? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Email</h3>
                <p className="text-sm text-muted-foreground mt-1">omjigneshgohel@gmail.com</p>
              </div>
            </Card>

            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Phone</h3>
                <p className="text-sm text-muted-foreground mt-1">+91 63594 28185</p>
                <p className="text-sm text-muted-foreground">Mon-Sat, 9 AM - 6 PM IST</p>
              </div>
            </Card>

            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Address</h3>
                <p className="text-sm text-muted-foreground mt-1">MAMA Cafe</p>
                <p className="text-sm text-muted-foreground">Ahmedabad, Gujarat</p>
                <p className="text-sm text-muted-foreground">India</p>
              </div>
            </Card>

            <Card className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Business Hours</h3>
                <p className="text-sm text-muted-foreground mt-1">Monday - Saturday: 9 AM - 6 PM IST</p>
                <p className="text-sm text-muted-foreground">Sunday: Closed</p>
              </div>
            </Card>
          </div>

          <Card className="p-6 md:p-8">
            <h2 className="text-xl font-semibold text-foreground mb-6">Send us a message</h2>
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
                  placeholder="How can we help?"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Message</label>
                <Textarea
                  placeholder="Tell us more about your inquiry..."
                  rows={5}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" disabled={submitting} className="btn-sweep rounded-full px-8">
                <Send className="w-4 h-4 mr-2" />
                {submitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </Card>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              For quick answers, check our{" "}
              <button onClick={() => navigate("/faq")} className="text-blue-500 hover:underline font-medium">
                FAQ page
              </button>.
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
