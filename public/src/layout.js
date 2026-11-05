// Card geometry and text fitting. Pure: no DOM, no PDF library. The live preview
// and the PDF both draw the same line list from layoutCard(), so they cannot disagree.
// All card units are PDF points (72 per inch), measured from the top-left of the page.

export const PAGE = { width: 297, height: 684 }; // 4.125 x 9.5 in (#10 print size)

// Stock: three perforated panels, each with a printed logo footer. The top logo starts
// 2.5 in down; a rose sits in the left 0.9 in of the bottom panel. The message goes above
// the top logo, the address on the bottom panel, and both centre on the middle of the card.
export const REF = Object.freeze({
  fontSize: 12,
  minFontSize: 9,
  fontStep: 0.5,
  leading: 1.2,
  descent: 0.25, // room below the last baseline, as a fraction of font size
  centerX: PAGE.width / 2,
  message: { top: 36, maxWidth: 225 }, // 0.5 in down, 3.125 in wide
  address: { top: 488.12, height: 90, maxWidth: 162 }, // 2.25 in wide, clear of the rose
});

// Stored in inches because that is what a ruler reads after a test print.
export const SETTINGS = Object.freeze({
  addressX: { default: 0, min: -0.25, max: 0.25, step: 0.0625 },
  addressY: { default: 0, min: -0.5, max: 0.5, step: 0.0625 },
  messageX: { default: 0, min: -0.25, max: 0.25, step: 0.0625 },
  messageY: { default: 0, min: -0.25, max: 0.5, step: 0.0625 },
  // Default stops 0.125 in above the top logo.
  messageAreaHeight: { default: 1.875, min: 0.75, max: 2, step: 0.125 },
});

export function defaultSettings() {
  return Object.fromEntries(Object.entries(SETTINGS).map(([k, s]) => [k, s.default]));
}

export function sanitizeSettings(raw) {
  const out = defaultSettings();
  for (const [key, spec] of Object.entries(SETTINGS)) {
    const value = Number(raw?.[key]);
    if (raw?.[key] !== undefined && Number.isFinite(value)) {
      out[key] = Math.min(spec.max, Math.max(spec.min, value));
    }
  }
  return out;
}

// Removes only what can't print: line-ending style, tabs, and blank lines or spaces
// at the outer edges. Wording, inner blank lines and line breaks are kept.
export function cleanText(text) {
  const lines = String(text ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .split('\n')
    .map((line) => line.trim());
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
}

function splitLongWord(word, fits) {
  const parts = [];
  let current = '';
  for (const ch of word) {
    if (current && !fits(current + ch)) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapLine(line, maxWidth, measure) {
  if (!line) return [''];
  const fits = (s) => measure(s) <= maxWidth;
  const out = [];
  let current = '';
  // Odd entries are the runs of spaces between words; repeated spaces are kept.
  const tokens = line.split(/( +)/);
  for (let i = 0; i < tokens.length; i += 2) {
    const word = tokens[i];
    const gap = i > 0 ? tokens[i - 1] : '';
    if (current && fits(current + gap + word)) {
      current += gap + word;
      continue;
    }
    if (current) out.push(current);
    if (fits(word)) {
      current = word;
    } else {
      const parts = splitLongWord(word, fits);
      current = parts.pop() ?? '';
      out.push(...parts);
    }
  }
  if (current) out.push(current);
  return out;
}

const blockHeight = (lineCount, size) =>
  size + (lineCount - 1) * size * REF.leading + size * REF.descent;

// Largest size from fontSize down to minFontSize at which the lines fit. If none
// does, returns the minimum size with overflow set, so the caller must warn.
function fit(sourceLines, height, maxWidth, measureAt) {
  for (let size = REF.fontSize; ; size -= REF.fontStep) {
    const measure = (s) => measureAt(s, size);
    const lines = sourceLines.flatMap((l) => wrapLine(l, maxWidth, measure));
    const used = blockHeight(lines.length, size);
    const overflow = used > height + 0.001;
    if (!overflow || size <= REF.minFontSize) return { size, lines, used, overflow, measure };
  }
}

function place(block, centerX, top, region, limitY) {
  const placed = [];
  block.lines.forEach((text, i) => {
    if (!text) return;
    const y = top + block.size + i * block.size * REF.leading;
    placed.push({
      text,
      x: centerX - block.measure(text) / 2,
      y,
      size: block.size,
      region,
      outside: y + block.size * REF.descent > limitY + 0.001,
    });
  });
  return placed;
}

// measureAt(text, size) returns a width in points.
export function layoutCard({ address, message, sender }, settings, measureAt) {
  const s = sanitizeSettings(settings);
  const addressLines = cleanText(address);
  const messageLines = cleanText(message);
  const senderLines = cleanText(sender);

  const body = messageLines.length && senderLines.length
    ? [...messageLines, '', ...senderLines] // one blank line between them
    : [...messageLines, ...senderLines];
  const areaTop = REF.message.top + s.messageY * 72;
  const areaHeight = s.messageAreaHeight * 72;
  const areaBottom = areaTop + areaHeight;
  const messageBlock = fit(body, areaHeight, REF.message.maxWidth, measureAt);
  // Vertically centred in the area. Text that overflows starts at the top of it.
  const messageTop = areaTop + Math.max(0, (areaHeight - messageBlock.used) / 2);

  const addressTop = REF.address.top + s.addressY * 72;
  const addressBottom = addressTop + REF.address.height;
  const addressBlock = fit(addressLines, REF.address.height, REF.address.maxWidth, measureAt);

  const box = (top, bottom, centerX, maxWidth) => ({ top, bottom, left: centerX - maxWidth / 2, width: maxWidth });
  const messageX = REF.centerX + s.messageX * 72;
  const addressX = REF.centerX + s.addressX * 72;
  return {
    lines: [
      ...place(addressBlock, addressX, addressTop, 'address', addressBottom),
      ...place(messageBlock, messageX, messageTop, 'message', areaBottom),
    ],
    addressSize: addressBlock.size,
    messageSize: messageBlock.size,
    addressOverflow: addressLines.length > 0 && addressBlock.overflow,
    messageOverflow: body.length > 0 && messageBlock.overflow,
    isEmpty: addressLines.length + body.length === 0,
    guides: {
      address: box(addressTop, addressBottom, addressX, REF.address.maxWidth),
      message: box(areaTop, areaBottom, messageX, REF.message.maxWidth),
    },
  };
}

// Characters the card font can't draw (emoji, mostly). They are reported rather
// than printed as empty boxes.
export function findUnsupported(text, hasGlyph) {
  const found = new Set();
  for (const ch of String(text ?? '').normalize('NFC')) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x20 || cp === 0xa0 || /[​-‍︀-️]/.test(ch)) continue;
    if (!hasGlyph(cp)) found.add(ch);
  }
  return [...found];
}
