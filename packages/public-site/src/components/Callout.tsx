// packages/public-site/src/components/Callout.tsx
import type { ReactNode } from 'react';

export default function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pub-callout">
      <b>{title}</b>
      {children}
    </div>
  );
}
