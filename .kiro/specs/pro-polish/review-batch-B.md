# Batch B review (tasks 17-23)

Reviewer: spec-reviewer agent (Opus), 2026-11-19, against HEAD aa4f359. Owner + Claude Code visual review added V1-V3. All findings accepted.

I found five should-fix issues and four nits in Batch B (tasks 17–23), and no blockers. Privacy and CSP, reduced motion, the 5 s rule and the disclosure basics hold up.

I could not run `npm run typecheck`, `npm run lint`, `npm test` or the Playwright run, because this session can't approve shell commands. Everything below comes from reading `git diff HEAD` (aa4f359), the new `statement/` files, requirements.md and design.md. Two findings (#5 and #8) need a browser run to confirm.

**What holds:**
- **Privacy and CSP:** no new request, storage or dependency; `csp-plugin.ts`, `netlify.toml`, `package*.json` and `packages/core` are untouched; the SVG uses only inline `style` and `useId` fragments.
- **Motion:** every grave leg ends within 0.3 s, there is no automatic motion, and under reduced motion only the glows fade (`REDUCED_FADE`).
- **Disclosure:** `aria-expanded`/`aria-controls`, `hidden` content, reset by view key, stays open across a card answer, and the chevron has no transition.
- **Drag and drop:** the wrapper holds the drag handlers, a drop on "Choose a file" is read, and the depth counter survives moving onto the button.
- **Existing tests:** the amendments match the design's table plus the owner-approved changes. I found none removed or widened. The `graveyard-flow` same-element assertion is replaced as design line 924 specifies.

## Findings

**1. Should-fix: "Start again" is gone from the Graveyard view when it was opened from `error` or `no-subscriptions`**
- **Where:** `slice-page.tsx`, `const showStartAgain = hasStatement;` (HEAD had `hasStatement || (onGraveyard && view.kind !== "idle" && !working)`). Breaks R1.9, R3.7, the R6.5 Graveyard row and the design tree line 91 ("+ Start again (when shown)").
- **Problem:** `open-graveyard` keeps `view.kind === "error"` or `"no-subscriptions"`. On that Graveyard view the disclosure now holds no "Start again". This is a behaviour change with no design entry, and the new code comment ("results is the only view kind with a statement besides idle") is false.
- **Example:** restored Graveyard → drop `notes.txt` (error) → "Open the graveyard" → open "Try another statement". HEAD showed "Start again"; now there is none.
- **Fix:** restore `showStartAgain = hasStatement || (onGraveyard && view.kind !== "idle" && !working)`. Add a case to `statement.test.tsx`: from `error` with records, open the graveyard, open the disclosure, and "Start again" is inside the body.

**2. Should-fix: the drop area's `role="button"` does nothing on click or tap, so "Tap to choose a CSV statement" is untrue**
- **Where:** `drop-zone.tsx`; the `role=button` div has only `onKeyDown` and `onKeyUp`. Breaks R3.14, R12.5 and the `spooky-design.md` "facts only" tone rule.
- **Problem:** this predates the batch, but R3.14 now tells touch users to tap the grave. Tapping the text does nothing. VoiceOver and TalkBack activate controls with a synthetic `click`, so screen-reader users activating "Drop area: choose or drop a CSV statement" also get nothing.
- **Example:** 390×844 touch emulation: tap "Tap to choose a CSV statement" and no picker opens. Double-tap the drop area with VoiceOver and nothing happens.
- **Fix:** add `onClick={openPicker}` to the `role=button` element; `openPicker` already guards `disabled`. Add a component test that a click opens the picker and that it does nothing while `aria-disabled`.

**3. Should-fix: the focus handover depends on `gateHasFocus()`, which the design does not have**
- **Where:** `slice-page.tsx` `onGateFiles` and `onGateSample` (`gateHasFocus() ? from : undefined`), against the design Decision "Focus while another statement is read", task 21, R12.5 and graveyard-ui R14.2.
- **Problem:** the design says the chips and the drop area always dispatch `from`. The implementer added the condition (comment: "the Leave question, say"). In Safari, and Firefox on macOS, a mouse click does not focus a `<button>`, so a chip click sends no `from`. A drag-and-drop never moves focus either, so a drop also sends no `from`. If focus was on "Next" inside `RisingView`, that element unmounts on `working` and focus falls to `<body>`. The jsdom test hides this: it calls `chip.focus()` before `fireEvent.click(chip)` (statement.test.tsx around line 716).
- **Example:** Safari: open the disclosure, click the "UK bank statement" chip; `document.activeElement` is `body` during `working`. Any browser: focus "Skip for now", drag a file onto the open grave, and focus is lost when `RisingView` unmounts.
- **Fix:** always pass `from`, and skip it only when `document.activeElement` is inside the Leave question (the case the comment worries about). Add a test that clicks a chip without `focus()` first, and one that drops a file while focus is on a Rising control. Record the choice in design.md.

**4. Should-fix: the grave outline's contrast test checks the wrong neighbour, and the outline has gaps at the corners**
- **Where:** `contrast.test.ts`, "the grave outline, bone 50 % over G, against C", and `grave-art.tsx`, the outline rect at `x=1 y=1 98×98` inside a `rounded-card` clip. Affects R3.4 and R12.4.
- **Problem (contrast):** the outline sits at a 1 % inset on the earth rect, so G is on both sides of the stroke (G runs 0–6 %). It touches the card C only through a 1–2.6 px sliver. The meaningful 1.4.11 pair is outline against G, and the test doesn't check it.
- **Problem (corners):** with a 16 px radius clip, the square stroke is cut away for about 10 px along the top and bottom and about 7 px along the sides at each corner (128 px tall, 256 px wide grave). The outline draws as four separate segments.
- **Fix:** add `contrast(over(G, bone, 0.5), G) >= 3`. Draw the outline and the rim glow as CSS on the clip `div` instead: a `border-2` with `color-mix(in oklab, var(--bone) 50%, transparent)` and `rounded-card`, plus a `motion.div` moss border fading 0↔1. That follows the rounded corners.

**5. Should-fix (needs a browser check): "Choose a file" may stick out of the grave at 390×844 with 200 % text**
- **Where:** `drop-zone.tsx`, the button `absolute … -translate-x-1/2 whitespace-nowrap`. Affects R3.5 ("SHALL sit inside the Grave drop area's box") and R12.9.
- **Problem:** at 200 % root size the button is roughly 13 characters × about 17.6 px + 64 px padding ≈ 290 px. The grave is about 262 px wide (390 − 64 page padding − 64 Card padding). The button would spill about 15 px past each side of the grave and sit over the Card padding. It probably causes no sideways scroll, but it breaks R3.5.
- **Fix:** replace `whitespace-nowrap` with `max-w-[calc(100%-2rem)] text-center`. Add a Playwright assertion at 390×844 / 200 % that the button's box is inside `.grave`'s box.

**6. Nit: the contrast rows don't match today's button classes, and the chips have no outline row**
- **Where:** `contrast.test.ts`, "'Choose a file' in the pit".
- **Problem:** the row models a 50 % bone outline on P. The code has `border-bone` (full) on a `bg-fog` fill, plus `aria-disabled:opacity-60`. The Sample chip outline (`border-bone/50` on `bg-fog`, against C) has no row, although R12.4 lists button outlines.
- **Fix:** add a row for the chip outline (bone/50 over fog, against C, ≥ 3). Note that the "Choose a file" row anticipates task 25's secondary variant, or test today's pair.

**7. Nit: the "a window dragenter while working does nothing" test cannot fail**
- **Where:** `statement.test.tsx`, around lines 746–762.
- **Problem:** during `working` no disclosure is rendered, and the `working → results` key change resets `statementOpen` anyway. The test passes even if the listener ignores `working`. The `!working` condition is also unobservable today, because `start` always sets `screen: "main"`.
- **Fix:** test the gating directly (export `openOnDrag` as a pure predicate, or assert the listener isn't registered while `working`), or note in the test that it guards future paths.

**8. Nit: fixed `waitForTimeout(400)` in the grave drag-over e2e test risks flakes in CI**
- **Where:** `e2e/pro-polish.spec.ts`, "grave drag-over".
- **Problem:** Framer Motion runs on rAF. A 0.3 s tween can still be in progress at 400 ms on a loaded CI runner.
- **Fix:** after the 400 ms the spec asks for, use `await expect.poll(() => transformOf(ghost), { timeout: 2000 }).toBe(GHOST_RISEN)`, and the same for the opacity reads.

**9. Nit: chips keep `hover:border-moss` and have no disabled look while `aria-disabled`**
- **Where:** `sample-chips.tsx`.
- **Problem:** during `working`, hovering a chip still lights it moss, which looks like an active control.
- **Fix:** add `aria-disabled:hover:border-bone/50 aria-disabled:opacity-…` (keeping text at 4.5:1), or record that task 25 covers it.

## Checklist items that don't apply
- **EARS form, money, real-world CSV data:** this batch is UI only and touches no amounts or parsing.
- **Properties:** task 21 lets the property arbitraries draw `from` but doesn't require it; they are unchanged, which is allowed.
- **Traceability:** every requirement cited by tasks 17–22 has code and tests; no task cites a criterion that doesn't exist.
- **Batch A files:** none of the files task 16 lists changed, and `sample-buttons.tsx` is deleted with no importer left.

Verdict: approve after fixes

## Owner visual review (Claude Code screenshots, 1280 and 390)

V1. At rest the ghost shows only a cream half-circle with no eyes, so it reads as a blob. Change GRAVE_GHOST_REST_Y so the top 24 px show at rest (crown plus most of both eyes); keep the risen position and timings. Update design.md section "3. The grave drop zone ghost" (rest y and "top N px show") and any test pinning the old value to the new exact value.
V2. The grave reads as a plain box: the pit is inset by viewBox percentages with preserveAspectRatio none, so at 1280 px the side margins are ~55 px but the bottom ~6 px, and the pit has square corners inside a rounded frame. Make the pit an even fixed inset (12 px on all sides, e.g. a positioned div or CSS instead of the stretched SVG rects) with a rounded corner radius that nests inside rounded-card, and make the earth ring around the pit read as earth (a visibly different tone from the Card, contrast-tested if it carries meaning; otherwise decorative). Keep the pit gradient and pit glow.
V3. On drag-over two green rings show at once (an outer rounded one and an inner square one, offset). After reviewer #4's CSS border fix there must be exactly ONE outline and ONE moss rim glow, both following the rounded-card corners. Find and remove the source of any second ring.


## Resolution

Task 23.1, 2026-11-19. Paths are under `apps/web/src/` unless they say otherwise.

| Finding | What changed | Files | Tests |
| --- | --- | --- | --- |
| 1 | `showStartAgain` restored to `hasStatement \|\| (onGraveyard && view.kind !== "idle" && !working)`; the false comment replaced. | `slice/slice-page.tsx` | New: `statement.test.tsx` "the Graveyard view opened from error keeps Start again inside the disclosure". |
| 2 | `onClick={openPicker}` on the `role=button` element; `openPicker` already returns early while disabled. | `slice/drop-zone.tsx` | New: `statement.test.tsx` "opens the picker on a click or tap, and not while aria-disabled" (focus kept). |
| 3 | `gateHasFocus()` and `gateRef` removed. The gate always passes `from`, and skips it only when focus is inside the open Leave question (`focusInLeaveQuestion()`). Decision recorded in design.md, "Focus while another statement is read". | `slice/slice-page.tsx`, `.kiro/specs/pro-polish/design.md` | New: `statement.test.tsx` "clicking the UK chip without focusing it first…" and "dropping a file while focus is on a Rising control…". |
| 4 | The outline and rim glow are CSS borders on the grave's `rounded-card` edge (`data-grave-outline` `border-2` bone 50 %; `data-rim-glow` `motion.div` `border-[3px]` moss), not SVG rects, so they follow the corners. Outline contrast is now tested against its real neighbours. | `slice/statement/grave-art.tsx`, `contrast.test.ts` | `contrast.test.ts` "the grave outline, bone 50 % over E, against E and against C" (4.31, 4.20); the rim glow row adds E (9.40). |
| 5 | "Choose a file" uses `absolute inset-x-4 bottom-4 mx-auto w-fit text-center`, with no `whitespace-nowrap`, so it wraps inside the grave. `max-w-[calc(100%-2rem)]` was tried first, but with `left-1/2` it halves the shrink-to-fit width, and the label wrapped and covered the drop text at 320 px (caught by `landing.spec.ts` "landing moon 320x568 empty"). | `slice/drop-zone.tsx` | New Playwright: `e2e/pro-polish.spec.ts` "Choose a file sits inside the grave at 390x844 with 200% text"; unit check of the classes in `statement.test.tsx`. |
| 6 | The "Choose a file" row now tests today's pair: bone text on `bg-fog`, the full `border-bone` against P and against the fill, and the `aria-disabled` opacity 60 % text. New chip row: bone 50 % over fog against C (4.14) and against fog. | `contrast.test.ts` | The rows of the same names. |
| 7 | The window-drag gate is now a pure `openOnWindowDrag(types, shown, open, working)`, used by the listener and its registration. The Page test notes that it guards future paths. | `slice/statement/statement-disclosure.tsx`, `slice/slice-page.tsx` | New: `statement.test.tsx` "openOnWindowDrag" (the `working`, open, not shown, and no-files cases). |
| 8 | After the 400 ms wait, the ghost transform and rim opacity reads use `expect.poll` with a 2 s timeout. | `e2e/pro-polish.spec.ts` | "grave drag-over" tests. |
| 9 | The chips gain `aria-disabled:opacity-60 aria-disabled:hover:border-bone/50`. Disabled text over C is still at least 4.5:1. | `slice/statement/sample-chips.tsx`, `contrast.test.ts` | `statement.test.tsx` disabled-chip case asserts the classes; `contrast.test.ts` "a Sample chip while aria-disabled". |
| V1 | `GRAVE_GHOST_REST_Y` is 32 → 24, so the top 24 px (crown and most of both eyes) show at rest. The risen y (8) and the timings are unchanged; the rise is now 16 px. | `slice/graveyard/motion.ts`, design.md section 3 | `graveyard/motion.test.ts` pins 24; `e2e/pro-polish.spec.ts` `GHOST_REST` is `matrix(1, 0, 0, 1, 0, 24)`. |
| V2 | The pit is a CSS box at an even 12 px inset (`inset-3`) with a 4 px radius (16 − 12), keeping the pit gradient and pit glow. The earth ring is `GRAVE_EARTH = color-mix(in oklab, var(--night) 85%, var(--ember))` (`#271f1d`), a warm brown set apart from the cool Card; it is decorative. The pit has no ids and no `url()`. | `slice/statement/grave-art.tsx`, `slice/drop-zone.tsx`, design.md section 3 | `statement.test.tsx` "GravePit draws an even 12 px pit inset…", "GravePit uses no id and no url() reference", and the art-element cases (the pit is now a `div`); `contrast.test.ts` "E has the design's value…"; Playwright measures insets of `[12, 12, 12, 12]`. |
| V3 | There were two rings: the SVG rim glow (square, inside the clip) and the drop area's own `:focus-visible` outline (rounded, 2 px outside). Now there is one CSS rim glow on the rounded edge, and the drop area's outline is hidden only while dragging (`group-data-[dragging=true]/grave:outline-none`); the rim glow stands in for it. | `slice/drop-zone.tsx`, `slice/statement/grave-art.tsx`, design.md section 3 | `statement.test.tsx` "hides the drop area's own focus ring only while a file is over the grave"; Playwright "one outline and one moss rim glow…" (focused drop area plus drag: exactly `graveOutline` and `rimGlow`, both 16 px radius). |

design.md line 577 (`GRAVE_GHOST_REST_Y`), the e2e grave drag-over row and the "Colours and contrast" rows "'Choose a file' text and outline in the pit", "Grave outline" and "Chip outline" were updated after task 23.1.
