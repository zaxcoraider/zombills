# Implementation Plan: landing-nits

One task per bug of `bugfix.md`, in bug order, then a checkpoint. Every path is in `apps/web/` unless it starts with `.kiro/` or `packages/`; inside a task, `src/` means `apps/web/src/`, `slice/` means `apps/web/src/slice/`, `landing/` means `apps/web/src/slice/landing/`, `graveyard/` means `apps/web/src/slice/graveyard/`, and `e2e/` means `apps/web/e2e/`. Each task writes its fix and its tests together; a task's new tests fail before its fix and pass after it.

Test policy:

- Each task runs the tests it names (with `npx vitest run <files>` in `apps/web`), then from the repo root `npm test`, `npm run typecheck` and `npm run lint`. All must pass at the end of the task.
- A task that adds an e2e test also runs `npm run test:e2e --workspace @zombills/web -- e2e/<file>.spec.ts` for its spec, then the whole `npm run test:e2e --workspace @zombills/web`.
- No task boundary leaves a suite red. A task never needs a later task to make its own tests pass.

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`). No new code calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`, or adds a remote image, icon, font or `<link rel="prefetch|preconnect|dns-prefetch">`. No new storage access, cookie or URL write.
- `csp-plugin.ts`, `netlify.toml`, `index.css`, `index.html`, every `package.json`, `package-lock.json`, everything under `apps/web/public` (including `z-favicon.svg`) and `packages/core` stay exactly as they are. No new dependency.
- Colours: Tailwind's token utilities with `/alpha`, or `color-mix()` over the seven tokens. No new hex value anywhere; `brand-mark.tsx` keeps only the hex values it already has, minus the one task 2 removes.
- Motion: no change to `landing/landing-motion.css`, `use-landing-motion.ts`, any `data-motion` value or any Framer Motion config. No new animation or transition.
- No new strings. No `aria-label` on a Footer link, the Primary action or a Secondary sample button; no `disabled` attribute; no positive `tabindex`. The Hero art and the brand mark stay `aria-hidden="true"`, not focusable, with no `<text>`, `<image>`, `<foreignObject>` or `href`.
- Existing tests do not change. No assertion is removed, made optional or widened. If an existing test fails, fix the new code; if the test itself is wrong, stop and report it.
- New jsdom tests follow the setup of `slice/landing-page.test.tsx`. New e2e tests go in `e2e/landing.spec.ts`, reuse its helpers (`startUsSample`, `collectContentBoxes` and friends), emulate `prefers-reduced-motion: reduce` and wait for `document.fonts.ready` before measuring. Failure messages name the viewport size and what was measured.
- Files are kebab-case; tests sit next to their source as `*.test.ts(x)`, e2e tests in `e2e/*.spec.ts` (`structure.md`). TypeScript strict mode.
- Do not commit.

---

- [ ] 1. Footer: the Reaper description on its own line (`slice/site-footer.tsx`, `slice/landing-page.test.tsx`, `e2e/landing.spec.ts`)
  - In `site-footer.tsx`, change the description element in the second `li` from `<span>{REAPER_DESCRIPTION}</span>` to `<span className="block">{REAPER_DESCRIPTION}</span>`. The link, the `{" "}` text node, `LINK_CLASS`, the `ul` and every other element stay as they are.
  - jsdom test in `landing-page.test.tsx`, a new case "the Reaper description is a block outside the link": the element with text exactly `REAPER_DESCRIPTION` inside `contentinfo` has class `block`, has the same parent `li` as the link "The Reaper on GitHub", is not contained in that link, and the link's accessible name is exactly "The Reaper on GitHub".
  - e2e test in `landing.spec.ts`, `footer reaper description on its own line ${w}x${h}` for 390 × 844 and 1280 × 720 on the empty Landing view: scroll the Footer into view; the top of the description's first client rect (via `Range.getClientRects()` on its text node) is at least the link box's bottom minus 0.5 px, and the left of that rect is within 1 px of the link box's left; the link "Zombills on GitHub" and the link "The Reaper on GitHub" have the same left within 1 px.
  - Run in `apps/web`: `npx vitest run src/slice/landing-page.test.tsx src/slice/slice-page.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts` and the whole `npm run test:e2e --workspace @zombills/web`.
  - _Bugs: 1.1, 1.2, 1.3_

- [ ] 2. Brand mark: no ground band at Hero size (`landing/brand-mark.tsx`, `landing/brand-mark.test.tsx`)
  - In `brand-mark.tsx`, delete the line `<path d="M0 432 C140 410 372 410 512 432 V512 H0 Z" fill="#1A1F2B" />`. The two grass-tuft paths (`M128 428 …` and `M350 428 …`) stay where they are, at the tombstone base (`y` 448). Nothing else in the file changes, and `public/z-favicon.svg` is not touched.
  - jsdom tests in `brand-mark.test.tsx`, a new case "draws no ground band": `render(<BrandMark />)`; no element has a `d` attribute starting with `M0 432`, no element has `fill="#1A1F2B"` (case-insensitive), and exactly two `path` elements have `fill="#8FD694"` (the tufts). A second new case "leaves the favicon alone": read `public/z-favicon.svg` with `node:fs` (path from `import.meta.url`) and assert it still contains `#1A1F2B`, so the favicon keeps its band; the file is checked unchanged by `git diff` at the checkpoint. The three existing cases stay as they are.
  - Run in `apps/web`: `npx vitest run src/slice/landing/brand-mark.test.tsx src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`.
  - _Bugs: 2.1, 2.2, 2.3_

- [ ] 3. Hero art: centred and about twice the size below lg (`landing/hero-art.tsx`, `slice/landing-page.test.tsx`, `e2e/landing.spec.ts`)
  - In `hero-art.tsx`, the SVG `className` becomes `zb-art h-48 w-64 self-center sm:h-[15.75rem] sm:w-[21rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[16.5rem] lg:w-[22rem] lg:self-start 2xl:h-[19.5rem] 2xl:w-[26rem]`. The `viewBox`, content, ids, `data-hero-art` and `data-motion` stay. `hero.tsx` does not change.
  - If the existing Fold check (check 8 in `e2e/landing.spec.ts`) fails at one of the `FOLD_SIZES` with this size, do not change the test: use `h-[10.5rem] w-56` (224 × 168 px) below `sm` instead, and record the choice and the failing size in the task notes. Any other existing failure: stop and report.
  - jsdom test in `landing-page.test.tsx`, a new case "the Hero art has a fixed size at every breakpoint": the `[data-hero-art]` class list contains `h-48`, `w-64`, `self-center`, `sm:h-[15.75rem]`, `sm:w-[21rem]`, `lg:h-[16.5rem]`, `lg:w-[22rem]`, `lg:self-start`, `2xl:h-[19.5rem]`, `2xl:w-[26rem]` and `zb-art`, and does not contain `h-24`, `w-32` or a bare `self-start` (or the fallback classes of the note above, if used).
  - e2e tests in `landing.spec.ts`, on the empty Landing view:
    - `hero art centred below lg ${w}x${h}` for 320 × 568, 390 × 844 and 768 × 1024: the art box is 256 × 192 px (below `sm`) or 336 × 252 px (768 px), each within 1 px; its centre x is within 1 px of the centre x of the Hero column (the parent of `[data-hero-art]`); its box does not intersect the Hero line's box or the Primary action's box.
    - `hero art does not shift ${w}x${h}` for 390 × 844 and 1280 × 720: measure the art box and the Primary action box right after `page.goto` (on `domcontentloaded`, before `document.fonts.ready`), then after `document.fonts.ready` and two animation frames; the art's width and height are the same within 0.5 px, and the Primary action's top differs only by what the Hero line moved (equal within 0.5 px of the Hero line's top change), so the art adds no shift of its own.
    - `hero art unchanged at lg ${w}x${h}` for 1280 × 720 and 1920 × 1080: the art box is 352 × 264 px and 416 × 312 px respectively, within 1 px, its left edge is right of the Hero line's right edge, and its top is within 1 px of the Hero line's top (grid row 1, `self-start`).
  - Run in `apps/web`: `npx vitest run src/slice/landing-page.test.tsx src/slice/landing/landing-motion.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts`, `npm run test:e2e --workspace @zombills/web -- e2e/landing-motion.spec.ts` and the whole `npm run test:e2e --workspace @zombills/web`.
  - _Bugs: 3.1, 3.2, 3.3_

- [ ] 4. Other samples and badge: a solid backdrop over the fence band (`landing/secondary-samples.tsx`, `landing/privacy-badge.tsx`, `src/contrast.test.ts`, `slice/landing-page.test.tsx`, `e2e/landing.spec.ts`)
  - In `secondary-samples.tsx`, the row `div` class becomes `flex flex-wrap items-center gap-x-3 rounded-2xl bg-night/80 pl-3 pr-1 text-sm sm:pl-4`. The `span`, `ul`, buttons and their classes stay.
  - In `privacy-badge.tsx`, add `bg-night/80` to the `p` class; nothing else changes (the moss border, padding and button stay).
  - Contrast test in `contrast.test.ts`, inside `describe("landing contrast (landing-polish R10.2)")`, a new case "Other samples row and Privacy badge text on night at 80 % over the scene is at least 4.5:1" that computes bone over `--night` at 80 % composited on the lightest bare scene (`#646567`), the same computation as the existing Footer case "Footer text on night at 80 % over the scene is at least 4.5:1", and expects at least 4.5. A second new case: the `BARE_FOCUS` ring (`--moss` 35 % glow over the `--night` 70 % band) against `--night` at 80 % over the scene is at least 3:1, using the existing focus-ring helper.
  - jsdom test in `landing-page.test.tsx`, a new case "Other samples and the badge sit on a night backdrop": the parent `div` of the `Other sample statements` list and the `p` holding `PRIVACY_BADGE_TEXT` each have class `bg-night/80` and `rounded-2xl`.
  - e2e test in `landing.spec.ts`, `samples row and badge are opaque over the scene ${w}x${h}` for 320 × 568, 390 × 844 and 1280 × 720 on the empty Landing view: for the samples row and the badge, `getComputedStyle(el).backgroundColor` has alpha at least 0.8 (parse the `rgba(…)`, `color(srgb … / a)` and `oklab(… / a)` forms, as `collectContentBoxes` does), and at 390 × 844 each element's box is a Content box reported by `collectContentBoxes` as a Card. The existing "privacy badge is one line", touch-target, focus-glow and moon tests pass unchanged.
  - Run in `apps/web`: `npx vitest run src/contrast.test.ts src/slice/landing-page.test.tsx src/static-checks.test.ts`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts` and the whole `npm run test:e2e --workspace @zombills/web`.
  - _Bugs: 4.1, 4.2, 4.3_

- [ ] 5. Desktop: normal gap between the tagline and the Hero line (`landing/landing-banner.tsx`, `slice/slice-page.tsx`, `slice/landing-page.test.tsx`, `e2e/landing.spec.ts`)
  - In `landing-banner.tsx`, add `lg:min-h-0` to the `header` class, after `min-h-[calc(var(--moon-d)*1.75+16px)]`. The `--moon-d` steps, the right padding, the Moon and every other element stay.
  - In `slice-page.tsx`, the Landing `main` class (line 249) becomes `mx-auto flex w-full max-w-[1184px] flex-col gap-12 px-4 pb-12 pt-6 sm:px-8 sm:pt-8 lg:pt-4`. The Non-landing `main` does not change.
  - If a landing moon check or the title-glow clearance test fails at `lg` or `2xl` with this change, do not change the test: replace `lg:min-h-0` with the smallest `lg:min-h-[…px]` (multiple of 8) that passes them all, keep the gap within 16–24 px if that is possible, and record the value and the failing check in the task notes. If no value gives both, stop and report.
  - jsdom test in `landing-page.test.tsx`, a new case "the Banner drops its minimum height from lg up": the Landing `header` class list contains `lg:min-h-0` and still contains `min-h-[calc(var(--moon-d)*1.75+16px)]`; the Landing `main` class list contains `pt-6`, `sm:pt-8` and `lg:pt-4`.
  - e2e tests in `landing.spec.ts`:
    - `tagline to Hero line gap ${w}x${h}` for 1280 × 720, 1440 × 900 and 1920 × 1080 on the empty Landing view: the top of the Hero line box minus the bottom of the tagline box ("Your bank statement is haunted.") is at least 16 px and at most 24 px.
    - `hero grid unchanged at lg ${w}x${h}` for 1280 × 720 and 1920 × 1080: the Hero line and the action wrapper share a left edge within 1 px; the art is right of the Hero line and its top equals the Hero line's top within 1 px; the Primary action's top is below the Hero line's bottom.
    - The existing landing moon tests (`landing moon ${w}x${h} ${state}`, including the restored-counter states) and `text stays 10 px from the h1 glyphs` pass unchanged.
  - Run in `apps/web`: `npx vitest run src/slice/landing-page.test.tsx src/slice/slice-page.test.tsx`; then root `npm test`, `npm run typecheck`, `npm run lint`; then `npm run test:e2e --workspace @zombills/web -- e2e/landing.spec.ts` and the whole `npm run test:e2e --workspace @zombills/web`.
  - _Bugs: 5.1, 5.2, 5.3_

- [ ] 6. Checkpoint: full verification
  - From the repo root, on a clean core build: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - `git diff --stat` shows changes only to `slice/site-footer.tsx`, `landing/brand-mark.tsx`, `landing/hero-art.tsx`, `landing/secondary-samples.tsx`, `landing/privacy-badge.tsx`, `landing/landing-banner.tsx`, `slice/slice-page.tsx`, their tests (`slice/landing-page.test.tsx`, `landing/brand-mark.test.tsx`, `src/contrast.test.ts`, `e2e/landing.spec.ts`) and `.kiro/specs/landing-nits/`. In particular nothing under `apps/web/public` (so `z-favicon.svg` is unchanged), `index.css`, `index.html`, `landing/landing-motion.css`, `csp-plugin.ts`, `netlify.toml`, any `package.json`, `package-lock.json` or `packages/core`.
  - Searches in the changed non-test files that must find nothing new: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `localStorage`, `document.cookie`, `aria-label`, a `disabled` attribute, a positive `tabindex`, and any hex colour literal other than those `brand-mark.tsx` already had.
  - The `diff` of existing test files adds cases only: no existing assertion is removed, made optional or widened.
  - Retake the Playwright screenshots of the empty Landing view at 390 × 844 and 1280 × 720 and confirm by eye each `N.2` criterion of `bugfix.md` (Footer description on its own line, no strip under the mark, centred larger art on the phone, readable samples row and badge, normal tagline gap on desktop). Delete the screenshots afterwards; they are not committed.
  - Record in the task notes any fallback taken in tasks 3 and 5. Report any gap as a finding instead of fixing it here, unless the fix is a one-line test or class change.
  - _Bugs: all; in particular 1.3, 2.3, 3.3, 4.3, 5.3_
