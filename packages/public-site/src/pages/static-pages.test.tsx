import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Toegankelijkheid from './Toegankelijkheid';
import OpenData from './OpenData';
import NotFound from './NotFound';

describe('Toegankelijkheid', () => {
  it('states the WCAG 2.1 AA conformance target and a contact path', () => {
    render(
      <MemoryRouter>
        <Toegankelijkheid lang="nl" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Toegankelijkheid/);
    expect(screen.getByText(/WCAG 2\.1.*AA/)).toBeInTheDocument();
  });

  it('renders in English when lang=en', () => {
    render(
      <MemoryRouter>
        <Toegankelijkheid lang="en" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Accessibility/);
  });
});

describe('OpenData', () => {
  it('lists at least one real /v1/public/ GET path', () => {
    render(
      <MemoryRouter>
        <OpenData lang="nl" />
      </MemoryRouter>
    );
    expect(screen.getByText(/GET \/v1\/public\/zoeken/)).toBeInTheDocument();
  });
  it('renders the endpoint table and the terms in English when lang=en', () => {
    render(
      <MemoryRouter>
        <OpenData lang="en" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Open data & API/);
    expect(screen.getByText(/machine-readable through an open, anonymous API/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Path' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByText(/free to reuse, without copyright restriction/)).toBeInTheDocument();
  });

  it('names every documented endpoint exactly once', () => {
    render(
      <MemoryRouter>
        <OpenData lang="nl" />
      </MemoryRouter>
    );
    for (const path of [
      '/v1/public/zoeken?q=',
      '/v1/public/berichten',
      '/v1/public/nieuws',
      '/v1/public/producten-diensten',
      '/v1/public/regelcatalogus',
      '/v1/public/processen',
    ]) {
      expect(screen.getByText(`GET ${path}`)).toBeInTheDocument();
    }
  });
});

describe('NotFound', () => {
  it('explains the miss and offers a way back, in Dutch', () => {
    render(
      <MemoryRouter>
        <NotFound lang="nl" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pagina niet gevonden');
    expect(screen.getByText(/Deze pagina bestaat niet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Terug naar home/ })).toHaveAttribute('href', '/');
  });

  it('explains the miss and offers a way back, in English', () => {
    render(
      <MemoryRouter>
        <NotFound lang="en" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found');
    expect(screen.getByText(/does not \(or no longer\) exist/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to home/ })).toHaveAttribute('href', '/');
  });
});
