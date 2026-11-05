import { PAGE } from './layout.js';

export const LETTER = { width: 612, height: 792 };

// iOS offers this printer only Letter, so the PDF must be a Letter page. The card stock
// sits centred in the feed, with its top edge at the top of the sheet. iOS then fits the
// page inside the printer's 12 pt margins, shrinking a Letter page to this fraction.
// PROVISIONAL: inferred from the first print. Replace with the calibration-sheet result.
export const PRINT_FIT = 588 / 612;

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

// Plain-paper sheet with no compensation, for measuring what iOS does to a Letter page.
// Lines A and B are 9 in apart and C is 6 in wide. See docs/print-test.md.
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
  rule(90, 72, 522, 72); // A: 1 in from the top
  label('A', 80, 76);
  rule(90, 720, 522, 720); // B: 10 in from the top
  label('B', 80, 724);
  rule(306, 72, 306, 720);
  rule(90, 396, 522, 396); // C: 6 in wide, centred
  rule(90, 390, 90, 402);
  rule(522, 390, 522, 402);
  label('C', 80, 400);
  label('A to B = 9.00 in at full size', 318, 200);
  label('C = 6.00 in at full size', 318, 220);
  return doc.save();
}
