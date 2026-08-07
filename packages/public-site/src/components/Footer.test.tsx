import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import Footer from './Footer';
import { translations } from '../i18n';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer t={translations.nl} lang="nl" />
    </MemoryRouter>
  );
}

afterEach(() => vi.unstubAllEnvs());

describe('Footer', () => {
  it('links to the environment site URL, shown as its host (ACC, not prod)', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://acc.publiek.open-regels.nl');
    renderFooter();
    const link = screen.getByRole('link', { name: 'acc.publiek.open-regels.nl' });
    expect(link).toHaveAttribute('href', 'https://acc.publiek.open-regels.nl');
  });

  it('shows the current release version (public-site package version)', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://acc.publiek.open-regels.nl');
    renderFooter();
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
  });
});
