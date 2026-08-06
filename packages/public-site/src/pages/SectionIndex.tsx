// packages/public-site/src/pages/SectionIndex.tsx
import type { Translations, Lang } from '../i18n';
import type { PubType } from '../lib/sections';
export default function SectionIndex(_props: { t: Translations; lang: Lang; type: PubType }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
