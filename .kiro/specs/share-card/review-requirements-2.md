# Review of Requirement 11 (art polish) — spec-reviewer, 2026-11-17

1. **Blocker.** R11.6 and R11.10, against R11.4 and R11.8.
   - **Problem:** A 640-wide `here-lies` box cannot sit above the first total line inside the arch.
   - **Numbers:** The arch is 640 wide only at y ≥ 387. With a bevel inset of 20 px, the bevel is 640 wide only at y ≥ 423. The first total box starts at y 412. A 52 px `here-lies` box plus the divider must end above 412, so its top is at about y 340. There the arch is only 562 wide (x 259–821).
   - **Failing example:** With `here-lies` at baseline 380 (box y 340–392, x 220–860), the box crosses the stone outline and the bevel, which breaks R11.4. Its corner (860, 340) is 51 px from the moon centre, so the box overlaps the moon disc itself. The glow then cannot exist under R11.8.
   - **Why the block can't move down:** `here-lies` plus divider plus the largest block needs about 530 px. From y 387 to the grass limit at 860 there are only 473 px.
   - **Suggested fix:** Give `here-lies` a Text box width of about 360 (x 360–720). "Here lies" at 40 px is about 150 px wide. Then state a fixed baseline, for example 384 (box 344–396), with the divider at about y 403.

2. **Major.** R11.4, against the existing first total box (`TEXT_LAYOUT.bandTop` 410).
   - **Problem:** Even without `here-lies`, the bevel must follow the arch at an inset of at most about 12 px. At y 412, the bevel's half-width must reach at least 320 + lineWidth/2. That needs a bevel radius of at least √(320² + 198²) ≈ 376.3, so the inset is at most 13.7 − lineWidth/2.
   - **Failing example:** A 20 px inset gives a half-width of 312.6 at y 412, so the bevel cuts the top corners of the first total box in the largest content.
   - **Suggested fix:** State the inset (for example 10 px) and a maximum lineWidth (3 px) in R11.4, or let the bevel cover only the sides below the text band.

3. **Major.** R11.2 and R11.8 (moon glow radius).
   - **Problem:** The glow radius is capped by the brand box (at most 118) and, with the current layout, by the first total box (at most 122). The current halo is r 100. If finding 1 is fixed with a narrow `here-lies` box, the cap stays 118. Otherwise it falls to about 60, which is barely bigger than the moon (r 52).
   - **Suggested fix:** Give R11.2 a radius range, for example 60 < r ≤ 110. Also require the glow radius to be larger than the moon's, so the glow disc contains the moon disc and the star exclusion in R11.3 also covers the moon.

4. **Major.** R11.3, R11.4, R11.5 and R11.13.
   - **Problem:** The art is fixed, but the text block is centred per content (`share-card.ts` `shareCardLayout`). Checking only "the largest content" and the first example of R1.8 does not prove that art avoids text for every other content.
   - **Failing example:** A crack across x 300–700 at y 730 misses every box of the largest content: it sits in the gap between the third total box (632–725.6) and the more-currencies box (742–788.8). It also misses the first example's boxes (554–716), so it passes R11.13. But for two currencies plus a count line, the count box is y 719–771, so the crack crosses the count line.
   - **Suggested fix:** Require the checks against the union of line boxes over every block shape `shareCardContent` can return: 0 to 3 totals, with or without the more-currencies line, plus the count line. Or add the art-against-text checks to the R10.4 property.

5. **Major.** R11.6.
   - **Problem:** `here-lies` goes "between brand and the first total line", and the divider goes "between the `here-lies` line box and the first `total` line box". When every Tombstone is guessed, `totalLines` is empty (R1.8, row 3), so there is no first total line.
   - **Suggested fix:** Change "first total line" to "the first line of the block (the first `total`, or `count` when `totalLines` is empty)". Add the all-guessed Graveyard to R11.13.

6. **Major.** R11.2, against the Glossary entry "Colour token" and R3.4.
   - **Problem:** The Glossary and R3.4 say opacity is applied only through `globalAlpha` and no colour string is parsed. R11.2 allows parsing any string the Renderer resolved itself, and every token resolves to a hex value from `index.css`. Per-stop alpha also cannot use `globalAlpha`, and the mechanism is not named, so the R11.2 Renderer test has nothing concrete to check.
   - **Failing example:** An implementer converts the resolved `#ece6d6` to `rgba(236,230,214,0.3)`. That parses a hex string, which contradicts R3.4. Another uses `color-mix(...)`. On a browser without `color-mix` in canvas (before Chrome 111, Firefox 113 or Safari 16.2), `addColorStop` throws a `SyntaxError`, the whole render rejects with "drawing failed" (R3.6), and the user can no longer make an image at all.
   - **Suggested fix:** Name the mechanism: `` `color-mix(in srgb, ${resolved} ${alpha × 100}%, transparent)` ``. State that if building the gradient throws, the Renderer skips the glow and still draws everything else. Amend R3.4 and the Glossary to match.

7. **Minor.** R11.1 and R11.4 (`stroke-path`).
   - **Problem:** "Widened by half their `lineWidth`" only bounds the painted area for round joins and butt or round caps. Canvas defaults to `lineJoin: "miter"` with `miterLimit` 10, so a sharp crack corner can paint up to 5 × lineWidth past the vertex.
   - **Suggested fix:** Require the Renderer to set `lineJoin = "round"` and `lineCap = "round"` (or butt). Add `stroke`, `strokeStyle`, `lineWidth`, `lineJoin`, `lineCap` and `createRadialGradient` to `CanvasContextLike` (`share-card-renderer.ts`).

8. **Minor.** R11.4 and R11.13.
   - **Problem:** "Every point lies inside the stone" can be read as "every vertex". Vertices are enough for containment, because the stone is convex. They are not enough to prove a segment misses a Text box: two vertices outside a box can be joined by a segment that crosses it. Separately, a bevel that "follows the sides" down to y 900 sticks out of the stone by lineWidth/2 at the bottom.
   - **Suggested fix:** Require segment-against-rectangle tests. Make the bevel end at least lineWidth/2 above `GROUND_TOP`.

9. **Minor.** R11.5.
   - **Problem:** The grass rises to y 860, and the largest content's count box ends at 857. Only 3 px separate them, so any downward shift from the `here-lies` work breaks R11.5.
   - **Suggested fix:** State the slack, or limit the grass to 30 px above `GROUND_TOP` within x 220–860.

10. **Minor.** Missing amendment notes in R2.4, R2.9, R9.2 and R10.3.
    - **Problem:** R2.4 still lists five roles. The first example of R2.9 still says "brand, one total, count, address". R9.2 names three faces. R11.1 says R10.3 should talk about "shape kinds", but R10.3 is about text roles.
    - **Failing example:** `share-card.test.ts:326` expects `["brand","total","count","address"]` and will fail.
    - **Suggested fix:** Add "(Amended by Requirement 11.6/11.9)" notes to R2.4, R2.9, R9.2 and R10.3. Reword the cross-reference in R11.1.

11. **Minor.** R2.7, against R11.6 and R11.9.
    - **Problem:** R2.7 limits `measure` calls to the role's "family and weight" and says nothing about font style. `RoleStyle` and `fontFor` (`share-card-fit.ts`) have no style field, so the italic font string `italic 400 40px "IM Fell English", Georgia, serif` is not covered by R2.7 or by the R10.4 property. R11.9 also loads only "Here lies", while the brand face also loads "…" (`facesToLoad`).
    - **Suggested fix:** Add "style" to R2.7. Load `SHARE_EPITAPH + " …"` in R11.9.

12. **Minor.** R11.3, against `eslint.config.js:102-104`.
    - **Problem:** R11.3 bans `crypto.getRandomValues` and any `Date`, but ESLint only bans `Date.now` and `Math.random`, and no test checks the rest.
    - **Suggested fix:** Add `crypto.getRandomValues` and `new Date` to the pure-logic block's restricted properties and syntax, or add a source scan to R11.13.

13. **Minor.** R11.8.
    - **Problem:** "The colour behind each point" of a line box over a linear sky gradient has no sampling rule, so two tests can disagree.
    - **Suggested fix:** Say the gradient's colour runs from night to fog with luminance rising, so checking the box's top and bottom y is enough. Name the compositing as sRGB "over", as `contrast.test.ts:159` already does.

14. **Minor.** R11.2.
    - **Problem:** "Alpha going down" could mean strictly decreasing or non-increasing.
    - **Suggested fix:** Write "non-increasing from the first stop, with the last stop at offset 1 and alpha 0".

15. **Minor.** R11.6 (copy).
    - **Problem:** "Here lies" followed by "I buried $215.88 a year." reads as "Here lies I buried…".
    - **Suggested fix:** Use an epitaph that stands alone, such as "Rest in peace" or "Buried here", or confirm the line break makes the current wording acceptable.

**Not issues:**
- The italic face is already bundled (`main.tsx:2`, `@fontsource/im-fell-english/400-italic.css`), so R11.12 ("no font file added") holds.
- Privacy, the CSP, money and determinism (fixed list or fixed seed, art frozen at module load) raise no problems.

**Traceability:** `design.md` and `tasks.md` have no entries for R11 yet. Every R11.x criterion will need a task once the design is written.

Verdict: approve after fixes

## Resolution

All 15 findings accepted and applied to `requirements.md`. `design.md` and `tasks.md` are unchanged.

| Finding | Decision | Where applied |
| --- | --- | --- |
| 1 | Epitaph Text box width 360, centred on x 540, fixed baseline about y 384 (box 344–396), divider about y 403; all inside the arch and clear of the moon glow. | R11.6, R11.13; R2.4 note |
| 2 | Bevel inset 10 px, `lineWidth` at most 3. | R11.4, R11.13 |
| 3 | Glow radius `moonR < r ≤ 110`, so the glow disc contains the moon. | R11.2, R11.13 |
| 4 | Art-against-text checks run over every Block shape (0–3 totals, with or without more-currencies, plus count); also added to the R10.4 property. | R11.3, R11.4, R11.5, R11.13 (Block shape defined there) |
| 5 | "First line of the block (the first `total`, or `count` when `totalLines` is empty)"; all-guessed Graveyard added to the tests. | R11.6, R11.13 |
| 6 | Radial stops use `color-mix(in srgb, <resolved> <alpha × 100>%, transparent)`; if building the gradient throws, the Renderer skips the glow and draws everything else. | R11.2; R3.4 note; Glossary "Colour token" |
| 7 | `lineJoin` and `lineCap` set to `"round"`; `CanvasContextLike` extended. | R11.1 |
| 8 | Segment-against-rectangle tests; bevel ends at least `lineWidth / 2` above `GROUND_TOP`. | R11.4, R11.13 |
| 9 | Grass at most 30 px tall within x 220–860. | R11.5, R11.13 |
| 10 | Amendment notes added; R11.1 cross-reference reworded (R9.1 shape kinds, R10.3 text roles). | R2.4, R2.9, R9.2, R10.3, R11.1 (also R3.2) |
| 11 | "Style" added to R2.7; the italic face loads `SHARE_EPITAPH + " …"`. | R2.7, R11.9 |
| 12 | `crypto.getRandomValues` and `new Date` added to the ESLint pure-logic restrictions, stated in R11. | R11.3 |
| 13 | Sampling rule: check the sky gradient at the box's top and bottom y; sRGB "over" compositing. | R11.8 |
| 14 | Alpha non-increasing; last stop at offset 1 with alpha 0. | R11.2, R11.13 |
| 15 | Epitaph text is `Rest in peace`; role renamed `epitaph`; `SHARE_EPITAPH = "Rest in peace"`. | Introduction, R2.1 note, R11.1, R11.6, R11.10–R11.13 |
