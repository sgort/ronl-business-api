import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';
import RipFase1WipViewer from './RipFase1WipViewer';

interface RipGereedProject {
  id: string;
  startTime: string;
  endTime: string;
  projectNumber: string;
  projectName: string;
  edocsWorkspaceId: string;
}

interface Props {
  user: KeycloakUser | null;
}

export default function RipFase1GereedSection({ user }: Props) {
  const [projects, setProjects] = useState<RipGereedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const isInfraTeam = user?.roles?.includes('infra-projectteam');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.rip.phase1Completed();
      if (res.success && res.data) setProjects(res.data);
      else setError('Projecten konden niet worden geladen.');
    } catch {
      setError('Projecten konden niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isInfraTeam) load();
  }, [isInfraTeam]);

  if (!isInfraTeam) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
          <p className="text-gray-400 text-sm">
            Alleen leden van het infra-projectteam kunnen afgeronde RIP Fase 1 projecten inzien.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-3">
        {[1, 2].map((n) => (
          <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        Geen afgeronde RIP Fase 1 projecten gevonden.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      {projects.map((project) => (
        <div
          key={project.id}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden"
        >
          <button
            onClick={() => setSelectedId(selectedId === project.id ? null : project.id)}
            className="w-full text-left p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-medium text-gray-800 text-sm">
                {project.projectName !== '—' ? project.projectName : 'Naamloos project'}
                <span className="ml-2 text-gray-400 font-normal">{project.projectNumber}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Werkruimte: {project.edocsWorkspaceId} · Afgerond op{' '}
                {new Date(project.endTime).toLocaleDateString('nl-NL')}
              </p>
            </div>
            <span className="text-gray-400 text-lg">{selectedId === project.id ? '▲' : '▼'}</span>
          </button>
          {selectedId === project.id && (
            <div className="border-t border-gray-100">
              <RipFase1WipViewer instanceId={project.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
