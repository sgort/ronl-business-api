// packages/public-site/src/components/MainNav.tsx
import { NavLink } from 'react-router-dom';
import type { Lang } from '../i18n';
import { PUB_SECTIONS, WOORDENBOEK_PATH, HERKOMST_PATH, sectionLabel } from '../lib/sections';

export default function MainNav({ lang }: { lang: Lang }) {
  return (
    <nav className="pub-nav" aria-label={lang === 'nl' ? 'Hoofdnavigatie' : 'Main navigation'}>
      <div className="pub-wrap">
        <ul>
          <li>
            <NavLink to="/" end>
              {lang === 'nl' ? 'Home' : 'Home'}
            </NavLink>
          </li>
          {PUB_SECTIONS.map((s) => (
            <li key={s.id}>
              <NavLink to={s.path}>{sectionLabel(s, lang)}</NavLink>
            </li>
          ))}
          <li>
            <NavLink to={WOORDENBOEK_PATH}>
              {lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}
            </NavLink>
          </li>
          <li>
            <NavLink to={HERKOMST_PATH}>{lang === 'nl' ? 'Herkomst' : 'Provenance'}</NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}
