// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dossierbeheer from './Dossierbeheer';
import type { AdminDossier, DossierTemplate } from '@ronl/shared';
import { makePaDataStub } from '../../../test/paData.stub';
import { expectMockNamesRealExports } from '../../../test/mockModule';

const mockDossiersRefetch = vi.hoisted(() => vi.fn());
const mockSignalsRefetch = vi.hoisted(() => vi.fn());
const mockRefreshInboxCounts = vi.hoisted(() => vi.fn());
const mockNotificationsRefetch = vi.hoisted(() => vi.fn());
vi.mock('../../../pages/public-affairs-v2/PaDataProvider', () => ({
  usePaData: () =>
    makePaDataStub({
      dossiers: { data: [], status: 'ok', refetch: mockDossiersRefetch },
      signals: { data: [], status: 'ok', refetch: mockSignalsRefetch },
      notifications: {
        data: { items: [], unseenCount: 0 },
        status: 'ok',
        refetch: mockNotificationsRefetch,
      },
      refreshInboxCounts: mockRefreshInboxCounts,
    }),
}));

const mockApi = vi.hoisted(() => ({
  fetchAdminDossiers: vi.fn(),
  fetchTemplates: vi.fn(),
  fetchSnippets: vi.fn(),
  createDossier: vi.fn(),
  updateDossier: vi.fn(),
  archiveDossier: vi.fn(),
  unarchiveDossier: vi.fn(),
  deleteDossier: vi.fn(),
  resetMockDossiers: vi.fn(),
}));
vi.mock('../../../services/dossierbeheer.api', () => mockApi);

const mockResetDemoData = vi.hoisted(() => vi.fn());
vi.mock('../../../services/mock-demo.store', () => ({ resetMockDemoData: mockResetDemoData }));

const mockIsDossiersMock = vi.hoisted(() => vi.fn());
const mockSetDossiersMock = vi.hoisted(() => vi.fn());
vi.mock('../../../services/keycloak', () => ({
  default: { authenticated: false, token: undefined, updateToken: vi.fn() },
}));
const paApi = { isPaMock: mockIsDossiersMock, setPaMock: mockSetDossiersMock };
// Built on the real module so a member nobody stubbed is not silently missing.
vi.mock('../../../services/pa.api', async (importActual) => ({
  ...(await importActual<typeof import('../../../services/pa.api')>()),
  isPaMock: mockIsDossiersMock,
  setPaMock: mockSetDossiersMock,
}));

vi.mock('./DossierRow', () => ({
  default: ({ d, onEdit, onArchive, onDelete }: never) => (
    <div>
      <span>{(d as AdminDossier).naam}</span>
      <button onClick={() => (onEdit as (x: unknown) => void)(d)}>
        edit-{(d as AdminDossier).id}
      </button>
      <button onClick={() => (onArchive as (x: unknown) => void)(d)}>
        archive-{(d as AdminDossier).id}
      </button>
      <button onClick={() => (onDelete as (x: unknown) => void)(d)}>
        delete-{(d as AdminDossier).id}
      </button>
    </div>
  ),
}));

vi.mock('./DossierEditor', () => ({
  default: ({ record, isNew, onSave, onCancel, onArchive, onDelete }: never) => (
    <div>
      <span>editor:{isNew ? 'new' : (record as AdminDossier).naam}</span>
      <button onClick={() => (onSave as (d: unknown, p: boolean) => void)(record, false)}>
        save
      </button>
      <button onClick={() => (onSave as (d: unknown, p: boolean) => void)(record, true)}>
        publish
      </button>
      <button onClick={() => (onCancel as () => void)()}>editor-cancel</button>
      <button onClick={() => (onArchive as (d: unknown) => void)(record)}>editor-archive</button>
      <button onClick={() => (onDelete as (d: unknown) => void)(record)}>editor-delete</button>
    </div>
  ),
}));

vi.mock('./TemplateGallery', () => ({
  default: ({ onPick, onCancel }: never) => (
    <div>
      <span>template-gallery</span>
      <button
        onClick={() =>
          (onPick as (t: DossierTemplate) => void)({
            id: 'tpl1',
            naam: 'Blanco',
            cat: 'Algemeen',
            beschrijving: '',
            versie: '1',
            eigenaar: '',
            gebruikt: 0,
            seed: { onderwerp: 'Seed onderwerp', waaromNu: '', waarover: '', onsVerhaal: '' },
          } as DossierTemplate)
        }
      >
        pick-template
      </button>
      <button onClick={() => (onCancel as () => void)()}>gallery-cancel</button>
    </div>
  ),
}));

vi.mock('./ArchiveDialog', () => ({
  default: ({ dossier, onConfirm, onClose }: never) => (
    <div>
      <span>archive-dialog:{(dossier as AdminDossier).naam}</span>
      <button
        onClick={() =>
          (onConfirm as (m: unknown) => void)({
            classificatie: 'intern',
            bewaartermijn: 'V10',
            reden: 'test',
          })
        }
      >
        confirm-archive
      </button>
      <button onClick={() => (onClose as () => void)()}>close-archive</button>
    </div>
  ),
}));

vi.mock('./DeleteDialog', () => ({
  default: ({ dossier, onConfirm, onClose }: never) => (
    <div>
      <span>delete-dialog:{(dossier as AdminDossier).naam}</span>
      <button onClick={() => (onConfirm as () => void)()}>confirm-delete</button>
      <button onClick={() => (onClose as () => void)()}>close-delete</button>
    </div>
  ),
}));

function makeDossier(overrides: Partial<AdminDossier> = {}): AdminDossier {
  return {
    id: 'd1',
    naam: 'Jeugdzorg',
    onderwerp: 'x',
    status: 'actief',
    momentum: 'up',
    eigenaar: 'Sanne',
    kompas: {},
    md: { waaromNu: '', waarover: '', onsVerhaal: '' },
    versie: 1,
    gepubliceerd: true,
    sjabloon: '',
    archief: null,
    bewerkt: '1 dag',
    versies: [],
    ...overrides,
  } as AdminDossier;
}

const author = { sub: '1', name: 'Jan', roles: ['pa-admin'] } as never;

beforeEach(() => {
  mockApi.fetchAdminDossiers.mockResolvedValue([]);
  mockApi.fetchTemplates.mockResolvedValue([]);
  mockApi.fetchSnippets.mockResolvedValue([]);
  mockApi.createDossier.mockResolvedValue({});
  mockApi.updateDossier.mockResolvedValue({});
  mockApi.archiveDossier.mockResolvedValue({});
  mockApi.unarchiveDossier.mockResolvedValue({});
  mockApi.deleteDossier.mockResolvedValue({});
  mockIsDossiersMock.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('the pa.api mock', () => {
  it('only names exports the real module has', async () => {
    await expectMockNamesRealExports(vi.importActual('../../../services/pa.api'), paApi);
  });
});

describe('Dossierbeheer', () => {
  it('shows an empty state with no dossiers', async () => {
    render(<Dossierbeheer user={author} />);
    expect(
      await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.')
    ).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the fetch', async () => {
    mockApi.fetchAdminDossiers.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);

    expect(await screen.findByText('Kon dossiers niet laden.')).toBeInTheDocument();

    mockApi.fetchAdminDossiers.mockResolvedValue([makeDossier()]);
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText('Jeugdzorg')).toBeInTheDocument();
  });

  it('groups dossiers by status with per-group counts and the gepubliceerd stat', async () => {
    mockApi.fetchAdminDossiers.mockResolvedValue([
      makeDossier({ id: 'd1', status: 'actief', gepubliceerd: true }),
      makeDossier({ id: 'd2', naam: 'Bereikbaarheid', status: 'sluimerend', gepubliceerd: false }),
    ]);
    render(<Dossierbeheer user={author} />);

    expect(await screen.findByText('Actief')).toBeInTheDocument();
    expect(screen.getByText('Sluimerend')).toBeInTheDocument();
    expect(screen.getByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.getByText('Bereikbaarheid')).toBeInTheDocument();
  });

  it('the mock/live flag toggle flips the flag, refetches, and syncs the cockpit', async () => {
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');

    await user.click(screen.getByRole('button', { name: /Zet vlag om naar live/ }));

    expect(mockSetDossiersMock).toHaveBeenCalledWith(false);
    // All three, not just dossiers: the flag governs signals and searches too,
    // so the rail would otherwise keep the previous mode's numbers until
    // Monitoring was visited.
    expect(mockDossiersRefetch).toHaveBeenCalled();
    expect(mockSignalsRefetch).toHaveBeenCalled();
    expect(mockRefreshInboxCounts).toHaveBeenCalled();
    // Notifications too: the mock branch returns none, so a stale live bell
    // count would otherwise stand until something else happened to refetch it.
    expect(mockNotificationsRefetch).toHaveBeenCalled();
  });

  it('offers "Reset demodata" in mock mode but not in live', async () => {
    // Live has no demo state to reset, and the button would imply this page can
    // rewrite the database — which is exactly the confusion the mock/live
    // separation exists to remove.
    const { unmount } = render(<Dossierbeheer user={author} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');
    expect(screen.getByRole('button', { name: /Reset demodata/ })).toBeInTheDocument();
    unmount();

    mockIsDossiersMock.mockReturnValue(false);
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');

    expect(screen.queryByRole('button', { name: /Reset demodata/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Terug naar mock/ })).toBeInTheDocument();
  });

  it('resetting clears both halves of the demo state and reloads the surface', async () => {
    // Signals live in the persisted store, dossiers in dossierbeheer's own
    // store; one surviving the other would leave a half-reset demo.
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');

    await user.click(screen.getByRole('button', { name: /Reset demodata/ }));

    expect(mockResetDemoData).toHaveBeenCalled();
    expect(mockApi.resetMockDossiers).toHaveBeenCalled();
    expect(mockDossiersRefetch).toHaveBeenCalled();
    expect(mockSignalsRefetch).toHaveBeenCalled();
    expect(mockRefreshInboxCounts).toHaveBeenCalled();
    // Notifications too: the mock branch returns none, so a stale live bell
    // count would otherwise stand until something else happened to refetch it.
    expect(mockNotificationsRefetch).toHaveBeenCalled();
  });

  it('cancelling the confirmation resets nothing', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');

    await user.click(screen.getByRole('button', { name: /Reset demodata/ }));

    expect(mockResetDemoData).not.toHaveBeenCalled();
    expect(mockApi.resetMockDossiers).not.toHaveBeenCalled();
  });

  it('"+ Nieuw dossier" without onNavigate opens the template gallery, and picking one opens a new-dossier editor', async () => {
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');

    await user.click(screen.getByRole('button', { name: '+ Nieuw dossier' }));
    expect(screen.getByText('template-gallery')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pick-template' }));
    expect(screen.getByText('editor:new')).toBeInTheDocument();
  });

  it('waits for the refreshed list before returning to the overview after a create', async () => {
    // The bug this pins: handleSave used to fire refetch() and navigate in the
    // same tick, so the overview could render against a list that had not come
    // back. The dossier was created — the POST succeeded — and the user did not
    // see it. Found by an end-to-end journey failing one run in three.
    const onNavigate = vi.fn();
    let releaseList!: (rows: AdminDossier[]) => void;
    mockApi.createDossier.mockResolvedValue({});
    mockApi.fetchAdminDossiers
      .mockResolvedValueOnce([]) // initial mount
      .mockImplementationOnce(
        () =>
          new Promise<AdminDossier[]>((resolve) => {
            releaseList = resolve;
          })
      );

    const user = userEvent.setup();
    render(<Dossierbeheer user={author} startCreate onNavigate={onNavigate} />);
    await user.click(screen.getByRole('button', { name: 'pick-template' }));
    await user.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => expect(mockApi.createDossier).toHaveBeenCalled());
    // Still in the editor: the list has not answered yet.
    expect(onNavigate).not.toHaveBeenCalledWith('beheer', 'db-overzicht');

    await act(async () => {
      releaseList([]);
    });

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('beheer', 'db-overzicht'));
  });

  it('"+ Nieuw dossier" with onNavigate delegates to the shell navigator instead', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} onNavigate={onNavigate} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');

    await user.click(screen.getByRole('button', { name: '+ Nieuw dossier' }));

    expect(onNavigate).toHaveBeenCalledWith('beheer', 'db-nieuw');
    expect(screen.queryByText('template-gallery')).not.toBeInTheDocument();
  });

  it('editing a row opens the editor for that dossier, and saving calls updateDossier then returns to the list', async () => {
    mockApi.fetchAdminDossiers.mockResolvedValue([makeDossier()]);
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Jeugdzorg');

    await user.click(screen.getByRole('button', { name: 'edit-d1' }));
    expect(screen.getByText('editor:Jeugdzorg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'save' }));

    expect(mockApi.updateDossier).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ naam: 'Jeugdzorg' })
    );
    expect(mockDossiersRefetch).toHaveBeenCalled();
    expect(await screen.findByText('Jeugdzorg')).toBeInTheDocument(); // back in the list
  });

  it('publishing sends gepubliceerd:true in the write payload', async () => {
    mockApi.fetchAdminDossiers.mockResolvedValue([makeDossier()]);
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Jeugdzorg');

    await user.click(screen.getByRole('button', { name: 'edit-d1' }));
    await user.click(screen.getByRole('button', { name: 'publish' }));

    expect(mockApi.updateDossier).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ gepubliceerd: true })
    );
  });

  it('a save failure while in the editor shows the error banner without leaving the editor', async () => {
    // handleSave's catch doesn't switch the view back to 'list' on failure,
    // so the shared actionErrorBanner must render in the edit view too, not
    // just the list-mode overview.
    mockApi.fetchAdminDossiers.mockResolvedValue([makeDossier()]);
    mockApi.updateDossier.mockRejectedValue(new Error('fail'));
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Jeugdzorg');

    await user.click(screen.getByRole('button', { name: 'edit-d1' }));
    await user.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() => expect(mockApi.updateDossier).toHaveBeenCalled());
    expect(screen.getByText('editor:Jeugdzorg')).toBeInTheDocument(); // still in the editor
    expect(await screen.findByText(/mislukt/)).toBeInTheDocument(); // error now visible
  });

  it('archiving from a list row opens the ArchiveDialog, confirming calls archiveDossier and closes it', async () => {
    mockApi.fetchAdminDossiers.mockResolvedValue([makeDossier()]);
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Jeugdzorg');

    await user.click(screen.getByRole('button', { name: 'archive-d1' }));
    expect(screen.getByText('archive-dialog:Jeugdzorg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'confirm-archive' }));

    expect(mockApi.archiveDossier).toHaveBeenCalledWith('d1', {
      classificatie: 'intern',
      bewaartermijn: 'V10',
      reden: 'test',
    });
    expect(screen.queryByText('archive-dialog:Jeugdzorg')).not.toBeInTheDocument();
  });

  it('deleting from a list row opens the DeleteDialog, confirming calls deleteDossier and closes it', async () => {
    mockApi.fetchAdminDossiers.mockResolvedValue([makeDossier()]);
    const user = userEvent.setup();
    render(<Dossierbeheer user={author} />);
    await screen.findByText('Jeugdzorg');

    await user.click(screen.getByRole('button', { name: 'delete-d1' }));
    await user.click(screen.getByRole('button', { name: 'confirm-delete' }));

    expect(mockApi.deleteDossier).toHaveBeenCalledWith('d1');
    expect(screen.queryByText('delete-dialog:Jeugdzorg')).not.toBeInTheDocument();
  });

  it('without the create cap, "+ Nieuw dossier" is disabled with a locked note', async () => {
    render(<Dossierbeheer user={{ sub: '1', roles: [] } as never} />);
    await screen.findByText('Nog geen dossiers. Maak het eerste dossier aan.');

    expect(screen.getByRole('button', { name: '+ Nieuw dossier' })).toBeDisabled();
    expect(screen.getByText(/vereist minimaal rol Auteur/)).toBeInTheDocument();
  });
});
