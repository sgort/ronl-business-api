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
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-out flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
      >
        {/* Header — tenant-aware gradient, matches ChangelogPanel */}
        <div className="flex-shrink-0 text-white px-6 py-4 shadow-md" style={headerStyle}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔔</span>
              <div>
                <h2 id="notifications-title" className="text-xl font-bold">
                  Notificaties
                </h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  Nieuwe signalen op uw gevolgde zoekcriteria en dossiers
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
              aria-label="Sluit meldingen"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">Geen meldingen.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`border rounded-lg p-4 ${
                    n.seenAt ? 'border-gray-200 opacity-60' : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="font-semibold text-gray-900 text-sm break-words">{n.title}</div>
                  <div className="text-xs text-gray-600 mt-1 break-words">
                    {n.src}
                    {n.ref && (
                      <a
                        href={n.ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 font-semibold hover:underline"
                        style={{ color: 'var(--color-primary, #2563eb)' }}
                      >
                        {n.ref.nr} ↗
                      </a>
                    )}
                  </div>
                  {n.matchedSearches.length > 0 && (
                    <div className="text-xs text-gray-400 font-mono mt-1 break-words">
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
          <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200 text-center">
            <button
              type="button"
              onClick={() => void ackNotifications()}
              className="text-sm font-semibold hover:underline"
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
