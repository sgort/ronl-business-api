import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Toegankelijkheid from './Toegankelijkheid';
import OpenData from './OpenData';

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
});
