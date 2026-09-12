// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WooNoAccessPanel from './WooNoAccessPanel';

describe('WooNoAccessPanel', () => {
  it('explains the required role', () => {
    render(<WooNoAccessPanel />);
    expect(screen.getByText('Geen toegang')).toBeInTheDocument();
    expect(screen.getByText('woo-coordinatie')).toBeInTheDocument();
  });
});
