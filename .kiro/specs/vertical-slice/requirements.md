# Requirements Document

## Introduction

The `vertical-slice` feature is the first plain, working page of the Zombills site in `apps/web`. The user gives the page one bank statement CSV (by dropping it, by picking it with a file button, or by choosing one of the four bundled sample statements). The page runs the existing `@zombills/core` pipeline (`parseStatement` → `normalizeTransactions` → `detectSubscriptions`) entirely in the browser and shows a plain list of the detected subscriptions with their yearly cost and a yearly total per currency.

The slice proves the whole path from file to result on a live static site before the haunted UI is built. It uses the colour tokens and fonts already defined in `apps/web/src/index.css` (from `spooky-design.md`) but a plain layout: no cards rising, no burial, no graveyard. The art spike in `apps/web/src/spike` stays in the codebase and stays reachable on its own address.

Statement data never leaves the device. The page makes no network request with statement data, stores nothing, and logs nothing.

Out of scope for this spec:

- The column-mapping screen. WHEN the parser returns `status: "mapping-required"`, the page shows an error state saying which required column it could not find (Requirement 4.6). A later spec adds the mapping fallback that `product.md` requires. To make this dead end rarer, Requirement 11 amends statement-parser with more header names used by common UK and US banks.
- The classifier labels (`zombie`, `possessed`, `trial-trap`), the "Still using this?" question, Keep / Bury, tombstones, the graveyard view, the cancel helper and the shareable image.
  (Changed by subscription-classifier: that spec moved `possessed` and `trial-trap` in scope, shown as plain text lines on the slice page. The `zombie` label and the "Still using this?" question stay out of scope.)
  (Changed by graveyard-ui: the `zombie` label, the "Still using this?" question, Keep / Bury, tombstones and the graveyard are now in scope; see graveyard-ui Requirements 2 to 9. The cancel helper and the shareable image stay out of scope.)
- Any haunted art, animation or sound on the slice page.
- Currency override and sign-convention override controls. The page uses the parser's defaults and detection.
- Multiple statements at once, and merging statements.
- PDF statements.
- Deployment itself. This spec only requires that the site builds as a static bundle Netlify can publish (Requirement 9).
- Correcting the cadence of a guessed (single-charge) subscription. The page shows it as guessed and keeps it out of the totals (Requirement 5.6).

---

## Glossary

- **Page**: The vertical-slice page of `@zombills/web`, served at the site root.
- **Spike**: The existing art spike, the `BurialSpike` component in `apps/web/src/spike`.
- **Pipeline**: `parseStatement(csv)` → `normalizeTransactions(result.transactions)` → `detectSubscriptions(normalized)` from `@zombills/core`, called with no options.
- **Analyzer**: A pure function in `apps/web` that takes the statement text and returns an Analysis outcome (Requirement 3). It holds the pipeline glue and no React or DOM code.
- **Analysis outcome**: The Analyzer's result: one of the kinds in Requirement 3.2.
- **Statement source**: Where the statement text came from: a dropped file, a file picked with the file button, or a Sample.
- **Sample**: One of the four bundled sample statements in `samples/`: `us-signed.csv`, `uk-debit-credit.csv`, `eu-semicolon.csv` and `with-preamble.csv`.
- **Size limit**: 1 MiB (1,048,576 bytes). A statement of about 10,000 rows, the input size the detector is tested for (subscription-detector Requirement 11.14), is well under this limit.
- **Counted subscription**: A `Subscription` with `status: "active"` and `evidence.cadenceAssumed: false`. Only Counted subscriptions add to a Currency total.
- **Currency total**: For one currency, the sum of `yearlyCostCents` of the Counted subscriptions in that currency.
- **Page state**: One of `idle`, `working`, `results`, `no-subscriptions` and `error` (Requirement 4).
- **Money formatter**: The function in `apps/web` that turns integer minor units and an ISO 4217 code into display text (Requirement 6).
- **Minor units**: The integer `amountCents` values from `@zombills/core`. The parser always reads 2 decimal places (statement-parser Requirement 5.6), so the display value is `amountCents / 100` for every currency.
- **Assumed values**: The parser values the Page did not read from the statement itself: `detectedCurrency` with `source: "default"`, `detectedDateFormat` with `assumed: true`, and `detectedSignConvention` with `assumed: true`.

---

## Requirements

### Requirement 1: Page address and the art spike

**User Story:** As the team, I want the working page at the site root and the art spike still reachable, so that the live URL shows the product while the spike stays available for the haunted UI work.

#### Acceptance Criteria

1. WHEN the site is opened at its root with no URL hash, or with any hash other than `#spike`, THE Page SHALL be shown.
2. WHEN the site is opened with the URL hash `#spike`, THE site SHALL show the Spike instead of the Page, without a full page reload.
3. WHEN the URL hash changes between `#spike` and any other value while the site is open, THE site SHALL switch between the Spike and the Page without a reload.
4. THE Page SHALL contain a visible link to `#spike`, and the Spike view SHALL contain a visible link back to the Page.
5. THE `apps/web/src/spike` files SHALL be kept. The switch SHALL use the URL hash only, so the static host needs no rewrite rule.

(Changed by graveyard-ui: `#spike` and the hash switch are retired. The site shows the Page for every URL hash, the Page has no link to `#spike`, and `use-hash-route.ts` is removed. This replaces Criteria 1 to 5; see graveyard-ui Requirement 1.8.)

### Requirement 2: Choosing a statement

**User Story:** As a user, I want to drop my statement, pick it from my files or try a sample, so that I can see results without hunting for the right control.

#### Acceptance Criteria

1. THE Page SHALL show a drop area that accepts one file dropped on it, and a button inside or next to it that opens the browser's file picker for one file. The file input SHALL have `accept=".csv,text/csv"`.
2. THE Page SHALL show one button per Sample, each labelled with a short human description of its layout (for example "US bank, signed amounts", "UK bank, debit and credit columns", "EU bank, semicolons", "Statement with a header block").
(Changed by landing-polish: On the Landing view the US Sample is offered by the Primary action "Summon the undead with a sample US bank statement" and the other three Samples as Secondary samples; the Non-landing gate keeps four Sample buttons.)
(Changed by pro-polish: The Sample labels are "US bank statement", "UK bank statement", "European bank statement" and "Statement with extra top lines".)
3. THE Samples SHALL be bundled into the site at build time from the files in `samples/`. Choosing a Sample SHALL NOT make a network request.
4. WHEN the user drops a file on the drop area, picks a file, or chooses a Sample, THE Page SHALL start the analysis of that Statement source (Requirement 3) and enter the `working` state (Requirement 4).
5. WHEN a file is dragged over the drop area, THE Page SHALL show that the drop area will accept it, with a text change as well as a colour change.
6. WHEN a file is dropped anywhere on the Page outside the drop area, THE browser SHALL NOT open or download the file, and THE Page SHALL ignore the drop.
7. WHILE the Page is in the `working` state, THE Page SHALL ignore new drops and disable the file button and the Sample buttons. (changed by graveyard-ui: "disable" means `aria-disabled="true"` with handlers that do nothing, not the HTML `disabled` attribute, so focus is kept; see graveyard-ui Requirement 14.2.)
8. THE drop area SHALL be operable from the keyboard: it SHALL be reachable with Tab, and Enter or Space on it SHALL open the file picker.

### Requirement 3: Analysing the statement in the browser

**User Story:** As a user, I want my statement analysed on my own device, so that I get results without sending my bank data anywhere.

#### Acceptance Criteria

1. THE Analyzer SHALL be a pure function `analyzeStatement(csv: string): AnalysisOutcome` that runs the Pipeline on `csv`. It SHALL NOT read or write the DOM, storage, the clock or the network, and SHALL NOT log.
2. THE Analyzer SHALL return exactly one of these outcomes:

   | Outcome `kind` | WHEN |
   | --- | --- |
   | `"empty"` | `parseStatement` returns `status: "error"` with a `reason` equal to one of the two empty-input constants the parser exports (Requirement 11.4) |
   | `"parse-error"` | `parseStatement` returns any other `status: "error"`; the outcome carries the parser's `reason` |
   | `"columns-unreadable"` | `parseStatement` returns `status: "mapping-required"`; the outcome carries the `columns` list and, for each of date, description and amount, whether a column for it was recognised (Criterion 9) |
   | `"no-transactions"` | `parseStatement` returns `status: "mapped"` with no `transactions`; the outcome carries the number of `rowErrors` |
   | `"no-subscriptions"` | the Pipeline runs and `detectSubscriptions` returns no `subscriptions`; the outcome carries the transaction count, the number of `rowErrors`, the `StatementInfo`, and the parser's `detectedCurrency`, `detectedDateFormat` and `detectedSignConvention` |
   | `"results"` | `detectSubscriptions` returns one or more `subscriptions`; the outcome carries them, the transaction count, the number of `rowErrors`, the `StatementInfo`, the parser's `detectedCurrency`, `detectedDateFormat` and `detectedSignConvention`, and the Currency totals (Requirement 5.7) |

3. IF any Pipeline function throws, THEN THE Analyzer SHALL return `{ kind: "parse-error" }` with a fixed generic reason that contains no statement content, and SHALL NOT rethrow.
4. THE Analyzer SHALL NOT change, filter or re-sort the `subscriptions` returned by `detectSubscriptions`; ordering for display is Requirement 5.2.
5. *(PBT: never throws)* FOR ALL strings, including the empty string, binary-looking strings, and random CSV-like text built from delimiters, quotes, digits, dates and currency symbols, `analyzeStatement` SHALL return an outcome of one of the six kinds and SHALL NOT throw.
6. *(PBT: deterministic)* FOR ALL strings, calling `analyzeStatement` twice with the same string SHALL return deeply equal outcomes.
7. WHEN `analyzeStatement` is called with the text of each Sample, THE outcome SHALL have `kind: "results"` and SHALL list the subscriptions that the core sample tests (`packages/core/src/detect/samples.test.ts`) expect for that Sample.
8. THE Page SHALL read a dropped or picked file as bytes in the browser (with the `File` API), decode them as Criterion 10 states, and pass the text to the Analyzer. Before calling the Analyzer, THE Page SHALL enter the `working` state, wait for one `requestAnimationFrame` callback and then a `setTimeout(…, 0)` callback, so the browser paints the `working` state before a large file is analysed.
9. FOR a `"columns-unreadable"` outcome, THE Analyzer SHALL work out which of the date, description and amount columns is missing by matching the `columns` against the header name lists the parser exports (Requirement 11.5), in the same trimmed, case-insensitive way the parser does (statement-parser Requirement 2.10). The amount column counts as found WHEN a signed amount column, or both a debit and a credit column, is found. WHEN all three count as found and the parser still returned `"mapping-required"`, the outcome SHALL mark none as missing.
10. THE Page SHALL decode file bytes as follows: WHEN the bytes start with a UTF-16 byte order mark (`FF FE` or `FE FF`), decode them as UTF-16 LE or UTF-16 BE; otherwise decode with `new TextDecoder("utf-8", { fatal: true })` and, IF that throws, decode with `new TextDecoder("windows-1252")`. The NUL check of Requirement 4.5 SHALL run on the decoded text.

### Requirement 4: Page states, file checks and starting again

**User Story:** As a user, I want the page to tell me plainly what it is doing and what went wrong, so that I know whether to wait, try another file or read my results.

#### Acceptance Criteria

1. THE Page SHALL be in exactly one Page state at a time. It SHALL start in `idle`, showing the drop area, the file button, the Sample buttons and one sentence saying the statement stays on the device and that 2 to 3 months of history give the best results.
(Changed by landing-polish: On the Landing view, `idle` shows the Primary action, three Secondary samples, the Tip in the Own-statement section and the Privacy note in the Footer, not four Sample buttons and one sentence.)
2. WHILE the Page is in the `working` state, THE Page SHALL show the status text `Reading <name>…`, where `<name>` is the file name or the Sample's label.
3. IF more than one file is dropped at once, THEN THE Page SHALL enter the `error` state with the message that only one statement can be read at a time, and SHALL NOT read any of the files.
4. IF the chosen file is larger than the Size limit, THEN THE Page SHALL enter the `error` state with a message that states the limit as "1 MB", and SHALL NOT read the file.
5. IF the chosen file's name does not end in `.csv` (case-insensitive) and its MIME type is not `text/csv`, or the decoded file text (Requirement 3.10) contains a NUL character (`U+0000`), THEN THE Page SHALL enter the `error` state with the message that the file is not a CSV statement. IF the file is 0 bytes, THEN THE Page SHALL enter the `error` state with the empty-file message of Criterion 6.
6. WHEN the Analyzer returns an outcome other than `"results"` and `"no-subscriptions"`, THE Page SHALL enter the `error` state with a message for that kind:

   | Outcome `kind` | Message content |
   | --- | --- |
   | `"empty"` | The file is empty. |
   | `"parse-error"` | The statement could not be read, followed by the parser's `reason` |
   | `"columns-unreadable"` | The columns could not be recognised. WHEN the outcome marks columns as missing, the message names them (for example "No date column was found" or "No date or amount column was found"). Then the column names found (at most 10, each cut to 40 characters), leaving out every name shaped like a date or an amount (it would be a transaction cell, not a header). WHEN no name is left, the message says that no header row was found instead of listing names. |
   | `"no-transactions"` | WHEN the number of failed rows is above 0: no rows could be read, followed by that number. WHEN it is 0: the statement has no transaction rows. |

7. WHEN the Analyzer returns `"no-subscriptions"`, THE Page SHALL enter the `no-subscriptions` state, saying that no recurring charges were found in the number of transactions read between `firstDate` and `lastDate`, and that a statement covering 2 to 3 months or more finds more.
8. WHEN the Analyzer returns `"results"`, THE Page SHALL enter the `results` state (Requirement 5).
9. IF reading a file with the `File` API fails, THEN THE Page SHALL enter the `error` state with the message that the file could not be opened.
10. WHILE the Page is in the `results`, `no-subscriptions` or `error` state, THE Page SHALL show a "Start again" button. WHEN it is activated, THE Page SHALL discard the statement text and the Analysis outcome, return to `idle`, and move keyboard focus to the drop area.
11. WHILE the Page is in the `results`, `no-subscriptions` or `error` state, THE Page SHALL still accept a new drop, file or Sample, which replaces the current result.
(Changed by pro-polish: On `results` and the Graveyard view, a window `dragenter` with Files opens the Statement disclosure so a new drop can replace the result.)
12. Error messages SHALL quote only the file name, the parser's `reason` and column names; they SHALL NOT show transaction rows or amounts. A column name is shaped like a date WHEN, trimmed, it matches one of the parser's five date formats (statement-parser Requirement 3.1), and shaped like an amount WHEN, trimmed, it consists only of digits, at most one leading or trailing sign or pair of brackets, currency symbols, spaces and the separators `.`, `,` and `'`, with at least one digit.

### Requirement 5: The subscription list

**User Story:** As a user, I want a plain list of the recurring charges found, with what each costs me a year, so that I can see where my money goes.

#### Acceptance Criteria

1. WHILE the Page is in the `results` state, THE Page SHALL show the name of the file or Sample, the statement's `firstDate` to `lastDate`, the number of transactions read and, WHEN it is above 0, the number of rows skipped because they could not be read.
1a. WHEN the outcome has any Assumed value, THE Page SHALL say as text, in the `results` and `no-subscriptions` states, which value was assumed and what it was: the currency (for example "No currency was found in the statement, so amounts are shown in USD"), the date format (for example "Dates were read as day/month/year") or the sign convention (for example "Negative amounts were read as money out").
2. THE Page SHALL group the subscriptions by `currency`, the groups in the order of `StatementInfo.currencies`, and within each group list Counted subscriptions first, then the others; within each part by `yearlyCostCents` descending, then `merchant` ascending in code-unit order, then `id`.
3. THE Page SHALL show for each subscription, as text: `merchant`; the cadence as "Weekly", "Monthly" or "Yearly"; `currentAmountCents` with its currency; and `yearlyCostCents` with its currency, labelled as a yearly cost.
4. WHEN a subscription's `priceHistory` has more than one entry, THE Page SHALL show every entry as its date and amount, oldest first, so the user sees each price change. WHEN it has one entry, THE Page SHALL show no price history.
5. WHEN a subscription has `status: "ended"`, THE Page SHALL show the word "Ended" and the date of its last charge (`evidence.lastChargeDate`) next to it.
6. WHEN a subscription has `evidence.cadenceAssumed: true`, THE Page SHALL show that the cadence is a guess from a single charge, and SHALL show its yearly cost as an estimate.
7. THE Page SHALL show, for each currency group that holds at least one Counted subscription, the Currency total labelled with its currency. WHEN the group holds any subscription that is not a Counted subscription, THE Page SHALL show a note that ended subscriptions and guessed ones are not included in the total. A group with no Counted subscription SHALL show no total line, only that note. THE Page SHALL NOT add amounts of different currencies together, and SHALL NOT show a grand total across currencies.
8. THE Page SHALL show dates as day, month name and year (for example "12 Jan 2026") formatted from the ISO `yyyy-mm-dd` string in UTC, so the shown date never shifts by the user's time zone.
9. THE list SHALL be a semantic list (`ul`/`li`, or a table with column headers), each currency group having a heading naming its currency.
10. THE Page SHALL use text service names only, with no logos.
11. *(PBT: totals)* FOR ALL arrays of at most 10,000 `Subscription` values with currencies drawn from at least three codes and each `yearlyCostCents` a non-negative integer of at most `999_999_9900 × 52`, the Currency totals SHALL have one entry per currency that has at least one Counted subscription, each entry SHALL equal the exact integer sum of `yearlyCostCents` of the Counted subscriptions in that currency, every total SHALL be a safe integer, and no total SHALL include an amount from another currency.
11a. IF a Currency total would not be a safe integer, THEN THE totals function SHALL throw a `RangeError`. The Pipeline's bounds (subscription-detector Requirement 6.5) keep real totals far below this, so it never reaches the user; a unit test SHALL cover it with two Counted subscriptions of `Number.MAX_SAFE_INTEGER`.
12. *(PBT: grouping is complete)* FOR ALL arrays of `Subscription` values, the grouped and ordered display list SHALL contain every input subscription exactly once, in the group of its own currency.

(Changed by graveyard-ui: the plain list is replaced by the Rising and the Graveyard view, so Criteria 3 to 6, 9 and 10 no longer describe what the Page shows. The ordering and grouping logic (Criterion 2) and the totals logic (Criteria 7, 11 and 11a) are kept. The Currency totals are shown as "Still draining <amount> a year", after subtracting the Counted savings of subscriptions answered "not using"; see graveyard-ui Requirement 1.6a.)

### Requirement 6: Money display

**User Story:** As a user, I want amounts shown in my statement's currency in the usual format, so that I can read them at a glance and trust them.

#### Acceptance Criteria

1. THE Money formatter SHALL be a function `formatMoney(minorUnits: number, currency: string, locale?: string): string` that formats `minorUnits / 100` with `Intl.NumberFormat` in `style: "currency"` with the given ISO 4217 code. WHEN `locale` is absent, it SHALL use the browser's default locale.
2. THE Money formatter SHALL be the only place in `apps/web` that converts minor units to a display value. No component SHALL divide an amount by 100 or call `toFixed` on an amount.
3. THE Money formatter SHALL neither round away minor units nor invent digits: WHEN the currency's default fraction digits are fewer than 2 and `minorUnits % 100 !== 0`, it SHALL show 2 fraction digits; WHEN the currency's default fraction digits are more than 2 (for example KWD), it SHALL set `minimumFractionDigits` and `maximumFractionDigits` to 2, because the parser never reads more than 2 decimal places (statement-parser Requirement 5.6).
4. IF `minorUnits` is not a safe integer, THEN THE Money formatter SHALL throw a `RangeError`. The Pipeline only returns safe integers (subscription-detector Requirement 6.5), so this never reaches the user.
5. Every money figure on the Page SHALL be rendered as text, in Inter with tabular figures (`font-variant-numeric: tabular-nums`).
6. *(PBT: exact in en-US)* FOR ALL safe integers `n` with `|n| ≤ 999_999_9900`, `formatMoney(n, "USD", "en-US")` with the `$`, `,` and `-` characters removed SHALL equal `` `${Math.floor(|n| / 100)}.${String(|n| % 100).padStart(2, "0")}` `` (built by integer arithmetic, so no cent is lost or gained), and the formatted string SHALL start with `-` exactly when `n < 0`.
7. Examples the implementation SHALL satisfy (Node's built-in `Intl`): `formatMoney(1549, "USD", "en-US")` = `"$15.49"`; `formatMoney(1099, "GBP", "en-GB")` = `"£10.99"`; `formatMoney(1299, "EUR", "de-DE")` = `"12,99 €"` (with the non-breaking space `Intl` produces); `formatMoney(100000, "JPY", "en-US")` = `"¥1,000"`; `formatMoney(100050, "JPY", "en-US")` = `"¥1,000.50"`; `formatMoney(1250, "KWD", "en-US")` = `"KWD 12.50"` (with the non-breaking space `Intl` produces).

### Requirement 7: Privacy

**User Story:** As a privacy-minded user, I want proof that my statement stays on my device, so that I can trust the page with my bank data.

#### Acceptance Criteria

1. After the initial page load, THE Page SHALL make no request to any origin other than its own, and no request other than a `GET` for a static file in `dist` with no query string and no request body (for example a font subset that `@fontsource` CSS loads the first time text needs it). This holds whatever the Statement source: reading a file, choosing a Sample, analysing, showing results and starting again SHALL cause no other request.
2. THE site SHALL make no third-party request at any time: fonts come from the bundled `@fontsource` packages, Samples are bundled, and there are no analytics, tracking or error-reporting scripts.
3. THE Page SHALL NOT write statement text, transactions, subscriptions or any value derived from them to `localStorage`, `sessionStorage`, IndexedDB, the Cache API, cookies or the URL (path, query or hash). *(Note: amended by `graveyard-memory` Requirement 10.2, with one exception: WHILE Memory is on, the Store key `zombills.graveyard.v1` in `localStorage` holds the Stored graveyard of that spec, and nothing else.)*
4. THE `apps/web/src` code outside test files SHALL NOT call `console` methods, `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` or `EventSource`. THE root `eslint.config.js` SHALL add a block for `apps/web/src/**` (excluding test files) that reports any of these as an error, and `npm run lint` SHALL pass.
5. WHEN "Start again" is activated or a new statement replaces the current one, THE Page SHALL drop its references to the previous statement text and Analysis outcome.
6. THE built `index.html` SHALL set this Content Security Policy in a `<meta http-equiv="Content-Security-Policy">` tag: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'`. (`'unsafe-inline'` is for styles only, because React and Framer Motion set inline `style` attributes.) The tag SHALL be added at build time only, by a small Vite plugin in `apps/web` with `apply: "build"` that uses `transformIndexHtml` to place it in `<head>` before every `<script>` and `<link>` tag. `apps/web/index.html` SHALL NOT contain the tag, so the dev server (whose hot reload needs a WebSocket and an inline React Refresh script) runs without it.
7. THE Vite build config SHALL set `build.assetsInlineLimit: 0`, so no font or other asset is inlined as a `data:` URI that `font-src 'self'` would block, and `build.modulePreload: { polyfill: false }`, because Vite's preload polyfill calls `fetch()`, which `connect-src 'none'` blocks.

### Requirement 8: Accessibility and look

**User Story:** As a keyboard or screen-reader user, I want to load a statement and hear the result, so that the page works for me as well as for anyone.

#### Acceptance Criteria

1. Every control (drop area, file button, Sample buttons, "Start again", the spike link) SHALL be reachable and operable with the keyboard alone, in a logical Tab order, and SHALL show a visible `--moss` focus ring with a 2px offset when focused. (Changed by graveyard-ui: the spike link is gone, because `#spike` is retired.)
2. Every control SHALL have an accessible name. The hidden file input SHALL be labelled, and the drop area SHALL have a name that says it accepts a CSV statement.
3. THE Page SHALL have a live region (`role="status"` or `aria-live="polite"`) that announces entering `working`, `results` (with the number of subscriptions found and each Currency total), `no-subscriptions` and `error` (with the error message). Error messages MAY use `role="alert"` instead.
4. WHEN the Page enters `results`, `no-subscriptions` or `error`, THE Page SHALL move focus to the heading of that state's content.
5. THE Page SHALL use the colour tokens from `spooky-design.md` through the CSS custom properties in `apps/web/src/index.css`, with no hard-coded hex values, and every text and background pair used SHALL meet WCAG AA (4.5:1 for body text, 3:1 for large text).
6. THE drag-over state, the state of every control and each subscription status ("Ended", guessed cadence) SHALL be conveyed by text, not by colour alone.
7. WHEN `prefers-reduced-motion: reduce` is set, THE Page SHALL show no position, scale or rotation motion. Any transition on the Page SHALL go through Framer Motion and use `useReducedMotion` to fall back to an opacity fade of at most 150 ms.
8. THE Page SHALL use one main heading in IM Fell English, body text in Inter, a single column at widths up to 640 px, and spacing on the 8 px grid.

### Requirement 9: Static build for Netlify

**User Story:** As the team, I want one build command that produces a static folder, so that Netlify can publish the site from `main` with no server.

#### Acceptance Criteria

1. `@zombills/web` SHALL depend on `@zombills/core` through the npm workspace, and SHALL import the Pipeline only from the package's public entry point (`@zombills/core`), never from its `src` files. This holds for test files too.
2. Running `npm run build` at the repository root SHALL build `@zombills/core` before `@zombills/web` and SHALL write the static site to `apps/web/dist`.
2a. THE root `package.json` SHALL have `pretest` and `pretypecheck` scripts that run `npm run build --workspace @zombills/core`, so the root `npm test` and `npm run typecheck` work on a clean checkout, where `packages/core/dist` does not exist yet.
3. THE repository SHALL contain a `netlify.toml` at the root with build command `npm run build` and publish directory `apps/web/dist`, and no redirects, functions or edge functions.
4. THE built `apps/web/dist` SHALL contain only static files (HTML, JS, CSS, fonts, images), with the font files and the Sample text inside it.
5. WHEN `apps/web/dist` is served by any static file server, THE Page SHALL work as described in this spec, including `#spike`. (Changed by graveyard-ui: "including `#spike`" no longer applies, because `#spike` is retired.)

### Requirement 10: Tests

**User Story:** As the team, I want the slice covered by fast unit and component tests plus one browser smoke test, so that later UI work cannot silently break the path from file to result.

#### Acceptance Criteria

1. `@zombills/web` SHALL have a `test` script that runs Vitest (with fast-check for the property tests and a DOM environment for component tests) and excludes `apps/web/e2e/`, so the root `npm test` runs it.
2. Unit tests SHALL cover the Analyzer (Requirement 3, including each outcome kind, the missing-column check of Criterion 9 and each Sample), the byte decoding (Requirement 3.10), the Currency totals and display ordering (Requirement 5.2, 5.7, 5.11a), the date display (Requirement 5.8) and the Money formatter (Requirement 6). Property tests SHALL be in `.property.test.ts` files next to their source.
3. Component tests SHALL render the Page and cover each Page state: `idle`; `working`, asserting that the `Reading <name>…` text appears before the outcome is shown (Requirement 3.8, 4.2); `results` from a Sample; `no-subscriptions`; and `error` for more than one file, a file over the Size limit, a non-CSV file, an empty file, a `"columns-unreadable"` outcome that names a missing column, and a headerless file such as `01/02/2026,NETFLIX.COM,-15.49` whose message says no header row was found and shows none of its cells. They SHALL also cover the `uk-debit-credit.csv` Sample re-encoded as Windows-1252 (so each `£` is the byte `0xA3`) and given as a file, which SHALL show the same transaction count, skipped-row count, subscriptions and GBP total as the Sample (Requirement 3.10); a currency group whose only subscription is guessed, showing the not-included note and no total line (Requirement 5.7); an Assumed value shown as text (Requirement 5.1a); "Start again" returning to `idle` with focus on the drop area; and the live-region announcement for `results`.
4. Component tests SHALL check that the `#spike` hash shows the Spike and that removing the hash shows the Page. (Changed by graveyard-ui: these tests are removed and replaced by one test that `#spike` shows the Page; see graveyard-ui Requirement 16.3.)
5. THE repository SHALL have one Playwright test in `apps/web/e2e/` (`.spec.ts`) that serves the built site and chooses the `us-signed.csv` Sample. It SHALL check that the USD list shows, in this order, Adobe Creative Cloud, Riverside Gym Membership, Netflix and Spotify (the subscriptions `packages/core/src/detect/samples.test.ts` expects for that Sample), and that the USD Currency total is `135564` minor units, shown as "$1,355.64". It SHALL fail if any request after the page has loaded breaks Requirement 7.1 (another origin, a method other than `GET`, a query string, a request body, or a path that is not a file in `dist`), or if anything is written to the browser console. The Playwright config SHALL set `locale: "en-US"` and `timezoneId: "UTC"`. (Changed by graveyard-ui: the list and Currency total checks are replaced by the haunted demo path, which keeps the console, request and CSP checks; see graveyard-ui Requirement 16.4.)
6. The Playwright test SHALL run with its own script (`npm run test:e2e --workspace @zombills/web`), not as part of the root `npm test`.

### Requirement 11: Amendment to statement-parser

**User Story:** As a user with a common UK or US bank export, I want the parser to recognise my bank's column names, and as the team, I want the Analyzer to depend on parser values that cannot drift silently, so that fewer statements dead-end and an empty file is always reported as empty.

This requirement changes `packages/core/src/parse` (the statement-parser spec). It is part of this spec because the slice is the first caller to need it.

#### Acceptance Criteria

1. THE Parser SHALL add `"posting date"` to `DATE_HEADERS` in `packages/core/src/parse/header-names.ts`, after the existing entries. (`"transaction date"` is already in the list and SHALL NOT be added again.)
2. THE Parser SHALL add `"paid out"` and `"money out"` to `DEBIT_HEADERS`, and `"paid in"` and `"money in"` to `CREDIT_HEADERS`, after the existing entries. Adding entries at the end keeps the left-to-right column choice of statement-parser Requirement 2.1 and 2.4 unchanged for every header row that already matched.
3. THE statement-parser `requirements.md` text of Requirement 2.1 and 2.4 SHALL be updated to list the added names, with a note that this spec added them.
4. THE Parser SHALL export from `@zombills/core` two named string constants for its empty-input reasons, one with the value `"The CSV is empty"` and one with the value `"The CSV has no rows with content"`, and `parseStatement` SHALL use these constants for those two error results. The Analyzer SHALL match `"empty"` outcomes on these constants, not on string literals (Requirement 3.2).
5. THE Parser SHALL export from `@zombills/core` the header name lists (`DATE_HEADERS`, `DESCRIPTION_HEADERS`, `AMOUNT_HEADERS`, `DEBIT_HEADERS`, `CREDIT_HEADERS`) and `normalizeHeader`, so the Analyzer can tell which required column is missing (Requirement 3.9) without importing from `src` (Requirement 9.1).
6. Unit tests in `packages/core` SHALL cover: a header row `Date,Description,Paid out,Paid in` mapped as a `DebitCreditLayout`; `Date,Description,Money out,Money in` mapped the same way; `Posting Date,Description,Amount` mapped with `Posting Date` as the date column; and both empty-input results carrying the exported constants; and the Chase header row of Criterion 7 mapped with description to column 2, date to column 1 and amount to column 3. The existing parser tests SHALL still pass.
7. WHEN more than one header cell matches `DESCRIPTION_HEADERS`, THE Parser SHALL map to `description` the cell whose name comes earliest in `DESCRIPTION_HEADERS` (so `"description"` beats `"details"`), and only among cells with the same name SHALL it pick the leftmost cell. Example: the Chase US header row `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #` maps `description` to column 2 (`Description`), `date` to column 1 (`Posting Date`) and `amount` to column 3 (columns counted from 0). This changes the leftmost-column rule for description in statement-parser Requirement 2.2, and that requirement's text SHALL be updated to say so, with a note that this spec changed it. The existing parser tests SHALL still pass unchanged, except any test that asserted the leftmost choice between two different description names.
