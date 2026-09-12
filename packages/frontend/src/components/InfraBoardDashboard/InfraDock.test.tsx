// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InfraDock from './InfraDock';
import type { Message } from '../CaseworkerDashboard/McpChatSection';

const mockOnMessagesChange = vi.hoisted(() => vi.fn());
vi.mock('../CaseworkerDashboard/McpChatSection', () => ({
  default: ({
    messages,
    onMessagesChange,
  }: {
    messages: Message[];
    onMessagesChange: (m: Message[]) => void;
  }) => {
    mockOnMessagesChange.mockImplementation(onMessagesChange);
    return <div>chat:{messages.length}</div>;
  },
}));

const STORAGE_KEY = 'infraBoard.assistant.messages';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('InfraDock', () => {
  it('loads any previously persisted conversation from sessionStorage on mount', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([{ role: 'user', content: 'hoi' }]));
    render(<InfraDock user={null} onClose={vi.fn()} />);
    expect(screen.getByText('chat:1')).toBeInTheDocument();
  });

  it('starts with an empty conversation when nothing is stored', () => {
    render(<InfraDock user={null} onClose={vi.fn()} />);
    expect(screen.getByText('chat:0')).toBeInTheDocument();
  });

  it('persists new messages to sessionStorage under the infra-board-specific key', () => {
    render(<InfraDock user={null} onClose={vi.fn()} />);

    act(() => {
      mockOnMessagesChange([{ role: 'user', content: 'test' }]);
    });

    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual([
      { role: 'user', content: 'test' },
    ]);
  });

  it('clicking the close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<InfraDock user={null} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '×' }));

    expect(onClose).toHaveBeenCalled();
  });
});
