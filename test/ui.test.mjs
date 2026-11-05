// Drives the real page in WebKit with iPhone emulation. This covers the app, not the
// iOS share sheet or printer: navigator.share is stubbed. See docs/print-test.md.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { devices, webkit } from 'playwright';
import { serve } from './serve.mjs';

const OUT = new URL('./output/', import.meta.url).pathname;
let server, browser, url;

before(async () => {
  await mkdir(OUT, { recursive: true });
  server = await serve();
  url = `http://127.0.0.1:${server.address().port}/`;
  browser = await webkit.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function open({ share = true, device = 'iPhone 14' } = {}) {
  const context = await browser.newContext({ ...devices[device] });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => requests.push({ method: r.method(), url: r.url() }));
  await page.addInitScript((enabled) => {
    window.shared = [];
    window.lastBlob = null;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.lastBlob = blob; return create(blob); };
    navigator.canShare = enabled ? () => true : () => false;
    navigator.share = async ({ files }) => {
      const f = files[0];
      window.shared.push({ name: f.name, type: f.type, head: await f.slice(0, 5).text(), size: f.size });
    };
  }, share);
  await page.goto(url);
  await page.waitForSelector('#app:not([hidden])');
  return { page, errors, requests, context };
}

const fill = async (page, address, message, sender = '') => {
  await page.fill('#address', address);
  await page.fill('#message', message);
  await page.fill('#sender', sender);
};
const previewLines = (page) => page.$$eval('#preview text', (ns) => ns.map((n) =>
  [n.textContent, n.getAttribute('x'), n.getAttribute('y'), n.getAttribute('font-size')].join('|')));
const pdfReady = (page, id = 'openPdf') => page.waitForSelector(`#${id}[href]`, { state: 'attached' });

test('loads with no errors under the content security policy', async () => {
  const { page, errors, context } = await open();
  assert.deepEqual(errors, []);
  await context.close();
});

test('card flow: type, preview, print; nothing but static files is requested', async () => {
  const { page, errors, requests, context } = await open();
  await fill(page, '1234 Sample St\nHouston, TX', 'Feliz cumpleaños', 'Con amor, Ana');
  assert.equal((await previewLines(page)).length, 4);
  await pdfReady(page);
  await page.tap('#print');
  await page.waitForFunction(() => window.shared.length === 1);
  const [shared] = await page.evaluate(() => window.shared);
  assert.equal(shared.name, 'flower-card.pdf');
  assert.equal(shared.type, 'application/pdf');
  assert.equal(shared.head, '%PDF-');
  assert.deepEqual(requests.filter((r) => !(r.url.startsWith('blob:') || (r.method === 'GET' && r.url.startsWith(url) && !r.url.includes('?')))), []);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${OUT}card-en.png`, fullPage: true });
  await context.close();
});

test('printing straight after typing uses the new text, not a stale PDF', async () => {
  const { page, context } = await open();
  await fill(page, 'A', 'First');
  await pdfReady(page);
  const first = await page.getAttribute('#openPdf', 'href');
  await page.fill('#message', 'Second, much longer than the first one');
  assert.equal(await page.getAttribute('#openPdf', 'href'), null);
  await page.tap('#print');
  await page.waitForFunction(() => window.shared.length === 1);
  await pdfReady(page);
  assert.notEqual(await page.getAttribute('#openPdf', 'href'), first);
  await context.close();
});

test('language changes labels only, never the card', async () => {
  const { page, context } = await open();
  await fill(page, '1234 Sample St', 'Happy Birthday', 'from Ana');
  const before = await previewLines(page);
  assert.equal(await page.textContent('#print'), 'Print');
  await page.tap('[data-lang="es"]');
  assert.equal(await page.textContent('#print'), 'Imprimir');
  assert.equal(await page.getAttribute('html', 'lang'), 'es');
  assert.deepEqual(await previewLines(page), before);
  await page.screenshot({ path: `${OUT}card-es.png`, fullPage: true });
  await context.close();
});

test('every string used in the page exists in both languages', async () => {
  const { STRINGS } = await import('../public/src/content.js');
  assert.deepEqual(Object.keys(STRINGS.es).sort(), Object.keys(STRINGS.en).sort());
  const { page, context } = await open();
  const keys = await page.$$eval('[data-i18n]', (ns) => ns.map((n) => n.dataset.i18n));
  for (const key of keys) assert.ok(STRINGS.en[key], key);
  await context.close();
});

test('a message that cannot fit warns and blocks printing', async () => {
  const { page, context } = await open();
  await fill(page, 'A', 'palabra '.repeat(200));
  assert.ok(await page.isVisible('#warnings'));
  assert.match(await page.textContent('#warnings'), /does not fit/);
  assert.ok(await page.isDisabled('#print'));
  await page.waitForTimeout(250);
  assert.equal(await page.getAttribute('#openPdf', 'href'), null);
  await page.screenshot({ path: `${OUT}too-long.png`, fullPage: true });
  await page.fill('#message', 'Short again');
  assert.ok(!(await page.isVisible('#warnings')));
  assert.ok(!(await page.isDisabled('#print')));
  await context.close();
});

test('emoji warns instead of printing a blank box', async () => {
  const { page, context } = await open();
  await fill(page, 'A', 'Te quiero 🌹');
  assert.match(await page.textContent('#warnings'), /🌹/);
  assert.ok(await page.isDisabled('#print'));
  await context.close();
});

test('an empty card cannot print', async () => {
  const { page, context } = await open();
  assert.ok(await page.isDisabled('#print'));
  await context.close();
});

test('New Card asks first; No keeps the text, Yes clears it', async () => {
  const { page, context } = await open();
  await fill(page, 'A', 'Keep me', 'Ana');
  await page.tap('#newCard');
  assert.ok(await page.isVisible('#confirm'));
  await page.screenshot({ path: `${OUT}new-card.png` });
  await page.tap('#confirm button[value="no"]');
  assert.equal(await page.inputValue('#message'), 'Keep me');
  await page.tap('#newCard');
  await page.tap('#confirmYes');
  await page.waitForFunction(() => document.getElementById('message').value === '');
  assert.equal(await page.inputValue('#address'), '');
  assert.equal(await page.inputValue('#sender'), '');
  assert.equal((await previewLines(page)).length, 0);
  await page.reload();
  await page.waitForSelector('#app:not([hidden])');
  assert.equal(await page.inputValue('#message'), '');
  await context.close();
});

test('a reload keeps the card in progress', async () => {
  const { page, context } = await open();
  await fill(page, 'A', 'Do not lose me');
  await page.reload();
  await page.waitForSelector('#app:not([hidden])');
  assert.equal(await page.inputValue('#message'), 'Do not lose me');
  await context.close();
});

test('if sharing is unavailable, Print says so and the Open PDF link holds a real PDF', async () => {
  const { page, context } = await open({ share: false });
  await fill(page, 'A', 'Hola');
  await pdfReady(page);
  await page.tap('#print');
  await page.waitForFunction(() => document.getElementById('printMessage').textContent !== '');
  // Playwright's WebKit has no PDF viewer, so check the blob and prove the link opens a
  // new page with an HTML control. Safari opening the real PDF is on the iPhone checklist.
  assert.match(await page.textContent('#printMessage'), /Open PDF/);
  assert.match(await page.getAttribute('#openPdf', 'href'), /^blob:/);
  assert.deepEqual(await page.evaluate(async () => [window.lastBlob.type, await window.lastBlob.slice(0, 5).text()]), ['application/pdf', '%PDF-']);
  await page.evaluate(() => {
    document.getElementById('openPdf').href = URL.createObjectURL(new Blob(['<p>ok'], { type: 'text/html' }));
  });
  await Promise.all([context.waitForEvent('page'), page.tap('#openPdf')]);
  await context.close();
});

test('setup: adjustments persist, move the card, and test cards print', async () => {
  const { page, errors, context } = await open();
  await fill(page, 'A', 'Hola');
  const before = await previewLines(page);
  await page.tap('.setup-link');
  await page.waitForSelector('#setupScreen:not([hidden])');
  assert.ok(!(await page.isVisible('#cardScreen')));
  await page.tap('#more-messageY');
  assert.match(await page.textContent('#value-messageY'), /\+0\.06/);
  await page.waitForSelector('#openShort[href]', { state: 'attached' });
  await page.tap('#printShort');
  await page.waitForFunction(() => window.shared.length === 1);
  await page.tap('#printLong');
  await page.waitForFunction(() => window.shared.length === 2);
  assert.deepEqual((await page.evaluate(() => window.shared)).map((s) => s.name), ['test-card-short.pdf', 'test-card-long.pdf']);
  assert.deepEqual(errors, []); // checked before screenshots, which inject a style of their own
  await page.screenshot({ path: `${OUT}setup.png`, fullPage: true });
  await page.goBack();
  await page.waitForSelector('#cardScreen:not([hidden])');
  assert.notDeepEqual(await previewLines(page), before);
  assert.equal(await page.inputValue('#message'), 'Hola'); // tests never touch the card
  await page.reload();
  await page.waitForSelector('#app:not([hidden])');
  await page.tap('.setup-link');
  assert.match(await page.textContent('#value-messageY'), /\+0\.06/);
  await page.tap('#reset');
  await page.tap('#confirmYes');
  await page.waitForFunction(() => document.getElementById('value-messageY').textContent.startsWith('0'));
  await context.close();
});

test('no sideways scrolling at small iPhone widths', async () => {
  for (const device of ['iPhone SE', 'iPhone 14']) {
    const { page, context } = await open({ device });
    await page.tap('[data-lang="es"]');
    const widths = async () => page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    let [scroll, inner] = await widths();
    assert.ok(scroll <= inner, `${device} card ${scroll} > ${inner}`);
    await page.tap('.setup-link');
    [scroll, inner] = await widths();
    assert.ok(scroll <= inner, `${device} setup ${scroll} > ${inner}`);
    await context.close();
  }
});
