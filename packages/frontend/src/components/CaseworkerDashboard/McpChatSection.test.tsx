// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import McpChatSection from './McpChatSection';
import type { Message } from './McpChatSection';

const mockBusinessApi = vi.hoisted(() => ({
  mcp: {
    getModels: vi.fn(),
    getSources: vi.fn(),
    chatStream: vi.fn(),
  },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const user1 = { sub: '1', roles: [] } as never;

const sources = [
  { id: 'ops', displayName: 'Operaton', description: 'Process data', connected: true },
  { id: 'kg', displayName: 'Kennisgraaf', description: 'Knowledge graph', connected: false },
];

async function* asyncEvents(events: Array<Record<string, unknown>>) {
  for (const e of events) yield e;
}

function Wrapper({ initialMessages = [] as Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  return <McpChatSection user={user1} messages={messages} onMessagesChange={setMessages} />;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  mockBusinessApi.mcp.getModels.mockResolvedValue({ data: [] });
  mockBusinessApi.mcp.getSources.mockResolvedValue({ data: sources });
  mockBusinessApi.mcp.chatStream.mockReturnValue(asyncEvents([{ type: 'done' }]));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('McpChatSection', () => {
  it('shows a login prompt when there is no user', () => {
    render(<McpChatSection user={null} messages={[]} onMessagesChange={vi.fn()} />);
    expect(screen.getByText('AI-assistent')).toBeInTheDocument();
    expect(screen.getByText(/Log in als medewerker/)).toBeInTheDocument();
  });

  it('pre-selects connected sources and shows a disabled toggle for a disconnected one', async () => {
    render(<Wrapper />);

    expect(await screen.findByRole('button', { name: 'Operaton' })).toBeInTheDocument();
    const kgButton = screen.getByRole('button', { name: /Kennisgraaf/ });
    expect(kgButton).toHaveTextContent('(offline)');
    expect(kgButton).toBeDisabled();
  });

  it('the empty-state text reflects the selected sources', async () => {
    render(<Wrapper />);
    expect(await screen.findByText('Vraag over Operaton')).toBeInTheDocument();
  });

  it('the send button is disabled without any selected source', async () => {
    mockBusinessApi.mcp.getSources.mockResolvedValue({
      data: [{ id: 'ops', displayName: 'Operaton', description: '', connected: false }],
    });
    render(<Wrapper />);

    await screen.findByPlaceholderText('Selecteer minstens één bron om door te gaan');
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Selecteer minstens één bron/), 'hallo');

    expect(screen.getByTitle('Selecteer minstens één bron')).toBeDisabled();
  });

  it('sending a message streams delta text into a live bubble, then commits it on done', async () => {
    mockBusinessApi.mcp.chatStream.mockReturnValue(
      asyncEvents([
        { type: 'delta', text: 'Hallo' },
        { type: 'delta', text: ' daar' },
        { type: 'done' },
      ])
    );
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.type(
      await screen.findByPlaceholderText(/Stel een vraag/),
      'Wat is de status?{Enter}'
    );

    expect(await screen.findByText('Hallo daar')).toBeInTheDocument();
    expect(mockBusinessApi.mcp.chatStream).toHaveBeenCalledWith(
      'Wat is de status?',
      [],
      ['ops'],
      '',
      expect.any(AbortSignal)
    );
  });

  it('shows a status message while waiting for the stream to continue', async () => {
    // A synchronous mock generator resolves faster than RTL's polling can
    // observe an intermediate state, so gate the final event on a promise
    // this test controls.
    let releaseDone!: () => void;
    const donePromise = new Promise<void>((resolve) => {
      releaseDone = resolve;
    });
    async function* statusThenDone() {
      yield { type: 'status', message: 'Bronnen doorzoeken…' };
      await donePromise;
      yield { type: 'done' };
    }
    mockBusinessApi.mcp.chatStream.mockReturnValue(statusThenDone());

    const user = userEvent.setup();
    render(<Wrapper />);

    await user.type(await screen.findByPlaceholderText(/Stel een vraag/), 'Vraag{Enter}');

    expect(await screen.findByText('Bronnen doorzoeken…')).toBeInTheDocument();
    releaseDone();
  });

  it('shows an error banner with the icon matching the error code', async () => {
    mockBusinessApi.mcp.chatStream.mockReturnValue(
      asyncEvents([{ type: 'error', message: 'Model niet beschikbaar', code: 'model_unavailable' }])
    );
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.type(await screen.findByPlaceholderText(/Stel een vraag/), 'Vraag{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Model niet beschikbaar');
    expect(alert).toHaveTextContent('🛠️');
  });

  it('"Chat wissen" clears the message history', async () => {
    const onMessagesChange = vi.fn();
    const user = userEvent.setup();
    render(
      <McpChatSection
        user={user1}
        messages={[{ role: 'user', content: 'hoi' }]}
        onMessagesChange={onMessagesChange}
      />
    );

    await user.click(await screen.findByRole('button', { name: 'Chat wissen' }));

    expect(onMessagesChange).toHaveBeenCalledWith([]);
  });

  it('toggling an already-selected connected source deselects it', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const opsButton = await screen.findByRole('button', { name: 'Operaton' });
    await user.click(opsButton);

    expect(
      await screen.findByText('Selecteer hieronder een bron om te beginnen')
    ).toBeInTheDocument();
  });
});
