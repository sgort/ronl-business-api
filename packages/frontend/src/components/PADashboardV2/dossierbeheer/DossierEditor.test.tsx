// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DossierEditor from './DossierEditor';
import type { AdminDossier, DossierSnippet } from '@ronl/shared';
import type { DossierCaps } from '../../../pages/public-affairs-v2/dossierbeheer.data';

const FULL_CAPS: DossierCaps = {
  create: true,
  edit: true,
  template: true,
  publish: true,
  archive: true,
  del: true,
};

function makeDossier(overrides: Partial<AdminDossier> = {}): AdminDossier {
  return {
    id: 'd1',
    naam: 'Jeugdzorg',
    onderwerp: 'Toekomst van de jeugdzorg',
    status: 'actief',
    momentum: 'up',
    eigenaar: 'Sanne Bakker',
    kompas: {},
    md: { waaromNu: '', waarover: '', onsVerhaal: '' },
    versie: 1,
    gepubliceerd: false,
    sjabloon: 't1',
    archief: null,
    bewerkt: '2 dgn',
    versies: [],
    ...overrides,
  } as AdminDossier;
}

const snippet: DossierSnippet = {
  id: 's1',
  naam: 'Intro',
  cat: 'Algemeen',
  md: 'Hallo {{currentUser}}',
};

function renderEditor(props: Partial<React.ComponentProps<typeof DossierEditor>> = {}) {
  const handlers = {
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onDelete: vi.fn(),
  };
  const record = makeDossier();
  const utils = render(
    <DossierEditor
      record={record}
      isNew={false}
      can={FULL_CAPS}
      snippets={[snippet]}
      currentUser="Jan"
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers, record };
}

describe('DossierEditor', () => {
  it('a new dossier shows "Dossier aanmaken" and no status badge', () => {
    renderEditor({ isNew: true, record: makeDossier({ naam: '', onderwerp: '' }) });
    expect(screen.getByRole('button', { name: 'Dossier aanmaken' })).toBeInTheDocument();
    expect(screen.queryByText('actief')).not.toBeInTheDocument();
  });

  it('save is disabled until naam (>2 chars) and onderwerp are both filled', async () => {
    const user = userEvent.setup();
    const { container } = renderEditor({
      isNew: true,
      record: makeDossier({ naam: '', onderwerp: '' }),
    });

    const saveButton = screen.getByRole('button', { name: 'Dossier aanmaken' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/Naam \(min\. 3 tekens\)/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('bv. Stikstof & landbouwtransitie'), 'RIP');
    expect(saveButton).toBeDisabled(); // no onderwerp yet

    // Onderwerp is the 2nd of the Kerngegevens card's plain .pac-db-input fields.
    const onderwerpInput = container
      .querySelectorAll('.pac-db-card')[0]
      .querySelectorAll('input.pac-db-input')[1] as HTMLInputElement;
    await user.type(onderwerpInput, 'Onderwerp');
    expect(saveButton).toBeEnabled();
  });

  it('clicking save calls onSave with the current draft and publish=false', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Wijzigingen opslaan' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ naam: 'Jeugdzorg' }), false);
  });

  it('clicking "Opslaan & publiceren" calls onSave with publish=true', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Opslaan & publiceren' }));

    expect(onSave).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('when already published, the publish button reads "opnieuw publiceren"', () => {
    renderEditor({ record: makeDossier({ gepubliceerd: true }) });
    expect(
      screen.getByRole('button', { name: 'Opslaan & opnieuw publiceren' })
    ).toBeInTheDocument();
  });

  it('typing in the Naam field updates the slug preview', async () => {
    const user = userEvent.setup();
    renderEditor({ isNew: true, record: makeDossier({ id: '', naam: '', onderwerp: '' }) });

    await user.type(screen.getByPlaceholderText('bv. Stikstof & landbouwtransitie'), 'RIP Fase 1!');

    expect(screen.getByText('/pa/dossiers/rip-fase-1')).toBeInTheDocument();
  });

  it('toggling status and momentum segments updates the active button', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Sluimerend' }));
    expect(screen.getByRole('button', { name: 'Sluimerend' })).toHaveClass('active');

    await user.click(screen.getByRole('button', { name: '↓ Af' }));
    expect(screen.getByRole('button', { name: '↓ Af' })).toHaveClass('active');
  });

  it('inserting a snippet expands its variables and appends to the focused field', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: 'Invoegen' }));

    // Split view shows both the raw textarea and the rendered preview.
    expect(screen.getAllByText('Hallo Jan').length).toBeGreaterThan(0);
  });

  it('an archived dossier is read-only and offers "Dearchiveren" instead of edit actions', () => {
    const { container } = renderEditor({ record: makeDossier({ status: 'gearchiveerd' }) });

    // "gearchiveerd" is wrapped in its own <b>, splitting the sentence across
    // text nodes — check the containing note's combined textContent instead.
    expect(container.querySelector('.pac-db-save-note')).toHaveTextContent(
      /Dit dossier is gearchiveerd/
    );
    expect(screen.getByDisplayValue('Jeugdzorg')).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Dearchiveren (herstellen)…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wijzigingen opslaan' })).not.toBeInTheDocument();
  });

  it('"Terug naar overzicht" on an archived dossier calls onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderEditor({ record: makeDossier({ status: 'gearchiveerd' }) });

    await user.click(screen.getByRole('button', { name: 'Terug naar overzicht' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('shows version history newest-first, with "huidig" on the latest', () => {
    renderEditor({
      record: makeDossier({
        versies: [
          { v: 1, at: '1 jul', by: 'Jan', note: 'aangemaakt' },
          { v: 2, at: '2 jul', by: 'Jan', note: 'bijgewerkt' },
        ] as never,
      }),
    });

    const items = screen.getAllByText(/^v\d$/);
    expect(items[0]).toHaveTextContent('v2');
    expect(screen.getByText(/2 jul · Jan · huidig/)).toBeInTheDocument();
  });

  it('without archive/delete caps, the lifecycle actions are disabled with a locked note', () => {
    renderEditor({ can: { ...FULL_CAPS, archive: false, del: false } });

    expect(screen.getByRole('button', { name: 'Archiveren (Archiefwet)…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Definitief verwijderen…' })).toBeDisabled();
    expect(screen.getByText(/vereist rol/)).toBeInTheDocument();
  });

  it('clicking Archiveren/Verwijderen in the lifecycle card dispatches with the draft', async () => {
    const user = userEvent.setup();
    const { onArchive, onDelete } = renderEditor();

    await user.click(screen.getByRole('button', { name: 'Archiveren (Archiefwet)…' }));
    expect(onArchive).toHaveBeenCalledWith(expect.objectContaining({ naam: 'Jeugdzorg' }));

    await user.click(screen.getByRole('button', { name: 'Definitief verwijderen…' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ naam: 'Jeugdzorg' }));
  });

  it('without publish rights, the publish button is disabled with a locked note', () => {
    renderEditor({ can: { ...FULL_CAPS, publish: false } });

    expect(screen.getByRole('button', { name: 'Opslaan & publiceren' })).toBeDisabled();
    expect(screen.getByText(/vereist rol/)).toBeInTheDocument();
  });
});
