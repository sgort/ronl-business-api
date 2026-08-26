// packages/backend/src/services/document/toMarkdown.test.ts
import { toMarkdown } from './toMarkdown';
import type { RenderedDocument } from './renderTemplate';

const rendered: RenderedDocument = {
  templateId: 'rip-pdp',
  zones: [
    {
      id: 'letterhead',
      blocks: [{ kind: 'heading', level: 1, runs: [{ text: 'Provincie Flevoland', bold: false }] }],
    },
    {
      id: 'signOff',
      blocks: [
        {
          kind: 'paragraph',
          runs: [
            { text: 'Project manager: ', bold: true },
            { text: '___', bold: false },
          ],
        },
      ],
    },
  ],
};

describe('toMarkdown', () => {
  it('emits headings at their level', () => {
    expect(toMarkdown(rendered)).toContain('# Provincie Flevoland');
  });

  it('emits bold runs with asterisks and leaves plain runs alone', () => {
    expect(toMarkdown(rendered)).toContain('**Project manager:** ___');
  });

  it('separates blocks with a blank line and ends with a newline', () => {
    const md = toMarkdown({
      templateId: 'test',
      zones: [
        {
          id: 'letterhead',
          blocks: [{ kind: 'paragraph', runs: [{ text: 'First', bold: false }] }],
        },
        {
          id: 'body',
          blocks: [{ kind: 'paragraph', runs: [{ text: 'Second', bold: false }] }],
        },
      ],
    });
    expect(md).toBe('First\n\nSecond\n');
    expect(md.endsWith('\n\n')).toBe(false);
  });

  it('relocates bold markers inside leading whitespace', () => {
    const md = toMarkdown({
      templateId: 'test',
      zones: [
        {
          id: 'letterhead',
          blocks: [
            {
              kind: 'paragraph',
              runs: [{ text: '   Bold text', bold: true }],
            },
          ],
        },
      ],
    });
    expect(md).toContain('   **Bold text**');
  });

  it('does not emit **** for whitespace-only bold runs', () => {
    const md = toMarkdown({
      templateId: 'test',
      zones: [
        {
          id: 'letterhead',
          blocks: [
            {
              kind: 'paragraph',
              runs: [{ text: '   ', bold: true }],
            },
          ],
        },
      ],
    });
    expect(md).not.toContain('****');
  });

  it('does not emit **** for empty bold runs', () => {
    const md = toMarkdown({
      templateId: 'test',
      zones: [
        {
          id: 'letterhead',
          blocks: [
            {
              kind: 'paragraph',
              runs: [{ text: '', bold: true }],
            },
          ],
        },
      ],
    });
    expect(md).not.toContain('****');
  });

  it('clamps heading level to maximum six hashes', () => {
    const md = toMarkdown({
      templateId: 'test',
      zones: [
        {
          id: 'letterhead',
          blocks: [
            {
              kind: 'heading',
              level: 9,
              runs: [{ text: 'High level', bold: false }],
            },
          ],
        },
      ],
    });
    expect(md).toContain('###### High level');
    expect(md).not.toContain('####### High level');
  });

  it('emits separator blocks as ---', () => {
    const md = toMarkdown({
      templateId: 'test',
      zones: [
        {
          id: 'letterhead',
          blocks: [{ kind: 'separator', runs: [] }],
        },
      ],
    });
    expect(md).toContain('---\n');
  });

  it('emits spacer blocks as nothing and does not widen gaps', () => {
    const md = toMarkdown({
      templateId: 'test',
      zones: [
        {
          id: 'letterhead',
          blocks: [
            { kind: 'paragraph', runs: [{ text: 'First', bold: false }] },
            { kind: 'spacer', runs: [] },
            { kind: 'paragraph', runs: [{ text: 'Second', bold: false }] },
          ],
        },
      ],
    });
    expect(md).toBe('First\n\nSecond\n');
  });
});
