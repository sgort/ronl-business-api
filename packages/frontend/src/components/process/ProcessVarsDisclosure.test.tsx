// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../CaseworkerDashboard/ProcessVarsSection', () => ({
  default: () => <table data-testid="vars" />,
}));

import ProcessVarsDisclosure from './ProcessVarsDisclosure';

const draw = (key: string) => <ProcessVarsDisclosure key={key} variables={{}} loading={false} />;

describe('ProcessVarsDisclosure', () => {
  it('starts folded', () => {
    render(draw('t1'));
    const button = screen.getByRole('button', { name: /Procesgegevens/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toContain('Gegevens tonen');
    expect(screen.queryByTestId('vars')).toBeNull();
  });

  it('opens and closes, naming the region it controls', async () => {
    const user = userEvent.setup();
    render(draw('t1'));
    const button = screen.getByRole('button', { name: /Procesgegevens/ });
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toContain('Gegevens verbergen');
    const region = document.getElementById(button.getAttribute('aria-controls')!);
    expect(region?.querySelector('[data-testid="vars"]')).toBeTruthy();
    await user.click(button);
    expect(screen.queryByTestId('vars')).toBeNull();
  });

  it('folds again for a new task (a new key)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(draw('t1'));
    await user.click(screen.getByRole('button', { name: /Procesgegevens/ }));
    rerender(draw('t2'));
    expect(
      screen.getByRole('button', { name: /Procesgegevens/ }).getAttribute('aria-expanded')
    ).toBe('false');
  });
});
