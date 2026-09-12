import { useEffect } from 'react';
import { usePaData } from './PaDataProvider';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Meldingen — same slide-over pattern as ChangelogPanel (pages/ChangelogPanel.tsx):
 * overlay + right-hand panel, ESC/click-outside/X to close, never a toggle-on-the-
 * trigger-button. Deliberately mirrored so the affordance is instantly recognisable.
 */
export default function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
  const { notifications, ackNotifications } = usePaData();
  const { items, unseenCount } = notifications.data;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const headerStyle: React.CSSProperties = {
    background:
      'linear-gradient(to right, var(--color-primary, #2563eb), var(--color-primary-dark, #1d4ed8))',
  };

  return (
    <>
      {/* Overlay */}
      <div className="pac-notif-overlay" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        className="pac-notif-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
      >
        {/* Header — tenant-aware gradient, matches ChangelogPanel */}
        <div className="pac-notif-header" style={headerStyle}>
          <div className="pac-notif-header-row">
            <div className="pac-notif-header-left">
              <span className="pac-notif-icon">🔔</span>
              <div>
                <h2 id="notifications-title" className="pac-notif-title">
                  Notificaties
                </h2>
                <p className="pac-notif-subtitle" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  Nieuwe signalen op uw gevolgde zoekcriteria en dossiers
                </p>
              </div>
            </div>
            <button onClick={onClose} className="pac-notif-close" aria-label="Sluit meldingen">
              <svg
                className="pac-notif-close-icon"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="pac-notif-content">
          {items.length === 0 ? (
            <p className="pac-notif-empty">Geen meldingen.</p>
          ) : (
            <ul className="pac-notif-list">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`pac-notif-item ${
                    n.seenAt ? 'pac-notif-item--seen' : 'pac-notif-item--unseen'
                  }`}
                >
                  <div className="pac-notif-item-title">{n.title}</div>
                  <div className="pac-notif-item-src">
                    {n.src}
                    {n.ref && (
                      <a
                        href={n.ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pac-notif-item-link"
                        style={{ color: 'var(--color-primary, #2563eb)' }}
                      >
                        {n.ref.nr} ↗
                      </a>
                    )}
                  </div>
                  {n.matchedSearches.length > 0 && (
                    <div className="pac-notif-item-via">
                      via {n.matchedSearches.map((m) => m.label).join(', ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer - Sticky at bottom, only when there's something to ack */}
        {unseenCount > 0 && (
          <div className="pac-notif-footer">
            <button
              type="button"
              onClick={() => void ackNotifications()}
              className="pac-notif-ack"
              style={{ color: 'var(--color-primary, #2563eb)' }}
            >
              Alles gelezen
            </button>
          </div>
        )}
      </div>
    </>
  );
}
