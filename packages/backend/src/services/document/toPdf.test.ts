import PDFDocument from 'pdfkit';
import { toPdf } from './toPdf';
import type { RenderedDocument } from './renderTemplate';

// Mirrors the MARGIN constant in toPdf.ts. Not imported (not exported) — kept
// here so the deterministic-geometry helper below can replicate the emitter's
// layout math using pdfkit's own primitives, independently of toPdf.ts.
const MARGIN = 56;

const rendered: RenderedDocument = {
  templateId: 'rip-pdp',
  zones: [
    {
      id: 'letterhead',
      blocks: [{ kind: 'heading', level: 1, runs: [{ text: 'Provincie Flevoland', bold: false }] }],
    },
    {
      id: 'body',
      blocks: [{ kind: 'paragraph', runs: [{ text: 'Scope: verbreding N305', bold: false }] }],
    },
    {
      id: 'signOff',
      blocks: [
        {
          kind: 'paragraph',
          runs: [
            { text: 'Project manager: ', bold: true },
            { text: '_______', bold: false },
          ],
        },
        {
          kind: 'paragraph',
          runs: [
            { text: 'Contributor: ', bold: true },
            { text: '_______', bold: false },
          ],
        },
      ],
    },
  ],
};

// Independently derives the y-coordinate the signOff first line must land
// at, using pdfkit's own layout primitives (heightOfString / moveDown) rather
// than hardcoding a magic number or trusting toPdf()'s own output. This
// replays the same sequence of writes toPdf() performs for `rendered` above:
// a level-1 heading, one body paragraph, then the signOff first line —
// each followed by the emitter's per-block moveDown and, between zones, its
// zone-end moveDown(0.8). All three blocks fit on one page, so no page break
// enters into this calculation.
function expectedSignOffLineTop(): number {
  const pdf = new PDFDocument({ size: 'A4', margin: MARGIN });
  pdf.on('data', () => undefined);
  const usableWidth = pdf.page.width - MARGIN * 2;

  const advance = (font: string, size: number, text: string, moveDownAmt: number): void => {
    pdf.font(font).fontSize(size);
    pdf.text(text, { align: 'left', width: usableWidth });
    pdf.moveDown(moveDownAmt);
  };

  advance('Helvetica-Bold', 18, 'Provincie Flevoland', 0.6); // letterhead heading (level 1)
  pdf.moveDown(0.8); // letterhead zone-end
  advance('Helvetica', 10.5, 'Scope: verbreding N305', 0.35); // body paragraph
  pdf.moveDown(0.8); // body zone-end

  const lineTop = pdf.y;
  pdf.end();
  return Math.round(lineTop);
}

describe('toPdf', () => {
  it('produces a real PDF', async () => {
    const { bytes } = await toPdf(rendered);
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('returns exactly one signature field, on the first signOff line', async () => {
    const { signatureFields } = await toPdf(rendered);
    expect(signatureFields).toHaveLength(1);
    expect(signatureFields[0].name).toBe('Signature1');
    expect(signatureFields[0].page).toBe(1);
    expect(signatureFields[0].width).toBeGreaterThan(0);
    expect(signatureFields[0].height).toBeGreaterThan(0);
  });

  it('places the signature field at the exact y of the first signOff line', async () => {
    const { signatureFields } = await toPdf(rendered);
    // Origin is top-left, y grows downward. The expected value is derived
    // from pdfkit's own primitives (see expectedSignOffLineTop above), not
    // hardcoded, so this discriminates a stale-y-after-page-break bug from a
    // correct capture-before-write — a loose "> 100" bound would not.
    expect(signatureFields[0].y).toBe(expectedSignOffLineTop());
  });

  it('returns no signature field when the document has no signOff zone', async () => {
    const { signatureFields } = await toPdf({ templateId: 't', zones: [rendered.zones[1]] });
    expect(signatureFields).toEqual([]);
  });

  it('places the field on page 2, at the top margin, when the signOff line itself overflows page 1', async () => {
    // 41 filler paragraphs is the exact count (for this fixture, this
    // pdfkit version, and A4/56pt margins) that fills page 1 right up to
    // the point where the signOff zone's *own* first line is what no longer
    // fits — i.e. the page break happens during that line's own .text()
    // call, not on an earlier block. That is the narrow case the fix
    // addresses: `page` and `lineTop`/`y` must be read consistently on
    // either side of that break.
    const fillerParagraphs = Array.from({ length: 41 }, (_, i) => ({
      kind: 'paragraph' as const,
      runs: [{ text: `Body paragraph ${i} with representative filler text.`, bold: false }],
    }));
    const longDocument: RenderedDocument = {
      templateId: 'rip-pdp',
      zones: [rendered.zones[0], { id: 'body', blocks: fillerParagraphs }, rendered.zones[2]],
    };

    const { signatureFields } = await toPdf(longDocument);
    expect(signatureFields).toHaveLength(1);
    expect(signatureFields[0].page).toBe(2);
    // A freshly broken page always starts its text cursor at the top
    // margin — that reset is pdfkit's own addPage() behavior, not something
    // derived from font metrics, so asserting the exact value is not
    // fragile the way asserting an exact mid-page y would be.
    expect(signatureFields[0].y).toBe(MARGIN);
  });
});
