# VIP Floristry flower cards

A small static web tool for printing #10 (4.125 × 9.5 in) flower cards from an iPhone.
It has no server, account or Shopify connection. Card details stay in the browser: the page's
content security policy allows requests only to its own static files.

- `public/` is the whole site. Deploy that folder to any static HTTPS host; paths are relative, so a subfolder works.
- `docs/print-test.md` is the physical test checklist. **Do this before adding features.**

## Layout

`public/src/layout.js` holds the geometry, measured from the reference card (PDF and PSD, kept outside this repo)
(Georgia 12 pt on 14.4 pt line spacing, both blocks centred, slightly right of page centre).
The preview and the PDF draw the same line list, so they can't disagree.

- Text shrinks from 12 pt to 9 pt, then warns and blocks printing. It is never clipped.
- The message area height is 1.75 in by default and **provisional** until the folded test. It is adjustable in Printer setup.
- The address area is 1.25 in. It isn't adjustable yet.
- The font is Gelasio (SIL OFL), which is metric-compatible with Georgia. Emoji can't print, so they trigger a warning.
- Interface language is labels only. `layoutCard` has no language input.

## Printing on iPhone

A web page can't print silently or set the paper size or tray. Print opens the iOS share sheet
with the PDF (HTTPS only). Open PDF is the fallback.

`display: browser` in the manifest is deliberate, so that the Home Screen icon opens in Safari,
where a PDF tab and the Share button are available. A standalone window has no way back from an opened PDF.

## Develop

```sh
npm install
npx playwright install webkit
npm test                        # layout, PDF and WebKit UI tests
npm run serve                   # http://127.0.0.1:8000/
```

`public/vendor/` holds pdf-lib 1.17.1 and @pdf-lib/fontkit 1.1.1 so the site has no CDN dependency.
Update those copies when bumping the versions in `package.json`.
`public/fonts/Gelasio-Regular.ttf` is a wght=400 instance of the Google Fonts variable font.

To compare with the reference, keep customer details out of the repo:
`node test/render-card.mjs card.json out.pdf`
