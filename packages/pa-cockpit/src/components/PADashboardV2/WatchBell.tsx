/**
 * Reusable watch/notify toggle — red when active (matching signals land in the
 * notification inbox and personal RSS feed), gray when not. One component,
 * every "watch this" surface (saved-search rows, dossier detail header).
 */
export default function WatchBell({
  active,
  onToggle,
  title,
  disabled = false,
}: {
  active: boolean;
  onToggle: () => void;
  title?: string;
  /** Set while a toggle request is in flight, so a rapid double-click can't
   *  fire two overlapping requests and leave the UI out of sync with the
   *  server (each click flips local state once, so two in-flight clicks
   *  cancel each other out visually while the server only sees one net
   *  change — or two of the same, depending on timing). */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`pac-watch-bell ${active ? 'active' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      title={title ?? (active ? 'Niet meer volgen' : 'Volgen — meldingen bij nieuwe signalen')}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 1.5c-2 0-3.4 1.6-3.4 3.7v2.1c0 .5-.2 1-.6 1.4L3 9.7c-.5.5-.2 1.3.5 1.3h9c.7 0 1-.8.5-1.3l-1-1c-.4-.4-.6-.9-.6-1.4V5.2c0-2.1-1.4-3.7-3.4-3.7z"
          fill="currentColor"
        />
        <path
          d="M6.5 12.5a1.5 1.5 0 0 0 3 0"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
