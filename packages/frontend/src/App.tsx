import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginChoice from './pages/LoginChoice';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import './index.css';

/**
 * Main application component with routing
 * Implements the identity provider selection flow from the mockup
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page with identity provider choices */}
        <Route path="/" element={<LoginChoice />} />

        {/* Authentication callback that initializes Keycloak */}
        <Route path="/auth" element={<AuthCallback />} />

        {/* Main dashboard (protected, requires authentication) */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Redirect any unknown routes to landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
