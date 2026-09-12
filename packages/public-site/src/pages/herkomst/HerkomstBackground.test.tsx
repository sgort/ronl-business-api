import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HerkomstBackground from './HerkomstBackground';
import { HERKOMST_STRINGS } from './herkomstData';

describe('HerkomstBackground', () => {
  it('renders the three anchored sections', () => {
    const { container } = render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(container.querySelector('#pijplijn')).toBeInTheDocument();
    expect(container.querySelector('#conceptketen')).toBeInTheDocument();
    expect(container.querySelector('#standaarden')).toBeInTheDocument();
  });

  it('renders all 4 pipeline stages with the "nieuw" badge only on stage 1', () => {
    render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(screen.getByText('Regeleditor (FLINT)')).toBeInTheDocument();
    expect(screen.getByText('MijnOmgeving')).toBeInTheDocument();
    expect(screen.getByText('Nieuw in stack')).toBeInTheDocument();
  });

  it('renders the (a)/(b)/(c) concept chain', () => {
    const { container } = render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    const tags = Array.from(container.querySelectorAll('.pub-herkomst-abc-tag')).map(
      (el) => el.textContent
    );
    expect(tags[0]).toMatch(/^\(a\)/);
    expect(tags[1]).toMatch(/^\(b\)/);
    expect(tags[2]).toMatch(/^\(c\)/);
  });

  it('renders open and closed standards', () => {
    render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(screen.getByText('CPSV-AP')).toBeInTheDocument();
    expect(screen.getByText('eDOCS')).toBeInTheDocument();
  });
});
