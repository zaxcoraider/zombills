I reviewed `design.md` (1004 lines) against `requirements.md` and checked its claims in the current code: `drop-zone.tsx`, `undead-card.tsx`, `motion.ts`, `slice-page.tsx`, `burial-stage.tsx`, `rising-view.tsx`, `night-scene.tsx`, `graveyard-backdrop.tsx`, `page-state.ts`, `landing-motion.css`, the Framer Motion 14.14 gesture source and the existing tests. Every requirement maps to a design section, and the notes table covers every item of R13.1. All four signature moments can be built with Framer Motion using only transform and opacity, and all finish inside 5 s. Five problems would still break existing tests, contrast or the moments themselves.
Not applicable here: EARS wording (this is a design review), tasks.md traceability (there is no tasks.md yet), and checklist item 8 (no code yet). Money and regex: nothing to report. The design adds no new money arithmetic (the progress bar's `answered / risen` is a count) and no new regex.
### Blockers
**1. The card sway never plays, and its e2e test passes without testing anything**
- **Where:** Signature moment 1, "Hover and focus settle"; R10.4, R10.7; `page-state.ts:250, 509, 524, 558`; `undead-card.tsx:122`.
- **Problem:** Each time a card is shown (entering results, Next, Skip, Answer now), the reducer moves focus to the card heading. The heading is inside the sway layer, so the bubbling `onFocus` sets `stilled = true` straight away. The sway is therefore cancelled for almost every card. The e2e test reads the transform at `t0 + 5.5 s` and finds identity because the sway never started, so it passes either way. The design's literal reading of R10.4 ("the card … has focus") produces this result.
- **Failing example:** Summon the US Sample. Adobe's heading gets focus at mount, `stilled` becomes true, and the rotation stays 0 for the whole card.
- **Suggested fix:** Settle only when a control inside the card receives `:focus-visible` (`event.target.matches("button:focus-visible")`), or when a non-touch pointer enters. Ignore focus on the heading (`tabIndex=-1`). Amend R10.4 to "any control inside it". In the e2e test, also assert the transform is not identity at `t0 + 2.5 s`, so the test proves the sway ran.
**2. Graveyard actions on the bare scene fail contrast and the design's own static check**
- **Where:** "Graveyard view and Memory", first and second bullets; "Colours and contrast"; R6.4, R9.2, R9.7, R12.4.
- **Problem:** The tombstone grid has no Card, and each item's "How to cancel" (secondary) and "Unbury" (quiet danger) sit under the ground line on the scene. "Back to the rising" / "Back to the start" (secondary) come after the Memory Card, apparently outside any Card.
  - On S (`#646567`), the quiet-danger text `#e27673` is about 1.97:1 (needs 4.5:1).
  - A 50 % bone outline on S is about 2.3:1 (needs 3:1).
  - The design itself says "Secondary controls never sit on the bare scene", and its one-primary static check requires an ancestor with `bg-fog`. That check would fail on the design's own markup.
- **Failing example:** Graveyard view with Netflix buried: "Unbury Netflix" text on the scene is about 1.97:1.
- **Suggested fix:** Put each tombstone's actions row on a small `bg-fog/95` plate (or the earth strip G, after checking the pairs on G). Put the back button inside the Memory Card or a closing Card. Add these pairs to `contrast.test.ts`.
**3. The new drop area is taller than the existing 128 px limit, and no amendment covers it**
- **Where:** "Statement panel", DropZone markup (`min-h-36` on `[role=button][data-focus=drop-zone]`); landing-polish R5.5; `e2e/landing.spec.ts:454-455`.
- **Problem:** The focusable drop area becomes at least 144 px tall. The existing assertion `toBeLessThanOrEqual(128)` will fail. landing-polish R5.5 has no change note, and the test is not in the "Existing tests that change" table.
- **Suggested fix:** Either keep the `role="button"` element at most 128 px (`min-h-32`, with the button's room counted inside it), or add a landing-polish R5.5 note and an amendment row that states the new exact bound.
**4. Reading another statement from results now loses focus, which breaks an existing test**
- **Where:** Decisions "Statement disclosure state" and the `statementSlot` approach; "Component tree, Non-landing views"; graveyard-ui R14.2; `graveyard-flow.test.tsx:233-260`.
- **Problem:** Today the gate is a stable sibling (`key="gate"`), so a Sample button keeps its DOM identity and focus through `working`. In the design:
  - On `results` the panel lives inside `RisingView`.
  - On `working` it moves to a separate open gate, so the element remounts and focus drops to `<body>`.
  - On the next `results` the disclosure resets to collapsed, so the chip is `hidden`.
  The test "Gate keeps focus: does not remount the Gate while another statement is read" asserts `getByRole(..., { name: UK_LABEL })` is the same element and still has `document.activeElement`. It will fail, and it is not in the amendment list. The same happens from the Graveyard view's gate.
- **Suggested fix:** Pick one of these and amend the test to state the new truth exactly:
  - Keep the disclosure mounted and open through `working` when the run started from inside it. Key its open state on "the run started here" rather than resetting on `working:main`.
  - Issue a focus request to the matching chip (`sample-chip:<fileName>`) or to the drop area in the `working` panel.
  Either way, add a note to graveyard-ui R14.2.
**5. The new "Free" line sits too close to the Primary action for an existing check**
- **Where:** "Fold and small screens"; R11.1, R11.6; `e2e/landing.spec.ts:389-397` (`checkFillAndGlow`); `landing-motion.css:42-47`.
- **Problem:** The existing check requires every text box outside the Primary action to be at least 18 px from it, because the candle glow (`0 0 14px 4px`) reaches about 18 px (landing-polish R9.7). The design puts `FREE_LINE` at `mt-2` (8 px). Since the parent column is `gap-4`, the real gap is 16 px, which still fails. The Fold arithmetic is also off: the shift is 16 + 24 = 40 px or more, not 32. At 390×844 and 414×896 the Privacy badge must still end above the Fold (landing-polish R3.7), and the design leaves that unverified.
- **Suggested fix:** Give `FREE_LINE` a gap of at least 24 px (`mt-2` on top of `gap-4`, or `pt-2`). Recompute the badge's bottom at 390×844 and 414×896 against the landing-polish measurements in the design. If it no longer fits, apply the stated fallback (same row as "Other samples:" from `sm`).
### Should-fix
**6. The Leave question closes on its own during a burial and strands focus**
- **Where:** Decision "Leave question state" ("closes when `model.view` … changes identity"); R1.4; graveyard-ui R14.2 ("Focus SHALL never be left on a removed element").
- **Problem:** During `burying`, `burial-step` actions change `view` with no user input, about every 0.5 s. If the user presses Home mid-burial, "Stay" gets focus, then the question unmounts and focus falls to `<body>`.
- **Suggested fix:** Close on a change of `view.kind` or `screen` only. When the question closes while focus is inside it, move focus to the Home control.
**7. "Open the graveyard" has no place on `error` and `no-subscriptions`**
- **Where:** "Statement panel"; R6.5 rows `error` and `no-subscriptions`; R12.6; `slice-page.tsx` (`showOpenGraveyard` inside today's gate).
- **Problem:** Today this button lives in the gate when the Graveyard has records. The new `StatementPanel` has no slot for it, and the `error` tab order in the design leaves it out.
- **Failing example:** Restored Graveyard, then a bad CSV gives `error`. There is no way to open the graveyard except Home.
- **Suggested fix:** Render it (secondary) inside the state Card after "Start again", or in the panel after the chips. Add it to the `error` and `no-subscriptions` tab orders.
**8. The amendment table misses existing tests that will fail**
- **Where:** "Existing tests that change"; R13.2, R13.3.
- **Missing rows:**
  - `slice-page.test.tsx:93-99` expects exactly 2 links, the two GitHub ones. It needs three, adding `KIRO_LINK`.
  - `graveyard/share-panel.test.tsx:293` clicks "Start again" on the Graveyard view. It must open "Try another statement" first.
  - `landing/landing-motion.test.tsx:51` clicks "Start again" on `results`. Same fix.
  - `graveyard-flow.test.tsx:233-260`, see finding 4.
- **Suggested fix:** Add a row for each, with the old and new locator or expectation.
**9. The one-primary test counts moss-filled decorations, not just controls**
- **Where:** P3, `one-primary.test.tsx`; R6.5, R6.7; "Progress dots".
- **Problem:** The test counts every element whose `classList` contains `bg-moss`. The filled Progress dots and the bar fill (`bg-moss`) are not controls. R6.5 speaks of controls, but R6.7's count takes any element.
- **Failing example:** `results`, `rested` after one answer: "Next" plus one filled dot gives a count of 2.
- **Suggested fix:** Count only interactive elements (`button, a[href], [role=button], input`) with `bg-moss`, and amend R6.7 to say so. Alternatively, draw the dots with an SVG `fill` and note that choice.
**10. The one-primary test reaches the wrong state for the "no undead" row**
- **Where:** `one-primary.test.tsx` row "no undead via a CSV of one-off charges".
- **Problem:** One-off charges give the `no-subscriptions` view, not `results` with zero risen subscriptions.
- **Suggested fix:** Use a CSV whose only subscription is `ended`, for example monthly charges from 2026-01 to 02 with a last transaction in 2026-05.
**11. The footer touch-tap test opens a GitHub tab**
- **Where:** Browser tests, "Peek … After a touch tap".
- **Problem:** Tapping "The Reaper" link opens a `target=_blank` popup to github.com. That is a real external navigation, which can be flaky in CI.
- **Suggested fix:** Tap the "Privacy note" tombstone, which is a button. Or `page.route("**/*github.com/**", r => r.abort())` and close the popup.
**12. The focus-ring test cannot work as written**
- **Where:** Browser tests, "Focus ring not covered".
- **Problem:** The ring is a box-shadow drawn outside the control's border box. `elementFromPoint` at the ring's corners will never return the control or one of its descendants, so the test fails every time.
- **Suggested fix:** Assert two things instead. First, the `[data-peek-ghost]` and `[data-stone-face]` boxes stay inside the control's border box in the `peek` pose. Second, for points 2 px outside each edge, `elementFromPoint` returns no element from another tombstone.
**13. Footer stone labels overflow at 390 px with 200 % text**
- **Where:** "Signature moments: 4" (label `px-4`, `text-small`); R2.10, R12.9.
- **Problem:** At 390×844 with 200 % root font, each stone is about 171 px wide. `px-4` becomes 32 px a side, leaving 107 px. "Zombills" at 28 px semibold is about 130 px and cannot wrap.
- **Suggested fix:** Use `px-2` and `[overflow-wrap:anywhere]` on the label, and include this case in the 12.9 clip test.
**14. The taller Stage `Ground` covers the bottom of the card and catches clicks**
- **Where:** "Scene and Stage" (`Ground` height `calc(var(--ground-h) + 24px)`); `graveyard-backdrop.tsx` (`Ground` has no `pointer-events-none` and is painted after the sky div).
- **Problem:** The new 24 px band sits on top of the card's bottom padding and the tombstone base. It tints them and intercepts pointer events there.
- **Suggested fix:** Add `pointer-events-none`. Put the fade band behind the sky content (`-z-10` inside the isolated box), or keep the band below the line and fade upward with a separate `pointer-events-none` layer drawn before the sky.
**15. The new spacing and radius check fails on the design's own markup, and goes beyond the requirements**
- **Where:** "Design tokens", static check "Spacing and radius".
- **Problem:** The design's markup uses steps the check forbids: `pb-20` (drop area), `-ml-3` (peek ghost), and `px-3`, `-mb-3`, `-mb-7` (`burial-stage.tsx`, a restyled file). `undead-card.tsx` is restyled but keeps `rounded-2xl` and `rounded-xl`, which the design says stay. No requirement asks for this check, and it adds work to an 8-task budget.
- **Suggested fix:** Drop the spacing check, or limit it to the new files and allow-list `undead-card.tsx`. Fix the listed classes.
**16. The P3 property test may hit Vitest's 5 s timeout**
- **Where:** P3 in `one-primary.test.tsx` (100 runs, full Page render, up to 20 tombstones each).
- **Problem:** 100 full Page renders in jsdom with Framer Motion is likely to exceed Vitest's default 5 s per test.
- **Suggested fix:** Render `GraveyardView` with a derived `haunt` instead of the whole Page, and set an explicit per-test timeout. Keep the default number of runs, as R13.5 requires.
### Nits
17. **Disclosure heading size.** "Statement panel", `StatementDisclosure`: the tertiary variant's `text-small` on the `button` overrides the `h2`'s `text-lead`, so "Try another statement" renders at 0.875 rem. Add `text-[length:inherit]`, or leave `text-small` out of the variant when it is used in a heading.
18. **Ghost windows use rem, motion uses px.** Signature moments 3 and 4: at 200 % text the grave's ghost window (`h-12`) is 96 px while the ghost is a fixed 56 px moved by px values, so it shows in full at rest. The footer band doubles, and its 8 px peek no longer shows the eyes. Use px for the windows (`h-[48px]`, `pt-[16px]`, `top-[16px]`).
19. **Wrong assertion format.** Grave drag-over e2e: the computed `transform` is `matrix(1, 0, 0, 1, 0, 8)`, not `translateY(8px)`. Assert the matrix.
20. **Toggle target size.** The Memory toggle is 44×24 px, below the 44×44 of R12.5 (if a restyled control counts as new). Give the `label` `min-h-11` and say the label is the target.
21. **Tween not from the motion table.** `GRAVE_GHOST_RISE` and the peek tweens are not values from the `spooky-design.md` table, which R3.6 asks for. The table's springs settle after 400 ms, so the deviation is needed. Record it as a decision.
22. **Unreachable path.** No reducer path issues a `drop-zone` focus request while the disclosure is shown (`reset` and `back-to-start` both lead to the Landing view). Say so, and say how `statement.test.tsx` triggers the case.
23. **Width arithmetic.** "Fold and small screens": the grave at 320 px is about 256 px wide (inside the card's `p-4`), not 288 px. "Choose a file" still fits.
24. **Static variant check gaps.** The check reads `<button` and `<a` as text, so it misses `<motion.button` / `<motion.a>` and `{...v}` where `v = buttonVariant(...)` is assigned earlier. Either match `motion.` too and require the call to appear inline, or use an AST-based check.
Verdict: approve after fixes

## Resolution

All 24 findings accepted with the reviewer's suggested fixes. Where the review offered options, the choice keeps existing tests meaningful and adds the least new machinery.

| # | Decision | Where changed |
| --- | --- | --- |
| 1 | Settle only on a non-touch pointer or `button:focus-visible` inside the card; heading focus ignored. The e2e test also asserts a non-identity transform at `t0 + 2.5 s` | design: Signature moment 1 (timeline, "Hover and focus settle"), `undead-card.test.tsx` row, "Sway ends" e2e row; requirements: R10.4, R10.7 |
| 2 | Each tombstone's actions row on a `bg-fog/95` plate; the back button in a closing Card; contrast rows added | design: "Graveyard view and Memory", "Colours and contrast" |
| 3 | Option 1: the `role="button"` element stays at most 128 px (`min-h-32`, `pb-16`), so the existing bound holds with no amendment | design: Statement panel markup and "Drop-area height" paragraph, Signature moment 3 structure, "Fold and small screens" |
| 4 | Option 2: `start` gains an optional `from`; on `origin: "other"` it issues a `sample-chip` or `drop-zone` focus request that lands on the same-named control of the working panel. The "Gate keeps focus" test is amended and listed; graveyard-ui R14.2 note added | design: Decision "Focus while another statement is read", Page model, `statement.test.tsx` row, amendment table, notes table; requirements: R13.1 |
| 5 | `FREE_LINE` text box 24 px from the Primary action (`gap-4` + `mt-2`); shift recomputed as 48 px; 390 × 844 badge margin 78 px from the landing-polish figure; fallback kept | design: "Fold and small screens" |
| 6 | Close on a change of `view.kind` or `screen` only; focus moves to the Home control when the question closes with focus inside | design: Decision "Leave question state"; requirements: R1.4 |
| 7 | "Open the graveyard" (secondary) in the state Card after "Start again"; added to the `error` and `no-subscriptions` tab orders | design: Changed files, Component tree, tab-order list |
| 8 | Rows added for `slice-page.test.tsx:93-99`, `share-panel.test.tsx:293`, `landing-motion.test.tsx:51` and `graveyard-flow.test.tsx:233-260` | design: "Existing tests that change" |
| 9 | Count only interactive elements with `bg-moss` | design: `one-primary.test.tsx` row, P3; requirements: R6.7 |
| 10 | "No undead" row uses a CSV whose only subscription is `ended` | design: `one-primary.test.tsx` row |
| 11 | Touch tap on the "Privacy note" tombstone (a button) | design: Peek e2e row |
| 12 | Assert moving parts stay inside the control's border box, and that points 2 px outside each edge hit no other tombstone | design: "Focus ring not covered" e2e row |
| 13 | Label `px-2` and `[overflow-wrap:anywhere]`; covered by the 12.9 size test | design: Signature moment 4 |
| 14 | Earth `div` gets `pointer-events-none` and `-z-10` inside the isolated Stage; `GrassTufts` stays a later sibling. R5.6's Ground test is unchanged | design: "Scene and Stage", Signature moment 1 structure |
| 15 | Spacing check dropped; radius check kept with `undead-card.tsx` allow-listed; `pb-20` and `-ml-3` replaced in new markup | design: "Spacing scale", "Radius scale", New files (`design-tokens.ts`), Static checks |
| 16 | P3 renders `GraveyardView` alone with a derived `haunt`, 30 s timeout, default 100 runs | design: `one-primary.test.tsx` row, P3; requirements: R6.7 |
| 17 | `buttonVariant` option `inheritSize` drops `text-small`; the disclosure button uses it | design: Button variants, `StatementDisclosure`, `button-variants.test.ts` row |
| 18 | Ghost windows and Peek ghost in px (`pt-[48px]`, `h-[48px]`, `pt-[16px]`, `top-[16px]`, `h-[30px] w-[24px]`) | design: Signature moments 3 and 4, Statement panel markup |
| 19 | Assert `matrix(1, 0, 0, 1, 0, 8)` and `matrix(1, 0, 0, 1, 0, 32)` | design: Grave drag-over e2e row |
| 20 | The Memory `label` is `min-h-11` and is the toggle's target | design: "Graveyard view and Memory" |
| 21 | Recorded as a decision: the grave and peek tweens deviate from the motion table because its springs settle after 400 ms | design: Decision "Grave and peek tweens" |
| 22 | Stated that no user path reaches the case; the rule is a pure `disclosureFocusStep` tested in `statement.test.tsx` | design: Decision "Drop-area focus while collapsed", `statement.test.tsx` row; requirements: R13.4 |
| 23 | Content width at 320 px corrected to 256 px | design: "Fold and small screens" |
| 24 | Text check also matches `<motion.button` / `<motion.a` and requires an inline `{...buttonVariant(` call; one fixture per form | design: Static checks, "Variants" |
