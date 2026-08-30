import PDFDocument from 'pdfkit';
import type { RenderedBlock, RenderedDocument } from './renderTemplate';

export interface SignatureField {
  name: string;
  page: number;
  /** Distance from the LEFT edge of the page, in points. */
  x: number;
  /** Distance from the TOP edge of the page, in points -- pdfkit's own origin. */
  y: number;
  width: number;
  height: number;
}
export interface RenderedPdf {
  bytes: Buffer;
  signatureFields: SignatureField[];
}

const MARGIN = 56; // ~20mm
const SIG_WIDTH = 200;
const SIG_HEIGHT = 50;

function fontFor(block: RenderedBlock, anyBold: boolean): { font: string; size: number } {
  if (block.kind === 'heading') {
    const level = block.level ?? 1;
    return { font: 'Helvetica-Bold', size: level === 1 ? 18 : level === 2 ? 14 : 12 };
  }
  return { font: anyBold ? 'Helvetica-Bold' : 'Helvetica', size: 10.5 };
}

export function toPdf(doc: RenderedDocument): Promise<RenderedPdf> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks: Buffer[] = [];
    const signatureFields: SignatureField[] = [];
    let page = 1;

    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('error', reject);
    pdf.on('pageAdded', () => {
      page += 1;
    });

    const usableWidth = pdf.page.width - MARGIN * 2;

    for (const zone of doc.zones) {
      for (const [index, block] of zone.blocks.entries()) {
        if (block.kind === 'spacer') {
          pdf.moveDown(1);
          continue;
        }
        if (block.kind === 'separator') {
          const y = pdf.y + 4;
          pdf
            .moveTo(MARGIN, y)
            .lineTo(pdf.page.width - MARGIN, y)
            .stroke();
          pdf.moveDown(1);
          continue;
        }

        const text = block.runs.map((r) => r.text).join('');
        const anyBold = block.runs.some((r) => r.bold);
        const { font, size } = fontFor(block, anyBold);

        // Set the font/size BEFORE measuring: heightOfString measures using
        // whatever font/size is currently active on the document, so an
        // unset (or stale) font would make the fit-check below meaningless.
        pdf.font(font).fontSize(size);
        const height = pdf.heightOfString(text, { width: usableWidth });

        // Decide the page break ourselves, before capturing anything, so
        // `pageAtLine` and `lineTop` can never disagree about which page a
        // line landed on. Left to pdfkit, an automatic break fires *during*
        // .text() for a line that doesn't fit the remaining space, which
        // would leave `lineTop` pointing at the stale y from the old page
        // while `page` had already advanced.
        if (pdf.y + height > pdf.page.height - MARGIN) {
          pdf.addPage();
        }

        // Capture the position BEFORE writing: the field belongs beside the
        // first signOff line, and pdf.y has moved on once the text is drawn.
        const lineTop = pdf.y;
        const pageAtLine = page; // read AFTER any explicit addPage above

        pdf.text(text, { align: 'left', width: usableWidth });
        pdf.moveDown(block.kind === 'heading' ? 0.6 : 0.35);

        if (zone.id === 'signOff' && index === 0) {
          signatureFields.push({
            name: 'Signature1',
            page: pageAtLine,
            x: MARGIN + 140,
            y: Math.round(lineTop),
            width: SIG_WIDTH,
            height: SIG_HEIGHT,
          });
        }
      }
      pdf.moveDown(0.8);
    }

    pdf.on('end', () => resolve({ bytes: Buffer.concat(chunks), signatureFields }));
    pdf.end();
  });
}
