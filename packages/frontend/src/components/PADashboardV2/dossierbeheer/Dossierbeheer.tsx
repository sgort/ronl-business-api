/**
 * Dossierbeheer — Beheer → Strategisch kompas → Dossierbeheer.
 *
 * The authoring SOURCE for /pa/dossiers: create · administer · archive
 * (Archiefwet) · delete. Owns its own admin list (a superset of the cockpit's
 * published, non-archived resource), and after every mutation refetches both
 * its list and usePaData().dossiers so the cockpit stays in sync — without
 * touching shell state (the additive-screen guardrail).
 *
 * The active role + capabilities are derived from the Keycloak token; the role
 * bar reflects that (it is not an interactive permission switcher).
 */

import { useCallback, useEffect, useState } from 'react';
import type { AdminDossier, DossierSnippet, DossierTemplate, KeycloakUser } from '@ronl/shared';
import { usePaData } from '../../../pages/public-affairs-v2/PaDataProvider';
import {
  DB_ROLES,
  DB_CAPS,
  deriveDossierRole,
  expandVars,
  todayLabel,
} from '../../../pages/public-affairs-v2/dossierbeheer.data';
import {
  fetchAdminDossiers,
  fetchTemplates,
  fetchSnippets,
  createDossier,
  updateDossier,
  archiveDossier,
  unarchiveDossier,
  deleteDossier,
  type DossierWriteInput,
} from '../../../services/dossierbeheer.api';
import { isDossiersMock, setDossiersMock } from '../../../services/pa.api';
import type { PaModeId } from '../../../pages/public-affairs-v2/modes.config';
import DossierRow from './DossierRow';
import DossierEditor from './DossierEditor';
import TemplateGallery from './TemplateGallery';
import ArchiveDialog from './ArchiveDialog';
import DeleteDialog from './DeleteDialog';
import '../../../pages/public-affairs-v2/dossierbeheer.css';

type View =
  | { mode: 'list' }
  | { mode: 'template' }
  | { mode: 'edit'; isNew: boolean; id?: string; draft?: AdminDossier };

interface Props {
  user: KeycloakUser | null;
  startCreate?: boolean;
  /** Shell navigation, so the create flow uses the real rail section (db-nieuw)
   *  instead of an internal-only view — keeping the rail and content in sync. */
  onNavigate?: (mode: PaModeId, sectionId: string) => void;
}

export default function Dossierbeheer({ user, startCreate = false, onNavigate }: Props) {
  const { dossiers } = usePaData();

  const role = deriveDossierRole(user?.roles ?? []);
  const can = role.can;
  const currentUser = user?.name ?? user?.preferred_username ?? 'Kernteam PA';

  const [items, setItems] = useState<AdminDossier[]>([]);
  const [templates, setTemplates] = useState<DossierTemplate[]>([]);
  const [snippets, setSnippets] = useState<DossierSnippet[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [view, setView] = useState<View>(startCreate ? { mode: 'template' } : { mode: 'list' });
  const [archiveTarget, setArchiveTarget] = useState<AdminDossier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDossier | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mockDisplay, setMockDisplay] = useState(isDossiersMock());

  const refetch = useCallback(() => {
    setStatus('loading');
    fetchAdminDossiers()
      .then((rows) => {
        setItems(rows);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    refetch();
    fetchTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
    fetchSnippets()
      .then(setSnippets)
      .catch(() => setSnippets([]));
  }, [refetch]);

  const syncCockpit = () => dossiers.refetch();

  // Enter the create flow via the rail section (db-nieuw) so the rail highlight
  // and the content stay in sync; falls back to the internal view when the shell
  // navigator isn't wired.
  const startCreateFlow = () => {
    if (onNavigate) onNavigate('beheer', 'db-nieuw');
    else setView({ mode: 'template' });
  };

  // Return to the overview. From the create section (db-nieuw) that means a real
  // shell nav back to db-overzicht; from the overview's own sub-views (edit) a
  // same-section nav would be a no-op, so reset the internal view instead.
  const goToOverview = () => {
    if (startCreate && onNavigate) onNavigate('beheer', 'db-overzicht');
    else setView({ mode: 'list' });
  };

  // Flip the persisted mock/live override, then re-read both this surface and
  // the cockpit so the choice takes effect and survives navigation + reloads.
  const toggleMock = () => {
    const next = !mockDisplay;
    setDossiersMock(next);
    setMockDisplay(next);
    refetch();
    syncCockpit();
  };

  const draftFromTemplate = (tpl: DossierTemplate): AdminDossier => {
    const ctx = { today: todayLabel(), currentUser };
    return {
      id: '',
      naam: '',
      onderwerp: tpl.seed.onderwerp || '',
      status: 'actief',
      momentum: 'flat',
      eigenaar: currentUser,
      kompas: {},
      md: {
        waaromNu: expandVars(tpl.seed.waaromNu || '', ctx),
        waarover: expandVars(tpl.seed.waarover || '', ctx),
        onsVerhaal: expandVars(tpl.seed.onsVerhaal || '', ctx),
      },
      versie: 1,
      gepubliceerd: false,
      sjabloon: tpl.id,
      archief: null,
      bewerkt: 'nu',
      versies: [],
    };
  };

  // gepubliceerd is only sent when actually publishing (publish=true) — an
  // edit-only save must never resend the current value, since the backend
  // treats gepubliceerd:true in the body as a publish attempt regardless of
  // whether it's a no-op, and 403s a pa-author saving edits to a dossier
  // that's already published (see PATCH /pa/dossiers/:id, FORBIDDEN_PUBLISH).
  const toWriteInput = (d: AdminDossier, publish: boolean): DossierWriteInput => ({
    naam: d.naam,
    onderwerp: d.onderwerp,
    status: d.status,
    momentum: d.momentum,
    eigenaar: d.eigenaar,
    kompas: d.kompas,
    md: d.md,
    sjabloon: d.sjabloon,
    ...(publish ? { gepubliceerd: true } : {}),
  });

  const handleSave = async (draft: AdminDossier, publish: boolean) => {
    setBusy(true);
    setActionError(null);
    const isEdit = view.mode === 'edit' && !view.isNew && Boolean(draft.id);
    try {
      if (isEdit) {
        await updateDossier(draft.id, toWriteInput(draft, publish));
      } else {
        await createDossier(toWriteInput(draft, publish));
      }
      refetch();
      syncCockpit();
      // Edit stays in the overview (same section); create returns from db-nieuw.
      if (isEdit) setView({ mode: 'list' });
      else goToOverview();
    } catch {
      setActionError('Opslaan is mislukt. Controleer de verbinding en probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (meta: {
    classificatie: 'openbaar' | 'intern' | 'vertrouwelijk';
    bewaartermijn: 'V5' | 'V10' | 'V20' | 'B';
    reden: string;
  }) => {
    if (!archiveTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await archiveDossier(archiveTarget.id, meta);
      refetch();
      syncCockpit();
      setArchiveTarget(null);
      if (view.mode === 'edit') setView({ mode: 'list' });
    } catch {
      setArchiveTarget(null);
      setActionError('Archiveren is mislukt. Probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnarchive = async (d: AdminDossier) => {
    setBusy(true);
    setActionError(null);
    try {
      await unarchiveDossier(d.id);
      refetch();
      syncCockpit();
      if (view.mode === 'edit') setView({ mode: 'list' });
    } catch {
      setActionError('Dearchiveren is mislukt. Probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteDossier(deleteTarget.id);
      refetch();
      syncCockpit();
      setDeleteTarget(null);
      if (view.mode === 'edit') setView({ mode: 'list' });
    } catch {
      setDeleteTarget(null);
      setActionError('Verwijderen is mislukt. Probeer het opnieuw.');
    } finally {
      setBusy(false);
    }
  };

  // Shared banner for handleSave/handleArchive/handleUnarchive/handleDelete
  // failures — rendered in both the edit view and the overview below, since
  // a save can fail while the user is still in the editor (the view only
  // returns to 'list' on success).
  const actionErrorBanner = actionError && (
    <div className="pac-db-actionerror">
      <span>⚠ {actionError}</span>
      <button type="button" onClick={() => setActionError(null)} aria-label="Sluiten">
        ✕
      </button>
    </div>
  );

  // ── Create / edit views ──────────────────────────────────────────
  if (view.mode === 'template') {
    return (
      <TemplateGallery
        templates={templates}
        onPick={(tpl) => setView({ mode: 'edit', isNew: true, draft: draftFromTemplate(tpl) })}
        onCancel={goToOverview}
      />
    );
  }

  if (view.mode === 'edit') {
    const record = view.isNew ? view.draft : items.find((i) => i.id === view.id);
    if (!record) {
      return (
        <div className="pac-db">
          <div className="pac-db-empty">Dossier niet gevonden.</div>
        </div>
      );
    }
    return (
      <>
        {actionErrorBanner}
        <DossierEditor
          record={record}
          isNew={view.isNew}
          can={can}
          snippets={snippets}
          currentUser={currentUser}
          busy={busy}
          onSave={handleSave}
          onCancel={goToOverview}
          onArchive={(dd) => setArchiveTarget(dd)}
          onUnarchive={handleUnarchive}
          onDelete={(dd) => setDeleteTarget(dd)}
        />
        {archiveTarget && (
          <ArchiveDialog
            dossier={archiveTarget}
            busy={busy}
            onConfirm={handleArchive}
            onClose={() => setArchiveTarget(null)}
          />
        )}
        {deleteTarget && (
          <DeleteDialog
            dossier={deleteTarget}
            busy={busy}
            onConfirm={handleDelete}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </>
    );
  }

  // ── Overview ─────────────────────────────────────────────────────
  const actief = items.filter((i) => i.status === 'actief');
  const sluimerend = items.filter((i) => i.status === 'sluimerend');
  const gearchiveerd = items.filter((i) => i.status === 'gearchiveerd');
  const groups = [
    { key: 'actief', label: 'Actief', rows: actief },
    { key: 'sluimerend', label: 'Sluimerend', rows: sluimerend },
    { key: 'gearchiveerd', label: 'Gearchiveerd', rows: gearchiveerd },
  ].filter((g) => g.rows.length);

  const rowProps = {
    can,
    onEdit: (d: AdminDossier) => setView({ mode: 'edit', isNew: false, id: d.id }),
    onArchive: (d: AdminDossier) => setArchiveTarget(d),
    onUnarchive: handleUnarchive,
    onDelete: (d: AdminDossier) => setDeleteTarget(d),
  };

  return (
    <div className="pac-db">
      <div className="pac-spec-eyebrow">Strategisch kompas · configuratie</div>
      <h1 className="pac-beheer-title">Dossierbeheer</h1>
      <p className="pac-spec-intro">
        De <b>bron</b> voor <code>/pa/dossiers</code>. Hier maakt het kernteam dossiers aan, beheert
        het lopende dossiers en archiveert of verwijdert het afgeronde. Verhaalvelden worden als{' '}
        <b>Markdown</b> geschreven (sjablonen + snippets), met versiegeschiedenis per dossier.
        Kompas-<b>startscores</b> zet je hier; <b>herscoren</b> gebeurt in{' '}
        <b>Voortgang → Kompas-log</b>.
      </p>

      {/* Role bar — reflects the token-derived role (not a permission switcher). */}
      <div className="pac-db-rolebar">
        <span className="pac-db-rolebar-label">Rol</span>
        <span className="pac-db-roleseg">
          {DB_ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`pac-db-roleseg-btn ${role.id === r.id ? 'active' : ''}`}
              disabled
              title="De rol volgt uit je Keycloak-rechten"
            >
              {r.label}
            </button>
          ))}
        </span>
        <span className="pac-db-caps">
          {DB_CAPS.map((c) => (
            <span key={c.key} className={`pac-db-cap ${can[c.key] ? 'on' : 'off'}`}>
              {c.label}
            </span>
          ))}
        </span>
        <span className="pac-db-role-note">
          {role.note} <span className="pac-db-role-kc">· Keycloak: {role.keycloak}</span>
        </span>
      </div>

      {/* Flag / source banner */}
      <div className={`pac-db-flag ${mockDisplay ? 'mock' : 'live'}`}>
        <span className="pac-db-flag-icon">{mockDisplay ? '⚑' : '✓'}</span>
        <span>
          {mockDisplay ? (
            <>
              Dossiers resolven nu naar <code>MOCK_DOSSIERS</code> omdat{' '}
              <code>VITE_PA_DOSSIERS_MOCK=true</code>. Zodra deze bron gevuld is en de GET-routes
              onder het auth-blok staan, kan de vlag om — de cockpit leest dan deze dossiers via{' '}
              <code>usePaData().dossiers</code>.
            </>
          ) : (
            <>
              Vlag om: <code>VITE_PA_DOSSIERS_MOCK=false</code>. De cockpit leest deze dossiers live
              via <code>GET /pa/dossiers</code> — geen frontendwijziging nodig, exact de seam die de
              rework kocht.
            </>
          )}
        </span>
        <button type="button" className="pac-db-abtn pac-db-flag-toggle" onClick={toggleMock}>
          {mockDisplay ? 'Zet vlag om naar live →' : '↩ Terug naar mock'}
        </button>
      </div>

      {/* Stats */}
      <div className="pac-db-stats">
        <div className="pac-db-stat">
          <span className="pac-db-stat-n">{actief.length}</span>
          <span className="pac-db-stat-l">actief</span>
        </div>
        <div className="pac-db-stat">
          <span className="pac-db-stat-n">{sluimerend.length}</span>
          <span className="pac-db-stat-l">sluimerend</span>
        </div>
        <div className="pac-db-stat">
          <span className="pac-db-stat-n">{gearchiveerd.length}</span>
          <span className="pac-db-stat-l">gearchiveerd</span>
        </div>
        <div className="pac-db-stat">
          <span className="pac-db-stat-n">{items.filter((i) => i.gepubliceerd).length}</span>
          <span className="pac-db-stat-l">gepubliceerd in de cockpit</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="pac-db-toolbar">
        <button
          type="button"
          className="pac-btn-primary"
          disabled={!can.create}
          onClick={startCreateFlow}
        >
          + Nieuw dossier
        </button>
        {!can.create && (
          <span className="pac-db-toolbar-note">🔒 Aanmaken vereist minimaal rol Auteur.</span>
        )}
        <span className="pac-db-toolbar-note">
          Beheerd via <code>POST/PATCH/DELETE /pa/dossiers</code>.
        </span>
      </div>

      {actionErrorBanner}

      {status === 'loading' && <div className="pac-db-empty">Dossiers laden…</div>}
      {status === 'error' && (
        <div className="pac-db-empty">
          Kon dossiers niet laden.{' '}
          <button type="button" onClick={refetch}>
            Opnieuw proberen
          </button>
        </div>
      )}

      {status === 'ok' && groups.length === 0 && (
        <div className="pac-db-empty">Nog geen dossiers. Maak het eerste dossier aan.</div>
      )}

      {/* Groups */}
      {status === 'ok' &&
        groups.map((g) => (
          <div key={g.key} className="pac-db-group">
            <div className="pac-db-group-head">
              <span className="pac-db-group-label">{g.label}</span>
              <span className="pac-db-group-count">{g.rows.length}</span>
            </div>
            <div className="pac-db-list">
              {g.rows.map((d) => (
                <DossierRow key={d.id} d={d} {...rowProps} />
              ))}
            </div>
          </div>
        ))}

      {archiveTarget && (
        <ArchiveDialog
          dossier={archiveTarget}
          busy={busy}
          onConfirm={handleArchive}
          onClose={() => setArchiveTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteDialog
          dossier={deleteTarget}
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
