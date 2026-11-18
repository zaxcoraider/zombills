I found 2 blockers, 15 should-fix and 8 nits. Most of the spec is testable and stays inside the privacy and CSP rules. The problems are an overlay assumption that breaks drag-and-drop, a primary-button rule that today's card styling makes impossible to meet, and several earlier specs and tests the spec changes without saying so.

No `design.md` or `tasks.md` exists yet, so I skipped the traceability and code-batch checks. The real-world CSV and money checks don't apply: the spec only renames Sample labels and adds no arithmetic.

### Blockers

**1. Blocker: a file dropped on "Choose a file" is lost**
- **Where:** R3.5 (its assumption), R3.3, R3.6
- **Problem:** R3.5 puts "Choose a file" over the drawing of the grave, as a sibling of the `role="button"` element. A drop on that button never reaches `DropZone`'s `onDrop`. The window listener in `slice-page.tsx` cancels it, so the file is ignored without a word. Moving the pointer onto the button also fires `dragleave` on the zone. That resets the depth counter in `drop-zone.tsx`, so the ghost sinks and the text goes back to "Drop a CSV statement here" while the file is still over the grave.
- **Failing example:** Drag `us-signed.csv` to the middle of the grave, where the button sits, and release. Nothing happens.
- **Suggested fix:** Put the drag and drop handlers and the depth counter on the shared wrapper, so the whole visual grave is the drop target. Keep `role="button"` and the keyboard behaviour on the inner element. Add R3.13: "A file dropped anywhere inside the Grave drop area's box, including on 'Choose a file', SHALL be read, and the drag-over state SHALL hold while the pointer is anywhere inside that box." Add a component test that drops on the button.

**2. Blocker: the one-primary rule clashes with the card's buttons**
- **Where:** R6.3 versus R6.5 and R6.7
- **Problem:** R6.3 says the card's buttons keep today's look. "No, bury it" is `bg-moss text-night` (`undead-card.tsx`, around line 295). R6.5 says at most one control may use the primary variant "(or the `bg-moss` fill)". Its "Leave question open" note also says no other control may then be primary. Two states break this:
  - In the `burying` stage, the card still shows its `aria-disabled` moss "No, bury it" during `condemned` and `sinking`, next to the primary "Next".
  - On `ask` with the Leave question open, both "No, bury it" and "Leave" are moss.

  R6.7 counts only `data-variant="primary"`, so its test passes while the text of R6.5 fails.
- **Failing example:** Bury Netflix and look at the `condemned` phase: two moss-filled controls are on screen.
- **Suggested fix:** Pick one of these:
  - (a) Drop "(or the `bg-moss` fill)" and count only the marker. Then state that the card pair is exempt from R6.5.
  - (b) Give the card's moss button the marker and hide the ask block once `phase !== "undead"`.

  Either way, make the Leave question's "Leave" secondary or exempt it, rather than requiring other controls to lose their look while it is open.

### Should-fix

**3. Should-fix: the Leave question guards the wrong thing**
- **Where:** R1.4, R1.10, Decision "the leave question tells the truth"
- **Problem:** The spec's own decision says going home loses no answers. What it does lose is the current statement's Rising: the unanswered Queue and the skip order. To answer the rest, the user must analyse the statement again. Meanwhile the Leave rule asks even when there is nothing to lose. "Leave the graveyard?" is also inaccurate on the results view, which is not the Graveyard view.
- **Failing examples:**
  - Memory is off, the Graveyard has one record, and the Page shows `error` or the Graveyard view while `idle`. Home asks the question, though going home changes nothing.
  - On `results` with 3 of 4 cards unanswered and an empty Graveyard, there is no question, and the remaining cards are put away.
- **Suggested fix:** Ask only when `view.kind === "results"`. Word the question for both losses, for example: "Go back to the start? This statement's results are put away, and your answers are kept only until you close this page unless you remember your graveyard." Pass `view` to `shouldAskBeforeLeaving` and update the R1.10 property.

**4. Should-fix: R8.7 starts the Tab count from the wrong element**
- **Where:** R8.7
- **Problem:** R8.7 says the focus target after a burial is "the Stage group". It is the tombstone: `reachBuried` requests `"tombstone"` in `page-state.ts`, and graveyard-ui R5.5 says the same. R8.7 also mentions "the steps' links", but steps hold no links, because cancel-helper R6.5 bans URLs in them.
- **Failing example:** A test that focuses `[data-burial-stage]` and presses Tab 3 times starts from an element that never has focus after a burial.
- **Suggested fix:** "From the stage tombstone, which has focus after the rise, 'Next' SHALL be reached after the cancel link, each App-store link and 'Write to them instead': 3 Tab presses when `appStoreMayApply` is false, 5 when it is true."

**5. Should-fix: the sway test in R10.7 can pass while the card still sways**
- **Where:** R10.7
- **Problem:** Framer Motion drives the independent `rotate` value from JavaScript, not from Web Animations. The current infinite sway therefore probably shows no entry in `document.getAnimations()` either. I did not verify this in a browser.
- **Failing example:** Keep `repeat: Infinity`. The `getAnimations()` part of the check still passes.
- **Suggested fix:** Read the card wrapper's computed `transform` at 5.5 s and again at 6.0 s. Both must equal the rest pose (`none` or the identity matrix). Keep the `getAnimations()` check only as an extra.

**6. Should-fix: fog keeps drifting forever on Non-landing views**
- **Where:** R5.3, R12.8, brief "Constraints"
- **Problem:** R5.3 lets the backdrop fog drift on Non-landing views in endless 20 to 40 s loops. That is automatic motion longer than 5 s, running next to the content, with no way to pause it. It fails WCAG 2.2.2, and the brief says "automatic motion stops within 5 s". R12.8 only covers motion this spec adds or changes, so the fog escapes it.
- **Failing example:** Open the results view, wait 10 s: the fog bands are still moving.
- **Suggested fix:** Rest the fog bands in their reduced-motion pose on Non-landing views too, as landing-polish already does on the Landing view. Extend the R13.6 Playwright check to a results view and a Graveyard view.

**7. Should-fix: the R4.7 test fails on a clean checkout**
- **Where:** R4.7
- **Problem:** A Vitest test that reads `dist/index.html` and `dist/og-image.png` needs the web app built first. The root `pretest` builds only `@zombills/core`, so `npm test` fails on a clean checkout. Today only `e2e/demo-path.spec.ts` reads `dist`.
- **Failing example:** `git clean -xfd && npm ci && npm test` fails with ENOENT on `apps/web/dist/index.html`.
- **Suggested fix:** Put the tag check in a Playwright spec, which already serves the built site. Alternatively, have the Vitest test check `index.html` through `injectCsp(source)` and read `apps/web/public/og-image.png` directly.

**8. Should-fix: earlier specs changed without the R13.1 notes**
- **Where:** R13.1
- **Problem:** The spec changes these earlier criteria but adds no note for them:
  - **landing-nits:**
    - 2.3 fixes the BrandMark at `size-14 sm:size-[4.5rem]` (56 and 72 px). R1.2 needs 32 to 48 px.
    - 7.3, 8.3 and 9.3 require Non-landing Hills, Fence, `Ground` and `GrassTufts` to "render exactly as before". R5.1 removes them.
  - **cancel-helper:**
    - 7.5 has the "Or ask them in writing:" intro and the email shown open.
    - 8.1 gives the tab order. 8.2 places "Next" after the panel.
    - 10.4 is the demo-path mailto check, which uses `getByRole("link", { name: /^Open in my email app/ })` at `demo-path.spec.ts:142` and will not find the link while it is hidden.
    - 10.5 is the helper-panel overflow test.
  - **graveyard-ui:** 2.5, 5.5 and 14.2 give the place of "Next".
  - **share-card:** 4.8 says the panel uses "the existing button class of the Graveyard view".
  - **landing-polish:** 4.5 puts the `working` line "directly after the Primary action", but R11.1 puts the new line in between. 13.1 asserts no Landing button is named "US bank, signed amounts", which should become "US bank statement".
  - **graveyard-memory:** 1.1 gives the Memory panel's content order.
- **Failing example:** `demo-path.spec.ts:142` fails once the Email disclosure starts collapsed, and R8.8 only covers `cancel-helper.test.tsx`.
- **Suggested fix:** Add each item to R13.1. List `demo-path.spec.ts:142`, `graveyard-flow.test.tsx` and `graveyard-view.test.tsx` (both use Copy and the mailto link) in R13.3. Give `BrandMark` a `size` prop and note it against landing-nits 2.3.

**9. Should-fix: collapsing the email weakens the overflow test**
- **Where:** R8.2 and R8.8, with `layout.spec.ts` (around line 160: "Helper panel fits … at 390x844 with 200% text")
- **Problem:** The overflow check exists for the long email lines (cancel-helper R8.6). Once the email starts `hidden`, the test measures a panel without them and passes trivially. That is a weakened assertion, which the spec's own "What stays" section forbids.
- **Failing example:** The email body overflows at 320 px with 200 % text, and the layout test still passes because the body is hidden.
- **Suggested fix:** Amend the layout test to open "Write to them instead" before measuring, and say so in the design's amendment list.

**10. Should-fix: the header height limit ignores multi-currency totals**
- **Where:** R1.1, "at most 88 px tall"
- **Problem:** `SavingsCounter` shows one line per currency (graveyard-ui R6.2). Graveyard-ui's own R6.8 example shows two lines (GBP and USD) after burying Netflix from the US and then the UK Sample. With three currencies the header cannot stay within 88 px.
- **Failing example:** The R6.8 flow (bury Netflix from the US Sample, then from the UK Sample) at 1280×800 gives a header taller than 88 px.
- **Suggested fix:** Use "at most 88 px tall WHILE the counter shows at most one currency line", or lay out the counter's lines in a row at `sm` and up.

**11. Should-fix: R12.3 and R4.3 disagree about text in the preview SVG**
- **Where:** R12.3 versus R4.3
- **Problem:** R12.3 lists "the preview image" among art with "no text inside SVG". R4.3 allows the SVG to keep `<text>` if the PNG is exported with the font loaded. The `aria-hidden`/`useId` rules of R12.3 also cannot apply to a static file.
- **Suggested fix:** Exclude `og-image.svg` from R12.3 and keep its own rules in R4.3. Alternatively, require text converted to paths and drop the "or" branch.

**12. Should-fix: no Page-model arbitrary exists for R1.10 and R1.11**
- **Where:** R1.10, R1.11
- **Problem:** Both properties quantify over "Page models built by the graveyard arbitraries of `test-arbitraries.ts`". That file exports Graveyard, outcome and action arbitraries (`pageGraveyardArb`, `pageResultsOutcomeArb`, `memoryActionArb`), but nothing that builds a `PageModel` with a `view` and `screen`. "Non-landing view other than `working`" can't be generated as written.
- **Suggested fix:** State how models are built, for example: "by folding generated `PageAction` sequences through `pageReducer` from `initialPageModel` of a generated `ReadResult`". Require that every view kind and both screens occur, checked by a unit test as share-card R11.1 does.

**13. Should-fix: the Non-landing ridge band has no stated place, and its test may not be able to scroll**
- **Where:** R5.1, R5.2
- **Problem:** R5.1 says the ridge band moves into the document flow but not where. Landing-nits 7.2 fixed it between the Hero and "How it works". The R5.2 test scrolls by 400 px, but a Graveyard view with one tombstone at 1280×800 may not be 1200 px tall.
- **Failing example:** A Graveyard view with one buried record: `scrollY` stops below 400, and "moves by the scroll amount ±1 px" fails or gets measured wrongly.
- **Suggested fix:** Name the place, for example "directly after the Compact header" or "before the Footer". Say that it must not intersect any Content box. Make the test scroll by `min(400, scrollHeight − innerHeight)` and require at least 100 px.

**14. Should-fix: R7.1 doesn't say how the Statement disclosure reaches the right column**
- **Where:** R7.1, R7.3, R12.6
- **Problem:** The Statement disclosure lives in `slice-page.tsx` (the gate, `order-2`), outside `RisingView`. R7.1 puts it in the right column with the summary. A sticky right column then needs one grid across two components, plus a statement of where the disclosure sits in the DOM. R7.3's "focus order matches reading order" is then hard to judge: summary (right), Stage (left), disclosure (right).
- **Suggested fix:** Say that `RisingView` takes the Statement disclosure as a slot, rendered after the Stage in the DOM. Name the grid areas. Make only the summary sticky. Replace "matches the reading order" with the exact tab sequence.

**15. Should-fix: the Ground fade in R5.4 is never tested**
- **Where:** R5.4 versus R5.6
- **Problem:** R5.6 checks only the Stage's own box. The edge users see today is `Ground`'s straight top: `GROUND_TOP` and an inset shadow, inside the clip. R5.4's "gradient to transparent of at least 24 px" has no test.
- **Suggested fix:** Add to R5.6: the Stage's `Ground` has no `box-shadow`, and its background's first stop is transparent, with the next stop at least 24 px further on.

**16. Should-fix: the Peek ghost and lift rely on hover, which phones handle badly**
- **Where:** R2.8
- **Problem:** On touch screens, a tap sets a lasting hover state, then opens a new tab. When the user comes back, the stone may still be lifted with the ghost showing.
- **Suggested fix:** Run the lift only for `(hover: hover)` pointers or keyboard `:focus-visible`. Framer Motion's `whileHover` already ignores touch input; say that the spec relies on this.

**17. Should-fix: a file dropped on the results view lands nowhere**
- **Where:** R3.7, vertical-slice R4.11
- **Problem:** On `results` and the Graveyard view, the only drop target is inside the collapsed disclosure, which is `hidden`. A file dragged onto the page is cancelled by the window listener, with no feedback. Vertical-slice 4.11 still promises that a new drop replaces the result.
- **Suggested fix:** Open the disclosure on a window `dragenter` that carries `Files`. Alternatively, state that a drop needs the disclosure open and note it against vertical-slice 4.11.

### Nits

**18. Nit: duplicate heading in R3.1 and R3.7.** On `results`, the disclosure `h2` "Try another statement" and the panel's own heading "Try another statement" would both appear. Say that inside the disclosure, its `h2` is the panel heading.

**19. Nit: R10.4 can pause off the rest pose.** It allows a pause "in its current pose" and the sway never restarts, so the card can stay tilted. That contradicts "ends in the rest pose" and the R10.7 check. Settle to `rotate: 0` on hover or focus instead.

**20. Nit: the Progress dots move around.** R10.2 orders the dots by `rising.order`, which "Skip" and "Answer now" change, so filled dots jump around. "Never wraps at 320 px" doesn't say which row, and the row will wrap at 200 % text. Use the original Rising order, and limit the no-wrap rule to the dots or bar element at the default text size.

**21. Nit: the class-string check in R6.3 is easy to dodge.** Reordering one class passes it. Instead, check that every `button`, and every `a` styled as a button, under `slice/**` outside the exempt list carries `data-variant`.

**22. Nit: the Leave question's place and lifetime.** R1.4 puts it "directly under the Compact header", which may fall outside every landmark. Put it at the start of `main`. Also say that it closes on any Page state or screen change, and what a second press of the Home control does.

**23. Nit: R2.3 makes the 2×2 grid uneven.** A long description under "The Reaper" at 320 px makes one cell several times taller than the others; "in practice" in R2.7 is also vague. Let the description span the full width under the grid, keep the `aria-describedby` link, and replace "in practice" with a number.

**24. Nit: the preview PNG has no size or type limits.** R4.2 sets none. Add `og:image:type` `image/png` and a size cap, for example 300 KB. Link-preview crawlers reject files above about 5 MB.

**25. Nit: a few small inaccuracies.**
- R6.5's `working` row says "all controls aria-disabled", but the Footer tombstones stay active.
- R12.6 puts "Start again" after the Statement panel, but on `error` and `no-subscriptions` it sits inside `ErrorView` and `NoSubscriptionsView`, before the panel.
- On phones the grave still says "Drop a CSV statement here". You could give `(hover: none)` devices a tap-first wording, with the drag-over text unchanged.

Verdict: approve after fixes

## Resolution

All 25 findings accepted with the reviewer's suggested fixes.

| # | Decision | Where changed in `requirements.md` |
| --- | --- | --- |
| 1 | Drag handlers and depth counter on the shared wrapper; new drop criterion with a component test | R3.3, R3.5, R3.13 |
| 2 | Option (b): the card's moss "No, bury it" carries `data-variant="primary"`; the answer block hides once `phase !== "undead"`; in the Leave question both buttons are secondary and "Stay" takes focus | Decision "the leave question tells the truth", R1.4, R6.3, R6.5 (lead, `burying` and Leave rows, note), R6.7 |
| 3 | Reviewer's wording; ask only on `view.kind === "results"` | Decision "the leave question tells the truth", Glossary "Leave rule", R1.3, R1.4, R1.10 |
| 4 | Count Tabs from the stage tombstone: 3 or 5 presses | R8.7 |
| 5 | Computed `transform` at 5.5 s and 6.0 s; `getAnimations()` kept as an extra | R10.7 |
| 6 | Fog bands rest on Non-landing views; Playwright check on results and Graveyard views | R5.3, R12.8, R13.6 |
| 7 | Tag check in a Playwright spec; root `npm test` needs no built web app | R4.7, R13.6 |
| 8 | All listed earlier-spec notes added; tests listed; `BrandMark` gets a `size` prop | R13.1, R13.3 |
| 9 | Layout overflow test opens "Write to them instead" first | R8.8, R13.1, R13.3 |
| 10 | Counter lines in a row from `sm`; 88 px limit holds while at most two currency lines show | R1.1 |
| 11 | `og-image.svg` excluded from R12.3; its text converted to paths | R4.3, R12.3 |
| 12 | Page-model arbitrary built by folding `PageAction`s through `pageReducer`; coverage unit test | R1.10, R1.11 |
| 13 | Ridge band sits directly before the Footer and never intersects a Content box; scroll by `min(400, scrollHeight − innerHeight)` ≥ 100 px | R5.1, R5.2 |
| 14 | Statement disclosure as a `RisingView` slot after the Stage; named grid areas; only the summary sticky; exact tab sequence | R7.1, R7.3 |
| 15 | `Ground` has no `box-shadow` and a transparent first stop, next stop ≥ 24 px on | R5.6 |
| 16 | Lift only for `(hover: hover)` or `:focus-visible`; relies on `whileHover` ignoring touch | R2.8 |
| 17 | Window `dragenter` carrying Files opens the Statement disclosure | R3.8, R13.1 (vertical-slice 4.11) |
| 18 | The disclosure's `h2` is the panel heading | R3.7 |
| 19 | Settle to `rotate: 0` on hover or focus | R10.4 |
| 20 | Dots in the original Rising order; no-wrap rule limited to the dots or bar at default text size | R10.2 |
| 21 | Static check: every button-like control outside the exempt list carries `data-variant` | R6.3 |
| 22 | Leave question at the start of `main`; closes on any state or screen change; second press refocuses "Stay" | R1.4 |
| 23 | Reaper description spans the full width under the grid | R2.3 |
| 24 | `og:image:type` `image/png`; PNG at most 300 KB | R4.1, R4.2, R4.7 |
| 25 | `working` row notes the Footer tombstones stay active; "Start again" place on `error` and `no-subscriptions`; `(hover: none)` resting text "Tap to choose a CSV statement" | R6.5, R12.6, R3.3, R3.14 |
