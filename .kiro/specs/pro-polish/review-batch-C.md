# Batch C review (tasks 24-34)

Reviewer: spec-reviewer agent (Opus), 2026-11-19, against HEAD a8a4522. Owner + Claude Code visual review added V1. All findings accepted. Note: #11 is covered: the task 34 checkpoint ran the whole e2e suite (169 passed, 1 skipped); rerun it after the fixes.

I found no blockers and six should-fix items. The batch matches the design closely, the owner-approved changes are in place, and the root checks pass: typecheck and lint are clean, and the web suite passes (88 files, 1,375 tests). I could not run `npm run test:e2e` because this session can't approve the command, so the new "sway ends" Playwright test, the Fold checks and the 320/390 layout checks are not verified by me.

Checklist items that don't apply here: EARS wording and real-world CSV data (no requirement text or parsing changed), and money (no amount arithmetic changed). I found no new network, storage or cookie use.

## Should-fix

**1. The answer block lingers for 150 ms after the burial starts, as a live second primary**
- **Where:** `graveyard/undead-card.tsx:303-345`; R6.3, R6.5 (`burying` row), R12.5.
- **Problem:** When the phase changes to `condemned`, `AnimatePresence mode="wait"` plays the exit fade (`REDUCED_FADE`, 0.15 s). The exiting copy keeps its old props: `aria-disabled={!deciding}` is still `false`, and "No, bury it" still carries `data-variant="primary"` and `bg-moss`. Meanwhile "Next" (primary, `aria-disabled`) has already appeared below the Stage. For 150 ms there are two primaries and three focusable answer buttons that look active but do nothing. R6.3 says the block is hidden once the phase is not `undead`. The tests miss this because they wrap the check in `waitFor`.
- **Failing example:** Bury Netflix, then query `[data-variant="primary"]` before the next animation frame. It returns 2. Pressing Tab from the stage container reaches "Yes, let it rest".
- **Suggested fix:** Give the ask block no exit when the card leaves to `condemned`. For example, use `exit={phase === "resting" ? { opacity: 0 } : undefined}` with `transition={{ duration: 0 }}`, or put `inert` on the exiting block (`useIsPresent()` false → `inert`, `aria-disabled="true"`). Then add a synchronous assertion straight after `rerender({ phase: "condemned" })`, without `waitFor`.

**2. The card test that proved the buttons are inert lost its clicks**
- **Where:** `graveyard/undead-card.test.tsx`, case "renders the answer block in undead and removes it in %s" (it replaced "keeps the buttons rendered but inert").
- **Problem:** The old case clicked each button in `condemned` and `sinking`, then asserted that `onRest`, `onBury` and `onSkip` were not called. The new case clicks nothing, so those three assertions can never fail. The `isDeciding()` live-phase guard on the exiting copy, which the code comment relies on, is now untested. The design row allows "buttons absent", but this removes a check instead of updating it to the new behaviour.
- **Failing example:** Delete `isDeciding() &&` from `onClick`. Every test still passes.
- **Suggested fix:** If finding 1 keeps any exit window, render with `skipAnimations` off and fake timers, call `rerender({ phase: "condemned" })`, click the still-mounted "No, bury it" and expect `onBury` not called. If finding 1 removes the window, assert absence synchronously right after the rerender.

**3. Progress dots are sized in rem and overflow at 390 px with 200 % text**
- **Where:** `graveyard/rising-view.tsx`, `ProgressMarks` (`h-2 w-2`, `gap-2`, `flex-nowrap`, `shrink-0`); R12.9, R10.2.
- **Problem:** At 200 % root font each dot and each gap is 16 px. Inside `main` (`px-4`) and the summary Card (`p-6`), a 390 px viewport leaves about 230 px. With 8 risen subscriptions the row needs 8 × 16 + 7 × 16 = 240 px. It can't wrap or shrink, and no ancestor clips it, so the page scrolls sideways. The R12.9 browser test uses the US Sample (4 dots, 112 px), so it misses this.
- **Failing example:** A statement with 8 to 12 active subscriptions at 390 × 844, root font 200 %, gives `scrollWidth > innerWidth`.
- **Suggested fix:** Use fixed pixel sizes (`size-[8px]`, `gap-[8px]`, so 12 dots are always 184 px), or switch to the bar when the row is wider than its container. Add an R12.9 case with 12 risen at 390 × 844 and 200 %.

**4. The danger variant looks the same when `aria-disabled`**
- **Where:** `slice/button-variants.ts`, `danger` and `danger-quiet`; R6.2.
- **Problem:** R6.2 asks every variant for an `aria-disabled` look that keeps 4.5:1. Primary changes its fill, secondary dims to bone 70 % with a 45 % outline, and tertiary drops its underline. Danger only switches off its hover fill and changes the cursor. So "Forget everything" and "Forget", which are `aria-disabled` during the tombstone rise (graveyard-memory R8.6), look fully active.
- **Failing example:** Use "Bury after all" on a Kept record, then look at "Forget everything" during the rise. Its outline and text are unchanged.
- **Suggested fix:** Add `aria-disabled:border-blood/60` (still at least 3:1 on C, or treat it as an inactive control) and a dimmer text mix that stays at least 4.5:1 on C. Add those pairs to `contrast.test.ts`.

**5. The P4 property can't reach the "more than 12" case**
- **Where:** `logic/progress-dots.property.test.ts`; `logic/test-arbitraries.ts:579-581` (`pageOutcomeArb` `maxLength: 12`); R10.3.
- **Problem:** `pageModelArb` never produces more than 12 risen subscriptions, so the `expect(dots).toBeNull()` branch never runs. Only one unit test covers 13.
- **Failing example:** Change `PROGRESS_DOTS_MAX` to 13 in `progress-dots.ts`. The property still passes.
- **Suggested fix:** In this property, use an outcome arbitrary with `maxLength: 16` (for example `fc.uniqueArray(pageSubscriptionArb, { maxLength: 16, … })`), or `fc.oneof` the existing arbitrary with a 13-to-16 one. Assert the generator produces both sides of 12.

**6. The cancel link is no longer underlined, but cancel-helper R8.8 still says it is**
- **Where:** `graveyard/cancel-helper.tsx` (`ExternalLink` now uses `buttonVariant("secondary")`); cancel-helper R8.8; pro-polish R13.1.
- **Problem:** The owner approved this look. But cancel-helper R8.8 still reads "the external links SHALL be underlined", and the R13.1 list of notes has no entry for it. The specs and the code now disagree. The outline still gives a non-colour cue, so this is not an accessibility failure.
- **Suggested fix:** Add to R13.1: "cancel-helper Requirement 8.8: the cancel link and App-store links are secondary buttons (outlined), not underlined text." Then add the note to the cancel-helper spec.

## Nits

**7. "Next" below the Stage lacks `BARE_FOCUS`**
- **Where:** `rising-view.tsx:258-266`; R6.2.
- **Problem:** "Next" sits on the bare scene in the `rested` and `burying` stages, but uses `buttonVariant("primary")` without `bare`, so it gets the global ring.
- **Suggested fix:** Use `buttonVariant("primary", { bare: true })`.

**8. The variants scan skips an `<a>` that spreads a variable**
- **Where:** `static-checks.test.ts`, `variantOffences`.
- **Problem:** An `<a>` is checked only when its tag literally holds `min-h-11` or `rounded-control`. `<a href=… {...v}>` is never checked, though the design says "spreading a variable is reported".
- **Suggested fix:** Also check an `a` tag that contains any `{...` spread, and add a fixture for it.

**9. No test compares the Live region text**
- **Where:** `rising-view.test.tsx`, Progress dots cases.
- **Problem:** Task 32 asks for "the Live region text is unchanged". The test only checks that the dots row has no `aria-live`.
- **Suggested fix:** Compare the Page's `role="status"` text before and after the dots render, for example after one Keep.

**10. The design's "Choose a file" contrast row is out of date**
- **Where:** `drop-zone.tsx:124-130`; design "Colours and contrast".
- **Problem:** The secondary variant is `bg-transparent`, so "Choose a file" now sits on the pit P instead of on `--fog`. Contrast still passes on P (11.63, as the design itself lists), so only the design row's background column is wrong.
- **Suggested fix:** Change the row to "bone on P; outline bone 50 % over P".

**11. The browser checks still need a run**
- **Where:** Task 34 checkpoint.
- **Problem:** I could not run the e2e suite (see the top). The Privacy badge button is now `px-4 font-semibold` (it was `px-2`), which could affect landing-polish R7.3 (one line from 640 px) and the 320×568 Fold check.
- **Suggested fix:** Run `npm run test:e2e --workspace @zombills/web` and record the result before committing.

Verdict: approve after fixes

## Owner visual review (Claude Code screenshots, 1280 and 390)

V1. The "Try another statement" disclosure button sits about 16 px right of the content column on results, buried and the Graveyard view (390: x 33 vs 16; 1280: 352 vs 336), most likely the tertiary variant's horizontal padding. Align its visible text with the left edge of the Cards above (e.g. negative margin equal to the padding, or no horizontal padding for this button) while keeping the 44 px target and the focus ring fully visible. Add a Playwright check at 390x844 that its text box left edge equals the summary Card's left edge within 1 px.

## Resolution

Task 34.1. Paths are under `apps/web/src/` unless they start with `.kiro/` or `e2e/`.

| Finding | What changed | Files | Tests |
| --- | --- | --- | --- |
| 1 | In `condemned` and `sinking` the card renders no `AnimatePresence` for the answer block, so the block unmounts in the same render with no exit fade. The answer block is now `AskBlock`; while it fades out after "Yes, let it rest" (`useIsPresent()` false), its buttons get `aria-disabled="true"` and `tabIndex={-1}`, and their handlers still read the live phase. | `slice/graveyard/undead-card.tsx` | `undead-card.test.tsx` "renders the answer block in undead and removes it in %s" now asserts absence and zero `[data-variant="primary"]` synchronously after `rerender`, with no `waitFor` |
| 2 | Added real click checks. With animations on and fake timers, after `rerender({ phase: "resting" })` the exiting copy is still mounted: each of the three buttons is `aria-disabled="true"` and `tabindex="-1"`, and clicking it calls none of `onRest`, `onBury` or `onSkip`. The `condemned` and `sinking` case asserts absence synchronously, as the suggested fix asks. | `slice/graveyard/undead-card.test.tsx` | New case "keeps the fading answer block inert after 'Yes, let it rest'"; the existing case is made stricter (no assertion removed) |
| 3 | Progress dots now use fixed pixel sizes (`h-[8px] w-[8px]`, `gap-[8px]`), so 12 dots take 184 px at any text size. | `slice/graveyard/rising-view.tsx` | `rising-view.test.tsx`: pinned `gap-2` replaced by the exact `gap-[8px]`, each dot checked for `h-[8px]` and `w-[8px]`. New e2e case `e2e/pro-polish.spec.ts` "12 Progress dots cause no sideways scroll at 390x844 with 200% text": 12 dots, row about 184 px wide, `scrollWidth <= innerWidth` |
| 4 | `danger` and `danger-quiet` now have an `aria-disabled` look: `aria-disabled:border-blood/80` (3.22:1 on C, below the 4.33 and 3.48 rest outlines) and the danger text mix at 90 % (4.55:1 on C). I used 80 % rather than the suggested 60 % because 60 % gives only 2.35:1 and R6.4 asks every variant outline for at least 3:1. New tokens `DANGER_DISABLED_OUTLINE_ALPHA = 0.8` and `DANGER_DISABLED_TEXT_ALPHA = 0.9`. | `slice/button-variants.ts`, `slice/logic/design-tokens.ts` | `button-variants.test.ts`: both classes listed for both variants and matched to the exported alphas. `contrast.test.ts`: disabled danger text at least 4.5:1, and a new case for the disabled outline (at least 3:1, and lower than the rest outline). The rest assertions are unchanged |
| 5 | P4 now draws from `fc.oneof(pageModelArb, pageModelOver(manyRisenOutcomeArb))`. `manyRisenOutcomeArb` gives 13 to 16 active subscriptions. `pageModelArb` is rebuilt on the new `pageModelOver` helper, so it produces the same models as before. The property compares against the literal 12 of R10.3, so it fails if the constant drifts: with `PROGRESS_DOTS_MAX` set to 13, the property fails. | `slice/logic/test-arbitraries.ts`, `slice/logic/progress-dots.property.test.ts` | New case "the generator reaches both sides of the 12-dot limit" (`fc.sample`, 200 runs, seed 1); P4 is otherwise unchanged |
| 6 | Added the R13.1 note "cancel-helper Requirement 8.8: the cancel link and App-store links are secondary buttons (outlined), not underlined text.", plus the matching "(Changed by pro-polish: …)" note under cancel-helper R8.8. | `.kiro/specs/pro-polish/requirements.md`, `.kiro/specs/cancel-helper/requirements.md` | None (spec text only) |
| 7 | "Next" and "Visit the graveyard" below the Stage use `buttonVariant("primary", { bare: true })`. | `slice/graveyard/rising-view.tsx` | `rising-view.test.tsx` burying case also asserts `BARE_FOCUS` on "Next" |
| 8 | `variantOffences` also checks any `<a` or `<motion.a` whose tag holds a `{...` spread. | `static-checks.test.ts` | Fixtures `<a href="#x" {...v}>` and `<motion.a href="#x" {...props}>` are each reported. The real-source scan still passes |
| 9 | Live region check through the Page: summon the US Sample, Keep the first card, wait for one filled dot, then expect the `role="status"` text to be exactly `${name} rests. Kept.`. | `slice/graveyard/rising-view.test.tsx` | New case "leaves the Live region text unchanged when a dot fills (Req 12.10)" |
| 10 | Design row changed to: `--bone`; outline `--bone` 50 % over P, on P, 11.63; 4.07. | `.kiro/specs/pro-polish/design.md` (this row only) | `contrast.test.ts`: new case "'Choose a file' as the secondary variant on P", covering text and outline at rest and `aria-disabled` |
| 11 | Ran the whole e2e suite after the fixes: 171 passed, 1 skipped. | — | — |
| V1 | The Statement disclosure's `h2` sets `[&>button]:px-0`, which removes the tertiary variant's inline padding from this one button. Its text now starts at the Card edge. `min-h-11 min-w-11` keep the 44 px target, and the button stays 16 px from the viewport edge, so the 5 px focus band is fully visible. | `slice/statement/statement-disclosure.tsx` | New e2e case "Try another statement lines up with the summary Card at 390x844": the text range's left edge is within 1 px of the Card's left edge, the box is at least 44 × 44, and `x >= 5` |

The two disabled-danger contrast rows from #4 were added to the design's "Colours and contrast" table after task 34.1.
