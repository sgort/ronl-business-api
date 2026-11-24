/**
 * "Documenten bij deze taak": what a task needs from eDOCS before it can be
 * completed (Infra-board, werkwijze B / B+). Pick a document (or, for a map,
 * a folder) from the project's eDOCS map, or upload one; enter the key
 * figures of a B+ document; answer the kredietcheck. The block tells its
 * parent what is still missing and which variables the completion carries;
 * the server checks the same again.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Task } from '@ronl/shared';
import { businessApi } from '../../services/api';
import { useInstanceDocuments } from '../../services/infra.api';
import type {
  InstanceDocument,
  KredietCheck,
  MissingItem,
  WorkspaceItem,
} from '../../services/rip-documents.types';
import { problemMessage } from '../../utils/problem';
import {
  documentErrorText,
  euro,
  figureDef,
  formatAmountInput,
  KIND,
  linkedDocsOfTask,
  OPTIONAL_CONDITIONS,
  PREFILL_SOURCE,
  optionalRequired,
  shortDate,
  taskCompletionState,
  type TaskCompletionState,
} from './model';
import './rip-documents.css';

/** Largest file the IOU sends; the backend refuses above EDOCS_LINKED_UPLOAD_MAX_MB (default 20). */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface TaskDocumentsState {
  /** Footer text of what is still needed; null when complete (or nothing is asked). */
  blockedText: string | null;
  variables: Record<string, unknown>;
}

interface Props {
  task: Pick<Task, 'id' | 'processInstanceId' | 'taskDefinitionKey'>;
  /** Current values of the task's form (for the inkoopplan choice). */
  formData: Record<string, unknown>;
  /** The server's refusal list after a 422, shown until the next change. */
  serverMissing: MissingItem[] | null;
  onState: (state: TaskDocumentsState) => void;
}

export function KindChip({ kind }: { kind: InstanceDocument['kind'] }) {
  return (
    <span className={`ripdoc-kind ${KIND[kind].cls}`} title={KIND[kind].long}>
      {KIND[kind].tag}
    </span>
  );
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function TaskDocuments({ task, formData, serverMissing, onState }: Props) {
  const instanceId = task.processInstanceId;
  const { data, loading, error, reload } = useInstanceDocuments(instanceId);
  const docs = useMemo(
    () => linkedDocsOfTask(data?.documents ?? [], task.taskDefinitionKey),
    [data, task.taskDefinitionKey]
  );
  const check: KredietCheck | undefined = data?.kredietChecks?.find(
    (c) => c.taskKey === task.taskDefinitionKey
  );
  const asks = docs.length > 0 || !!check;

  const [workspace, setWorkspace] = useState<WorkspaceItem[] | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [figures, setFigures] = useState<Record<string, Record<string, string>>>({});
  const [krediet, setKrediet] = useState('');
  const [choice, setChoice] = useState<'binnen' | 'buiten' | null>(null);
  const [reason, setReason] = useState('');

  // The projectmap is listed once there is something to pick for.
  const wantsWorkspace = docs.some((d) => d.status !== 'later');
  const [workspaceTick, setWorkspaceTick] = useState(0);
  useEffect(() => {
    if (!wantsWorkspace) return;
    let alive = true;
    businessApi.rip
      .workspace(instanceId)
      .then((res) => {
        if (!alive) return;
        if (res.success && res.data) setWorkspace(res.data.items);
        else setWorkspaceError('De eDOCS-projectmap kon niet worden geopend.');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const body = (err as { response?: { data?: unknown } })?.response?.data;
        setWorkspaceError(
          documentErrorText(body, 'De eDOCS-projectmap kon niet worden geopend.', problemMessage)
        );
      });
    return () => {
      alive = false;
    };
  }, [instanceId, wantsWorkspace, workspaceTick]);

  // Prefill the krediet with what the instance already holds, else with what
  // an earlier phase recorded; the person confirms or changes it.
  const kredietStart = check?.krediet ?? check?.kredietPrefill ?? null;
  useEffect(() => {
    if (kredietStart != null && krediet === '') setKrediet(kredietStart.toLocaleString('nl-NL'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kredietStart]);

  // Prefill figures an earlier phase recorded (the DO raming starts from the
  // VO raming), only into fields still empty: a value typed here is kept.
  const prefills = useMemo(
    () => docs.flatMap((d) => (d.prefill ? [[d.slug, d.prefill] as const] : [])),
    [docs]
  );
  useEffect(() => {
    if (prefills.length === 0) return;
    setFigures((current) => {
      const next = { ...current };
      for (const [slug, values] of prefills) {
        const typed = { ...(next[slug] ?? {}) };
        for (const [key, value] of Object.entries(values)) {
          if (value === null || (typed[key] ?? '') !== '') continue;
          typed[key] =
            figureDef(slug, key).unit === 'eur' ? value.toLocaleString('nl-NL') : String(value);
        }
        next[slug] = typed;
      }
      return next;
    });
  }, [prefills]);

  const linked = useMemo(
    () => new Set(docs.filter((d) => d.status === 'linked').map((d) => d.slug)),
    [docs]
  );
  const state: TaskCompletionState = useMemo(
    () =>
      taskCompletionState(docs, {
        linked,
        figures,
        checklists: Object.fromEntries(
          docs.filter((d) => d.map && d.checklist).map((d) => [d.slug, d.checklist ?? []])
        ),
        formData,
        ...(check ? { kredietcheck: { check, krediet, choice, reason } } : {}),
      }),
    [docs, linked, figures, formData, check, krediet, choice, reason]
  );

  const blockedText = loading && !data ? 'documenten laden' : state.missing.join(' · ') || null;
  useEffect(() => {
    onState({ blockedText: asks || loading ? blockedText : null, variables: state.variables });
    // onState is the parent's setter; leaving it out keeps this from looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedText, state.variables, asks, loading]);

  if (loading && !data) return <p className="v2-taken-state">Documenten laden…</p>;
  if (error) {
    return (
      <p className="v2-taken-state" role="alert">
        De documenten van deze taak konden niet worden geladen.
      </p>
    );
  }
  if (!asks) return null;

  // Read the projectmap again, e.g. after making a folder in eDOCS itself.
  const reloadWorkspace = () => {
    setWorkspaceError(null);
    setWorkspaceTick((t) => t + 1);
  };

  const link = async (doc: InstanceDocument, item: WorkspaceItem) => {
    setBusy(doc.slug);
    setActionError(null);
    try {
      await businessApi.rip.linkDocument(instanceId, doc.slug, item.id);
      reload();
      // The projectmap changed too (an upload is filed into it): read it again.
      setWorkspaceTick((t) => t + 1);
    } catch (err) {
      const body = (err as { response?: { data?: unknown } })?.response?.data;
      setActionError(documentErrorText(body, 'Koppelen mislukt.', problemMessage));
    } finally {
      setBusy(null);
    }
  };

  const upload = async (doc: InstanceDocument, file: File) => {
    setActionError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setActionError('Het bestand is groter dan 20 MB.');
      return;
    }
    setBusy(doc.slug);
    try {
      const base64 = await readAsBase64(file);
      await businessApi.rip.uploadDocument(instanceId, doc.slug, file.name, base64);
      reload();
      // The projectmap changed too (an upload is filed into it): read it again.
      setWorkspaceTick((t) => t + 1);
    } catch (err) {
      const body = (err as { response?: { data?: unknown } })?.response?.data;
      setActionError(documentErrorText(body, 'Uploaden mislukt.', problemMessage));
    } finally {
      setBusy(null);
    }
  };

  const toWorkspace = data?.uploadTarget === 'workspace';

  return (
    <section className="ripdoc-task" aria-labelledby={`ripdoc-h-${task.id}`}>
      <h3 id={`ripdoc-h-${task.id}`}>Documenten bij deze taak</h3>
      {docs.length > 0 && (
        <p className="ripdoc-intro">
          {docs.every((d) => d.map)
            ? 'Deze taak levert een map in eDOCS op. Koppel de map; de IOU controleert of de verplichte documenten erin staan.'
            : `Deze taak levert ${docs.length === 1 ? 'een document' : `${docs.length} documenten`} op dat in eDOCS blijft. Koppel het uit de projectmap of upload het; de IOU bewaart het documentnummer en toont daarna altijd de laatste versie.`}
        </p>
      )}

      {docs.map((d) => {
        const required = !d.optional || optionalRequired(d.slug, formData);
        const rows = (workspace ?? []).filter((i) => i.isFolder === d.map);
        const current = d.edocs;
        const currentInList = !!current && rows.some((r) => r.id === current.documentId);
        return (
          <div className="ripdoc-doc" key={d.slug}>
            <h4>
              {d.label} <KindChip kind={d.kind} />
              {d.format && <span className="ripdoc-fmt">format {d.format}</span>}
            </h4>
            {d.optional && (
              <p className="ripdoc-note">
                {OPTIONAL_CONDITIONS[d.slug]?.note ?? 'Alleen nodig onder voorwaarden.'}
                {!required && ' Volgens het formulier nu niet nodig.'}
              </p>
            )}

            {workspaceError ? (
              <p className="ripdoc-error" role="alert">
                {workspaceError}
              </p>
            ) : workspace === null ? (
              <p className="ripdoc-note">Projectmap laden…</p>
            ) : (
              <fieldset className="ripdoc-ws" disabled={busy === d.slug}>
                <legend>{d.map ? 'Map kiezen' : 'Kiezen'} uit de projectmap in eDOCS</legend>
                {current && !currentInList && (
                  <label className="ripdoc-ws-row on">
                    <input type="radio" name={`ripdoc-pick-${d.slug}`} checked readOnly />
                    <span className="n">
                      {current.name ?? 'Gekoppeld document'}
                      {current.uploadedVia === 'ronl' && current.inWorkspace === false && (
                        <span className="ripdoc-sub-note">
                          Geüpload naar eDOCS, niet in de projectmap
                        </span>
                      )}
                    </span>
                    <span className="m mono">{current.documentNumber}</span>
                    <span className="m">
                      {current.version ? `v${current.version}` : ''}
                      {current.modified ? ` · ${shortDate(current.modified)}` : ''}
                    </span>
                  </label>
                )}
                {rows.length === 0 && !current && (
                  <div className="ripdoc-up">
                    <button type="button" className="ripdoc-btn" onClick={reloadWorkspace}>
                      Opnieuw laden
                    </button>
                    <span>
                      {d.map
                        ? 'Geen mappen in de projectmap. Maak in eDOCS een map aan in de projectmap en laad de lijst opnieuw.'
                        : 'Geen documenten in de projectmap. Upload hieronder een bestand, of zet het in eDOCS in de projectmap en laad de lijst opnieuw.'}
                    </span>
                  </div>
                )}
                {rows.map((r) => (
                  <label
                    key={r.id}
                    className={`ripdoc-ws-row ${current?.documentId === r.id ? 'on' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`ripdoc-pick-${d.slug}`}
                      checked={current?.documentId === r.id}
                      onChange={() => link(d, r)}
                    />
                    <span className="n">{r.name}</span>
                    <span className="m mono">{r.documentNumber}</span>
                    <span className="m">
                      {[r.version && `v${r.version}`, shortDate(r.modified), r.author]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {!d.map && !workspaceError && (
              <div className="ripdoc-up">
                <label className="ripdoc-btn ripdoc-file">
                  {toWorkspace
                    ? 'Bestand uploaden naar projectmap…'
                    : 'Bestand uploaden naar eDOCS…'}
                  <input
                    type="file"
                    disabled={busy === d.slug}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void upload(d, f);
                    }}
                  />
                </label>
                <span>
                  {toWorkspace
                    ? 'Komt in de projectmap met het projectnummer.'
                    : 'Komt in eDOCS met het projectnummer, nog niet in de projectmap.'}
                </span>
              </div>
            )}

            {d.map && current && (
              <div className="ripdoc-check">
                <p className="ripdoc-sub">
                  Verplichte documenten in deze map
                  <span className="ripdoc-eg">
                    voorbeeldlijst — RIP-team levert de definitieve lijst
                  </span>
                </p>
                <ul>
                  {(d.checklist ?? []).map((c) => (
                    <li key={c.item} className={c.present ? 'ok' : 'miss'}>
                      <span className="mk" aria-hidden="true">
                        {c.present ? '✓' : '!'}
                      </span>
                      <span className="nm">{c.item}</span>
                      <span className="st">{c.present ? 'Aanwezig' : 'Ontbreekt in de map'}</span>
                    </li>
                  ))}
                </ul>
                <div className="ripdoc-up">
                  <button type="button" className="ripdoc-btn" onClick={reload}>
                    Map opnieuw controleren
                  </button>
                  <span>Zet ontbrekende documenten in eDOCS in deze map.</span>
                </div>
              </div>
            )}

            {d.figures && (
              <div className="ripdoc-figin">
                <p className="ripdoc-sub">Kerngetallen uit {d.label}</p>
                {d.prefill && (
                  <p className="ripdoc-note">
                    Vooraf ingevuld met de getallen uit een eerdere fase
                    {PREFILL_SOURCE[d.slug] ? ` (${PREFILL_SOURCE[d.slug]})` : ''}. Controleer ze en
                    pas aan waar het rekenblad afwijkt.
                  </p>
                )}
                {Object.keys(d.figures).map((key) => {
                  const def = figureDef(d.slug, key);
                  const id = `ripdoc-fig-${task.id}-${d.slug}-${key}`;
                  return (
                    <div className="ripdoc-figin-row" key={key}>
                      <label htmlFor={id}>{def.label}</label>
                      <span className="ripdoc-figin-in">
                        {def.unit === 'eur' && <span aria-hidden="true">€</span>}
                        <input
                          id={id}
                          inputMode="numeric"
                          placeholder={def.unit === 'jaar' ? '2026' : '0'}
                          value={figures[d.slug]?.[key] ?? ''}
                          onChange={(e) => {
                            const v =
                              def.unit === 'eur'
                                ? formatAmountInput(e.target.value)
                                : e.target.value;
                            setFigures((f) => ({
                              ...f,
                              [d.slug]: { ...(f[d.slug] ?? {}), [key]: v },
                            }));
                          }}
                        />
                      </span>
                    </div>
                  );
                })}
                <p className="ripdoc-note">
                  Neem de getallen over uit het rekenblad. De IOU rekent niet na; het rekenmodel
                  blijft de bron.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {check && state.krediet && (
        <div className="ripdoc-doc ripdoc-kc">
          <h4>Kredietcheck</h4>
          <div className="ripdoc-figin-row">
            <label htmlFor={`ripdoc-krediet-${task.id}`}>Beschikbaar projectkrediet</label>
            <span className="ripdoc-figin-in">
              <span aria-hidden="true">€</span>
              <input
                id={`ripdoc-krediet-${task.id}`}
                inputMode="numeric"
                placeholder="0"
                value={krediet}
                onChange={(e) => setKrediet(formatAmountInput(e.target.value))}
              />
            </span>
          </div>
          {check.krediet === null && check.kredietPrefill != null && (
            <p className="ripdoc-note">
              Vooraf ingevuld met het projectkrediet uit een eerdere fase. Controleer het en pas aan
              als het krediet sindsdien is gewijzigd.
            </p>
          )}
          {state.krediet.raming !== null && state.krediet.krediet !== null && (
            <dl className="ripdoc-kc-nums">
              <div>
                <dt>Raming</dt>
                <dd>{euro(state.krediet.raming)}</dd>
              </div>
              <div>
                <dt>Projectkrediet</dt>
                <dd>{euro(state.krediet.krediet)}</dd>
              </div>
              <div>
                <dt>Verschil</dt>
                <dd className={state.krediet.raming > state.krediet.krediet ? 'over' : 'under'}>
                  {state.krediet.raming > state.krediet.krediet ? '+ ' : '− '}
                  {euro(Math.abs(state.krediet.raming - state.krediet.krediet))}
                </dd>
              </div>
            </dl>
          )}
          {!state.krediet.voorstel && (
            <p className="ripdoc-note">
              Vul het totaal van de raming en het projectkrediet in; de IOU vergelijkt ze en doet
              een voorstel.
            </p>
          )}
          <fieldset className="ripdoc-choice">
            <legend>Raming binnen het projectkrediet?</legend>
            {(['binnen', 'buiten'] as const).map((k) => (
              <label key={k} className={state.krediet?.keuze === k ? 'on' : ''}>
                <input
                  type="radio"
                  name={`ripdoc-kc-${task.id}`}
                  checked={state.krediet?.keuze === k}
                  onChange={() => setChoice(k)}
                />
                {k === 'binnen' ? 'Binnen projectkrediet' : 'Buiten projectkrediet'}
                {k === state.krediet?.voorstel && <span className="sug">voorstel</span>}
              </label>
            ))}
          </fieldset>
          {state.krediet.deviates && (
            <div className="ripdoc-reason">
              <label htmlFor={`ripdoc-reden-${task.id}`}>
                Reden voor afwijken van het voorstel
              </label>
              <input
                id={`ripdoc-reden-${task.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="bijv. indexatie krediet nog niet verwerkt"
              />
            </div>
          )}
          {state.krediet.keuze && (
            <p className="ripdoc-note">
              Gaat als{' '}
              <code>
                {check.variable} = "{check.values[state.krediet.keuze]}"
              </code>{' '}
              naar het proces.
            </p>
          )}
        </div>
      )}

      {actionError && (
        <p className="ripdoc-error" role="alert">
          {actionError}
        </p>
      )}
      {serverMissing && serverMissing.length > 0 && (
        <p className="ripdoc-error" role="alert">
          De taak is niet afgerond. Nog nodig: {serverMissing.map((m) => m.label).join(' · ')}.
        </p>
      )}
      <p className="ripdoc-missing" aria-live="polite">
        {state.missing.length ? `Nog nodig: ${state.missing.join(' · ')}` : 'Alles compleet.'}
      </p>
    </section>
  );
}
