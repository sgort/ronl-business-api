// packages/public-site/src/pages/Toegankelijkheid.tsx
import type { Lang } from '../i18n';
import Crumbs from '../components/Crumbs';

export default function Toegankelijkheid({ lang }: { lang: Lang }) {
  const nl = lang === 'nl';
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap pub-detail-body">
        <Crumbs
          lang={lang}
          trail={[
            { label: nl ? 'Home' : 'Home', to: '/' },
            { label: nl ? 'Toegankelijkheid' : 'Accessibility' },
          ]}
        />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {nl ? 'Toegankelijkheidverklaring' : 'Accessibility statement'}
        </h1>
        <p className="pub-lede-2">
          {nl
            ? 'Provincie Flevoland streeft naar WCAG 2.1 niveau AA voor deze website.'
            : 'The Province of Flevoland aims for WCAG 2.1 level AA conformance on this website.'}
        </p>
        <h2>{nl ? 'Wat is er al op orde' : "What's already in place"}</h2>
        <ul>
          <li>
            {nl
              ? 'Skiplink naar de hoofdinhoud, zichtbaar bij toetsenbordfocus.'
              : 'A skip link to the main content, visible on keyboard focus.'}
          </li>
          <li>
            {nl
              ? 'Zichtbare focusindicator (2px zwart + geel; formuliervelden 2px zwart + blauw) op elk interactief element.'
              : 'A visible focus indicator (2px black + yellow; 2px black + blue on form fields) on every interactive element.'}
          </li>
          <li>
            {nl
              ? 'Een label bij elk formulierveld, ook waar het visueel verborgen is.'
              : 'A label on every form field, even where it is visually hidden.'}
          </li>
          <li>
            {nl ? 'Contrast van minimaal 4,5:1 voor tekst.' : 'A minimum text contrast of 4.5:1.'}
          </li>
          <li>
            {nl
              ? 'Landmark-structuur (header/nav/main/aside/footer) en een kruimelpad.'
              : 'Landmark structure (header/nav/main/aside/footer) and a breadcrumb trail.'}
          </li>
        </ul>
        <h2>{nl ? 'Bekend knelpunt' : 'Known limitation'}</h2>
        <p>
          {nl
            ? 'Deze site gebruikt Fira Sans in plaats van RO Sans (Rijksoverheid Sans) in afwachting van een licentiebesluit; dit heeft geen invloed op de toegankelijkheid.'
            : 'This site uses Fira Sans instead of RO Sans (the Dutch central government typeface) pending a licensing decision; this does not affect accessibility.'}
        </p>
        <h2>{nl ? 'Problemen melden' : 'Reporting a problem'}</h2>
        <p>
          {nl
            ? 'Ondervindt u een toegankelijkheidsprobleem op deze site? Neem contact op via Provincie Flevoland.'
            : 'Found an accessibility problem on this site? Get in touch via the Province of Flevoland.'}
        </p>
      </div>
    </main>
  );
}
