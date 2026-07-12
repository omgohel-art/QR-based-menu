import Navbar from "./Navbar";
import Footer from "./Footer";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export default function PageLayout({ children, title, description }: PageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {title && (
        <Helmet title={title} description={description} />
      )}
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Helmet({ title, description }: { title: string; description?: string }) {
  const fullTitle = `${title} | MAMA Cafe`;
  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
    </>
  );
}
