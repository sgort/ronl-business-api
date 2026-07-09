import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak, { getUser } from '../services/keycloak';
import { businessApi } from '../services/api';
import type { KeycloakUser, OperatonVariable } from '@ronl/shared';
import type { ApiResponse } from '@ronl/shared';
import { initializeTenantTheme, loadTenantConfigs, getTenantConfig } from '../services/tenant';
import type { TenantConfig } from '../services/tenant';
import ProcessStartFormViewer from '../components/ProcessStartFormViewer';
import DecisionViewer from '../components/DecisionViewer';
import DvtpStartSection from '../components/CaseworkerDashboard/DvtpStartSection';
import DvtpTakenSection from '../components/CaseworkerDashboard/DvtpTakenSection';

import { Timeline } from '../components/TimeLine';
import { PersonalDataPanel } from '../components/PersonalDataPanel';
import { getPersonTimeline, calculateHistoricalState } from '../services/brp.timeline';
import type { TimelineConfig, BRPPersonHistoricalData, PersonState } from '../types/brp.types';
import { getUserBSN } from '../services/bsn.mapping';

type Tab = 'diensten' | 'aanvragen' | 'tijdlijn' | 'mijn-toestemming';
type DvtpSubView = 'start' | 'taken';

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

const PROCESS_DEFINITION_LABELS: Record<string, string> = {
  AwbShellProcess: 'Kapvergunning aanvragen',
  AwbZorgtoeslagProcess: 'Zorgtoeslag aanvragen',
  ThuisbatterijSubsidieAanvraagProcess: 'Thuisbatterij subsidie aanvragen',
};

function VergunningForm({
  user,
  onBack,
  onSubmitted,
}: {
  user: KeycloakUser | null;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const [success, setSuccess] = useState<{ dossier: string } | null>(null);
  const [error, setError] = useState(false);

  if (success) {
    return (
      <div>
        <button
          onClick={onBack}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ← Terug naar diensten
        </button>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-lg">
          <div className="text-5xl mb-4">✅</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Aanvraag ingediend</h3>
          <p className="text-sm text-gray-600 mb-4">
            Uw kapvergunningaanvraag is ontvangen en wordt behandeld.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
            <p className="text-sm font-medium text-gray-700">
              Dossiernummer: <span className="font-mono">{success.dossier}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              U ontvangt bericht zodra de aanvraag is beoordeeld (wettelijke termijn: 8 weken, Awb
              4:13).
            </p>
          </div>
          <button
            onClick={onSubmitted}
            className="w-full py-3 text-white font-semibold rounded-lg transition-opacity"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Naar mijn aanvragen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        ← Terug naar diensten
      </button>
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🌳</span>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Kapvergunning aanvragen</h2>
            <p className="text-sm text-gray-500">
              De aanvraag wordt automatisch beoordeeld op basis van de gemeentelijke regelgeving.
            </p>
          </div>
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            De aanvraag kon niet worden ingediend. Probeer het opnieuw.
          </div>
        )}
        <ProcessStartFormViewer
          processKey="AwbShellProcess"
          initialData={{
            applicantId: user?.sub ?? 'unknown',
            productType: 'TreeFellingPermit',
          }}
          onStarted={(dossier) => setSuccess({ dossier })}
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}

function SubsidieForm({
  user,
  onBack,
  onSubmitted,
}: {
  user: KeycloakUser | null;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const [success, setSuccess] = useState<{ dossier: string } | null>(null);
  const [error, setError] = useState(false);

  if (success) {
    return (
      <div>
        <button
          onClick={onBack}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          ← Terug naar diensten
        </button>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-lg">
          <div className="text-5xl mb-4">✅</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Aanvraag ingediend</h3>
          <p className="text-sm text-gray-600 mb-4">
            Uw aanvraag voor thuisbatterij subsidie is ontvangen en wordt behandeld.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
            <p className="text-sm font-medium text-gray-700">
              Dossiernummer: <span className="font-mono">{success.dossier}</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              U ontvangt bericht zodra de aanvraag is beoordeeld (wettelijke termijn: 8 weken, Awb
              4:13).
            </p>
          </div>
          <button
            onClick={onSubmitted}
            className="w-full py-3 text-white font-semibold rounded-lg transition-opacity"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Naar mijn aanvragen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        ← Terug naar diensten
      </button>
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🔋</span>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Thuisbatterij subsidie aanvragen</h2>
            <p className="text-sm text-gray-500">
              Vraag subsidie aan voor de aanschaf en installatie van een thuisbatterij.
            </p>
          </div>
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            De aanvraag kon niet worden ingediend. Probeer het opnieuw.
          </div>
        )}
        <ProcessStartFormViewer
          processKey="ThuisbatterijSubsidieAanvraagProcess"
          initialData={{
            applicantId: user?.sub ?? 'unknown',
            productType: 'ThuisbatterijSubsidie',
          }}
          onStarted={(dossier) => setSuccess({ dossier })}
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<KeycloakUser | null>(null);
  const [tenant, setTenant] = useState<TenantConfig | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('diensten');
  const [activeService, setActiveService] = useState<string | null>(null);
  const [expandedDecision, setExpandedDecision] = useState<string | null>(null);
  const [zorgtoeslagView, setZorgtoeslagView] = useState<'calculator' | 'aanvragen'>('calculator');
  const [zorgtoeslagAanvraagSuccess, setZorgtoeslagAanvraagSuccess] = useState<{
    dossier: string;
  } | null>(null);
  const [zorgtoeslagAanvraagError, setZorgtoeslagAanvraagError] = useState(false);

  // DvTP sub-view state
  const [dvtpSubView, setDvtpSubView] = useState<DvtpSubView>('start');

  // Zorgtoeslag calculator state
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<ApiResponse | null>(null);
  const [calcFormData, setCalcFormData] = useState({
    geboortedatum: '2000-01-10',
    overlijdensdatum: '',
    woonachtigNL: true,
    rechtmatigVerblijfNL: true,
    statusZorgverzekerd: 'Binnenlands zorgverzekerd',
    gedetineerd: false,
    toetsingsinkomen: 30000,
    woonlandfactorBuitenland: 1.0,
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

  function computeAge(geboortedatum: string, reference: Date): number {
    const birth = new Date(geboortedatum);
    let age = reference.getFullYear() - birth.getFullYear();
    const m = reference.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && reference.getDate() < birth.getDate())) age--;
    return Math.max(0, age);
  }

  const handleEvaluate = async () => {
    setCalcLoading(true);
    setCalcResult(null);
    try {
      const today = new Date();
      const datumBerekening = today.toISOString().split('T')[0];
      const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      const lastDayCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

      const variables: Record<string, OperatonVariable> = {
        datumBerekening: { value: datumBerekening, type: 'String' },
        geboortedatum: { value: calcFormData.geboortedatum, type: 'String' },
        leeftijdOpDatumBerekening: {
          value: computeAge(calcFormData.geboortedatum, today),
          type: 'Integer',
        },
        leeftijdOpLaatsteDagVorigeMaand: {
          value: computeAge(calcFormData.geboortedatum, lastDayPrevMonth),
          type: 'Integer',
        },
        leeftijdOpLaatsteDagHuidigeMaand: {
          value: computeAge(calcFormData.geboortedatum, lastDayCurrentMonth),
          type: 'Integer',
        },
        woonachtigNL: { value: calcFormData.woonachtigNL, type: 'Boolean' },
        rechtmatigVerblijfNL: { value: calcFormData.rechtmatigVerblijfNL, type: 'Boolean' },
        statusZorgverzekerd: { value: calcFormData.statusZorgverzekerd, type: 'String' },
        gedetineerd: { value: calcFormData.gedetineerd, type: 'Boolean' },
        toetsingsinkomen: { value: calcFormData.toetsingsinkomen, type: 'Double' },
        woonlandfactorBuitenland: { value: calcFormData.woonlandfactorBuitenland, type: 'Double' },
      };
      if (calcFormData.overlijdensdatum) {
        variables.overlijdensdatum = { value: calcFormData.overlijdensdatum, type: 'String' };
      }

      const response = await businessApi.evaluateDecision('zorgtoeslag_resultaat', variables);
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

  const showDvtp = tenant?.features.dvtp === true;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'diensten', label: 'Diensten' },
    { id: 'aanvragen', label: 'Mijn aanvragen' },
    { id: 'tijdlijn', label: 'Tijdlijn' },
    ...(showDvtp ? [{ id: 'mijn-toestemming' as Tab, label: 'Mijn toestemming' }] : []),
  ];

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
            <p className="text-sm font-medium">{user?.preferred_username ?? 'Ingelogd'}</p>
            <div className="flex items-center gap-1 text-xs opacity-80 mt-0.5 justify-end flex-wrap">
              {user?.loa && (
                <span
                  className="px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--color-primary-dark, #0d2f4f)' }}
                >
                  LoA: {user.loa}
                </span>
              )}
              {(user?.roles ?? []).map((role) => (
                <span
                  key={role}
                  className="px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--color-primary-dark, #0d2f4f)' }}
                >
                  {role}
                </span>
              ))}
            </div>
            <button onClick={handleLogout} className="mt-1 text-sm underline hover:opacity-80">
              Uitloggen
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {tabs.map((tab) => (
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
                setZorgtoeslagView('calculator');
                setZorgtoeslagAanvraagSuccess(null);
                setZorgtoeslagAanvraagError(false);
              }}
              className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Terug naar diensten
            </button>

            {zorgtoeslagView === 'calculator' && (
              <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Zorgtoeslag Berekenen</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geboortedatum
                      </label>
                      <input
                        type="date"
                        value={calcFormData.geboortedatum}
                        onChange={(e) =>
                          setCalcFormData({ ...calcFormData, geboortedatum: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Overlijdensdatum{' '}
                        <span className="text-gray-400 font-normal">(optioneel)</span>
                      </label>
                      <input
                        type="date"
                        value={calcFormData.overlijdensdatum}
                        onChange={(e) =>
                          setCalcFormData({ ...calcFormData, overlijdensdatum: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Toetsingsinkomen (€)
                      </label>
                      <input
                        type="number"
                        value={calcFormData.toetsingsinkomen}
                        onChange={(e) =>
                          setCalcFormData({
                            ...calcFormData,
                            toetsingsinkomen: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Woonlandfactor
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={calcFormData.woonlandfactorBuitenland}
                        onChange={(e) =>
                          setCalcFormData({
                            ...calcFormData,
                            woonlandfactorBuitenland: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status zorgverzekering
                      </label>
                      <select
                        value={calcFormData.statusZorgverzekerd}
                        onChange={(e) =>
                          setCalcFormData({ ...calcFormData, statusZorgverzekerd: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 bg-white"
                        style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                      >
                        <option value="Binnenlands zorgverzekerd">Binnenlands zorgverzekerd</option>
                        <option value="Buitenlands zorgverzekerd">Buitenlands zorgverzekerd</option>
                        <option value="Niet zorgverzekerd">Niet zorgverzekerd</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {(
                      [
                        { key: 'woonachtigNL', label: 'Woonachtig in Nederland' },
                        { key: 'rechtmatigVerblijfNL', label: 'Rechtmatig verblijf NL' },
                        { key: 'gedetineerd', label: 'Gedetineerd' },
                      ] as { key: keyof typeof calcFormData; label: string }[]
                    ).map(({ key, label }) => (
                      <label key={key} className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={calcFormData[key] as boolean}
                          onChange={(e) =>
                            setCalcFormData({ ...calcFormData, [key]: e.target.checked })
                          }
                          className="w-5 h-5"
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        <span className="text-sm text-gray-700">{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleEvaluate}
                      disabled={calcLoading}
                      className="flex-1 py-3 text-white font-semibold rounded-lg transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      {calcLoading ? 'Berekenen...' : 'Berekenen'}
                    </button>
                    <button
                      onClick={() => {
                        setCalcResult(null);
                        setZorgtoeslagAanvraagError(false);
                        setZorgtoeslagView('aanvragen');
                      }}
                      className="flex-1 py-3 font-semibold rounded-lg border-2 transition-colors"
                      style={{
                        borderColor: 'var(--color-primary)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      Aanvragen
                    </button>
                  </div>
                </div>

                {calcResult && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    {calcResult.success &&
                    Array.isArray(calcResult.data) &&
                    calcResult.data.length > 0 ? (
                      (() => {
                        const row = calcResult.data[0] as {
                          eligible?: { value: boolean };
                          amountYear?: { value: number };
                        };
                        const eligible = row.eligible?.value ?? false;
                        const amountYear = row.amountYear?.value ?? 0;
                        return eligible ? (
                          <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-green-600">
                              ✓ Recht op zorgtoeslag
                            </h3>
                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                              <p className="text-lg font-bold text-green-800">
                                Geschat jaarbedrag: € {amountYear.toFixed(2)}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                ≈ € {(amountYear / 12).toFixed(2)} per maand
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h3 className="text-lg font-semibold text-yellow-700">
                              ⚠ Geen recht op zorgtoeslag
                            </h3>
                            <p className="text-gray-600 mt-1 text-sm">
                              Op basis van de ingevoerde gegevens bestaat er geen recht op
                              zorgtoeslag.
                            </p>
                          </div>
                        );
                      })()
                    ) : !calcResult.success ? (
                      <div>
                        <h3 className="text-lg font-semibold text-yellow-700">ℹ️ Melding</h3>
                        <p className="text-gray-700 mt-1">
                          De berekening kon niet worden afgerond. Probeer het opnieuw.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {zorgtoeslagView === 'aanvragen' && (
              <div className="max-w-2xl">
                <button
                  onClick={() => {
                    setZorgtoeslagView('calculator');
                    setZorgtoeslagAanvraagError(false);
                  }}
                  className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  ← Terug naar berekening
                </button>
                {zorgtoeslagAanvraagSuccess ? (
                  <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                    <div className="text-5xl mb-4">✅</div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Aanvraag ingediend</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Uw zorgtoeslag aanvraag is ontvangen en wordt behandeld.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
                      <p className="text-sm font-medium text-gray-700">
                        Dossiernummer:{' '}
                        <span className="font-mono">{zorgtoeslagAanvraagSuccess.dossier}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        U ontvangt bericht zodra de aanvraag is beoordeeld (wettelijke termijn: 8
                        weken, Awb 4:13).
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setActiveService(null);
                        setActiveTab('aanvragen');
                        setApplications(null);
                      }}
                      className="w-full py-3 text-white font-semibold rounded-lg transition-opacity"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      Naar mijn aanvragen
                    </button>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <span className="text-3xl">🏥</span>
                      <div>
                        <h2 className="text-xl font-bold text-gray-800">Zorgtoeslag aanvragen</h2>
                        <p className="text-sm text-gray-500">
                          Dien uw aanvraag in voor zorgtoeslag. De beoordeling verloopt via het
                          Awb-proces (wettelijke termijn: 8 weken).
                        </p>
                      </div>
                    </div>
                    {zorgtoeslagAanvraagError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        De aanvraag kon niet worden ingediend. Probeer het opnieuw.
                      </div>
                    )}
                    <ProcessStartFormViewer
                      processKey="AwbZorgtoeslagProcess"
                      initialData={(() => {
                        const today = new Date();
                        const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                        const lastDayCurrentMonth = new Date(
                          today.getFullYear(),
                          today.getMonth() + 1,
                          0
                        );
                        return {
                          applicantId: user?.sub ?? 'unknown',
                          productType: 'Zorgtoeslag',
                          ...calcFormData,
                          leeftijdOpDatumBerekening: computeAge(calcFormData.geboortedatum, today),
                          leeftijdOpLaatsteDagVorigeMaand: computeAge(
                            calcFormData.geboortedatum,
                            lastDayPrevMonth
                          ),
                          leeftijdOpLaatsteDagHuidigeMaand: computeAge(
                            calcFormData.geboortedatum,
                            lastDayCurrentMonth
                          ),
                        };
                      })()}
                      onStarted={(dossier) => setZorgtoeslagAanvraagSuccess({ dossier })}
                      onError={() => setZorgtoeslagAanvraagError(true)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Vergunningen service (AWB Kapvergunning) ── */}
        {activeTab === 'diensten' && activeService === 'vergunningen' && (
          <VergunningForm
            user={user}
            onBack={() => {
              setActiveService(null);
            }}
            onSubmitted={() => {
              setActiveService(null);
              setActiveTab('aanvragen');
              setApplications(null);
            }}
          />
        )}

        {/* ── Subsidies service (Thuisbatterij) ── */}
        {activeTab === 'diensten' && activeService === 'subsidies' && (
          <SubsidieForm
            user={user}
            onBack={() => {
              setActiveService(null);
            }}
            onSubmitted={() => {
              setActiveService(null);
              setActiveTab('aanvragen');
              setApplications(null);
            }}
          />
        )}

        {/* ── Other services (stub) ── */}
        {activeTab === 'diensten' &&
          activeService &&
          !['zorgtoeslag', 'vergunningen', 'subsidies'].includes(activeService) && (
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Mijn aanvragen</h2>
              <button
                onClick={() => setApplications(null)}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                ↺ Vernieuwen
              </button>
            </div>
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
                    <div key={app.id as string} className="bg-white rounded-lg shadow p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800">
                            {PROCESS_DEFINITION_LABELS[app.processDefinitionKey as string] ??
                              (app.processDefinitionKey as string) ??
                              'Aanvraag'}
                          </p>
                          <p className="text-sm text-gray-500">
                            {app.startTime
                              ? new Date(app.startTime as string).toLocaleDateString('nl-NL')
                              : ''}
                          </p>
                          {typeof app.businessKey === 'string' && (
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                              {app.businessKey}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
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
                          {app.state === 'COMPLETED' && (
                            <button
                              onClick={() =>
                                setExpandedDecision(
                                  expandedDecision === (app.id as string)
                                    ? null
                                    : (app.id as string)
                                )
                              }
                              className="text-sm font-medium underline"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              {expandedDecision === (app.id as string)
                                ? 'Verbergen'
                                : 'Bekijk beslissing'}
                            </button>
                          )}
                        </div>
                      </div>
                      {expandedDecision === (app.id as string) && (
                        <DecisionViewer processInstanceId={app.id as string} />
                      )}
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

        {/* ── Mijn toestemming (DvTP) ── */}
        {activeTab === 'mijn-toestemming' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-bold text-gray-800">Mijn toestemming</h2>
              <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
                <button
                  onClick={() => setDvtpSubView('start')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    dvtpSubView === 'start' ? 'text-white' : 'text-gray-600 hover:text-gray-800'
                  }`}
                  style={dvtpSubView === 'start' ? { backgroundColor: 'var(--color-primary)' } : {}}
                >
                  Procedure starten
                </button>
                <button
                  onClick={() => setDvtpSubView('taken')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    dvtpSubView === 'taken' ? 'text-white' : 'text-gray-600 hover:text-gray-800'
                  }`}
                  style={dvtpSubView === 'taken' ? { backgroundColor: 'var(--color-primary)' } : {}}
                >
                  Mijn taken
                </button>
              </div>
            </div>

            {dvtpSubView === 'start' && (
              <DvtpStartSection user={user} onNavigateToTasks={() => setDvtpSubView('taken')} />
            )}

            {dvtpSubView === 'taken' && <DvtpTakenSection user={user} />}
          </div>
        )}
      </main>
    </div>
  );
}
