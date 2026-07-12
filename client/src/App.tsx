import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import CustomerMenu from "./pages/CustomerMenu";
import CartPage from "./pages/CartPage";
import AdminPanel from "./pages/AdminPanel";
import Home from "./pages/marketing/Home";
import Features from "./pages/marketing/Features";
import Pricing from "./pages/marketing/Pricing";
import AboutUs from "./pages/marketing/AboutUs";
import ContactUs from "./pages/marketing/ContactUs";
import PrivacyPolicy from "./pages/marketing/PrivacyPolicy";
import TermsConditions from "./pages/marketing/TermsConditions";
import RefundPolicy from "./pages/marketing/RefundPolicy";
import ShippingPolicy from "./pages/marketing/ShippingPolicy";
import FAQ from "./pages/marketing/FAQ";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={AdminPanel} />
      <Route path={"/table/:tableCode/cart"} component={CartPage} />
      <Route path={"/table/:tableCode"} component={CustomerMenu} />
      <Route path={"/features"} component={Features} />
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/about"} component={AboutUs} />
      <Route path={"/contact"} component={ContactUs} />
      <Route path={"/privacy"} component={PrivacyPolicy} />
      <Route path={"/terms"} component={TermsConditions} />
      <Route path={"/refund"} component={RefundPolicy} />
      <Route path={"/shipping"} component={ShippingPolicy} />
      <Route path={"/faq"} component={FAQ} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <CartProvider>
            <Toaster />
            <Router />
          </CartProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
