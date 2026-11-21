# Batch D review (tasks 35-45)

Reviewer: spec-reviewer agent (Opus), against the Batch D working tree. Owner + Claude Code visual review added V1. All findings accepted by the owner.

I found no blockers. There are three should-fix findings: a likely layout gap at desktop width, test changes that aren't recorded, and a size check that misses vertical clipping.

**Checks run:**
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm test --workspace @zombills/web` passes: 89 files, 1436 tests.
- Not run: the Playwright suite, `npm run build` and the core tests. The desktop findings below are from reading the code, not from a browser.

**Checked with nothing to report:**
- **Privacy and CSP:** no network, storage or URL calls in the changed source files; `public/` holds only `favicon.svg`, `og-image.svg` and `og-image.png`.
- **Hex colours:** no hex literals in the changed source files.
- **Disabled controls:** no `disabled` attribute or positive `tabindex` on DOM elements; the `disabled` matches are component props.
- **Motion:** no new automatic motion, and the switch has no transition under reduced motion.
- **Contrast:** rows were added for the Waiting chip and the toggle (both states).
- **Traceability:** every criterion 1.1–13.8 appears in at least one task's `_Requirements:_` line.
- **Earlier-spec notes:** every R13.1 note is present.

## Should-fix

**1. Should-fix: "Try another statement" probably sits halfway down the page at 1024 px and wider**
- **Where:** `apps/web/src/slice/graveyard/rising-view.tsx`, `RISING_GRID` and `SUMMARY_CARD` (R7.1, R7.3).
- **Problem:** At desktop width the grid has two rows of auto height, and the Stage spans both. A browser shares the Stage's extra height between the two rows, so the first row grows taller than the summary Card. The statement area starts at the second row, which is likely to put "Try another statement" far below the summary instead of right under it.
- **Failing example:** 1280×800, `results`, the Adobe card shown. The Stage (card plus ground) is about 640 px tall and the summary about 380 px, so the disclosure likely starts near y ≈ summary top + 320 px, with empty space above it. The new wide-layout e2e test only compares the Stage and the summary, so it would not catch this.
- **Fix:**
  - Add `lg:grid-rows-[auto_1fr]` to the grid and `lg:self-start` to the `data-rising-statement` div.
  - Note the trade-off: the sticky summary then has no room to move inside its own row. Sticky is optional under R7.1 ("MAY stick"), so either drop it or accept that it does nothing.
  - Add a check to `e2e/pro-polish.spec.ts`: at 1280×800 and 1600×900, the gap between the bottom of `[data-rising-summary]` and the top of `[data-rising-statement]` is at most 32 px (the grid gap plus 1).

**2. Should-fix: changed test assertions are not recorded (R13.2)**
- **Where:**
  - `graveyard-view.test.tsx` about lines 326–337: `not.toContain("col-span-2")` became `not.toContain("col-span")`, and `"min-[641px]:col-span-2"` became `"col-span-full"`.
  - `graveyard-view.test.tsx` about lines 402–411: the test now opens "Write to them instead" in both panels before querying Copy.
  - `graveyard-view.test.tsx` about line 570: `variantOf("Answer now …")` = `"secondary"` became `data-exempt="waiting-chip"`. You said the owner approved this one, but the approval is not written down anywhere in the spec.
  - `memory-panel.test.tsx`: `querySelectorAll("p")).toHaveLength(1)` became an exact list `[MEMORY_SHORT, MEMORY_HINT]`.
- **Problem:** None of these is in design "Existing tests that change". Task 39 even says "Existing tests: none change". Each change is a valid new truth or stricter than before; none is weakened. They just need to be listed.
- **Fix:** Add one row per change to "Existing tests that change", with the old assertion, the new one and the requirement that forces it (9.1, 9.3, 8.2, 9.4). Mark the line 570 row "owner approved 2026-11-21".

**3. Should-fix: the size check only looks for sideways clipping (R12.9, R13.6)**
- **Where:** `apps/web/e2e/content-boxes.ts`, `clippedText`.
- **Problem:** The helper only compares each text rectangle's left and right edges with the nearest ancestor whose `overflow-x` is not `visible`. Text cut off at the top or bottom by an `overflow-clip` box is not checked. Nor is text that runs out of its box onto the next element.
- **Failing example:** 390×844 with 200 % root font size, a restored Netflix tombstone in the Graveyard view. The list stone is 262 px wide and about 349 px tall, and its engraved text is sized in rem. "Saves $215.88/year." could run past the stone's bottom onto the `GroundLine` and the actions plate, and the helper would still return `[]`. The same applies to a card cut at the bottom by the Stage's `overflow-clip` box at 200 % text.
- **Fix:**
  - Also compare `r.top` and `r.bottom` with the nearest ancestor whose `overflow-y` is not `visible`.
  - In the Graveyard size case, assert that every text rectangle inside `section[aria-labelledby]` of a list tombstone lies inside that section's box.

## Nits

**4. Nit: the Helper panel opens inside the actions plate**
- **Where:** `graveyard-view.tsx`, `TombstoneItem` (R8.6, design line 531).
- **Problem:** The open "Seal the grave" Card is rendered inside the `bg-fog/95 p-2` plate, so it gets an extra 8 px plate frame. Because an open item spans the full row, at 1280 px the plate is about 1120 px wide with its two buttons at the left, under a centred stone.
- **Fix:** Render `HelperPanel` as a sibling after the plate, still inside the `li`.

**5. Nit (please verify): the switch knob is drawn on the checkbox itself**
- **Where:** `memory-panel.tsx`, `SWITCH_CLASSES`.
- **Problem:** The knob is a `before:` pseudo-element on the `<input>`. Not every browser draws pseudo-elements on an `<input>`, even with `appearance: none`; Firefox is the main one to check. Where it isn't drawn, the knob disappears and on/off is shown only by the moss fill.
- **Fix:** Check in Firefox and WebKit. If the knob is missing, draw the track and knob as a sibling `span` next to an `appearance-none` input, styled with `peer-checked:`. Keep the native checkbox, its `data-focus`, its change handler and its `aria-describedby`.

**6. Nit: the 1600 px four-column grid is never tested**
- **Where:** `e2e/pro-polish.spec.ts`, "graveyard grid" (R7.2).
- **Problem:** Only three columns at 1280 px is tested. R7.6 only asks for that, but R7.2 also promises four columns at 1600 px.
- **Fix:** Add the same same-row check with four restored records at 1600×900.

**7. Nit: duplicate notes and a wrong file name in the earlier-spec notes**
- **Where:** `.kiro/specs/cancel-helper/requirements.md` and task 44 in `tasks.md` (R13.1).
- **Problem:**
  - The same pro-polish note appears both after R7.5 and at the end of Requirement 7.
  - R8.1 and R8.2 carry identical note text.
  - Task 44 names `landing-nits/requirements.md`, but the notes were (correctly) added to `landing-nits/bugfix.md`.
- **Fix:** Keep one copy of the R7 note, and correct the path in task 44.

**8. Nit: spacing changed on phones**
- **Where:** `rising-view.tsx`, root `gap-6` (R7.4).
- **Problem:** At 390×844 the gap between the summary Card and the Stage grew from 16 px to 24 px. R7.4 allows changes only to the components this spec restyles.
- **Fix:** Use `gap-4 lg:gap-6`, or record the change in the design.

Verdict: approve after fixes

## Owner visual review (Claude Code screenshots, 390, 1280 and 1600)

V1. In the Memory panel, the "What is kept?" disclosure button text starts about 16 px right of the left edge of the text above it ("Kept only in this browser, on this device."), at 390, 1280 and 1600 px. Align its visible text with that left edge without shrinking its tap target below the spec's minimum (44 × 44 px), and keep the focus outline fully visible.

## Owner decisions for the fix round

- #1: add `lg:grid-rows-[auto_1fr]` to the grid and `lg:self-start` to the statement area; drop the sticky summary (R7.1 says MAY) and record that in design.md "Rising and Wide layout"; add the e2e gap check (≤ 32 px) at 1280×800 and 1600×900.
- #2: add the rows to design "Existing tests that change"; mark the `graveyard-view.test.tsx` ~line 570 waiting-chip row "owner approved 2026-11-21"; also add a row for the task 35 moon-count change (1 → 0) in `e2e/landing.spec.ts` if it is a test-text change not already recorded.
- #3: extend `clippedText` to top/bottom using `overflow-y`, and add the tombstone text-inside-section assertion.
- #5: check the switch knob with Playwright in Firefox and WebKit if those browsers are installed (install nothing); if the knob is missing or they are not installed, use the sibling `span` + `peer-checked:` approach anyway, so the knob does not depend on input pseudo-elements.
- #8: use `gap-4 lg:gap-6`.
- #4, #6, #7: as each "Fix:" says.

## Resolution

| Finding | Fix | Files | Verification |
| --- | --- | --- | --- |
| 1. Statement area far below the summary at lg | Grid gets `lg:grid-rows-[auto_1fr]`; summary and statement area get `lg:self-start`; the sticky summary (`lg:sticky lg:top-4`) is dropped (R7.1 "MAY"), recorded in design "Rising and Wide layout" | `graveyard/rising-view.tsx`, `design.md` | `rising-view.test.tsx` "… with no sticky summary"; PP "Try another statement sits right under the summary Card" at 1280×800 and 1600×900 (gap 0–32 px) |
| 2. Changed assertions not recorded | Rows added to design "Existing tests that change" for `graveyard-view.test.tsx` ~134, ~326–337, ~402–411, ~570 (marked "owner approved 2026-11-21"), `memory-panel.test.tsx` ~129 and the `rising-view.test.tsx` grid case; the task 35 moon row (`count === 0`) and the `landing-page.test.tsx` svg-count row were already recorded | `design.md`, `tasks.md` (task 35 text) | Read against the diff |
| 3. Size check misses vertical clipping | `clippedText` also compares top and bottom with the nearest ancestor below `body` whose `overflow-y` is not `visible`; the Graveyard size case asserts every text range of each list tombstone lies inside its `section` box; design test row updated | `e2e/content-boxes.ts`, `e2e/pro-polish.spec.ts`, `design.md` | PP "sizes" (10 cases) pass |
| 4. Helper panel inside the actions plate | `HelperPanel` renders after the plate, still inside the `li` | `graveyard/graveyard-view.tsx`, `design.md` | `graveyard-view.test.tsx` (locator row recorded); LY "open Helper panel is wide" passes |
| 5. Switch knob on an `<input>` pseudo-element | Firefox and WebKit are not installed (only Chromium), so per the owner decision the knob and track are `aria-hidden` sibling spans styled with `peer-checked:` next to a `peer appearance-none` checkbox; `type`, `data-focus`, change handler and `aria-describedby` kept | `graveyard/memory-panel.tsx`, `design.md`, `e2e/pro-polish.spec.ts` | `memory-panel.test.tsx`; PP "the Memory switch knob moves" (16 px knob, 4 px inset, moves 20 px) in Chromium |
| 6. 1600 px four columns untested | Added the four-record same-row check at 1600×900. It exposed a bug: Tailwind sorts `min-[1600px]` before `lg`, so `lg:grid-cols-3` won at 1600 px. The class is now `min-[100rem]:grid-cols-4` (100 rem = 1600 px in a media query), recorded in design | `e2e/pro-polish.spec.ts`, `graveyard/graveyard-view.tsx`, `design.md` | PP "four tombstones share the first row at 1600x900" and "three … at 1280x800" pass |
| 7. Duplicate notes, wrong path | One R7 note in cancel-helper; R8.1 and R8.2 notes differ; task 44 names `landing-nits/bugfix.md` | `cancel-helper/requirements.md`, `design.md`, `tasks.md` | Read |
| 8. Phone gap grew to 24 px | Root `gap-4 lg:gap-6` | `graveyard/rising-view.tsx`, `design.md` | `rising-view.test.tsx` grid case |
| V1. "What is kept?" text indented 16 px | The disclosure's wrapper sets `[&>button]:px-0`, so the button has no inline padding; `min-h-11 min-w-11` keep the 44 × 44 px target and the Card padding keeps the focus band visible | `graveyard/memory-panel.tsx`, `design.md` | `memory-panel.test.tsx` "removes the inline padding …"; PP "What is kept? lines up with the Memory short sentence" at 390×844, 1280×800, 1600×900 (≤ 1 px, ≥ 44 × 44 px, ≥ 5 px inside the Card) |

Checkpoint rerun: `npm run typecheck` and `npm run lint` pass; `npm test` 115 files / 2358 tests (core) and 89 files / 1438 tests (web) pass; `npm run build` passes; `npm run test:e2e --workspace @zombills/web` 193 passed, 1 skipped (`og-image.export.spec.ts`, opt-in export).
