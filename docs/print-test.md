# Print test

Goal: a card from iPhone Safari to the Brother HL-L2460DW that lands where the reference puts it.
Automated tests cannot cover this. They stub the iOS share sheet and never touch the printer.

Use **Printer setup**. Its test cards use made-up details. Write down what happens at each step,
including failures.

## First test result (2026-11-04)

A #10 PDF did not keep its size. iOS offered only US Letter, even with Feed tried as an option,
and enlarged the page about 10–12%. Printer job 388 recorded `media=na_letter_8.5x11in` and
`print-scaling=auto`. Share sheet, Print and centring all worked, so the tool now sends a Letter
page positioned for the stock. Its scale is provisional until step 1 below.

## What the printer reports (read from it directly, 2026-11-04, firmware 1.15)

| Attribute | Value | Meaning |
|---|---|---|
| `media-supported` | includes `na_number-10_4.125x9.5in` | #10 is a named size |
| `media-source-supported` | `auto, manual, main` | manual is a real source |
| `media-ready` | `na_letter_8.5x11in` only | **Main risk**: the iPhone may assume Letter |
| `print-scaling-default` | `auto` | Scaling is possible if the wrong size is picked |
| margins | 4.23 mm (0.167 in) each side | Text can't print closer to the edge than this |

The reference text sits well inside those margins, and the tool stops text 0.25 in from the bottom edge.

## 1. Calibration sheet (plain Letter paper, main tray)

Measure with a ruler and report all three. Nothing else can be tuned until these are known.

- [ ] Printer setup > **Print calibration sheet**.
- [ ] Top edge of the paper to line A: ______ in
- [ ] Line A to line B (9.00 in at full size): ______ in
- [ ] Width of line C (6.00 in at full size): ______ in

## 2. Plain paper trimmed to 4.125 × 9.5 in, manual slot

- [ ] **Print short test card**. Was Double-sided off? ______
- [ ] Did it take from the **manual slot**, with no error? Any error text: ______
- [ ] Top edge to the top of the address's first line. Reference: about 0.58 in. Result: ______
- [ ] Top edge to the top of the message's first line. Reference: about 6.82 in. Result: ______
- [ ] Width of `Houston, TX, 77007`. Reference: about 1.47 in. Result: ______

## 3. Real stock

- [ ] Which way does it feed, and which side faces up? ______
- [ ] Does the stock feed cleanly with no jam, smear or curl? ______
- [ ] Print the **short** card, then the **long** card.
- [ ] Fold both and place them in a card holder.
- [ ] Is all of the short message on the bottom panel, clear of the perforation? ______
- [ ] Is the long message clear of the rose and the logo? ______
- [ ] Top edge to each perforation: ______ / ______ in. Top edge to the top of the bottom logo: ______ in

## 4. Adjust, if needed

Printer setup holds the alignment and **Message area height** controls.
Height is provisional at 1.75 in. Reduce it if the long card's last lines are hidden after folding.
Change one thing at a time and reprint the same test card.

## 5. A real card

- [ ] Your father enters an English card with no help. Any hesitation? ______
- [ ] Your father enters a Spanish card with accents and ¿ ¡. Printed correctly? ______
- [ ] New Card asks before erasing. Yes clears the card; No keeps it.
- [ ] Printer setup still holds its adjustments after closing and reopening the tool.
