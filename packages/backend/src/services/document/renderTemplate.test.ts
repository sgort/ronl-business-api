jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { renderTemplate } from './renderTemplate';
import type { DocumentTemplate } from './documentTemplate.types';

const doc = (text: string, bold = false) => ({
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }],
    },
  ],
});

const template = (zones: Record<string, unknown>): DocumentTemplate =>
  ({
    id: 'rip-pdp',
    name: 'test',
    schemaVersion: 1,
    assets: [],
    createdAt: '',
    updatedAt: '',
    bindings: [
      {
        id: 'b1',
        placeholder: '{{projectNumber}}',
        variableKey: 'projectNumber',
        source: 'process',
      },
      { id: 'b2', placeholder: '{{pdpNotes}}', variableKey: 'pdpNotes', source: 'process' },
    ],
    zones,
  }) as unknown as DocumentTemplate;

describe('renderTemplate', () => {
  it('resolves bound placeholders from process variables', () => {
    const out = renderTemplate(
      template({
        body: { blocks: [{ id: 'b', type: 'text', content: doc('Nr {{projectNumber}}') }] },
      }),
      { projectNumber: '24102' }
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks[0].runs.map((r) => r.text).join('')).toBe('Nr 24102');
  });

  it('renders an unresolved placeholder as an em dash', () => {
    const out = renderTemplate(
      template({
        body: { blocks: [{ id: 'b', type: 'text', content: doc('Notes {{pdpNotes}}') }] },
      }),
      {}
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks[0].runs.map((r) => r.text).join('')).toBe('Notes —');
  });

  it('accepts the legacy lowercase signoff zone key', () => {
    const out = renderTemplate(
      template({
        signoff: { blocks: [{ id: 's', type: 'text', content: doc('Project manager:', true) }] },
      }),
      {}
    );
    const signoff = out.zones.find((z) => z.id === 'signOff');
    expect(signoff).toBeDefined();
    expect(signoff!.blocks[0].runs[0]).toEqual({ text: 'Project manager:', bold: true });
  });

  it('orders zones canonically regardless of key order in the file', () => {
    const out = renderTemplate(
      template({
        signOff: { blocks: [{ id: 's', type: 'text', content: doc('sig') }] },
        letterhead: { blocks: [{ id: 'l', type: 'text', content: doc('head') }] },
      }),
      {}
    );
    expect(out.zones.map((z) => z.id)).toEqual(['letterhead', 'signOff']);
  });
});
