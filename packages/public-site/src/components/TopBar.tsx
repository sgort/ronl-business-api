// packages/public-site/src/components/TopBar.tsx
import { Link } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';

interface Props {
  t: Translations;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}

export default function TopBar({ t, lang, onLangChange }: Props) {
  return (
    <div className="pub-topbar">
      <div className="pub-wrap">
        <Link className="pub-wordmark" to="/">
          <span className="pub-mark" aria-hidden="true" />
          <span>
            <b>{t.org}</b>
            <span>{t.orgSub}</span>
          </span>
        </Link>
        <div className="pub-topbar-right">
          <div className="pub-lang" role="group" aria-label="Taal / Language">
            <button
              type="button"
              aria-pressed={lang === 'nl'}
              onClick={() => onLangChange('nl')}
              lang="nl"
            >
              NL
            </button>
            <button
              type="button"
              aria-pressed={lang === 'en'}
              onClick={() => onLangChange('en')}
              lang="en"
            >
              EN
            </button>
          </div>
          <a className="pub-login" href={import.meta.env.VITE_STAFF_APP_URL}>
            {t.login} →
          </a>
        </div>
      </div>
    </div>
  );
}
