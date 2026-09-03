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
  it('skips a zone key that is neither canonical nor a known alias', () => {
    const out = renderTemplate(
      template({
        sidebar: { blocks: [{ id: 'x', type: 'text', content: doc('Should not render') }] },
        body: { blocks: [{ id: 'b', type: 'text', content: doc('Kept') }] },
      }),
      {}
    );
    expect(out.zones.map((z) => z.id)).toEqual(['body']);
  });

  it('skips a zone whose value is null', () => {
    // DocumentTemplate.zones is typed `DocumentZone | null | undefined` --
    // deployed fixtures do carry null entries for zones the author cleared.
    const out = renderTemplate(template({ body: null, closing: undefined }), {});
    expect(out.zones).toEqual([]);
  });

  it('omits a zone whose blocks all render to nothing', () => {
    const out = renderTemplate(template({ body: { blocks: [{ id: 'i', type: 'image' }] } }), {});
    expect(out.zones).toEqual([]);
  });

  it('renders separator and spacer blocks without runs', () => {
    const out = renderTemplate(
      template({
        body: {
          blocks: [
            { id: 's', type: 'separator' },
            { id: 'p', type: 'spacer' },
          ],
        },
      }),
      {}
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks).toEqual([
      { kind: 'separator', runs: [] },
      { kind: 'spacer', runs: [] },
    ]);
  });

  it('skips unsupported block types rather than throwing', () => {
    const out = renderTemplate(
      template({
        body: {
          blocks: [
            { id: 'i', type: 'image' },
            { id: 'v', type: 'variable' },
            { id: 't', type: 'text', content: doc('Survives') },
          ],
        },
      }),
      {}
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0].runs[0].text).toBe('Survives');
  });

  it('treats a text block with no content as empty', () => {
    const out = renderTemplate(
      template({
        body: {
          blocks: [
            { id: 'empty', type: 'text' },
            { id: 't', type: 'text', content: doc('Only me') },
          ],
        },
      }),
      {}
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks).toHaveLength(1);
  });

  it('defaults a heading node with no level attribute to level 1', () => {
    const out = renderTemplate(
      template({
        body: {
          blocks: [
            {
              id: 'h',
              type: 'text',
              content: {
                type: 'doc',
                content: [
                  { type: 'heading', content: [{ type: 'text', text: 'No attrs' }] },
                  {
                    type: 'heading',
                    attrs: { level: 3 },
                    content: [{ type: 'text', text: 'Level three' }],
                  },
                ],
              },
            },
          ],
        },
      }),
      {}
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks.map((b) => b.level)).toEqual([1, 3]);
  });

  it('ignores node types that are neither heading nor paragraph', () => {
    const out = renderTemplate(
      template({
        body: {
          blocks: [
            {
              id: 'h',
              type: 'text',
              content: {
                type: 'doc',
                content: [
                  { type: 'bulletList', content: [{ type: 'text', text: 'item' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Kept' }] },
                ],
              },
            },
          ],
        },
      }),
      {}
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0].runs[0].text).toBe('Kept');
  });

  it('merges an alias key into the canonical zone it already populated', () => {
    // signOff and signoff both resolve to signOff; the second one to be
    // visited must append to the first's blocks, not replace them.
    const out = renderTemplate(
      template({
        signOff: { blocks: [{ id: 'a', type: 'text', content: doc('First') }] },
        signoff: { blocks: [{ id: 'b', type: 'text', content: doc('Second') }] },
      }),
      {}
    );
    const signOff = out.zones.find((z) => z.id === 'signOff')!;
    expect(signOff.blocks.map((b) => b.runs[0].text)).toEqual(['First', 'Second']);
  });

  it('returns no zones for a template with no zones object at all', () => {
    const bare = { id: 'rip-pdp', bindings: [] } as unknown as DocumentTemplate;
    expect(renderTemplate(bare, {})).toEqual({ templateId: 'rip-pdp', zones: [] });
  });
});
