import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CartProvider } from "./contexts/CartContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SoundSettingsProvider } from "./contexts/SoundSettingsContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { NetworkStatusProvider } from "./contexts/NetworkStatusContext";
import OfflineBanner from "./components/OfflineBanner";
import NotificationToastQueue from "./components/notifications/NotificationToast";
import Login from "./pages/Login";
import ForceChangePassword from "./pages/ForceChangePassword";
import ForgotPassword from "./pages/ForgotPassword";
import ForgotPasswordOTP from "./pages/ForgotPasswordOTP";
import VerifyOTP from "./pages/VerifyOTP";
import SetNewPassword from "./pages/SetNewPassword";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import RealtimeSubscriptions from "./components/RealtimeSubscriptions";

// Lazy-loaded route components for smaller initial bundle
const CustomerMenu = lazy(() => import("./pages/CustomerMenu"));
const CartPage = lazy(() => import("./pages/CartPage"));
const PaymentPage = lazy(() => import("./pages/PaymentPage"));
const OrderSuccessPage = lazy(() => import("./pages/OrderSuccessPage"));
const OrderTrackingPage = lazy(() => import("./pages/OrderTrackingPage"));
const OrderFailedPage = lazy(() => import("./pages/OrderFailedPage"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Home = lazy(() => import("./pages/marketing/Home"));
const Features = lazy(() => import("./pages/marketing/Features"));
const Pricing = lazy(() => import("./pages/marketing/Pricing"));
const AboutUs = lazy(() => import("./pages/marketing/AboutUs"));
const ContactUs = lazy(() => import("./pages/marketing/ContactUs"));
const PrivacyPolicy = lazy(() => import("./pages/marketing/PrivacyPolicy"));
const TermsConditions = lazy(() => import("./pages/marketing/TermsConditions"));
const RefundPolicy = lazy(() => import("./pages/marketing/RefundPolicy"));
const ShippingPolicy = lazy(() => import("./pages/marketing/ShippingPolicy"));
const FAQ = lazy(() => import("./pages/marketing/FAQ"));

// Analytics drill-down pages
const RevenueAnalytics = lazy(() => import("./pages/analytics/RevenueAnalytics"));
const OrderAnalytics = lazy(() => import("./pages/analytics/OrderAnalytics"));
const TableAnalytics = lazy(() => import("./pages/analytics/TableAnalytics"));
const BillingAnalytics = lazy(() => import("./pages/analytics/BillingAnalytics"));
const RevenueChartAnalytics = lazy(() => import("./pages/analytics/RevenueChartAnalytics"));
const PopularItemsAnalytics = lazy(() => import("./pages/analytics/PopularItemsAnalytics"));
const TableBreakdownAnalytics = lazy(() => import("./pages/analytics/TableBreakdownAnalytics"));

function Router() {
  return (
    <Suspense fallback={null}>
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
      <Route path={"/analytics/revenue"}>
        <ProtectedRoute><RevenueAnalytics /></ProtectedRoute>
      </Route>
      <Route path={"/analytics/orders"}>
        <ProtectedRoute><OrderAnalytics /></ProtectedRoute>
      </Route>
      <Route path={"/analytics/tables"}>
        <ProtectedRoute><TableAnalytics /></ProtectedRoute>
      </Route>
      <Route path={"/analytics/billing"}>
        <ProtectedRoute><BillingAnalytics /></ProtectedRoute>
      </Route>
      <Route path={"/analytics/revenue-chart"}>
        <ProtectedRoute><RevenueChartAnalytics /></ProtectedRoute>
      </Route>
      <Route path={"/analytics/products"}>
        <ProtectedRoute><PopularItemsAnalytics /></ProtectedRoute>
      </Route>
      <Route path={"/analytics/table-breakdown"}>
        <ProtectedRoute><TableBreakdownAnalytics /></ProtectedRoute>
      </Route>
      <Route path={"/table/:tableCode/cart"} component={CartPage} />
      <Route path={"/table/:tableCode/payment"} component={PaymentPage} />
      <Route path={"/table/:tableCode/payment/success"} component={OrderSuccessPage} />
      <Route path={"/table/:tableCode/order/:orderId"} component={OrderTrackingPage} />
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
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <NetworkStatusProvider>
              <NotificationProvider>
                <SoundSettingsProvider>
                  <CartProvider>
                    <OfflineBanner />
                    <RealtimeSubscriptions />
                    <NotificationToastQueue />
                    <Toaster />
                    <Router />
                  </CartProvider>
                </SoundSettingsProvider>
              </NotificationProvider>
            </NetworkStatusProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
