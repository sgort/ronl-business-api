// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tijdigheid from './Tijdigheid';
import { WOO_TIJDIGHEID } from '../../pages/woo/woo.data';

describe('Tijdigheid', () => {
  it('renders the doorlooptijd heading and key SLA metrics', () => {
    render(<Tijdigheid />);

    expect(screen.getByRole('heading', { name: 'Doorlooptijd & compliance' })).toBeInTheDocument();
    expect(screen.getAllByText(String(WOO_TIJDIGHEID.gem)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(WOO_TIJDIGHEID.teLaat)).length).toBeGreaterThan(0);
  });
});
