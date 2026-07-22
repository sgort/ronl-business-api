import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AuthCallback from './pages/AuthCallback';
import CaseworkerDashboardV2 from './pages/CaseworkerDashboardV2';
import PADashboardV2 from './pages/PADashboardV2';
import InfraBoardDashboard from './pages/InfraBoardDashboard';
import WooDashboard from './pages/WooDashboard';
import Dashboard from './pages/Dashboard';
import LoginChoice from './pages/LoginChoice';
import keycloak, { initializeKeycloak } from './services/keycloak';
import './index.css';

/**
 * Guards a route by authentication and role.
 *
 * - Not authenticated          → redirect to /
 * - Authenticated, wrong role  → redirect to the correct dashboard
 * - Authenticated, correct role → render children
 *
 * `keycloak.init()` is normally only called from AuthCallback, once, after a
 * real login. That leaves a real gap: a fresh page load of a protected route
 * (URL bar, bookmark, refresh) never calls it at all, so `keycloak.authenticated`
 * reads false even with a live SSO session, and this always bounced to `/`
 * regardless of the user's actual session. Doing our own `check-sso` init on
 * mount (idempotent via `initializeKeycloak` — safe whether or not
 * AuthCallback already initialized it this page load) fixes that.
 */
export function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole: 'citizen' | 'caseworker';
}) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    initializeKeycloak()
      .catch(() => false)
      .finally(() => setChecked(true));
  }, []);

  if (!checked) {
    return null;
  }

  if (!keycloak.authenticated) {
    return <Navigate to="/" replace />;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: string[] = (keycloak.tokenParsed as any)?.realm_access?.roles ?? [];
  const isCaseworker = roles.includes('caseworker');

  if (requiredRole === 'caseworker' && !isCaseworker) {
    return <Navigate to="/dashboard/citizen" replace />;
  }
  if (requiredRole === 'citizen' && isCaseworker) {
    return <Navigate to="/dashboard/caseworker" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginChoice />} />
        <Route path="/auth" element={<AuthCallback />} />

        <Route
          path="/dashboard/citizen"
          element={
            <ProtectedRoute requiredRole="citizen">
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/caseworker"
          element={
            <ProtectedRoute requiredRole="caseworker">
              <CaseworkerDashboardV2 />
            </ProtectedRoute>
          }
        />

        {/* PA cockpit — public route; role gate lives inside the component */}
        <Route path="/dashboard/public-affairs" element={<PADashboardV2 />} />

        {/* Infra project-board — public route; role gate (infra-projectteam) lives inside */}
        <Route path="/dashboard/infra-board" element={<InfraBoardDashboard />} />

        {/* Woo-dashboard — public route; role gate (woo-coordinatie) lives inside */}
        <Route path="/dashboard/woo" element={<WooDashboard />} />

        {/* Legacy /dashboard redirect — role-based, falls through to ProtectedRoute logic */}
        <Route
          path="/dashboard"
          element={
            keycloak.authenticated ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (keycloak.tokenParsed as any)?.realm_access?.roles?.includes('caseworker') ? (
                <Navigate to="/dashboard/caseworker" replace />
              ) : (
                <Navigate to="/dashboard/citizen" replace />
              )
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
