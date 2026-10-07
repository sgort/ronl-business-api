import { useEffect, useRef } from 'react';

import type { BoardEntry } from '../../pages/login-choice/boards.config';
import './access-denied.css';

interface Props {
  board: BoardEntry;
  /** Who is signed in, from the token. */
  name?: string;
  /** Their own dashboard; null when they have no staff role. */
  home: string | null;
  onHome: () => void;
  onLogout: () => void;
  onClose: () => void;
}

/**
 * Shown on a landing page when the board someone chose there is refused after
 * login. It stays until closed, rather than flashing past: it names the role
 * that is missing (and the Entra ID app role to ask for) and offers a way on.
 * Escape, the close button or a click beside the panel closes it; Tab stays
 * inside, as in ProcessOverlay.
 */
export default function AccessDeniedDialog({
  board,
  name,
  home,
  onHome,
  onLogout,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>('button')?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="lcp-denied"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lcp-denied-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel" ref={panelRef}>
        <h2 id="lcp-denied-title">Geen toegang tot {board.title}</h2>
        <p>
          {name
            ? `U bent ingelogd als ${name}, maar uw account heeft de rol `
            : 'Uw account heeft de rol '}
          <b>{board.roleLabel}</b> niet.
        </p>
        {board.entraRole ? (
          <p>
            Logt u in met uw Flevoland-account? Vraag uw functioneel beheerder om de app-rol{' '}
            <code>{board.entraRole}</code> in Entra ID.
          </p>
        ) : (
          <p>Vraag uw functioneel beheerder om toegang.</p>
        )}
        <div className="actions">
          {home && (
            <button type="button" className="primary" onClick={onHome}>
              Naar mijn dashboard
            </button>
          )}
          <button type="button" className="secondary" onClick={onLogout}>
            Uitloggen
          </button>
        </div>
        <button type="button" className="close" aria-label="Sluiten" onClick={onClose}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
