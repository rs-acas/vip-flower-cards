import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import * as PDFLib from 'pdf-lib';
import { PAGE, REF, cleanText, defaultSettings, findUnsupported, layoutCard, sanitizeSettings, wrapLine } from '../public/src/layout.js';
import { buildCardPdf, createFontTools } from '../public/src/pdf.js';
import { SAMPLES } from '../public/src/content.js';

const fontBytes = new Uint8Array(await readFile(new URL('../public/fonts/Gelasio-Regular.ttf', import.meta.url)));
const tools = createFontTools(fontkit, fontBytes);
const lay = (content, settings = defaultSettings()) => layoutCard(content, settings, tools.measureAt);
const texts = (card, region) => card.lines.filter((l) => l.region === region).map((l) => l.text);
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('short card lands on the reference baselines at 12 pt', () => {
  const card = lay({ address: '1234 Sample St\nUnit A\nHouston, TX, 77007', message: 'Happy Birthday', sender: '— from Sample' });
  const y = card.lines.map((l) => l.y);
  [51.08, 65.48, 79.88, 500.12, 528.92].forEach((v, i) => near(y[i], v));
  assert.ok(card.lines.every((l) => l.size === 12));
  assert.ok(!card.addressOverflow && !card.messageOverflow);
});

test('lines are centred on the reference centres, not the page centre', () => {
  const card = lay(SAMPLES.short);
  for (const line of card.lines) {
    const center = REF[line.region].centerX;
    near(line.x + tools.measureAt(line.text, line.size) / 2, center);
  }
});

test('line breaks, inner blank lines and wording are preserved', () => {
  const card = lay({ address: 'A\nB', message: 'One\n\nTwo  spaces', sender: '' });
  assert.deepEqual(texts(card, 'message'), ['One', 'Two  spaces']);
  near(card.lines[3].y - card.lines[2].y, 2 * 14.4);
});

test('sender prints exactly as entered and adds nothing', () => {
  const card = lay({ address: '', message: 'Hola', sender: 'Con amor,\nAna' });
  assert.deepEqual(texts(card, 'message'), ['Hola', 'Con amor,', 'Ana']);
});

test('sender is optional and a message-only card has no extra lines', () => {
  assert.deepEqual(texts(lay({ address: '', message: 'Solo esto', sender: '' }), 'message'), ['Solo esto']);
});

test('sender alone takes the first message position', () => {
  near(lay({ address: '', message: '', sender: 'Ana' }).lines[0].y, 500.12);
});

test('sender moves down as the message wraps', () => {
  const short = lay({ address: '', message: 'Hi', sender: 'Ana' });
  const long = lay({ address: '', message: 'word '.repeat(40), sender: 'Ana' });
  assert.ok(long.lines.at(-1).y > short.lines.at(-1).y);
});

test('long text shrinks in steps, never below the minimum', () => {
  const card = lay({ address: '', message: 'palabra '.repeat(60), sender: '' });
  assert.ok(card.messageSize < 12 && card.messageSize >= REF.minFontSize);
  assert.ok(!card.messageOverflow);
});

test('too-long text is flagged, keeps every word, and marks lines outside the area', () => {
  const source = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
  const card = lay({ address: '', message: source, sender: '' });
  assert.ok(card.messageOverflow);
  assert.equal(card.messageSize, REF.minFontSize);
  assert.equal(texts(card, 'message').join(' '), source);
  assert.ok(card.lines.some((l) => l.outside));
});

test('text that fits stays inside the configured area', () => {
  for (const words of [10, 40, 80, 120]) {
    const card = lay({ address: '', message: 'palabra '.repeat(words), sender: 'Ana' });
    if (card.messageOverflow) continue;
    for (const l of card.lines) assert.ok(l.y + l.size * REF.descent <= card.guides.message.bottom + 0.001);
  }
});

test('area height is what decides overflow', () => {
  const content = { address: '', message: 'palabra '.repeat(60), sender: '' };
  assert.equal(lay(content, sanitizeSettings({ messageAreaHeight: 2.5 })).messageSize, 12);
  assert.ok(lay(content, sanitizeSettings({ messageAreaHeight: 0.75 })).messageOverflow);
});

test('message area can never run off the bottom of the page', () => {
  const card = lay({ address: '', message: 'x', sender: '' }, sanitizeSettings({ messageAreaHeight: 2.5, messageY: 0.5 }));
  assert.ok(card.guides.message.bottom <= REF.bottomLimit);
});

test('address overflow is separate from message overflow', () => {
  const card = lay({ address: Array(20).fill('line').join('\n'), message: 'ok', sender: '' });
  assert.ok(card.addressOverflow && !card.messageOverflow);
});

test('a word wider than the card breaks rather than clips', () => {
  const word = 'a'.repeat(120);
  const parts = wrapLine(word, REF.maxWidth, (s) => tools.measureAt(s, 12));
  assert.equal(parts.join(''), word);
  assert.ok(parts.every((p) => tools.measureAt(p, 12) <= REF.maxWidth));
});

test('every wrapped line fits the text width', () => {
  for (const l of lay(SAMPLES.long).lines) assert.ok(tools.measureAt(l.text, l.size) <= REF.maxWidth);
});

test('adjustments move only their own block', () => {
  const base = lay(SAMPLES.short);
  const moved = lay(SAMPLES.short, sanitizeSettings({ addressY: 0.25, messageX: 0.125 }));
  near(moved.lines[0].y - base.lines[0].y, 18);
  near(moved.lines.at(-1).x - base.lines.at(-1).x, 9);
  near(moved.lines.at(-1).y, base.lines.at(-1).y);
});

test('settings are clamped and bad stored values fall back', () => {
  const s = sanitizeSettings({ addressX: 9, messageAreaHeight: 'nope', messageY: -9 });
  assert.equal(s.addressX, 0.25);
  assert.equal(s.messageAreaHeight, 1.75);
  assert.equal(s.messageY, -0.5);
});

test('Spanish punctuation is supported; emoji is reported', () => {
  assert.deepEqual(findUnsupported('¿Cómo estás? ¡Feliz año! “ñ” — ÁÉÍÓÚÜ…', tools.hasGlyph), []);
  assert.deepEqual(findUnsupported('Hola 🌹', tools.hasGlyph), ['🌹']);
});

test('windows line endings and tabs are normalised', () => {
  assert.deepEqual(cleanText('\n\na\r\n\r\n\tb \n\n'), ['a', '', 'b']);
});

test('both samples print at default settings; long one exercises the area', () => {
  assert.equal(lay(SAMPLES.short).messageSize, 12);
  const long = lay(SAMPLES.long);
  assert.ok(!long.messageOverflow && !long.addressOverflow);
  assert.ok(long.lines.at(-1).y > 580, `last baseline ${long.lines.at(-1).y}`);
});

test('PDF is one page of exactly 4.125 x 9.5 in, with no rotation or crop', async () => {
  const bytes = await buildCardPdf({ PDFLib, fontkit, fontBytes }, lay(SAMPLES.long));
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  const page = doc.getPage(0);
  assert.deepEqual(page.getMediaBox(), { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
  assert.deepEqual(page.getCropBox(), page.getMediaBox());
  assert.equal(page.getRotation().angle, 0);
  assert.equal(PAGE.width / 72, 4.125);
  assert.equal(PAGE.height / 72, 9.5);
});
