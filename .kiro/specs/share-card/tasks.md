# Implementation Plan: share-card

Tasks run in dependency order. Every path is in `apps/web/` unless it starts with `.kiro/` or `packages/`; inside a task, `src/` means `apps/web/src/`, `logic/` means `apps/web/src/slice/logic/`, `graveyard/` means `apps/web/src/slice/graveyard/`, and `e2e/` means `apps/web/e2e/`. Each task writes its code and its tests together. Property IDs (P1–P4) refer to "Correctness properties" in `design.md`, and every property test's name starts with its ID (e.g. `"P1: total lines state the Graveyard view's figures"`).

The tasks are grouped into batches, in the order of design "Task order": the pure content, fit, art and layout come first, then the properties on them, then the Renderer and the share and download helpers, then the panel, and last the browser tests. Task 6 needs only task 1 and may run in parallel with tasks 2–5.

Test policy:

- Each task runs the tests it names (with `npx vitest run <files>` in `apps/web`, or the Playwright command it names), plus `npm run typecheck` and `npm run lint` at the repo root. All of these must pass at the end of the task.
- The full suite (`npm test` at the repo root) is run once per batch, by the reviewer, at the batch's "done" line.
- No task may break an existing test. When a task changes an existing test, the task names it under "Existing tests"; no other existing test may change in that task. A task never needs a later task to make its own tests pass.

Each task is sized for one fresh agent run: at most two or three source files plus their tests.

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`, Req 6). No new file calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`, adds a `<link rel="prefetch|preconnect|dns-prefetch">`, a remote `<img>` or a remote font (Req 6.1). Nothing writes the Share content, the alt text, the `dataUrl` or the Image file to `localStorage`, `sessionStorage`, IndexedDB, the Cache API, cookies, the Page URL or the history state, and nothing calls `console` (Req 6.2). The only ways out are `navigator.share` and a file download; no third-party script or SDK (Req 6.4).
- `CSP_POLICY` in `csp-plugin.ts` stays exactly as it is; `csp-plugin.test.ts` and the CSP check in `e2e/demo-path.spec.ts` are not edited (Req 6.3). If a task finds that a target browser blocks the Preview or the download under this policy, it stops and records the finding in its task notes instead of changing the policy. The `privacy-guard` hook, the core `no-network` scans and the Playwright request check pass with no new exception, apart from the one skip that Req 6.5 allows and only task 9 may add.
- Do not change `index.css`, `motion.ts`, `slice-page.tsx`, `use-announce.ts`, `eslint.config.js`, `csp-plugin.ts`, `main.tsx`, any `package.json`, or anything in `packages/core` (design "Module layout"). The existing ESLint blocks for `src/**` and `src/slice/logic/**` cover the new files unchanged. No new dependency (Req 6.4).
- Files in `logic/` are pure: no React, DOM, `navigator`, storage, clock, randomness or logging, no mutation of arguments (Req 1.6, 2.7, 6.1). `share-card-fit.ts` and `share-card-art.ts` import only types from `share-card.ts`. Code that uses `document`, `navigator`, `URL` or `FileReader` lives in `graveyard/`.
- `shareCardContent` reads only `yearlySavingCents` from each Answer record and `currency` and `totalCents` from each Currency total (Req 1.5). The Share panel's props are `tombstones`, `savings`, `reduceMotion` and the optional `downloadFile`, nothing else; it passes the Renderer only the Share content (Req 4.3).
- Money is integer minor units (`money.md`). Totals are formatted with `formatMoney` from `logic/money.ts` and never recomputed, rounded or summed outside `savingsTotals` (Req 1.3). No file divides by 100 or calls `toFixed`. Expected money text in component tests is built with `formatMoney(…)` in the default locale; exact `en-US` strings are pinned only in `logic/` unit tests and in the E2E tests.
- Colours are only the four Colour tokens `night`, `fog`, `bone` and `moss`, resolved through `resolveToken` and mixed with `ctx.globalAlpha`. No hex colour literal and no colour string is built or parsed in the share-card code (Req 3.4). No shape kind, path command, text role or `TextOp` field beyond Req 2.1.
- The Renderer calls `fillText` with exactly three arguments, `toBlob` once and never `toDataURL`, and never adds the canvas to the document (Req 3.3, 3.5, 3.7). Its error messages name only the failed step and hold no content text (Req 3.6).
- All motion goes through Framer Motion. The Preview reuses `helperPanelMotion(reduceMotion)` from `motion.ts`; no new motion value, no `@keyframes`, no new design token, no CSS file change (Req 4.8, 7.7).
- A "disabled" control uses `aria-disabled="true"` with a handler that does nothing, never the `disabled` attribute (Req 7.2). Accessible names equal visible text, with no `aria-label` on the panel's buttons (Req 7.3). No positive `tabindex`, and no `focus()` call except the one focus rescue of Req 7.1.
- All panel text comes from `logic/share-card-text.ts`, is plain and has no `!`; the heading `Share your graveyard` is the only themed wording (Req 4.8).
- Component test files start with `// @vitest-environment jsdom`, set `MotionGlobalConfig.skipAnimations = true` in `beforeAll` (reset in `afterAll`), and spy on `console.error`, `console.warn` and `console.log`, failing on any call. They replace the Renderer with `vi.mock("./share-card-renderer", async () => ({ renderShareCard: (await import("./test-share-render")).renderControl.render }))` in the test file itself (design "Component tests").
- Files are kebab-case, components PascalCase, constants `SCREAMING_SNAKE_CASE`; unit tests go in `*.test.ts(x)` and property tests in `*.property.test.ts` next to the source file (`structure.md`). Test helpers are named `test-*.ts`.
- TypeScript strict mode, with `exactOptionalPropertyTypes`. Any `any` needs a comment explaining why (`tech.md`); a cast through `unknown` needs a comment too.
- Do not commit.

---

## Batch 1: pure content, fit, art, layout and properties (`apps/web/src/slice/logic/`)

Everything in this batch is pure and lives in `logic/`, so the existing purity lint covers it. Nothing in the app imports these files yet, so no component or E2E test changes. Tests build fixtures with `deepFreeze` from `logic/test-arbitraries.ts`.

- [x] 1. Share content, alt text and panel strings (`logic/share-card.ts`, `logic/share-card-text.ts`)
  - Create `share-card.ts` with every type of design "`logic/share-card.ts`" (`ShareCardContent`, `MeasureFn`, `ColourToken`, `Paint`, `TextRole`, `TextOp`, `PathCommand`, `ShapeOp` with one variant per line, `DrawOp`), the five constants `SHARE_IMAGE_SIZE`, `MAX_TOTAL_LINES`, `SHARE_SITE_NAME`, `SHARE_SITE_ADDRESS`, `SHARE_FILE_NAME`, and the functions `shareCardContent`, `shareCardAlt`, `sameShareContent` and `moreCurrenciesLine`, as in design "Share content", "Alt text" and "`sameShareContent`". Do not write `shareCardLayout`, `ROLE_STYLES` or `TEXT_LAYOUT` yet (task 3). It imports only the `AnswerRecord` and `CurrencyTotal` types and `formatMoney` from `./money`.
  - `shareCardContent` slices `savings` to `MAX_TOTAL_LINES`, writes `I buried <formatMoney(totalCents, currency, locale)> a year.` per shown total, sets `moreCurrencies = savings.length - totalLines.length`, and builds `countLine` from `n = tombstones.length` and `g` = records with `yearlySavingCents === null` by the three rows of Req 1.4, with `${n}` for ASCII digits. It reads no other field (Req 1.5).
  - Create `share-card-text.ts` with every constant of design "`logic/share-card-text.ts`" (`SHARE_HEADING`, `SHARE_INTRO`, `MAKE_IMAGE`, `MAKING_IMAGE`, `MAKE_IMAGE_AGAIN`, `SHARE_IMAGE`, `SAVE_IMAGE`, `SHARE_TITLE`, `IMAGE_UPDATED`, `RENDER_FAILED`, `IMAGE_SHARED`, `SHARE_FAILED`, `DOWNLOAD_STARTED` built from `SHARE_FILE_NAME`, `SAVE_FAILED`) and `imageReadyNotice(alt)`.
  - Unit tests `share-card.test.ts` (content and alt part; task 3 adds the layout part to the same file): every row of Req 1.8 in `en-US` (the four-currency row gives EUR, GBP and JPY lines and `moreCurrencies: 1`); each row of the Req 1.4 table, including `n = 1`, `g = 1` and the all-guessed row; `n = 0` gives `I buried 0 subscriptions. Saving unknown.`; fixed Graveyards (none, one Tombstone, all guessed, mixed, 40 Tombstones) where the number in `countLine` equals the Buried count and, for non-empty Graveyards only, `saving unknown` appears exactly when a Guessed tombstone exists (the empty Graveyard is excluded from that check and asserts the exact Req 1.4 string; Req 9.1 amended, option A); records whose fields other than `yearlySavingCents`, and totals whose fields other than `currency` and `totalCents`, are getters that throw; deep-frozen arguments to `shareCardContent` and `shareCardAlt` do not throw, are not mutated, and a second call on a `structuredClone` gives a deeply equal result; `shareCardAlt` for the second Req 1.8 row equals the literal of Req 2.9, and for `moreCurrencies` 0, 1 (`And 1 more currency.`) and 3 (`And 3 more currencies.`); `moreCurrenciesLine(2)` is `+2 more`; `sameShareContent` is true for a clone and false when `totalLines` (one line, or the length), `moreCurrencies` or `countLine` differs.
  - Unit tests `share-card-text.test.ts`: `imageReadyNotice(alt)` is `"Image ready. " + alt`; `DOWNLOAD_STARTED` is `Download started: zombills-graveyard.png.`; the button labels and notices equal the texts of Req 4.2, 4.4, 4.6, 4.7 and 5.1–5.6; no exported string contains `!`.
  - Existing tests: none change.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.8, 2.9, 4.2, 4.4, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.5, 5.6, 6.1, 9.1_

- [x] 2. Fit and art (`logic/share-card-fit.ts`, `logic/share-card-art.ts`, `src/contrast.test.ts`)
  - Create `share-card-fit.ts` as in design "`logic/share-card-fit.ts`" and "Fit": `RoleStyle`, `DISPLAY_FAMILY`, `SANS_FAMILY`, `ELLIPSIS`, `fontFor`, `FittedLine`, `fitLine` (shrink 1 px at a time from `startPx` to `floorPx`; the whole source at the floor when `shorten` is false; otherwise `shortenToFit` at the floor) and `shortenToFit` (a linear scan over `Array.from` code-point prefixes, longest first, `trimEnd`, skip an empty prefix, `prefix + "…"`; `…` unmeasured as the last fallback). `measure` is called only with the source at sizes from start to floor and with candidates at the floor size (Req 2.7). A `NaN` width falls through to the last fallback.
  - Create `share-card-art.ts` as in design "Art": `TOMBSTONE_BOX`, `GROUND_TOP`, `STONE_WASH_ALPHA = 0.12`, `GROUND_ALPHA = 0.75`, the integer `STONE` path (an arch of 32 segments, `Math.round`, from `move(150, 900)` to `close`), and `shareCardArt()`, which returns the same frozen list of the eight operations of the design table, built once at module load. Every gradient stop has `alpha: 1`.
  - Unit tests `share-card-fit.test.ts`: `fontFor` for each family and weight (e.g. `600 72px "Inter", ui-sans-serif, system-ui, sans-serif`); `DISPLAY_FAMILY` and `SANS_FAMILY` equal the `--font-display` and `--font-sans` values parsed from `src/index.css`; the shrink loop stops at the floor; a style with `floorPx: 1` and `shorten: false` goes down to 1 px and is never shortened; shortening keeps whole surrogate pairs (`"ab😀cd"`), drops trailing spaces before `…`, and falls back to `…`; a `NaN` measure does not throw; a recording measure sees only the calls Req 2.7 allows.
  - Unit tests `share-card-art.test.ts`: the bounding box of the `STONE` path equals `TOMBSTONE_BOX`; the path starts with `move` and ends with `close` and holds only `move`, `line` and `close`; every coordinate is an integer; the moon disc lies outside the stone (distance from (870, 290) to (540, 610), minus 390, is at least 52; the halo is not checked); every Paint token is one of the four Colour tokens with alpha in [0, 1]; the art is the same frozen list on every call.
  - In `src/contrast.test.ts`, add an sRGB `over(background, colour, alpha)` helper and cases that read `STONE_WASH_ALPHA` and `GROUND_ALPHA` from `share-card-art.ts`: `bone` and `moss` on the stone face (`fog` with `bone` at `STONE_WASH_ALPHA`), `bone` on the ground (`fog` with `night` at `GROUND_ALPHA`), and `bone` on `night`, each at least 4.5:1 (design "Existing tests that change").
  - Existing tests: `src/contrast.test.ts` (the `over` helper and four new cases added; existing cases unchanged).
  - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 6.1_

- [x] 3. Layout (`logic/share-card.ts`)
  - Add `ROLE_STYLES` (the table of design "Role styles and fixed positions", with `fill`; `RoleStyle` from `share-card-fit.ts`), `TEXT_LAYOUT` (exactly the design constant) and `shareCardLayout(content, measure)` as in design "Layout": the art from `shareCardArt()` first, then `brand` at baseline 150, then the block of `total` lines, the `more-currencies` line when `moreCurrencies > 0`, and the `count` line, centred once in the band with integer slot heights, then `address` at baseline 1004. Each text op is built by `fitLine` and has `x = 540` and `align: "center"`. A comment states that Req 2.6 holds only for contents `shareCardContent` can return; a hand-built content with more total lines is still laid out without throwing.
  - Unit tests, layout part of `share-card.test.ts`, with the fake measure `sizePx × 0.5 × code points` (reading `sizePx` from the font with `/ (\d+)px /`): every example of Req 2.9 (`brand`, one `total` at 53 px, `count`, `address`, no `more-currencies` for the first Req 1.8 row; `I buried $90,071,992,547,409.91 a year.` whole at 32 px; the 51-code-point count line whole at 25 px); the `+N more` line for 4 and 6 currencies and its absence for 3; no shape after the first `TextOp` (Req 2.2); only the shape kinds and path commands of Req 2.1 appear; every `Paint.token` is a Colour token with alpha in [0, 1] and every gradient stop has `alpha: 1`; the largest content gives `top = 412` and a last slot ending at 857; a count-only content gives baseline 649; every block line box lies inside `TOMBSTONE_BOX` and every line box and horizontal extent within [48, 1032]; a hand-built five-line content and a measure that returns `NaN` do not throw; a recording measure sees only the calls Req 2.7 allows; deep-frozen arguments to `shareCardLayout` do not throw, are not mutated, and a second call on a `structuredClone` with the same measure gives deeply equal operations.
  - Existing tests: `logic/share-card.test.ts` (from task 1; the layout cases are added, the content and alt cases unchanged).
  - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.9, 9.1_

- [x] 4. Properties P1–P4 (`logic/share-card.property.test.ts`)
  - Tests only. If a property fails, fix the bug in the task 1–3 file that owns it and name it in the task notes; do not weaken the property.
  - Generators in the test file, as in design "Generators": `tombstoneArb` (`answerRecordArb` with `answer` set to `"not-using"` by `.map`, `merchant` overridden by the `fc.oneof` of Req 10.1, `cadenceAssumed` set to `true` exactly when `yearlySavingCents` is `null`); `graveyardArb` (0 to 40 Tombstones mapped to `{ tombstones, savings: savingsTotals(tombstones) }`, through `deepFreeze`); `localeArb` (`en-US`, `en-GB`, `de-DE`); `measureArb` (a table of 1 to 64 factors in [0, 2], `w(c) = table[c % table.length]`, `width = Σ w(c) × sizePx`); `contentArb` (`graveyardArb` and `localeArb` through `shareCardContent`). Default 100 runs.
  - **P1** totals as on the Graveyard view; **P2** nothing but the content, with the expected Text-op list built from the content alone without calling `shareCardLayout` or `fitLine`, and the `merchant` → `"X"`, `serviceId` → `null` replacement leaving `shareCardContent` deeply equal; **P3** fits and never clips (widths, unshortened `total` and `count`, no overlapping line boxes, [48, 1032], inside `TOMBSTONE_BOX`, positive integer `sizePx` no larger than the start size, `font` contains `${sizePx}px`); **P4** the alt text equals the string built by position as in Req 2.8.
  - Existing tests: none change.
  - _Requirements: 1.2, 1.3, 1.5, 2.4, 2.5, 2.6, 2.8, 7.4, 10.1, 10.2, 10.3, 10.4, 10.5_

> **Batch 1 done:** reviewer runs root `npm test`, `npm run typecheck` and `npm run lint`, all green; P1–P4 pass; `logic/` holds `share-card.ts`, `share-card-fit.ts`, `share-card-art.ts` and `share-card-text.ts`, and no app file imports them yet.

---

## Batch 2: Renderer and the share and download helpers (`apps/web/src/slice/graveyard/`)

These files touch the canvas, `document.fonts`, `navigator`, `URL` and `FileReader`, so they live in `graveyard/`. Their tests run in jsdom with fakes only; no real canvas, share sheet or download runs before task 9. Nothing in the app imports them yet.

- [x] 5. Renderer (`graveyard/share-card-renderer.ts`)
  - Create `share-card-renderer.ts` as in design "`graveyard/share-card-renderer.ts`" and "Renderer": `CanvasContextLike`, `CanvasLike`, `FontLoader`, `RenderDeps`, `RenderedShareCard`, `renderShareCard`, `defaultResolveToken`, `facesToLoad`, `drawOp`, and the private `createCanvasElement` (a detached `<canvas>`, wrapped if `HTMLCanvasElement` does not assign to `CanvasLike`), `defaultFonts`, `loadFaces`, `toPngBlob` and `readDataUrl`.
  - `loadFaces` awaits `fonts.ready` and then `Promise.allSettled` over `facesToLoad(content)` (IM Fell English 400 with `Zombills …`; Inter 600 with the total lines, skipped when there are none; Inter 500 with the `+N more` line, the count line, the address and `…`), and never rejects (Req 3.2). The canvas is 1080 × 1080, not scaled by `devicePixelRatio` (Req 3.3). The Measure function sets `ctx.font` and reads `measureText(text).width`. `drawOp` covers every kind with a `never` default, sets `font`, `textAlign`, `textBaseline = "alphabetic"` and `fillStyle` before each three-argument `fillText`, and resets `globalAlpha` to 1 in a `finally` (Req 3.4). One `toBlob(…, "image/png")`, then the canvas shrinks to 0 × 0; `dataUrl` comes from `FileReader.readAsDataURL` on the same Blob; `file` is `new File([blob], SHARE_FILE_NAME, { type: "image/png" })` (Req 3.5).
  - Failures reject with exactly `share-card: no canvas`, `share-card: no 2d context`, `share-card: drawing failed`, `share-card: no png` or `share-card: could not read the png`; a browser error is replaced, never wrapped, and nothing is logged (Req 3.6).
  - Unit tests `share-card-renderer.test.ts` (jsdom), every case of design "Renderer and helper unit tests" for this file: a fake canvas whose context records calls and property writes in one ordered log, a fake `FontLoader` and a fake `resolveToken` returning `"<token>"` markers; 1080 × 1080 at `toBlob`; `ready` awaited and each face's `load(font, text)` text containing every source text of that face, all before the first `measureText`; Inter 600 skipped with no total line; every `fillText` call has three arguments and the layout's texts in order; the four text properties set before each `fillText`; each `alpha` written to `globalAlpha` and reset to 1; `toBlob` once with `"image/png"` and the `toDataURL` spy never called; `dataUrl` from the spied `readAsDataURL` on that Blob; the file's name, type and bytes; each rejection message, none containing a content string; `fonts: null`, a rejecting `ready` and a rejecting or throwing `load` still draw and resolve; `drawOp` on a hand-built `path` and `vertical-gradient` op (one cast `{ addColorStop } as unknown as CanvasGradient`, with a comment); nothing logged; the default `resolveToken` returns the `src/index.css` values of `--night`, `--fog`, `--bone` and `--moss` once the test sets them on `document.documentElement.style`.
  - Existing tests: none change.
  - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 6.1, 6.2, 9.2_

- [x] 6. Share and download helpers (`graveyard/share-image.ts`, `graveyard/download-file.ts`)
  - Needs only task 1 (`SHARE_TITLE`); may run in parallel with tasks 2–5.
  - Create `share-image.ts` as in design "`graveyard/share-image.ts`" and "Share and save flow": `SharePath`, `ShareNavigator`, `sharePathFor(nav, file)` (the Share path only when `share` and `canShare` are functions and `canShare({ files: [file] })` returns `true` without throwing; never throws), `ShareHandlers`, `shareImage(nav, file, handlers)` (calls `nav.share({ files: [file], title: SHARE_TITLE })` through the object as its first statement, with nothing awaited before it; a synchronous throw or a rejection other than `AbortError` calls `failed`; resolve calls `shared`; `AbortError` calls neither; never throws), `isAbortError` and `currentNavigator()`.
  - Create `download-file.ts` as in design "`downloadFile` (default)": `REVOKE_AFTER_MS = 1000`, module-level `liveUrl`, revoke the previous URL first, `URL.createObjectURL`, a temporary `<a>` with `href` and `download` appended to `document.body`, `click()` in a `try` with `remove()` in its `finally`, and a `setTimeout` that always revokes its own URL and clears `liveUrl` only if it is still that URL (Req 5.6, 5.7). The `blob:` URL is used only as this anchor's `href` (Req 6.3).
  - Unit tests `share-image.test.ts`: `sharePathFor` for both present with `canShare → true`, `canShare → false`, `canShare` throws, `canShare` missing, `share` missing, and `nav` undefined; `shareImage` for resolve → `shared`, `new DOMException("x", "AbortError")` → neither handler, `NotAllowedError` → `failed`, a synchronous throw → `failed`; `share` called synchronously with exactly `{ files: [file], title: "My Zombills graveyard" }` and `this === nav`; `isAbortError` for a `DOMException`, a plain `{ name: "AbortError" }`, `null` and a string.
  - Unit tests `download-file.test.ts` (jsdom): mock `URL.createObjectURL` and `URL.revokeObjectURL`, spy on `HTMLAnchorElement.prototype.click` with an implementation that does nothing; `download` and `href` on the clicked anchor; no anchor left in `document.body`; with `vi.useFakeTimers()`, revoke runs after `REVOKE_AFTER_MS`; a second call within the second revokes the first URL first; two calls and then the timers past `REVOKE_AFTER_MS` leave both URLs revoked; a throwing `click` still removes the anchor; the console stays silent; `afterEach` runs pending timers so `liveUrl` is `null` before the next test.
  - Existing tests: none change.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 6.1, 6.3, 6.4, 9.4_

> **Batch 2 done:** reviewer runs root `npm test`, `npm run typecheck` and `npm run lint`, all green; `graveyard/` holds `share-card-renderer.ts`, `share-image.ts` and `download-file.ts`, none imported by the app yet; no test reaches a real canvas, `navigator.share` or jsdom navigation.

---

## Batch 3: Share panel (`apps/web/src/slice/graveyard/`)

Task 7 wires the panel into the Graveyard view with every state except the main button's action; task 8 adds sharing and saving (design "Task order": split as review 1 #8 asked). Both run on the Page with the real `role="status"` Live region and the `us-signed.csv` Sample.

- [x] 7. Render runs, panel states and the Graveyard view line (`graveyard/use-share-image.ts`, `graveyard/share-panel.tsx`, `graveyard/graveyard-view.tsx`)
  - Create `use-share-image.ts` as in design "`graveyard/use-share-image.ts`" and "Render runs": `ReadyImage`, `ShareImageState`, the reducer (`start`, `done`, `fail`), `latest.current = content` written during render, `runSeq` bumped on every run and on unmount, the latest-content rule for every run including the first (a stale result starts a new run with the same trigger), `sharePathFor(currentNavigator(), result.file)` once per used Image, `imageReadyNotice(alt)` for a `make` run and `IMAGE_UPDATED` for an `update` run, `onBeforeFail?.()` then `fail` and `RENDER_FAILED` on rejection, `make()` ignored while a run is active, and the effect that starts an `update` run when a Preview is shown, no run is active and the content changed. `current` is `image !== null && sameShareContent(image.content, content)`.
  - Create `share-panel.tsx` with `SharePanelProps` and `SharePanel` as in design "Share panel": `content = useMemo(() => shareCardContent(tombstones, savings), [tombstones, savings])`; the `section` labelled by its `useId` `h3` `SHARE_HEADING`; `SHARE_INTRO`; the always-mounted Make button (`MAKING_IMAGE` with `aria-disabled="true"` while a run is active, else `MAKE_IMAGE_AGAIN` after a first Image, else `MAKE_IMAGE`); when an Image exists, a container with `aria-busy="true"` while `run !== null || !current`, the `motion.img` keyed by `dataUrl` with `alt`, `width` and `height` 1080, `className="block h-auto w-full max-w-[27rem]"` and `{...helperPanelMotion(reduceMotion)}`, and the main button (`SHARE_IMAGE` or `SAVE_IMAGE` by `path`, `aria-disabled="true"` unless `current`); the failure line `RENDER_FAILED` when `state.failed`; `SHARE_BUTTON_CLASS` of the design. `onMain` checks `current` and is otherwise a stub that returns (task 8). The `downloadFile` prop is declared with the default from `download-file.ts`. `onBeforeFail` moves focus to the Make button only when the main button has focus (Req 7.1 exception).
  - In `graveyard-view.tsx`, add `<SharePanel tombstones={tombstones} savings={savings} reduceMotion={reduceMotion} />` straight after the tombstone `ul`, inside the `tombstones.length > 0` branch. Nothing else in the view changes.
  - Test helpers: `graveyard/test-share-render.ts` with `renderControl` (a `renderShareCard` mock whose calls each return a deferred promise, settled with `resolveRender(i, result)` or `rejectRender(i)`, and the recorded call arguments), importing only `vitest` and types; `graveyard/test-share.ts` with `openGraveyardWithNetflix()` and `openGraveyardWithNetflixAndSpotify()` (render `<App />`, choose `US bank, signed amounts`, keep Adobe Creative Cloud and Riverside Gym Membership, bury Netflix, also Spotify for the second, open the graveyard), re-exporting `renderControl`.
  - Component tests `share-panel.test.tsx`, every case of design "Component tests" for this file: the region `Share your graveyard` after the tombstone list and before `Resting`, with the intro and `Make an image`; no panel with no Tombstone (Unbury Netflix); after a click, the same focused Make element reads `Making the image…` with `aria-disabled="true"` and a second click does not call the renderer again; on resolve, the Preview's `src`, `width`, `height` and alt, `Image ready. …` in the Live region, `Make the image again`, focus unmoved; the stale first render (Unbury Spotify while pending: no Preview and no main button for the stale result, a second call with the new content, `Image ready. …` for it); the change while shown (old `img` kept, `aria-busy="true"`, main button `aria-disabled="true"` and ignoring clicks with the `vi.mock("./download-file")` mock not called, then the new Preview, `aria-busy` gone, the button enabled, `Image updated.`); `Bury after all` on Spotify in `Resting` starts a re-render; a rejecting render shows and announces `Could not make the image in this browser.` with no Preview, no main button, a usable `Make an image`, and `Make the image again` after an earlier Image; the focus rescue (main button focused when an `update` run rejects → focus on the Make button); every accessible name in the panel equals its text and `expectUniqueButtonNames(document.body)` passes in each state; Tab order Make button, then main button, with no positive `tabindex`; `Start again` while a render is pending, then resolve: no warning, no state write, no announcement; `renderShareCard` called with exactly one argument deeply equal to `{ totalLines: ["I buried " + formatMoney(21588, "USD") + " a year."], moreCurrencies: 0, countLine: "1 subscription buried." }`; a spy wrapper around `SharePanel` (`vi.mock("./share-panel")` with `importOriginal`) records props whose keys are exactly `reduceMotion`, `savings` and `tombstones`, each tombstone with exactly the `AnswerRecord` keys; with `useReducedMotion` mocked to `true`, as in `graveyard-flow.reduced.test.tsx`, the Preview's motion comes from `helperPanelMotion(true)` (a spy on the `motion.ts` export).
  - Run the whole web suite (`npx vitest run` in `apps/web`) in this task, because the view now renders the panel.
  - Existing tests: none change. `graveyard/graveyard-view.test.tsx` (the `ul > li > div > section` count of 2 and its `expectUniqueButtonNames` calls), `slice/graveyard-flow.test.tsx` ('hides every svg and backdrop layer and draws no img' on the Burial stage, 'tabs the first card in the drawn order' on the Rising), `graveyard-flow.reduced.test.tsx`, `graveyard-flow.motion.test.tsx`, `slice-page.test.tsx`, `app.test.tsx` and `static-checks.test.ts` must pass unchanged. If one fails, fix the new code, not the test; if the test is wrong, stop and report it.
  - _Requirements: 1.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 9.3, 9.5_

- [x] 8. Share and save (`graveyard/share-panel.tsx`)
  - Replace the `onMain` stub with `onMain` and `trySave` as in design "Share and save flow": return unless an Image exists and `current`; clear `shareMessage`; on the Save path `trySave(file, () => announce(DOWNLOAD_STARTED))`; on the Share path `shareImage(currentNavigator() ?? {}, file, …)` with `shared` → `IMAGE_SHARED` and `failed` → `trySave` then `SHARE_FAILED` shown and announced, both guarded by a `mounted` ref; `AbortError` does nothing. `trySave` calls the `downloadFile` prop with the Image file and `SHARE_FILE_NAME`, and on a throw shows and announces `SAVE_FAILED` instead of the other message. `message` is `state.failed ? RENDER_FAILED : shareMessage`, and `shareMessage` is cleared at the start of the next activation of either button (Req 7.5). Nothing is awaited before `navigator.share` (Req 5.2). No `focus()` call.
  - Component tests `share-panel.share.test.tsx`, every case of design "Component tests" for this file: `navigator.share` and `navigator.canShare` set with `Object.defineProperty(window.navigator, …, { configurable: true, value })` and deleted in `afterEach`; page-level cases use `vi.mock("./download-file")`; one case per row of the Req 5.9 table with the button text and the outcome (`Image shared.`; nothing; download plus `Could not share the image. Download started instead.` shown and announced; `Download started: zombills-graveyard.png.`; the `canShare → false`, `canShare` throws and neither-present rows give `Save image` and a download); `share` has been called by the time `fireEvent.click` returns, with only `files` and `title` and the Image file; `downloadFile` gets the same `File` object and `zombills-graveyard.png`; after `AbortError`, focus stays on the button and nothing is announced; two `Save image` clicks announce twice with the region emptied between them; a throwing `downloadFile` gives `Could not save the image in this browser.` on the Save path and in the share fallback; a direct render of `<SharePanel>` inside a test `AnnounceContext.Provider` with a `downloadFile` prop shows that the prop is used instead of the default. Also run `share-panel.test.tsx`.
  - Existing tests: none change. `share-panel.test.tsx` (task 7) must pass unchanged.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 6.2, 6.4, 7.1, 7.5, 9.4_

> **Batch 3 done:** reviewer runs root `npm test`, `npm run typecheck` and `npm run lint`, all green; the Graveyard view shows the Share panel only with a Tombstone; every existing web test passes unchanged; no test reaches jsdom navigation or a real `navigator.share`.

---

## Batch 4: browser tests and the checkpoint

Task 9 is the first task that runs real fonts, a real canvas and a real download. A CSP or browser finding stops here and is recorded, as Req 6.3 requires; `CSP_POLICY` is never edited.

- [x] 9. E2E demo path and layout (`e2e/demo-path.spec.ts`, `e2e/layout.spec.ts`)
  - Tests only. If a browser test finds a bug in the app, fix it in the file that owns it and name it in the task notes; if it finds that the browser blocks the Preview or the download under the current CSP, stop and record the finding (Req 6.3).
  - `demo-path.spec.ts`: keep every existing step and check. In Step 1, before the `goto` of Step 2, add `await page.addInitScript(() => { delete (Navigator.prototype as Partial<Navigator>).share; delete (Navigator.prototype as Partial<Navigator>).canShare; });`, with a comment that the cast is needed for TS2790 under `strict`. In Step 7, after `You buried $215.88 a year.` is visible and before the storage check: the region `Share your graveyard` is visible; click `Make an image`; the region's `img` has alt `Image of your Zombills graveyard. I buried $215.88 a year. 1 subscription buried. zombills.netlify.app.`; the `Save image` button is visible; `Promise.all([page.waitForEvent("download"), save.click()])`; `suggestedFilename()` is `zombills-graveyard.png`; the file at `await download.path()` starts with `89 50 4E 47 0D 0A 1A 0A`, has `IHDR` at bytes 12–15, and `readUInt32BE(16)` and `readUInt32BE(20)` are both 1080. No `document.fonts.check`. The storage, cookie and URL check then runs unchanged.
  - Run Step 10 unchanged first. Only if it reports a request whose URL starts with `data:image/png;base64,` or with `"blob:" + origin + "/"` add exactly that `continue`, with a comment citing Req 6.5; every other request still fails the test, and the console check (`problems`) stays empty.
  - `layout.spec.ts`: one new test per case, 320 × 568, 390 × 844, 1000 × 900, and 390 × 844 with `fontSize = "200%"`. Each uses the same init script, buries Netflix with the existing `buryNetflix(page, fontSize)`, opens the graveyard, clicks `Make an image` and waits for the Preview, then checks `document.documentElement.scrollWidth ≤ innerWidth`, that the Preview's box lies inside the viewport's width and inside the panel's box, and that every button in the panel is at least 44 × 44 CSS px. The existing layout tests stay unchanged.
  - Run `npm run test:e2e --workspace @zombills/web`, then the full check of design "Testing strategy": root `npm test`, `npm run typecheck`, `npm run lint`.
  - Existing tests: `e2e/demo-path.spec.ts` ('demo path: sample statement to burial, graveyard and back, with no stray requests': the init script, the Step 7 image checks, and at most the one Step 10 skip of Req 6.5; its CSP check in Step 3, storage check and console check unchanged) and `e2e/layout.spec.ts` (four Share panel cases added). Also in both files (reviewer decision, approved): the `getByRole('heading', { name: 'Your graveyard' })` locators now pass `exact: true` (`demo-path.spec.ts` Step 7 and `layout.spec.ts` lines 128 and 247, plus the same locator in the new Share panel test), because the Share panel's `Share your graveyard` `h3` matches the substring name; `exact: true` tightens them to the same `h2` they always meant, and nothing else in those checks changes. Step 10 passed unchanged, so no Req 6.5 `data:`/`blob:` skip was added.
  - _Requirements: 4.5, 6.2, 6.3, 6.5, 7.6, 9.6, 9.7, 9.8_

- [x] 10. Checkpoint: full verification and traceability review
  - Run from the repo root, on a clean core build: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Searches that must find nothing in the new non-test files (`logic/share-card*.ts`, `graveyard/share-card-renderer.ts`, `share-image.ts`, `download-file.ts`, `use-share-image.ts`, `share-panel.tsx`): `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `document.cookie`, `history.`, `location.`, `console.`, `toDataURL`, a hex colour literal, `/ 100`, `toFixed`, a `disabled` attribute, an `aria-label` on a panel button, a positive `tabindex`, `<link`, and any import from `packages/core/src`. In `logic/share-card*.ts` also `document`, `window`, `navigator`, `Date.now`, `performance.now` and `Math.random`. `fillText` is called only with three arguments. `shareCardContent` reads no field other than `yearlySavingCents`, `currency` and `totalCents`.
  - Check that `git diff` shows no change to `csp-plugin.ts`, `csp-plugin.test.ts`, `index.css`, `motion.ts`, `slice-page.tsx`, `use-announce.ts`, `eslint.config.js`, `main.tsx`, any `package.json` or `packages/core`; that the `privacy-guard` hook, the core `no-network` scans and the Playwright request check pass with no new exception beyond the one Req 6.5 skip, if task 9 added it (Req 6.5, 9.8); and that no task note records an unresolved CSP finding (Req 6.3).
  - Traceability: list every acceptance criterion in `requirements.md` (1.1–1.8, 2.1–2.9, 3.1–3.7, 4.1–4.9, 5.1–5.9, 6.1–6.5, 7.1–7.8, 9.1–9.8, 10.1–10.5; Requirement 8 is removed and has no criteria) and confirm that each one is named in the `_Requirements:_` line of at least one task in this file and in the table below. Then walk the table: each criterion's named test exists and passes, or, for a review criterion, the check is in place.
  - Report any gap as a finding instead of fixing it here, unless the fix is a one-line test or text change.
  - _Requirements: all; in particular 1.5, 3.4, 4.3, 6.1, 6.2, 6.3, 6.4, 6.5, 9.8_

### Traceability

"SC" is `logic/share-card.test.ts`; "SP" is `graveyard/share-panel.test.tsx`; "SS" is `graveyard/share-panel.share.test.tsx`; "R" is `graveyard/share-card-renderer.test.ts`.

| Req | Covered by | Task |
| --- | --- | --- |
| 1.1 | `share-card.ts` exports under typecheck; SC | 1 |
| 1.2 | SC (Req 1.8 rows); P1 | 1, 4 |
| 1.3 | SC (four-currency row); P1 | 1, 4 |
| 1.4 | SC (each table row, fixed Graveyards) | 1 |
| 1.5 | SC (throwing getters); P2 (`merchant`, `serviceId` replaced); checkpoint search | 1, 4, 10 |
| 1.6 | SC (deep-frozen, `structuredClone`); purity lint | 1 |
| 1.7 | SP (no panel with no Tombstone); `graveyard-view.tsx` branch | 7 |
| 1.8 | SC (every row) | 1 |
| 2.1 | Types under typecheck; SC (kinds and commands); `share-card-art.test.ts`; `drawOp` `never` default | 2, 3, 5 |
| 2.2 | SC (no shape after the first `TextOp`) | 3 |
| 2.3 | `share-card-art.test.ts`; `contrast.test.ts` | 2 |
| 2.4 | `share-card-fit.test.ts` (`fontFor`, families from `index.css`); SC; P2 | 2, 3, 4 |
| 2.5 | `share-card-fit.test.ts`; SC (Req 2.9 sizes); P2, P3 | 2, 3, 4 |
| 2.6 | `share-card-art.test.ts` (`TOMBSTONE_BOX`); SC (`top = 412`, baseline 649, margins); P3 | 2, 3, 4 |
| 2.7 | `share-card-fit.test.ts` and SC (recording measure, `NaN`, five-line content, determinism) | 2, 3 |
| 2.8 | SC (alt rows); P4 | 1, 4 |
| 2.9 | SC (every example) | 1, 3 |
| 3.1 | R; types under typecheck | 5 |
| 3.2 | R (`ready`, `load` per face before `measureText`, fallbacks) | 5 |
| 3.3 | R (1080 × 1080, three-argument `fillText`, text properties) | 5 |
| 3.4 | R (`globalAlpha`, default `resolveToken` against `index.css`); checkpoint hex search | 5, 10 |
| 3.5 | R (one `toBlob`, no `toDataURL`, same Blob, file name and type) | 5 |
| 3.6 | R (each rejection message, no content text, nothing logged) | 5 |
| 3.7 | R (detached canvas, shrunk to 0 × 0) | 5 |
| 4.1 | SP (region after the list, before `Resting`) | 7 |
| 4.2 | `share-card-text.test.ts`; SP (intro, button) | 1, 7 |
| 4.3 | SP (exact `renderShareCard` argument, props spy) | 7 |
| 4.4 | SP (`Making the image…`, `aria-disabled`, same element, `Image ready. …`, `Make the image again`) | 1, 7 |
| 4.5 | SP (`src`, `alt`, `width`, `height`); E2E layout | 7, 9 |
| 4.6 | SC (`sameShareContent`); SP (stale first render, change while shown, `Bury after all`) | 1, 7 |
| 4.7 | SP (rejecting render, button text after an earlier Image) | 1, 7 |
| 4.8 | `share-card-text.test.ts` (no `!`); SP (motion from `helperPanelMotion`) | 1, 7 |
| 4.9 | SP (`Start again` while pending; Unbury of the last Tombstone) | 7 |
| 5.1 | `share-image.test.ts` (`sharePathFor`); SS (button text per row) | 6, 8 |
| 5.2 | `share-image.test.ts` (exact data, `this`); SS (called before `fireEvent.click` returns) | 6, 8 |
| 5.3 | `share-image.test.ts`; SS (`Image shared.`) | 6, 8 |
| 5.4 | `share-image.test.ts` (`AbortError`); SS (nothing, focus kept) | 6, 8 |
| 5.5 | `share-image.test.ts` (`NotAllowedError`, sync throw); SS (fallback download and message) | 6, 8 |
| 5.6 | `download-file.test.ts`; SS (`downloadFile` arguments, `Download started: …`, `SAVE_FAILED`, prop override) | 6, 8 |
| 5.7 | `download-file.test.ts` (one live URL, `click` spy, silent console) | 6 |
| 5.8 | SS (two `Save image` clicks announce twice) | 8 |
| 5.9 | `share-image.test.ts`; SS (one case per row) | 6, 8 |
| 6.1 | ESLint blocks unchanged; checkpoint searches | 1, 2, 5, 6, 10 |
| 6.2 | Console spies in R, SP, SS; E2E storage, cookie and URL check; checkpoint searches | 5, 7, 8, 9, 10 |
| 6.3 | `csp-plugin.ts` and `csp-plugin.test.ts` unchanged; E2E Step 3 CSP check and real download | 6, 9, 10 |
| 6.4 | No new dependency; only `navigator.share` and `downloadFile` as exits | 6, 8, 10 |
| 6.5 | E2E Step 10 request check, at most the Req 6.5 skip; `privacy-guard` hook; core `no-network` scans | 9, 10 |
| 7.1 | SP (Tab order, focus unmoved, focus rescue); SS (focus kept after `AbortError`) | 7, 8 |
| 7.2 | SP (`aria-disabled`, ignored clicks, no `disabled` attribute) | 7 |
| 7.3 | SP (names equal text, `expectUniqueButtonNames`) | 7 |
| 7.4 | P4; SP (alt text) | 4, 7 |
| 7.5 | SP (`RENDER_FAILED` shown and announced); SS (`SHARE_FAILED`, `SAVE_FAILED`, cleared on next action) | 7, 8 |
| 7.6 | E2E layout (four viewports, Preview inside the panel, 44 × 44 targets) | 9 |
| 7.7 | SP (reduced motion through `helperPanelMotion(true)`) | 7 |
| 7.8 | SP (busy and failed states in words: `Making the image…`, failure line) | 7 |
| 9.1 | SC | 1, 3 |
| 9.2 | R | 5 |
| 9.3 | SP | 7 |
| 9.4 | SS; `download-file.test.ts` | 6, 8 |
| 9.5 | SP (props spy, exact `renderShareCard` argument) | 7 |
| 9.6 | `e2e/demo-path.spec.ts` | 9 |
| 9.7 | `e2e/layout.spec.ts` | 9 |
| 9.8 | `privacy-guard` hook, `no-network` scans, ESLint, typecheck, CSP tests, build | 9, 10 |
| 10.1 | `share-card.property.test.ts` generators; default 100 runs | 4 |
| 10.2 | P1 | 4 |
| 10.3 | P2 | 4 |
| 10.4 | P3 | 4 |
| 10.5 | P4 | 4 |
