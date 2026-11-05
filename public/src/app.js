import { SETTINGS, defaultSettings, findUnsupported, layoutCard, sanitizeSettings } from './layout.js';
import { buildCalibrationPdf, buildCardPdf, createFontTools } from './pdf.js';
import { SAMPLES, STRINGS } from './content.js';

const KEYS = { draft: 'vipcards.draft.v1', settings: 'vipcards.settings.v2', lang: 'vipcards.lang.v1' };
const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the tool still works, it just won't remember.
  }
};

const fields = { address: $('address'), message: $('message'), sender: $('sender') };
let lang = read(KEYS.lang) === 'es' ? 'es' : 'en';
let settings = sanitizeSettings(read(KEYS.settings));
let tools = null;
let pdfDeps = null;

const t = (key, vars = {}) =>
  STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
const currentCard = () => ({
  address: fields.address.value,
  message: fields.message.value,
  sender: fields.sender.value,
});
const layout = (content) => layoutCard(content, settings, tools.measureAt);

// Why a card must not print, as interface-string keys. Empty means it may print.
function problems(content, card) {
  const list = [];
  if (card.addressOverflow) list.push(['addressTooLong']);
  if (card.messageOverflow) list.push(['messageTooLong']);
  const chars = findUnsupported(Object.values(content).join(''), tools.hasGlyph);
  if (chars.length) list.push(['unsupported', { chars: chars.join(' ') }]);
  return list;
}

// Owns one printable PDF. The Open link is cleared the moment content changes and
// only returns with the new PDF, so it can never open a stale card.
class PrintTarget {
  // getContent returns card text; a target with makePdf builds a fixed page instead.
  constructor(fileName, getContent, printButton, openLink, messageEl, makePdf = null) {
    Object.assign(this, { fileName, getContent, printButton, openLink, messageEl, makePdf });
    this.version = 0;
    this.bytes = null;
    this.url = null;
    this.timer = null;
    this.pending = null;
    printButton.addEventListener('click', () => this.print());
  }

  refresh() {
    this.version += 1;
    this.bytes = null;
    this.clearLink();
    clearTimeout(this.timer);
    const printable = this.isPrintable();
    this.printButton.disabled = !printable;
    this.openLink.classList.toggle('is-disabled', !printable);
    this.pending = null;
    if (printable) this.timer = setTimeout(() => this.build(), 120);
  }

  isPrintable() {
    if (this.makePdf) return true;
    const content = this.getContent();
    const card = layout(content);
    return !card.isEmpty && problems(content, card).length === 0;
  }

  clearLink() {
    this.openLink.removeAttribute('href');
    if (this.url) {
      const old = this.url;
      setTimeout(() => URL.revokeObjectURL(old), 60000); // an open tab may still be reading it
      this.url = null;
    }
  }

  build() {
    if (this.pending) return this.pending;
    const version = this.version;
    const making = this.makePdf ? this.makePdf() : buildCardPdf(pdfDeps, layout(this.getContent()));
    this.pending = making.then((bytes) => {
      if (version !== this.version) return null;
      this.bytes = bytes;
      this.url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      this.openLink.href = this.url;
      return bytes;
    }).catch((error) => {
      console.error(error);
      this.setMessage('pdfFailed');
      return null;
    });
    return this.pending;
  }

  setMessage(key) {
    this.messageEl.textContent = key ? t(key) : '';
  }

  async print() {
    this.setMessage(null);
    clearTimeout(this.timer);
    const bytes = this.bytes ?? (await this.build());
    if (!bytes) {
      this.setMessage('building');
      return;
    }
    const file = new File([bytes], this.fileName, { type: 'application/pdf' });
    if (!navigator.canShare?.({ files: [file] })) {
      this.setMessage('shareFailed');
      return;
    }
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error(error);
        this.setMessage('shareFailed');
      }
    }
  }
}

function drawPreview(svg, card, { guides = false } = {}) {
  const nodes = [];
  if (guides) {
    for (const box of Object.values(card.guides)) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', box.left);
      rect.setAttribute('y', box.top);
      rect.setAttribute('width', box.width);
      rect.setAttribute('height', box.bottom - box.top);
      rect.setAttribute('class', 'guide');
      nodes.push(rect);
    }
  }
  for (const line of card.lines) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', line.x);
    text.setAttribute('y', line.y);
    text.setAttribute('font-size', line.size);
    if (line.outside) text.setAttribute('class', 'outside');
    text.textContent = line.text;
    nodes.push(text);
  }
  svg.replaceChildren(...nodes);
}

function renderCard() {
  const content = currentCard();
  const card = layout(content);
  drawPreview($('preview'), card);

  const issues = problems(content, card);
  const warnings = $('warnings');
  warnings.replaceChildren(...issues.map(([key, vars]) => {
    const p = document.createElement('p');
    p.textContent = t(key, vars);
    return p;
  }));
  warnings.hidden = issues.length === 0;

  const shrunk = !issues.length && (card.addressSize < 12 || card.messageSize < 12);
  $('notice').textContent = card.isEmpty ? t('enterSomething') : shrunk ? t('shrunk') : '';
  cardTarget.setMessage(null);
  cardTarget.refresh();
}

function renderSetup() {
  drawPreview($('setupPreview'), layout(SAMPLES.long), { guides: true });
  for (const [key, spec] of Object.entries(SETTINGS)) {
    const value = settings[key];
    const shown = Math.abs(value).toFixed(2);
    const signed = spec.min < 0 && value !== 0 ? (value > 0 ? '+' : '−') : '';
    $(`value-${key}`).textContent = `${signed}${shown} ${t('inches')}`;
    $(`less-${key}`).disabled = value <= spec.min;
    $(`more-${key}`).disabled = value >= spec.max;
  }
  shortTarget.refresh();
  longTarget.refresh();
  calibrationTarget.refresh();
}

function applyLanguage() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-lang]').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.lang === lang));
  });
  renderCard();
  renderSetup();
}

function buildSetupControls() {
  const host = $('adjustments');
  for (const key of Object.keys(SETTINGS)) {
    const row = document.createElement('div');
    row.className = 'stepper';
    row.innerHTML = `
      <p class="stepper-label" data-i18n="${key}"></p>
      <div class="stepper-row">
        <button type="button" id="less-${key}" class="step" data-i18n="decrease"></button>
        <output id="value-${key}"></output>
        <button type="button" id="more-${key}" class="step" data-i18n="increase"></button>
      </div>`;
    host.append(row);
    const change = (direction) => {
      settings = sanitizeSettings({ ...settings, [key]: settings[key] + direction * SETTINGS[key].step });
      write(KEYS.settings, settings);
      renderSetup();
      renderCard();
    };
    row.querySelector(`#less-${key}`).addEventListener('click', () => change(-1));
    row.querySelector(`#more-${key}`).addEventListener('click', () => change(1));
  }
}

function confirmAction({ title, body, yes }) {
  return new Promise((resolve) => {
    const dialog = $('confirm');
    $('confirmTitle').textContent = t(title);
    $('confirmBody').textContent = t(body);
    $('confirmYes').textContent = t(yes);
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    dialog.showModal();
  });
}

function showRoute() {
  const inSetup = location.hash === '#setup';
  $('cardScreen').hidden = inSetup;
  $('setupScreen').hidden = !inSetup;
  window.scrollTo(0, 0);
}

let shortTarget;
let longTarget;
let cardTarget;
let calibrationTarget;

async function start() {
  const fontBytes = await fetch('fonts/Gelasio-Regular.ttf').then((r) => {
    if (!r.ok) throw new Error(`font ${r.status}`);
    return r.arrayBuffer();
  });
  await document.fonts.load('12px Gelasio');
  const bytes = new Uint8Array(fontBytes);
  tools = createFontTools(window.fontkit, bytes);
  pdfDeps = { PDFLib: window.PDFLib, fontkit: window.fontkit, fontBytes: bytes };

  cardTarget = new PrintTarget('flower-card.pdf', currentCard, $('print'), $('openPdf'), $('printMessage'));
  shortTarget = new PrintTarget('test-card-short.pdf', () => SAMPLES.short, $('printShort'), $('openShort'), $('testMessage'));
  longTarget = new PrintTarget('test-card-long.pdf', () => SAMPLES.long, $('printLong'), $('openLong'), $('testMessage'));
  calibrationTarget = new PrintTarget('calibration-sheet.pdf', () => null, $('printCalibration'), $('openCalibration'), $('testMessage'), () => buildCalibrationPdf(pdfDeps));

  const draft = read(KEYS.draft);
  for (const [name, el] of Object.entries(fields)) {
    if (typeof draft?.[name] === 'string') el.value = draft[name];
    el.addEventListener('input', () => {
      write(KEYS.draft, currentCard());
      renderCard();
    });
  }

  buildSetupControls();
  applyLanguage();
  showRoute();
  window.addEventListener('hashchange', showRoute);

  document.querySelectorAll('[data-lang]').forEach((el) => {
    el.addEventListener('click', () => {
      lang = el.dataset.lang;
      write(KEYS.lang, lang);
      applyLanguage();
    });
  });

  $('newCard').addEventListener('click', async () => {
    if (!Object.values(fields).some((el) => el.value)) return;
    const ok = await confirmAction({ title: 'confirmTitle', body: 'confirmBody', yes: 'confirmYes' });
    if (!ok) return;
    Object.values(fields).forEach((el) => { el.value = ''; });
    write(KEYS.draft, null);
    renderCard();
    window.scrollTo(0, 0);
  });

  $('reset').addEventListener('click', async () => {
    const ok = await confirmAction({ title: 'resetTitle', body: 'resetBody', yes: 'resetYes' });
    if (!ok) return;
    settings = defaultSettings();
    write(KEYS.settings, settings);
    renderSetup();
    renderCard();
  });

  $('app').hidden = false;
  $('loading').hidden = true;
}

start().catch((error) => {
  console.error(error);
  $('loading').textContent = STRINGS[lang].pdfFailed;
});
