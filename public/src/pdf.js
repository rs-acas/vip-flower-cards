import { PAGE } from './layout.js';

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

// One page, exactly #10 size, holding only the card text.
export async function buildCardPdf({ PDFLib, fontkit, fontBytes }, card) {
  const doc = await PDFLib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle('Flower card');
  doc.setCreator('VIP Floristry card tool');
  doc.setProducer('VIP Floristry card tool');
  const font = await doc.embedFont(fontBytes, { subset: true, features: FEATURES });
  const page = doc.addPage([PAGE.width, PAGE.height]);
  for (const line of card.lines) {
    page.drawText(line.text, {
      x: line.x,
      y: PAGE.height - line.y, // PDF origin is bottom-left
      size: line.size,
      font,
      color: PDFLib.rgb(0, 0, 0),
    });
  }
  return doc.save();
}
