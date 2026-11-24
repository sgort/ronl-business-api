/**
 * Project › Documenten: every document one phase instance declares, with its
 * werkwijze, producing task and role, eDOCS number and version, and status;
 * under it, for a phase with a kredietcheck, the Beslispunt strip.
 */
import { useInstanceDocuments } from '../../services/infra.api';
import type { InstanceDocument, KredietCheck } from '../../services/rip-documents.types';
import {
  euro,
  figureDef,
  kredietSuggestion,
  OPTIONAL_CONDITIONS,
  shortDate,
  STATUS,
} from './model';
import { KindChip } from './TaskDocuments';
import './rip-documents.css';

interface Props {
  /** The phase instance; null shows nothing. */
  instanceId: string | null;
  phaseCode: string;
  /** Opens the task that produces a missing document, when it is open for this user. */
  onOpenTask?: (taskKey: string) => void;
  /** Task keys that are open for this user, so "Taak openen" is only offered where it works. */
  openTaskKeys?: Set<string>;
  /** Changes when the documents should be read again (a task was completed). */
  refreshKey?: number;
}

/** Candidate groups as the people who hold them: rip-projectleider -> Projectleider. */
const roleLabel = (groups: string[]) =>
  groups
    .map((g) => g.replace(/^rip-/, '').replace(/-/g, ' '))
    .map((g) => g.charAt(0).toUpperCase() + g.slice(1))
    .join(', ');

function DocRow({
  d,
  onOpenTask,
  openTaskKeys,
}: {
  d: InstanceDocument;
  onOpenTask?: (taskKey: string) => void;
  openTaskKeys?: Set<string>;
}) {
  const st = STATUS[d.status];
  const present = d.checklist?.filter((c) => c.present).length ?? 0;
  return (
    <tr className={d.status === 'missing' ? 'is-miss' : ''}>
      <td className="nm">
        {d.label}
        {d.format && <span className="fmt">format {d.format}</span>}
        {d.optional && (
          <span className="note">
            {OPTIONAL_CONDITIONS[d.slug]?.note ?? 'Alleen nodig onder voorwaarden'}
          </span>
        )}
      </td>
      <td>
        <KindChip kind={d.kind} />
      </td>
      <td className="sm">
        {d.taskName}
        <span className="role">{roleLabel(d.candidateGroups)}</span>
      </td>
      <td className="mono sm">
        {d.edocs ? (
          <>
            {d.edocs.documentNumber}
            <span className="role">
              {[d.edocs.version && `versie ${d.edocs.version}`, shortDate(d.edocs.modified)]
                .filter(Boolean)
                .join(' · ') ||
                (d.edocs.uploadedVia === 'ronl' && d.edocs.inWorkspace === false
                  ? 'geüpload naar eDOCS, niet in de projectmap'
                  : '')}
            </span>
          </>
        ) : (
          <span className="nil">–</span>
        )}
      </td>
      <td>
        <span className={`ripdoc-docst ${st.cls}`}>{st.text}</span>
        {d.map && d.status === 'linked' && d.checklist && (
          <span className="ripdoc-foldst">
            Map · {present}/{d.checklist.length} verplichte documenten aanwezig
          </span>
        )}
        {d.figures && d.status === 'linked' && (
          <dl className="ripdoc-figs">
            {Object.entries(d.figures).map(([k, v]) => {
              const def = figureDef(d.slug, k);
              return (
                <div key={k}>
                  <dt>{def.label}</dt>
                  <dd>{v === null ? '–' : def.unit === 'eur' ? euro(v) : v}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </td>
      <td className="act">
        {d.status === 'missing' && onOpenTask && openTaskKeys?.has(d.taskKey) && (
          <button type="button" className="ripdoc-btn solid" onClick={() => onOpenTask(d.taskKey)}>
            Taak openen
          </button>
        )}
      </td>
    </tr>
  );
}

function Beslispunt({
  kc,
  onOpenTask,
  openTaskKeys,
}: {
  kc: KredietCheck;
  onOpenTask?: (taskKey: string) => void;
  openTaskKeys?: Set<string>;
}) {
  const voorstel = kredietSuggestion(kc.raming, kc.krediet);
  const meaning = (value: string | null) =>
    value === kc.values.binnen ? 'binnen' : value === kc.values.buiten ? 'buiten' : null;
  const answer = meaning(kc.answer);
  return (
    <div className="ripdoc-kcstrip">
      <div className="q">
        <span className="lbl">Beslispunt</span>
        <b>Raming binnen of buiten projectkrediet?</b>
        <span className="role">{kc.taskName}</span>
      </div>
      {kc.raming === null ? (
        <p className="msg">Wacht op de kerngetallen van de raming.</p>
      ) : (
        <div className="body">
          <dl className="ripdoc-kc-nums">
            <div>
              <dt>Raming</dt>
              <dd>{euro(kc.raming)}</dd>
            </div>
            <div>
              <dt>Projectkrediet</dt>
              <dd>{kc.krediet === null ? '–' : euro(kc.krediet)}</dd>
            </div>
            {kc.krediet !== null && (
              <div>
                <dt>Verschil</dt>
                <dd className={kc.raming > kc.krediet ? 'over' : 'under'}>
                  {kc.raming > kc.krediet ? '+ ' : '− '}
                  {euro(Math.abs(kc.raming - kc.krediet))}
                </dd>
              </div>
            )}
          </dl>
          {answer ? (
            <div className="act">
              <span>
                Bevestigd: <b>{answer} projectkrediet</b>
                {voorstel && answer !== voorstel && (
                  <span className="dev"> · afwijkend van voorstel</span>
                )}
              </span>
              {kc.afwijking && <span className="reason">Reden: {kc.afwijking}</span>}
            </div>
          ) : (
            <div className="act">
              {voorstel ? (
                <span>
                  Voorstel IOU: <b>{voorstel} projectkrediet</b>
                </span>
              ) : (
                <span>Het projectkrediet wordt bij de taak ingevuld.</span>
              )}
              {onOpenTask && openTaskKeys?.has(kc.taskKey) && (
                <button
                  type="button"
                  className="ripdoc-btn solid"
                  onClick={() => onOpenTask(kc.taskKey)}
                >
                  Taak openen
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentsPanel({
  instanceId,
  phaseCode,
  onOpenTask,
  openTaskKeys,
  refreshKey = 0,
}: Props) {
  const { data, loading, error } = useInstanceDocuments(instanceId, refreshKey);
  if (!instanceId) return null;
  if (loading && !data) return <p className="pb-placeholder">Documenten laden…</p>;
  if (error || !data?.documents) return null;
  if (data.documents.length === 0 && (data.kredietChecks ?? []).length === 0) return null;

  return (
    <div className="ripdoc-panel">
      <div className="ripdoc-panel-head">
        <span>Documenten {phaseCode}</span>
        <span className="legend">
          <span>
            <KindChip kind="A" /> in de IOU, document gegenereerd
          </span>
          <span>
            <KindChip kind="B" /> in eDOCS, gekoppeld
          </span>
          <span>
            <KindChip kind="BP" /> in eDOCS, met kerngetallen
          </span>
        </span>
      </div>
      <table className="ripdoc-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Werkwijze</th>
            <th>Taak · rol</th>
            <th>eDOCS</th>
            <th>Status</th>
            <th>
              <span className="sr">Actie</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.documents.map((d) => (
            <DocRow key={d.slug} d={d} onOpenTask={onOpenTask} openTaskKeys={openTaskKeys} />
          ))}
        </tbody>
      </table>
      {(data.kredietChecks ?? []).map((kc) => (
        <Beslispunt key={kc.taskKey} kc={kc} onOpenTask={onOpenTask} openTaskKeys={openTaskKeys} />
      ))}
    </div>
  );
}
