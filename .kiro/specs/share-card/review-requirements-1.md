# Review of share-card/requirements.md

I found no blockers. Nine findings are major, and several of those would make a one-task-per-run implementation fail or would weaken a privacy promise. There is no design.md or tasks.md yet, so I did not check traceability or a code batch.

**Major**

1. **R4.6, with R1.5 and R4.2: a stale image can be shared during the first render**
   - **Problem:** The rule that only the latest content is used applies only "WHILE a Preview is shown". During the first render, a checkbox change is not covered.
   - **Example:** The user ticks "Show names", clicks "Make an image", then unticks while it shows "Making the image…". The finished render still has the names, and "Save image" exports names the user just opted out of.
   - **Fix:** Make the latest-content rule apply to every render. If the content changed while a render was running, discard the result and render again. Keep the main button `aria-disabled` until the Image matches the current `shareCardContent(...)`, compared by deep equality.

2. **R4.2, R4.4 and R7.1: unclear whether "Make an image" stays**
   - **Problem:** The spec does not say whether "Make an image" stays visible once a Preview exists, or what it shows during an automatic re-render. R7.1's Tab order (checkbox, "Make an image", main button) implies it stays. Removing it would leave focus on a removed element, which breaks graveyard-ui R14.2.
   - **Example:** One implementer swaps the button for the Preview and focus drops to `<body>`. Another keeps it, and it is unclear what a second click does.
   - **Fix:** State that "Make an image" stays mounted in place and stays focusable. It reads "Making the image…" with `aria-disabled="true"` during any render, including the re-renders of R4.6. After the first Image, it either renders the current content again or is renamed "Make the image again". Choose one.

3. **R5.6 and R9.3: the download test will write to the console in jsdom**
   - **Problem:** jsdom does not implement navigation. Calling `click()` on an `<a href="blob:…" download>` makes jsdom report "Not implemented: navigation (except hash changes)" through its virtual console, which shows up as console output. R9.3 requires no console output, and the existing tests spy on `console` (`graveyard-flow.test.tsx`, `cancel-helper.test.tsx`).
   - **Example:** The "Save image" row of R5.9 fails with an unexpected console error.
   - **Fix:** Put the download in an injectable helper (for example `downloadFile(file, name)` passed as a prop or dependency), or have R9.3 require spying on `HTMLAnchorElement.prototype.click` with an implementation that does nothing.

4. **R3.4 and R9.2: the colour tokens will not resolve in jsdom**
   - **Problem:** The Renderer reads tokens with `getComputedStyle(document.documentElement)`. Vitest does not load `index.css` into jsdom, so `--night` and the other tokens resolve to `""`. `RenderDeps` covers only the canvas and fonts.
   - **Example:** The test "four tokens resolve to the `index.css` values" cannot pass without extra setup that the spec does not describe.
   - **Fix:** Add `resolveToken(token) => string` to `RenderDeps`, with the browser default `getComputedStyle(...).getPropertyValue("--" + token).trim()`. The test parses `apps/web/src/index.css` and checks the default against it on a document whose custom properties it sets. Also say how `alpha` is applied, for example `ctx.globalAlpha`, so no hex parsing is needed.

5. **R9.5: Playwright may take the Share path on a Mac**
   - **Problem:** The step "the button reads `Save image`" depends on the browser having no file share. R5.9 assumes "desktop Chromium on Linux", but this repo is developed on macOS, where Chromium may expose `navigator.share` and `canShare({ files })`.
   - **Example:** On the developer's Mac the button reads "Share image" and the download step times out.
   - **Fix:** Have the e2e step force the Save path. Use `page.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; })` before `goto`, and say so in R9.5.

6. **R10.1: `answerRecordArb` cannot produce the merchants the properties need**
   - **Problem:** `answerRecordArb` takes merchants from `answerableMerchantArb`, which is `constantFrom("Apple","Netflix","Spotify","Gym","Z","a","")` (`test-arbitraries.ts:301`). That set has no control characters, lone surrogates, U+202E or long strings, so R10.4 to R10.6 never see the hard cases.
   - **Example:** A 200-character merchant or one containing U+2028 is never generated, so neither shortening nor cleaning is exercised.
   - **Fix:** Say "build from `answerRecordArb` with `merchant` overridden by `fc.oneof(fc.string({ unit: "binary" }), fc.string({ maxLength: 500 }), constantFrom("Zombills","Here lie",…))`". Also make it filter `answer: "not-using"`, since the arbitrary mixes in Kept records.

7. **R2.7: the rule on `measure` calls contradicts the shrink loop**
   - **Problem:** R2.7 says `measure` is called "only with text and font strings that appear in its output or are candidate prefixes". The shrink loop in R2.5 calls it with every intermediate size, and those font strings never appear in the output.
   - **Example:** A `total` line shrinking from 72 px to 32 px calls `measure` with `600 71px "Inter", …`, which is not in any `TextOp`. A literal test of R2.7 fails.
   - **Fix:** Reword to "only with a source text, or a candidate prefix of it followed by `…`, and a font of that role's family and weight at a size from the role's start size down to its floor (or 1 px for `total`)".

8. **Scope against the 4 Dec deadline**
   - **Problem:** This is a should-have feature. It has 10 requirements: a renderer with five shape kinds, a Share path and a Save path, re-render races, an optional names list, 7 property tests, about 15 component scenarios in R9.3, and new e2e and layout steps. That is too much for about 18 days alongside the must-haves.
   - **Fix:** Defer or cut:
     - the `glow` shape, and `path` with `quad` (keep `rect`, `vertical-gradient` and `circle` plus a simple tombstone path);
     - the names option (R1.5, R2.4 heading and names rows, R4.2 checkbox, PBT R10.4), possibly to a follow-up;
     - most properties: keep R10.2, R10.5, R10.6 and R10.8 and merge R10.3 and R10.7 into unit tests.
     
     Also split R9.3 explicitly into one task for panel states and one for share and save, so each run stays small.

9. **R4.2 hint and R1.5: privacy wording for names**
   - **Problem:** The names are not service names when the merchant is generic. They are cleaned bank text (`record.merchant`), which can hold a place or a person: "Blue Bottle Coffee Oakland" (merchant-normalizer Introduction), or a name printed for a person-to-person payment. The hint "Adds up to 6 service names" understates what is shared.
   - **Fix:** Hint: "Adds up to 6 names as they appear on your statement. Amounts per service and dates are never shown." Keep the checkbox off by default (it already is).

**Minor**

10. **R2.5 vs R2.7 (fit for any `measure`):** "`measure` ≤ `maxWidth` for every text" cannot hold for an arbitrary measure function. If `measure` always returns 10,000, a `total` line at 1 px and `…` both still overflow. Restrict R2.5 to measure functions with `measure("…", font at floor) ≤ maxWidth` (R10.1's generated measures satisfy this), or say that the last fallback is drawn anyway.

11. **R2.5 note on which roles get shortened:** The claim "only the `name` role can need shortening with real fonts" is unproven. With large counts, the count line at its 24 px floor with Inter overflows 640 px and becomes "…saving unkn…". Example: "1000 subscriptions buried, 999 with saving unknown." is about 51 code points × about 13 px ≈ 660 px. Either let `count` shrink without a floor like `total`, or delete the claim.

12. **R3.5 (two PNG encodes):** `toDataURL` and `toBlob` each encode the PNG. That is two synchronous or asynchronous 1080² encodes, and the bytes are not guaranteed to be identical. Use `toBlob` only and make `dataUrl` with `FileReader.readAsDataURL(blob)`, which CSP allows. Update the R9.2 assertion to match.

13. **R3.2 (which faces to load):** The parenthesis always lists IM Fell italic, but the italic face is used only when `names` is not empty ("for each distinct face the Text operations use"). Choose one. Also, `document.fonts.load(font)` with no text loads only the subset that holds U+0020. Inter is split by `unicode-range`, so Cyrillic or latin-ext names (`ł`) are drawn in the fallback font. Use `document.fonts.load(font, text)` with the actual texts.

14. **R9.5 (`document.fonts.check` proves nothing):** The page already uses Inter 600 (the total in the Graveyard view) and IM Fell 400 (the `h1`). The check passes whether or not the Renderer loads anything, and some engines return `true` for a family that is not declared. Check the italic face after ticking names, or drop the check and rely on the R9.2 unit test.

15. **R5.5 (message claims a download happened):** The rejection is asynchronous, so the fallback download runs without user activation, which Safari may block. "…so it was downloaded instead" then claims something that did not happen, against the rule in R5.6 that announcements must not overclaim. Use "Could not share the image. Download started instead."

16. **R1.1 vs R1.5 (meaning of `moreNames`):** The type comment says "Tombstones with a Share name not shown". R1.5 and R10.4 count distinct names. Example: two Apple tombstones beyond the first six give `moreNames` 2 by the comment and 1 by R1.5. Change the comment to "distinct Share names not shown".

17. **R4.6 (other content changes):** The examples list only the checkbox and Unbury. "Bury after all" in the Graveyard view (graveyard-ui R8.3) also changes the count and totals. Make the list non-exhaustive: "any change of `shareCardContent(...)` by deep equality".

18. **R1.1 and R2.4 (hard-coded site address):** The image hard-codes `zombills.netlify.app`. Nothing in the repo (`netlify.toml`, `README.md`) shows that this site name is reserved. Confirm the Netlify site name before tasks start, because shared images cannot be corrected later.

**Checks with no findings:** the CSP reasoning in R6.3 (`data:` for `<img>`, `blob:` only in a download `href`) is correct, and R6.5's request-check exception is needed because `new URL("blob:http://…/uuid").pathname` fails the `dist` file check. The money handling (no recomputation, integer cents, `savingsTotals` as the only sum) matches money.md. The references hold: `CurrencyTotal{currency,totalCents}`, `haunt.tombstones` and `haunt.savings`, `knownNameFor`, `cleanField(value: unknown)`, `useAnnounce`, `expectUniqueButtonNames`, demo-path Steps 7 and 10, and the ESLint logic block.

Verdict: approve after fixes

## Resolution

All 18 findings accepted. Requirement numbers stay stable: Requirement 8 is kept as a removed placeholder. Inside Requirement 1, old 1.6–1.9 are now 1.5–1.8. Inside Requirement 9, old 9.3 is split into 9.3 and 9.4, so old 9.4–9.7 are now 9.5–9.8. Inside Requirement 10, old 10.2, 10.5, 10.6 and 10.8 are now 10.2, 10.3, 10.4 and 10.5.

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1 | Accepted. The latest-content rule applies to every render, the first one included: a result for stale content is discarded and the panel renders again. The main button stays `aria-disabled` until the Image was made from content deeply equal to the current `shareCardContent(...)`. | R4.6; R9.3 |
| 2 | Accepted. `Make an image` stays mounted and focusable. During any render it reads `Making the image…` with `aria-disabled="true"`. After the first Image it is renamed `Make the image again` and renders the current content again. | R4.4, R4.7; R7.1, R7.3; R9.3 |
| 3 | Accepted. Added an injectable `downloadFile(file, name)` prop whose default lives in `download-file.ts`. Component tests pass a fake. The unit test of the default replaces `HTMLAnchorElement.prototype.click` with a no-op spy. | R5.6, R5.7; R9.4 |
| 4 | Accepted. `resolveToken` added to `RenderDeps` with the `getComputedStyle` default. Alpha is applied with `ctx.globalAlpha`, and gradient stops have alpha 1, so no colour string is parsed. The test parses `index.css` and sets the properties on the jsdom document. | Glossary (Colour token); R3.1, R3.4; R9.2 |
| 5 | Accepted. The e2e test deletes `Navigator.prototype.share` and `canShare` with `addInitScript` before `goto`. | R9.6; R5.9 table |
| 6 | Accepted for the properties that remain: build from `answerRecordArb` filtered to `not-using`, with `merchant` overridden by the suggested `fc.oneof`. The constants now use the image's fixed strings, because `Here lie` is gone. | R10.1 |
| 7 | Accepted. Reworded: `measure` takes a source text or a candidate prefix plus `…`, in the role's family and weight, at a size from the start size down to the floor (or 1 px). | R2.7 |
| 8 | Accepted. Removed the names option: R1.5, the `names`/`moreNames`/`showNames`/`MAX_SHARE_NAMES` API, the checkbox and hint, the `names-heading`/`name`/`more-names` roles, `Here lie`, the names examples and alt sentences, the Share name glossary entry, and PBT R10.4. R8 (`cleanServiceName`) is dropped because only names needed it. Cut `glow` and `quad`. The tombstone is a `rect` + `circle` or a straight-line `path`, and the design may not add shape kinds. R10.3 and R10.7 became unit-test criteria. R9.3 is split into panel states (9.3) and share and save (9.4). A Deferred note is in the Introduction. | Introduction; Glossary; R1.1, R1.5, R1.8; R2.1, R2.3, R2.4, R2.6, R2.8, R2.9; R3.2; R4.2, R4.3, R4.8; R6.2; R7.1, R7.3, R7.6; R8; R9.1, R9.3, R9.4, R9.6; R10 |
| 9 | Moot. Names are no longer on the image, and the hint is removed. The privacy concern is the reason for the deferral recorded in the Introduction. | Introduction (Deferred) |
| 10 | Accepted. The fit guarantee holds for Measure functions where `total`/`count` texts fit at 1 px and `…` fits at each other role's floor. Otherwise the last fallback is drawn anyway. R10.4 notes that the generated measures meet this condition. | R2.5; R10.4 |
| 11 | Accepted. Removed the claim that only `name` needs shortening. `count` now has no floor and is never shortened, like `total`. Added a 1000-subscription count example. | R2.4, R2.5, R2.7, R2.9; R10.3, R10.4 |
| 12 | Accepted. The renderer calls `toBlob` once and builds `dataUrl` with `FileReader.readAsDataURL` from the same Blob, never `toDataURL`. A FileReader error rejects. | R3.5, R3.6; R6.3; R9.2 |
| 13 | Accepted. Fonts are loaded with `document.fonts.load(font, text)` using the actual source texts. The faces are now IM Fell English 400 and Inter 500 and 600, because italic and Inter 400 were only used for names. | R3.2; R9.2 |
| 14 | Accepted. Dropped the `document.fonts.check` e2e step. Font loading is covered by the R9.2 unit test. | R9.6 |
| 15 | Accepted. The message is now `Could not share the image. Download started instead.` | R5.5; R5.9 table |
| 16 | Moot. `moreNames` was removed with the names option. | R1.1 |
| 17 | Accepted. Covered by finding 1: the panel compares content by deep equality, and Unbury and `Bury after all` are given only as examples. | R4.6; R9.3 |
| 18 | Kept. `zombills.netlify.app` is the live Netlify site the team owns, deployed 2026-11-15 (`memory.md`). The Introduction now says so. | Introduction |
| Design review 1, note 1 | Amended by design review 1. A throwing `downloadFile` now shows and announces `Could not save the image in this browser.`, and the message is added to the Live region and shown-failure lists and to the share-and-save tests. | R5.6; R7.5; R9.4 |
| Design review 1, note 2 | Amended by design review 1. R7.1 gains one exception: if the main button has focus when R4.7 removes it, focus moves to the R4.4 button. | R7.1 |
| Design review 1, note 3 | Amended by design review 1. R9.4 now lets tests pass the fake `downloadFile` as a prop or by mocking `download-file.ts`. | R9.4 |
| Design review 1, finding 4 | Amended by design review 1. A run started by the R4.4 button that is redone for newer content still announces `Image ready. <alt text>`; R9.3's stale-first-render case expects that announcement. | R4.6; R9.3 |
| Design review 1, finding 8 | Amended by design review 1. R10.1 allows setting `answer` with `.map`, with `cadenceAssumed` set to `true` exactly when `yearlySavingCents` is `null`. | R10.1 |
