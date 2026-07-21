// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PADock from './PADock';

vi.mock('../CaseworkerDashboard/McpChatSection', () => ({
  default: () => <div>chat</div>,
}));

const STORAGE_KEY_WIDTH = 'paV2.assistant.width';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('PADock', () => {
  it('defaults to 360px width when nothing is stored', () => {
    const { container } = render(<PADock user={null} onClose={vi.fn()} />);
    expect(container.querySelector('.pac-dock')).toHaveStyle({ width: '360px' });
  });

  it('restores a previously stored width, clamped to the valid range', () => {
    sessionStorage.setItem(STORAGE_KEY_WIDTH, '500');
    const { container } = render(<PADock user={null} onClose={vi.fn()} />);
    expect(container.querySelector('.pac-dock')).toHaveStyle({ width: '500px' });
  });

  it('clamps a stored width below the minimum up to 320px', () => {
    sessionStorage.setItem(STORAGE_KEY_WIDTH, '50');
    const { container } = render(<PADock user={null} onClose={vi.fn()} />);
    expect(container.querySelector('.pac-dock')).toHaveStyle({ width: '320px' });
  });

  it('ArrowLeft on the resize handle widens the dock, persisting the new width', async () => {
    const user = userEvent.setup();
    const { container } = render(<PADock user={null} onClose={vi.fn()} />);

    const handle = screen.getByRole('separator', { name: 'Breedte van het assistentpaneel' });
    handle.focus();
    await user.keyboard('{ArrowLeft}');

    expect(container.querySelector('.pac-dock')).toHaveStyle({ width: '384px' });
    expect(sessionStorage.getItem(STORAGE_KEY_WIDTH)).toBe('384');
  });

  it('ArrowRight on the resize handle narrows the dock', async () => {
    const user = userEvent.setup();
    const { container } = render(<PADock user={null} onClose={vi.fn()} />);

    const handle = screen.getByRole('separator', { name: 'Breedte van het assistentpaneel' });
    handle.focus();
    await user.keyboard('{ArrowRight}');

    expect(container.querySelector('.pac-dock')).toHaveStyle({ width: '336px' });
  });

  it('the close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PADock user={null} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Sluiten' }));

    expect(onClose).toHaveBeenCalled();
  });
});
