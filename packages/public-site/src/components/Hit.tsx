// packages/public-site/src/components/Hit.tsx
import { Link } from 'react-router-dom';
import type { Lang } from '../i18n';
import type { PublicHit } from '../lib/api';
import { hrefFor } from '../lib/slug';
import { highlight, truncate } from '../lib/search';
import TypeTag from './TypeTag';

export default function Hit({ item, q, lang }: { item: PublicHit; q: string; lang: Lang }) {
  return (
    <article className="pub-hit">
      <div className="pub-meta">
        <TypeTag type={item.type} lang={lang} />
        <span>{item.org}</span>
        {item.date && (
          <>
            <span className="pub-sep">·</span>
            <span>{item.date}</span>
          </>
        )}
      </div>
      <h3>
        <Link to={hrefFor(item)}>{highlight(item.title, q)}</Link>
      </h3>
      <p>{highlight(truncate(item.summary || '', 210), q)}</p>
    </article>
  );
}
