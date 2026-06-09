/**
 * PADock — assistant dock for the PA cockpit.
 *
 * Re-uses the existing McpChatSection verbatim (same as the caseworker
 * AssistantDock), so the IOU assistant works out of the box. We own only the
 * dock chrome + the "IOU" badge. Conversation + width persist to
 * sessionStorage under PA-specific keys so the caseworker thread is separate.
 *
 * NOTE: McpChatSection lives at components/CaseworkerDashboard/McpChatSection.
 * It is product-neutral chat chrome; importing it here is the same reuse the
 * caseworker dock does — no caseworker logic leaks in.
 */

import { useEffect, useState } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import McpChatSection, { type Message } from '../CaseworkerDashboard/McpChatSection';

const STORAGE_KEY = 'paV2.assistant.messages';
const STORAGE_KEY_WIDTH = 'paV2.assistant.width';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 320;
const WIDTH_STEP = 24;

function clampWidth(width: number): number {
  const max = Math.min(720, Math.round(window.innerWidth * 0.6));
  return Math.min(Math.max(width, MIN_WIDTH), max);
}

interface Props {
  user: KeycloakUser | null;
  onClose: () => void;
}

export default function PADock({ user, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch {
      return [];
    }
  });

  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_WIDTH);
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* non-fatal */
    }
  }, [messages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_WIDTH, String(width));
    } catch {
      /* non-fatal */
    }
  }, [width]);

  useEffect(() => {
    if (!resizing) return;
    const onPointerMove = (e: PointerEvent) => setWidth(clampWidth(window.innerWidth - e.clientX));
    const stop = () => setResizing(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [resizing]);

  return (
    <aside className="pac-dock" style={{ width }} aria-label="IOU-assistent">
      <div
        className={`pac-dock-resize ${resizing ? 'dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Breedte van het assistentpaneel"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setWidth((w) => clampWidth(w + WIDTH_STEP));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setWidth((w) => clampWidth(w - WIDTH_STEP));
          }
        }}
      />
      <header className="pac-dock-head">
        <h2 className="pac-dock-title">
          Assistent <span className="pac-dock-iou">IOU</span>
        </h2>
        <button type="button" className="pac-dock-close" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      </header>
      <div className="pac-dock-body">
        <McpChatSection user={user} messages={messages} onMessagesChange={setMessages} />
      </div>
    </aside>
  );
}
