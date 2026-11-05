import { PAGE } from './layout.js';

export const LETTER = { width: 612, height: 792 };

// iOS offers this printer only Letter, so the PDF must be a Letter page. The card stock
// sits centred in the feed, with its top edge at the top of the sheet. Measured on stock
// (2026-11-04): a mark 1.00 in down printed at exactly 1.00 in, so iOS prints a Letter page
// at full size. Set this below 1 only if a later calibration sheet shows it shrinking.
export const PRINT_FIT = 1;

// Where to draw on the Letter page so the mark lands on (x, y) of the printed card.
export function toSheet(x, y) {
  const centre = (v, mid) => mid + (v - mid) / PRINT_FIT;
  return {
    x: centre((LETTER.width - PAGE.width) / 2 + x, LETTER.width / 2),
    y: centre(y, LETTER.height / 2),
  };
}

// Georgia's default figures are old-style; Gelasio's match only with onum on.
const FEATURES = { onum: true };

export function createFontTools(fontkit, fontBytes) {
  const font = fontkit.create(fontBytes);
  const unitsPerEm = font.unitsPerEm;
  return {
    measureAt(text, size) {
      const { glyphs } = font.layout(text, FEATURES);
      let width = 0;
      for (const glyph of glyphs) width += glyph.advanceWidth;
      return (width * size) / unitsPerEm;
    },
    hasGlyph: (codePoint) => font.hasGlyphForCodePoint(codePoint),
  };
}

async function newDocument({ PDFLib, fontkit }, title) {
  const doc = await PDFLib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setCreator('VIP Floristry card tool');
  doc.setProducer('VIP Floristry card tool');
  return doc;
}

// One Letter page holding only the card text, placed to land on the #10 stock.
export async function buildCardPdf(deps, card) {
  const { PDFLib, fontBytes } = deps;
  const doc = await newDocument(deps, 'Flower card');
  const font = await doc.embedFont(fontBytes, { subset: true, features: FEATURES });
  const page = doc.addPage([LETTER.width, LETTER.height]);
  for (const line of card.lines) {
    const at = toSheet(line.x, line.y);
    page.drawText(line.text, {
      x: at.x,
      y: LETTER.height - at.y, // PDF origin is bottom-left
      size: line.size / PRINT_FIT,
      font,
      color: PDFLib.rgb(0, 0, 0),
    });
  }
  return doc.save();
}

// Sheet with no compensation, for measuring what iOS does to a Letter page. Everything sits
// inside the 4.125 in stock, so it works on stock or Letter paper. See docs/print-test.md.
export async function buildCalibrationPdf(deps) {
  const { PDFLib, fontBytes } = deps;
  const doc = await newDocument(deps, 'Calibration sheet');
  const font = await doc.embedFont(fontBytes, { subset: true, features: FEATURES });
  const page = doc.addPage([LETTER.width, LETTER.height]);
  const black = PDFLib.rgb(0, 0, 0);
  const rule = (x1, y1, x2, y2) => page.drawLine({
    start: { x: x1, y: LETTER.height - y1 },
    end: { x: x2, y: LETTER.height - y2 },
    thickness: 0.75,
    color: black,
  });
  const label = (text, x, y) => page.drawText(text, { x, y: LETTER.height - y, size: 12, font, color: black });
  rule(198, 72, 414, 72); // A: 1 in from the top
  label('A', 180, 76);
  rule(198, 648, 414, 648); // B: 9 in from the top
  label('B', 180, 652);
  rule(306, 72, 306, 648);
  rule(198, 396, 414, 396); // C: 3 in wide, 5.5 in from the top
  rule(198, 390, 198, 402);
  rule(414, 390, 414, 402);
  label('C', 180, 400);
  label('A to B: 8.00 in', 314, 200);
  label('C: 3.00 in', 314, 220);
  return doc.save();
}
