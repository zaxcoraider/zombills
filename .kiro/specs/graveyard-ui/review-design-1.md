# Review: graveyard-ui design (review 1)

Reviewer: Kiro custom agent `spec-reviewer` (Opus 5.5), 2026-11-15. Findings copied verbatim below; resolution table appended after fixes.

I found one blocker in the design (focus after "Yes, let it rest" fails in a real browser) and eleven should-fix items. Most of the should-fix items are focus targets that can't be found, tests that would be wrong or flaky, and coverage gaps. I couldn't run any shell commands (tool permission was refused), so everything below comes from reading the files.

**Checks that hold:**
- **framer-motion:** version 14.14.0 is installed. `dist/index.d.ts` re-exports `MotionGlobalConfig` from `motion-utils`, which declares `skipAnimations?: boolean`.
- **Contrast, computed from the `index.css` hex values with the formula in `contrast.test.ts`:** `--blood` on `--fog` is **4.53:1**. The design is right; the spike comment in `spike/undead-card.tsx` ("4.3:1") is wrong. The other ratios in the design's table also check out: moss/fog 9.58, ember/fog 7.40, spectre/fog 6.79, night/moss 11.30, bone/night 15.60.
- **Reducer state:** a double-click on bury is safe, because the second `bury` fails the stage `ask` guard. Start again, a new statement or "Open the graveyard" mid-burial keeps the record and settles it. Unbury mid-burial can't happen, because `open-graveyard` resets the stage to `ask`. Draining plus Counted savings equals the Currency total at every step, because the counter and Still-draining both read `settledGraveyard`.
- **Spike move and deletions:** the moves, the removal of the `src/spike/**` lint exemption, and the e2e CSP, request, console and storage checks are all kept.

## Findings

1. **Blocker.** Where: design "Undead card" (`KeptNote` "no longer focuses itself") and "Page shell" (focus effect "retries once on the next animation frame"); R4.3, R14.2.
   - Problem: the card uses `AnimatePresence mode="wait"`, so `KeptNote` only mounts after the "ask" block's 150 ms exit. The single retry one frame later (~16 ms) still finds nothing.
   - Failing example: a keyboard user presses Enter on "Yes, let it rest". Focus stays on the button, the button unmounts, and `document.activeElement` becomes `body`. Component tests hide this because `skipAnimations` ends the exit at once.
   - Fix: focus on mount. Each `data-focus` element gets a ref callback or effect that focuses itself when `model.focus` names it and its `seq` hasn't been handled yet. Or retry until the element appears, with a ~1 s cap. Add one test with `skipAnimations` off.

2. **Should-fix.** Where: transition table, rows `finish (results)` and `back-to-rising`; R14.2.
   - Problem: two cases have no focus target.
     - When Risen subscriptions exist but the Queue is empty, `finish` asks for `card-heading:undefined`.
     - When there are no Risen subscriptions, `back-to-rising` asks for `all-answered`, but the Rising renders "No undead here." (`state-heading`).
   - Failing example: answer all 4 US cards, then choose "US bank, signed amounts" again. No card mounts, focus is lost, and the event is `card(undefined)`.
   - Fix: on `finish`, use event `all-answered` and focus `all-answered` when the Queue is empty. On `back-to-rising`, focus `state-heading` when nothing is Risen. Add both to `page-state.test.ts`.

3. **Should-fix.** Where: "Page shell" focus effect (`CSS.escape`).
   - Problem: ids contain spaces, `:`, `/` and `*` (for example `sub:USD:monthly:99:unidentified:apple:apple.com/bill 866-712-7753 ca`), so the selector needs escaping. As far as I know jsdom has no `CSS.escape`, so every component test would throw (I didn't confirm this in jsdom 31).
   - Fix: skip selectors. Loop over `main.querySelectorAll("[data-focus]")` and compare `el.dataset.focus === key`.

4. **Should-fix.** Where: "New and changed files"; focus targets `state-heading` and `drop-zone`.
   - Problem: `error-view.tsx` and `drop-zone.tsx` are not in the file list. Neither has a `data-focus` attribute today (both use refs). `no-subscriptions-view.tsx` is listed only for its heading text.
   - Failing example: "Start again" → the reducer asks for `drop-zone`, nothing matches, and the existing test "returns to idle, focuses the drop area" fails, as does e2e step 7.
   - Fix: add `data-focus="state-heading"` to the `h2` in both slice views and `data-focus="drop-zone"` on the drop area's `role="button"` div. List all three files in the table.

5. **Should-fix.** Where: "Existing tests that change", row "Guessed-only group"; R2.3.
   - Problem: the design says the guessed Netflix "rises last". The test CSV holds EUR (Netflix) and USD (gym), and `StatementInfo.currencies` is sorted ascending (`["EUR","USD"]`). R2.3 groups by currency first, so Netflix rises **first**. (The `graveyard-flow` "guessed" case already treats it as the first card.)
   - Fix: "rises first (EUR comes before USD in `StatementInfo.currencies`)".

6. **Should-fix.** Where: "Existing tests that change", rows "Guessed-only group" and "Ended"; R1.6a; vertical-slice R5.7 and R10.3.
   - Problem: a currency with no Currency total now shows no line and no "not included" note. Vertical-slice R5.7 ("only that note") and R10.3 (a test must show the note) disappear, but R15.3 lists no note for them.
   - Failing example: the EUR guessed-only statement gives "Still draining $360.00 a year" and nothing about EUR.
   - Fix: either show the note alone for such a currency ("<CODE>: Ended subscriptions and guessed ones are not included in the total."), or add amendment notes for vertical-slice R5.7 and R10.3 to R15.3.

7. **Should-fix.** Where: E2E steps 1 and 4.
   - Problem: Playwright's `getByText(string)` matches substrings. The live region contains "…Still draining $1,355.64 a year. Adobe…" and later "…Still draining $1,139.76 a year.", so two elements match and strict mode fails.
   - Fix: scope the check to the Rising summary, for example `page.locator("main p", { hasText: /^Still draining \$1,355\.64 a year$/ })`, or use `{ exact: true }` on the summary element. Check the live region with `getByRole("status")`.

8. **Should-fix.** Where: "graveyard-flow: burial fallback"; R13.6.
   - Problem: with `skipAnimations` off and `useFakeTimers({ shouldAdvanceTime: true })`, the real animations (about 1.3 s, driven by jsdom's `requestAnimationFrame`, which Vitest may also fake) finish before 2 s. The test passes without ever using the fallback.
   - Fix: unit-test `useBurialFallback` with `renderHook`, fake timers and a spy `dispatch`. In the flow test, mock `BurialMound` so it never calls `onClosed`, then advance 2,000 ms.

9. **Should-fix.** Where: "Look and layout" ("Header text … sky gradient, whose lightest stop is `--fog`"); R14.6.
   - Problem: `SKY_BACKGROUND` also has a bone moon glow, and the `Moon` disc is `--bone` at `left 70%, top 17%` (≥ 176 px wide). The header `h1`, the tagline and the counter caption sit on no panel.
   - Failing example: at 375×667 the counter wraps under the title near y ≈ 60–120, while the moon disc covers about x 227–297, y 78–148. Bone or moss text on the bone disc fails AA.
   - Fix: put the header on a `bg-fog/95` panel like the other text, or keep the moon out of the header band. Then the claim that "bone on fog bounds it" becomes true.

10. **Should-fix.** Where: "Design decisions", row "Gate during results"; "Page shell" layout; R14.2.
    - Problem: the Gate renders above the content in `idle`/`working` and below it in `results`/`graveyard`. A different JSX position remounts `DropZone` and `SampleButtons`.
    - Failing example: on the Rising, click "UK bank, …" under "Read another statement". The button unmounts on `start`, so focus is on `body` for the whole `working` state.
    - Fix: render the Gate at one fixed tree position and reorder it with CSS `order` or flex. Alternatively, let `start` ask for focus on the `Reading <name>…` line.

11. **Should-fix.** Where: "Testing strategy".
    - Problem: these criteria have no test:
      - R1.4 (the `--fog` panel in `working`/`error`)
      - R1.7 (no import of `spike/`, `routing/` or `spike-data`; "grep" is not a test)
      - R3.10, R7.10, R14.7 (no horizontal scroll at 320 px)
      - R8.5 (a change leaves the other records unchanged)
      - R13.1 (no CSS `@keyframes`)
      - R13.5 (nothing flashes)
      - R14.4 (decorative art `aria-hidden`)
      - R14.1 (Tab order through the new controls, and unique names at every step)
    - Fix:
      - Playwright: `page.setViewportSize({ width: 320, height: 640 })` and check `scrollWidth <= 320` on the Rising and the Graveyard.
      - Node tests: read `index.css` and assert there is no `@keyframes`; glob `src` and assert no import matches `spike|routing`.
      - Component tests: assert every `svg` under the scene is `aria-hidden`, and add a helper that checks all visible button names are distinct after each step of the flow.
      - P4: add "other records deep-equal before and after".

12. **Should-fix.** Where: "Existing tests that change", row "Results from a Sample"; classifier R9.9.
    - Problem: the classifier spec requires a component test that finds "no 'Price went up' text in any other list item". With one card at a time, that check is dropped without saying so.
    - Fix: in `graveyard-flow`, assert that the Adobe, gym and Spotify cards don't contain "Price went up".

13. **Nit.** Where: P6, `displayNames` " (n)" rule.
    - Problem: the property "names are pairwise distinct" is false.
    - Counterexample: two `A` items with equal long forms become "A, $1.00 a month" and "A, $1.00 a month (2)". A third item whose merchant is literally "A, $1.00 a month (2)" is unique, keeps its plain name and collides.
    - Fix: apply the suffix pass to all final names, not only to long forms. Also record the suffix rule as an amendment to the Glossary "Display name", since it goes beyond the approved text.

14. **Nit.** Where: `SavingsCounter` ("A new currency line mounts at its final value"); R6.4.
    - Problem: in a statement with EUR and USD, the fallback line is EUR. The first USD burial replaces the `€0.00` line with a USD line at its final value, so nothing counts up.
    - Fix: use the buried record's currency as the fallback key, or mount the new line at 0 and count up.

15. **Nit.** Where: "Opening the Graveyard outside `results`".
    - Problem: after opening the Graveyard from `idle`, no control returns to the idle screen ("Back to the rising" needs `results`; "Start again" needs results, no-subscriptions or error). Only choosing a statement gets out.
    - Fix: show "Back" (unique name, for example "Back to the start") when the view is not `results`.

16. **Nit.** Where: "What becomes of each Spike file", `graveyard-backdrop.tsx` "Unchanged".
    - Problem: the night scene needs the backdrop `fixed inset-0`, while the Spike's layers are positioned inside an `h-svh` scene.
    - Fix: state that `NightScene` adds the fixed wrapper and the layers stay as they are. When moving `undead-card.tsx`, correct the "4.3:1" comment to 4.53:1. In the contrast table, give the computed ratios for bone and moss on the stone face instead of "≥ 4.5".

Verdict: approve after fixes

## Resolution

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1 | Accepted: focus on mount. Each `data-focus` element focuses itself through `useFocusRequest(key)` when `model.focus` names it and its `seq` is unhandled (shared `handledSeq` through `FocusRequestContext`). One component test with `skipAnimations` off | design: Design decisions "Focus"; New and changed files (`use-focus-request.ts`); Page shell; Spike file table (`undead-card.tsx`, `tombstone.tsx`); Error handling; Testing strategy intro and component tests (`graveyard-flow.motion.test.tsx`) |
| 2 | Accepted: `finish` with an empty Queue gives event and focus `all-answered`; `back-to-rising` with no Risen focuses `state-heading` | design: transition table rows `finish (results)` and `back-to-rising`; `page-state.test.ts` row |
| 3 | Accepted: loop over `main.querySelectorAll("[data-focus]")` and compare `dataset.focus`; no selectors, no `CSS.escape` | design: Design decisions "Focus"; Page shell |
| 4 | Accepted: `data-focus="state-heading"` on the `h2` of both slice views, `data-focus="drop-zone"` on the drop area | design: New and changed files (`no-subscriptions-view.tsx`, `error-view.tsx`, `drop-zone.tsx`) |
| 5 | Accepted: the guessed Netflix rises first | design: Existing tests that change, "Guessed-only group" |
| 6 | Accepted: a currency with no Currency total shows the note alone ("<CODE>: Ended subscriptions and guessed ones are not included in the total.") | design: `StillDraining` interface and rules; Rising summary; live region; P2; Existing tests "Guessed-only group" and "Ended" |
| 7 | Accepted: Still-draining checks scoped to `main p` with an anchored regex; live region checked with `getByRole("status")` | design: E2E steps 1 and 4 |
| 8 | Accepted: `useBurialFallback` unit test with `renderHook`, fake timers and a spy `dispatch`; flow test stubs `BurialMound` so `onClosed` never fires | design: component tests (burial fallback, `use-burial-fallback.test.ts`); Testing strategy intro; Design decisions "Tests and animation" |
| 9 | Accepted: the header sits on a `bg-fog/95` panel | design: Page shell layout item 1; Look and layout; contrast table `--bone`/`--night` row |
| 10 | Accepted: the Gate is one fixed child of `main` and is placed with CSS `order`; test that focus stays on the Sample button through `working` | design: Design decisions "Gate during results"; New and changed files (`slice-page.tsx`); Page shell layout item 2; component tests ("Gate keeps focus") |
| 11 | Accepted: every listed test added (320 px Playwright check, `static-checks.test.ts` for `@keyframes` and imports, `aria-hidden` scene test, `expectUniqueButtonNames` after every step plus a Tab-order case, fog-panel test, no-flash check in `motion.test.ts`, P4 "other records deep-equal") | design: Spike move note; New and changed files (`static-checks.test.ts`, `test-a11y.ts`); P4; unit tests; component tests; E2E step 8 |
| 12 | Accepted: the Adobe, gym and Spotify cards contain no "Price went up" | design: component tests "Netflix card"; Existing tests "Results from a Sample" |
| 13 | Accepted: suffix pass over all final names; rule recorded as a Glossary amendment | design: Design decisions "Display-name ties"; `displayNames` doc; `graveyard.test.ts` row; P6; Error handling. requirements: Glossary "Display name" |
| 14 | Accepted: a new currency line mounts at 0 and counts up | design: Savings counter (`CounterLine` gains `initialCents`); `savings-counter.test.tsx` row |
| 15 | Accepted: "Back to the start" when the view is not `results`, through a new `back-to-start` action | design: Design decisions "Opening the Graveyard outside `results`"; `PageAction`; state notes; transition table; P7; Graveyard view item 7 and props; component tests "Graveyard view" |
| 16 | Accepted: `NightScene` adds the `fixed inset-0` wrapper; the "4.3:1" comment becomes 4.53:1; stone-face ratios computed (bone 8.14, moss 5.90 on `#3e424a`) | design: Spike file table (`graveyard-backdrop.tsx`, `undead-card.tsx`); contrast table |
