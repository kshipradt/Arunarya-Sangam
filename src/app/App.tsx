import { useEffect, useMemo } from "react";
import { AccountPage, RequireAuth } from "@/features/account/AccountPage";
import { CompleteProfilePage } from "@/features/account/CompleteProfilePage";
import { AdvertisePage } from "@/features/advertise/AdvertisePage";
import { AdminOverview, AdminProducts, AdminSellers, AdminSettings, AdminTicket, AdminTickets, RequireStaff } from "@/features/admin/AdminPages";
import { AuthCallbackPage, CheckEmailPage, ForgotPasswordPage, ResetPasswordPage } from "@/features/auth/EmailFlows";
import { SignInPage } from "@/features/auth/SignInPage";
import { SignUpPage } from "@/features/auth/SignUpPage";
import { HelpPage, NewTicketPage, TicketThread } from "@/features/help/HelpPages";
import { HomePage, NotFoundPage } from "@/features/home/HomePage";
import { LanguageGate } from "@/features/language/LanguageGate";
import { PrivacyPage, TermsPage } from "@/features/legal/LegalPages";
import { ProductFormPage, RequireSeller, SellDashboard, SellerOrdersPage, VerificationPage } from "@/features/sell/SellPages";
import { CartPage } from "@/features/shop/CartPage";
import { CartProvider } from "@/features/shop/CartProvider";
import { CheckoutPage } from "@/features/shop/CheckoutPage";
import { OrderPage, OrdersPage } from "@/features/shop/OrdersPages";
import { ProductPage } from "@/features/shop/ProductPage";
import { ShopPage } from "@/features/shop/ShopPage";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { RouterProvider, Routes, useLocation, type Route } from "@/lib/router";
import { PageSpinner } from "@/ui/controls";
import { Layout } from "./Layout";

const signedIn = (node: React.ReactNode) => <RequireAuth>{node}</RequireAuth>;
const seller = (node: React.ReactNode) => <RequireAuth><RequireSeller>{node}</RequireSeller></RequireAuth>;
const staff = (node: React.ReactNode) => <RequireAuth><RequireStaff>{node}</RequireStaff></RequireAuth>;

function AppRoutes() {
  const routes = useMemo<Route[]>(
    () => [
      { path: "/", render: () => <HomePage /> },
      // shop
      { path: "/shop", render: () => <ShopPage /> },
      { path: "/product/:id", render: ({ id }) => <ProductPage id={id!} /> },
      { path: "/cart", render: () => <CartPage /> },
      { path: "/checkout", render: () => signedIn(<CheckoutPage />) },
      { path: "/orders", render: () => signedIn(<OrdersPage />) },
      { path: "/orders/:id", render: ({ id }) => signedIn(<OrderPage id={id!} />) },
      { path: "/advertise", render: () => <AdvertisePage /> },
      // help
      { path: "/help", render: () => signedIn(<HelpPage />) },
      { path: "/help/new", render: () => signedIn(<NewTicketPage />) },
      { path: "/help/:id", render: ({ id }) => signedIn(<TicketThread id={id!} />) },
      // sellers
      { path: "/sell", render: () => seller(<SellDashboard />) },
      { path: "/sell/verify", render: () => seller(<VerificationPage />) },
      { path: "/sell/products/new", render: () => seller(<ProductFormPage id={null} />) },
      { path: "/sell/products/:id", render: ({ id }) => seller(<ProductFormPage id={id!} />) },
      { path: "/sell/orders", render: () => seller(<SellerOrdersPage />) },
      // ARUNARYA team
      { path: "/admin", render: () => staff(<AdminOverview />) },
      { path: "/admin/sellers", render: () => staff(<AdminSellers />) },
      { path: "/admin/products", render: () => staff(<AdminProducts />) },
      { path: "/admin/tickets", render: () => staff(<AdminTickets />) },
      { path: "/admin/tickets/:id", render: ({ id }) => staff(<AdminTicket id={id!} />) },
      { path: "/admin/settings", render: () => staff(<AdminSettings />) },
      // accounts
      { path: "/auth/sign-in", render: () => <SignInPage /> },
      { path: "/auth/sign-up", render: () => <SignUpPage /> },
      { path: "/auth/check-email", render: () => <CheckEmailPage /> },
      { path: "/auth/forgot-password", render: () => <ForgotPasswordPage /> },
      { path: "/auth/reset-password", render: () => <ResetPasswordPage /> },
      { path: "/auth/callback", render: () => <AuthCallbackPage /> },
      { path: "/account", render: () => signedIn(<AccountPage />) },
      { path: "/account/complete-profile", render: () => <RequireAuth allowIncomplete><CompleteProfilePage /></RequireAuth> },
      { path: "/legal/terms", render: () => <TermsPage /> },
      { path: "/legal/privacy", render: () => <PrivacyPage /> },
    ],
    [],
  );
  return <Routes routes={routes} fallback={<NotFoundPage />} />;
}

/** Shows the language chooser first; email links and legal pages skip it. */
function Shell() {
  const { lang, ready, setLang } = useI18n();
  const { status, profile } = useAuth();
  const { path } = useLocation();
  const bypass = path.startsWith("/auth/callback") || path.startsWith("/legal/");
  const accountLang = profile?.preferred_language ?? null;

  // A signed-in person on a new device gets the language saved in their profile.
  useEffect(() => {
    if (!lang && accountLang) setLang(accountLang);
  }, [lang, accountLang, setLang]);

  if (!lang && !bypass && (status === "loading" || accountLang)) return <PageSpinner />;
  if (!lang && !bypass) return <LanguageGate />;
  if (!ready || status === "loading") return <PageSpinner />;
  return (
    <Layout>
      <AppRoutes />
    </Layout>
  );
}

export function App() {
  return (
    <RouterProvider>
      <I18nProvider>
        <AuthProvider>
          <CartProvider>
            <Shell />
          </CartProvider>
        </AuthProvider>
      </I18nProvider>
    </RouterProvider>
  );
}
