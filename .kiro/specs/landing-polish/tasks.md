# Implementation Plan: landing-polish

Tasks run in the order of design "Task order". The design's steps 1, 2, 3a, 3b, 3c, 4, 5, 6a, 6b, 6c and 7 are tasks 1 to 11 here, in that order, and task 12 is the final checkpoint. Every path is in `apps/web/` unless it starts with `.kiro/` or `packages/`; inside a task, `src/` means `apps/web/src/`, `slice/` means `apps/web/src/slice/`, `logic/` means `apps/web/src/slice/logic/`, `landing/` means `apps/web/src/slice/landing/`, `graveyard/` means `apps/web/src/slice/graveyard/`, and `e2e/` means `apps/web/e2e/`. Each task writes its code and its tests together. "Existing tests that change" means the design table of that name.

The tasks are grouped into batches: the model, text and moon first; then the Footer, the Landing view and its component tests; then the browser tests and the release check (end of Phase A); then the Phase B effects; and last the motion browser tests and the checkpoint. Phase B (tasks 8 to 11) starts only after task 7 is done.

Test policy:

- Each task runs the tests it names (with `npx vitest run <files>` in `apps/web`), then root `npm test`, `npm run typecheck` and `npm run lint`. All must pass at the end of the task.
- Tasks 2, 4, 6, 9 and 11 also run `npm run test:e2e --workspace @zombills/web` (design "Task order"). A single spec can be run with `npm run test:e2e --workspace @zombills/web -- e2e/<file>.spec.ts`; the task still ends with the whole e2e run.
- No task boundary leaves a suite red. When a task changes an existing test, it names the change under "Existing tests"; no other existing test may change in that task. A task never needs a later task to make its own tests pass.

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`, Req 11.1). No new code calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`, adds a `<link rel="prefetch|preconnect|dns-prefetch">`, a remote image, icon or font, or a GitHub widget (Req 8.4). Opening the Page makes no request to `github.com` or any other host. No new storage access, cookie or URL write (Req 11.5); "Read the privacy note" never changes the URL (Req 7.2).
- `CSP_POLICY` and `injectCsp` in `csp-plugin.ts`, `netlify.toml`, the Netlify headers and their tests stay exactly as they are. No `<style>` element is added at runtime and no `eval`-like API is used (Req 11.2). If a style does not work under the policy, stop and record the finding instead of changing the policy.
- No new dependency, no `package.json` change, no new file under `apps/web/public`. Fonts stay the bundled `@fontsource` IM Fell English and Inter (Req 11.3). `packages/core` does not change.
- The only absolute URLs in non-test source under `apps/web/src` are `REPO_LINK.href` and `REAPER_LINK.href` in `logic/landing-text.ts`, plus the SVG namespace (Req 11.4).
- Colours are only the seven tokens of `index.css`, through Tailwind's colour utilities with `/alpha` or `color-mix()`. No hex value outside `index.css` (Req 3.4, design "Colours and contrast"). `index.css` gets no new rule and no `@keyframes`.
- Motion: Phase A (tasks 1 to 7) adds no motion; the Landing `working` line reuses `FadeIn`. Phase B keeps every `@keyframes`, transition and lean rule in `landing/landing-motion.css`, inside `@media (prefers-reduced-motion: no-preference)`, animating only `transform`, `opacity`, `text-shadow` and `box-shadow`, with finite counts; no SMIL, no Framer Motion, no `requestAnimationFrame` or `setInterval` under `landing/` (Req 9.6). The `tech.md` exception for this lands in task 8, before any keyframes.
- All new strings come from `logic/landing-text.ts` or `logic/memory-text.ts`. None contains `!`. The badge text contains none of "private", "secure", "encrypted", "anonymous" (Req 6.4, 7.4).
- A disabled Landing control uses the graveyard-ui Req 14.2 pattern: `aria-disabled={disabled ? true : undefined}`, `aria-disabled:opacity-60`, and handlers that return early, with focus kept. Never the `disabled` attribute. No `aria-label` on the Primary action, the Secondary sample buttons or the Footer links, so each accessible name is its visible text (Req 4.1, 8.3). No positive `tabindex`. The only new focus move is `focusAndReveal(privacyNoteRef.current)` (Req 7.2).
- The Hero art and every decorative layer are `aria-hidden="true"` and not focusable. The Hero art has no `<text>`, `<image>`, `<foreignObject>` or `href`; its only `url()` values are `#` fragments to ids from `useId` (Req 3.4, 3.5, 10.8). No logo, brand shape or gore (Req 11.7).
- No landmark uses `display: contents` (Req 1.3). The Non-landing views keep today's markup, `max-w-[640px]` and the four-button gate (Req 1.6, 1.7, 5.7).
- Existing tests change only as the "Existing tests that change" table of the design says, and only in the task that names them: a locator change or an expectation this spec makes false replaced by a stricter exact one. No assertion is removed, made optional or widened (Req 12.3). If an unlisted existing test fails, fix the new code, not the test; if the test itself is wrong, stop and report it.
- New component tests follow the setup of `slice/slice-page.test.tsx` (test environment, Framer Motion test config and console handling). E2E tests emulate `prefers-reduced-motion: reduce` and wait for `document.fonts.ready` before any box check (Req 2.7), except the Phase B tests that measure motion.
- Files are kebab-case, components PascalCase, constants `SCREAMING_SNAKE_CASE`; unit tests in `*.test.ts(x)` and property tests in `*.property.test.ts` next to the source file; E2E tests in `e2e/*.spec.ts` (`structure.md`).
- TypeScript strict mode. Any `any` needs a comment explaining why (`tech.md`); a cast through `unknown` needs a comment too.
- Do not commit.

---

## Batch 1: model, text and moon (Phase A)

Task 1 is pure and changes no rendered output. Task 2 moves the moon out from behind the header card on every view; the Landing layout does not exist yet, so `SlicePage` passes `landing={false}` and every view uses the `sky` moon.

- [x] 1. Page model, Landing text and scene alphas (`slice/page-state.ts`, `logic/landing-text.ts`, `logic/memory-text.ts`, `logic/scene-alphas.ts`)
  - In `page-state.ts`, as in design "Page model": add `export type WorkingOrigin = "landing" | "other"`; the `working` variant of `PageView` becomes `{ kind: "working"; sourceName: string; origin: WorkingOrigin }`; the `start` case sets `origin: view.kind === "idle" && model.screen === "main" ? "landing" : "other"`, reading `screen` before it is reset to `"main"`; export `isLandingView(model: Pick<PageModel, "view" | "screen">): boolean` (true exactly when `screen === "main"` and the view is `idle`, or `working` with `origin === "landing"`). `PageAction`, `finish`, `fail`, `runAnalysis`, `haunt-view.ts` and `announce.ts` do not change.
  - Create `logic/landing-text.ts` with every constant of design "Module layout": `HERO_LINE`, `PRIMARY_ACTION_LINES` (`["Summon the undead", "with a sample US bank statement"]`), `PRIMARY_ACTION_NAME` (the two joined by one space), `OTHER_SAMPLES_LABEL` (`Other samples:`), `OTHER_SAMPLES_LIST_NAME` (`Other sample statements`), `PRIVACY_BADGE_TEXT` (`Your statement never leaves your device.`), `READ_PRIVACY_NOTE` (`Read the privacy note`), `HOW_IT_WORKS_HEADING`, `HOW_IT_WORKS_STEPS` (`readonly { heading: string; text: string }[]`, the Req 6.1 table in order), `OWN_STATEMENT_HEADING` (`Or read your own statement`), `BUILT_WITH_KIRO` (`Built with Kiro.`), `REPO_LINK` (`{ text: "Zombills on GitHub", href: "https://github.com/zaxcoraider/zombills" }`), `REAPER_LINK` (`{ text: "The Reaper on GitHub", href: "https://github.com/zaxcoraider/zombills-reaper" }`), `REAPER_DESCRIPTION` (the Req 8.1 sentence) and `US_SAMPLE_FILE_NAME` (`us-signed.csv`).
  - In `logic/memory-text.ts`, add `PRIVACY_NOTE` and `STATEMENT_TIP` with the exact text of design "Text". `IDLE_SENTENCE` stays until task 4, so nothing that imports it breaks.
  - Create `logic/scene-alphas.ts` with `SKY_GLOW_ALPHA = 0.09`, `FOG_DENSITIES = [0.13, 0.11, 0.08] as const`, `FOCUS_GLOW_ALPHA = 0.35` and `FOCUS_BAND_ALPHA = 0.7`. Nothing reads them yet (task 2 and task 5 do). It imports nothing.
  - Unit tests `logic/landing-text.test.ts`: each constant equals its requirement text exactly (Req 3.2, 4.1, 5.1, 6.1, 7.1, 8.1); `PRIMARY_ACTION_NAME === PRIMARY_ACTION_LINES.join(" ")`; `HOW_IT_WORKS_STEPS` deep-equals the Req 6.1 table; no exported string (including the nested ones) contains `!`; `PRIVACY_BADGE_TEXT` contains none of `private`, `secure`, `encrypted`, `anonymous` (case-insensitive); `REPO_LINK.href` and `REAPER_LINK.href` are the two Req 8.1 URLs.
  - Unit tests `logic/memory-text.test.ts`: add cases that `PRIVACY_NOTE` and `STATEMENT_TIP` equal their texts exactly and that `` `${PRIVACY_NOTE} ${STATEMENT_TIP}` `` equals the graveyard-memory Req 1.6 sentence, written as a literal in the test (Req 8.7). The existing `IDLE_SENTENCE` case (line 38) stays until task 4.
  - Unit tests `slice/page-state.test.ts`: the origin table of design "Testing strategy", one case per row (`idle`/`main` including `INITIAL_PAGE_MODEL` → `"landing"`; `results`, `no-subscriptions` and `error` on `main` → `"other"`; `idle`, `results` and `error` on `graveyard` → `"other"`); `isLandingView` for every view kind × both screens, with `working` in both origins.
  - Property test `slice/page-state.property.test.ts`: P7 gains the two clauses of design "Testing strategy": when `start` applies, `model.view.origin` equals `before.view.kind === "idle" && before.screen === "main" ? "landing" : "other"`; and `isLandingView(model)` implies `model.screen === "main"` and `model.view.kind` is `idle` or `working`.
  - Run in `apps/web`: `npx vitest run src/slice/page-state.test.ts src/slice/page-state.property.test.ts src/slice/logic/announce.test.ts src/slice/logic/landing-text.test.ts src/slice/logic/memory-text.test.ts src/slice/logic/haunt-view.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: the `page-state.test.ts` rows (the `WORKING` fixture at line 59 and the `working` fixtures at lines 251–255 and 351 gain `origin: "landing"`; line 93 expects `origin` `"landing"` for `IDLE` and `"other"` for the other three `NOT_WORKING` models; line 108 adds `origin: "landing"`), the `announce.test.ts` row (line 66 adds `origin: "landing"`, the expected sentence unchanged), and the P7 additions above. `haunt-view.test.ts` passes unchanged.
  - _Requirements: 1.1, 3.2, 4.1, 5.1, 6.1, 6.4, 7.1, 7.4, 8.1, 8.2, 8.7, 13.10_

- [x] 2. Moon, scene and the Non-landing layout test (`graveyard/graveyard-backdrop.tsx`, `graveyard/night-scene.tsx`, `slice/slice-page.tsx`, `e2e/content-boxes.ts`, `e2e/landing.spec.ts`)
  - In `graveyard-backdrop.tsx`, as in design "Moon": export `type MoonPlacement = "landing" | "sky"` and `Moon({ placement })`, one `aria-hidden="true"`, `pointer-events-none`, absolutely positioned square wrapper holding (1) `div[data-moon-glow]` (`absolute left-1/2 top-1/2 h-[56rem] w-[72rem] -translate-x-1/2 -translate-y-1/2`, background `radial-gradient(closest-side, ${mix("bone", SKY_GLOW_ALPHA * 100)}, transparent 70%)`) and (2) today's moon `svg`, unchanged in look, with `data-moon-halo` on `<circle r="100">` and `data-moon-disc` on `<circle r="40">`. Wrapper class and style per the design's placement table (`landing`: `absolute -z-10`, `calc(var(--moon-d) * 2.5)` square, `right: calc(var(--moon-d) * -0.75)`, `top: calc(12px - var(--moon-d) * 0.75)`; `sky`: `absolute hidden aspect-square -translate-x-1/2 -translate-y-1/2 lg:block`, `left: calc(75% + 160px)`, `top: 17%`, `width: calc(2.5 * min(112px, 20% - 120px))`). `SKY_BACKGROUND` keeps only its linear gradient. `BackdropLayers` gains `moon: boolean` and renders `<Moon placement="sky" />` only when it is true. `BackdropLayers` and `ForegroundFog` gain `fogStill: boolean`, which `FogBand` uses in place of `reduceMotion` for its drift (the fog-clear fade still reads `reduceMotion`). Fog densities read `FOG_DENSITIES[0..2]` from `logic/scene-alphas.ts`; each fog band gets `data-backdrop-fog`.
  - In `night-scene.tsx`: `NightSceneProps` gains `landing: boolean`; pass `moon={!landing}` to `BackdropLayers` and `fogStill={reduceMotion || landing}` to `BackdropLayers` and `ForegroundFog`; the content wrapper's class changes from `relative` to `relative isolate overflow-clip`.
  - In `slice-page.tsx`, pass `landing={false}` to `NightScene`. Nothing else changes in this task.
  - Create `e2e/content-boxes.ts` with `DocRect`, `MoonGeometry`, `collectContentBoxes`, `moonGeometry`, `circleHitsRect` (distance from the centre to the nearest point of the rectangle `< r − 0.5`), `distanceToRect` and `inViewport`, as in design "Helpers": one `page.evaluate` over `header`, `main` and `footer`; document coordinates; the `excluded(el)` rule (ancestor-or-self `aria-hidden="true"`, `clip-path: inset(50%)` or `clip: rect(0px, 0px, 0px, 0px)`); zero-area rectangles dropped; text boxes from `Range.getClientRects()` per non-empty text node, labelled by the first 40 characters; Cards by computed `background-color` alpha ≥ 0.5 over the `rgba(…)`, `color(srgb … / a)` and `oklab(… / a)` forms; controls by the design's selector; `[data-hero-art]` included although `aria-hidden`. The `footer` query finds nothing until task 3 and must not fail on that.
  - Create `e2e/landing.spec.ts` with the Non-landing part of design "Non-landing checks": for 320 × 568, 1280 × 720 and 1920 × 1080, one test per state (`results`, `graveyard`, `error`, `no-subscriptions`, `working-other`) named `non-landing moon ${w}x${h} ${state}`, with the design's setups. The US Sample is started by one helper, `startUsSample(page)`, which in this task clicks the button `US bank, signed amounts` (task 4 switches it to the Primary action). Each asserts `count === 1`; below 1024 px wide `shown === false`; otherwise the disc is at least 48 px across, `!circleHitsRect` for every Content box where `inViewport` is true, `distanceToRect ≥ 2.5 r − 0.5` for every such text box, and the halo and glow box centres within 1 px of the disc centre. A failure message names the viewport size, the state and the Content box hit (Req 2.7).
  - Unit tests `graveyard/night-scene.test.tsx`: every existing render adds `landing={false}`; new cases: `landing={false}` renders exactly one `[data-moon-disc]`; `landing={true}` renders none; with `landing={true}` and `reduceMotion={false}`, the `[data-backdrop-fog]` bands render the still pose that `reduceMotion={true}` renders (compare each band's `style` attribute), so `fogStill` is passed.
  - Run in `apps/web`: `npx vitest run src/slice/graveyard src/slice/graveyard-flow.test.tsx src/slice/graveyard-flow.motion.test.tsx src/slice/graveyard-flow.reduced.test.tsx src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web` (the new Non-landing tests and every existing spec).
  - Existing tests: the `night-scene.test.tsx` row (every render gains `landing={false}`; the new cases added). Every other test, including `graveyard-flow.test.tsx` ('hides every svg and backdrop layer and draws no img'), `e2e/layout.spec.ts` and `e2e/demo-path.spec.ts`, passes unchanged.
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 10.2, 10.8, 11.2_

> **Batch 1 done:** root `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:e2e --workspace @zombills/web` green; the 15 Non-landing moon tests pass; at 1280 px the moon sits right of the 640 px column on every view; no rendered text has changed.

---

## Batch 2: Footer, Landing view and component tests (Phase A)

Task 3 is additive: the Footer appears on today's views and the `idle` panel loses the sentence the Footer now carries. Task 4 switches the layout and, in the same task, moves every locator the switch makes stale, jsdom and e2e alike (design review 1 #8). Task 5 adds the Landing component, contrast and static tests.

- [x] 3. Footer, text split and the URL static check (`slice/site-footer.tsx`, `slice/slice-page.tsx`, `src/static-checks.test.ts`)
  - Create `site-footer.tsx` with `SiteFooterProps { noteRef: Ref<HTMLParagraphElement>; wide: boolean }` and `SiteFooter`, as in design "Footer": a `<footer>` in the column of `wide` (`mx-auto w-full max-w-[1184px] px-4 sm:px-8` or `mx-auto max-w-[640px] px-4`, plus `pb-8`) holding the card `flex flex-col gap-3 rounded-2xl bg-night/80 p-6 text-sm` with, in order: `<p ref={noteRef} tabIndex={-1}>{PRIVACY_NOTE}</p>`; `<p>{BUILT_WITH_KIRO}</p>`; a `ul` (`flex flex-col gap-1`) of two `li`, each with `<a href target="_blank" rel="noopener noreferrer" aria-describedby={newTabId}>` (`inline-flex min-h-11 items-center text-bone underline underline-offset-4`) for `REPO_LINK` and `REAPER_LINK`, the second followed by `" "` and `<span>{REAPER_DESCRIPTION}</span>`; and `<span id={newTabId} className="sr-only">{NEW_TAB_TEXT}</span>` with `newTabId` from `useId` and `NEW_TAB_TEXT` from `logic/cancel-text.ts`. No `aria-label`, image, icon or logo.
  - In `slice-page.tsx`: add `privacyNoteRef = useRef<HTMLParagraphElement>(null)`; render `<SiteFooter noteRef={privacyNoteRef} wide={false} />` after `main` in every Page state and screen, before the Live region, which stays where it is. The `idle` panel shows `STATEMENT_TIP` in place of `IDLE_SENTENCE` (the Privacy note is now in the Footer, so the Page shows each text once). Nothing else changes; `onReadNote` and the layout switch come in task 4.
  - In `static-checks.test.ts`, add the case "the only absolute URLs in source are the two GitHub links (landing-polish R11.4)" of design "Static checks": scan every non-test `.ts`, `.tsx` and `.css` file under `apps/web/src` (test files by the existing pattern, and `test-*.ts` helpers skipped) for `/\bhttps?:\/\/[^\s"'`)]+/g`; the set of matches minus `http://www.w3.org/2000/svg` equals exactly the two GitHub URLs, both found in `logic/landing-text.ts`. Put the scan in a helper so a second case can feed it a fixture string with a third URL and expect that URL to be reported.
  - Run in `apps/web`: `npx vitest run src/slice/slice-page.test.tsx src/slice/graveyard-memory-flow.test.tsx src/static-checks.test.ts`; then the whole web suite `npx vitest run`, because every view now renders the Footer; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests, per "Existing tests that change": `slice-page.test.tsx` (imports `PRIVACY_NOTE` and `STATEMENT_TIP` in place of `IDLE_SENTENCE`; line 63 `getByText(IDLE_SENTENCE)` becomes `expect(screen.getAllByText(PRIVACY_NOTE)).toHaveLength(1)` and `expect(screen.getAllByText(STATEMENT_TIP)).toHaveLength(1)`; line 74 `queryByRole("link")` is `null` becomes: `getAllByRole("link")` has length 2, each `closest("footer")` is not `null`, names `["Zombills on GitHub", "The Reaper on GitHub"]` and `href`s the two URLs, in order) and `graveyard-memory-flow.test.tsx` (line 29 import; lines 238 and 447 become `getAllByText(PRIVACY_NOTE)` and `getAllByText(STATEMENT_TIP)`, each `toHaveLength(1)`). The other rows of `slice-page.test.tsx` (lines 62 and 68–70) wait for task 4. No other existing test changes.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 11.4, 11.7, 13.2, 13.7_

- [x] 4. Landing view and every locator (`landing/*`, `graveyard/savings-counter.tsx`, `slice/slice-page.tsx`, `logic/memory-text.ts`, and the listed tests)
  - This task is larger than one component on purpose: the layout switch makes the old locators stale at once, so they move in the same task (design "Task order", 3b).
  - Create `landing/bare-focus.ts` with `BARE_FOCUS = "focus-visible:shadow-[0_0_0_5px_color-mix(in_srgb,var(--night)_70%,transparent),0_0_6px_2px_color-mix(in_srgb,var(--moss)_35%,transparent)]"`.
  - Create the Landing components with the props of design "Landing components" and the classes of design "Tailwind classes":
    - `landing-banner.tsx` `LandingBanner({ haunt, reduceMotion })`: the Banner column `div` (`pt-4 sm:pt-8`), the `header` with the `--moon-d` steps (48, 64, 96, 112 px), `pr-[calc(var(--moon-d)*1.75+4px)]` and `min-h-[calc(var(--moon-d)*1.75+16px)]` and no `pt`; `<Moon placement="landing" />`; the `h1` `Zombills` (`min-w-0 font-display text-[3rem] leading-[1.1] [overflow-wrap:anywhere] sm:text-[3.75rem] lg:text-[4.5rem] 2xl:text-[5rem]`); the tagline; `SavingsCounter` with `className="max-w-full rounded-xl bg-fog/95 px-4 py-2"`. No background, border or shadow on the `header`.
    - `hero.tsx` `Hero({ working, workingSourceName, onChooseSample, onReadNote, returnNotes })`: the Hero grid, Hero line (`HERO_LINE`), `HeroArt`, then the action wrapper with `PrimaryAction`, the Landing `working` line (`rounded-2xl bg-fog/95 px-4 py-3`, `<p>Reading {sourceName}…</p>`, inside `FadeIn`) only while working, `SecondarySamples`, `PrivacyBadge` and `ReturnNotes`. At module level `usSample = SAMPLES.find((s) => s.fileName === US_SAMPLE_FILE_NAME)`, throwing at import if missing.
    - `hero-art.tsx` `HeroArt()`: the still SVG of design "Hero art" (`viewBox="0 0 160 120"`, `aria-hidden="true"`, `focusable="false"`, `data-hero-art`; glow ellipse, mound, tombstone with two grooves, ghost with two eyes; ids `${useId()}-glow` and `-stone`; colours through `mix(…)` and `var(--…)` only).
    - `primary-action.tsx` `PrimaryAction({ disabled, onActivate })`: a native `button type="button"` with `<span className="block …">{PRIMARY_ACTION_LINES[0]}</span>{" "}<span className="block …">{PRIMARY_ACTION_LINES[1]}</span>`, the design classes (the only `bg-moss` element, `text-night`, `min-h-14`, the Phase A hover and `focus-visible` shadow with the `--night` 70 % band and the `--moss` 35 % glow, no transition or transform), and the disabled pattern.
    - `secondary-samples.tsx` `SecondarySamples({ disabled, onChoose })`: the row, the `span` `Other samples:` and the `ul` with `aria-label={OTHER_SAMPLES_LIST_NAME}` holding the three `SAMPLES` other than the US Sample, in `SAMPLES` order, as text-style buttons with `BARE_FOCUS`.
    - `privacy-badge.tsx` `PrivacyBadge({ onReadNote })`: one `p` with `PRIVACY_BADGE_TEXT` and a `button type="button"` `READ_PRIVACY_NOTE` with `BARE_FOCUS`.
    - `return-notes.tsx` `ReturnNotes({ restored, loadNote, showOpen, onOpen })`: the card with the restored line, the load note and "Open the graveyard" (today's classes), each only when present, `null` when all are absent; `loadNoteText` moves here from `slice-page.tsx`.
    - `how-it-works.tsx` `HowItWorks()`: the `section` labelled by its `h2` `How it works`, the `ol role="list"` (`grid list-none gap-4 md:grid-cols-3`) of three `li`, each a visible number `span`, an `h3` and a `p` from `HOW_IT_WORKS_STEPS`. No control.
    - `own-statement.tsx` `OwnStatement({ disabled, onFiles })`: the `section` with `h2` `Or read your own statement`, `<p>{STATEMENT_TIP}</p>` and today's `DropZone`, unchanged.
  - In `savings-counter.tsx`: an optional `className` prop on the group `div`, and `[overflow-wrap:anywhere]` on the figure `span`. Nothing else changes.
  - In `slice-page.tsx`, as in design "Page shell": `landing = isLandingView(model)`; `onReadNote` calls `focusAndReveal(privacyNoteRef.current)` when the ref is set; when `landing`, render `LandingBanner`, then `<main ref={mainRef}>` (`mx-auto w-full max-w-[1184px] px-4 sm:px-8 flex flex-col gap-12 pb-12 pt-6 sm:pt-8`) with `Hero`, `HowItWorks` and `OwnStatement`, then `SiteFooter wide`; otherwise today's header, `main`, gate and "Start again", then `SiteFooter wide={false}`. `NightScene` gets `landing={landing}`. `MainState` returns `null` for `idle` and for `working` with `origin: "landing"`. `showOpenGraveyard` feeds `ReturnNotes.showOpen` on the Landing view and stays in the gate elsewhere; the restored line and load note keep today's conditions. The Live region, drag guards, focus effect and `runAnalysis` do not change.
  - In `memory-text.ts`, remove `IDLE_SENTENCE` and change "the idle panel" to "the Landing view" in the top doc comment.
  - Run in `apps/web`: `npx vitest run` (the whole web suite); then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web`.
  - Existing tests, every remaining row of "Existing tests that change":
    - `slice-page.test.tsx`: the test renamed "shows the heading, tagline, privacy note, tip, inputs, Primary action and samples"; line 62 expects `max-w-[1184px]` on the Landing `main`; lines 68–70 become the Primary action by `PRIMARY_ACTION_NAME`, the names in the list `Other sample statements` equal exactly `SAMPLES.slice(1).map((s) => s.label)`, `SAMPLES[0].fileName === "us-signed.csv"` and `queryByRole("button", { name: SAMPLES[0].label })` is `null` (line 71 stays); lines 142, 206, 268, 300, 319 and 627 use a new `summon()` helper (click `PRIMARY_ACTION_NAME`, await `Recurring charges found`); lines 160 and 675 click `PRIMARY_ACTION_NAME`. Lines 323 and 581 and every assertion reading `US_LABEL` as the source name stay.
    - Decision on two further `slice-page.test.tsx` tests (found while doing this task; both rows are now in the design table, each as strict as the old test): "SlicePage: Working" asserts the Primary action and the three Secondary samples (4 controls) are `aria-disabled` and not `disabled` on the Landing-origin working view, and that no button is named `US_LABEL` ("US bank, signed amounts"), in place of the four-Sample loop; "SlicePage: Keyboard" expects the exact Req 10.1 tab order (Primary action, three Secondary samples, "Read the privacy note", drop area, "Choose a file", "Zombills on GitHub", "The Reaper on GitHub"). Every other assertion in both tests stays.
    - `graveyard-memory-flow.test.tsx`: the `chooseSample` helper (line 200) clicks `PRIMARY_ACTION_NAME`; its 11 call sites stay.
    - `graveyard-flow.test.tsx`: lines 107, 128, 148, 175, 209, 230, 311, 379, 421, 431, 472, 513, 535, 561, 599 and 668 call a new `summon()` helper; line 517 stays `chooseSample(US_LABEL)` (results gate).
    - `graveyard-flow.motion.test.tsx` line 18, `graveyard-flow.reduced.test.tsx` line 31 and `graveyard/test-share.ts` line 24: `{ name: PRIMARY_ACTION_NAME }`.
    - `logic/memory-text.test.ts` line 38: the `IDLE_SENTENCE` case is removed in favour of the join case of task 1, which asserts the same sentence exactly.
    - `e2e/layout.spec.ts` lines 89, 114 and 175 and `e2e/demo-path.spec.ts` lines 71, 159 and 223: `{ name: "Summon the undead with a sample US bank statement" }`.
    - `e2e/landing.spec.ts`: `startUsSample(page)` clicks the Primary action.
    - Every other test, including `savings-counter.test.tsx`, `graveyard-view.test.tsx`, `rising-view.test.tsx`, the share-card, cancel-helper and memory-panel suites, `app.test.tsx`, `csp-plugin.test.ts`, `netlify-config.test.ts`, `storage-lint.test.ts` and `static-checks.test.ts`, passes unchanged. The line numbers are those of the design; if a file has moved, find the same assertion.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.5, 7.1, 7.2, 7.3, 7.5, 8.7, 10.1, 10.4, 10.8, 11.6, 12.1, 12.3, 13.2, 13.3_

- [ ] 5. Landing component tests, contrast pairs and focus-alpha check (`slice/landing-page.test.tsx`, `src/contrast.test.ts`, `src/static-checks.test.ts`)
  - Tests only. If a test finds a bug, fix it in the task 3 or 4 file that owns it and name it in the task notes; do not weaken the test.
  - Component tests `slice/landing-page.test.tsx` (jsdom), every case of design "Component tests", rendering `<App />` or `<App store initialStore />` for a restored Graveyard:
    - outline: `getAllByRole("heading")` as `[level, name]` equals exactly `[[1, "Zombills"], [2, "How it works"], [3, "Find the undead"], [3, "Count what they cost"], [3, "Bury them"], [2, "Or read your own statement"]]`, and no heading `Or try a sample statement`;
    - landmarks: exactly one `banner`, `main` and `contentinfo`, with the Live region outside all three;
    - DOM order by `compareDocumentPosition`: `h1`, tagline, counter group, Hero line, `[data-hero-art]`, Primary action, the `Other sample statements` list, badge, How it works `h2`, Own-statement `h2`, drop area, Footer;
    - Primary action: found by `PRIMARY_ACTION_NAME`, no `aria-label`; activating it shows `Reading US bank, signed amounts…` in `main` and the Live region; while working it, the three Secondary samples, the drop area and `Choose a file` have `aria-disabled="true"` and a second click starts nothing; then `Recurring charges found` with today's summary naming `US bank, signed amounts`;
    - no button named `US bank, signed amounts` on the Landing view;
    - Secondary samples: names in the list equal exactly the three labels in order; each, in a fresh render, leads to `Reading <label>…`;
    - badge: its text is in `main`; activating `Read the privacy note` makes `document.activeElement` the `p` with `PRIVACY_NOTE` inside `contentinfo`, with `tabindex="-1"`; `location.href` is unchanged and the Live region stays `""`;
    - How it works: three `li`, each with text exactly `` `${n}${heading}${text}` ``; no `button`, `a` or `[tabindex]` in the section;
    - Own statement: the section's children in order are the `h2`, the `p` with `STATEMENT_TIP` and the drop area with `data-focus="drop-zone"`; the file input has `accept=".csv,text/csv"`;
    - Footer: texts in order `PRIVACY_NOTE`, `Built with Kiro.`, the two links with their `href`s, then `REAPER_DESCRIPTION`; each link has `target="_blank"`, `rel="noopener noreferrer"`, an `aria-describedby` element with text `NEW_TAB_TEXT`, and an accessible name equal to its visible text; `STATEMENT_TIP` is not inside the Footer;
    - Tab order with `userEvent.tab()` from `document.body`: exactly `[PRIMARY_ACTION_NAME, UK, EU, preamble, "Read the privacy note", "Drop area: choose or drop a CSV statement", "Choose a file", "Zombills on GitHub", "The Reaper on GitHub"]`, and with a restored Graveyard `Open the graveyard` right after `Read the privacy note`;
    - Return notes: with a restored Graveyard holding a bad record, the restored line, `droppedNote(1)` and `Open the graveyard` are in `main` after the badge, in order, and the button shows the heading `Your graveyard`;
    - working on the Landing view: the `working` line follows the Primary action in DOM order inside an element with class `bg-fog/95`, and the `h1`, Hero line and Primary action are still rendered;
    - no `bg-fog/95` element inside the `banner` on a first visit (design review 1 #4);
    - Non-landing views (`results`, `no-subscriptions` with the three-row file, `error` with a `.txt` file, the Graveyard view, and `working` with origin `"other"` checked before its run ends): `contentinfo` holds `PRIVACY_NOTE`; no Primary action, Hero line, `[data-hero-art]`, badge text or `How it works` heading; the gate's `h2` `Or try a sample statement` and the four `SAMPLES` labels in order; `Read another statement` where it is today; `main`'s class contains `max-w-[640px]`;
    - Start again: from `results`, the Landing view returns (Primary action present) and the drop area has focus.
  - In `contrast.test.ts`, add `describe("landing contrast (landing-polish R10.2)")` as in design "Colours and contrast": build S from `tokenHex`, `SKY_GLOW_ALPHA` and `FOG_DENSITIES` with the existing `over` helper; assert `S === "#646567"`; then every row of the design table with `toBeGreaterThanOrEqual(4.5)` or `(3)`, the Card rows with `over(S, fog, 0.95)` and `over(S, night, 0.8)`, and the focus-ring row with `over(over(S, moss, FOCUS_GLOW_ALPHA), night, FOCUS_BAND_ALPHA)`. The existing pairs stay unchanged.
  - In `static-checks.test.ts`, add a case that `landing/bare-focus.ts` and `landing/primary-action.tsx` each contain `var(--moss)_35%` and `var(--night)_70%`, and that `logic/scene-alphas.ts` exports `FOCUS_GLOW_ALPHA = 0.35` and `FOCUS_BAND_ALPHA = 0.7`, so the classes and the contrast test cannot drift apart.
  - Run in `apps/web`: `npx vitest run src/slice/landing-page.test.tsx src/contrast.test.ts src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: `contrast.test.ts` and `static-checks.test.ts` (cases added; existing cases unchanged). No other existing test changes.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 3.3, 4.1, 4.2, 4.4, 4.5, 4.6, 5.1, 5.3, 5.4, 6.1, 6.2, 6.5, 7.1, 7.2, 7.5, 8.1, 8.2, 8.3, 8.6, 10.1, 10.2, 10.3, 10.9, 13.1, 13.4, 13.7_

> **Batch 2 done:** root `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:e2e --workspace @zombills/web` green; the first screen is the Landing view; `IDLE_SENTENCE` no longer exists; every changed test is a row of "Existing tests that change".

---

## Batch 3: browser tests and release check (end of Phase A)

Task 6 is the first task that measures the Landing view in a real browser. Task 7 records the changes in the earlier specs and runs the Phase A release check, including the manual Reaper link check.

- [ ] 6. Landing layout tests and the load request check (`e2e/landing.spec.ts`, `e2e/demo-path.spec.ts`)
  - Tests only. If a browser test finds a bug, fix it in the file that owns it (a class, the Hero art or a constant) and name it in the task notes; do not loosen a tolerance or skip a viewport.
  - In `landing.spec.ts`, add the Landing part of design "Landing checks": one `describe` with `test.describe.configure({ mode: "parallel" })` and one test per size of the Viewport set and per state (`empty`, `restored`, `working`), named `landing moon ${w}x${h} ${state}`, 42 tests, with the design setups (`restored` through `addInitScript` writing `zombills.graveyard.v1` with the Netflix buried record and `{"id":"bad"}`; `working` through `page.clock.install`, `pauseAt` relative to the current fake time, a Primary action click and `resume` after measuring, then `Recurring charges found`). Each test runs checks 1 to 7 (one moon, `2r ≥ 47.5`, disc inside the viewport at scroll 0, no Content box hit, every text box at least `2.5 r − 0.5` from the centre, halo and glow centres within 1 px, Hero art clear of every text box) and, in the `empty` state, checks 8 to 11 (the Fold and the eight Req 3.7 sizes; exactly one control with computed `background-color` equal to `--moss`, the Primary action; the 18 px and 8 px glow clearances; the computed-style and box assertions for R3.1, R5.2, R5.5, R6.3, R7.3, R8.5 and R10.4). Failure messages use the design's `${w}x${h} ${state}: disc hits ${kind} "${label}" at x …, y …` form, and "halo" for check 5.
  - In the same file, the other tests of design "Other layout tests": the badge one-line check at 640 × 800, 1024 × 768 and 1280 × 720; Req 10.6 at 320 × 568 and at 390 × 844 with `fontSize = "200%"` set by `addInitScript` (`scrollWidth ≤ innerWidth`, no clipped text, Primary action inside the viewport after `scrollIntoViewIfNeeded()`); the long-counter test at 320 × 568 and 1280 × 720 (a restored Graveyard totalling KWD 1,234.500, USD 9,999.99 and JPY 1,234,567 a year: Landing checks 1 to 5 pass and `scrollWidth ≤ innerWidth`); Req 10.5 and 5.2 at 390 × 844 (every Secondary sample, `Read the privacy note`, both Footer links, the Primary action, the drop area and the file button at least 44 × 44 px).
  - In `demo-path.spec.ts` step 2, as in the design row: keep the existing listener; add a `landingRequests` array filled by a listener attached before `page.goto`; just before step 4, assert every entry with step 10's exact predicate (same origin, `GET`, `search === ""`, `postData() === null`, path `/` or a file in `listFiles(DIST)` with an allowed extension). Step 10, the CSP check, the console check and the storage check stay unchanged.
  - Run in `apps/web`: `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts e2e/demo-path.spec.ts`, then the whole `npm run test:e2e --workspace @zombills/web` and the whole web suite `npx vitest run`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: `e2e/demo-path.spec.ts` (the `landingRequests` listener and assertion added; every existing step unchanged) and `e2e/landing.spec.ts` (from task 2; the Landing tests added, the Non-landing tests unchanged). No other existing test changes.
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.7, 2.9, 3.1, 3.6, 3.7, 3.8, 3.10, 4.3, 4.4, 5.2, 5.5, 6.3, 7.3, 8.4, 8.5, 10.3, 10.4, 10.5, 10.6, 11.1, 13.5, 13.8_

- [ ] 7. Notes in earlier specs and the Phase A release check (`.kiro/specs/vertical-slice/requirements.md`, `.kiro/specs/graveyard-ui/requirements.md`, `.kiro/specs/graveyard-memory/requirements.md`)
  - Append each note of design "Notes to add to earlier specs" to the named criterion, in the existing style "(Changed by landing-polish: …)": vertical-slice R2.2 and R4.1; graveyard-ui R1.1, R1.3, R1.4 and R1.10 (Gate row); graveyard-memory R1.6, R1.7, R4.3, R4.5, R4.10, R9.2 and R9.6. Change no other text in those files. The notes are checked by reading.
  - Run the full check from the repo root: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Manual step (Req 8.8): open `https://github.com/zaxcoraider/zombills-reaper` in a signed-out browser window and confirm it loads as a public repository. Record the result and the date in the task notes. If it does not load, the task is blocked and the Reaper link is not shipped; report it instead of changing the link.
  - Existing tests: none change.
  - _Requirements: 8.8, 12.2, 13.9_

> **Batch 3 done:** root `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm run test:e2e --workspace @zombills/web` green; the 42 Landing and 15 Non-landing moon tests and the 6 other layout tests pass; the Reaper link check is recorded. Phase A is shippable on its own.

---

## Batch 4: Landing effects (Phase B)

Phase B adds the five effects of design "Motion (R9)". Task 8 records the steering exception before any keyframes exist, so no later agent with the steering docs loaded flags or undoes them (design review 1 #17). The base style of every effect element is its end state, so a still page and a finished animation draw the same picture.

- [ ] 8. Steering exception for the Landing effects (`.kiro/steering/spooky-design.md`, `.kiro/steering/tech.md`)
  - In `spooky-design.md`, straight after "All animation uses **Framer Motion**. No raw CSS `@keyframes` for interactive or state-driven motion.", add one line: "Exception: the Landing effects of landing-polish Requirement 9.6 use CSS `@keyframes` and transitions in `apps/web/src/slice/landing/landing-motion.css` only."
  - In `tech.md`, add the same one-line exception to the Animation row of the approved-stack table and to the "Animation →" bullet. Change nothing else in either file.
  - Tests: text only. Run root `npm run lint` and confirm with `git diff --stat` that only the two steering files changed in this task.
  - Existing tests: none change.
  - _Requirements: 9.6_

- [ ] 9. Landing effects (`landing/landing-motion.css`, `landing/use-landing-motion.ts`, `landing/hero-art.tsx`, `landing/hero.tsx`, `landing/landing-banner.tsx`, `landing/primary-action.tsx`, `graveyard/graveyard-backdrop.tsx`, `slice/landing/landing-motion.test.tsx`)
  - Create `landing-motion.css` with every keyframes, base and hover rule of design "Motion (R9)": the keyframes table (`zb-ghost-rise`, `zb-ghost-float`, `zb-hero-glow`, `zb-fog-a`, `zb-fog-b`, `zb-title-glow`, `zb-bat-cross`, `zb-bat-flap`, `zb-candle`) with the listed durations, delays, counts, timings and fill modes; the base (end-state) styles, including the still candle `box-shadow` on `.zb-primary:is(:hover, :focus-visible):not([aria-disabled="true"])` with the drop shadow, `0 0 0 5px color-mix(in srgb, var(--night) 70%, transparent)` and `0 0 14px 4px color-mix(in srgb, var(--ember) 35%, transparent)`, which applies with or without reduced motion; the `h1.zb-title` rest `text-shadow` with `var(--bone) 2%`; `.zb-bat { opacity: 0 }`; and the hover and focus rules of design "Hover and focus" (the lean through `.zb-hero:has(…)`, the `lg` variant, the candle animation). Every automatic animation is scoped to `[data-motion="play"]`. Every `animation`, `transition` and lean rule sits inside `@media (prefers-reduced-motion: no-preference)`. Groups in the SVG use `transform-box: fill-box`; the lean group's `transform-origin` is `50% 100%`. No `infinite`, no `!important`, no hex value.
  - Create `use-landing-motion.ts` with the module-level `played` flag and `useLandingMotion(): LandingMotion` exactly as in design "Play once per load", with no test-only export.
  - In `hero.tsx`, import `./landing-motion.css` once and put `zb-hero` on the Hero root `div`. `Hero` and `LandingBanner` each call `useLandingMotion()`; its value goes to `data-motion` on the `h1`, the Hero art `svg` and the landing Moon wrapper.
  - In `hero-art.tsx`, add the Phase B structure of design "SVG structure": `.zb-art` on the `svg`, `.zb-hero-glow` on the glow ellipse, the ground clip `${id}-ground` (the mound band, y 96–120, x 0–160) with the two fog wisps `.zb-fog-a` and `.zb-fog-b`, and the ghost wrapped in `g.zb-ghost-lean` > `g.zb-ghost-rise`, drawn before the tombstone. The end state draws the Phase A picture plus the resting fog.
  - In `landing-banner.tsx`, the `h1` gains `zb-title` and `pb-4`. In `primary-action.tsx`, the button gains `zb-primary`, and the Phase A `hover:` and `focus-visible:` shadow classes are removed; the drop shadow class stays. In `graveyard-backdrop.tsx`, `Moon` accepts the `data-motion` value for `placement="landing"` and draws `g.zb-bat` > `path.zb-bat-wings` (a 24 × 10 silhouette, fill `var(--night)`, inside x and y ±100) after the disc; the `sky` moon gets no bat.
  - The Primary action half of the task 5 static check moves with the classes: it now expects `var(--night) 70%` in `landing-motion.css` instead of `var(--moss)_35%` and `var(--night)_70%` in `primary-action.tsx`; the `bare-focus.ts` half is unchanged. Task 10 adds the `--ember` and title-glow strings.
  - Component tests `slice/landing/landing-motion.test.tsx` (jsdom), as in design "Tests (Req 13.5, 13.6)": `vi.resetModules()` in `beforeEach` and a dynamic `import` of `App`; on the first Landing view the `h1`, `[data-hero-art]` and the landing moon wrapper have `data-motion="play"`, and the Primary action starts `Reading US bank, signed amounts…` at once; after the outcome and `Start again`, all three are `"still"`.
  - Run in `apps/web`: `npx vitest run src/slice/landing/landing-motion.test.tsx src/slice/landing-page.test.tsx src/static-checks.test.ts src/slice/graveyard/night-scene.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web` (the `pb-4` on the `h1` moves the Hero down by 16 px, and the Fold and moon checks must still pass).
  - Existing tests: `static-checks.test.ts` (the Primary action half of the task 5 focus-alpha case, as above). Every other test, including `landing-page.test.tsx` and both e2e layout specs, passes unchanged.
  - _Requirements: 3.5, 3.9, 4.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.7, 11.2, 11.6, 13.6_

- [ ] 10. Effect alphas, contrast pairs and the static motion checks (`logic/scene-alphas.ts`, `src/contrast.test.ts`, `src/static-checks.test.ts`)
  - In `scene-alphas.ts`, add `TITLE_GLOW_ALPHA = 0.02`, `CANDLE_GLOW_ALPHA = 0.35` and `CANDLE_BAND_ALPHA = 0.7`.
  - In `contrast.test.ts`, add the three pairs of design "Contrast of the effects (Req 9.7)": `--bone` on `over(S, bone, TITLE_GLOW_ALPHA)` (`#676869`, at least 4.5, with no credit for the `--night` rims); `--moss` on `over(over(S, ember, CANDLE_GLOW_ALPHA), night, CANDLE_BAND_ALPHA)` (`#352d29`), at least 3, for the focus ring and for the fill boundary. Assert both composed colours as hex literals, as task 5 does for S.
  - In `static-checks.test.ts`, add the cases of design "Tests" (Static row): `@keyframes` appears in no file under `apps/web/src` other than `slice/landing/landing-motion.css` (the existing `index.css` case stays as it is); in that file no `infinite`; every `animation` declaration has delay + duration × count ≤ 5 s; in every keyframes rule that changes `opacity`, `text-shadow` or `box-shadow`, consecutive stops are at least 334 ms apart; every `animation`, `transition` and `transform` hover rule is inside `@media (prefers-reduced-motion: no-preference)`; the file contains `var(--bone) 2%`, `var(--ember) 35%` and `var(--night) 70%`, matching the constants above; no file under `slice/landing/` calls `requestAnimationFrame` or `setInterval`. Each scan also asserts it found at least one keyframes rule and one `animation` declaration, so it cannot pass on an empty parse.
  - If a check fails, fix `landing-motion.css`, not the check.
  - Run in `apps/web`: `npx vitest run src/contrast.test.ts src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: `contrast.test.ts` and `static-checks.test.ts` (cases added; existing cases unchanged).
  - _Requirements: 9.2, 9.3, 9.4, 9.6, 9.7, 10.2, 10.3, 13.6, 13.7_

> **Batch 4 done:** root `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:e2e --workspace @zombills/web` green; every keyframes rule is in `landing-motion.css`; the steering docs record the exception.

---

## Batch 5: motion browser tests and the checkpoint

jsdom does not apply imported CSS, so the timing, reduced-motion and end-state checks run in Chromium, by computed style, with no screenshot baselines (design review 1 #5, #6).

- [ ] 11. Motion browser tests (`e2e/landing-motion.spec.ts`, `e2e/landing.spec.ts`)
  - Tests only. If a test finds a bug, fix it in `landing-motion.css` or the component that owns it and name it in the task notes; do not raise a time bound or skip an element.
  - Create `landing-motion.spec.ts` with the three tests of design "Tests (Req 13.5, 13.6)", all at 1280 × 720:
    - **Finite and within 5 s**, without reduced motion, right after `goto`: for every element, zip the computed `animation-name`, `-duration`, `-delay` and `-iteration-count` lists and fail on `infinite` or delay + duration × count > 5 s; then every animation in `document.getAnimations()` (CSS or Web Animations API) has a finite `getComputedTiming().endTime` ≤ 5000; then each `[data-backdrop-fog]` element's computed `transform` is the same at load and 1 s later. Repeat with the Primary action hovered and with it focused by Tab.
    - **Reduced-motion still state**, with `reducedMotion: "reduce"`: no `CSSAnimation` or `CSSTransition` in `document.getAnimations()` at load, on hover and on focus; `.zb-ghost-rise` and `.zb-ghost-lean` have computed `transform` `none`; `.zb-bat` has `opacity` `0`; the candle `box-shadow` is present on hover.
    - **End state equals still state**: for `.zb-ghost-rise`, `.zb-ghost-lean`, `.zb-hero-glow`, `.zb-fog-a`, `.zb-fog-b`, `h1.zb-title`, `.zb-bat`, `.zb-bat-wings` and `.zb-primary`, read computed `transform`, `opacity`, `text-shadow` and `box-shadow`. Still: a load with `reduce`. End: a load without it, after `expect.poll(() => page.evaluate(() => document.getAnimations().every((a) => a.playState === "finished")), { timeout: 5500 })`; the values equal the still ones exactly. Start: a load without `reduce`, after `document.fonts.ready`, with every `CSSAnimation` paused at `currentTime = 0`: `.zb-ghost-rise` has `matrix(1, 0, 0, 1, 0, 44)`, `.zb-bat` has `opacity` 1 and `.zb-hero-glow` `opacity` 0, each different from the still value. No pixel baseline is committed.
  - In `landing.spec.ts`, add: **Moon at rest without reduced motion**, the Landing moon checks 1 to 7 once at 1280 × 720 without reduced motion, after the same `expect.poll` (no fixed wait); and the **title-glow clearance**, at every size of the Viewport set with reduced motion emulated, every text Content box outside the `h1` is at least 10 px from each `h1` glyph rectangle.
  - Run: `npm run test:e2e --workspace @zombills/web -- e2e/landing-motion.spec.ts e2e/landing.spec.ts`, then the whole `npm run test:e2e --workspace @zombills/web`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: `e2e/landing.spec.ts` (the two tests added; every existing test unchanged). No other existing test changes.
  - _Requirements: 3.9, 3.10, 4.4, 9.1, 9.2, 9.4, 9.5, 9.7, 10.7, 13.5, 13.6_

- [ ] 12. Checkpoint: full verification and traceability review
  - Run from the repo root, on a clean core build: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Searches that must find nothing in the new and changed non-test files (`logic/landing-text.ts`, `logic/scene-alphas.ts`, `landing/*`, `site-footer.tsx`, `slice-page.tsx`, `graveyard-backdrop.tsx`, `night-scene.tsx`, `savings-counter.tsx`): `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `history.`, `location.`, `console.`, `eval`, `new Function`, a hex colour literal, a `disabled` attribute, an `aria-label` on the Primary action or a Footer link, a positive `tabindex`, `<link`, `<image`, `<foreignObject`, `<text`, an `href` inside the Hero art, `requestAnimationFrame` or `setInterval` under `landing/`, and any import from `packages/core/src`. The only absolute URLs are the two GitHub links and the SVG namespace.
  - Check that `git diff` shows no change to `csp-plugin.ts`, `csp-plugin.test.ts`, `netlify.toml`, `netlify-config.test.ts`, `storage-lint.test.ts`, `index.css`, any `package.json`, `package-lock.json`, `apps/web/public` or `packages/core` (Req 11.2, 11.3, 11.5); that the `privacy-guard` hook and the Playwright request checks pass with no new exception; that `landing-motion.css` scopes the lean and candle rules with `:not([aria-disabled="true"])` (Req 9.8); that each changed existing test matches a row of "Existing tests that change" and removes or widens no assertion (Req 12.3); and that the task 7 notes record the Reaper link check (Req 8.8).
  - Traceability: list every acceptance criterion in `requirements.md` (1.1–1.9, 2.1–2.9 without the dropped 2.8, 3.1–3.10, 4.1–4.6, 5.1–5.7, 6.1–6.5, 7.1–7.5, 8.1–8.8, 9.1–9.8, 10.1–10.9, 11.1–11.7, 12.1–12.3, 13.1–13.10) and confirm that each one is named in the `_Requirements:_` line of at least one task in this file and in the table below. Then walk the table: each criterion's named test exists and passes, or, for a review or manual criterion, the check is in place.
  - Report any gap as a finding instead of fixing it here, unless the fix is a one-line test or text change.
  - _Requirements: all; in particular 9.8, 11.1, 11.2, 11.3, 11.5, 12.3, 13.9_

### Traceability

"LP" is `slice/landing-page.test.tsx`; "SPT" is `slice/slice-page.test.tsx`; "PS" is `slice/page-state.test.ts` and `page-state.property.test.ts`; "LT" is `logic/landing-text.test.ts`; "MT" is `logic/memory-text.test.ts`; "CT" is `src/contrast.test.ts`; "ST" is `src/static-checks.test.ts`; "LS" is `e2e/landing.spec.ts`; "LMS" is `e2e/landing-motion.spec.ts`; "LMT" is `slice/landing/landing-motion.test.tsx`; "DP" is `e2e/demo-path.spec.ts`.

| Req | Covered by | Task |
| --- | --- | --- |
| 1.1 | LP (DOM order); `isLandingView` in PS | 1, 4, 5 |
| 1.2 | LP (outline) | 4, 5 |
| 1.3 | LP (landmarks) | 4, 5 |
| 1.4 | SPT (Privacy note and Tip each once); LP (Footer, Own statement) | 4, 5 |
| 1.5 | LP (Return notes) | 4, 5 |
| 1.6 | LP (Non-landing views) | 4, 5 |
| 1.7 | SPT (`max-w-[1184px]`); LP (`max-w-[640px]` on every Non-landing view) | 4, 5 |
| 1.8 | LP (Start again); existing "Back to the start" tests | 4, 5 |
| 1.9 | LP (default, working, Non-landing `error`); existing state tests | 4 |
| 2.1 | LS (Landing checks 3, 4) | 4, 6 |
| 2.2 | LS (one document-coordinate check against every Content box) | 4, 6 |
| 2.3 | LS (Non-landing checks); `night-scene.test.tsx` | 2 |
| 2.4 | LS (`2r ≥ 47.5`, Landing and Non-landing) | 2, 6 |
| 2.5 | LS (halo and glow centres within 1 px) | 2, 6 |
| 2.6 | Moon `svg` unchanged in look; review | 2 |
| 2.7 | LS (three states × 14 sizes, 5 states × 3 sizes, failure messages) | 2, 6 |
| 2.8 | Dropped (review-requirements-1, finding 9) | — |
| 2.9 | LS (halo distance for text boxes) | 2, 6 |
| 3.1 | LS (check 11, R3.1 computed styles) | 4, 6 |
| 3.2 | LT; LP (DOM order) | 1, 4 |
| 3.3 | Classes (no Card behind the Banner text); CT (bare-scene pairs) | 4, 5 |
| 3.4 | `hero-art.tsx` (`useId`, tokens only); ST (URL check); checkpoint searches | 4, 12 |
| 3.5 | `aria-hidden` art; LP (DOM order next to the Primary action); lean rule in `landing-motion.css` | 4, 9 |
| 3.6 | Hero grid classes; LS (Fold and box checks) | 4, 6 |
| 3.7 | LS (check 8, eight sizes) | 6 |
| 3.8 | LS (check 8, every size, art ≥ 96 px) | 6 |
| 3.9 | Base styles are the end state; LMS (end equals still) | 4, 9, 11 |
| 3.10 | LS (check 7; moon at rest without reduced motion) | 6, 11 |
| 4.1 | LT; LP (name, no `aria-label`) | 1, 4, 5 |
| 4.2 | LP (`Reading US bank, signed amounts…`, outcome) | 4, 5 |
| 4.3 | LS (check 9, one `--moss` control; R3 classes) | 4, 6 |
| 4.4 | CT (focus ring); LS (check 11, R10.4); LMS (candle on hover and focus) | 4, 5, 6, 9, 11 |
| 4.5 | LP (`aria-disabled`, second click, working line on `bg-fog/95`) | 4, 5 |
| 4.6 | LP (outcome after the run) | 4, 5 |
| 5.1 | LT; LP (list name, labels, order) | 1, 4, 5 |
| 5.2 | LS (check 11, R5.2; 44 × 44 test) | 4, 6 |
| 5.3 | LP (each Secondary sample starts its Sample) | 4, 5 |
| 5.4 | LP (Own statement children, `accept`) | 4, 5 |
| 5.5 | LS (check 11, drop area ≤ 128 px; one `--moss` control) | 4, 6 |
| 5.6 | Existing drag-guard test, unchanged | 4 |
| 5.7 | LP (Non-landing gate heading and four buttons) | 4, 5 |
| 6.1 | LT; LP (exact step text) | 1, 4, 5 |
| 6.2 | LP (visible numbers in the `li` text) | 4, 5 |
| 6.3 | LS (check 11, R6.3) | 4, 6 |
| 6.4 | LT (no `!`); review of the copy | 1 |
| 6.5 | LP (no control in the section) | 4, 5 |
| 7.1 | LT; LP (badge text) | 1, 4, 5 |
| 7.2 | LP (focus on the Privacy note, URL unchanged) | 4, 5 |
| 7.3 | LS (check 11, R7.3; one-line test at three sizes) | 4, 6 |
| 7.4 | LT (banned words) | 1 |
| 7.5 | LP (no badge text on Non-landing views) | 4, 5 |
| 8.1 | LT; SPT (two links); LP (Footer order) | 1, 3, 5 |
| 8.2 | LP (`tabindex="-1"`, Tip not in the Footer); SPT | 1, 3, 5 |
| 8.3 | LP (`target`, `rel`, `aria-describedby`, names) | 3, 5 |
| 8.4 | DP (`landingRequests`); text-only Footer | 3, 6 |
| 8.5 | LS (check 11, R8.5); Footer classes | 3, 6 |
| 8.6 | CT (Footer pair on `--night` at 80 %) | 5 |
| 8.7 | MT (both texts and the join); `IDLE_SENTENCE` removed under typecheck | 1, 4 |
| 8.8 | Manual step, recorded in task 7 notes | 7 |
| 9.1 | LMS (start differs from still; hover and focus); LS (moon at rest) | 9, 11 |
| 9.2 | LMS (finite and within 5 s); ST (5 s bound, no `infinite`) | 9, 10, 11 |
| 9.3 | ST (334 ms stop rule) | 9, 10 |
| 9.4 | LMS (reduced-motion still state); ST (rules inside `no-preference`) | 9, 10, 11 |
| 9.5 | LMT (`play`, then `still` after Start again) | 9, 11 |
| 9.6 | Steering exception; ST (`@keyframes` only in `landing-motion.css`, no rAF or `setInterval`) | 8, 9, 10 |
| 9.7 | CT (effect pairs); ST (alpha strings); LS (title-glow clearance, 18 px rule) | 9, 10, 11 |
| 9.8 | LMT (Primary action works while `play`); `:not([aria-disabled="true"])` checked at the checkpoint | 9, 12 |
| 10.1 | LP (tab order, with and without "Open the graveyard") | 4, 5 |
| 10.2 | CT (`S === "#646567"`, every Landing pair) | 2, 5, 10 |
| 10.3 | CT (fill boundary, focus ring, dashed border) | 5, 6, 10 |
| 10.4 | LS (check 11, R10.4 `elementFromPoint`) | 4, 6 |
| 10.5 | LS (44 × 44 test at 390 × 844) | 6 |
| 10.6 | LS (320 × 568 and 200 % text) | 6 |
| 10.7 | LMS (reduced-motion still state) | 9, 11 |
| 10.8 | `aria-hidden` art and moon; no `<text>` in the art (checkpoint search) | 2, 4 |
| 10.9 | LP (Live region stays `""`) | 5 |
| 11.1 | DP (`landingRequests`, step 10 unchanged) | 6, 12 |
| 11.2 | `csp-plugin.test.ts` unchanged; DP CSP check; checkpoint `git diff` | 2, 9, 12 |
| 11.3 | Checkpoint `git diff` (no `package.json`, `public/` or font change) | 12 |
| 11.4 | ST (URL check and its fixture case) | 3 |
| 11.5 | `storage-lint.test.ts` unchanged; LP (URL unchanged); checkpoint searches | 12 |
| 11.6 | Review: art, steps and Primary action name do work | 4, 9 |
| 11.7 | Text-only Footer; checkpoint searches | 3 |
| 12.1 | Every existing suite passes | 4 |
| 12.2 | Notes in the three earlier specs | 7 |
| 12.3 | Changed tests match "Existing tests that change"; checkpoint review | 4, 12 |
| 13.1 | LP | 5 |
| 13.2 | SPT and `graveyard-memory-flow.test.tsx` rows | 3, 4 |
| 13.3 | Locator rows in jsdom and e2e | 4 |
| 13.4 | LP (Non-landing views) | 5 |
| 13.5 | LS | 6, 11 |
| 13.6 | LMS; LMT; ST | 9, 10, 11 |
| 13.7 | CT; ST | 3, 5, 10 |
| 13.8 | DP (`landingRequests`) | 6 |
| 13.9 | Full check in tasks 7 and 12 | 7, 12 |
| 13.10 | PS (origin table, `isLandingView`, P7) | 1 |
