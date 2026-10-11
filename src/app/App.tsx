import { useMemo } from "react";
import { AccountPage, RequireAuth } from "@/features/account/AccountPage";
import { CompleteProfilePage } from "@/features/account/CompleteProfilePage";
import { AuthCallbackPage, CheckEmailPage, ForgotPasswordPage, ResetPasswordPage } from "@/features/auth/EmailFlows";
import { SignInPage } from "@/features/auth/SignInPage";
import { SignUpPage } from "@/features/auth/SignUpPage";
import { HomePage, NotFoundPage } from "@/features/home/HomePage";
import { LanguageGate } from "@/features/language/LanguageGate";
import { PrivacyPage, TermsPage } from "@/features/legal/LegalPages";
import { I18nProvider, useI18n } from "@/i18n/I18nProvider";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { RouterProvider, Routes, useLocation, type Route } from "@/lib/router";
import { PageSpinner } from "@/ui/controls";
import { Layout } from "./Layout";

function AppRoutes() {
  const routes = useMemo<Route[]>(
    () => [
      { path: "/", render: () => <HomePage /> },
      { path: "/auth/sign-in", render: () => <SignInPage /> },
      { path: "/auth/sign-up", render: () => <SignUpPage /> },
      { path: "/auth/check-email", render: () => <CheckEmailPage /> },
      { path: "/auth/forgot-password", render: () => <ForgotPasswordPage /> },
      { path: "/auth/reset-password", render: () => <ResetPasswordPage /> },
      { path: "/auth/callback", render: () => <AuthCallbackPage /> },
      { path: "/account", render: () => <RequireAuth><AccountPage /></RequireAuth> },
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
  const { lang, ready } = useI18n();
  const { status } = useAuth();
  const { path } = useLocation();
  const bypass = path.startsWith("/auth/callback") || path.startsWith("/legal/");

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
          <Shell />
        </AuthProvider>
      </I18nProvider>
    </RouterProvider>
  );
}
