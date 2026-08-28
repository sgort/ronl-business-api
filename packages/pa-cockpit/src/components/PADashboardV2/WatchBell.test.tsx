// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchBell from './WatchBell';

describe('WatchBell', () => {
  it('reflects the active state via aria-pressed and the default title', () => {
    render(<WatchBell active={false} onToggle={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('title', 'Volgen — meldingen bij nieuwe signalen');
  });

  it('shows the "stop following" title when active', () => {
    render(<WatchBell active onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Niet meer volgen');
  });

  it('a custom title overrides the default', () => {
    render(<WatchBell active={false} onToggle={vi.fn()} title="Custom title" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Custom title');
  });

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<WatchBell active={false} onToggle={onToggle} />);

    await user.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalled();
  });

  it('does not call onToggle when disabled', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<WatchBell active={false} onToggle={onToggle} disabled />);

    await user.click(screen.getByRole('button'));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
