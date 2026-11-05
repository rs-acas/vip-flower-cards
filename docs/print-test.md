# First print test

Goal: one real card from iPhone Safari to the Brother HL-L2460DW, before any new features.
Automated tests cannot cover this. They stub the iOS share sheet and never touch the printer.

Use the **short** and **long** test cards in **Printer setup**. They use made-up details.
Write down what happens at each step, including failures. If #10 printing fails, stop and
report it; a Letter-size fallback is deliberately not built.

## What the printer reports (read from it directly, 2026-11-04, firmware 1.15)

| Attribute | Value | Meaning |
|---|---|---|
| `media-supported` | includes `na_number-10_4.125x9.5in` | #10 is a named size |
| `media-source-supported` | `auto, manual, main` | manual is a real source |
| `media-ready` | `na_letter_8.5x11in` only | **Main risk**: the iPhone may assume Letter |
| `print-scaling-default` | `auto` | Scaling is possible if the wrong size is picked |
| margins | 4.23 mm (0.167 in) each side | Text can't print closer to the edge than this |

The reference text sits well inside those margins, and the tool stops text 0.25 in from the bottom edge.

## Before you start

- [ ] The tool is on HTTPS. Over plain http, the iPhone can't open the share sheet and Print will say to use Open PDF.
- [ ] Add it to the Home Screen: Safari > Share > Add to Home Screen. If **Open as Web App** appears, try it **off** first.
- [ ] Have plain paper trimmed to 4.125 × 9.5 in, or a few spare sheets of stock.
- [ ] Note the paper weight of the stock (from the box or supplier) and whether it has a print side.

## 1. Plain paper first

- [ ] Open the tool **from the Home Screen icon**. Does it open in Safari or as its own window? ______
- [ ] Printer setup > **Print short test card**. Does the share sheet open with **Print** listed? ______
- [ ] If Print is missing: tap **Open PDF**, then Share, then Print. Did that work? ______
- [ ] In the print screen, is a **Paper Size** option shown? What does it offer and select? ______
- [ ] Does the print preview look like a tall narrow page, or a small card on a Letter sheet? ______
- [ ] Insert one sheet in the manual slot, then print. Did it take from the **manual slot** or the main tray? ______
- [ ] Any error on the printer (size mismatch, for example)? Exact text: ______

## 2. Size

- [ ] Measure from the top edge to the top of the address's first line. Reference: about 0.58 in. Result: ______
- [ ] Measure from the top edge to the top of the message's first line. Reference: about 6.82 in. Result: ______
- [ ] Width of `Houston, TX, 77007`. Reference: about 1.47 in. Result: ______ (a smaller result means it was scaled)
- [ ] Is the text left or right of where the reference puts it? By how much? ______

## 3. Real stock

- [ ] Which way does it feed, and which side faces up? ______
- [ ] Does the stock feed cleanly with no jam, smear or curl? ______
- [ ] Print the **short** card, then the **long** card.
- [ ] Fold both and place them in a card holder.
- [ ] Does the address show correctly after folding? ______
- [ ] Does all of the short message show? ______
- [ ] Does all of the long message show, including the last line? ______
- [ ] Does any text sit on a fold or get hidden by the holder? ______
- [ ] Where is the fold, measured from the top edge? ______

## 4. Adjust, if needed

Printer setup holds the alignment and **Message area height** controls.
Height is provisional at 1.75 in. Reduce it if the long card's last lines are hidden after folding.
Change one thing at a time and reprint the same test card.

## 5. A real card

- [ ] Your father enters an English card with no help. Any hesitation? ______
- [ ] Your father enters a Spanish card with accents and ¿ ¡. Printed correctly? ______
- [ ] New Card asks before erasing. Yes clears the card; No keeps it.
- [ ] Printer setup still holds its adjustments after closing and reopening the tool.
