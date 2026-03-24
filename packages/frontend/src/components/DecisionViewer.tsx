import { Form } from '@bpmn-io/form-js';
import '@bpmn-io/form-js/dist/assets/form-js.css';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { businessApi } from '../services/api';

// ── DocumentTemplate types (mirrored from LDE) ──────────────────────────────

interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string }>;
  attrs?: Record<string, unknown>;
}

interface DocumentBlock {
  type: 'text' | 'image' | 'variable' | 'separator' | 'spacer';
  content?: TipTapNode; // ProseMirror doc node for type==='text'
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

// ── TipTap → React renderer ──────────────────────────────────────────────────

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
  zone: DocumentZone,
  vars: Record<string, unknown>,
  prefix: string
): JSX.Element[] {
  return zone.blocks.map((block, i) => renderBlock(block, vars, `${prefix}-${i}`) ?? <></>);
}

// ── Hardcoded fallback schema (form-js) ─────────────────────────────────────

const FALLBACK_SCHEMA = {
  schemaVersion: 16,
  type: 'default',
  id: 'awb-notify-applicant-readonly',
  executionPlatform: 'Camunda Platform',
  executionPlatformVersion: '7.21.0',
  components: [
    { id: 'Text_Header', type: 'text', text: '# Beslissing op uw aanvraag' },
    {
      id: 'Field_Status',
      type: 'textfield',
      label: 'Status',
      key: 'status',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_PermitDecision',
      type: 'textfield',
      label: 'Vergunningsbesluit',
      key: 'permitDecision',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_FinalMessage',
      type: 'textarea',
      label: 'Beslissing',
      key: 'finalMessage',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_ReplacementInfo',
      type: 'textarea',
      label: 'Herplantinformatie',
      key: 'replacementInfo',
      readonly: true,
      disabled: true,
    },
    {
      id: 'Field_DossierReference',
      type: 'textfield',
      label: 'Dossiernummer',
      key: 'dossierReference',
      readonly: true,
      disabled: true,
    },
  ],
};

// ── Component ────────────────────────────────────────────────────────────────

interface DecisionViewerProps {
  processInstanceId: string;
  showFallback?: boolean;
}

type Status = 'loading' | 'ready' | 'fallback' | 'error';

export default function DecisionViewer({
  processInstanceId,
  showFallback = true,
}: DecisionViewerProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [vars, setVars] = useState<Record<string, unknown>>({});

  // form-js fallback refs — always in DOM to avoid containerRef null on first render
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<InstanceType<typeof Form> | null>(null);

  // Step 1: fetch variables + document template in parallel
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const [varResult, docResult] = await Promise.allSettled([
        businessApi.process.historicVariables(processInstanceId),
        businessApi.process.decisionDocument(processInstanceId),
      ]);

      if (cancelled) return;

      const historicVars =
        varResult.status === 'fulfilled' && varResult.value.success
          ? (varResult.value.data ?? {})
          : {};

      const resolvedVars = historicVars as Record<string, unknown>;

      if (docResult.status === 'fulfilled' && docResult.value.success && docResult.value.template) {
        setVars(resolvedVars);
        setTemplate(docResult.value.template as unknown as DocumentTemplate);
        setStatus('ready');
      } else {
        // 404 or pre-document-template deployment → fall back to form-js readonly schema
        setVars(resolvedVars);
        setStatus('fallback');
      }
    };

    init().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [processInstanceId]);

  // Step 2: mount form-js only in fallback mode
  useEffect(() => {
    if (status !== 'fallback' || !containerRef.current) return;

    const form = new Form({ container: containerRef.current });
    formRef.current = form;

    form.importSchema(FALLBACK_SCHEMA, vars).catch(() => {
      /* non-fatal */
    });

    return () => {
      formRef.current?.destroy();
      formRef.current = null;
    };
    // vars intentionally excluded — we only mount once when status flips to 'fallback'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="mt-3">
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Beslissing laden…
        </div>
      )}

      {status === 'error' && showFallback && (
        <p className="text-sm text-red-500">Document kon niet worden geladen.</p>
      )}

      {/* Document template renderer */}
      {status === 'ready' && template && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm space-y-2">
          {/* Letterhead + ContactInformation side by side — mirrors Document Composer canvas layout */}
          <div className="grid grid-cols-2 gap-6 mb-4">
            <div>{renderZone(template.zones.letterhead, vars, 'letterhead')}</div>
            <div>{renderZone(template.zones.contactInformation, vars, 'contactInformation')}</div>
          </div>

          {/* Remaining zones stacked */}
          {(['reference', 'body', 'closing', 'signOff', 'annex'] as const).map((zoneName) => {
            const zone = template.zones[zoneName];
            if (!zone) return null;
            return <div key={zoneName}>{renderZone(zone, vars, zoneName)}</div>;
          })}
        </div>
      )}

      {/* form-js fallback — container always in DOM once status==='fallback' */}
      <div
        ref={containerRef}
        className={status === 'fallback' && showFallback ? 'fjs-container' : 'hidden'}
      />
    </div>
  );
}
