// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplateGallery from './TemplateGallery';
import type { DossierTemplate } from '@ronl/shared';

function makeTemplate(overrides: Partial<DossierTemplate> = {}): DossierTemplate {
  return {
    id: 't1',
    naam: 'Blanco dossier',
    cat: 'Algemeen',
    beschrijving: 'Start zonder vooraf ingevulde inhoud.',
    versie: '1.0',
    eigenaar: 'Curatieteam',
    gebruikt: 0,
    seed: { onderwerp: '', waaromNu: '', waarover: '', onsVerhaal: '' },
    ...overrides,
  } as DossierTemplate;
}

describe('TemplateGallery', () => {
  it('renders every template card with its metadata, hiding the usage count when zero', () => {
    render(<TemplateGallery templates={[makeTemplate()]} onPick={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('Blanco dossier')).toBeInTheDocument();
    expect(screen.getByText('Algemeen')).toBeInTheDocument();
    expect(screen.getByText('Curatieteam')).toBeInTheDocument();
    expect(screen.queryByText(/× gebruikt/)).not.toBeInTheDocument();
  });

  it('shows the usage count when a template has been used before', () => {
    // "{t.gebruikt}× gebruikt" compiles to two separate text nodes (the
    // expression and the literal string), so match on combined textContent.
    const { container } = render(
      <TemplateGallery
        templates={[makeTemplate({ gebruikt: 4 })]}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.querySelector('.pac-db-tpl-meta')).toHaveTextContent('4× gebruikt');
  });

  it('"Doorgaan" is disabled until a card is selected, then calls onPick with the chosen template', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    const template = makeTemplate();
    render(<TemplateGallery templates={[template]} onPick={onPick} onCancel={vi.fn()} />);

    const continueButton = screen.getByRole('button', { name: /Doorgaan met dit sjabloon/ });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByText('Blanco dossier'));
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);
    expect(onPick).toHaveBeenCalledWith(template);
  });

  it('"Annuleren" and the breadcrumb both call onCancel', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<TemplateGallery templates={[makeTemplate()]} onPick={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /Dossieroverzicht/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Annuleren' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
