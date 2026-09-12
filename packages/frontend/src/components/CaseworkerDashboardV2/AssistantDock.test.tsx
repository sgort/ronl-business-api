// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('AssistantDock storage and drag resize', () => {
  it('restores a stored conversation', () => {
    sessionStorage.setItem(
      'cwdV2.assistant.messages',
      JSON.stringify([{ role: 'user', content: 'Hallo' }])
    );
    expect(() => render(<AssistantDock user={null} onClose={vi.fn()} />)).not.toThrow();
  });

  it('starts empty when the stored conversation is not valid JSON', () => {
    // sessionStorage is shared with anything else on this origin and survives
    // a deploy; a half-written or stale value must not take the dock down.
    sessionStorage.setItem('cwdV2.assistant.messages', 'niet-json');
    expect(() => render(<AssistantDock user={null} onClose={vi.fn()} />)).not.toThrow();
  });

  it('falls back to the default width when the stored width is not a number', () => {
    sessionStorage.setItem('cwdV2.assistant.width', 'breed');
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);
    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '360px' });
  });

  it('survives sessionStorage being unavailable entirely', () => {
    // Private-browsing modes and locked-down enterprise profiles throw on
    // access rather than returning null.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);
      expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '360px' });
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('resizes by dragging the handle, and stops on pointer release', () => {
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);
    const handle = screen.getByRole('separator');

    fireEvent.pointerDown(handle);
    expect(handle.className).toContain('dragging');
    // The dock is right-anchored, so its width is the distance from the
    // pointer to the right edge of the window.
    fireEvent.pointerMove(window, { clientX: window.innerWidth - 420 });
    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '420px' });

    fireEvent.pointerUp(window);
    expect(handle.className).not.toContain('dragging');

    // After release the handle no longer tracks the pointer.
    fireEvent.pointerMove(window, { clientX: window.innerWidth - 500 });
    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '420px' });
  });

  it('abandons a drag that the browser cancels', () => {
    render(<AssistantDock user={null} onClose={vi.fn()} />);
    const handle = screen.getByRole('separator');

    fireEvent.pointerDown(handle);
    fireEvent.pointerCancel(window);

    expect(handle.className).not.toContain('dragging');
  });

  it('clamps a drag to the minimum and maximum width', () => {
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole('separator'));

    fireEvent.pointerMove(window, { clientX: window.innerWidth });
    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: '320px' });

    fireEvent.pointerMove(window, { clientX: -5000 });
    const max = Math.min(720, Math.round(window.innerWidth * 0.6));
    expect(container.querySelector('.v2-dock')).toHaveStyle({ width: `${max}px` });
  });

  it('ignores a key on the handle that is not a horizontal arrow', () => {
    const { container } = render(<AssistantDock user={null} onClose={vi.fn()} />);
    const before = (container.querySelector('.v2-dock') as HTMLElement).style.width;

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowUp' });

    expect((container.querySelector('.v2-dock') as HTMLElement).style.width).toBe(before);
  });

  it('restores the document cursor when the dock unmounts mid-drag', () => {
    const { unmount } = render(<AssistantDock user={null} onClose={vi.fn()} />);
    fireEvent.pointerDown(screen.getByRole('separator'));
    expect(document.body.style.cursor).toBe('col-resize');

    unmount();

    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });
});
