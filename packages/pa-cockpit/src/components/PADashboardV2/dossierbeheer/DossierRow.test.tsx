// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DossierRow from './DossierRow';
import type { AdminDossier } from '@ronl/shared';
import type { DossierCaps } from '../../../pages/public-affairs-v2/dossierbeheer.data';

const FULL_CAPS: DossierCaps = {
  create: true,
  edit: true,
  template: true,
  publish: true,
  archive: true,
  del: true,
};
const NO_CAPS: DossierCaps = {
  create: false,
  edit: false,
  template: false,
  publish: false,
  archive: false,
  del: false,
};

function makeDossier(overrides: Partial<AdminDossier> = {}): AdminDossier {
  return {
    id: 'd1',
    naam: 'Jeugdzorg',
    onderwerp: 'Toekomst van de jeugdzorg in Flevoland',
    status: 'actief',
    momentum: 'up',
    eigenaar: 'Sanne Bakker',
    kompas: {},
    md: { waaromNu: '', waarover: '', onsVerhaal: '' },
    versie: 3,
    gepubliceerd: true,
    sjabloon: 't1',
    archief: null,
    bewerkt: '2 dgn',
    versies: [],
    ...overrides,
  } as AdminDossier;
}

function renderRow(overrides: Partial<AdminDossier> = {}, can: DossierCaps = FULL_CAPS) {
  const handlers = {
    onEdit: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onDelete: vi.fn(),
  };
  const d = makeDossier(overrides);
  const utils = render(<DossierRow d={d} can={can} {...handlers} />);
  return { ...utils, ...handlers, d };
}

describe('DossierRow', () => {
  it('renders the name, status, onderwerp, owner, version, and momentum arrow', () => {
    renderRow();

    expect(screen.getByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.getByText('actief')).toBeInTheDocument();
    expect(screen.getByText('Toekomst van de jeugdzorg in Flevoland')).toBeInTheDocument();
    expect(screen.getByText('Sanne Bakker')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('shows the gepubliceerd/concept badge, but hides it once archived', () => {
    const { rerender } = renderRow({ gepubliceerd: true });
    expect(screen.getByText('● gepubliceerd')).toBeInTheDocument();

    rerender(
      <DossierRow
        d={makeDossier({ status: 'gearchiveerd' })}
        can={FULL_CAPS}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByText('● gepubliceerd')).not.toBeInTheDocument();
    expect(screen.queryByText('○ concept')).not.toBeInTheDocument();
  });

  it('shows "geen score" without a Kompas score, and the total/band once scored', () => {
    const { rerender } = renderRow({ kompas: {} });
    expect(screen.getByText('geen score')).toBeInTheDocument();

    rerender(
      <DossierRow
        d={makeDossier({ kompas: { opgaven: { score: 2, duiding: '' } } })}
        can={FULL_CAPS}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows the Archiefwet classificatie and bewaartermijn labels when archief is set', () => {
    renderRow({
      archief: { classificatie: 'vertrouwelijk', bewaartermijn: 'V10', reden: '', at: '', by: '' },
    });
    expect(screen.getByText(/Vertrouwelijk/)).toBeInTheDocument();
    expect(screen.getByText(/10 jaar/)).toBeInTheDocument();
  });

  it('shows "Bewerken" when the user can edit an unarchived dossier, "Bekijken" otherwise', () => {
    const { rerender } = renderRow({}, FULL_CAPS);
    expect(screen.getByRole('button', { name: 'Bewerken' })).toBeInTheDocument();

    rerender(
      <DossierRow
        d={makeDossier()}
        can={NO_CAPS}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Bekijken' })).toBeInTheDocument();
  });

  it('shows "Archiveren" for an active dossier and "Herstellen" for an archived one', () => {
    const { rerender } = renderRow({ status: 'actief' });
    expect(screen.getByRole('button', { name: 'Archiveren' })).toBeInTheDocument();

    rerender(
      <DossierRow
        d={makeDossier({ status: 'gearchiveerd' })}
        can={FULL_CAPS}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Herstellen' })).toBeInTheDocument();
  });

  it('disables Archiveren/Verwijderen without those caps, and clicking dispatches with the dossier', async () => {
    const user = userEvent.setup();
    const { onEdit, onArchive, onDelete, d } = renderRow({}, FULL_CAPS);

    await user.click(screen.getByRole('button', { name: 'Bewerken' }));
    expect(onEdit).toHaveBeenCalledWith(d);

    await user.click(screen.getByRole('button', { name: 'Archiveren' }));
    expect(onArchive).toHaveBeenCalledWith(d);

    await user.click(screen.getByRole('button', { name: 'Verwijderen' }));
    expect(onDelete).toHaveBeenCalledWith(d);
  });

  it('disables Archiveren and Verwijderen when the role lacks those caps', () => {
    renderRow({}, NO_CAPS);
    expect(screen.getByRole('button', { name: 'Archiveren' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verwijderen' })).toBeDisabled();
  });
});
