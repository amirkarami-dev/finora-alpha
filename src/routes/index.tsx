import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { JSX } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { ROUTES } from '@/config/constants';
import { AppLayout } from '@/components/layout/AppLayout';
import LandingPage from '@/pages/landing/LandingPage';
import LoginPage from '@/pages/auth/LoginPage';
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
import NotFoundPage from '@/pages/NotFoundPage';

function RequireAuth({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }
  return children;
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
        <Route index element={<Navigate to={ROUTES.dashboard} replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="contracts/:id" element={<ContractDetailPage />} />
        <Route path="containers" element={<ContainersPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
