import type { Lang } from '../../i18n';
import { KT_CONCEPTS, htx, type KtBegrip } from './herkomstConcepts';

export default function HerkomstChip({
  c,
  lang,
  onOpen,
}: {
  c: KtBegrip;
  lang: Lang;
  onOpen: (id: string) => void;
}) {
  const target = c.ref ? KT_CONCEPTS[c.ref] : null;

  if (!target) {
    return <span className="pub-herkomst-chip pub-herkomst-leaf">{htx(c.naam, lang)}</span>;
  }

  return (
    <button type="button" className="pub-herkomst-chip" onClick={() => onOpen(c.ref!)}>
      {htx(target.naam, lang)}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2 6h7M6 3l3 3-3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
