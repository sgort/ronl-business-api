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

export default function BoardCard({ board, onOpen }: { board: BoardEntry; onOpen: () => void }) {
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
          <button type="button" className="open-link" onClick={onOpen}>
            Openen
            <ArrowRight />
          </button>
        </div>
      </div>
    </article>
  );
}
