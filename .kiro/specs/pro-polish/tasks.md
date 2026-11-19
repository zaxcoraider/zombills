# Implementation Plan: pro-polish

The tasks are grouped into four batches, in the order asked for with the spec: A) the Compact header, the Footer graveyard, the Share preview, the night scene on Non-landing views and the Landing copy; B) the Grave drop area and the Statement disclosure; C) the Button variants and the small polish (footnote, Progress dots, card sway settle); D) the Wide layout, "Seal the grave" and the Graveyard view. This order differs from the design's Phase A / Phase B split: Requirement 5 (scene) moves into Batch A, and Requirement 6 (variants) moves into Batch C. Where a Batch A or B task adds a control that the design gives a Button variant, it uses today's class string (`rounded border border-bone bg-fog px-4 py-2 text-bone` plus `min-h-11`) and Batch C converts it. The design tokens of `index.css` land first (task 1), because the new components of Batch A use `text-small`, `text-title`, `rounded-control`, `rounded-card` and `rounded-t-stone`.

Every path is in `apps/web/` unless it starts with `.kiro/` or `packages/`. Inside a task, `src/` means `apps/web/src/`, `slice/` means `apps/web/src/slice/`, `logic/` means `apps/web/src/slice/logic/`, `landing/` means `apps/web/src/slice/landing/`, `graveyard/` means `apps/web/src/slice/graveyard/`, `chrome/` means `apps/web/src/slice/chrome/`, `statement/` means `apps/web/src/slice/statement/`, `public/` means `apps/web/public/`, and `e2e/` means `apps/web/e2e/`. Each task writes its code and its tests together. "Existing tests that change" means the design table of that name; "Text" means the design table under "Text (`logic/chrome-text.ts` …)".

Test policy:

- Each task runs the tests it names (with `npx vitest run <files>` in `apps/web`), then, from the repo root, `npm test`, `npm run typecheck` and `npm run lint`. All must pass at the end of the task.
- A task that adds or changes an e2e spec, or changes layout, scene or motion, also runs that spec with `npm run test:e2e --workspace @zombills/web -- e2e/<file>.spec.ts` and then the whole run `npm run test:e2e --workspace @zombills/web`. The task names when this applies.
- Each batch ends with a checkpoint task that runs, from the repo root: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, then `npm run test:e2e --workspace @zombills/web`. All must pass.
- No task boundary leaves a suite red. A task never needs a later task to make its own tests pass.
- Existing tests change only as "Existing tests that change" says, and only in the task that names them: a locator change, opening a disclosure before a query, or an expectation this spec makes false replaced by a stricter exact one (Req 13.2). No assertion is removed, made optional or widened. Where one design row spans two batches (for example a tab-order list that gains the Home control in Batch A and "Try another statement" in Batch B), each task changes only the part its own code makes false and says so. If an unlisted existing test fails, fix the new code, not the test; if the test itself is wrong, stop and report it as a finding.
- Property tests use fast-check with its default 100 runs, in `.property.test.ts` files next to their source (Req 13.5). Browser box checks wait for `document.fonts.ready` and emulate `prefers-reduced-motion: reduce`, except the tests that measure motion (Req 13.6).

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`, Req 12.1). No new code calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`, adds a `<link rel="prefetch|preconnect|dns-prefetch">`, or loads a remote image, icon, font, badge or widget (Req 2.12). The Page never requests `og-image.png` or `og-image.svg` (Req 4.5). No new storage key, cookie, URL write or runtime `<style>` element (Req 12.2).
- `CSP_POLICY` and `injectCsp` in `csp-plugin.ts`, `netlify.toml`, the Netlify headers and their tests stay exactly as they are (Req 4.5). If a style does not work under the policy, stop and record the finding instead of changing the policy.
- No new dependency and no change to any `package.json` or `package-lock.json` (Req 12.2). New files under `public/` are only `og-image.svg` and `og-image.png`. `packages/core` does not change.
- The only absolute URLs in non-test source under `src/` are `REPO_LINK.href`, `REAPER_LINK.href` and `KIRO_LINK.href` in `logic/landing-text.ts`, plus the SVG namespace (Req 4.6). The Share preview URLs live in `index.html` only.
- Colours are only the seven tokens, through Tailwind colour utilities with `/alpha` or `color-mix()`. No hex value outside `index.css` (and `public/og-image.svg`, Req 4.2). All new art is original inline SVG or CSS, `aria-hidden="true"` where it is SVG, ids from `useId`, no `<text>`, `<image>`, `<foreignObject>`, external reference, brand shape, logo or gore (Req 12.3).
- Motion goes through Framer Motion and animates only `transform` (`x`, `y`, `rotate`, `scaleY`) and `opacity` (design P7). Every value lives in `graveyard/motion.ts`. Under reduced motion nothing new moves, scales or rotates; it fades in at most 150 ms or does not change (Req 12.7). No new `@keyframes` or CSS transition outside `landing/landing-motion.css`; no `Infinity`, `requestAnimationFrame` or `setInterval` in new code.
- All new strings come from `logic/chrome-text.ts`, `logic/landing-text.ts` or `logic/memory-text.ts`, equal the requirement text exactly, and contain no `!`.
- A disabled control uses `aria-disabled={disabled || undefined}` and handlers that return early, with focus kept; never the `disabled` attribute (graveyard-ui Req 14.2). Every new control is a native `button`, `a` or `input`, is reachable by keyboard, is at least 44 × 44 px, and shows the `--moss` focus ring (`BARE_FOCUS` on the bare scene) with no art covering it (Req 12.5). Disclosures are a native `button` with `aria-expanded` and `aria-controls`, and their collapsed content is `hidden`. No positive `tabindex`.
- The Live region text does not change for any Page state; the new controls announce nothing (Req 12.10). Exactly one `h1` in every Page state and screen; no skipped heading level.
- Money is integer cents and every figure goes through `Money` (`money.md`); no new arithmetic on amounts.
- New component tests follow the setup of `slice/slice-page.test.tsx` (test environment, Framer Motion test config, console handling).
- Files are kebab-case, components PascalCase, constants `SCREAMING_SNAKE_CASE`; unit tests `*.test.ts(x)` and property tests `*.property.test.ts` next to the source; E2E tests in `e2e/*.spec.ts` (`structure.md`).
- TypeScript strict mode. Any `any`, and any cast through `unknown`, needs a comment explaining why (`tech.md`).
- Do not edit `requirements.md` or `design.md` of this spec. Do not commit.

---

## Batch A: header, footer graveyard, share preview, night scene and landing copy

Tasks 1 to 3 are pure and change no rendered output. Tasks 4 to 6 build the Compact header and the Leave question; tasks 7 to 9 the Footer graveyard; tasks 10 and 11 the Share preview; tasks 12 and 13 the scene; tasks 14 and 15 the Landing copy. In this batch `NightScene` gets `skyMoon={!landing}`, so the moon on Non-landing views behaves as today; task 35 switches it to the Wide-layout rule.

- [x] 1. Design tokens (`src/index.css`, `logic/design-tokens.ts`)
  - In `src/index.css`, add to `:root` the spacing properties `--space-1` (0.5rem), `--space-2` (1rem), `--space-3` (1.5rem), `--space-4` (2rem), `--space-5` (2.5rem), `--space-6` (3rem) and `--space-8` (4rem), and to `@theme` the type tokens `--text-caption` (0.8125rem / 1.25rem), `--text-small` (0.875rem / 1.25rem), `--text-body` (1rem / 1.5rem), `--text-lead` (1.25rem / 1.75rem), `--text-title` (1.75rem / 2rem), `--text-display` (2.5rem / 1), each with its `--text-*--line-height`, and the radius tokens `--radius-small` (0.5rem), `--radius-control` (0.75rem), `--radius-card` (1rem), `--radius-stone` (1.5rem) and `--radius-pill` (9999px), exactly as the design's `index.css` block. No other rule changes.
  - Create `logic/design-tokens.ts` (no React import) exporting `SPACE_SCALE`, `TYPE_SCALE` (`{ name, size, lineHeight }[]`) and `RADIUS_SCALE` (`{ name, value }[]`) with the values above.
  - Unit test `logic/design-tokens.test.ts`: read `src/index.css` with `node:fs` and check that each entry of the three scales appears as its custom property with exactly that value (so the CSS and the data cannot drift); `TYPE_SCALE` sizes are at least 0.8125rem.
  - Run in `apps/web`: `npx vitest run src/slice/logic/design-tokens.test.ts src/static-checks.test.ts src/contrast.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run build`, which must pass (Tailwind emits a token utility only once markup uses it, so tasks 6 and 8 are the first to produce `text-title`, `rounded-control` and `rounded-t-stone`).
  - Existing tests: none change.
  - _Requirements: 6.2, 12.4_

- [x] 2. Chrome text and the Page model for going home (`logic/chrome-text.ts`, `slice/page-state.ts`, `landing/primary-action.tsx`)
  - Create `logic/chrome-text.ts` with every new constant of "Text": `HOME_CONTROL_NAME`, `LEAVE_QUESTION`, `STAY_TEXT`, `LEAVE_TEXT`, `FREE_LINE`, `STATEMENT_HINT`, `TRY_ANOTHER_STATEMENT`, `SAMPLE_LIST_NAME`, `TAP_TO_CHOOSE`, `SITE_LINKS_NAME`, `PRIVACY_TOMBSTONE`, `WRITE_INSTEAD`, `WHAT_IS_KEPT`. Constants used only by later batches are added now so the text test covers them once.
  - In `page-state.ts`, as in design "Page model": add `"primary-action"` to `FocusTarget`; add `{ type: "go-home" }` to `PageAction`; export `shouldAskBeforeLeaving(model: Pick<PageModel, "view">): boolean` (`model.view.kind === "results"`); add the `go-home` case (returns `model` while `working` or on the Landing view; from `idle` on the Graveyard screen it is the `back-to-start` result, otherwise the `reset` result; in both, `focus` is replaced by `focusRequest(model, "primary-action")`). `isWideView` and `start.from` are not added here (tasks 35 and 21).
  - In `landing/primary-action.tsx`, add `data-focus="primary-action"` to the button, so the existing `[data-focus]` effect in `SlicePage` lands the request. Nothing else changes.
  - Unit test `logic/chrome-text.test.ts`: each constant equals its "Text" value exactly; no constant contains `!`; `LEAVE_QUESTION` contains none of "private", "secure", "encrypted", "anonymous" (case-insensitive).
  - Unit tests `slice/page-state.test.ts` (extended): the design's `go-home` table, one case per row (`idle`/`main` unchanged and `===`; `working` in both origins unchanged and `===`; `idle`/`graveyard`; `results`, `error`, `no-subscriptions` on `main` and `graveyard` → `view` `{ kind: "idle" }`, `screen` `"main"`, `focus.target` `"primary-action"`, `focus.seq` one more than before, `graveyard` and `memory` deep-equal); `shouldAskBeforeLeaving` for every view kind × both screens.
  - Component check in `slice/landing-page.test.tsx`: the Primary action carries `data-focus="primary-action"`.
  - Run in `apps/web`: `npx vitest run src/slice/logic/chrome-text.test.ts src/slice/page-state.test.ts src/slice/page-state.property.test.ts src/slice/landing-page.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change (the new cases are additions).
  - _Requirements: 1.3, 1.4, 1.9, 1.10, 1.11, 3.1, 3.14, 11.1_

- [x] 3. Page-model arbitrary and the leave properties (`logic/test-arbitraries.ts`, `slice/page-state.leave.property.test.ts`)
  - In `logic/test-arbitraries.ts`, add `pageModelArb` as in design "Property tests": `fc.chain` over a `ReadResult` built from the existing stored-record arbitraries, an outcome (`pageResultsOutcomeArb`, a no-subscriptions outcome or an error outcome), then 0 to 30 actions from `start`, `finish`, `fail`, `reject` (run ids 1 to 3), the answer actions with ids from that outcome, `next`, `skip`, `open-graveyard`, `back-to-rising`, `back-to-start`, `reset`, `answer-now`, `unbury`, `forget`, `set-memory` and `go-home`, folded through `pageReducer` from `initialPageModel`.
  - Unit test in `logic/test-arbitraries.test.ts` (create it if it does not exist): `fc.sample(pageModelArb, { numRuns: 2000, seed: 42 })` contains every `view.kind` and both screens (Req 1.10).
  - Property test `slice/page-state.leave.property.test.ts`: P1 (`shouldAskBeforeLeaving(m) === (m.view.kind === "results")`, no throw, unchanged when `screen`, `graveyard`, `memory`, `focus` or `event` are replaced by values from another generated model) and P2 (for Non-landing, non-`working` models, `go-home` gives `view` `{ kind: "idle" }`, `screen` `"main"`, `focus.target` `"primary-action"`, `focus.seq === (m.focus?.seq ?? 0) + 1`, `graveyard` and `memory` deep-equal; for the Landing view and `working`, the result is `===` the input).
  - Run in `apps/web`: `npx vitest run src/slice/page-state.leave.property.test.ts src/slice/logic/test-arbitraries.test.ts src/slice/page-state.property.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 1.10, 1.11, 13.5_

- [x] 4. Brand mark size and the compact counter (`landing/brand-mark.tsx`, `graveyard/savings-counter.tsx`)
  - In `brand-mark.tsx`, add `size?: number`. With no `size` the classes stay `size-14 sm:size-[4.5rem]`; with a size, the SVG gets `width` and `height` of that value and no size classes. It stays `aria-hidden="true"`.
  - In `savings-counter.tsx`, add `size?: "full" | "compact"` (default `"full"`). `"compact"` sets the figure to `text-title leading-none` (still `tabular-nums`, `min-w-[7ch]`) and adds `sm:flex-row sm:gap-4` to the currency lines' container. `"full"` renders exactly as today.
  - Unit tests: in `graveyard/savings-counter.test.tsx`, a `"compact"` render has `text-title` on each figure and `sm:flex-row` on the lines' container, and a default render has neither; the group name "Saved per year" and every figure text are the same in both. A new case in `slice/landing-page.test.tsx` (or a small `landing/brand-mark.test.tsx`) checks `BrandMark` with no `size` keeps `size-14 sm:size-[4.5rem]`, and with `size={40}` has `width="40"` and `height="40"`.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/savings-counter.test.tsx src/slice/landing-page.test.tsx src/slice/landing`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 1.1, 1.2_

- [x] 5. Leave question component (`chrome/leave-question.tsx`)
  - Create `chrome/leave-question.tsx` with `LeaveQuestionProps { seq: number; onStay: () => void; onLeave: () => void }`, as in design "Leave question": a `div role="group" aria-labelledby={textId}` Card (`rounded-card bg-fog/95 p-4 sm:p-6`), `p#textId` with `LEAVE_QUESTION`, and a row of two `button type="button"`, `STAY_TEXT` then `LEAVE_TEXT`, with today's class string plus `min-h-11` (task 25 makes them secondary). `useEffect(() => stayRef.current?.focus(), [seq])`. `onKeyDown` on the group calls `onStay` on Escape. No Live region text, no modal, no focus trap.
  - Component tests in `chrome/chrome.test.tsx` (new file; this task adds the `LeaveQuestion` cases only): the group's accessible name is `LEAVE_QUESTION`; "Stay" has focus after mount; re-rendering with a new `seq` refocuses "Stay" after focus moved away; Escape inside the group calls `onStay` once; "Stay" calls `onStay`, "Leave" calls `onLeave`.
  - Run in `apps/web`: `npx vitest run src/slice/chrome/chrome.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 1.4, 1.5, 1.6_

- [x] 6. Compact header, Home control and leave wiring (`chrome/compact-header.tsx`, `slice/slice-page.tsx`)
  - Create `chrome/compact-header.tsx` with `CompactHeaderProps` and the markup of design "Compact header": the column `div` (`mx-auto w-full max-w-[640px] px-4 pt-4`; the `wide` prop is accepted and passed `false` until task 35), `header.flex.flex-wrap.items-center.justify-between.gap-x-4.gap-y-2.py-2`, `h1.m-0` holding the Home control (`button type="button"`, `ref={homeRef}`, `data-exempt="home"`, `aria-label={HOME_CONTROL_NAME}`, `aria-disabled`, `inline-flex min-h-11 items-center gap-2 rounded-control pr-2 font-display text-title text-bone` plus `BARE_FOCUS`, `<BrandMark size={40} />` then the text "Zombills"), then `SavingsCounter size="compact"` on the counter card (`rounded-card bg-fog/95 px-4 py-2`) only when it has lines. No tagline.
  - In `slice-page.tsx`: on Non-landing views render `CompactHeader` in place of today's `bg-fog/95` header; `LandingBanner` stays on the Landing view. Add `homeRef`, the `leave` state `{ open: boolean; seq: number }`, `onHome` (opens the question when `shouldAskBeforeLeaving(model)`, else dispatches `go-home`), `homeDisabled = model.view.kind === "working"` (`onHome` returns early then); render `LeaveQuestion` as the first child of `main` while open, with `onStay` closing it and focusing `homeRef`, and `onLeave` dispatching `go-home`. A second Home press while open bumps `seq`. An effect keyed on `model.view.kind` and `model.screen` closes the question; when it closes while `document.activeElement` is inside it, focus moves to `homeRef`. "Start again" and "Back to the start" keep dispatching `reset` and `back-to-start`.
  - Component tests in `chrome/chrome.test.tsx` (Req 1 cases of the design's `chrome.test.tsx` row): on `results`, `error`, `no-subscriptions` and the Graveyard view exactly one `h1`, named `HOME_CONTROL_NAME`, whose only interactive descendant is a `button` holding an `[aria-hidden="true"] svg` and the text "Zombills"; the Landing `h1` has no button; from `error`, the Home control shows the Landing view, focuses the Primary action, and the Graveyard keeps its records; from `results`, the question is `main`'s first child with "Stay" focused, a second press keeps it open with "Stay" focused, Escape and "Stay" close it and focus the Home control with the results still shown, "Leave" shows the Landing view with the Primary action focused; while `working` the Home control is `aria-disabled="true"`, a click does nothing and focus stays; "Start again" asks nothing; the Live region text is the same before and after each Home and Leave-question action.
  - Run in `apps/web`: `npx vitest run src/slice/chrome src/slice/slice-page.test.tsx src/slice/landing-page.test.tsx src/slice/graveyard-flow.test.tsx src/slice/graveyard-memory-flow.test.tsx src/app.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web`.
  - Existing tests: tests that find the Non-landing `h1` by the name "Zombills" use `HOME_CONTROL_NAME` (Req 1.2 Decision); tests that read the tagline on a Non-landing view expect it absent there (Req 1.1); in the tab-order lists that start on a Non-landing view (`graveyard-flow.test.tsx` lines 545–555), `HOME_CONTROL_NAME` is prepended and nothing else changes in this task. Find each by searching for `name: "Zombills"` and the tagline constant. `app.test.tsx` checks the Landing `h1` and passes unchanged.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 12.6, 12.10, 13.4_

- [x] 7. Ground line, Footer tombstone and the peek motion values (`graveyard/ground-line.tsx`, `chrome/footer-tombstone.tsx`, `graveyard/motion.ts`)
  - In `graveyard/motion.ts`, export `STONE_LIFT_Y = -4`, `PEEK_GHOST_Y = -12`, `STONE_LIFT` (0.2 s easeOut), `PEEK_GHOST_RISE` (0.25 s, delay 0.05 s, easeOut) and `STONE_REST` (0.2 s easeIn), as in "Signature moments".
  - Create `graveyard/ground-line.tsx` with `GroundLine`: a 16 px decorative strip of grass and earth, `aria-hidden="true"`, tokens only, ids from `useId`.
  - Create `chrome/footer-tombstone.tsx` with `FooterTombstoneProps` and `FooterTombstone`, as in "Signature moments: 4": `motion.a` when `href` is set (`target="_blank"`, `rel="noopener noreferrer"`, `aria-describedby={describedBy}`), else `motion.button type="button"` calling `onActivate`; `data-exempt="footer-tombstone"`; classes `relative isolate block w-full min-w-24 min-h-[5.5rem] pt-[16px] text-center` plus `BARE_FOCUS`; `initial="rest" whileHover="peek" whileFocus="peek"`; children `[data-peek-ghost]` (the `PeekGhost` SVG, not rendered under reduced motion), `[data-stone-face]`, `[data-stone-outline]` (moss, opacity 0 → 1 in 0.15 s) and the label `span` (`px-2 pb-4 pt-6 text-small font-semibold text-bone [overflow-wrap:anywhere]`, HTML text). Face, label and outline move `y: 0 → STONE_LIFT_Y`, the ghost `y: 0 → PEEK_GHOST_Y`; under reduced motion the variants have no `y`. No `aria-label`.
  - Unit tests: `graveyard/motion.test.ts` checks each new transition's `delay + duration` is at most 0.3 s and the offsets are −4 and −12. Component tests in `chrome/chrome.test.tsx`: a `href` stone renders an `a` with `target`, `rel`, `aria-describedby` and its label as accessible name; no `href` renders a `button` that calls `onActivate`; with `reduceMotion` there is no `[data-peek-ghost]`; every SVG inside is `aria-hidden`.
  - Static check in `src/static-checks.test.ts`: add the "Art (Req 12.3)" case for `footer-tombstone.tsx` and `ground-line.tsx` (no `<text`, `<image`, `<foreignObject`, `href=` other than `#`, hex colour; every `id=` from `useId`). Tasks 8 and 17 add their files to the same list.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/motion.test.ts src/slice/chrome src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 2.7, 2.8, 2.9, 2.14, 12.3, 12.7_

- [x] 8. Footer graveyard (`slice/site-footer.tsx`, `logic/landing-text.ts`, `slice/slice-page.tsx`, `src/static-checks.test.ts`)
  - In `logic/landing-text.ts`, per "Text": `REAPER_LINK.text` becomes "The Reaper"; `REAPER_DESCRIPTION` becomes "A Kiro Crew app that watches for new statements each month and drafts cancellation emails when you ask."; add `KIRO_LINK` (`{ text: "Built with Kiro", href: "https://kiro.dev" }`); `BUILT_WITH_KIRO` becomes "Built with Kiro". `REPO_LINK` keeps its values.
  - Rewrite `site-footer.tsx` with `SiteFooterProps { noteRef; wide; reduceMotion; onReadNote }` and the DOM of design "Footer graveyard": `footer.relative.pt-8.pb-8` in today's column; `div[data-footer-ground]` (`aria-hidden`, full bleed, `top: 8px`, the design's ground gradient with a `GroundLine` at 24 px); `ul[aria-label={SITE_LINKS_NAME}]` (`relative grid grid-cols-2 gap-4 sm:grid-cols-4`) of four `li > FooterTombstone` in the order `REPO_LINK`, `REAPER_LINK` (`describedBy` = Reaper description id then new-tab id), `PRIVACY_TOMBSTONE` (button, `onActivate={onReadNote}`), `KIRO_LINK`; `p#reaperDescId.relative.mt-4.text-small` full width; `p(ref=noteRef, tabIndex=-1).relative.mt-2.text-small` with `PRIVACY_NOTE`; `span#newTabId.sr-only` with `NEW_TAB_TEXT`. No heading, no other privacy sentence, no "Built with Kiro." sentence.
  - In `slice-page.tsx`, pass `reduceMotion` and the existing `onReadNote` to `SiteFooter` on every view.
  - In `static-checks.test.ts`, amend the absolute-URL case so the allowed set is exactly the three Footer URLs, all in `logic/landing-text.ts` (Req 4.6); the fixture case with an extra URL still reports it. Add `site-footer.tsx` to the art list of task 7.
  - Component tests in `chrome/chrome.test.tsx` (Req 2 cases): list "Site links" with four items in order and the exact texts; `href`, `target`, `rel` of the three links; each link's `aria-describedby` texts (Reaper: description then `NEW_TAB_TEXT`; others `NEW_TAB_TEXT`); each accessible name starts with its visible text; no heading and no `img` in the footer; `PRIVACY_NOTE` exactly once, with `tabindex="-1"`; no element with the text "Built with Kiro."; "Privacy note" moves focus to the note on the Landing view and on `results`, with `location.href` and the Live region unchanged.
  - Run in `apps/web`: `npx vitest run src/slice/chrome src/slice/logic/landing-text.test.ts src/slice/slice-page.test.tsx src/slice/landing-page.test.tsx src/slice/graveyard-flow.test.tsx src/static-checks.test.ts`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests, per "Existing tests that change": `logic/landing-text.test.ts` lines 26–33 (`BUILT_WITH_KIRO` "Built with Kiro", Reaper text "The Reaper", the new description, plus `KIRO_LINK`; `OWN_STATEMENT_HEADING` waits for task 15); `slice-page.test.tsx` lines 93–99 (exactly 3 links, `REPO_LINK`, `REAPER_LINK`, `KIRO_LINK` with exact `href`s); `landing-page.test.tsx` lines 419–448 (no "Built with Kiro." element; the four tombstones with names, `href`s and descriptions; line 434 unchanged); the tab-order lists of `slice-page.test.tsx` "Keyboard" (around line 362) and the `landing-page.test.tsx` tab-order test end with "Zombills on GitHub", "The Reaper", "Privacy note", "Built with Kiro"; any other tab-order list that reaches the Footer gets the same four names in place of the two old links.
  - Amended 2026-11-18 (Batch A review #7): the Footer contrast rows of Req 2.11 (the Reaper description and Privacy note on the earth `GROUND_TOP`, the stone labels on the lightest stone face, the moss outline at least 3:1) are added to `src/contrast.test.ts` in this batch, not in task 24.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.11, 2.12, 2.13, 4.6, 11.4, 12.6, 13.3, 13.4_

- [x] 9. Header and Footer browser tests (`e2e/pro-polish.spec.ts`, `e2e/landing.spec.ts`, `e2e/demo-path.spec.ts`)
  - Create `e2e/pro-polish.spec.ts` with the header and Footer rows of design "Browser tests":
    - Footer grid: at 390 × 844 and 320 × 568 the four stones form two rows of two in order (sorted by `y`, then `x`); at 1280 × 800 one row; each stone at least 44 × 44 and at least 96 px wide at 390; `scrollWidth <= innerWidth`.
    - Peek, no reduced motion, 1280 × 800: hover "The Reaper", wait 400 ms, `[data-stone-face]` computed `transform` is `matrix(1, 0, 0, 1, 0, -4)` and `[data-peek-ghost]` is `matrix(1, 0, 0, 1, 0, -12)`; move away, wait 400 ms, both `none` or identity; Tab to it: the same peek values; in a `hasTouch` context, `page.touchscreen.tap` on "Privacy note" leaves its face and ghost at identity.
    - Peek, reduced motion: hover and focus leave `[data-stone-face]` at identity, no `[data-peek-ghost]`, and `[data-stone-outline]` opacity 1 after 200 ms.
    - Focus ring not covered, no reduced motion: for each stone after Tab, after 400 ms, the ghost and face boxes lie inside the control's border box (± 0.5 px), and `elementFromPoint` 2 px outside the middle of each edge returns no element inside another tombstone.
    - Header: at 640 × 800 with two currencies saved (two Samples of different currencies, one Bury each), the `header` box is at most 88 px tall; at 360 × 740 the Home control and counter share one row (their box centres within the taller box's height).
  - In `e2e/landing.spec.ts`, per "Existing tests that change": lines 715 and 736–750, the link "The Reaper", and the test renamed "footer reaper description spans the row under the stones": the description `p` starts below every stone's bottom edge and its width equals the list's width ± 1 px.
  - In `e2e/demo-path.spec.ts` (Req 12.1), extend the path without touching its CSP, request, console and storage checks: on `results`, activate the Home control, check the Leave question, choose "Leave", reach `results` again through the Primary action; hover and focus each Footer tombstone without following a link.
  - Run: `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts`, then the whole run `npm run test:e2e --workspace @zombills/web`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: the `landing.spec.ts` rows above and the `demo-path.spec.ts` extension. Every other e2e test passes unchanged, including the R8.5 Footer font check.
  - Amended 2026-11-18 (visual review and Batch A review #4, #10): with the SVG headstones of design "Signature moments: 4", the Footer grid sorts and groups rows by the stones' bottom edge (the ground line), checks the label centres of a row match and the heights vary; the peek value of the ghost is `matrix(1, 0, 0, 1, 0, -48)`; new tests check the SVG silhouette and engraved serif label, and that on hover and focus the risen ghost is whole above the stone top, uncovered and unclipped; the touch-tap test taps "Zombills on GitHub" with navigation blocked and checks the stone keeps focus; the `landing.spec.ts` 44 × 44 target list adds "Privacy note" and "Built with Kiro", and its Reaper-description test reads the four stone controls (`[data-exempt="footer-tombstone"]`) instead of every child of each `li`, which now also holds the ground strip.
  - _Requirements: 1.1, 2.3, 2.7, 2.8, 2.9, 2.10, 2.11, 12.1, 13.6_

- [x] 10. Share preview image and its export (`e2e/og-font-paths.ts`, `e2e/og-image.export.spec.ts`, `public/og-image.svg`, `public/og-image.png`, `src/static-checks.test.ts`)
  - Create `e2e/og-font-paths.ts` as in design "Share preview": read `node_modules/@fontsource/im-fell-english/files/im-fell-english-latin-400-normal.woff`, inflate tables with `zlib.inflateSync` when `compLength < origLength`, read `head.unitsPerEm`, `cmap` format 4, `loca`, `glyf` (simple and composite glyphs) and `hmtx`, and return one `d` string per text line laid out by advance width. Node built-ins only.
  - Create `public/og-image.svg` by hand with layers 1 to 6 of the design (sky, 40 stars, moon with halo and maria, ridge, moss glow, the Hero ghost and tombstone at `translate(74 202) scale(3.2)`), `viewBox="0 0 1200 630" width="1200" height="630"`, token hex values only, and the markers `<!-- text:start -->` and `<!-- text:end -->`.
  - Create `e2e/og-image.export.spec.ts`, skipped unless `ZB_EXPORT_OG=1`: writes the wordmark "Zombills" (cap height 96 px with the font size from the font's cap height, x 620 unless its measured right edge exceeds x 1150, then moved left just enough; baseline 380) and the tagline "Your bank statement is haunted." (44 px, `#ECE6D6` at 85 %, x 620, baseline 450, two lines if wider than 520 px) as `path`s between the markers, asserts the wordmark right edge and each tagline line's right edge are at most x 1150 (by advance width with `og-font-paths.ts`), then renders the SVG in a 1200 × 630 page with `deviceScaleFactor: 1` and saves `public/og-image.png`.
  - Run the export once: `ZB_EXPORT_OG=1 npm run test:e2e --workspace @zombills/web -- e2e/og-image.export.spec.ts`. Look at the PNG and confirm it shows the sky, moon, tombstone, the cream ghost with two oval eyes and no mouth, the moss glow, the wordmark and the tagline, and no logo or statement data. Both files stay in the working tree (not committed by this task).
  - Static checks in `src/static-checks.test.ts`: "Preview SVG (Req 4.3)" (no `<text`, `<script`, `<foreignObject`, `<image`; every `href` and `url(` is a `#` fragment; `width="1200" height="630"`; every hex colour is one of the seven token values) and "Public files (Req 12.2)" (`public/` holds exactly `favicon.svg`, `og-image.svg`, `og-image.png`). A unit test in `src/static-checks.test.ts` also reads the PNG's IHDR (bytes 16 to 23) as 1200 × 630 and its size as at most 300 KB, so the committed file is checked without a build. A further static check measures the layout with `og-font-paths.ts` and asserts the wordmark right edge and both tagline lines' right edges are at most x 1150.
  - Amended 2026-11-18: wordmark cap height 96 px (120 px overflowed by about 80 px).
  - Amended 2026-11-18 (Batch A review #8): `og-font-paths.ts` moved to `apps/web/scripts/`, because `src/static-checks.test.ts` imports it and `src` tests do not import from `e2e/`.
  - Run in `apps/web`: `npx vitest run src/static-checks.test.ts`; then `npm run test:e2e --workspace @zombills/web` (the export spec is reported as skipped); then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 4.2, 4.3, 4.4, 12.2_

- [x] 11. Share preview tags and their browser test (`index.html`, `e2e/share-preview.spec.ts`)
  - In `index.html`, after `<title>`, add in this order: `meta name="description"`, `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:type`, `og:image:width`, `og:image:height`, `og:image:alt`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`, with the exact values of Req 4.1. `<meta charset>` stays first, so `injectCsp` still puts the CSP tag directly after it.
  - Create `e2e/share-preview.spec.ts`: `request.get("/")` and check each tag and value of Req 4.1 by attribute; the CSP `meta` is the element directly after `<meta charset>` and before the first new tag; `request.get("/og-image.png")` has `content-type` `image/png`, a body of at most 300 KB, and IHDR width 1200 and height 630.
  - Run: `npm run test:e2e --workspace @zombills/web -- e2e/share-preview.spec.ts`, then the whole run (the demo-path request check must pass unchanged, so the Page does not request the image); then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change; `csp-plugin.test.ts` and `netlify-config.test.ts` pass unchanged.
  - _Requirements: 4.1, 4.5, 4.6, 4.7, 12.1_

- [x] 12. Night scene on Non-landing views (`graveyard/night-scene.tsx`, `graveyard/graveyard-backdrop.tsx`, `slice/slice-page.tsx`)
  - In `night-scene.tsx`, as in design "Scene and Stage": add `skyMoon: boolean`; on every view use `LANDING_SCENE_STYLE` on the root and `LANDING_SKY_STYLE` on the first fixed layer; pass `moon={skyMoon}` and `ridge={false}` to `BackdropLayers`; draw no fixed `Ground`; keep `ForegroundFog` and the `fogFade`.
  - In `graveyard-backdrop.tsx`, `FogBand` loses its drift branch (`repeat: Infinity`) and always draws today's still pose; remove the `still` and `fogStill` props along the chain.
  - In `slice-page.tsx`, pass `skyMoon={!landing}` (task 35 changes it); on Non-landing views render `RidgeBand` in a full-bleed wrapper directly before `SiteFooter`, with `data-ridge-band` kept.
  - Unit tests `graveyard/night-scene.test.tsx`, per "Existing tests that change" lines 68–90: renders gain `skyMoon`; "draws exactly one moon disc when `skyMoon` is true"; "draws no moon when `skyMoon` is false"; "holds the fog in its still pose on every view", run with `landing` true and false; no fixed fence, ridge or `Ground` with `landing={false}`.
  - Browser tests in `e2e/pro-polish.spec.ts`: Scene scroll (`results` and a restored Graveyard view of 12 records at 1280 × 800 and 390 × 844: scroll by `min(400, scrollHeight − innerHeight)`, asserted at least 100; the `[data-ridge-band]` box moves by that amount ± 1 px; no fixed element contains a ridge, fence or ground); Fog at rest (no reduced motion, `results` and the Graveyard view: each `[data-backdrop-fog]` computed `transform` equal at t and t + 10 s with `page.clock`).
  - In `e2e/landing.spec.ts` line 1213, per the design row: renamed "results view has the ridge band in the flow and no fixed fence": exactly one `[data-ridge-band]` with computed `position` other than `fixed`, before the `footer` in DOM order; no fixed-position element contains the fence. Line 1217 keeps "Read another statement" until task 19.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/night-scene.test.tsx src/slice/graveyard-flow.test.tsx src/slice/graveyard-flow.motion.test.tsx src/slice/graveyard-flow.reduced.test.tsx src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts e2e/landing.spec.ts`, then the whole run.
  - Existing tests: the `night-scene.test.tsx` and `landing.spec.ts` line 1213 rows. The "non-landing moon" tests pass unchanged in this batch (`skyMoon={!landing}` keeps today's moon).
  - Amended 2026-11-18: landing-page.test.tsx 564-593 replaced by exact new-behaviour assertions (design row `landing-page.test.tsx` lines 564–593). In `night-scene.test.tsx` the fog drift control step is replaced by a check that every view gives the same still pose (design row `graveyard/night-scene.test.tsx` lines 68–90).
  - _Requirements: 5.1, 5.2, 5.3, 12.8, 13.6_

- [x] 13. Stage without a box (`graveyard/burial-stage.tsx`, `graveyard/graveyard-backdrop.tsx`)
  - In `burial-stage.tsx`, the outer box changes from `relative isolate overflow-clip rounded-2xl` to `relative isolate overflow-clip`, with no background, border, radius or shadow; the sink still clips at the ground line.
  - In `graveyard-backdrop.tsx`, `Ground` as in design "Scene and Stage": height `calc(var(--ground-h) + 24px)` at `bottom: 0`; earth `div` with `pointer-events-none -z-10`; last background layer `linear-gradient(to bottom, transparent 0, ${GROUND_TOP} 24px, ${mix("fog", 30, "night")} calc(24px + 35%), var(--night) 100%)`, moonlight pool first at `50% 24px`; no `box-shadow`; `mask-image` fading 24 px at each side. `GrassTufts` keeps its place and offset.
  - Browser test in `e2e/pro-polish.spec.ts`: Stage box at 1280 × 800 and 390 × 844, reduced motion, in `ask` and `buried`: `[data-burial-stage] > div` has transparent `background-color`, `border-width` 0, `box-shadow` none; the Stage `Ground` has no `box-shadow` and its last gradient layer's first stop is `transparent` with the next stop at least 24 px further on.
  - Amended 2026-11-18 (visual review): a dark band still showed under the card at 390 × 844 (the Stage `Ground` faded to `--night` with a hard bottom edge). The earth is now `GROUND_TOP` at 30 % fading back to transparent, and a "Stage ground" browser test samples that area: no 16 × 8 px block more than 6 luma levels darker than the sky just under the Stage in the same column.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard src/slice/graveyard-flow.test.tsx src/slice/graveyard-flow.motion.test.tsx src/slice/graveyard-flow.reduced.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts e2e/layout.spec.ts`, then the whole run. The burial sequence, its timings and the card-in-stage layout tests must pass unchanged (Req 5.5).
  - Existing tests: none change.
  - _Requirements: 5.4, 5.5, 5.6_

- [x] 14. Sample names at the source (`slice/samples.ts` and every test that reads the old labels)
  - In `samples.ts`, change each `label` per the requirements' Decision table: "US bank statement", "UK bank statement", "European bank statement", "Statement with extra top lines". Every `fileName` and `US_SAMPLE_FILE_NAME` stay.
  - Existing tests, per the first rows of "Existing tests that change": `slice-page.test.tsx` lines 28–29, `landing-page.test.tsx` lines 25–28, `graveyard-flow.test.tsx` lines 40–41 and `landing/landing-motion.test.tsx` line 6 set `US_LABEL`, `UK_LABEL`, `EU_LABEL`, `PREAMBLE_LABEL` to the new names, and every assertion that reads them stays as written; `e2e/landing.spec.ts` lines 206–208 (the three new Secondary names in order) and line 249 (`Reading US bank statement…`); `e2e/landing.spec.ts` lines 99–101 click the gate button "UK bank statement" and wait for "Reading UK bank statement…" (task 19 moves it to the chip list); any old label in `e2e/demo-path.spec.ts` or `e2e/layout.spec.ts`. Find every old label with `grep -rn -e "US bank, signed" -e "debit and credit columns" -e "EU bank, semicolons" -e "header block" apps/web/src apps/web/e2e` and leave no match outside comments.
  - Component check in `slice/landing-page.test.tsx`: no button on the Landing view is named "US bank statement"; the Secondary samples list names are exactly "UK bank statement", "European bank statement", "Statement with extra top lines".
  - Run in `apps/web`: `npx vitest run` (the whole web suite); then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web`.
  - _Requirements: 11.3, 13.3_

- [x] 15. Landing copy: free line, Own-statement heading and Tip (`landing/hero.tsx`, `logic/landing-text.ts`, `logic/memory-text.ts`)
  - In `hero.tsx`, render `<p className="mt-2 text-body text-bone">{FREE_LINE}</p>` directly after `PrimaryAction`, before the `working` line and `SecondarySamples` (design "Fold and small screens"). Text only.
  - In `landing-text.ts`, `OWN_STATEMENT_HEADING` becomes "Or use your own statement". In `memory-text.ts`, `STATEMENT_TIP` becomes "Tip: 2 to 3 months of transactions works best.".
  - Component tests in `slice/landing-page.test.tsx`: the DOM order Primary action, `FREE_LINE` paragraph, `Other sample statements` list; while working, the `working` line comes after `FREE_LINE`; `FREE_LINE` holds no control.
  - Existing tests, per "Existing tests that change": `landing-page.test.tsx` line 150 (`[2, "Or use your own statement"]`); `logic/landing-text.test.ts` (`OWN_STATEMENT_HEADING` exact); `logic/memory-text.test.ts` lines 33–38 (`STATEMENT_TIP` equals the new text, `PRIVACY_NOTE` equals its text, and those two exact assertions replace the join assertion, which this spec makes false by design); `e2e/landing.spec.ts` tests that read "Or read your own statement" use the new heading.
  - Run in `apps/web`: `npx vitest run src/slice/landing-page.test.tsx src/slice/logic src/slice/slice-page.test.tsx src/slice/graveyard-memory-flow.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts` (the Fold checks and the candle-glow distance must pass unchanged; if a Fold check fails, apply the design's fallback of putting `FREE_LINE` on the Secondary samples' row from `sm`), then the whole run.
  - Contrast: add to `src/contrast.test.ts` the row `FREE_LINE` `--bone` on S, at least 4.5:1.
  - Amended 2026-11-18 (Batch A review #2): no Fold check failed, but `FREE_LINE` as a sibling `p` after `PrimaryAction` (16 px gap + `mt-2` + one line) made the Hero about 48 px taller at 1280 × 800, and two existing scene checks in `e2e/landing.spec.ts` then failed by one level: "ridge band bottom blends into the sky 1280x800" (step 5, limit 4) and "no ground line on the landing 1280x800" (4, limit 3). So `FREE_LINE` stays the first child of the Secondary samples' wrapper but takes `sm:basis-full`, a line of its own at every width; from 1280 px the two had already wrapped onto two lines, so the Hero height there is unchanged. A browser test in `pro-polish.spec.ts` checks at 640, 1280 and 1920 px that "Other samples:" starts below the free line.
  - _Requirements: 3.1, 3.2, 11.1, 11.2, 11.4, 11.5, 11.6, 12.4_

- [x] 16. Batch A checkpoint
  - Run from the repo root: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Check that `git diff` shows no change to `csp-plugin.ts`, `csp-plugin.test.ts`, `netlify.toml`, `netlify-config.test.ts`, `storage-lint.test.ts`, any `package.json`, `package-lock.json` or `packages/core`; that `public/` holds only `favicon.svg`, `og-image.svg` and `og-image.png`; and that each changed existing test matches a row of "Existing tests that change" or a note in tasks 6, 8, 12, 14 or 15, and removes or widens no assertion.
  - Report any failure or gap as a finding; fix it here only if it is a one-line test or text change.
  - _Requirements: 12.1, 12.2, 13.2, 13.7_

---

## Batch B: Grave drop area and Statement disclosure

Task 17 adds the art and motion values; task 18 redraws `DropZone` with its behaviour unchanged; task 19 replaces the gate with the Statement panel and the Sample chips; task 20 puts the panel behind the Statement disclosure; task 21 hands focus over when another statement is read and opens the disclosure on a window drag; task 22 adds the browser tests. Until task 36, `SlicePage` renders the disclosure after `RisingView` on `results`, which is the DOM order the `statementSlot` keeps. The disclosure button, "Choose a file" and "Start again" use plain classes in this batch (the disclosure button: `inline-flex min-h-11 items-center gap-2 text-bone underline underline-offset-4` plus `BARE_FOCUS`); task 25 converts them to variants.

- [x] 17. Grave art, hover detection and the grave motion values (`statement/grave-art.tsx`, `statement/use-hover-none.ts`, `graveyard/motion.ts`)
  - In `graveyard/motion.ts`, export `GRAVE_GHOST_REST_Y = 32`, `GRAVE_GHOST_RISE_Y = 8`, `GRAVE_GHOST_RISE` (0.3 s, `[0.22, 1, 0.36, 1]`), `GRAVE_GHOST_RETURN` (0.25 s easeIn) and `GRAVE_GLOW_FADE` (0.2 s easeOut), as in "Signature moments".
  - Create `statement/grave-art.tsx` with `GravePit({ dragging, reduceMotion })` and `RestingGhost({ dragging, reduceMotion })`, as in "Signature moments: 3": the pit SVG (`viewBox="0 0 100 100"`, `preserveAspectRatio="none"`, earth rect `GROUND_TOP`, pit rect with the `useId` linear gradient, pit glow and rim glow `motion.rect` with opacity 0 | 1, outline stroke `color-mix(bone 50 %)` 2 px non-scaling); the ghost `motion.svg` (40 × 56, body path and two `--night` eyes of the design) at `y: GRAVE_GHOST_REST_Y` or `GRAVE_GHOST_RISE_Y`. Under reduced motion the ghost stays at rest and only the glows fade with `REDUCED_FADE`. Both `aria-hidden="true"`, no text.
  - Create `statement/use-hover-none.ts`: `useHoverNone()` reads `matchMedia("(hover: none)")`, listens for `change`, and returns `false` when `matchMedia` is missing.
  - In `src/contrast.test.ts`, add P and its rows (grave text `--bone` on P, "Choose a file" text and outline on P, grave outline, rim glow) with `PIT_GLOW_ALPHA = 0.14` exported from `logic/design-tokens.ts`; assert P is `#1f2c28`.
  - Unit tests: `graveyard/motion.test.ts` checks each grave transition's `delay + duration` is at most 0.4 s (and at most 0.3 s per leg as the design states), and the ghost offsets 32 and 8. `statement/statement.test.tsx` (new): `useHoverNone` returns `false` with no `matchMedia`, `true` with a stub that matches, and updates on a `change` event; both art components render only `aria-hidden` SVG with no `<text>`.
  - Static check: add `grave-art.tsx` to the art list of task 7.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/motion.test.ts src/slice/statement src/contrast.test.ts src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 3.4, 3.6, 3.12, 3.14, 12.3, 12.4, 12.7_

- [x] 18. Grave drop area (`slice/drop-zone.tsx`)
  - Restructure `DropZone` as in design "Statement panel": add `reduceMotion: boolean`; the wrapper `div[data-grave-drop][data-dragging]` (`relative pt-[48px]`) holds `onDragEnter`, `onDragLeave`, `onDragOver`, `onDrop` and the depth counter; inside it the ghost window (`aria-hidden`, `h-[48px]`, `overflow-clip`) with `RestingGhost`, then `div.grave` (`relative min-h-32 w-full`) with `GravePit`, the `div[role=button][data-focus="drop-zone"][data-exempt="drop-area"]` (`relative grid min-h-32 place-items-center rounded-card px-4 pb-16 pt-6 text-center`) and, as its sibling, the "Choose a file" button (`absolute bottom-4 left-1/2 -translate-x-1/2`, today's classes). The `input type=file` stays `sr-only` with `accept=".csv,text/csv"`.
  - Kept as today: `role="button"`, the name "Drop area: choose or drop a CSV statement", Enter and Space, the drag texts "Release to read this file" and "Reading…", the `working` `aria-disabled` behaviour, drops outside the area ignored. The resting text is `useHoverNone() ? TAP_TO_CHOOSE : "Drop a CSV statement here"`. While disabled the ghost stays at rest and the glows stay off.
  - Pass `reduceMotion` from every `DropZone` caller (`OwnStatement` and the gate in `slice-page.tsx`).
  - Component tests in `statement/statement.test.tsx` (drop-area cases of the design row): role, name, `data-focus`, Enter and Space open the picker, the drag texts, `accept`; a file dropped on "Choose a file" is read; `dragenter` on the wrapper then on the button keeps "Release to read this file"; "Choose a file" is not a descendant of `[role=button]`; with `matchMedia("(hover: none)")` matching, the resting text is `TAP_TO_CHOOSE` and the name is unchanged.
  - Run in `apps/web`: `npx vitest run src/slice/statement src/slice/slice-page.test.tsx src/slice/landing-page.test.tsx src/slice/graveyard-flow.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts` (the drop-area height bound of `landing.spec.ts:454-455` holds unchanged), then the whole run.
  - Existing tests: none change; every existing drop-area and drag-guard test passes as written.
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.13, 3.14_

- [x] 19. Statement panel and Sample chips (`statement/statement-panel.tsx`, `statement/sample-chips.tsx`, `landing/own-statement.tsx`, `slice/slice-page.tsx`, `slice/sample-buttons.tsx`)
  - Create `statement/sample-chips.tsx` with `SampleChips({ disabled, onChoose })`: `ul[aria-label={SAMPLE_LIST_NAME}].flex.flex-wrap.gap-2` of `li > button type="button" data-exempt="sample-chip"` in `SAMPLES` order, each with its `label`, the chip classes of the design (`min-h-11 rounded-t-stone rounded-b-small border border-bone/50 bg-fog px-4 pb-2 pt-4 text-small font-semibold text-bone hover:border-moss`), and `aria-disabled` while working.
  - Create `statement/statement-panel.tsx` with `StatementPanelProps` and the order of Req 3.1: the `h2` (`OWN_STATEMENT_HEADING` on `place="landing"`, `TRY_ANOTHER_STATEMENT` on `"gate"`) when `showHeading`; `p` `STATEMENT_HINT`; `p` `STATEMENT_TIP`; `DropZone`; `SampleChips` only on `"gate"`. A `section` Card (`rounded-card bg-fog/95 p-4 sm:p-6 flex flex-col gap-4`) with `aria-labelledby` on its `h2`.
  - `landing/own-statement.tsx` renders `StatementPanel place="landing" showHeading`. In `slice-page.tsx`, the Non-landing gate (today's `bg-fog/95` box headed "Read another statement" with `SampleButtons`) becomes `StatementPanel place="gate" showHeading` on every Non-landing view, open, with "Start again" after it as today. Delete `slice/sample-buttons.tsx` (no other importer; confirm with `grep -rn sample-buttons apps/web/src`).
  - Component tests in `statement/statement.test.tsx`: panel order (heading, hint, Tip, drop area, chips) on both places; the Landing `h2` "Or use your own statement" and no chips there; the Tip once per page; the chip list "Sample statements" with four buttons named by the new labels in `SAMPLES` order, each starting its Sample, each `aria-disabled` while working; no heading "Or try a sample statement" on any view.
  - Existing tests, per "Existing tests that change": `landing-page.test.tsx` lines 514–535, renamed "Non-landing views": the list "Sample statements" holds four buttons named by the new labels, no heading "Or try a sample statement", the `h2` "Try another statement" on every Non-landing view, `main` has `max-w-[640px]` (the `lg:max-w-[1184px]` part waits for task 35); `e2e/landing.spec.ts` line 1217 reads the `h2` "Try another statement"; `e2e/landing.spec.ts` lines 99–101 click the chip "UK bank statement" in the list "Sample statements"; tests that read "Read another statement" or "Or try a sample statement" use the new heading or the chip list; in tab-order lists the four Sample names are those of the chips (same names, same order). Tests that find a Sample button by name on a Non-landing view find it `within` the list "Sample statements".
  - Run in `apps/web`: `npx vitest run` (the whole web suite); then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web`.
  - _Requirements: 3.1, 3.2, 3.9, 3.10, 3.11, 3.12, 12.3_

- [x] 20. Statement disclosure (`statement/statement-disclosure.tsx`, `slice/slice-page.tsx`, `slice/error-view.tsx`, `slice/no-subscriptions-view.tsx`)
  - Create `statement/statement-disclosure.tsx` with `StatementDisclosure({ open, onToggle, children })` as in the design: `section[aria-labelledby]`, `h2.text-lead.font-bold > button type="button"` with `aria-expanded`, `aria-controls`, the text `TRY_ANOTHER_STATEMENT` and an `aria-hidden` chevron SVG that flips with no transition; `div[id][hidden={!open}]` holding `children`. Export the pure `disclosureFocusStep(target, shown, open): "open" | "claim"`.
  - In `slice-page.tsx`: `statementOpen` state, reset to `false` when `` `${view.kind}:${screen}` `` changes. On `results` (either screen) and the Graveyard view, the gate is `StatementDisclosure` holding `StatementPanel place="gate" showHeading={false}` and "Start again"; on `working`, `error` and `no-subscriptions` the panel is shown open with its heading and no disclosure. The `[data-focus]` effect gains `statementOpen` as a dependency and calls `disclosureFocusStep`; on `"open"` it sets `statementOpen` and returns without claiming.
  - In `error-view.tsx` and `no-subscriptions-view.tsx`, "Start again" and then "Open the graveyard" (when the Graveyard has records; it moves here from `showOpenGraveyard` in the gate) sit inside the state Card, today's classes. The tab order becomes that of Req 12.6.
  - Component tests in `statement/statement.test.tsx`: on `results` and the Graveyard view the `h2 > button` "Try another statement" is `aria-expanded="false"`, its `aria-controls` target is `hidden`, and "Start again" is inside it; toggling flips `aria-expanded` and the `hidden` attribute and keeps focus on the button; the disclosure is collapsed again after leaving and re-entering the view, and stays open across a card answer; on `error` and `no-subscriptions` the panel is open with no disclosure; `disclosureFocusStep("drop-zone", true, false) === "open"`, `("drop-zone", true, true) === "claim"`, and any other target gives `"claim"`.
  - Existing tests, per "Existing tests that change": `slice-page.test.tsx` line 327, `landing-page.test.tsx` line 615, `graveyard-flow.test.tsx` line 442, `e2e/demo-path.spec.ts` line 184, `graveyard/share-panel.test.tsx` line 293 and `landing/landing-motion.test.tsx` line 51 click "Try another statement" before "Start again"; `slice-page.test.tsx` "Replace result" (around line 344) opens the disclosure, then the chip `UK_LABEL` `within` the list "Sample statements"; `graveyard-flow.test.tsx` lines 545–555: after "Skip for now" the list continues "Try another statement" then the four Footer tombstones, and a second case opens the disclosure and asserts the drop area, "Choose a file", the four Sample labels, "Start again", then the four stones; `e2e/landing.spec.ts` lines 99–101 click "Try another statement" first. "Gate keeps focus" (`graveyard-flow.test.tsx` lines 233–260) waits for task 21.
  - Run in `apps/web`: `npx vitest run` (the whole web suite); then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web`.
  - _Requirements: 3.7, 3.8, 12.5, 12.6, 13.3, 13.4_

- [x] 21. Focus handover and window drag (`slice/page-state.ts`, `statement/sample-chips.tsx`, `slice/drop-zone.tsx`, `slice/slice-page.tsx`)
  - In `page-state.ts`, as in Decision "Focus while another statement is read": add `"sample-chip"` to `FocusTarget`; `start` gains `from?: { target: "sample-chip"; id: string } | { target: "drop-zone" }`; when the new view's `origin` is `"other"` and `from` is set, `start` issues `focusRequest(model, from.target, from.id)`. The Landing view's controls never set `from`.
  - The gate's chips dispatch `start` with `from: { target: "sample-chip", id: fileName }` and carry `data-focus={focusKey({ target: "sample-chip", id: fileName })}`; the gate's drop area and file button dispatch `from: { target: "drop-zone" }`. Thread the `from` through `runAnalysis` without changing what it reads or does.
  - In `slice-page.tsx`, a `dragenter` listener on `window` opens the disclosure when `event.dataTransfer?.types` includes `"Files"`, the disclosure is shown and collapsed, and the Page is not `working`. It never moves focus and is removed on unmount.
  - Unit tests `slice/page-state.test.ts`: `start` with `from` from `results` and from the Graveyard view gives a `sample-chip` or `drop-zone` request with the next `seq`; `start` from the Landing view gives no request; `start` without `from` behaves as today. `page-state.property.test.ts` and `page-state.leave.property.test.ts` pass unchanged (the arbitrary may draw `from`).
  - Component tests in `statement/statement.test.tsx`: reading the UK chip from the open disclosure on `results` leaves `document.activeElement` on the UK chip of the working panel, `aria-disabled="true"`; a window `dragenter` with `types: ["Files"]` opens the disclosure without moving focus; with `types: ["text/plain"]` or while `working` it does nothing.
  - Existing tests: `graveyard-flow.test.tsx` lines 233–260, per its design row: renamed "Gate keeps focus on the same control while another statement is read"; it opens "Try another statement", clicks the chip `UK_LABEL` in the list "Sample statements", and during `working` `document.activeElement` is the button named `UK_LABEL` in the list "Sample statements" of the working panel, with `aria-disabled="true"`, in place of the same-element assertion.
  - Run in `apps/web`: `npx vitest run src/slice/page-state.test.ts src/slice/page-state.property.test.ts src/slice/page-state.leave.property.test.ts src/slice/statement src/slice/graveyard-flow.test.tsx src/slice/slice-page.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - _Requirements: 3.8, 12.5, 13.4_

- [x] 22. Grave and disclosure browser tests (`e2e/pro-polish.spec.ts`, `e2e/demo-path.spec.ts`)
  - In `e2e/pro-polish.spec.ts`, Grave drag-over: no reduced motion, dispatch `dragenter` with a `DataTransfer` holding a file on `[data-grave-drop]`; after 400 ms the ghost's computed `transform` is `matrix(1, 0, 0, 1, 0, 8)` and the rim glow's opacity is 1; after `dragleave` and 400 ms, `matrix(1, 0, 0, 1, 0, 32)` and 0. Reduced motion: the ghost stays at `matrix(1, 0, 0, 1, 0, 32)` and the rim glow reaches opacity 1. Run on the Landing view and on `results` with the disclosure open.
  - In `e2e/demo-path.spec.ts`, extend the path (Req 12.1): open and close "Try another statement" on `results`; the CSP, request, console and storage checks stay unchanged.
  - Run: `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts e2e/demo-path.spec.ts`, then the whole run; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: the `demo-path.spec.ts` extension only.
  - _Requirements: 3.6, 12.1, 13.6_

- [x] 23. Batch B checkpoint
  - Run from the repo root: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Check that `slice/sample-buttons.tsx` is gone and nothing imports it; that `git diff` shows no change to the files listed in task 16; and that each existing test changed in this batch matches a row of "Existing tests that change" or a note in tasks 19 to 21, and removes or widens no assertion.
  - Report any failure or gap as a finding; fix it here only if it is a one-line test or text change.
  - _Requirements: 12.1, 12.2, 13.2, 13.7_

- [x] 23.1. Batch B fix round (`review-batch-B.md`)
  - Apply every finding in `review-batch-B.md`: reviewer findings 1 to 9 as each "Fix:" line says (#6: test today's real pair; #9: add the disabled look, text stays at least 4.5:1; #3: record the decision in design.md under "Focus while another statement is read"; #5: add the Playwright assertion it names), and owner findings V1 to V3. V1 and V2 update design.md section "3. The grave drop zone ghost" to match.
  - Replace a pinned value only with the new exact value; never weaken or delete a test.
  - Append a `## Resolution` table to `review-batch-B.md` (finding, what changed, files, tests).
  - Rerun the task 23 checkpoint commands; all must pass.
  - _Requirements: 1.9, 3.4, 3.5, 3.7, 3.12, 3.14, 6.5, 12.4, 12.5, 12.9_

---

## Batch C: Button variants and small polish

Task 24 defines the variants and their contrast; tasks 25 to 27 apply them, one area each; task 28 adds the static check and task 29 the one-primary test, after every area is converted. Tasks 30 to 33 are the small polish of Requirement 10. The "Waiting chips" of task 40 and the "Next" placement of task 38 come later; until then "Answer now" is secondary and "Next" stays below the Stage, which keeps exactly one primary per Screen state either way.

- [x] 24. Button variants and their contrast (`slice/button-variants.ts`, `logic/design-tokens.ts`, `src/contrast.test.ts`)
  - Create `slice/button-variants.ts` with `ButtonVariant`, `VariantOptions { bare?; full?; inheritSize? }` and `buttonVariant(variant, opts)` returning `{ className, "data-variant" }`, with the base, `primary`, `secondary`, `tertiary`, `danger` and `danger-quiet` classes of design "Button variants". `danger-quiet` reports `data-variant="danger"`; `bare` adds `BARE_FOCUS`; `full` adds `w-full`; `inheritSize` leaves out `text-small`. No `opacity-*` class.
  - In `logic/design-tokens.ts`, export `OUTLINE_ALPHA = 0.5`, `OUTLINE_DISABLED_ALPHA = 0.45`, `DANGER_TEXT_BLOOD = 0.8`, `DANGER_QUIET_ALPHA = 0.85`, `PRIMARY_DISABLED_MOSS = 0.7` and `FOOTNOTE_ALPHA = 0.8` (`PIT_GLOW_ALPHA` is there from task 17).
  - Unit tests `slice/button-variants.test.ts`: each variant's class string contains the base classes and `rounded-control`, its colour classes, and no `opacity-`; `data-variant` per variant, with `danger-quiet` → `"danger"`; `bare` adds `BARE_FOCUS`; `full` adds `w-full`; `inheritSize` drops `text-small`; the alpha classes (`border-bone/50`, `aria-disabled:border-bone/45`, `border-blood/85`, the 80 % blood mix, the 70 % moss mix) match the exported alphas.
  - In `src/contrast.test.ts`, the `describe("pro-polish contrast (Req 12.4)")` block builds C and G from `tokenHex` with the `over` helper, asserts `#1e232e` and `#141721`, and asserts every variant row of "Colours and contrast" (secondary, primary, danger, quiet danger, at rest, hover and `aria-disabled`; tertiary and the Home control on S), plus the Footer stone, Footer outline, moss outline, Reaper description and Privacy note rows.
  - Run in `apps/web`: `npx vitest run src/slice/button-variants.test.ts src/contrast.test.ts src/slice/logic/design-tokens.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 2.11, 6.1, 6.2, 6.4, 12.4_

- [x] 25. Variants on the chrome, the Statement panel and the state views (`chrome/leave-question.tsx`, `statement/*`, `slice/drop-zone.tsx`, `slice/slice-page.tsx`, `slice/error-view.tsx`, `slice/no-subscriptions-view.tsx`, `landing/primary-action.tsx`)
  - Apply Req 6.5: "Stay" and "Leave" secondary; "Choose a file" secondary (on the pit); the disclosure button tertiary with `bare` and `inheritSize`; "Start again" inside the disclosure tertiary with `bare`; on `error` and `no-subscriptions`, "Start again" primary and "Open the graveyard" secondary inside the state Card. `PrimaryAction` keeps its classes and gains `data-variant="primary"` (and `data-exempt="primary-action"`); the Secondary samples get `data-exempt="secondary-sample"`. Each converted element spreads `{...buttonVariant(…)}` inline in its own tag and keeps its `type`, `ref`, `aria-*` and handlers. Remove the replaced class strings; no `opacity-60` stays on a converted control.
  - Component tests: in `chrome/chrome.test.tsx`, "Stay" and "Leave" have `data-variant="secondary"`; in `statement/statement.test.tsx`, "Choose a file" `secondary`, the disclosure button and "Start again" `tertiary`; in a new case of `slice/slice-page.test.tsx`, on `error` "Start again" is `primary` and "Open the graveyard" `secondary`, both inside the state Card.
  - Run in `apps/web`: `npx vitest run src/slice/chrome src/slice/statement src/slice/slice-page.test.tsx src/slice/landing-page.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change; if one asserts today's class string on a converted control, stop and report it (no such row is in the design).
  - _Requirements: 6.2, 6.3, 6.5, 6.6_

- [x] 26. Variants on the Rising, the card and the Helper panel (`graveyard/rising-view.tsx`, `graveyard/undead-card.tsx`, `graveyard/cancel-helper.tsx`)
  - In `rising-view.tsx`: "Next" and "Visit the graveyard" primary (keeping `aria-disabled` while `burying`, Req 6.6); "Open the graveyard" and "Memory settings" secondary.
  - In `undead-card.tsx`: the answer block ("Yes, let it rest", "No, bury it", "Skip for now") renders only while `phase === "undead"`; "No, bury it" keeps its card classes and gains `data-variant="primary"`; the card's controls carry `data-exempt="card"`. Nothing else about the card's look changes.
  - In `cancel-helper.tsx`: the cancel link and the App-store links (button-styled `a`) secondary; Copy and "Open in my email app" secondary. Texts, `href`s, names and notices unchanged.
  - Component tests: `graveyard/undead-card.test.tsx` checks the answer block is present in `undead` and absent in `condemned` and `sinking`, and "No, bury it" has `data-variant="primary"`; `graveyard/rising-view.test.tsx` checks "Next" is `primary` and `aria-disabled="true"` while `burying`, and "Open the graveyard" is `secondary`; `graveyard/cancel-helper.test.tsx` checks the link and the email controls are `secondary`.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard src/slice/graveyard-flow.test.tsx src/slice/graveyard-flow.motion.test.tsx src/slice/graveyard-flow.reduced.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/layout.spec.ts e2e/demo-path.spec.ts`, then the whole run.
  - Existing tests, per the `undead-card.test.tsx` row: cases that find the answer pair during `condemned` or `sinking` expect it absent there and present in `undead`.
  - _Requirements: 6.3, 6.5, 6.6_

- [x] 27. Variants on the Graveyard view, Memory and Share (`graveyard/graveyard-view.tsx`, `graveyard/memory-panel.tsx`, `graveyard/share-panel.tsx`)
  - In `graveyard-view.tsx`: "How to cancel" secondary; "Unbury" `danger-quiet`; "Back to the rising" and "Back to the start" secondary; "Bury after all" secondary; "Answer now" secondary (task 40 replaces it with Waiting chips).
  - In `memory-panel.tsx`: "Forget everything" danger; in its confirmation, "Cancel" secondary and "Forget" danger.
  - In `share-panel.tsx`: the next step is primary ("Make an image" before an image exists, then "Share image" or "Save image"); "Make the image again" and the other controls secondary.
  - Component tests: in `graveyard/graveyard-view.test.tsx`, `graveyard/memory-panel.test.tsx` and `graveyard/share-panel.test.tsx`, each control above has its `data-variant`; the Share panel has exactly one `primary` before and after an image (stubbed as in `test-share.ts`).
  - Run in `apps/web`: `npx vitest run src/slice/graveyard src/slice/graveyard-memory-flow.test.tsx src/slice/graveyard-flow.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 6.5, 9.7, 9.8_

- [x] 28. Variants static check (`src/static-checks.test.ts`)
  - Add the "Variants (Req 6.3)" case of design "Static checks": every `<button`, `<motion.button`, and every `<a` or `<motion.a` with `min-h-11` or `rounded-control` in its tag, in non-test `.tsx` under `src/slice/**`, has `data-variant`, spreads an inline `{...buttonVariant(` call in its own opening tag, or has `data-exempt`. Spreading a variable is reported. Text scan, no AST.
  - Fixture strings, one per form (`<button` with neither, `<motion.button` with neither, `{...v}`), are each reported, so the check cannot pass vacuously.
  - Fix any control the check reports in the file that owns it, using the Req 6.5 table; name each fix in the task notes.
  - Run in `apps/web`: `npx vitest run src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 6.3_

- [x] 29. One primary per Screen state (`slice/one-primary.test.tsx`)
  - Tests only. Create `slice/one-primary.test.tsx` as in the design row: for each Screen state of Req 6.5 reached from the US Sample (`ask`, `rested`, `burying`, `buried`, all answered via a 1-subscription CSV, no undead via a CSV whose only subscription is `ended`, `working` with a held frame, `error`, `no-subscriptions`, the Leave question open, the Forget confirmation open), count `[data-variant="primary"]` and the interactive elements (`button, a[href], [role=button], input`) whose `classList` contains `bg-moss`: both 0 in the "none" rows and 1 elsewhere.
  - In the same file, `describe("Graveyard view rows")`: P3 as a fast-check property over `pageGraveyardArb` with at most 20 records, rendering `GraveyardView` alone with the `haunt` from `deriveHaunt` (from `idle` and from `results`), before an image and with a stubbed image, with a 30 s timeout and the default 100 runs.
  - In the same file, assert that no `[data-variant="secondary"]` or `[data-variant="danger"]` element is outside an ancestor with `bg-fog`, `bg-fog/95` or `data-grave-drop`, in each state above.
  - If a test fails, fix the owning component (tasks 25 to 27) and name it in the task notes; do not weaken the test.
  - Run in `apps/web`: `npx vitest run src/slice/one-primary.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 6.5, 6.7, 13.5_

- [x] 30. Muted footnote (`graveyard/rising-view.tsx`, `slice/no-subscriptions-view.tsx`)
  - Render each note of `assumedValueNotes` in `StatementSummary` and `NoSubscriptionsView` as a `p` with `text-caption sm:text-small text-bone/80`, after the main summary line. Texts unchanged.
  - Add the "Muted footnote" contrast row (`--bone` 80 % on C, at least 4.5:1, using `FOOTNOTE_ALPHA`) to `src/contrast.test.ts`.
  - Component tests: in `graveyard/rising-view.test.tsx`, a statement with no currency shows the note with its exact text in a `p` with `text-caption`, `sm:text-small` and `text-bone/80`, after the summary line; the same for `NoSubscriptionsView` in a new case of `slice/slice-page.test.tsx`.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/rising-view.test.tsx src/slice/slice-page.test.tsx src/contrast.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 10.1, 12.4_

- [x] 31. Progress dots logic (`logic/progress-dots.ts`)
  - Create `logic/progress-dots.ts` with `PROGRESS_DOTS_MAX = 12`, `ProgressDot`, `progressDots(model)` and `progressCounts(model)`, as in design "Progress dots": both `null` unless `view.kind === "results"`; order from `risingOrder(outcome.subscriptions, outcome.statement)`; `answered` when the Graveyard holds a Current record for the id; `progressDots` is `null` when more than 12 have risen.
  - Unit tests `logic/progress-dots.test.ts`: `null` outside `results`; 3 risen, 1 answered → `[true, false, false]` in the original order after a Skip; 13 risen → `null` and `progressCounts` `{ answered, risen: 13 }`.
  - Property test `logic/progress-dots.property.test.ts`: P4 over `pageModelArb` filtered to `results`.
  - Run in `apps/web`: `npx vitest run src/slice/logic/progress-dots.test.ts src/slice/logic/progress-dots.property.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 10.2, 10.3, 13.5_

- [x] 32. Progress dots on the Rising (`graveyard/rising-view.tsx`)
  - After "N of M answered" (text unchanged), render an `aria-hidden="true"` row of dots from `progressDots`: `rounded-pill` dots, `bg-moss` filled for answered and a `border-bone/45` outline for unanswered, gap `gap-2`, no wrap. When `progressDots` is `null`, render the bar from `progressCounts`: an 8 px `w-24 rounded-pill bg-bone/20` track with a `bg-moss` fill of width `answered / risen`. No motion.
  - Add the Progress dot (filled, outline) and Progress bar contrast rows to `src/contrast.test.ts`.
  - Component tests in `graveyard/rising-view.test.tsx`: the dot count equals M, the filled count equals the number in the visible text, the order follows the original Rising order after a Skip, the row is `aria-hidden`; with 13 risen the bar shows and no dots; the Live region text is unchanged.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/rising-view.test.tsx src/slice/one-primary.test.tsx src/contrast.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/layout.spec.ts` (no sideways scroll at 320 px), then the whole run.
  - Existing tests: none change.
  - _Requirements: 10.2, 12.4, 12.11_

- [x] 33. Finite card sway with settle (`graveyard/motion.ts`, `graveyard/undead-card.tsx`, `src/static-checks.test.ts`, `e2e/pro-polish.spec.ts`)
  - In `motion.ts`, export `CARD_SWAY` (`rotate: [0, -0.9, 0.9, -0.6, 0.6, 0]`, `duration: 3.2`, `delay: 1.2`, `easeInOut`, `repeat: 0`) and `CARD_SWAY_SETTLE` (0.15 s easeOut) and remove the infinite sway values.
  - In `undead-card.tsx`, as in "Signature moments: 1": the sway layer uses `CARD_SWAY` while `undead` and not `stilled`; `onPointerEnter` (when `pointerType !== "touch"`) and `onFocus` (only when `event.target.matches("button:focus-visible")`) set `stilled`, after which `animate={{ rotate: 0 }}` with `CARD_SWAY_SETTLE`; `stilled` never resets (the card is keyed by subscription id). `condemned` settles to 0 with `CARD_SWAY_SETTLE`; `sinking`, `resting`, the rise, shudder and sink are unchanged; under reduced motion `rotate: 0`, `duration: 0`.
  - Unit tests: `graveyard/motion.test.ts` checks `CARD_SWAY.transition.repeat` is a finite integer, `delay + duration × (repeat + 1) <= 5`, and the last `rotate` keyframe is 0. `graveyard/undead-card.test.tsx` checks that after `pointerenter`, or a focus on a button whose `matches` is stubbed to match `:focus-visible`, the sway layer's `animate` is `{ rotate: 0 }` and stays so after `pointerleave` and blur; focus on the card heading leaves the sway running.
  - Static check "Motion (Req 12.7, 12.8)" in `src/static-checks.test.ts`: no `Infinity` in non-test source under `slice/` (the fog drift went in task 12); no `@keyframes` outside `landing-motion.css`; no `requestAnimationFrame` or `setInterval` under `chrome/` and `statement/`. Also the P7 key check: the `animate`, `variants` and `whileHover` objects of `undead-card.tsx`, `drop-zone.tsx`, `grave-art.tsx` and `footer-tombstone.tsx` use only `x`, `y`, `rotate`, `scaleY`, `opacity`.
  - Browser test in `e2e/pro-polish.spec.ts`, Sway ends: 1280 × 800, no reduced motion, mouse away from the card; `t0` when the first card heading has focus; at `t0 + 2.5 s` the sway layer's computed `transform` is not identity; at `t0 + 5.5 s` and `t0 + 6.0 s` it is `none` or identity, and `document.getAnimations()` holds no running animation on it.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/motion.test.ts src/slice/graveyard/undead-card.test.tsx src/slice/graveyard-flow.motion.test.tsx src/slice/graveyard-flow.reduced.test.tsx src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts`, then the whole run.
  - Existing tests: none change; if a motion test asserts `repeat: Infinity` on the sway, stop and report it (no such row is in the design).
  - _Requirements: 10.4, 10.5, 10.6, 10.7, 12.7, 12.8_

- [x] 34. Batch C checkpoint
  - Run from the repo root: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Check that `grep -rn "Infinity" apps/web/src/slice --include=*.ts --include=*.tsx` finds only test files; that `git diff` shows no change to the files listed in task 16; and that each existing test changed in this batch matches a row of "Existing tests that change" or a note in task 26, and removes or widens no assertion.
  - Report any failure or gap as a finding; fix it here only if it is a one-line test or text change.
  - _Requirements: 6.7, 10.7, 12.8, 13.2, 13.7_


- [x] 34.1. Batch C fix round (`review-batch-C.md`)
  - Apply every finding in `review-batch-C.md`: reviewer findings 1 to 10 as each "Suggested fix" says (#6: add the R13.1 note and the cancel-helper spec note; #10: update the design row), and owner finding V1.
  - Replace a pinned value only with the new exact value; never weaken or delete a test (finding 2 restores real click checks).
  - Append a `## Resolution` table to `review-batch-C.md` (finding, what changed, files, tests).
  - Rerun the task 34 checkpoint commands including the whole e2e run; all must pass.
  - _Requirements: 6.2, 6.3, 6.5, 10.2, 10.3, 12.5, 12.9, 13.1_

---

## Batch D: Wide layout, Seal the grave and the Graveyard view

Tasks 35 and 36 build the Wide layout; tasks 37 and 38 change "Seal the grave"; tasks 39 to 41 the Graveyard view and Memory; task 42 adds the Page-level tab-order and outline tests; task 43 the size and radius checks; task 44 the notes in earlier specs; task 45 is the final checkpoint.

- [ ] 35. Wide views, the column and the moon (`slice/page-state.ts`, `slice/slice-page.tsx`, `chrome/compact-header.tsx`, `slice/site-footer.tsx`)
  - In `page-state.ts`, export `isWideView(model)` as in design "Page model".
  - In `slice-page.tsx`: `wide = isWideView(model)`; Non-landing `main` keeps `max-w-[640px] px-4` and adds `lg:max-w-[1184px] lg:px-8` when `wide`; `CompactHeader` and `SiteFooter` get `wide` and take the same column; `NightScene` gets `skyMoon={!landing && !wide}`.
  - Unit tests `slice/page-state.test.ts`: `isWideView` for every view kind × both screens (`working` on `main` false; the Landing view false; `results` either screen and the Graveyard screen true; `error` and `no-subscriptions` on `main` false).
  - Existing tests, per "Existing tests that change": `landing-page.test.tsx` "Non-landing views" also expects `lg:max-w-[1184px]` on `main` for `results` and the Graveyard view (the rest of the row was done in task 19); `e2e/landing.spec.ts` lines 107–160 "non-landing moon": for `results` and `graveyard` at 1024 px and wider, `count === 1` and `shown === false`; `error`, `no-subscriptions` and `working-other` keep every check.
  - Run in `apps/web`: `npx vitest run src/slice/page-state.test.ts src/slice/landing-page.test.tsx src/slice/chrome src/slice/graveyard/night-scene.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts`, then the whole run.
  - _Requirements: 5.3, 7.1, 7.2, 7.4, 7.5_

- [ ] 36. Rising grid with the statement slot (`graveyard/rising-view.tsx`, `slice/slice-page.tsx`, `e2e/pro-polish.spec.ts`, `e2e/layout.spec.ts`)
  - `RisingViewProps` gains `statementSlot: ReactNode`. The root becomes the grid of design "Rising and Wide layout" (`grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,22rem)] lg:gap-x-8`, areas `stage summary` / `stage statement`); the summary panel is a Card (`rounded-card bg-fog/95 p-4 sm:p-6`) with `lg:sticky lg:top-4 lg:self-start`; DOM order stays summary, stage, statement. In `slice-page.tsx`, the `results` case of `MainState` passes the Statement disclosure as `statementSlot` and renders no separate gate on the main screen.
  - Component tests in `graveyard/rising-view.test.tsx`: the slot renders after the Stage in DOM order; the summary panel comes first.
  - Browser tests in `e2e/pro-polish.spec.ts`, Wide layout: at 1280 × 800 and 1600 × 900, the Stage box's right edge is left of the summary box's left edge and they do not overlap. The Graveyard grid check comes with the grid in task 39.
  - Existing tests, per the `layout.spec.ts` line 85 row: "each card is whole inside the stage and the viewport, also after Next and Skip" also runs at 1280 × 800 and 1600 × 900, its assertions unchanged.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/rising-view.test.tsx src/slice/graveyard-flow.test.tsx src/slice/slice-page.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts e2e/layout.spec.ts`, then the whole run.
  - _Requirements: 7.1, 7.3, 7.4, 7.6, 12.6_

- [ ] 37. Email disclosure in "Seal the grave" (`graveyard/cancel-helper.tsx`)
  - For `help.kind === "link"`, as in design "Seal the grave": the order heading, `panelLine`, cancel link, steps, App-store note and links, checked line, then the Email disclosure: a secondary `button` with `aria-expanded`, `aria-controls`, `aria-label={withFor(WRITE_INSTEAD, displayName)}`, and a `div hidden={!emailOpen}` holding `BRACKETS_NOTE`, the email text (`data-email-text`), Copy, "Open in my email app" and `MAILTO_HINT`. `emailOpen` is component state, `false` on mount. `LINK_INTRO` is no longer rendered (the constant stays exported). For `email-only` the email part shows open after `EMAIL_ONLY_INTRO`, with no disclosure. The panel keeps its `section`, `aria-labelledby`, heading name, `NEW_TAB_TEXT` descriptions, `helperPanelMotion` and the `rounded-card` `bg-fog` Card.
  - Component tests in `graveyard/cancel-helper.test.tsx`: link-entry order; "Write to them instead for Netflix" collapsed with `hidden` content; opening it shows the email, Copy and mailto with today's names and notices; email-only shows the email with no disclosure.
  - Existing tests, per "Existing tests that change": `cancel-helper.test.tsx` line 137 helper and lines 238, 312 click "Write to them instead for Netflix" first, and the tab-order list gains it before the email controls; line 220 expects `queryByText(LINK_INTRO)` to be `null` for a link entry and the disclosure button to be the element after the checked line; `graveyard-flow.test.tsx` lines 655, 683 open the disclosure in the Graveyard Helper panel first; `e2e/demo-path.spec.ts` lines 142–146 click `panel.getByRole("button", { name: "Write to them instead for Netflix" })` first; `e2e/layout.spec.ts` line 197 "Helper panel fits …" clicks it before measuring.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/cancel-helper.test.tsx src/slice/graveyard-flow.test.tsx src/slice/graveyard/graveyard-view.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/layout.spec.ts e2e/demo-path.spec.ts`, then the whole run.
  - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.8, 13.3_

- [ ] 38. "Next" inside the Helper panel (`graveyard/cancel-helper.tsx`, `graveyard/burial-stage.tsx`, `graveyard/rising-view.tsx`)
  - `CancelHelperProps` gains `next?: ReactNode`, rendered last in a `div.mt-6`. `BurialStage` passes it through. `RisingView` passes the primary "Next" / "Visit the graveyard" button as `next` when the stage is `buried` and does not render it below the Stage then; in `rested` and `burying` it stays below the Stage as today (design "Next" placement table). The Graveyard view passes no `next`.
  - Component tests: `graveyard/cancel-helper.test.tsx` checks `next` renders as the last child; `graveyard/rising-view.test.tsx` checks the placement per stage; a case in `graveyard-flow.test.tsx` checks that from the stage tombstone, which has focus after the rise, "Next" is reached in 3 Tab presses when `appStoreMayApply` is false and 5 when it is true.
  - Existing tests, per "Existing tests that change": `rising-view.test.tsx` cases that find "Next" below the Stage while `buried` find it as the last control inside the region "Seal the grave: <name>"; `e2e/layout.spec.ts` line 85 finds "Next" inside that region after a burial.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard src/slice/graveyard-flow.test.tsx src/slice/one-primary.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/layout.spec.ts e2e/demo-path.spec.ts`, then the whole run.
  - _Requirements: 6.5, 8.4, 8.5, 8.7_

- [ ] 39. Tombstone grid on ground lines and the view's Cards (`graveyard/graveyard-view.tsx`)
  - As in design "Graveyard view and Memory": split the single `bg-fog/95` panel into Cards (heading and totals; "Resting" and "Already stopped"; Share; "Not answered yet"; Memory; a closing Card with "Back to the rising" / "Back to the start"). The tombstone list becomes `ul.grid.grid-cols-1.gap-x-4.gap-y-8.sm:grid-cols-2.lg:grid-cols-3.min-[1600px]:grid-cols-4` with no Card; each `li` is `flex flex-col` holding the `Tombstone`, a `GroundLine` (`-mx-2`), and the actions plate (`flex flex-wrap gap-2 rounded-card bg-fog/95 p-2`) with "How to cancel" then "Unbury". Ended subscriptions show no "How to cancel". An open Helper panel is a `col-span-full` `li`. The heading and "You buried … a year." lines stay first with their text and `Money` figures.
  - Component tests in `graveyard/graveyard-view.test.tsx`: in each item "How to cancel" comes before "Unbury" (named "Unbury <Display name>"); each item has one `aria-hidden` ground line; the heading keeps `font-display` and its focus target; "Back to the rising" is the last control of the view.
  - Browser test in `e2e/pro-polish.spec.ts`: at 1280 × 800, a Graveyard of 3 buried records has 3 tombstones sharing the first row's `y`.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard src/slice/one-primary.test.tsx src/slice/graveyard-memory-flow.test.tsx`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts`, then the whole run.
  - Existing tests: none change; tests that find a tombstone's actions by name pass as written.
  - _Requirements: 7.2, 9.1, 9.2, 9.7, 9.8, 12.11_

- [ ] 40. Waiting chips (`graveyard/graveyard-view.tsx`)
  - "Not answered yet" keeps its `h3`; each queued subscription becomes `button type="button" data-exempt="waiting-chip"` (`min-h-11 rounded-control border border-bone/50 bg-fog px-4 text-small`) in `ul.flex.flex-wrap.gap-2`, with visible text `` `${displayName} · ${yearlyText} a year` `` ("about " and " (estimate)" as today when `cadenceAssumed`) and `aria-label={`Answer now ${visibleText}`}`. Activating it dispatches `answer-now`.
  - Add the Waiting chip text and outline contrast rows to `src/contrast.test.ts`.
  - Component tests in `graveyard/graveyard-view.test.tsx`: visible text and exact name for a fixture with and without `cadenceAssumed`; activation dispatches `answer-now` with the id.
  - Existing tests, per "Existing tests that change": `slice-page.test.tsx` line 263, `graveyard-view.test.tsx` lines 142, 165 and `graveyard-flow.test.tsx` lines 416, 420 use the exact name `` `Answer now ${visibleText}` ``, with `visibleText` built from the fixture's Display name and yearly cost through the same `Money` formatting the chip uses.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/graveyard-view.test.tsx src/slice/graveyard-flow.test.tsx src/slice/slice-page.test.tsx src/slice/one-primary.test.tsx src/contrast.test.ts src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - _Requirements: 9.3, 12.4, 13.3_

- [ ] 41. Memory toggle, short sentence and "What is kept?" (`graveyard/memory-panel.tsx`, `logic/memory-text.ts`)
  - In `memory-text.ts`, add `MEMORY_SHORT` = "Kept only in this browser, on this device.".
  - In `memory-panel.tsx`, the order of Req 9.4: `h3` "Memory"; a `label` (`flex min-h-11 items-center gap-2`) holding the checkbox drawn as a switch (`appearance-none`, 44 × 24 px `rounded-pill` track, `--bone/45` border off, `--moss` fill on, a 16 px knob placed by `checked:` classes, no transition) and `MEMORY_LABEL`; `p#shortId` `MEMORY_SHORT`; the "What is kept?" tertiary disclosure button and `p#hintId hidden={!open}` `MEMORY_HINT`; the notes; "Forget everything" and its confirmation, unchanged. The checkbox keeps `type="checkbox"` (no `role="switch"`), `data-focus="memory-checkbox"`, its change handler, and `aria-describedby={`${shortId} ${hintId}`}`.
  - Add the toggle off and on contrast rows and `MEMORY_SHORT` to `src/contrast.test.ts`; add `MEMORY_SHORT` to the banned-word check of `logic/chrome-text.test.ts` or `logic/memory-text.test.ts`.
  - Component tests in `graveyard/memory-panel.test.tsx`: the order above; `aria-describedby` lists the short id then the hint id and both texts resolve; the hint is in the DOM and `hidden` until "What is kept?" is opened; toggling dispatches `set-memory` as today; "Memory settings" on the Rising still focuses the checkbox.
  - Existing tests, per "Existing tests that change": `memory-panel.test.tsx` line 87 and `graveyard-memory-flow.test.tsx` lines 248, 308 click "What is kept?" before `getByText(MEMORY_HINT)`, and the `aria-describedby` check expects the two ids; `memory-panel.test.tsx` line 145 expects `[MEMORY_SHORT, MEMORY_HINT, NEWER_NOTE, WRITE_FAILED_NOTE, leftOutNote(2)]`; `logic/memory-text.test.ts` adds `MEMORY_SHORT` exactly.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard/memory-panel.test.tsx src/slice/graveyard-memory-flow.test.tsx src/slice/logic src/contrast.test.ts`; then the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - _Requirements: 9.4, 9.5, 9.6, 9.9, 12.4_

- [ ] 42. Page tab orders, outlines and Live region silence (`slice/pro-polish-page.test.tsx`)
  - Tests only. Create `slice/pro-polish-page.test.tsx` with the tab orders of design "Component tests" by accessible name from `document.body`, Memory off, disclosure collapsed: `results` `ask`; the same with the disclosure open; `results` `buried` (the stage tombstone, the cancel link, any App-store links, "Write to them instead for …", "Next"); the Graveyard view; `error`; `error` and `no-subscriptions` with a restored Graveyard; the Landing view (with "Open the graveyard" of the Return notes when a Graveyard is restored).
  - Heading outlines of `results` and the Graveyard view: one `h1` named `HOME_CONTROL_NAME`, no skipped level (P5).
  - Req 12.10: the Live region text is the same before and after using the Home control, the Leave question, "Try another statement", "Write to them instead", "What is kept?" and each Footer tombstone.
  - Progress dots and the footnote rendered in the Page from the US Sample.
  - If a test fails, fix the owning component and name it in the task notes; do not weaken the test.
  - Run in `apps/web`: `npx vitest run src/slice/pro-polish-page.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: none change.
  - _Requirements: 1.2, 12.5, 12.6, 12.10, 13.4_

- [ ] 43. Size checks and the radius static check (`e2e/pro-polish.spec.ts`, `src/static-checks.test.ts`)
  - Browser test in `e2e/pro-polish.spec.ts`, Sizes: at 320 × 568 and at 390 × 844 with 200 % root font size, for the Landing view, `results` (disclosure open), the Graveyard view (with a restored Graveyard, Helper panel and Email disclosure open), `error` and `no-subscriptions`: `scrollWidth <= innerWidth`, and no text range outside its nearest clipping ancestor (the helpers in `e2e/content-boxes.ts`). The existing 320 × 568 Fold check passes unchanged.
  - Static check "Radius (design tokens)" in `src/static-checks.test.ts`: in the files this spec creates or restyles (a constant list in the test, without `undead-card.tsx`), no `rounded`, `rounded-sm`, `rounded-lg`, `rounded-xl` or `rounded-2xl` remains. Replace any found with `rounded-control` or `rounded-card` in the owning file.
  - Run in `apps/web`: `npx vitest run src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/pro-polish.spec.ts`, then the whole run.
  - Existing tests: none change.
  - _Requirements: 2.10, 12.9, 13.6_

- [ ] 44. Notes in earlier specs (`.kiro/specs/landing-polish/requirements.md`, `.kiro/specs/graveyard-ui/requirements.md`, `.kiro/specs/graveyard-memory/requirements.md`, `.kiro/specs/cancel-helper/requirements.md`, `.kiro/specs/vertical-slice/requirements.md`, `.kiro/specs/landing-nits/requirements.md`, `.kiro/specs/share-card/requirements.md`)
  - Append each note of design "Notes to add to earlier specs" to the named criterion or decision, in the existing style "(Changed by pro-polish: …)". Change no other text in those files. The notes are checked by reading.
  - _Requirements: 13.1_

- [ ] 45. Batch D checkpoint, full verification and traceability review
  - Run from the repo root: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Searches that must find nothing in the new and changed non-test files under `src/slice/chrome`, `src/slice/statement`, `button-variants.ts`, `logic/chrome-text.ts`, `logic/progress-dots.ts`, `logic/design-tokens.ts`, `site-footer.tsx`, `drop-zone.tsx`, `slice-page.tsx` and the changed `graveyard/` files: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `history.`, `location.`, `eval`, `new Function`, a hex colour literal, a `disabled` attribute, a positive `tabindex`, `<link`, `<image`, `<foreignObject`, `<text`, `Infinity`, and any import from `packages/core/src`.
  - Check that `git diff` shows no change to the files listed in task 16; that `public/` holds only `favicon.svg`, `og-image.svg` and `og-image.png`; that the `privacy-guard` hook and the Playwright request checks pass with no new exception; and that each changed existing test matches a row of "Existing tests that change" or a task note, and removes or widens no assertion (Req 13.2).
  - Traceability: confirm that every acceptance criterion in `requirements.md` (1.1–1.11, 2.1–2.14, 3.1–3.14, 4.1–4.7, 5.1–5.6, 6.1–6.7, 7.1–7.6, 8.1–8.8, 9.1–9.9, 10.1–10.7, 11.1–11.6, 12.1–12.11, 13.1–13.8) is named in the `_Requirements:_` line of at least one task and in the table below, and that each named test exists and passes.
  - Req 13.8 is manual: screenshots of the built site at 1280 × 800 and 390 × 844 (results after Summon, after one Bury with "Seal the grave", the Graveyard view) are taken by hand before release; no baseline is committed. Record it as a release step, not done by this task.
  - Report any gap as a finding instead of fixing it here, unless the fix is a one-line test or text change.
  - _Requirements: all; in particular 12.1, 12.2, 13.2, 13.7, 13.8_

### Traceability

"CH" is `slice/chrome/chrome.test.tsx`; "STT" is `slice/statement/statement.test.tsx`; "PS" is `slice/page-state.test.ts`; "PL" is `slice/page-state.leave.property.test.ts`; "SPT" is `slice/slice-page.test.tsx`; "LP" is `slice/landing-page.test.tsx`; "GF" is `slice/graveyard-flow.test.tsx`; "GMF" is `slice/graveyard-memory-flow.test.tsx`; "OP" is `slice/one-primary.test.tsx`; "PPT" is `slice/pro-polish-page.test.tsx`; "TXT" is `logic/chrome-text.test.ts`, `logic/landing-text.test.ts` and `logic/memory-text.test.ts`; "MO" is `graveyard/motion.test.ts`; "BV" is `slice/button-variants.test.ts`; "CT" is `src/contrast.test.ts`; "ST" is `src/static-checks.test.ts`; "PP" is `e2e/pro-polish.spec.ts`; "SP" is `e2e/share-preview.spec.ts`; "LS" is `e2e/landing.spec.ts`; "LY" is `e2e/layout.spec.ts`; "DP" is `e2e/demo-path.spec.ts`.

| Req | Covered by | Task |
| --- | --- | --- |
| 1.1 | CH (no tagline); `savings-counter.test.tsx` (compact); PP (header ≤ 88 px, one row at 360 px) | 4, 6, 9 |
| 1.2 | CH (one `h1`, Home control name and content); `BrandMark` size test; PPT (outlines, P5) | 4, 6, 42 |
| 1.3 | PS (`go-home` table); CH (from `error`, Primary action focused, Graveyard kept) | 2, 6 |
| 1.4 | CH (question first in `main`, "Stay" focused, second press, closes on view change) | 5, 6 |
| 1.5 | CH (Stay, Escape, Leave) | 5, 6 |
| 1.6 | CH (inline group, no Live region text) | 5, 6 |
| 1.7 | CH (`aria-disabled` while `working`, focus kept) | 6 |
| 1.8 | CH (Landing `h1` has no button) | 6 |
| 1.9 | PS (`reset`, `back-to-start` unchanged); CH ("Start again" asks nothing) | 2, 6 |
| 1.10 | PS; PL (P1); arbitrary coverage test in `logic/test-arbitraries.test.ts` | 2, 3 |
| 1.11 | PS; PL (P2) | 2, 3 |
| 2.1 | CH (DOM order, no heading) | 8 |
| 2.2 | CH (four stones, texts, targets); SPT (3 links) | 8 |
| 2.3 | CH (description, `aria-describedby`); LS ("footer reaper description spans the row under the stones") | 8, 9 |
| 2.4 | CH (`target`, `rel`, `NEW_TAB_TEXT`, names) | 8 |
| 2.5 | CH ("Privacy note" focus on Landing and `results`, URL and Live region unchanged) | 8 |
| 2.6 | CH (`PRIVACY_NOTE` once, `tabindex="-1"`) | 8 |
| 2.7 | ST (art); PP (stone ≥ 44 × 44, ≥ 96 px wide) | 7, 9 |
| 2.8 | MO (≤ 0.3 s, offsets); PP (peek by mouse and focus, touch tap) | 7, 9 |
| 2.9 | CH (no ghost under reduced motion); PP (reduced motion) | 7, 9 |
| 2.10 | PP (2 × 2 grid, one row, sizes at 200 %) | 9, 43 |
| 2.11 | CT (Footer rows); PP (focus ring not covered) | 8, 9, 24 |
| 2.12 | ST (URLs); CH (no `img`); DP (requests) | 8 |
| 2.13 | TXT (`BUILT_WITH_KIRO`, `KIRO_LINK`); CH (no "Built with Kiro." sentence) | 8 |
| 2.14 | Review: the stones are controls with hover and focus feedback | 7 |
| 3.1 | TXT; STT (panel order, headings); LP (outline) | 2, 15, 19 |
| 3.2 | TXT (`STATEMENT_TIP`); STT (Tip once) | 15, 19 |
| 3.3 | STT (drop-area role, name, keys, texts, `accept`) | 18 |
| 3.4 | ST (art); CT (grave rows) | 17, 18 |
| 3.5 | STT (button not inside `[role=button]`) | 18 |
| 3.6 | MO (grave timings); PP (drag-over, reduced motion) | 17, 18, 22 |
| 3.7 | STT (disclosure, `hidden`, open on `error` and `no-subscriptions`) | 20 |
| 3.8 | STT (`disclosureFocusStep`, toggle keeps focus, window `dragenter`) | 20, 21 |
| 3.9 | STT (chips list, names, order, `aria-disabled`) | 19 |
| 3.10 | LP (no chips on the Landing view) | 19 |
| 3.11 | STT, LP (no "Or try a sample statement" heading) | 19 |
| 3.12 | Review: grave, ghost and chips do theme work | 17, 19 |
| 3.13 | STT (drop on "Choose a file", drag-over held across it) | 18 |
| 3.14 | TXT (`TAP_TO_CHOOSE`); STT (`useHoverNone`, resting text) | 2, 17, 18 |
| 4.1 | SP (every tag and value) | 11 |
| 4.2 | ST (PNG IHDR and size); manual look at the export | 10 |
| 4.3 | ST (preview SVG) | 10 |
| 4.4 | `og-image.export.spec.ts` skipped by default | 10 |
| 4.5 | SP (CSP tag first); DP (no image request); `csp-plugin.test.ts` unchanged | 11 |
| 4.6 | ST (three URLs in `landing-text.ts`) | 8, 11 |
| 4.7 | SP | 11 |
| 5.1 | `night-scene.test.tsx`; PP (no fixed ridge, fence, ground); LS (ridge band in the flow) | 12 |
| 5.2 | PP (scene scroll) | 12 |
| 5.3 | `night-scene.test.tsx` (still fog); PP (fog at rest); LS (moon on Wide views) | 12, 35 |
| 5.4 | PP (Stage box) | 13 |
| 5.5 | Existing burial and layout tests unchanged | 13 |
| 5.6 | PP (Stage box); LS (amended ridge test) | 13 |
| 6.1 | BV | 24 |
| 6.2 | BV (base, radius, no `opacity-`); design-tokens test | 1, 24, 25 |
| 6.3 | ST (variants); `undead-card.test.tsx` (answer block, `data-variant`) | 25, 26, 28 |
| 6.4 | CT (variant rows) | 24 |
| 6.5 | OP (Screen-state rows); component variant checks | 25, 26, 27, 29, 38 |
| 6.6 | `rising-view.test.tsx` ("Next" primary and `aria-disabled` while `burying`) | 25, 26 |
| 6.7 | OP (rows and P3) | 29, 34 |
| 7.1 | PS (`isWideView`); LP (`lg:max-w-[1184px]`); PP (side by side) | 35, 36 |
| 7.2 | PP (3 tombstones per row at 1280 px) | 35, 39 |
| 7.3 | `rising-view.test.tsx` (DOM order); PPT (tab order) | 36 |
| 7.4 | LP (`max-w-[640px]`); LY (390 × 844 unchanged) | 35, 36 |
| 7.5 | PS (`isWideView` false for `working`, `error`, `no-subscriptions`) | 35 |
| 7.6 | PP (Wide layout); LY (card test at 1280 and 1600) | 36 |
| 8.1 | `cancel-helper.test.tsx` (order, no `LINK_INTRO`) | 37 |
| 8.2 | `cancel-helper.test.tsx` (Email disclosure) | 37 |
| 8.3 | `cancel-helper.test.tsx` (email-only open) | 37 |
| 8.4 | `rising-view.test.tsx` ("Next" placement); LY ("Next" in the region) | 38 |
| 8.5 | GF (Graveyard Helper panel, no "Next") | 37, 38 |
| 8.6 | `cancel-helper.test.tsx` (section, heading name, motion kept) | 37 |
| 8.7 | GF (3 or 5 Tab presses from the stage tombstone) | 38 |
| 8.8 | `cancel-helper.test.tsx`, LY, DP amendments | 37 |
| 9.1 | `graveyard-view.test.tsx` (ground lines, heading first); PP (grid) | 39 |
| 9.2 | `graveyard-view.test.tsx` (action order, "Unbury" name) | 39 |
| 9.3 | `graveyard-view.test.tsx` (Waiting chip text, name, `answer-now`) | 40 |
| 9.4 | `memory-panel.test.tsx` (order) | 41 |
| 9.5 | `memory-panel.test.tsx` (`aria-describedby`, `set-memory`, focus target) | 41 |
| 9.6 | `memory-panel.test.tsx` (hint `hidden` in the DOM); TXT (banned words) | 41 |
| 9.7 | `graveyard-view.test.tsx` (variants, last control) | 27, 39 |
| 9.8 | `share-panel.test.tsx` and existing Graveyard tests unchanged in text | 27, 39 |
| 9.9 | `memory-panel.test.tsx`, GMF amendments | 41 |
| 10.1 | `rising-view.test.tsx`, SPT (footnote); CT (footnote row) | 30 |
| 10.2 | `logic/progress-dots.test.ts`; `rising-view.test.tsx` (dots, bar) | 31, 32 |
| 10.3 | `logic/progress-dots.property.test.ts` (P4) | 31 |
| 10.4 | MO (finite sway); `undead-card.test.tsx` (settle); PP (sway ends) | 33 |
| 10.5 | `undead-card.test.tsx` and `graveyard-flow.reduced.test.tsx` (no sway) | 33 |
| 10.6 | `graveyard-flow.motion.test.tsx` unchanged | 33 |
| 10.7 | MO; PP (sway ends) | 33, 34 |
| 11.1 | TXT (`FREE_LINE`); LP (place after the Primary action) | 2, 15 |
| 11.2 | TXT (exact text); review | 15 |
| 11.3 | LP, LS (new Secondary labels) | 14 |
| 11.4 | CH (Privacy note once, no "Built with Kiro." sentence) | 8, 15 |
| 11.5 | TXT; LP (outline) | 15 |
| 11.6 | LS (Fold checks unchanged) | 15 |
| 12.1 | DP (unchanged checks over the extended path); SP | 9, 11, 16, 22, 23, 45 |
| 12.2 | ST (public files); checkpoint `git diff` checks | 10, 16, 23, 45 |
| 12.3 | ST (art) | 7, 17, 19 |
| 12.4 | CT (every new pair) | 1, 15, 17, 24, 30, 32, 40, 41 |
| 12.5 | STT, CH (native controls, `aria-expanded`); PP (stone size); PPT (keyboard reach) | 20, 21, 42 |
| 12.6 | PPT (tab orders); amended tab-order tests in SPT, LP and GF | 6, 8, 20, 36, 42 |
| 12.7 | ST (motion keys); PP (reduced-motion peek and grave) | 7, 17, 33 |
| 12.8 | ST (no `Infinity`); PP (fog at rest, sway ends) | 12, 33, 34 |
| 12.9 | PP (sizes); LS (Fold) | 43 |
| 12.10 | CH; PPT (Live region silence) | 6, 42 |
| 12.11 | Review: each new element does theme work | 32, 39 |
| 13.1 | Notes in earlier specs, checked by reading | 44 |
| 13.2 | Checkpoint review of every amended test | 16, 23, 34, 45 |
| 13.3 | The amendments named in tasks 8, 14, 20, 37 and 40 | 8, 14, 20, 37, 40 |
| 13.4 | CH; STT; PPT | 6, 8, 20, 21, 42 |
| 13.5 | PL; `progress-dots.property.test.ts`; OP (P3) | 3, 29, 31 |
| 13.6 | PP | 9, 12, 22, 43 |
| 13.7 | Batch checkpoints | 16, 23, 34, 45 |
| 13.8 | Manual screenshots before release | 45 |
