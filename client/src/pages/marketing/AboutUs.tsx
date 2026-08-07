import PageLayout from "@/components/marketing/PageLayout";
import { Card } from "@/components/ui/card";

export default function AboutUs() {
  return (
    <PageLayout title="About Us" description="About MAMA Cafe — single-café QR ordering built in India.">
      <section className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/20 dark:to-background py-16 md:py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground mb-6">Built for real café service</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            MAMA Cafe is a single-outlet QR menu, kitchen queue, and GST billing system for Indian cafés.
            We install it with you, train staff, and support dinner rush — not a multi-tenant SaaS with inflated metrics.
          </p>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-foreground mb-3">What we believe</h2>
            <p className="text-muted-foreground leading-relaxed">
              A café owner should not need an IT team. Printing should work on the LAN printer you already own.
              Staff should be able to run the kitchen queue in Hindi. Marketing pages should tell the truth.
            </p>
          </Card>
          <Card className="p-8">
            <h2 className="text-2xl font-bold text-foreground mb-3">Where we’re based</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ahmedabad, Gujarat. Remote go-live available across India. WhatsApp support during café hours.
            </p>
          </Card>
        </div>
      </section>
    </PageLayout>
  );
}
