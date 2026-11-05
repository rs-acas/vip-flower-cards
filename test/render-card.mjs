// Writes a card PDF from JSON ({address,message,sender}) for comparing against the reference.
// Usage: node test/render-card.mjs card.json out.pdf
import { readFile, writeFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import * as PDFLib from 'pdf-lib';
import { defaultSettings, layoutCard } from '../public/src/layout.js';
import { buildCardPdf, createFontTools } from '../public/src/pdf.js';

const [input, output] = process.argv.slice(2);
const fontBytes = new Uint8Array(await readFile(new URL('../public/fonts/Gelasio-Regular.ttf', import.meta.url)));
const tools = createFontTools(fontkit, fontBytes);
const card = layoutCard(JSON.parse(await readFile(input, 'utf8')), defaultSettings(), tools.measureAt);
await writeFile(output, await buildCardPdf({ PDFLib, fontkit, fontBytes }, card));
