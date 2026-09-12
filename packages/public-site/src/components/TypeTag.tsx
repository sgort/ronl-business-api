// packages/public-site/src/components/TypeTag.tsx
import type { Lang } from '../i18n';
import { PUB_TYPE_LABEL, type PubType } from '../lib/sections';

export default function TypeTag({ type, lang }: { type: PubType; lang: Lang }) {
  return <span className={`pub-type t-${type}`}>{PUB_TYPE_LABEL[type][lang]}</span>;
}
