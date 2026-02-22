import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import { businessApi } from '../services/api';
import type { KeycloakUser, OperatonVariable } from '@ronl/shared';
import type { ApiResponse, HealthResponse } from '@ronl/shared';
import { initializeTenantTheme } from '../services/tenant';

import { Timeline } from '../components/TimeLine';
import { PersonalDataPanel } from '../components/PersonalDataPanel';
import { getPersonTimeline, calculateHistoricalState } from '../services/brp.timeline';
import type { TimelineConfig, BRPPersonHistoricalData, PersonState } from '../types/brp.types';
import { getUserBSN } from '../services/bsn.mapping';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const [formData, setFormData] = useState({
    ingezetene: true,
    leeftijd: true,
    betalingsregeling: false,
    detentie: false,
    verzekering: true,
    inkomen: 24000,
  });

  const [showTimeline, setShowTimeline] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timelineConfig, setTimelineConfig] = useState<TimelineConfig | null>(null);
  const [timelineData, setTimelineData] = useState<BRPPersonHistoricalData | null>(null);
  const [historicalState, setHistoricalState] = useState<PersonState | null>(null);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

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

    businessApi
      .health()
      .then((data) => setHealth(data))
      .catch((error) => {
        console.error('Health check failed:', error);
        setHealth(null);
      });

    // TIMELINE CONFIG LOADING
    fetch('/timeline-config.json')
      .then((res) => res.json())
      .then((config) => setTimelineConfig(config))
      .catch((err) => console.error('Failed to load timeline config:', err));
  }, [navigate]);

  // TIMELINE DATA LOADING
  useEffect(() => {
    if (showTimeline && user && !timelineData) {
      const bsn = getUserBSN(user); // Use BSN mapping, not user.sub

      if (!bsn) {
        console.error('No BSN available for user');
        setIsLoadingTimeline(false);
        return;
      }

      setIsLoadingTimeline(true);
      getPersonTimeline(bsn) // Pass the BSN, not user.sub
        .then((data) => {
          setTimelineData(data);
          setIsLoadingTimeline(false);
        })
        .catch((err) => {
          console.error('Failed to load timeline:', err);
          setIsLoadingTimeline(false);
        });
    }
  }, [showTimeline, user, timelineData]);

  // HISTORICAL STATE CALCULATION
  useEffect(() => {
    if (timelineData?.currentState) {
      const state = calculateHistoricalState(timelineData.currentState, selectedDate);
      setHistoricalState(state);
    }
  }, [selectedDate, timelineData]);

  const handleEvaluate = async () => {
    setLoading(true);
    setResult(null);

    try {
      const variables: Record<string, OperatonVariable> = {
        ingezetene_requirement: {
          value: formData.ingezetene,
          type: 'Boolean' as const,
        },
        leeftijd_requirement: {
          value: formData.leeftijd,
          type: 'Boolean' as const,
        },
        betalingsregeling_requirement: {
          value: formData.betalingsregeling,
          type: 'Boolean' as const,
        },
        detentie_requirement: {
          value: formData.detentie,
          type: 'Boolean' as const,
        },
        verzekering_requirement: {
          value: formData.verzekering,
          type: 'Boolean' as const,
        },
        inkomen_en_vermogen_requirement: {
          value: formData.inkomen,
          type: 'Double' as const,
        },
      };

      const response = await businessApi.evaluateDecision('berekenrechtenhoogtezorg', variables);
      setResult(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setResult({
        success: false,
        data: null,
        error: {
          code: 'REQUEST_FAILED',
          message,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    keycloak.logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header style={{ backgroundColor: 'var(--color-primary)' }} className="text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">MijnOmgeving</h1>
              <p className="text-sm opacity-90">
                Gemeente{' '}
                {user?.municipality
                  ? user.municipality.charAt(0).toUpperCase() + user.municipality.slice(1)
                  : 'Utrecht'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm">{user?.name || 'Ingelogd'}</p>
              <div className="flex items-center gap-2 text-xs text-blue-100">
                <span
                  style={{ backgroundColor: 'var(--color-primary-dark)' }}
                  className="px-2 py-1 rounded"
                >
                  LoA: {user?.loa || 'hoog'}
                </span>
                <span
                  style={{ backgroundColor: 'var(--color-primary-dark)' }}
                  className="px-2 py-1 rounded"
                >
                  {user?.roles[0] || 'citizen'}
                </span>
              </div>
              <button onClick={handleLogout} className="mt-2 text-sm underline hover:text-blue-200">
                Uitloggen
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* API Health Status */}
        {health && (
          <div className="mb-6 bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-2">API Status</h2>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Business API:</span>
                <span
                  className={`ml-2 font-semibold ${
                    health.status === 'healthy' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {health.status}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Keycloak:</span>
                <span
                  className={`ml-2 font-semibold ${
                    health.dependencies?.keycloak.status === 'up'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {health.dependencies?.keycloak.status}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Operaton:</span>
                <span
                  className={`ml-2 font-semibold ${
                    health.dependencies?.operaton.status === 'up'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {health.dependencies?.operaton.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TOGGLE BUTTON */}
        <button
          onClick={() => setShowTimeline(!showTimeline)}
          className="mb-6 px-6 py-3 text-white font-medium rounded-lg transition-colors shadow-md hover:shadow-lg"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {showTimeline ? '📊 Toon Zorgtoeslag Calculator' : '📅 Toon Tijdlijn'}
        </button>

        {/* CONDITIONAL RENDERING FOR TIMELINE */}
        {showTimeline ? (
          <div className="space-y-6">
            {isLoadingTimeline ? (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <div className="text-gray-600 text-lg">Tijdlijn gegevens laden...</div>
              </div>
            ) : timelineData && timelineConfig ? (
              <>
                <Timeline
                  events={timelineData.events}
                  minDate={timelineData.earliestDate}
                  maxDate={timelineData.latestDate}
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  isLoading={false}
                />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1">
                    <PersonalDataPanel personState={historicalState} config={timelineConfig} />
                  </div>

                  <div className="lg:col-span-2">
                    <div className="bg-white rounded-lg shadow-lg p-6">
                      <h2 className="text-xl font-bold mb-4">Producten en Diensten</h2>
                      <p className="text-gray-600">
                        Deze ruimte is gereserveerd voor het tonen van producten en diensten die
                        passen bij de geselecteerde datum en persoonlijke situatie.
                      </p>

                      {/* Debug info */}
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">
                          <strong>Huidige selectie:</strong>
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-gray-600">
                          <li>• Datum: {selectedDate.toLocaleDateString('nl-NL')}</li>
                          <li>• Leeftijd: {historicalState?.leeftijd || 'N/A'} jaar</li>
                          <li>• Partner: {historicalState?.partners ? 'Ja' : 'Nee'}</li>
                          <li>• Kinderen: {historicalState?.kinderen?.length || 0}</li>
                        </ul>
                      </div>

                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-gray-700">
                          <strong>Toekomstige functionaliteit:</strong>
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-gray-600">
                          <li>• "Wat als" scenario's (extra kind, scheiding, etc.)</li>
                          <li>• Historische aanvragen en resultaten</li>
                          <li>• Beschikbare regelingen voor deze periode</li>
                          <li>• Automatische berekening van toepasselijke toeslagen</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <div className="text-red-600 text-lg">
                  Geen tijdlijn gegevens beschikbaar voor deze gebruiker
                </div>
              </div>
            )}
          </div>
        ) : (
          // EXISTING ZORGTOESLAG CALCULATOR (wrapped in fragment)
          <>
            {/* Zorgtoeslag Calculator */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Zorgtoeslag Berekenen</h2>

              <div className="space-y-4">
                {/* Boolean requirements */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.ingezetene}
                      onChange={(e) => setFormData({ ...formData, ingezetene: e.target.checked })}
                      className="w-5 h-5 text-primary"
                    />
                    <span className="text-gray-700">Ingezetene van Nederland</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.leeftijd}
                      onChange={(e) => setFormData({ ...formData, leeftijd: e.target.checked })}
                      className="w-5 h-5 text-primary"
                    />
                    <span className="text-gray-700">18 jaar of ouder</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.verzekering}
                      onChange={(e) => setFormData({ ...formData, verzekering: e.target.checked })}
                      className="w-5 h-5 text-primary"
                    />
                    <span className="text-gray-700">Zorgverzekering in Nederland</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.betalingsregeling}
                      onChange={(e) =>
                        setFormData({ ...formData, betalingsregeling: e.target.checked })
                      }
                      className="w-5 h-5 text-primary"
                    />
                    <span className="text-gray-700">Betalingsregeling premie</span>
                  </label>

                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.detentie}
                      onChange={(e) => setFormData({ ...formData, detentie: e.target.checked })}
                      className="w-5 h-5 text-primary"
                    />
                    <span className="text-gray-700">In detentie</span>
                  </label>
                </div>

                {/* Income input */}
                <div>
                  <label className="block text-gray-700 mb-2">Inkomen en vermogen (€)</label>
                  <input
                    type="number"
                    value={formData.inkomen}
                    onChange={(e) =>
                      setFormData({ ...formData, inkomen: parseFloat(e.target.value) })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-dutch-blue focus:border-transparent"
                    step="1000"
                  />
                </div>

                {/* Submit button */}
                <button
                  onClick={handleEvaluate}
                  disabled={loading}
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'white',
                  }}
                  className="w-full py-3 px-6 rounded-lg hover:opacity-90 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors"
                >
                  {loading ? 'Berekenen...' : 'Berekenen'}
                </button>
              </div>

              {/* Results */}
              {result && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  {result.success ? (
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-green-600">
                        ✓ Berekening succesvol
                      </h3>
                      <pre className="bg-white p-4 rounded border overflow-x-auto text-sm">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                      {Array.isArray(result.data) && result.data.length > 0 && (
                        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-lg font-bold text-green-800">
                            Zorgtoeslag: €{' '}
                            {result.data[0]?.zorgtoeslag?.value?.toFixed(2) || '0.00'}
                          </p>
                          {result.data[0]?.annotation?.value && (
                            <p className="text-sm text-gray-600 mt-2">
                              {result.data[0].annotation.value}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-red-600">✗ Fout</h3>
                      <p className="text-red-700">{result.error?.message}</p>
                      {result.error?.details && (
                        <p className="text-sm text-gray-600">{result.error.details}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Architecture Info */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">🏛️ Architectuur</h3>
              <div className="text-sm text-blue-800 space-y-1">
                {(() => {
                  const hostname = window.location.hostname;

                  // Determine environment based on hostname
                  let env: 'local' | 'acc' | 'prod' = 'prod';
                  if (hostname === 'localhost') {
                    env = 'local';
                  } else if (hostname.includes('acc.')) {
                    env = 'acc';
                  }

                  // Set URLs based on environment
                  const urls = {
                    local: {
                      frontend: 'http://localhost:5173',
                      keycloak: 'http://localhost:8080',
                      api: 'http://localhost:3002',
                    },
                    acc: {
                      frontend: 'https://acc.mijn.open-regels.nl',
                      keycloak: 'https://acc.keycloak.open-regels.nl',
                      api: 'https://acc.api.open-regels.nl',
                    },
                    prod: {
                      frontend: 'https://mijn.open-regels.nl',
                      keycloak: 'https://keycloak.open-regels.nl',
                      api: 'https://api.open-regels.nl',
                    },
                  };

                  const currentUrls = urls[env];

                  return (
                    <>
                      <p>✓ Frontend (MijnOmgeving) → {currentUrls.frontend}</p>
                      <p>✓ Keycloak (IAM) → {currentUrls.keycloak}</p>
                      <p>✓ Business API → {currentUrls.api}</p>
                      <p>✓ Operaton (BPMN/DMN) → https://operaton.open-regels.nl</p>
                    </>
                  );
                })()}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
