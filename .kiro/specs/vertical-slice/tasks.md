# Implementation Plan: vertical-slice

Tasks run in dependency order. Paths are relative to `apps/web/` unless they start with `packages/`, `samples/` or a root file name. Each task writes its code and its tests together. Property IDs (P1–P15) refer to "Correctness properties" in `design.md`, and every property test's name starts with its ID (e.g. `"P9: money is exact in en-US"`).

The tasks are grouped into batches. From task 5 on, the whole suite (`npm test` at the repo root, which runs the core and web suites) must be green at the end of every task, not only at the end of each batch. Tasks 1–3 need only the core suite green; task 4 has no web test yet, so it checks the config as its own step says.

Each task is sized for one fresh agent run: at most two or three source files plus their tests. A task never needs a later task to make its own tests pass.

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`, Req 7). No `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource` or `console.*` in non-test files of `apps/web/src`. Nothing derived from a statement goes to storage, cookies or the URL.
- Files in `src/slice/logic/` are pure: no React, no DOM, no storage, no clock, no `Math.random`, no logging (Req 3.1).
- Money is integer minor units (`money.md`). Only `src/slice/logic/money.ts` turns minor units into display text; no other file divides an amount by 100 or calls `toFixed` (Req 6.2).
- `apps/web` imports the Pipeline, the header lists and the empty-input constants only from `@zombills/core`, never from `packages/core/src`, in tests too (Req 9.1).
- Pure-logic and property tests run in Vitest's default `node` environment. Component test files start with `// @vitest-environment jsdom` (design "Design decisions").
- Files are kebab-case, components PascalCase, constants `SCREAMING_SNAKE_CASE`; unit tests go in `*.test.ts(x)` and property tests in `*.property.test.ts` next to the source file (`structure.md`). The existing `src/App.tsx` and `src/main.tsx` keep their names.
- TypeScript strict mode. Any `any` needs a comment explaining why (`tech.md`). No new library beyond the "New dependencies" table in `design.md`.
- `src/spike/*` is not changed (Req 1.5).
- Do not commit.

---

## Batch 1: statement-parser amendment (Requirement 11)

All files in this batch are under `packages/core/src/parse/`. The core suite (`npm test -w @zombills/core`) must stay green, and the merchant-normalizer and subscription-detector suites must be unchanged.

- [x] 1. New header names and the description priority rule (`header-names.ts`, `columns.ts`)
  - In `header-names.ts`, append `"posting date"` to `DATE_HEADERS`, `"paid out"` and `"money out"` to `DEBIT_HEADERS`, and `"paid in"` and `"money in"` to `CREDIT_HEADERS`, after the existing entries, each with the comment `// added by vertical-slice` (design "Core amendment"). Do not add `"transaction date"` again.
  - In `columns.ts`, add `firstByListOrder(header, names)` (index of the header cell whose name comes earliest in `names`, leftmost among equal names) and use it in `autoDetectColumns` for `description` only; every other role keeps `leftmostMatch`.
  - Update the four existing places listed in design "Parser tests changed by R11.7", and no other existing test:
    - `columns.test.ts` "takes the leftmost match for each role": `["Memo","Date","Posted Date","Description","Value","Amount"]` now expects `description: 3`; the title names the description rule.
    - `columns.property.test.ts` P14: the expected `description` index comes from list priority over `entries`; other roles keep `findIndex`.
    - `test-arbitraries.ts` row model: picks the description column by list priority; the "leftmost one wins" comment is narrowed to the other roles.
    - `header-detect.test.ts` "hold exactly the names the requirements list": the pinned lists must include the five new names, in the order of `header-names.ts`.
  - New unit tests in `columns.test.ts`: `Date,Description,Paid out,Paid in` and `Date,Description,Money out,Money in` map as a `DebitCreditLayout`; `Posting Date,Description,Amount` maps `date` to column 0; the Chase row `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #` maps `description` 2, `date` 1, `amount` 3; two cells both named `Description` → the leftmost.
  - _Requirements: 11.1, 11.2, 11.6 (header and Chase cases), 11.7 (code and tests)_

- [x] 2. Exported empty-input constants and header lists (`empty-reasons.ts`, `parse-statement.ts`, `index.ts`)
  - Create `empty-reasons.ts` with `EMPTY_CSV_REASON = "The CSV is empty"` and `NO_CONTENT_ROWS_REASON = "The CSV has no rows with content"` (design "Core amendment"; the file name keeps it apart from `parse-error.ts`).
  - In `parse-statement.ts`, replace the two string literals with these constants.
  - In `parse/index.ts`, export `EMPTY_CSV_REASON`, `NO_CONTENT_ROWS_REASON`, `AMOUNT_HEADERS`, `CREDIT_HEADERS`, `DATE_HEADERS`, `DEBIT_HEADERS`, `DESCRIPTION_HEADERS` and `normalizeHeader`. `CURRENCY_HEADERS` and `isHeaderIn` stay internal.
  - Unit tests in `parse-statement.test.ts`: `""` returns `EMPTY_CSV_REASON` and `"\n,\n"` returns `NO_CONTENT_ROWS_REASON`, compared with `toBe` against the imported constants.
  - Add one test (in the existing core build or barrel test, if there is one; otherwise in `parse-statement.test.ts`) that imports the seven names from the package root `../index.js` and checks they are defined, and that `DATE_HEADERS` contains `"posting date"`.
  - _Requirements: 11.4, 11.5, 11.6 (empty-input case)_

- [x] 3. Update the statement-parser requirements text (`.kiro/specs/statement-parser/requirements.md`)
  - Documentation only; no code and no test.
  - Requirement 2.1: list `"posting date"` among the date names; Requirement 2.4: list `"paid out"`, `"money out"`, `"paid in"` and `"money in"` among the debit and credit names. Mark each addition "(added by vertical-slice)".
  - Requirement 2.2: replace the leftmost-column rule for `description` with the list-priority rule of vertical-slice Requirement 11.7 (earliest name in `DESCRIPTION_HEADERS`, then leftmost among equal names), with the Chase example and the note "(changed by vertical-slice)". The other roles keep the leftmost rule.
  - Change nothing else in that file.
  - _Requirements: 11.3, 11.7 (requirements text)_

> **Batch 1 done:** `npm test -w @zombills/core` green; `npm run build -w @zombills/core` writes a `dist` that exports the new names.

---

## Batch 2: web dependencies, test config and scripts

- [ ] 4. Dependencies, Vitest config and scripts (`package.json`, root `package.json`, `vite.config.ts`, `tsconfig.json`)
  - This is the only task that runs `npm install`. Add to `apps/web/package.json`, pinned exactly as in design "New dependencies": `"@zombills/core": "0.0.0"` in `dependencies`; `vitest` `5.1.0`, `fast-check` `4.10.2`, `jsdom` `31.0.1`, `@testing-library/react` `16.3.3`, `@testing-library/dom` `10.4.2`, `@testing-library/user-event` `14.6.10`, `@playwright/test` `1.65.1` and `@types/node` `24.19.2` in `devDependencies`. Then run `npm install` once from the repo root and keep the updated `package-lock.json`. Do not run `npx playwright install` here (task 23).
  - Web scripts, as in design "Root scripts": `pretest` and `predev` (build `@zombills/core`), `test: "vitest run"`. Leave `typecheck` as it is; task 23 adds the e2e project to it.
  - Root `package.json`: add `pretest` and `pretypecheck`, each `npm run build --workspace @zombills/core` (Req 9.2a). Keep the existing `build` script; the `workspaces` order already builds core first (Req 9.2).
  - In `vite.config.ts`, import `defineConfig` from `vitest/config` and add the `test` block from design "Build pieces" (`include`, `exclude` with `e2e/**`, `environment: "node"`). Do not add `cspPlugin` or the `build` settings yet (task 21).
  - In `tsconfig.json`, add `"ES2023.Intl"` to `lib`.
  - Check: `npm run typecheck` and `npm run build` pass at the root; `npx vitest run --passWithNoTests` in `apps/web` exits 0. The root `npm test` is required green from task 5, which adds the first web test.
  - _Requirements: 9.1 (dependency), 9.2, 9.2a, 10.1_

> **Batch 2 done:** dependencies installed once; root build and typecheck green.

---

## Batch 3: pure logic (`src/slice/logic/`)

Every source file in this batch is pure and tested in the `node` environment. Files under `src/slice/logic/` also follow the purity rule of Req 3.1; task 5 changes `src/index.css`, and task 14 writes the reducer and paint helpers in `src/slice/`. Generators for the property tests go in `src/slice/logic/test-arbitraries.ts`, which only tests import.

- [ ] 5. Focus ring, money class and colour contrast (`src/index.css`, `src/contrast.test.ts`)
  - In `index.css`, add `:focus-visible { outline: 2px solid var(--moss); outline-offset: 2px; }` and the `.money` class (`font-family: var(--font-sans); font-variant-numeric: tabular-nums`) (design "Look and layout"). Change no existing token.
  - Unit test `src/contrast.test.ts`, as in design "Unit tests": starts with `/// <reference types="node" />`, reads `index.css` with `readFileSync(new URL("./index.css", import.meta.url), "utf8")` (not `?raw`), parses `--night`, `--fog` and `--bone`, and asserts `bone` on `night` and `bone` on `fog` are at least 4.5:1 by the WCAG relative-luminance formula. It also asserts the `:focus-visible` and `.money` rules above.
  - This is the first web test: from here on the root `npm test` must be green.
  - _Requirements: 6.5 (class), 8.1 (focus ring), 8.5, 10.1_

- [ ] 6. Money formatter and date display (`money.ts`, `display-date.ts`)
  - Write `formatMoney(minorUnits, currency, locale?)` as in design "Money and dates": `RangeError` unless `Number.isSafeInteger(minorUnits)`; build the exact decimal string `"<units>.<cc>"` with integer arithmetic and pass it to `Intl.NumberFormat(...).format`; 2 fraction digits when the currency's default is below 2 and `minorUnits % 100 !== 0`; `minimumFractionDigits` and `maximumFractionDigits` 2 when the default is above 2.
  - Write `formatDisplayDate(iso)` with a fixed English month table and no `Date` object (non-ISO input returned unchanged), and `CADENCE_LABELS` (`Weekly`, `Monthly`, `Yearly`).
  - Unit tests `money.test.ts`: the six Req 6.7 examples as exact strings (with `\u00a0` where `Intl` puts one); `0`; `-1`; `RangeError` for `1.5`, `NaN`, `Infinity`, `2 ** 53`.
  - Unit tests `display-date.test.ts`: `2026-01-12` → `12 Jan 2026`; `2026-12-01` → `1 Dec 2026`; `2024-02-29`; a non-ISO string returned unchanged; `CADENCE_LABELS` values.
  - Property tests: **P9** and **P10** in `money.property.test.ts`; **P11** in `display-date.property.test.ts`.
  - _Requirements: 5.3 (cadence labels), 5.8, 6.1, 6.3, 6.4, 6.6, 6.7_

- [ ] 7. Currency totals and display order (`totals.ts`, `test-arbitraries.ts`)
  - Write `isCounted`, `currencyTotals` (one Counted subscription at a time, `RangeError` as soon as the running sum is not a safe integer) and `groupForDisplay(subscriptions, currencyOrder)` returning `CurrencyGroup`s with `total` and `hasExcluded`, as in design "Totals and display order".
  - Create `test-arbitraries.ts` with `subscriptionArb` (design "Generators": currencies `USD`, `EUR`, `GBP`, `JPY`; equal merchants and `"Z"`/`"a"` edge cases; unique `id`).
  - Unit tests `totals.test.ts`: two Counted subscriptions of `Number.MAX_SAFE_INTEGER` throw `RangeError`; a guessed-only group has `total: null` and `hasExcluded: true`; an ended subscription is left out of the total; ties on cost broken by merchant, then `id`; `"Z"` before `"a"`.
  - Property tests `totals.property.test.ts`: **P6** (50 runs for the 10,000-element case), **P7**, **P8**.
  - _Requirements: 5.2, 5.7, 5.11, 5.11a, 5.12_

- [ ] 8. Missing-column check (`missing-columns.ts`)
  - Write `ColumnPresence` and `findColumns(columns)` as in design "Missing columns": each column goes through `normalizeHeader` from `@zombills/core` and is matched against the exported header lists; `amount` is true for a signed amount column, or for a debit and a credit column together.
  - Unit tests `missing-columns.test.ts`: `"  DATE "` matches; debit and credit together count as amount, debit alone does not; the new names `Paid out`/`Paid in`, `Money out`/`Money in` and `Posting Date` from task 1.
  - Add `headerRowArb` to `test-arbitraries.ts` (cells from every header list, case and space variants, noise names).
  - Property test `missing-columns.property.test.ts`: **P5**.
  - _Requirements: 3.9, 11.5 (used by the web)_

- [ ] 9. The Analyzer (`analyze-statement.ts`)
  - Write `GENERIC_FAILURE_REASON`, `StatementFacts`, `AnalysisOutcome`, `ResultsOutcome`, `NoSubscriptionsOutcome` and `analyzeStatement(csv)` as in design "Analyzer": steps 1–6 inside one `try`; `"empty"` matched on `EMPTY_CSV_REASON` and `NO_CONTENT_ROWS_REASON`, not literals; `subscriptions` exactly as `detectSubscriptions` returned them; `totals` from `currencyTotals(subscriptions, statement.currencies)`; the `catch` drops the error and logs nothing.
  - Unit tests `analyze-statement.test.ts`, as in design "Unit tests": `""` and `"\n\n"` → `"empty"`; conflicting date formats → `"parse-error"` with the parser's reason; `Foo,Bar\n1,2` → all three missing; `Date,Amount` → description missing; `Date,Description,Debit` → amount missing; only bad rows → `"no-transactions"` with the row count; one non-recurring row → `"no-subscriptions"` with its facts. Each of the four Samples, read with a `?raw` import from `samples/`, → `"results"` with the merchants, `yearlyCostCents` and order that `packages/core/src/detect/samples.test.ts` expects.
  - Unit test `analyze-statement.throw.test.ts` (own file, because `vi.mock` is hoisted): `vi.mock("@zombills/core", …)` keeps the real module through `vi.importActual` and makes `detectSubscriptions` throw; a Sample then gives `{ kind: "parse-error", reason: GENERIC_FAILURE_REASON }`, and the reason contains none of the input.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.9 (wiring), 11.4 (used by the web)_

- [ ] 10. Analyzer property tests (`analyze-statement.property.test.ts`, `test-arbitraries.ts`)
  - Add `dateCellArb`, `amountCellArb` and `csvLikeArb` to `test-arbitraries.ts` as in design "Generators" (`csvLikeArb` has one branch that repeats a merchant monthly, so `"results"` is reached often enough for P3).
  - Property tests: **P1** (the four string sources listed in the design; 300 runs), **P2**, **P3**, **P4**.
  - No source file changes. If a property finds a bug in the Analyzer, fix it in `analyze-statement.ts` and add the shrunk input as a unit test in `analyze-statement.test.ts`.
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 11. Error messages (`messages.ts`)
  - Write `PageError`, `errorFromOutcome`, `ErrorMessage`, `errorMessage`, `isDateShaped`, `isAmountShaped` and `visibleColumnNames` as in design "Messages", with the exact texts of its message table. Names are cut by code points (`Array.from`): longer than 40 becomes 39 code points plus `…`.
  - Unit tests `messages.test.ts`: every row of the message table; missing-column wording for one, two and three roles; `01/02/2026,NETFLIX.COM,-15.49` and the same with `01/02/26` list only `NETFLIX.COM`; a row of only dates and amounts → `No header row was found.`; 11 names → 10 listed; a 60-character name cut to 40; a 40-character name kept whole; an emoji across code units 39–40 cut without a lone surrogate; `errorFromOutcome` maps `"empty"` to `empty-file` and keeps the other three kinds' data.
  - Property tests `messages.property.test.ts`: **P13** and **P14**, using `dateCellArb` and `amountCellArb` from task 10.
  - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.9 (message text), 4.12_

- [ ] 12. Byte decoding and file checks (`decode-bytes.ts`, `file-checks.ts`)
  - Write `decodeStatementBytes(bytes)` as in design "Byte decoding and file checks": `FF FE` → `utf-16le`, `FE FF` → `utf-16be`, else `TextDecoder("utf-8", { fatal: true })`, and on its `TypeError` `TextDecoder("windows-1252")`. It never throws.
  - Write `SIZE_LIMIT_BYTES`, `FileFacts`, `FileCheck`, the generic `checkFiles` (order: count, size, name/type, 0 bytes), `looksLikeCsv` and `containsNul`. Errors use the `PageError` kinds from task 11.
  - Unit tests `decode-bytes.test.ts`: UTF-8 with and without BOM; UTF-16 LE and BE with BOM; `0xA3` → `£`; `0x80` → `€`; invalid continuation bytes; `"\uFEFFa"` as UTF-8 → `"a"`; Windows-1252 `ÿþab` (bytes `FF FE 61 62`) → `"扡"`.
  - Unit tests `file-checks.test.ts` with plain `FileFacts` objects: counts 0, 1 and 2; sizes 1,048,576 accepted and 1,048,577 rejected; `.CSV`, `.csv`, `statement.txt` with `text/csv` (accepted) and with `text/plain`, `statement.csv.exe`; 0 bytes; a 0-byte `notes.txt` reports `not-csv` (check order); `containsNul`.
  - Property test `decode-bytes.property.test.ts`: **P12**.
  - _Requirements: 3.10, 4.3, 4.4, 4.5_

- [ ] 13. Assumed-value notes and live-region text (`assumed-values.ts`, `announce.ts`)
  - Write `assumedValueNotes(facts)` with the sentences of design "Assumed values", in the order currency, date format, sign convention.
  - Write `announcement(view, locale?)` with the texts of design "Live region". It takes the `PageView` type from `../page-state`, which task 14 creates: in this task, declare `PageView` in `page-state.ts` with only the type exactly as in design "Page state" (no reducer yet), so task 14 adds the rest to the same file.
  - Unit tests `assumed-values.test.ts`: each Assumed value alone; all three together in order; no notes when nothing is assumed; every date-format label; both sign-convention sentences.
  - Unit tests `announce.test.ts`: each view's text; `1 recurring charge` and `4 recurring charges`; two currency totals give two total sentences; the expected money text is built with `formatMoney` and the same `locale`.
  - _Requirements: 5.1a, 8.3 (text)_

- [ ] 14. Page reducer and paint helpers (`src/slice/page-state.ts`, `src/slice/frame.ts`)
  - Complete `page-state.ts` with `PageModel`, `PageAction`, `INITIAL_PAGE_MODEL` and the pure `pageReducer`, following the transition table in design "Page state". `finish` uses `errorFromOutcome` for the four error kinds. A replaced view keeps no reference to the previous outcome.
  - Write `nextFrame()` (one `requestAnimationFrame`) and `nextTask()` (one `setTimeout(…, 0)`) in `frame.ts`.
  - Unit tests `page-state.test.ts`: every row of the transition table, including `start` and `reject` ignored while `working`, a stale `finish` and `fail` ignored, and `reset` from `idle` and `working` unchanged.
  - Property test `page-state.property.test.ts`: **P15**.
  - Unit tests `frame.test.ts`: `nextFrame` resolves only after the stubbed `requestAnimationFrame` callback runs, and `nextTask` only after fake timers advance.
  - _Requirements: 2.7 (state), 3.8 (helpers), 4.1, 4.10 (state), 7.5 (state)_

> **Batch 3 done:** every logic module and the reducer tested on its own; P1–P15 pass; suite green.

---

## Batch 4: page state and components (`src/slice/`)

Components are written first and tested through `SlicePage` in tasks 18 and 19, because the design puts their tests in `slice-page.test.tsx`. Tasks 15–17 must pass `npm run typecheck` and `npm run lint`, and the suite must stay green. Colours come only from the theme tokens in `index.css`; no hex values in components (Req 8.5). State and status are always given as text, not by colour alone (Req 8.6). No logos (Req 5.10).

- [ ] 15. Subscription list (`subscription-item.tsx`, `results-view.tsx`)
  - Write `SubscriptionItem` as in design "Result views": `merchant` in a `strong`; `Monthly · <price> · <yearly> a year` from `CADENCE_LABELS` and `formatMoney`; for a guessed cadence `Guessed from a single charge` and `about <yearly> a year (estimate)`; for `status: "ended"`, `Ended · last charged <date>`; a nested `ol` labelled `Price history` only when `priceHistory.length > 1`, oldest first. Every money figure is in a span with class `money`.
  - Write `ResultsView` with the layout of design "Result views": the `h2` "Recurring charges found" with `tabIndex={-1}` and `headingRef`; the summary line with the dates through `formatDisplayDate` and the skipped-row clause (singular and plural); the Assumed-value notes as a `ul`; one `section` per `groupForDisplay` group (computed with `useMemo`) with an `h3` naming the currency, a `ul` of items, `Yearly total (<code>): <money>` when `total` is not null, and the not-included note when `hasExcluded`; a Start again button whose handler comes from props.
  - _Requirements: 5.1, 5.1a (results), 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 5.10, 6.5_

- [ ] 16. Other state views and the fade (`no-subscriptions-view.tsx`, `error-view.tsx`, `fade-in.tsx`)
  - Write `NoSubscriptionsView` (the `h2` "No recurring charges found", the sentence with transaction count and dates, which leaves out the date clause when `firstDate` is null, the Assumed-value notes, Start again) and `ErrorView` (the `h2` with `summary`, `File: <name>` when not null, the `detail` paragraph when present, Start again), both with `tabIndex={-1}` headings on `headingRef`. `ErrorView` may use `role="alert"`.
  - Write `fadeInMotion(reduced)` and `FadeIn` as in design "Result views" and "Design decisions": opacity only, 150 ms, duration 0 when `useReducedMotion()` is true.
  - Unit test `fade-in.test.tsx` (jsdom, own file because of the partial `vi.mock("framer-motion")` via `vi.importActual`): `fadeInMotion(true)` and `fadeInMotion(false)` set only `opacity` in `initial` and `animate`, with durations 0 and 0.15; `FadeIn` with `useReducedMotion` mocked to `true` renders its children.
  - _Requirements: 4.6 (view), 4.7, 5.1a (no-subscriptions), 8.7_

- [ ] 17. Statement inputs (`samples.ts`, `drop-zone.tsx`, `sample-buttons.tsx`)
  - Write `Sample` and `SAMPLES` with the four `?raw` imports from `../../../../samples/` and the labels in design "Samples".
  - Write `DropZone` (with `forwardRef` and a `focus()` handle) exactly as in design "Drop zone": `role="button"`, `tabIndex={0}`, the `aria-label`, `aria-disabled`, Enter on `keydown` and Space on `keyup` call `input.click()`; texts `Drop a CSV statement here`, `Release to read this file` and `Reading…`; a depth counter for `dragenter`/`dragleave`; `drop` calls `preventDefault()` and `stopPropagation()` and passes files only when not disabled; the `Choose a file` button; the hidden labelled input with `accept=".csv,text/csv"` and `tabIndex={-1}` whose `change` resets `value`.
  - Write `SampleButtons`: native buttons in a `ul` under the heading "Or try a sample statement", disabled while working.
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.7 (controls), 2.8, 8.2, 8.6 (drag-over text)_

- [ ] 18. The Page and its main component tests (`slice-page.tsx`, `slice-page.test.tsx`)
  - Write `SlicePage` as in design "Analysis run" and "Look and layout": `useReducer(pageReducer, INITIAL_PAGE_MODEL)`; a `useRef` run counter; `runAnalysis(source)` that dispatches `start`, then for a file reads `file.arrayBuffer()` in `try`/`catch` (`fail` with `unreadable-file`), decodes, and dispatches `fail` with `not-csv` when `containsNul`; then `await nextFrame()`, `await nextTask()`, `analyzeStatement(text)` and `finish`. The text and bytes stay local to the call, never in state.
  - `onFiles` runs `checkFiles`: an empty list does nothing, a rejection dispatches `reject`, a pass calls `runAnalysis`.
  - The window `dragover`/`drop` guard in a `useEffect`; focus on the state heading on entering `results`, `no-subscriptions` or `error`, and on the drop area after Start again only (`focusDropZoneRef` flag); the always-mounted `<p role="status" className="sr-only">` with `announcement(view)`; the `main` with `max-w-[640px] mx-auto px-4`, the `h1` "Zombills" with `font-display`, the privacy and history sentence, the visible `Reading <name>…` text, each state's content in `FadeIn`, and the footer link `<a href="#spike">See the burial art spike</a>`.
  - Temporarily render `SlicePage` from `App.tsx` so the page is reachable; task 20 adds routing.
  - Component tests `slice-page.test.tsx` (jsdom, `render(<App />)`, helpers as in design "Component tests"), for these rows of the design table: Idle; Working (held `requestAnimationFrame`); Results from a Sample; No subscriptions; Start again; Replace result; Keyboard; Drag-over text; Drop outside.
  - _Requirements: 2.4, 2.6, 2.7, 3.8, 4.1, 4.2, 4.7, 4.8, 4.10, 4.11, 5.1, 5.2, 5.3, 5.4, 5.7, 5.9, 6.5, 7.5, 8.1, 8.2, 8.3, 8.4, 8.6, 8.8, 10.3 (main states)_

- [ ] 19. Component tests for errors and edge cases (`slice-page.test.tsx`)
  - Add the remaining rows of design "Component tests" to the same file: Skipped rows; Error: two files (no `arrayBuffer` call); Error: too large; Error: not CSV (picked with `userEvent.setup({ applyAccept: false })`, dropped, and a `.csv` containing U+0000); Error: empty; Error: columns missing; Error: headerless (`NETFLIX.COM` listed, neither `01/02/2026` nor `-15.49` shown); Error: unreadable; Windows-1252 file (asserting the Sample has no other non-ASCII character); Guessed-only group; Assumed value; Ended.
  - Each error case also checks focus on the error heading and the live-region or alert text.
  - No source change is expected. If a test finds a bug, fix it in the smallest file that owns the behaviour.
  - _Requirements: 3.10, 4.3, 4.4, 4.5, 4.6, 4.9, 4.12, 5.1, 5.1a, 5.5, 5.6, 5.7, 8.4, 10.3 (error and edge cases)_

> **Batch 4 done:** the Page works at the site root from file to result; suite green.

---

## Batch 5: routing and the spike link

- [ ] 20. Hash route and spike view (`src/routing/use-hash-route.ts`, `src/routing/spike-view.tsx`, `src/App.tsx`)
  - Write `Route`, `routeFromHash` (exact `"#spike"` → `"spike"`, anything else → `"page"`) and `useHashRoute` (reads `location.hash` on mount and on `hashchange`; removes the listener on unmount), as in design "Routing".
  - Write `SpikeView`: `<a href="#">Back to Zombills</a>` and `BurialSpike` from `src/spike`, unchanged.
  - `App` renders `SpikeView` for `"spike"` and `SlicePage` otherwise. `main.tsx` keeps rendering `App`.
  - Unit tests `src/routing/use-hash-route.test.ts`: `""`, `"#"`, `"#spike"`, `"#SPIKE"` (→ page) and `"#other"`.
  - Component tests `src/app.test.tsx` (jsdom): setting `location.hash = "#spike"` and firing `hashchange` shows the Spike with its back link; clearing the hash shows the Page; the `window` object is the same throughout (no reload).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.4_

> **Batch 5 done:** `#spike` shows the art spike, anything else the Page; suite green.

---

## Batch 6: static build for Netlify

- [ ] 21. CSP plugin, build settings, Netlify config and favicon (`csp-plugin.ts`, `vite.config.ts`, `netlify.toml`, `index.html`)
  - Write `csp-plugin.ts` as in design "Build pieces": `CSP_POLICY` with the exact Req 7.6 text; `injectCsp(html)` that inserts `<meta http-equiv="Content-Security-Policy" content="…">` straight after `<meta charset>` and throws when there is none; `cspPlugin()` with `name: "zombills-csp"`, `apply: "build"` and `transformIndexHtml: { order: "post", handler: injectCsp }`.
  - In `vite.config.ts`, add `cspPlugin()` to `plugins` and `build: { assetsInlineLimit: 0, modulePreload: { polyfill: false } }`; keep the `test` block from task 4.
  - Create the root `netlify.toml` with `[build]` `command = "npm run build"`, `publish = "apps/web/dist"` and `[build.environment]` `NODE_VERSION = "24"`, and nothing else.
  - In `index.html`, set the title to `Zombills` and add `<link rel="icon" href="data:,">` below `<meta charset>`. Do not add a CSP tag to this file.
  - In `tsconfig.json`, add `csp-plugin.ts`, `csp-plugin.test.ts`, `vite-config.test.ts` and `netlify-config.test.ts` to `include`; `e2e` stays out.
  - Unit tests: `csp-plugin.test.ts` (on Vite-shaped HTML the tag sits right after `<meta charset>` and before every `<script>` and `<link>`; `content` equals `CSP_POLICY`; HTML without a charset meta throws; `cspPlugin().apply === "build"`); `vite-config.test.ts` (`assetsInlineLimit === 0`, `modulePreload.polyfill === false`); `netlify-config.test.ts` (reads `../../netlify.toml` with `node:fs`; the `[build]` keys; no `[[redirects]]`, `[functions]`, `[[edge_functions]]` or `[[headers]]`).
  - Check: `npm run build` at the root builds core, then web, and `apps/web/dist/index.html` has the CSP tag before its first `<script>`; `npm run dev -w @zombills/web` still serves the page without the tag.
  - _Requirements: 7.1 (favicon), 7.6, 7.7, 9.2, 9.3, 9.4 (build settings), 9.5_

> **Batch 6 done:** the root build writes a locked-down static `apps/web/dist`; suite green.

---

## Batch 7: lint rules

- [ ] 22. Web privacy, money and purity lint blocks (`eslint.config.js`)
  - In the root `eslint.config.js`, after the `packages/core` block, add the three blocks of design "Lint block": privacy, money and import rules for `apps/web/src/**/*.{ts,tsx}` (test files ignored), with `WEB_NETWORK_GLOBALS`, `WEB_NETWORK_PROPERTIES`, `no-console`, the `**/packages/core/**` import ban, and the `toFixed` and `/ 100` selectors; the purity block for `apps/web/src/slice/logic/**/*.ts`, which repeats `WEB_NETWORK_PROPERTIES` because flat config replaces rule options; and the `money.ts` exception. Add `MONEY_MESSAGE` and `PURITY_MESSAGE` with the design's texts. Change nothing in the existing core blocks.
  - The web `lint` script stays `eslint src`.
  - Check by hand, then revert: a `fetch("x")` in a component, `window.fetch`, `navigator.sendBeacon`, `console.log`, `amount / 100` and `x.toFixed(2)` outside `money.ts`, `Date.now()` in `logic/`, and an import from `../../../packages/core/src` each make `npm run lint` fail. Leave no such line behind.
  - Fix any lint error the new rules find in files from earlier tasks.
  - _Requirements: 3.1 (lint), 6.2, 7.4, 9.1 (lint)_

> **Batch 7 done:** `npm run lint` green with the new blocks.

---

## Batch 8: browser smoke test

- [ ] 23. The Playwright demo-path test (`playwright.config.ts`, `tsconfig.e2e.json`, `e2e/demo-path.spec.ts`)
  - Write `playwright.config.ts` as in design "E2E test": `testDir: "e2e"`, one `chromium` project, `baseURL` `http://localhost:4173`, `locale: "en-US"`, `timezoneId: "UTC"`, and `webServer` running `npx vite preview --port 4173 --strictPort` with `reuseExistingServer: false`.
  - Write `tsconfig.e2e.json` covering `e2e/**` and `playwright.config.ts` with `types: ["node"]`.
  - Web scripts: add `test:e2e` (`npm run build --workspace @zombills/core && npm run build && playwright test`) and change `typecheck` to check both `tsconfig.json` and `tsconfig.e2e.json`. The root `npm test` must not run Playwright.
  - Write `e2e/demo-path.spec.ts` with steps 1–8 of design "E2E test": console and `pageerror` collection; recording requests after `load`; the CSP tag in the navigation response before the first `<script`; choosing "US bank, signed amounts"; the USD order Adobe Creative Cloud, Riverside Gym Membership, Netflix, Spotify and `Yearly total (USD): $1,355.64`; Start again with focus on the drop area, empty `localStorage`, `sessionStorage` and cookies, and an unchanged URL; every request same-origin `GET` with no query, no body and a path that names a file inside `apps/web/dist`; an empty console array; and only `html`, `js`, `css`, `woff`, `woff2`, `svg` and `png` files in `dist`.
  - Add one line to `README.md` saying that `npx playwright install chromium` is needed once per machine before `npm run test:e2e --workspace @zombills/web`. Run that install once here; it is a developer-machine download, not a site request.
  - Check: `npm run test:e2e --workspace @zombills/web` passes, and `npm run typecheck` passes at the root.
  - _Requirements: 7.1, 7.2, 7.3, 7.6 (built page), 9.4, 9.5, 10.5, 10.6_

> **Batch 8 done:** the E2E test passes against the built site.

---

- [ ] 24. Checkpoint: run everything and check traceability
  - On a clean core build (delete only `packages/core/dist`, which the build recreates), run from the repo root `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. All must pass with no skipped or `.only` tests. This proves the root `pretest` and `pretypecheck` scripts (Req 9.2a). Then run `npm run test:e2e --workspace @zombills/web`.
  - Check that the root `npm test` runs the core and web Vitest suites and not Playwright (Req 10.6), and that the core suites are unchanged except the four places listed in task 1.
  - Check that every property P1–P15 has a passing test whose name starts with its ID.
  - Check by search, outside test files of `apps/web/src`: no `console.`, `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie` or `toFixed`; no `/ 100` outside `logic/money.ts`; no import path containing `packages/core`; no `<img` in `src/slice`; no hex colour in `src/slice`. Check that `git diff --stat apps/web/src/spike` is empty (Req 1.5).
  - Check that `apps/web/dist` contains no `test-arbitraries` code and no `http://` or `https://` URL to another host in its HTML, JS or CSS (Req 7.2).
  - Check that every acceptance criterion in `requirements.md` (1.1–1.5, 2.1–2.8, 3.1–3.10, 4.1–4.12, 5.1, 5.1a, 5.2–5.11, 5.11a, 5.12, 6.1–6.7, 7.1–7.7, 8.1–8.8, 9.1, 9.2, 9.2a, 9.3–9.5, 10.1–10.6, 11.1–11.7) appears in at least one task's `_Requirements_` line above, and that each row of the traceability table below names a test or check that exists and passes. Fix the table if a test name or file differs.
  - Do not commit. Stop and report results. Do not start the column-mapping, classifier or haunted-UI work.
  - _Requirements: all (traceability)_

---

## Property → task map

| Property | Task |
| --- | --- |
| P1 Analyzer never throws | 10 |
| P2 Analyzer deterministic | 10 |
| P3 subscriptions passed through | 10 |
| P4 kind matches the parser | 10 |
| P5 found columns agree with the parser | 8 |
| P6 totals | 7 |
| P7 grouping is complete | 7 |
| P8 display order | 7 |
| P9 money exact in en-US | 6 |
| P10 money keeps minor units | 6 |
| P11 dates | 6 |
| P12 decoding round-trips | 12 |
| P13 error text leaks no cells | 11 |
| P14 cell shapes | 11 |
| P15 reducer | 14 |

## Traceability: acceptance criterion → test

`SP: <row>` is a row of design "Component tests" in `src/slice/slice-page.test.tsx`. `E2E step n` is a step of `e2e/demo-path.spec.ts`. Test files without a path are under `apps/web/src/slice/logic/`.

| Criterion | Test or check | Task |
| --- | --- | --- |
| 1.1 | `routing/use-hash-route.test.ts`; `app.test.tsx` | 20 |
| 1.2 | `routing/use-hash-route.test.ts`; `app.test.tsx` | 20 |
| 1.3 | `app.test.tsx` (hash set and cleared, same `window`) | 20 |
| 1.4 | `app.test.tsx` (back link); SP: Idle (spike link) | 18, 20 |
| 1.5 | `app.test.tsx`; `netlify-config.test.ts` (no redirects); checkpoint `git diff` of `src/spike` | 20, 21, 24 |
| 2.1 | SP: Idle (drop area, button, `accept`) | 18 |
| 2.2 | SP: Idle (four labelled Sample buttons) | 18 |
| 2.3 | `analyze-statement.test.ts` (`?raw` Samples); E2E step 7 | 9, 23 |
| 2.4 | SP: Working | 18 |
| 2.5 | SP: Drag-over text | 18 |
| 2.6 | SP: Drop outside | 18 |
| 2.7 | `page-state.test.ts`; P15; SP: Working | 14, 18 |
| 2.8 | SP: Keyboard | 18 |
| 3.1 | Purity lint block; `analyze-statement.test.ts` runs in `node` | 9, 22 |
| 3.2 | `analyze-statement.test.ts`; P1; P4 | 9, 10 |
| 3.3 | `analyze-statement.throw.test.ts`; P1 | 9, 10 |
| 3.4 | P3 | 10 |
| 3.5 | P1 | 10 |
| 3.6 | P2 | 10 |
| 3.7 | `analyze-statement.test.ts` (each Sample) | 9 |
| 3.8 | `frame.test.ts`; SP: Working | 14, 18 |
| 3.9 | `missing-columns.test.ts`; P5; `analyze-statement.test.ts` | 8, 9 |
| 3.10 | `decode-bytes.test.ts`; P12; SP: Windows-1252 file | 12, 19 |
| 4.1 | `page-state.test.ts`; P15; SP: Idle | 14, 18 |
| 4.2 | SP: Working | 18 |
| 4.3 | `file-checks.test.ts`; `messages.test.ts`; SP: Error: two files | 11, 12, 19 |
| 4.4 | `file-checks.test.ts`; SP: Error: too large | 12, 19 |
| 4.5 | `file-checks.test.ts`; SP: Error: not CSV; SP: Error: empty | 12, 19 |
| 4.6 | `messages.test.ts`; SP: Error: columns missing; SP: Error: headerless | 11, 19 |
| 4.7 | SP: No subscriptions | 18 |
| 4.8 | SP: Results from a Sample | 18 |
| 4.9 | `messages.test.ts`; SP: Error: unreadable | 11, 19 |
| 4.10 | `page-state.test.ts`; SP: Start again | 14, 18 |
| 4.11 | SP: Replace result | 18 |
| 4.12 | `messages.test.ts`; P13; P14; SP: Error: headerless | 11, 19 |
| 5.1 | SP: Results from a Sample; SP: Skipped rows | 18, 19 |
| 5.1a | `assumed-values.test.ts`; SP: Assumed value | 13, 19 |
| 5.2 | `totals.test.ts`; P8; SP: Results from a Sample (order) | 7, 18 |
| 5.3 | `display-date.test.ts` (`CADENCE_LABELS`); SP: Results from a Sample (Spotify item) | 6, 18 |
| 5.4 | SP: Results from a Sample (Netflix price history) | 18 |
| 5.5 | SP: Ended | 19 |
| 5.6 | SP: Guessed-only group | 19 |
| 5.7 | `totals.test.ts`; P6; P8; SP: Results from a Sample; SP: Guessed-only group | 7, 18, 19 |
| 5.8 | `display-date.test.ts`; P11 | 6 |
| 5.9 | SP: Results from a Sample (`ul`/`li`, currency heading) | 18 |
| 5.10 | Checkpoint search: no `<img` in `src/slice` | 24 |
| 5.11 | P6 | 7 |
| 5.11a | `totals.test.ts` (two `Number.MAX_SAFE_INTEGER`) | 7 |
| 5.12 | P7 | 7 |
| 6.1 | `money.test.ts`; P9 | 6 |
| 6.2 | Web lint block (`toFixed`, `/ 100`); checkpoint search | 22, 24 |
| 6.3 | `money.test.ts`; P10 | 6 |
| 6.4 | `money.test.ts`; P10 | 6 |
| 6.5 | `contrast.test.ts` (`.money` rule); SP: Results from a Sample (`money` class) | 5, 18 |
| 6.6 | P9 | 6 |
| 6.7 | `money.test.ts` (six examples) | 6 |
| 7.1 | E2E step 7 | 23 |
| 7.2 | E2E step 7; checkpoint search of `dist` for other hosts | 23, 24 |
| 7.3 | E2E step 6 | 23 |
| 7.4 | Web lint block; checkpoint search | 22, 24 |
| 7.5 | `page-state.test.ts`; P15; SP: Start again | 14, 18 |
| 7.6 | `csp-plugin.test.ts`; E2E step 3 | 21, 23 |
| 7.7 | `vite-config.test.ts` | 21 |
| 8.1 | `contrast.test.ts` (focus rule); SP: Keyboard | 5, 18 |
| 8.2 | SP: Idle (accessible names) | 18 |
| 8.3 | `announce.test.ts`; SP: Results from a Sample (live region) | 13, 18 |
| 8.4 | SP: Results from a Sample; SP error cases (focus on heading) | 18, 19 |
| 8.5 | `contrast.test.ts`; checkpoint search for hex colours | 5, 24 |
| 8.6 | SP: Drag-over text; SP: Ended; SP: Guessed-only group | 18, 19 |
| 8.7 | `fade-in.test.tsx` | 16 |
| 8.8 | SP: Idle (`h1` `font-display`, `max-w-[640px]`) | 18 |
| 9.1 | Web lint import ban; checkpoint search | 4, 22, 24 |
| 9.2 | Checkpoint `npm run build` | 21, 24 |
| 9.2a | Checkpoint on a clean core build | 4, 24 |
| 9.3 | `netlify-config.test.ts` | 21 |
| 9.4 | E2E step 8 | 23 |
| 9.5 | E2E (served by `vite preview` from `dist`); `app.test.tsx` (`#spike`) | 20, 23 |
| 10.1 | Checkpoint: web `test` script runs node and jsdom files, excludes `e2e/` | 4, 24 |
| 10.2 | The unit and property files of tasks 5–14 | 5–14 |
| 10.3 | `slice-page.test.tsx` | 18, 19 |
| 10.4 | `app.test.tsx` | 20 |
| 10.5 | `e2e/demo-path.spec.ts` | 23 |
| 10.6 | Checkpoint: root `npm test` runs no Playwright | 23, 24 |
| 11.1 | `packages/core/src/parse/columns.test.ts` (`Posting Date`) | 1 |
| 11.2 | `columns.test.ts` (`Paid out`/`Paid in`, `Money out`/`Money in`) | 1 |
| 11.3 | Review of `.kiro/specs/statement-parser/requirements.md` (no test) | 3 |
| 11.4 | `packages/core/src/parse/parse-statement.test.ts` | 2 |
| 11.5 | Package-root export test; `missing-columns.test.ts` imports from `@zombills/core` | 2, 8 |
| 11.6 | `columns.test.ts`; `parse-statement.test.ts` | 1, 2 |
| 11.7 | `columns.test.ts` (Chase row, amended leftmost test); `columns.property.test.ts` P14 | 1, 3 |
