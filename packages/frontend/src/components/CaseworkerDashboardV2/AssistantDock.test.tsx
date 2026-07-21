// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssistantDock from './AssistantDock';

vi.mock('../CaseworkerDashboard/McpChatSection', () => ({
  default: () => <div>chat</div>,
}));

const STORAGE_KEY_WIDTH = 'cwdV2.assistant.width';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('AssistantDock', () => {
  it('defaults to 360px width when nothing is stored', () => {
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);
    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '360px' });
  });

  it('restores a previously stored width', () => {
    sessionStorage.setItem(STORAGE_KEY_WIDTH, '450');
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);
    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '450px' });
  });

  it('ArrowLeft on the resize handle widens the dock, persisting the new width', async () => {
    const user = userEvent.setup();
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);

    const handle = screen.getByRole('separator', { name: 'Breedte van het assistentpaneel' });
    handle.focus();
    await user.keyboard('{ArrowLeft}');

    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '384px' });
    expect(sessionStorage.getItem(STORAGE_KEY_WIDTH)).toBe('384');
  });

  it('ArrowRight on the resize handle narrows the dock', async () => {
    const user = userEvent.setup();
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);

    const handle = screen.getByRole('separator', { name: 'Breedte van het assistentpaneel' });
    handle.focus();
    await user.keyboard('{ArrowRight}');

    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '336px' });
  });

  it('the close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AssistantDock user={null} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Sluiten' }));

    expect(onClose).toHaveBeenCalled();
  });
});
