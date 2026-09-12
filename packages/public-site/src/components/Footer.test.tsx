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

  // The version above identifies a release; these identify the build of it.
  // ACC and PROD can serve different builds of one version, so the footer has
  // to answer "which build am I looking at?" on its own. See
  // iou-architectuur docs/en/contributing/build-provenance.md.
  it('shows the injected build identifiers next to the version', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://acc.publiek.open-regels.nl');
    vi.stubEnv('VITE_BUILD_SHA', '570fd98a1c4e2b7d3f8a9016c5d4e2b7a3f81c40');
    vi.stubEnv('VITE_BUILD_RUN', '412');
    renderFooter();
    expect(screen.getByText('build 570fd98 · #412')).toBeInTheDocument();
  });

  it('carries the full SHA on the title attribute, for copying', () => {
    const sha = '570fd98a1c4e2b7d3f8a9016c5d4e2b7a3f81c40';
    vi.stubEnv('VITE_SITE_URL', 'https://acc.publiek.open-regels.nl');
    vi.stubEnv('VITE_BUILD_SHA', sha);
    vi.stubEnv('VITE_BUILD_RUN', '412');
    renderFooter();
    expect(screen.getByText('build 570fd98 · #412')).toHaveAttribute('title', sha);
  });

  it('reads "local build" when nothing was injected, never a blank slot', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://acc.publiek.open-regels.nl');
    vi.stubEnv('VITE_BUILD_SHA', undefined);
    vi.stubEnv('VITE_BUILD_RUN', undefined);
    renderFooter();
    expect(screen.getByText('local build')).toBeInTheDocument();
    expect(screen.getByText('local build')).not.toHaveAttribute('title');
  });

  // Half-configured must not render as a deployed artifact: a run number with
  // no commit behind it implies a provenance the bundle does not have.
  it('reads "local build" when only a run number was injected', () => {
    vi.stubEnv('VITE_SITE_URL', 'https://acc.publiek.open-regels.nl');
    vi.stubEnv('VITE_BUILD_SHA', undefined);
    vi.stubEnv('VITE_BUILD_RUN', '412');
    renderFooter();
    expect(screen.getByText('local build')).toBeInTheDocument();
  });
});
