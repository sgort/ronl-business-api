import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import { initializeTenantTheme } from '../services/tenant';
import type { KeycloakUser } from '@ronl/shared';

export default function CaseworkerDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<KeycloakUser | null>(null);

  useEffect(() => {
    if (!keycloak.authenticated) {
      navigate('/', { replace: true });
      return;
    }
    const currentUser = getUser();
    setUser(currentUser);
    if (currentUser?.municipality) {
      initializeTenantTheme(currentUser.municipality);
    }
  }, [navigate]);

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="text-white p-4 flex justify-between items-center"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <div>
          <h1 className="text-xl font-bold">MijnOmgeving — Medewerker</h1>
          <p className="text-sm opacity-80">
            {user?.municipality
              ? user.municipality.charAt(0).toUpperCase() + user.municipality.slice(1)
              : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm">{user?.name || 'Ingelogd'}</p>
          <button onClick={handleLogout} className="mt-1 text-sm underline hover:opacity-80">
            Uitloggen
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-500">Medewerker dashboard — in ontwikkeling</p>
      </main>
    </div>
  );
}
