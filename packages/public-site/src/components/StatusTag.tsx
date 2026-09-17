// packages/public-site/src/components/StatusTag.tsx
// Shows a process bundle's status label (e.g. 'example', 'wip', 'e2e') on the
// public listing — see #111. The label text is always rendered, so the
// distinction never rests on colour alone; the colour is a bonus, not the
// signal.
const KNOWN_STATUS_CLASS: Record<string, string> = {
  example: 's-example',
  wip: 's-wip',
  e2e: 's-e2e',
};

export default function StatusTag({ status }: { status: string }) {
  const cls = KNOWN_STATUS_CLASS[status] ?? 's-other';
  return <span className={`pub-status ${cls}`}>{status}</span>;
}
