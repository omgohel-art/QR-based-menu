import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import { AuthProvider } from "./contexts/AuthContext";
import CustomerMenu from "./pages/CustomerMenu";
import CartPage from "./pages/CartPage";
import PaymentPage from "./pages/PaymentPage";
import OrderSuccessPage from "./pages/OrderSuccessPage";
import OrderFailedPage from "./pages/OrderFailedPage";
import AdminPanel from "./pages/AdminPanel";
import Login from "./pages/Login";
import ForceChangePassword from "./pages/ForceChangePassword";
import ForgotPassword from "./pages/ForgotPassword";
import ForgotPasswordOTP from "./pages/ForgotPasswordOTP";
import VerifyOTP from "./pages/VerifyOTP";
import SetNewPassword from "./pages/SetNewPassword";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
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
      <Route path={"/login"} component={Login} />
      <Route path={"/force-change-password"} component={ForceChangePassword} />
      <Route path={"/forgot-password"} component={ForgotPassword} />
      <Route path={"/forgot-password-otp"} component={ForgotPasswordOTP} />
      <Route path={"/verify-otp"} component={VerifyOTP} />
      <Route path={"/set-new-password"} component={SetNewPassword} />
      <Route path={"/reset-password"} component={ResetPassword} />
      <Route path={"/"}>
        <ProtectedRoute>
          <AdminPanel />
        </ProtectedRoute>
      </Route>
      <Route path={"/table/:tableCode/cart"} component={CartPage} />
      <Route path={"/table/:tableCode/payment"} component={PaymentPage} />
      <Route path={"/table/:tableCode/payment/success"} component={OrderSuccessPage} />
      <Route path={"/table/:tableCode/payment/failed"} component={OrderFailedPage} />
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <AuthProvider>
            <CartProvider>
              <Toaster />
              <Router />
            </CartProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
