import { useState, useRef, useEffect } from 'react';
import { businessApi } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  user: KeycloakUser | null;
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
}

export default function McpChatSection({ user, messages, onMessagesChange }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (!user) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">AI Assistant</h2>
          <p className="text-gray-500 text-sm">Log in as a caseworker to use the AI assistant.</p>
        </div>
      </div>
    );
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    onMessagesChange(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await businessApi.mcp.chat(
        trimmed,
        messages.map((m) => ({ role: m.role, content: m.content }))
      );
      if (res.success && res.data) {
        onMessagesChange([...nextMessages, { role: 'assistant', content: res.data.response }]);
      } else {
        setError('No response received.');
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backendMsg = (err as any)?.response?.data?.error?.message;
      setError(backendMsg ?? 'Request failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex flex-col max-w-3xl" style={{ height: '100%' }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg"
            style={{ backgroundColor: 'var(--color-primary, #154273)' }}
          >
            🤖
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">AI Assistant</h2>
            <p className="text-xs text-gray-400">Powered by Claude + Operaton MCP</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => onMessagesChange([])}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
            title="Clear conversation"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Message history */}
      <div
        className={`flex-1 min-h-0 bg-white rounded-xl border border-gray-200 p-4 space-y-4 mb-3 ${messages.length > 0 ? 'overflow-y-auto' : 'overflow-hidden'}`}
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12">
            <p className="text-3xl mb-3">💬</p>
            <p className="text-sm font-medium text-gray-500 mb-1">
              Ask about your Operaton instance
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              Query process definitions, running instances, open tasks, decision tables,
              deployments, and more.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs mr-2 flex-shrink-0 mt-0.5"
                style={{ backgroundColor: 'var(--color-primary, #154273)' }}
              >
                AI
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'text-white rounded-tr-sm'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm'
              }`}
              style={
                msg.role === 'user' ? { backgroundColor: 'var(--color-primary, #154273)' } : {}
              }
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs mr-2 flex-shrink-0 mt-0.5"
              style={{ backgroundColor: 'var(--color-primary, #154273)' }}
            >
              AI
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-center">
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              {error}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about process instances, tasks, deployments… (Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ '--tw-ring-color': 'var(--color-primary, #154273)' } as React.CSSProperties}
          disabled={loading}
        />
        <button
          onClick={() => void handleSend()}
          disabled={loading || !input.trim()}
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-primary, #154273)' }}
          title="Send"
        >
          <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
