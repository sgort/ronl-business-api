// packages/public-site/src/pages/NotFound.tsx
import { Link } from 'react-router-dom';
import type { Lang } from '../i18n';

export default function NotFound({ lang }: { lang: Lang }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <h1 className="pub-section-h">
          {lang === 'nl' ? 'Pagina niet gevonden' : 'Page not found'}
        </h1>
        <p className="pub-lede-2">
          {lang === 'nl'
            ? 'Deze pagina bestaat niet (meer). Ga terug naar de homepage of zoek opnieuw.'
            : 'This page does not (or no longer) exist. Go back to the homepage or search again.'}
        </p>
        <p>
          <Link to="/">{lang === 'nl' ? '← Terug naar home' : '← Back to home'}</Link>
        </p>
      </div>
    </main>
  );
}
