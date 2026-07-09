import { useEffect, useState } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import McpChatSection, { type Message } from '../CaseworkerDashboard/McpChatSection';

const STORAGE_KEY = 'infraBoard.assistant.messages';

interface Props {
  user: KeycloakUser | null;
  onClose: () => void;
}

/**
 * Assistant dock — same pattern as PADock. Reuses McpChatSection verbatim.
 * Conversation persists to sessionStorage under infra-board-specific keys so
 * the caseworker and PA threads stay separate.
 */
export default function InfraDock({ user, onClose }: Props) {
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
      /* non-fatal */
    }
  }, [messages]);

  return (
    <aside className="v2-dock">
      <div className="v2-dock-head">
        <h3 className="v2-dock-title">Project-assistent</h3>
        <button type="button" className="v2-dock-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="v2-dock-body">
        <McpChatSection user={user} messages={messages} onMessagesChange={setMessages} />
      </div>
    </aside>
  );
}
