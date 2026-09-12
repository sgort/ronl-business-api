// packages/public-site/src/components/Crumbs.tsx
import { Link } from 'react-router-dom';
import type { Lang } from '../i18n';

export interface Crumb {
  label: string;
  to?: string;
}

export default function Crumbs({ lang, trail }: { lang: Lang; trail: Crumb[] }) {
  return (
    <nav className="pub-crumbs" aria-label={lang === 'nl' ? 'kruimelpad' : 'breadcrumb'}>
      {trail.map((c, i) => (
        <span key={i}>
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
          {i < trail.length - 1 && <span aria-hidden="true"> › </span>}
        </span>
      ))}
    </nav>
  );
}
