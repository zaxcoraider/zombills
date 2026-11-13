# Implementation Plan: statement-parser

Tasks run in dependency order. Every source file lives in `packages/core/src/parse/` unless a path says otherwise. Each task writes its code and its tests together, and is done only when `npm test -w @zombills/core` passes. Property IDs (P1–P18) refer to the Testing strategy in `design.md`.

Rules that apply to every task:

- Money is integer cents only. No `parseFloat`, and no `Number()` on decimal strings (`money.md`).
- No network, DOM, `console.*`, `Intl` or `Date` in `src/parse` (`privacy.md`, design "Privacy and environment").
- Files are kebab-case and constants are `SCREAMING_SNAKE_CASE`. Unit tests go in `*.test.ts` and property tests in `*.property.test.ts`, next to the source file (`structure.md`).
- TypeScript strict mode. Any `any` needs a comment explaining why (`tech.md`).

---

- [x] 1. Scaffold the workspace and the `@zombills/core` package
  - [x] 1.1 Root workspace
    - Create the root `package.json`: `"private": true`, `"workspaces": ["packages/*", "apps/*"]`, and scripts `test`, `typecheck`, `lint` and `build` that run across workspaces (`npm run <script> --workspaces --if-present`).
    - Create `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `lib: ["ES2022"]` (no `DOM`), `isolatedModules: true` and `skipLibCheck: true`.
    - Create the root ESLint flat config (`eslint.config.js`) using `typescript-eslint`, with Prettier compatibility (`eslint-config-prettier`), plus `.prettierrc`.
    - In `.gitignore`, add `node_modules/` and `dist/` if they are missing. Do not ignore `.kiro/`.
  - [x] 1.2 `packages/core`
    - Create `package.json`: `"name": "@zombills/core"`, `"type": "module"`, `"exports"` pointing at `dist/index.js` and `dist/index.d.ts`, and `"files": ["dist"]`.
      - Scripts: `build` (`tsc -p tsconfig.build.json`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`) and `lint` (`eslint src`).
      - Dependency: `papaparse`.
      - Dev dependencies: `@types/papaparse`, `vitest`, `fast-check`, plus `vite` and `@types/node` (peers of Vitest, pinned explicitly). `typescript`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier` and `prettier` live in the root `package.json` because the ESLint config is at the root. All versions are exact (no `^` or `~`). TypeScript is pinned to 6.0.3 because `typescript-eslint` 8.72.2 requires `<6.1.0`.
    - Create `tsconfig.json`, extending the base, with `src` included and `types: []` so no DOM or Node globals leak in.
    - Create `tsconfig.build.json` extending it, with `outDir: "dist"`, `declaration: true`, and `**/*.test.ts`, `**/*.property.test.ts` and `**/test-*.ts` excluded.
    - Create `vitest.config.ts`: `environment: "node"`, `include: ["src/**/*.test.ts"]`, `exclude: ["**/e2e/**", "node_modules", "dist"]`, `passWithNoTests: true`.
    - Create `src/index.ts`, empty for now.
  - [x] 1.3 Privacy lint rule for `packages/core/src/**`
    - Add `no-restricted-globals` for `fetch`, `XMLHttpRequest`, `WebSocket`, `document`, `window` and `navigator`, each with the message "Statement data never leaves the browser (privacy.md)".
    - Add `no-restricted-properties` for `navigator.sendBeacon`, `globalThis.fetch` and `window.fetch`.
    - Add `no-restricted-syntax` for `Identifier[name='globalThis']`, so `globalThis` cannot be used to bypass the rules (including `globalThis["fetch"]` and `(globalThis as T).fetch`).
    - Add `no-console: "error"`.
  - [x] 1.4 Sample statements in `samples/`. All data must be fake: invented account numbers, no real people, and each file 15–30 rows long. Include monthly subscription merchants so the files are also useful for the detection demo.
    - `us-signed.csv`: comma-delimited; headers `Date,Description,Amount`; `mm/dd/yyyy` dates including at least one day above 12; amounts like `-15.49` and `1,250.00`; negative means money out.
    - `uk-debit-credit.csv`: comma-delimited; headers `Transaction Date,Details,Debit,Credit`; `dd/mm/yyyy` dates, where the first rows fall on days 1–12 and a later row's day is above 12; debit and credit in separate columns; at least one `£` amount.
    - `eu-semicolon.csv`: semicolon-delimited, with a UTF-8 BOM; headers `Value Date;Narrative;Amount;Currency`, all on the recognition lists; `dd.mm.yyyy` dates; comma decimals (`-12,99`, `1.234,56`); the currency column set to `EUR`, with at least one row in lower case (`eur`).
    - `with-preamble.csv`: 3–4 account-info lines (account name, a fake IBAN, a statement period) before an ISO-date signed-amount header; one fully blank row in the middle and one trailing blank row.
  - [x] 1.5 Check the scaffold: `npm install`, then `npm run typecheck`, `npm run lint` and `npm test` all pass at the root, with no tests yet.
  - _Requirements: 12.3 (Node environment), 12.4 (lint half); tech.md, structure.md, privacy.md_

- [x] 2. Public types, internal types and `ParseError`
  - In `types.ts`, write every public type exactly as specified in design "Public types". This includes the nullable `detectedDateFormat` and `detectedSignConvention`, and `ColumnMapValidationError`.
  - In `internal-types.ts`, write `DecimalSeparator`, `Layout`, `ParsedTable`, `ResolvedColumns`, `DataRow`, `AmountOutcome`, `DateDetection` and `SeparatorDetection`.
  - In `parse-error.ts`, write the `ParseError` class, which carries a `field` property. Unit test: it is an `instanceof Error` and keeps `field` and the message.
  - _Requirements: 1.2, 1.3; glossary (Transaction, ParseResult, MappedResult, MappingRequiredResult, ErrorResult, ColumnMap, RowError, DateFormatInfo, SignConventionInfo, ParseError)_

- [x] 3. Tokenizer (`tokenize.ts`)
  - Write `stripBom`, `tokenize`, `isBlankRow` and `serializeRow`.
  - Call Papa Parse with `delimiter: ""`, `delimitersToGuess: [",", ";", "\t"]`, `header: false`, `dynamicTyping: false`, `skipEmptyLines: false`, `worker: false` and `download: false`.
  - Unit tests (`tokenize.test.ts`):
    - a BOM is stripped, and only one;
    - each of the three delimiters is detected;
    - quoted cells keep their delimiters and newlines;
    - a trailing newline produces a row that counts as blank;
    - whitespace-only rows count as blank;
    - `serializeRow` round-trips through `tokenize`.
  - _Requirements: 1.6; glossary Data row_

- [x] 4. Amount parser (`amount.ts`)
  - Write `parseAmountCents`, `tryParseAmount` and `negate`, following the 8 steps in design "Amount parser".
    - Use the sign and currency grammar from the design.
    - Remove leading zeros, then reject more than 8 integer digits before any numeric conversion.
    - Never return `-0`.
    - `tryParseAmount` catches only `ParseError`.
  - Create `test-arbitraries.ts` with the integer-cent arbitrary over [−999_999_9900, 999_999_9900] and two formatters:
    - `formatUs(c)` builds a 2-decimal string from integer arithmetic, so it gives the same result as `(c / 100).toFixed(2)` without float error;
    - `formatEu(c, withThousands)` builds the European form.
  - Unit tests (`amount.test.ts`): every case listed for `amount.test.ts` in the design.
  - Property tests (`amount.property.test.ts`): **P2**, **P3** and **P4**.
  - _Requirements: 5.1–5.13, 13.2, 13.3, 13.4, 4.8; money.md_

- [x] 5. Decimal-separator detection (`decimal-separator.ts`)
  - Write `detectDecimalSeparator(cells)` using the indicator table in the design. Before classifying a cell, strip outer whitespace, sign characters and currency symbols. Use every cell passed in.
  - Unit tests (`decimal-separator.test.ts`): `"1,234.56"` → `.`; `"1.234,56"` → `,`; `"9,99"` → `,`; `"9.9"` → `.`; `"1,234"` alone → default `.`; digits only → default `.`; a `.` indicator and a `,` indicator in different cells → conflict; a deciding cell placed after ten cells that don't decide is still found.
  - Property test (`decimal-separator.property.test.ts`): **P10**.
  - _Requirements: 4.1–4.7_

- [x] 6. Date parsing (`date-format.ts`, part 1)
  - Write the four shape regexes, `daysInMonth` with the Gregorian leap-year rule, and `parseDate(raw, format)`.
    - Accept unpadded day and month.
    - Expand a two-digit year to `20yy` in the non-ISO formats.
    - Output a zero-padded ISO string.
    - Throw `ParseError("date", …)`, naming the expected format, on any mismatch or impossible date.
  - Add to `test-arbitraries.ts`: a valid-date arbitrary, and `formatDate(date, format, { padDay, padMonth, twoDigitYear })`, with two-digit years limited to 2000–2099.
  - Unit tests (`date-format.test.ts`, parse cases): `"1/5/2026"` in both slash formats; `"01.05.26"` → `2026-05-01`; `"2026-5-1"`; `"31/02/2024"` rejected; 29 Feb in 2024 accepted and in 2023 rejected; a cell in the wrong format for the given `format` rejected.
  - Property test (`date-format.property.test.ts`): **P5**.
  - _Requirements: 3.7, 3.8, 3.11 (parsing half), 13.5_

- [x] 7. Date-format detection (`date-format.ts`, part 2)
  - Write `detectDateFormat(cells)`, following the design's decision procedure:
    - the candidate filter (Req 3.1);
    - grouping by shape, where the most frequent shape wins and ties go ISO > Slash > Dot > Dash (Req 3.12);
    - ISO, Dot and Dash decisions (Req 3.2, 3.11);
    - the slash rules: `L`, `M`, conflict, and the assumed default (Req 3.3–3.5, 3.10);
    - no candidates gives `none` (Req 3.9).
  - Unit tests (`date-format.test.ts`, detection cases):
    - one test per branch of the decision procedure;
    - mixed shapes, where the majority wins, an ISO/Slash tie goes to ISO, and the minority cells fail `parseDate` against the chosen format;
    - non-date strings ignored as candidates;
    - an all-garbage column gives `none`.
  - Property tests (`date-format.property.test.ts`): **P11** and **P12**.
  - _Requirements: 3.1–3.6, 3.9, 3.10, 3.11 (detection half), 3.12_

- [x] 8. Header names and header-row detection (`header-names.ts`, `header-detect.ts`)
  - Write the six recognition-list constants from Req 2 and Req 10.4, and `normalizeHeader`, which trims and lower-cases.
  - Write `detectHeaderRow(rows)` and `firstNonBlankRow(rows)`:
    - scan up to 20 non-blank rows;
    - a row is the header if any normalized cell exactly matches a date, description, amount, debit or credit name;
    - return `null` when none matches.
  - Unit tests (`header-detect.test.ts`, component cases): header on row 1; header after preamble; header as the 20th non-blank row is found and as the 21st is not; blank rows don't count toward 20; `"  DATE "` matches; `"Statement date: 01/05/2026"` does not.
  - Property test (`header-detect.property.test.ts`): **P17**, component half. Prepending preamble rows with no recognised names, keeping the header within 20 non-blank rows, leaves the header cells that `detectHeaderRow` finds unchanged.
  - _Requirements: 2.10, 11.1, 11.2, 11.3 (detection half)_

- [x] 9. Column resolution (`columns.ts`)
  - Write `autoDetectColumns(header)`: the leftmost match per role, debit/credit preferred over amount, and `null` when a required role is missing.
  - Write `resolveColumnMap(header, map)`:
    - pick the layout from which roles are set;
    - collect every validation error (`missing-mapping` or `unknown-column`, one per role) before returning;
    - match names exactly against the raw header cells, leftmost first;
    - check `currency` only when it is set.
  - Write the currency-column lookup: `columnMap.currency` if set, otherwise the leftmost normalized `currency` or `ccy` header.
  - Unit tests (`columns.test.ts`): every case listed for `columns.test.ts` in the design, plus:
    - the currency column is found via `CCY`;
    - `amount` is ignored when `debit` and `credit` are both set;
    - two invalid roles give two validation errors.
  - Property test (`columns.property.test.ts`): **P14**, component half. Random surrounding whitespace and random casing on recognised header names leave `autoDetectColumns` output unchanged.
  - _Requirements: 2.1–2.10, 9.1–9.5, 10.4 (column lookup)_

- [x] 10. Currency (`currency.ts`)
  - Write `isCurrencyCode` (`/^[A-Za-z]{3}$/`), `normalizeCurrency` (upper-case) and `resolveRowCurrency(cell, fallback)`.
    - Trim the cell first.
    - An empty cell returns the fallback.
    - A valid code is returned upper-cased.
    - Anything else throws `ParseError("currency")`.
  - Unit tests (`currency.test.ts`): `"usd"`, `"Usd"` and `"USD"` all normalise to `"USD"`; `" eur "` → `"EUR"`; `""` and `"   "` return the fallback; `"US"`, `"EURO"`, `"U$D"` and `"12A"` throw `ParseError`.
  - _Requirements: 10.1–10.6 (cell-level rules)_

- [x] 11. Sign convention (`sign-convention.ts`)
  - Write `detectSignConvention(nonZeroRawCents)`: a strict majority decides with `assumed: false`, and a tie (including 0 versus 0) gives `positive-out` with `assumed: true`.
  - Write `applySignConvention(raw, convention)` using `negate`.
  - Unit tests (`sign-convention.test.ts`): majority positive; majority negative; a tie gives assumed; an empty input gives assumed; `applySignConvention` maps 0 to 0 under both conventions, never `-0`; all four sign × convention combinations.
  - P8 and P18 need a full parse, so they are written in task 14.4.
  - _Requirements: 6.1, 6.3–6.7_

- [ ] 12. Debit/credit combination (`debit-credit.ts`)
  - Write `classifyCell` (empty, zero or populated, where a cell that fails to parse counts as populated) and `combineDebitCredit`, following the design's table.
  - Unit tests (`debit-credit.test.ts`): every row of the combination table, plus `"0.00"` next to `"12.00"`, `"0.00"`/`""` → 0, `""`/`""` → error, `"abc"`/`""` → debit parse error, and `"-0.00"` counted as zero.
  - Property test (`debit-credit.property.test.ts`): **P13**.
  - _Requirements: 7.1–7.6_

- [ ] 13. Row builder (`build-rows.ts`)
  - Write `buildRows`:
    - treat missing trailing cells as `""`;
    - check every field: date, description, amount, currency;
    - combine all failures into one `RowError`, with `rowIndex` set to the data-row ordinal, `rawRow` from `serializeRow`, and `reason` built from `"<field>: <message>"` entries joined with `"; "`;
    - keep input order.
  - Unit tests (`build-rows.test.ts`):
    - a row with a bad date and a bad amount gives one `RowError` naming both;
    - `rowIndex` is the ordinal from the `DataRow`;
    - ragged and short rows;
    - an empty description gives a row error;
    - when no date format was detected, every row gets the "no recognisable date format" reason while the other fields are still checked;
    - signed and debit/credit rows produce the expected `Transaction`s;
    - a per-row currency overrides the fallback.
  - _Requirements: 3.8, 3.9, 5.x (via cached outcomes), 6.3–6.7, 6.9, 6.10, 7.1–7.5, 8.1, 10.4–10.6_

- [ ] 14. `parseStatement` orchestration, statement model and end-to-end properties
  - [ ] 14.1 Pipeline (`parse-statement.ts`)
    - Implement pipeline steps 0–13 from the design, in order:
      - throw `TypeError` for a non-string `csv`;
      - strip the BOM, then run the empty check;
      - validate and normalise `options.currency`, and validate `options.signConvention`;
      - tokenize;
      - detect the header row. If none is found and `columnMap` is given, use the first non-blank row as the header; if none is found without a `columnMap`, return `mapping-required`;
      - resolve columns with the `columnMap` or by auto-detection;
      - collect data rows, numbering them and skipping blank rows;
      - detect the date format, then the decimal separator;
      - parse each amount cell once and cache the outcome;
      - decide the sign convention (signed layout only);
      - build the rows and assemble the result.
    - `MappingRequiredResult.rowErrors` is always `[]`.
    - Export `parseStatement` and the public types from `src/parse/index.ts` and `packages/core/src/index.ts`.
    - Unit tests (`parse-statement.test.ts`):
      - every case listed for `parse-statement.test.ts` in the design;
      - `options.currency: "usd"` gives `"USD"` on every transaction;
      - `options.currency: "US"` gives an error;
      - a bad `columnMap` gives `mapping-required` with `validationErrors`, and the same CSV with a corrected map gives `mapped`;
      - a debit/credit statement gives `detectedSignConvention: null`;
      - a date conflict and a separator conflict each give an `ErrorResult`.
    - Unit tests (`header-detect.test.ts`, end-to-end cases): a header that isn't recognised gives `mapping-required` with the first-row cells; the same file with a `columnMap` naming those cells gives `mapped`, and its first-row cells are not counted as data.
    - _Requirements: 1.1–1.7, 2.6–2.9, 3.6, 4.7, 6.2, 6.8, 8.2–8.5, 9.2, 9.4, 9.5, 10.1–10.3, 11.2, 11.3, 11.4_
  - [ ] 14.2 Statement model in `test-arbitraries.ts`
    - Write the generator for the statement model described in design "Test oracle": transactions with direction, layout, date format, decimal separator, sign convention, header spellings, preamble rows, blank-row positions, delimiter, optional BOM and optional currency column.
    - Write a serializer that renders the model to CSV, and an arbitrary that injects malformed cells.
    - The model also reports its expected N, the sign each row should have, and the expected transactions.
    - Self-test: for any model, serializing and then tokenizing gives the cells the model intended.
  - [ ] 14.3 End-to-end properties (`parse-statement.property.test.ts`): **P1**, **P6**, **P7**, **P9**, **P15** and **P16**.
    - _Requirements: 13.1, 13.6, 13.7, 1.6, 1.7, 8.2, 8.5; glossary Data row_
  - [ ] 14.4 Sign-convention properties (`sign-convention.property.test.ts`): **P8** and **P18**, run through `parseStatement` against the model.
    - _Requirements: 13.8, 6.1, 6.3–6.6_
  - [ ] 14.5 Full-parse halves of P14 and P17
    - Extend `columns.property.test.ts` so **P14** also checks that the `parseStatement` result is unchanged.
    - Extend `header-detect.property.test.ts` so **P17** also checks that the `parseStatement` result is unchanged.
    - _Requirements: 2.10, 11.1, 11.2, 11.4_

- [ ] 15. Privacy and environment checks
  - `no-network.test.ts`:
    - read every non-test `.ts` file under `src/parse` and strip comments;
    - fail on any word-boundary match of `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `document`, `window` or `navigator`, naming the file, line and identifier;
    - include a self-test that feeds the scanner a fixture string containing `fetch(` and expects that identifier to be reported.
  - `node-env.test.ts`: import from the package entry (`../index`) under the Node environment and call `parseStatement` on a small CSV, with no `ReferenceError`.
  - Confirm that `npm run lint -w @zombills/core` fails when a temporary file contains `fetch("x")`, then delete that file.
  - _Requirements: 12.1–12.4; privacy.md_

- [ ] 16. Sample fixture tests
  - In `parse-statement.test.ts`, read each file in `samples/` with `node:fs`. The import is allowed only in test files, because the build excludes them.
  - Assert that each file gives `status: "mapped"`, no `rowErrors`, and the expected layout, date format, separator and sign convention.
  - Snapshot each result.
  - `uk-debit-credit.csv` must be detected as `dd/mm/yyyy` even though its first rows are ambiguous. `eu-semicolon.csv` must give `EUR` and comma decimals. `with-preamble.csv` must ignore the preamble and the blank rows.
  - _Requirements: 1.6, 2.1–2.5, 3.1, 3.3, 3.11, 4.3, 7.1, 7.2, 10.4, 11.1, 11.2_

- [ ] 17. Checkpoint: run the whole suite
  - From the repo root, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. All must pass with no skipped or `.only` tests.
  - Check that `packages/core/dist` contains no test files, no `test-arbitraries` output and no `node:fs` import.
  - Check that every property P1–P18 has a passing `it`/`test` whose name starts with its ID (e.g. `"P5: date round-trip"`), and that `grep -rE 'parseFloat|console\.' packages/core/src/parse` finds nothing outside test files.
  - Check traceability: every acceptance criterion in `requirements.md` appears in at least one task's `_Requirements_` line above.
  - Stop and report results. Do not start other specs.

---

## Property → task map

| Property | Task |
| --- | --- |
| P1 row count | 14.3 |
| P2 amount parser total | 4 |
| P3 US round-trip | 4 |
| P4 European round-trip | 4 |
| P5 date round-trip | 6 |
| P6 amountCents sign/integer | 14.3 |
| P7 determinism | 14.3 |
| P8 sign convention consistency | 14.4 |
| P9 no throw | 14.3 |
| P10 separator order independence | 5 |
| P11 date format order independence | 7 |
| P12 slash conflict | 7 |
| P13 debit/credit absolute value | 12 |
| P14 header normalization | 9 (component), 14.5 (full parse) |
| P15 blank-row invariance | 14.3 |
| P16 delimiter and BOM invariance | 14.3 |
| P17 preamble invariance | 8 (component), 14.5 (full parse) |
| P18 sign flip | 14.4 |
