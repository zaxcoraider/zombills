# Review: vertical-slice design (review 1)

Reviewer: Kiro custom agent `spec-reviewer` (Opus 5.5), 2026-11-15. Findings copied verbatim below; resolution table appended after fixes.

I found eight major and nine minor problems in the design, and no blockers. The plumbing you asked about holds up against the installed packages: the CSP plugin and build settings, sample bundling, the TextDecoder fallback, resolving `@zombills/core` from `dist`, the root scripts and the Playwright server. The defects are in the parser amendment's test impact, three property tests that are false as written, one test that cannot run as designed, and one leak in the error message.

## Findings

1. **Severity: major**
   - **Where:** "Core amendment (Requirement 11)"; R11.6, R11.7. Tests at `packages/core/src/parse/columns.test.ts:74-83`, `packages/core/src/parse/columns.property.test.ts:93` and `packages/core/src/parse/test-arbitraries.ts:808-822`.
   - **Problem:** The design says existing tests stay unchanged "except any that asserted leftmost choice" but names none. At least three existing tests assume the leftmost description column wins between different names, so they will fail under the new priority rule.
   - **Failing example:** `autoDetectColumns(["Memo","Date","Posted Date","Description","Value","Amount"])` is expected to give `description: 0`. With the new rule it gives 3, because `"description"` comes before `"memo"` in the list. The column-resolution property test (P14, `columns.property.test.ts:93`) builds its expected value with `entries.findIndex(...)`. When it generates `Memo` plus a later duplicate `Description`, the expected value is wrong. The `parse-statement` arbitrary adds "later duplicates of real columns (the leftmost one wins)", so the row model reads the wrong description column.
   - **Suggested fix:** In the design and tasks, list these three places as tests that R11.7 lets you change. Change the first case's expectation to `description: 3`. Make the description role in both models use list priority (lowest index in `DESCRIPTION_HEADERS`, then leftmost) instead of `findIndex`. Leave the other roles alone.

2. **Severity: major**
   - **Where:** "Messages", `isDateShaped`; R4.12, R4.6.
   - **Problem:** The regexes require a 4-digit year in the four non-ISO formats. The parser accepts 2-digit years there (statement-parser glossary "DateFormat", R3.11). Such cells are not treated as date-shaped, and because they contain `/` they are not amount-shaped either. They end up in the error message.
   - **Failing example:** A headerless file `01/02/26,NETFLIX.COM,-15.49` gives the message "Columns found: 01/02/26, NETFLIX.COM." This shows a transaction date, which R4.12 forbids.
   - **Suggested fix:** Use `\d{2}(?:\d{2})?` for the year in `dd/mm/yyyy`, `dd.mm.yyyy` and `dd-mm-yyyy`. Make `dateCellArb` generate 2-digit years so P14 covers this.

3. **Severity: major**
   - **Where:** Unit tests table, `src/contrast.test.ts` ("Reads `index.css` through `?raw`"); R8.5.
   - **Problem:** In Vitest, `vitest:css-disable` (`node_modules/vitest/dist/chunks/index.Di8au7q4.js:2366-2374`) matches any id against `\.css(?:$|\?)`. With the default `css: false` it returns `{ code: "" }`, and that includes `index.css?raw`.
   - **Failing example:** `import css from "./index.css?raw"` under Vitest gives no default export. The hex parse finds nothing and the test fails, or asserts nothing.
   - **Suggested fix:** Read the file with `readFileSync(new URL("./index.css", import.meta.url), "utf8")`. That needs `"node"` in the types used for test files, but `apps/web/tsconfig.json` has `types: ["vite/client"]`, so add a test tsconfig or a `/// <reference types="node" />` in that file. Alternatively set `test.css: { include: [/index\.css/] }`, but `fs` is simpler.

4. **Severity: major**
   - **Where:** Correctness properties, P12; R3.10.
   - **Problem:** In fast-check 4, `fc.string()` defaults to `unit: "grapheme-ascii"` (`fast-check.d.ts:3049`), so the "well-formed UTF-16" UTF-8 and UTF-16 round-trips only ever test ASCII. Once the generator is widened, two clauses become false:
     - A UTF-8 string that starts with U+FEFF loses it, because `TextDecoder` strips the BOM.
     - A Windows-1252 string that starts with `ÿþ` or `þÿ` gives bytes `FF FE` or `FE FF`. R3.10 says to decode those as UTF-16, not Windows-1252.
   - **Failing example:** `"\uFEFFa"` UTF-8 encoded decodes to `"a"`. `"ÿþab"` as Windows-1252 bytes `FF FE 61 62` decodes as UTF-16LE to `"扡"`.
   - **Suggested fix:** Use `fc.string({ unit: "binary" })` for the Unicode clauses. Exclude a leading U+FEFF in the UTF-8 clause, or expect it to be stripped. Exclude strings starting with `ÿþ` or `þÿ` from the Windows-1252 clause, and add a unit test that pins the R3.10 behaviour for them.

5. **Severity: major**
   - **Where:** P13; R4.6, R4.12.
   - **Problem:** "The `errorMessage` contains none of the date- or amount-shaped inputs as a substring" is false. Short amount-shaped inputs can legitimately appear inside header names or the fixed text.
   - **Failing example:** `columns = ["Col 1", "1"]`. `"1"` is amount-shaped and is correctly dropped, but the message "Columns found: Col 1." contains `"1"`.
   - **Suggested fix:** Split `detail` on `", "` after the prefix and assert that no listed item equals, or is a 40-character cut of, a date- or amount-shaped input.

6. **Severity: major**
   - **Where:** Component tests "Error: not CSV" with picks via `userEvent.upload`; R4.5, R10.3.
   - **Problem:** In user-event 14, `applyAccept` defaults to `true`. `upload` drops files that don't match `accept=".csv,text/csv"`, so no `change` event fires.
   - **Failing example:** `userEvent.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }))` leaves the page idle, and the "not a CSV" assertion fails.
   - **Suggested fix:** Use `userEvent.setup({ applyAccept: false })` for pick tests, or state that the non-CSV case is tested by drop only.

7. **Severity: major**
   - **Where:** `analyze-statement.test.ts`, "a thrown Pipeline error (via `vi.mock("@zombills/core", …)`)"; R3.3.
   - **Problem:** `vi.mock` is hoisted and applies to the whole file, so every other case in that file (each Sample's results, every outcome kind) would run against the mocked module.
   - **Failing example:** Mocking `detectSubscriptions` to throw makes the `us-signed.csv` case return `"parse-error"`.
   - **Suggested fix:** Put the throw case in its own file (`analyze-statement.throw.test.ts`). Or use a partial mock (`vi.importActual`) with a per-test `vi.mocked(...).mockImplementationOnce(() => { throw … })`.

8. **Severity: major**
   - **Where:** Testing strategy, coverage of R7.3, R9.4, R6.2 and R9.1.
   - **Problem:** These criteria have no test and no lint rule:
     - R7.3: nothing checks that storage, cookies and the URL are untouched.
     - R9.4: the E2E test "relies on" `dist` holding only static files, but nothing asserts it.
     - R6.2: the design says lint does not enforce it and leaves it to code review.
     - R9.1: nothing stops an import from `packages/core/src`.
   - **Failing example:** A later change that writes `localStorage.setItem("last", csv)` passes every listed test.
   - **Suggested fix:**
     - E2E: after Start again, assert `localStorage.length === 0`, `sessionStorage.length === 0`, `document.cookie === ""`, the URL unchanged, and `context.cookies()` empty. Also walk `apps/web/dist` and assert every extension is in `{html, js, css, woff, woff2, svg, png}`.
     - Lint, in the `apps/web/src/**` block: `no-restricted-imports` with the pattern `**/packages/core/**`. Add `no-restricted-syntax` for `CallExpression[callee.property.name='toFixed']` and `BinaryExpression[operator='/'][right.value=100]`, and turn both off for `logic/money.ts`.

9. **Severity: minor**
   - **Where:** "Messages" (`visibleColumnNames`), P13; R4.6.
   - **Problem:** R4.6 says "each cut to 40 characters". The design appends `…`, which makes 41, and P13 asserts 41. Cutting by UTF-16 code units can also split a surrogate pair.
   - **Failing example:** A 60-character name is shown as 41 characters. A name with an emoji at code units 39 and 40 shows a lone surrogate.
   - **Suggested fix:** Either change R4.6 to "40 characters plus …", or cut to 39 plus `…`. Cut on code points (`Array.from(name).slice(0, n)`).

10. **Severity: minor**
    - **Where:** Uncovered criteria.
    - **Problem:** No test or property is named for these criteria:
      - R2.1: the `accept=".csv,text/csv"` attribute.
      - R5.1: the skipped-rows count when it is above 0. All four Samples presumably have no row errors.
      - R5.3: per-item "Monthly" and yearly-cost text is not asserted.
      - R6.5: the `.money` class and tabular figures.
      - R7.7: no direct test of the build settings.
      - R8.1: the `--moss` 2px focus ring.
      - R8.7: reduced motion.
      - R8.8: layout and fonts.
      - R9.3: `netlify.toml` contents.
      - R11.3: the documentation update is a task, not a test. That is fine, but it needs a task.
    - **Failing example:** Removing `accept` from the input passes every listed test.
    - **Suggested fix:** Add assertions to the Idle and Results component tests: the `accept` attribute, `"Monthly"`, the yearly-cost text, and the `money` class on money spans. Add a results case from a CSV with one bad row ("1 row skipped…"). Add a `FadeIn` test with `useReducedMotion` mocked `true` that checks only `opacity` is animated. Add a small test that parses `netlify.toml`. Add a `vite.config` test asserting `build.assetsInlineLimit === 0` and `modulePreload.polyfill === false`.

11. **Severity: minor**
    - **Where:** E2E step 7; R7.1, R10.5.
    - **Problem:** `index.html` has no icon link. If Chromium requests `/favicon.ico`, `vite preview` serves its SPA fallback, and the "path is a file in `dist`" assertion fails intermittently depending on whether the request is reported after `load`.
    - **Failing example:** A recorded `GET /favicon.ico` fails the test.
    - **Suggested fix:** Add `<link rel="icon" href="data:,">` to `index.html` (`img-src 'self' data:` allows it), or ship a real favicon file in `public/`.

12. **Severity: minor**
    - **Where:** Root scripts; R9.2a.
    - **Problem:** Only the root `npm test` and `npm run typecheck` build core first. Running `npm test -w @zombills/web` or `npm run dev` on a clean or stale checkout resolves a missing or outdated `packages/core/dist`.
    - **Failing example:** Edit `header-names.ts`, then run `npm test -w @zombills/web`. The new header names are missing from `dist`.
    - **Suggested fix:** Add a `pretest` (and `predev`) to `@zombills/web` that runs `npm run build --workspace @zombills/core`, or say in the README that the root scripts are the supported entry points.

13. **Severity: minor**
    - **Where:** R3.1 and the lint block.
    - **Problem:** The Analyzer must not touch the DOM, storage or the clock, but the web lint block only bans network APIs and `console`. Nothing enforces purity for `src/slice/logic/**`.
    - **Failing example:** `Date.now()` added to `analyze-statement.ts` passes lint and tests.
    - **Suggested fix:** Add a block for `apps/web/src/slice/logic/**` (not test files) that reuses `RESTRICTED_GLOBALS` and bans `Date.now`, `performance.now`, `Math.random`, `sessionStorage`, `indexedDB` and `caches`.

14. **Severity: minor**
    - **Where:** `checkFiles(files: readonly File[])` and `FileFacts`.
    - **Problem:** The design says `FileFacts` exists "so tests can pass plain objects", but `checkFiles` takes `File[]` and returns `{ ok: true; file: File }`.
    - **Failing example:** `checkFiles([{ name: "a.csv", type: "", size: 0 }])` is a type error.
    - **Suggested fix:** Make it generic, `checkFiles<F extends FileFacts>(files: readonly F[]): FileCheck<F>`.

15. **Severity: minor**
    - **Where:** P1.
    - **Problem:** P1 lists "strings with U+0000 and lone surrogates" but names no generator for them. `fc.string({ unit: "binary" })` excludes half surrogates (`fast-check.d.ts:3045`).
    - **Failing example:** No generated input contains `"\uD800"`.
    - **Suggested fix:** Add `fc.string({ unit: fc.constantFrom("\uD800", "\uDFFF", "\u0000", "a", ",") })` to the P1 mix.

16. **Severity: minor**
    - **Where:** Component test "Guessed-only group".
    - **Problem:** It depends on the parser's statement-currency rule (statement-parser R10.8). If the USD rows leave the currency cell empty and the EUR row is the only non-empty valid cell, the statement currency becomes EUR, so the empty USD rows turn EUR and the test's premise is gone.
    - **Failing example:** `Date,Description,Amount,Currency` with the USD rows' currency cells left empty puts everything in EUR.
    - **Suggested fix:** State that every row has an explicit `USD` or `EUR` cell.

17. **Severity: minor**
    - **Where:** Lint block; R7.4.
    - **Problem:** The block covers `apps/web/src/**` only. `apps/web/csp-plugin.ts` and `vite.config.ts` are not linted by `eslint src`. They are build-time code, so this is harmless, but no rule says so.
    - **Failing example:** None at runtime.
    - **Suggested fix:** Add one sentence to the design saying build-time files outside `src` are out of the privacy lint's scope on purpose.

## Checked against the installed code, no finding
- **CSP plugin:** Vite 8.3.8 still has `build.modulePreload.polyfill` and `assetsInlineLimit` (`vite/dist/node/index.d.ts:2772, 2977`). A `transformIndexHtml` with `order: "post"` sees the injected tags.
- **Fonts:** The fontsource CSS uses relative `url(./files/*.woff2)`, which `font-src 'self'` and `assetsInlineLimit: 0` handle.
- **Samples:** `../../../../samples/x.csv?raw` from `src/slice/` resolves to the repository root. The default `server.fs.allow` (workspace root, found from the `workspaces` field) covers it, and the build is not restricted.
- **TypeScript:** `lib.es2023.intl.d.ts` exists in TS 6.0.3 and types `format(StringNumericLiteral)`.
- **Vitest:** Vitest 5.1.0's peer range includes Vite 8.
- **Playwright:** `webServer` runs in the config's directory, so `npx vite preview` serves `apps/web/dist`.
- **TextDecoder fallback:** The BOM check, strict UTF-8 then Windows-1252 order matches R3.10 (apart from the property issues in finding 4).
- **Root scripts:** The design's `pretest` and `pretypecheck` and the `packages/*` then `apps/*` workspace order meet R9.2 and R9.2a.

Two checks I could not run here, because the tool would not approve `node` commands: the Intl output for KWD and the round-trip behaviour of TextDecoder.

Verdict: approve after fixes

## Resolution

| Finding | Decision | Where changed in design.md |
| --- | --- | --- |
| 1 | Accepted. The three parser test places R11.7 changes are named; in each, the description role uses list priority (lowest index in `DESCRIPTION_HEADERS`, then leftmost), and the other roles stay leftmost. The first case now expects `description: 3`. | Core amendment: new "Parser tests changed by R11.7" table; Unit tests row for `columns.test.ts` (amended) points to it |
| 2 | Accepted. Non-ISO date regexes take `\d{2}(?:\d{2})?` years; `dateCellArb` generates 2-digit years; unit test added for `01/02/26`. | Messages (`isDateShaped` paragraph); P14; Generators (`dateCellArb`); Unit tests `messages.test.ts` |
| 3 | Accepted. `contrast.test.ts` reads `index.css` with `readFileSync(new URL(…), "utf8")` and has a `/// <reference types="node" />`. | Unit tests `src/contrast.test.ts`; New dependencies (`@types/node` row) |
| 4 | Accepted. P12 uses `fc.string({ unit: "binary" })`, excludes a leading U+FEFF in the UTF-8 clause and `ÿþ`/`þÿ` starts in the Windows-1252 clause. Unit tests pin the stripped BOM and the R3.10 behaviour for `FF FE 61 62`. | P12; Unit tests `decode-bytes.test.ts` |
| 5 | Accepted. P13 splits `detail` on `", "` and checks that no listed item equals a date- or amount-shaped input or its cut. | P13 |
| 6 | Accepted. Picks use `userEvent.setup({ applyAccept: false })`; the not-CSV case is tested both by pick and by drop. | Component tests intro; "Error: not CSV" row |
| 7 | Accepted. The throw case moved to its own file, `analyze-statement.throw.test.ts`, with a partial mock built from `vi.importActual`. | Unit tests: `analyze-statement.test.ts` row trimmed, new `analyze-statement.throw.test.ts` row |
| 8 | Accepted, both parts. E2E step 6 checks storage, cookies (page and `context.cookies()`) and the URL; new step 8 walks `dist` and checks file extensions. Lint gains `no-restricted-imports` (`**/packages/core/**`) and `no-restricted-syntax` (`toFixed`, `/ 100`), turned off for `logic/money.ts`. | E2E steps 6 and 8; Lint block (code and notes); Data models (Req 6.2 paragraph); Static checks |
| 9 | R4.6 kept as is. Names longer than 40 code points are cut to 39 code points plus `…` (40 characters total), using `Array.from`. No requirements change needed. | Messages (paragraph after `visibleColumnNames`); P13; Unit tests `messages.test.ts` |
| 10 | Accepted. Idle checks `accept`, `font-display` and the 640 px `main`. Results checks `Monthly`, the yearly-cost text and the `money` class. New skipped-rows case, with singular wording added to the summary. New tests: `fade-in.test.tsx` (through a pure `fadeInMotion` helper), `vite-config.test.ts` and `netlify-config.test.ts`. `contrast.test.ts` also checks the focus-ring and `.money` rules. R11.3 is flagged as needing its own task. | Component tests (Idle, Results, new Skipped rows); ResultsView layout item 2; Unit tests (new rows; `contrast.test.ts`); Module layout (`fade-in.tsx`, new config-test row, `tsconfig.json`); Core amendment (R11.3 sentence) |
| 11 | Accepted. `index.html` adds `<link rel="icon" href="data:,">` below `<meta charset>`. | Module layout `index.html` row; CSP placement paragraph |
| 12 | Accepted. `@zombills/web` gains `pretest` and `predev`, both building `@zombills/core`. | Root scripts (web scripts block and the paragraph after it) |
| 13 | Accepted. A purity block for `apps/web/src/slice/logic/**` (tests excluded) reuses `RESTRICTED_GLOBALS` and bans `EventSource`, `sessionStorage`, `indexedDB`, `caches`, `Date.now`, `performance.now` and `Math.random`. It repeats the network property bans because flat config replaces rule options rather than merging them. | Lint block |
| 14 | Accepted. `checkFiles<F extends FileFacts>(files: readonly F[]): FileCheck<F>`. | Byte decoding and file checks (signature and the paragraph after it) |
| 15 | Accepted. P1 adds `fc.string({ unit: fc.constantFrom("\uD800", "\uDFFF", "\u0000", "a", ",") })`. | P1 |
| 16 | Accepted. Every row of the guessed-only CSV has an explicit `USD` or `EUR` cell. | Component tests "Guessed-only group" row |
| 17 | Accepted. One sentence states that build-time files outside `src` are out of the privacy lint's scope on purpose. | Lint block (notes after the code) |

No finding needs a change to `requirements.md`.
