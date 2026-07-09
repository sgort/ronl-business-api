/**
 * AssistantDock — floating overlay panel for the AI assistant.
 *
 * It re-uses the existing McpChatSection component verbatim — that
 * component already manages its own messages, sources and model
 * selectors. We only own the dock chrome (header, close button,
 * resize handle).
 *
 * Conversation state is hoisted here so toggling the dock open/closed
 * does NOT lose the conversation; the messages are also persisted to
 * sessionStorage so a page reload keeps the thread. The panel's width
 * is persisted the same way, so a resize sticks across reloads.
 *
 * The panel floats above the page (see `.v2-dock` — `position: absolute`
 * over `.v2-body`) rather than sharing a grid column with the main
 * content, so opening/resizing it never reflows the section underneath.
 */

import { useEffect, useState } from 'react';
import type { KeycloakUser } from '@ronl/shared';
import McpChatSection, { type Message } from '../CaseworkerDashboard/McpChatSection';

const STORAGE_KEY = 'cwdV2.assistant.messages';
const STORAGE_KEY_WIDTH = 'cwdV2.assistant.width';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 320;
const WIDTH_STEP = 24;

// The dock is right-aligned, so its width is `viewport right edge − cursor x`.
// Cap at 60% of the viewport (and 720px) so it can never crowd out the page.
function clampWidth(width: number): number {
  const max = Math.min(720, Math.round(window.innerWidth * 0.6));
  return Math.min(Math.max(width, MIN_WIDTH), max);
}

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
      /* quota / disabled storage — non-fatal */
    }
  }, [messages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_WIDTH, String(width));
    } catch {
      /* non-fatal */
    }
  }, [width]);

  // Drag-to-resize: track the pointer for the duration of the drag, derive
  // the new width from cursor position, and restore cursor/selection on release.
  useEffect(() => {
    if (!resizing) return;

    const onPointerMove = (e: PointerEvent) => {
      setWidth(clampWidth(window.innerWidth - e.clientX));
    };
    const stopResizing = () => setResizing(false);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [resizing]);

  return (
    <aside className="v2-dock" style={{ width }} aria-label="AI-assistent">
      {/* Drag the left edge to resize; arrow keys nudge it for keyboard users */}
      <div
        className={`v2-dock-resize ${resizing ? 'dragging' : ''}`}
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
