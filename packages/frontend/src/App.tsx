import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AuthCallback from './pages/AuthCallback';
import CaseworkerDashboard from './pages/CaseworkerDashboard';
import Dashboard from './pages/Dashboard';
import LoginChoice from './pages/LoginChoice';
import keycloak from './services/keycloak';
import './index.css';

/**
 * Guards a route by authentication and role.
 *
 * - Not authenticated          → redirect to /
 * - Authenticated, wrong role  → redirect to the correct dashboard
 * - Authenticated, correct role → render children
 */
function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole: 'citizen' | 'caseworker';
}) {
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

        {/* Caseworker portal is public — auth state is handled inside the component */}
        <Route path="/dashboard/caseworker" element={<CaseworkerDashboard />} />

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
