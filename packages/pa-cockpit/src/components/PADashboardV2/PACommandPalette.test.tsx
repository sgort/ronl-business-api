// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PACommandPalette from './PACommandPalette';
import {
  allStaticSections,
  findPaModeForSection,
  PA_MODES,
} from '../../pages/public-affairs-v2/modes.config';
import { PaModesProvider } from '../../modes/PaModesContext';
import { makePaDataStub } from '../../test/paData.stub';

const mockDossiers = vi.hoisted(() => [
  { id: 'jeugdzorg', naam: 'Jeugdzorg' },
  { id: 'stikstof', naam: 'Stikstof & landbouw' },
]);
vi.mock('../../pages/public-affairs-v2/PaDataProvider', () => ({
  usePaData: () =>
    makePaDataStub({ dossiers: { data: mockDossiers, status: 'ok', refetch: vi.fn() } }),
}));

function renderPalette(ui: React.ReactElement) {
  return render(<PaModesProvider modes={PA_MODES}>{ui}</PaModesProvider>);
}

describe('PACommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPalette(
      <PACommandPalette open={false} onClose={vi.fn()} onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every static section plus every dossier when open', () => {
    renderPalette(<PACommandPalette open onClose={vi.fn()} onSelect={vi.fn()} />);

    const firstSection = allStaticSections()[0];
    expect(screen.getByText(firstSection.label)).toBeInTheDocument();
    expect(screen.getByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.getByText('Stikstof & landbouw')).toBeInTheDocument();
  });

  it('typing filters the list, showing the empty state for no matches', async () => {
    const user = userEvent.setup();
    renderPalette(<PACommandPalette open onClose={vi.fn()} onSelect={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Spring naar… (dossier, monitoring, voortgang, …)'),
      'Jeugdzorg'
    );
    expect(screen.getByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.queryByText('Stikstof & landbouw')).not.toBeInTheDocument();

    await user.clear(
      screen.getByPlaceholderText('Spring naar… (dossier, monitoring, voortgang, …)')
    );
    await user.type(
      screen.getByPlaceholderText('Spring naar… (dossier, monitoring, voortgang, …)'),
      'zzz-nonexistent'
    );
    expect(screen.getByText(/Niets gevonden voor/)).toBeInTheDocument();
  });

  it('selecting a dossier calls onSelect with mode "dossiers" and the dossier id', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette(<PACommandPalette open onClose={onClose} onSelect={onSelect} />);

    await user.click(screen.getByText('Jeugdzorg'));

    expect(onSelect).toHaveBeenCalledWith('dossiers', 'jeugdzorg');
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting a static section calls onSelect with its owning mode', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderPalette(<PACommandPalette open onClose={vi.fn()} onSelect={onSelect} />);

    const firstSection = allStaticSections()[0];
    await user.click(screen.getByText(firstSection.label));

    expect(onSelect).toHaveBeenCalledWith(findPaModeForSection(firstSection.id), firstSection.id);
  });

  it('Escape closes the palette', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPalette(<PACommandPalette open onClose={onClose} onSelect={vi.fn()} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the overlay closes the palette, clicking inside does not', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = renderPalette(
      <PACommandPalette open onClose={onClose} onSelect={vi.fn()} />
    );

    await user.click(container.querySelector('.pac-palette')!);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(container.querySelector('.pac-palette-overlay')!);
    expect(onClose).toHaveBeenCalled();
  });
});
