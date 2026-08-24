// packages/public-site/src/App.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App', () => {
  it('renders the skip link as the first focusable element', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText('Direct naar de inhoud')).toHaveAttribute('href', '#pub-main');
  });

  it('renders Home by default with the six/five section cards', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    // Scoped to <main>: MainNav and Footer also render a link per section with
    // the same accessible name, so an unscoped query matches 3 elements.
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: /Regelcatalogus/ })).toBeInTheDocument();
    expect(within(main).getByRole('link', { name: /Procesbibliotheek/ })).toBeInTheDocument();
  });

  it('switching language updates document.documentElement.lang and visible copy', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(document.documentElement.lang).toBe('en');
    // Scoped to <main> for the same reason as above.
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Rule catalogue/ })
    ).toBeInTheDocument();
  });

  it('renders NotFound for an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /niet gevonden|not found/i })).toBeInTheDocument();
  });

  it('renders Herkomst at /herkomst, reachable from the nav', async () => {
    render(
      <MemoryRouter initialEntries={['/herkomst']}>
        <App />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Waar komt dit begrip vandaan?' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Herkomst' })).toHaveAttribute('aria-current', 'page');
  });
});
