import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import { businessApi } from '../services/api';
import type { KeycloakUser, OperatonVariable } from '@ronl/shared';
import type { ApiResponse } from '@ronl/shared';
import { initializeTenantTheme, loadTenantConfigs, getTenantConfig } from '../services/tenant';
import type { TenantConfig } from '../services/tenant';

import { Timeline } from '../components/TimeLine';
import { PersonalDataPanel } from '../components/PersonalDataPanel';
import { getPersonTimeline, calculateHistoricalState } from '../services/brp.timeline';
import type { TimelineConfig, BRPPersonHistoricalData, PersonState } from '../types/brp.types';
import { getUserBSN } from '../services/bsn.mapping';

type Tab = 'diensten' | 'aanvragen' | 'tijdlijn';

const SERVICE_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  zorgtoeslag: {
    label: 'Zorgtoeslag',
    description: 'Bereken uw recht op zorgtoeslag op basis van inkomen en persoonlijke situatie.',
    icon: '💊',
  },
  vergunningen: {
    label: 'Vergunningen',
    description: 'Vraag vergunningen aan voor bouw, verbouw of evenementen.',
    icon: '📋',
  },
  subsidies: {
    label: 'Subsidies',
    description: 'Overzicht van beschikbare subsidies voor uw situatie.',
    icon: '💶',
  },
  meldingen: {
    label: 'Meldingen',
    description: 'Doe een melding over uw woonomgeving of openbare ruimte.',
    icon: '📢',
  },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('diensten');
  const [activeService, setActiveService] = useState<string | null>(null);

  // Zorgtoeslag calculator state
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<ApiResponse | null>(null);
  const [formData, setFormData] = useState({
    ingezetene: true,
    leeftijd: true,
    betalingsregeling: false,
    detentie: false,
    verzekering: true,
    inkomen: 24000,
  });

  // My applications state
  const [appsLoading, setAppsLoading] = useState(false);
  const [applications, setApplications] = useState<unknown[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);

  // Timeline state (preserved exactly)
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
      initializeTenantTheme(currentUser.municipality).then(() => {
        loadTenantConfigs().then(() => {
          setTenant(getTenantConfig(currentUser.municipality));
        });
      });
    }

    fetch('/timeline-config.json')
      .then((res) => res.json())
      .then((config) => setTimelineConfig(config))
      .catch(() => {});
  }, [navigate]);

  // Timeline data loading (preserved exactly)
  useEffect(() => {
    if (activeTab === 'tijdlijn' && user && !timelineData) {
      const bsn = getUserBSN(user);
      if (!bsn) {
        setIsLoadingTimeline(false);
        return;
      }
      setIsLoadingTimeline(true);
      getPersonTimeline(bsn)
        .then((data) => {
          setTimelineData(data);
          setIsLoadingTimeline(false);
        })
        .catch(() => setIsLoadingTimeline(false));
    }
  }, [activeTab, user, timelineData]);

  useEffect(() => {
    if (timelineData?.currentState) {
      setHistoricalState(calculateHistoricalState(timelineData.currentState, selectedDate));
    }
  }, [selectedDate, timelineData]);

  // Load applications when tab becomes active
  useEffect(() => {
    if (activeTab === 'aanvragen' && user && applications === null) {
      setAppsLoading(true);
      setAppsError(null);
      businessApi.process
        .history(user.sub)
        .then((res) => {
          if (res.success) setApplications(res.data as unknown[]);
          else setAppsError('Aanvragen konden niet worden geladen.');
        })
        .catch(() => setAppsError('Aanvragen konden niet worden geladen.'))
        .finally(() => setAppsLoading(false));
    }
  }, [activeTab, user, applications]);

  const handleEvaluate = async () => {
    setCalcLoading(true);
    setCalcResult(null);
    try {
      const variables: Record<string, OperatonVariable> = {
        ingezetene_requirement: { value: formData.ingezetene, type: 'Boolean' },
        leeftijd_requirement: { value: formData.leeftijd, type: 'Boolean' },
        betalingsregeling_requirement: { value: formData.betalingsregeling, type: 'Boolean' },
        detentie_requirement: { value: formData.detentie, type: 'Boolean' },
        verzekering_requirement: { value: formData.verzekering, type: 'Boolean' },
        inkomen_en_vermogen_requirement: { value: formData.inkomen, type: 'Double' },
      };
      const response = await businessApi.evaluateDecision('berekenrechtenhoogtezorg', variables);
      setCalcResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setCalcResult({ success: false, data: null, error: { code: 'REQUEST_FAILED', message } });
    } finally {
      setCalcLoading(false);
    }
  };

  const handleLogout = () => keycloak.logout({ redirectUri: window.location.origin });

  const enabledServices = tenant
    ? Object.entries(tenant.features)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
    : [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header style={{ backgroundColor: 'var(--color-primary)' }} className="text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">MijnOmgeving</h1>
            <p className="text-sm opacity-90">
              {tenant?.displayName ?? `Gemeente ${user?.municipality ?? ''}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              {user?.name ?? user?.preferred_username ?? 'Burger'}
            </p>
            <div className="flex items-center gap-2 text-xs opacity-80 mt-0.5 justify-end">
              <span
                className="px-2 py-0.5 rounded"
                style={{ backgroundColor: 'var(--color-primary-dark)' }}
              >
                LoA: {user?.loa ?? 'hoog'}
              </span>
            </div>
            <button onClick={handleLogout} className="mt-1 text-sm underline hover:opacity-80">
              Uitloggen
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {(
              [
                { id: 'diensten', label: 'Diensten' },
                { id: 'aanvragen', label: 'Mijn aanvragen' },
                { id: 'tijdlijn', label: 'Tijdlijn' },
              ] as { id: Tab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setActiveService(null);
                }}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-white text-white'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Diensten ── */}
        {activeTab === 'diensten' && !activeService && (
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Beschikbare diensten</h2>
            {enabledServices.length === 0 ? (
              <p className="text-gray-500">Geen diensten beschikbaar voor uw gemeente.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {enabledServices.map((key) => {
                  const svc = SERVICE_LABELS[key];
                  if (!svc) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveService(key)}
                      className="text-left bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow border border-transparent hover:border-gray-200"
                    >
                      <div className="text-3xl mb-3">{svc.icon}</div>
                      <h3 className="font-semibold text-gray-800 mb-1">{svc.label}</h3>
                      <p className="text-sm text-gray-500">{svc.description}</p>
                      <div
                        className="mt-4 text-sm font-medium"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        Aanvragen →
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Zorgtoeslag service ── */}
        {activeTab === 'diensten' && activeService === 'zorgtoeslag' && (
          <div>
            <button
              onClick={() => {
                setActiveService(null);
                setCalcResult(null);
              }}
              className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Terug naar diensten
            </button>
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Zorgtoeslag Berekenen</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'ingezetene', label: 'Ingezetene van Nederland' },
                    { key: 'leeftijd', label: '18 jaar of ouder' },
                    { key: 'verzekering', label: 'Zorgverzekering in Nederland' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={formData[key as keyof typeof formData] as boolean}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                        className="w-5 h-5"
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      <span className="text-gray-700">{label}</span>
                    </label>
                  ))}
                  {[
                    { key: 'betalingsregeling', label: 'Betalingsregeling Belastingdienst' },
                    { key: 'detentie', label: 'In detentie' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={formData[key as keyof typeof formData] as boolean}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                        className="w-5 h-5"
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      <span className="text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Toetsingsinkomen (€)
                  </label>
                  <input
                    type="number"
                    value={formData.inkomen}
                    onChange={(e) => setFormData({ ...formData, inkomen: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                  />
                </div>
                <button
                  onClick={handleEvaluate}
                  disabled={calcLoading}
                  className="w-full py-3 text-white font-semibold rounded-lg transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  {calcLoading ? 'Berekenen...' : 'Berekenen'}
                </button>
              </div>

              {calcResult && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  {calcResult.success ? (
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-green-600">
                        ✓ Berekening succesvol
                      </h3>
                      {Array.isArray(calcResult.data) && calcResult.data.length > 0 && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-lg font-bold text-green-800">
                            Zorgtoeslag: €{' '}
                            {(
                              calcResult.data[0] as { zorgtoeslag?: { value: number } }
                            )?.zorgtoeslag?.value?.toFixed(2) ?? '0.00'}
                          </p>
                          {(calcResult.data[0] as { annotation?: { value: string } })?.annotation
                            ?.value && (
                            <p className="text-sm text-gray-600 mt-2">
                              {
                                (calcResult.data[0] as { annotation: { value: string } }).annotation
                                  .value
                              }
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-lg font-semibold text-yellow-700">ℹ️ Melding</h3>
                      <p className="text-gray-700 mt-1">
                        De berekening kon niet worden afgerond. Dit is bij de beheerder gemeld.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Other services (stub) ── */}
        {activeTab === 'diensten' && activeService && activeService !== 'zorgtoeslag' && (
          <div>
            <button
              onClick={() => setActiveService(null)}
              className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Terug naar diensten
            </button>
            <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-lg">
              <div className="text-4xl mb-4">{SERVICE_LABELS[activeService]?.icon}</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                {SERVICE_LABELS[activeService]?.label}
              </h2>
              <p className="text-gray-500">Deze dienst is in ontwikkeling.</p>
            </div>
          </div>
        )}

        {/* ── Mijn aanvragen ── */}
        {activeTab === 'aanvragen' && (
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Mijn aanvragen</h2>
            {appsLoading && (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                Aanvragen laden...
              </div>
            )}
            {appsError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {appsError}
              </div>
            )}
            {!appsLoading &&
              !appsError &&
              applications !== null &&
              (applications.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <p className="text-gray-500">U heeft nog geen aanvragen ingediend.</p>
                  <button
                    onClick={() => setActiveTab('diensten')}
                    className="mt-4 px-5 py-2 text-white rounded-lg text-sm font-medium"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    Bekijk beschikbare diensten
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(applications as Record<string, unknown>[]).map((app) => (
                    <div
                      key={app.id as string}
                      className="bg-white rounded-lg shadow p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-800">
                          {(app.processDefinitionKey as string) ?? 'Aanvraag'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {app.startTime
                            ? new Date(app.startTime as string).toLocaleDateString('nl-NL')
                            : ''}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          app.state === 'ACTIVE'
                            ? 'bg-blue-100 text-blue-700'
                            : app.state === 'COMPLETED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {app.state as string}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        {/* ── Tijdlijn ── */}
        {activeTab === 'tijdlijn' && (
          <div className="space-y-6">
            {isLoadingTimeline ? (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center text-gray-600">
                Tijdlijn gegevens laden...
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
                      <p className="text-gray-600 mb-4">
                        Producten en diensten die passen bij de geselecteerde datum en situatie.
                      </p>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">
                          <strong>Huidige selectie:</strong>
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-gray-600">
                          <li>• Datum: {selectedDate.toLocaleDateString('nl-NL')}</li>
                          <li>• Leeftijd: {historicalState?.leeftijd ?? 'N/A'} jaar</li>
                          <li>• Partner: {historicalState?.partners ? 'Ja' : 'Nee'}</li>
                          <li>• Kinderen: {historicalState?.kinderen?.length ?? 0}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-12 text-center">
                <p className="text-red-600">
                  Geen tijdlijn gegevens beschikbaar voor deze gebruiker.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
