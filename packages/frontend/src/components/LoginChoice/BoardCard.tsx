import type { BoardEntry } from '../../pages/login-choice/boards.config';
import BoardPreview from './BoardPreview';

const ArrowRight = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const KeyIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6" />
    <path d="m15.5 7.5 3 3L22 7l-3-3" />
  </svg>
);

interface Props {
  board: BoardEntry;
  onOpen: () => void;
  /** Set for boards with an Entra ID role: opens the board with the Flevoland account. */
  onOpenWithEntra?: () => void;
}

export default function BoardCard({ board, onOpen, onOpenWithEntra }: Props) {
  return (
    <article className="card">
      <BoardPreview kind={board.preview} />
      <div className="body">
        <p className="role">{board.roleLabel}</p>
        <h3>{board.title}</h3>
        <p className="desc">{board.blurb}</p>
        <div className="meta">
          <span className="avail">
            <span className="led" />
            Beschikbaar
          </span>
          {onOpenWithEntra && (
            <button
              type="button"
              className="entra-link"
              aria-label={`${board.title} openen met uw Flevoland-account`}
              onClick={onOpenWithEntra}
            >
              <KeyIcon />
              Flevoland-account
            </button>
          )}
          <button type="button" className="open-link" onClick={onOpen}>
            Openen
            <ArrowRight />
          </button>
        </div>
      </div>
    </article>
  );
}
