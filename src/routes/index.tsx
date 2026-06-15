import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { JSX } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { ROLE_ACCESS, ROLE_HOME, normalizeRole, type RouteKey } from '@/config/roles';
import { AppLayout } from '@/components/layout/AppLayout';
import LandingPage from '@/pages/landing/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
import ExecutiveDashboardPage from '@/pages/executive/ExecutiveDashboardPage';
import CustomerPortalPage from '@/pages/portal/CustomerPortalPage';
import DashboardPage from '@/pages/dashboard/DashboardPage';
import CustomersPage from '@/pages/customers/CustomersPage';
import CustomerDetailPage from '@/pages/customers/CustomerDetailPage';
import ContractsPage from '@/pages/contracts/ContractsPage';
import ContractDetailPage from '@/pages/contracts/ContractDetailPage';
import ContainersPage from '@/pages/containers/ContainersPage';
import InvoicesPage from '@/pages/invoices/InvoicesPage';
import PaymentsPage from '@/pages/payments/PaymentsPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import PartnersPage from '@/pages/partners/PartnersPage';
import NotFoundPage from '@/pages/NotFoundPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }
  return children;
}

/** Renders children if the current role may access `routeKey`, else redirects to the role's home. */
function RoleRoute({ routeKey, children }: { routeKey: RouteKey; children: JSX.Element }) {
  const role = normalizeRole(useAuthStore((s) => s.user?.role));
  if (!ROLE_ACCESS[role].includes(routeKey)) {
    return <Navigate to={ROLE_HOME[role]} replace />;
  }
  return children;
}

/** Redirects /app to the current role's home page. */
function RoleHome() {
  const role = normalizeRole(useAuthStore((s) => s.user?.role));
  return <Navigate to={ROLE_HOME[role]} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.landing} element={<LandingPage />} />
      <Route path={ROUTES.login} element={<LoginPage />} />

      <Route
        path={ROUTES.app}
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="executive" element={<RoleRoute routeKey="executive"><ExecutiveDashboardPage /></RoleRoute>} />
        <Route path="portal" element={<RoleRoute routeKey="portal"><CustomerPortalPage /></RoleRoute>} />
        <Route path="dashboard" element={<RoleRoute routeKey="dashboard"><DashboardPage /></RoleRoute>} />
        <Route path="customers" element={<RoleRoute routeKey="customers"><CustomersPage /></RoleRoute>} />
        <Route path="customers/:id" element={<RoleRoute routeKey="customers"><CustomerDetailPage /></RoleRoute>} />
        <Route path="contracts" element={<RoleRoute routeKey="contracts"><ContractsPage /></RoleRoute>} />
        <Route path="contracts/:id" element={<RoleRoute routeKey="contracts"><ContractDetailPage /></RoleRoute>} />
        <Route path="partners" element={<RoleRoute routeKey="partners"><PartnersPage /></RoleRoute>} />
        <Route path="containers" element={<RoleRoute routeKey="containers"><ContainersPage /></RoleRoute>} />
        <Route path="invoices" element={<RoleRoute routeKey="invoices"><InvoicesPage /></RoleRoute>} />
        <Route path="payments" element={<RoleRoute routeKey="payments"><PaymentsPage /></RoleRoute>} />
        <Route path="reports" element={<RoleRoute routeKey="reports"><ReportsPage /></RoleRoute>} />
        <Route path="settings" element={<RoleRoute routeKey="settings"><SettingsPage /></RoleRoute>} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
