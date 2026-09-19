import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusTag from './StatusTag';

describe('StatusTag', () => {
  it.each(['example', 'wip', 'e2e'])('renders the known status %s with its own class', (status) => {
    render(<StatusTag status={status} />);
    const el = screen.getByText(status);
    expect(el).toHaveClass('pub-status', `s-${status}`);
  });

  it('falls back to a neutral class for a status label it does not recognise', () => {
    // A bundle is visible whatever its label (#111) — an unrecognised value
    // must still render, not throw or vanish, just with no special colour.
    render(<StatusTag status="draft" />);
    const el = screen.getByText('draft');
    expect(el).toHaveClass('pub-status', 's-other');
  });

  it('always shows the label as text, never colour alone', () => {
    render(<StatusTag status="wip" />);
    expect(screen.getByText('wip')).toBeInTheDocument();
  });
});
