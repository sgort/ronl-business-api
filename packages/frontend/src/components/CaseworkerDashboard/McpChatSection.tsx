import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { businessApi } from '../../services/api';
import type { McpSourceMeta, LlmModelEntry } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';
import remarkGfm from 'remark-gfm';

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
  const [streamingContent, setStreamingContent] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableSources, setAvailableSources] = useState<McpSourceMeta[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState<LlmModelEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);

  // Fetch available models and sources once on mount
  useEffect(() => {
    let cancelled = false;
    businessApi.mcp.getModels().then((res) => {
      const models = res.data ?? [];
      setAvailableModels(models);
      if (models.length > 0) setSelectedModelId(models[0].id);
    });
    businessApi.mcp
      .getSources()
      .then((res) => {
        if (cancelled) return;
        const sources = res.data ?? [];
        setAvailableSources(sources);
        // Pre-select all connected sources
        setSelectedSources(new Set(sources.filter((s) => s.connected).map((s) => s.id)));
      })
      .catch(() => {
        if (!cancelled) setAvailableSources([]);
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingContent]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (!user) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">AI-assistent</h2>
          <p className="text-gray-500 text-sm">
            Log in als medewerker om de AI-assistent te gebruiken.
          </p>
        </div>
      </div>
    );
  }

  function toggleSource(id: string) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading || selectedSources.size === 0) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    onMessagesChange(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);
    setStreamingContent('');
    setStatusMessage(null);
    streamingRef.current = '';

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const sources = Array.from(selectedSources);

      for await (const event of businessApi.mcp.chatStream(
        trimmed,
        history,
        sources,
        selectedModelId,
        abort.signal
      )) {
        if (abort.signal.aborted) break;

        if (event.type === 'delta') {
          streamingRef.current += event.text;
          setStreamingContent(streamingRef.current);
          setStatusMessage(null);
        } else if (event.type === 'status') {
          setStatusMessage(event.message);
        } else if (event.type === 'done') {
          onMessagesChange([...nextMessages, { role: 'assistant', content: streamingRef.current }]);
          streamingRef.current = '';
          setStreamingContent('');
          setStatusMessage(null);
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message ?? 'Verzoek mislukt. Probeer het opnieuw.');
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStreamingContent('');
      setStatusMessage(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleClear() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreamingContent('');
    setStatusMessage(null);
    setError(null);
    streamingRef.current = '';
    onMessagesChange([]);
  }

  const showTypingIndicator = loading && streamingContent === '' && statusMessage === null;
  const showStatusWithDots = loading && streamingContent === '' && statusMessage !== null;
  const canSend = !loading && selectedSources.size > 0;

  const selectedDisplayNames = availableSources
    .filter((s) => selectedSources.has(s.id))
    .map((s) => s.displayName);

  const subtitle =
    selectedDisplayNames.length > 0
      ? `Claude + ${selectedDisplayNames.join(', ')}`
      : 'Claude — geen bronnen geselecteerd';

  const emptyStateText =
    selectedDisplayNames.length > 0
      ? `Vraag over ${selectedDisplayNames.join(' of ')}`
      : 'Selecteer hieronder een bron om te beginnen';

  return (
    <div className="flex flex-col max-w-3xl" style={{ height: '100%' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg"
            style={{ backgroundColor: 'var(--color-secondary, var(--color-primary, #154273))' }}
          >
            🤖
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800">AI-assistent</h2>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
            {availableModels.length > 1 && (
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={loading}
                className="text-xs border border-gray-200 rounded-md px-1.5 py-0.5 mt-1 bg-white text-gray-500 focus:outline-none focus:ring-1 focus:border-transparent disabled:opacity-50"
                style={
                  { '--tw-ring-color': 'var(--color-primary, #154273)' } as React.CSSProperties
                }
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.providerDisplayName} — {m.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {(messages.length > 0 || loading) && (
          <button
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
            title="Gesprek wissen"
          >
            Chat wissen
          </button>
        )}
      </div>

      {/* Message history */}
      <div
        className={`flex-1 min-h-0 bg-white rounded-xl border border-gray-200 p-4 space-y-4 mb-3 ${
          messages.length > 0 || loading ? 'overflow-y-auto' : 'overflow-hidden'
        }`}
      >
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12">
            <p className="text-3xl mb-3">💬</p>
            <p className="text-sm font-medium text-gray-500 mb-1">{emptyStateText}</p>
            {selectedDisplayNames.length > 0 && (
              <p className="text-xs text-gray-400 max-w-xs">
                Stel vragen over procesinstanties, taken, besluiten, kennisgrafiekgegevens en meer.
              </p>
            )}
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
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'text-white rounded-tr-sm whitespace-pre-wrap'
                  : 'bg-gray-100 text-gray-800 rounded-tl-sm prose prose-sm max-w-none'
              }`}
              style={
                msg.role === 'user' ? { backgroundColor: 'var(--color-primary, #154273)' } : {}
              }
            >
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {/* In-progress assistant bubble */}
        {loading && streamingContent !== '' && (
          <div className="flex justify-start">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs mr-2 flex-shrink-0 mt-0.5"
              style={{ backgroundColor: 'var(--color-primary, #154273)' }}
            >
              AI
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm leading-relaxed text-gray-800 max-w-[80%] prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
              <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 align-text-bottom animate-pulse" />
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {(showTypingIndicator || showStatusWithDots) && (
          <div className="flex justify-start">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs mr-2 flex-shrink-0 mt-0.5"
              style={{ backgroundColor: 'var(--color-primary, #154273)' }}
            >
              AI
            </div>
            <div>
              {showStatusWithDots && (
                <p className="text-xs text-gray-400 mb-1 px-1">{statusMessage}</p>
              )}
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <span className="text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-full">{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Source selector */}
      {!sourcesLoading && availableSources.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {availableSources.map((source) => {
            const isSelected = selectedSources.has(source.id);
            const isDisabled = loading || !source.connected;
            return (
              <button
                key={source.id}
                onClick={() => !isDisabled && toggleSource(source.id)}
                title={source.description}
                disabled={isDisabled}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-400 bg-white'
                    : isSelected
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                }`}
                style={
                  isSelected && !isDisabled
                    ? {
                        backgroundColor: 'var(--color-primary, #154273)',
                        borderColor: 'var(--color-primary, #154273)',
                      }
                    : {}
                }
              >
                {source.displayName}
                {!source.connected && ' (offline)'}
              </button>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            canSend
              ? 'Stel een vraag… (Enter om te verzenden)'
              : 'Selecteer minstens één bron om door te gaan'
          }
          disabled={loading}
          rows={3}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-14 text-sm resize-none focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50"
          style={{ '--tw-ring-color': 'var(--color-primary, #154273)' } as React.CSSProperties}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!canSend || !input.trim()}
          className="absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-opacity disabled:opacity-30"
          style={{ backgroundColor: 'var(--color-primary, #154273)' }}
          title={selectedSources.size === 0 ? 'Selecteer minstens één bron' : 'Verzenden'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
