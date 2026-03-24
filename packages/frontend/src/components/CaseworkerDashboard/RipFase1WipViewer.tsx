import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { businessApi } from '../../services/api';

// ── Types (mirrored from DecisionViewer) ─────────────────────────────────────

interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string }>;
  attrs?: Record<string, unknown>;
}

interface DocumentBlock {
  type: 'text' | 'image' | 'variable' | 'separator' | 'spacer';
  content?: TipTapNode;
  variableKey?: string;
  assetUrl?: string;
}

interface DocumentZone {
  blocks: DocumentBlock[];
}

interface DocumentTemplate {
  id: string;
  name: string;
  zones: {
    letterhead: DocumentZone;
    contactInformation: DocumentZone;
    reference: DocumentZone;
    body: DocumentZone;
    closing: DocumentZone;
    signOff: DocumentZone;
    annex?: DocumentZone | null;
  };
}

// ── Renderer (identical to DecisionViewer) ───────────────────────────────────

function renderTipTapNode(
  node: TipTapNode,
  vars: Record<string, unknown>,
  key: string
): JSX.Element | null {
  if (node.type === 'text') {
    let text = node.text ?? '';
    text = text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
    const marks = node.marks ?? [];
    let el: React.ReactNode = text;
    for (const mark of marks) {
      if (mark.type === 'bold') el = <strong>{el}</strong>;
      if (mark.type === 'italic') el = <em>{el}</em>;
      if (mark.type === 'underline') el = <u>{el}</u>;
    }
    return <span key={key}>{el}</span>;
  }
  const children = (node.content ?? []).map((child, i) =>
    renderTipTapNode(child, vars, `${key}-${i}`)
  );
  switch (node.type) {
    case 'doc':
      return <>{children}</>;
    case 'paragraph':
      return <p key={key}>{children.length ? children : <br />}</p>;
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag key={key}>{children}</Tag>;
    }
    case 'bulletList':
      return (
        <ul key={key} className="list-disc ml-4">
          {children}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="list-decimal ml-4">
          {children}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'hardBreak':
      return <br key={key} />;
    default:
      return <>{children}</>;
  }
}

function renderBlock(
  block: DocumentBlock,
  vars: Record<string, unknown>,
  key: string
): JSX.Element | null {
  switch (block.type) {
    case 'text':
      return (
        <div key={key} className="mb-1 text-sm text-gray-800 leading-relaxed">
          {block.content ? renderTipTapNode(block.content, vars, key) : null}
        </div>
      );
    case 'variable':
      return (
        <span key={key} className="text-sm text-gray-800">
          {block.variableKey ? String(vars[block.variableKey] ?? '') : ''}
        </span>
      );
    case 'separator':
      return <hr key={key} className="my-3 border-gray-200" />;
    case 'spacer':
      return <div key={key} className="h-4" />;
    case 'image':
      return block.assetUrl ? (
        <img key={key} src={block.assetUrl} alt="" className="max-w-full" />
      ) : null;
    default:
      return null;
  }
}

function renderZone(
  zone: DocumentZone | undefined | null,
  vars: Record<string, unknown>,
  prefix: string
): JSX.Element[] {
  if (!zone) return [];
  return zone.blocks.map(
    (block, i) => renderBlock(block, vars, `${prefix}-${i}`) ?? <span key={i} />
  );
}

function DocumentSection({
  label,
  template,
  vars,
}: {
  label: string;
  template: Record<string, unknown> | null;
  vars: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);

  if (!template) {
    return (
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
          <span className="text-sm font-medium text-gray-400">{label}</span>
          <span className="text-xs text-gray-300">Nog niet beschikbaar</span>
        </div>
      </div>
    );
  }

  const t = template as unknown as DocumentTemplate & {
    zones: Record<string, DocumentZone | undefined>;
  };

  const z = t.zones;
  // Handle both camelCase variants used across document templates
  const letterhead = z['letterhead'];
  const contactInfo = z['contactInformation'] ?? z['contactInfo'];
  const reference = z['reference'];
  const body = z['body'];
  const closing = z['closing'];
  const signOff = z['signOff'] ?? z['signoff'];
  const annex = z['annex'];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">{open ? '▲ Verbergen' : '▼ Tonen'}</span>
      </button>
      {open && (
        <div className="bg-white p-6 text-sm space-y-2">
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>{renderZone(letterhead, vars, 'lh')}</div>
            <div>{renderZone(contactInfo, vars, 'ci')}</div>
          </div>
          {(
            [
              ['reference', reference],
              ['body', body],
              ['closing', closing],
              ['signOff', signOff],
              ['annex', annex],
            ] as [string, DocumentZone | undefined][]
          ).map(([name, zone]) => {
            if (!zone || zone.blocks.length === 0) return null;
            return <div key={name}>{renderZone(zone, vars, name)}</div>;
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface RipFase1WipViewerProps {
  instanceId: string;
}

export default function RipFase1WipViewer({ instanceId }: RipFase1WipViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<{
    variables: Record<string, unknown>;
    intakeReport: Record<string, unknown> | null;
    psuReport: Record<string, unknown> | null;
    pdp: Record<string, unknown> | null;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    businessApi.rip
      .phase1Documents(instanceId)
      .then((res) => {
        if (res.success && res.data) setData(res.data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [instanceId]);

  if (loading) {
    return <div className="p-4 text-sm text-gray-400">Documenten laden…</div>;
  }
  if (error || !data) {
    return <div className="p-4 text-sm text-red-500">Documenten konden niet worden geladen.</div>;
  }

  return (
    <div className="p-4 space-y-2">
      <DocumentSection
        label="Intakeverslag (Kolom 2)"
        template={data.intakeReport}
        vars={data.variables}
      />
      <DocumentSection
        label="PSU-verslag (Kolom 3)"
        template={data.psuReport}
        vars={data.variables}
      />
      <DocumentSection
        label="Voorlopige Ontwerpuitgangspunten (Kolom 4)"
        template={data.pdp}
        vars={data.variables}
      />
    </div>
  );
}
