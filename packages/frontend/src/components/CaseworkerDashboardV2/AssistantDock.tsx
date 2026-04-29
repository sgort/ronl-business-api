/**
 * AssistantDock — right-side container for the AI assistant.
 *
 * It re-uses the existing McpChatSection component verbatim — that
 * component already manages its own messages, sources and model
 * selectors. We only own the dock chrome (header + close button).
 *
 * Conversation state is hoisted here so toggling the dock open/closed
 * does NOT lose the conversation; the messages are also persisted to
 * sessionStorage so a page reload keeps the thread.
 */

import { useEffect, useState } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import McpChatSection, { type Message } from '../CaseworkerDashboard/McpChatSection';

const STORAGE_KEY = 'cwdV2.assistant.messages';

interface Props {
  user: KeycloakUser | null;
  onClose: () => void;
}

export default function AssistantDock({ user, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* quota / disabled storage — non-fatal */
    }
  }, [messages]);

  return (
    <aside className="v2-dock" aria-label="AI Assistant">
      <header className="v2-dock-head">
        <h2 className="v2-dock-title">Assistent</h2>
        <button type="button" className="v2-dock-close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      </header>
      <div className="v2-dock-body">
        <McpChatSection user={user} messages={messages} onMessagesChange={setMessages} />
      </div>
    </aside>
  );
}
