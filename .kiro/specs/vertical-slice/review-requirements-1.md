# Review: vertical-slice requirements (review 1)

Reviewer: Kiro custom agent `spec-reviewer` (Opus 5.5), 2026-11-15. Findings copied verbatim below; resolution table appended after fixes.

I couldn't run anything: the non-interactive session rejected every `node` and `sed` call. Every finding below comes from reading the spec, `packages/core/src`, `apps/web`, `eslint.config.js` and `samples/` by hand. The vertical slice has no design.md or tasks.md yet, so checklist items 7 (traceability) and 8 (code batch) don't apply.

1. **Severity:** major
   - **Where:** R7.1, R10.5, R9.4
   - **Problem:** R7.1 bans every network request after the initial page load. But `@fontsource` CSS loads each weight, style and `unicode-range` subset only when text first uses it. That includes Inter 500/600, IM Fell italic, and the `inter-cyrillic-*` and `inter-greek-*` files in `apps/web/dist/assets`. A results view that is the first to use one of these makes a same-origin request, and the e2e test in R10.5 would then fail. JS chunks that load later (dynamic `import()`) would do the same.
   - **Failing example:** The idle page uses only Inter 400. The results heading uses Inter 600, so `GET /assets/inter-latin-600-normal-….woff2` fires after you pick `us-signed.csv`. A merchant name such as `"ЯНДЕКС ПЛЮС"` (which the normalizer keeps, per its R2.3) loads `inter-cyrillic-400`.
   - **Suggested fix:** Reword R7.1: "After the initial load, THE Page SHALL make no request to any origin other than its own, and no request other than a `GET` for a static file in `dist` with no query string and no request body." Make R10.5 check that rule instead of "any request". If a strict zero-request rule is wanted, also require `<link rel="preload">` for every font file the Page uses.

2. **Severity:** major
   - **Where:** R7.6 (with R1, R9.5)
   - **Problem:** A `<meta>` CSP written into `apps/web/index.html` is served by the dev server too. There, `connect-src 'none'` blocks the HMR WebSocket and `script-src 'self'` blocks the inline React Refresh preamble from `@vitejs/plugin-react`. So "MAY run without this policy" can't happen unless the spec says how the tag is added. The policy also sets no `default-src`, so `img-src`, `object-src`, `base-uri` and `form-action` are unrestricted.
   - **Failing example:** Run `npm run dev` with the tag in index.html: the console shows "Refused to execute inline script" and "Refused to connect to ws://localhost:5173".
   - **Suggested fix:**
     - Add the tag at build time only, through a small Vite plugin with `apply: "build"` and `transformIndexHtml`, placed before every script and link tag.
     - Specify the full policy: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'`.
     - Set `build.assetsInlineLimit: 0`, or allow `data:` in `font-src`, so a small font is never inlined as a `data:` URI.
     - Set `build.modulePreload: { polyfill: false }`. Vite's preload polyfill calls `fetch()`, which `connect-src 'none'` blocks in browsers without native modulepreload.

3. **Severity:** major
   - **Where:** R3.8, R4.5, R2.1
   - **Problem:** The spec doesn't say how file bytes become text. `File.text()` always decodes as UTF-8. Many UK and EU bank exports are Windows-1252, where `£` is byte `0xA3` and decodes to `U+FFFD`. `U+FFFD` is category So, not Sc, so the parser's R5.3 doesn't strip it, and R5.8 then gives a row error for every amount. UTF-16 exports (Excel "Unicode text") contain NUL bytes and get the misleading "not a CSV" message from R4.5.
   - **Failing example:** `uk-debit-credit.csv` saved as Windows-1252 has the cell `\uFFFD10.99` after decoding. All 18 `£` rows fail, leaving 2 transactions (the debits without a symbol), and Highfield's `41.27` and Market Square's `52.10` are not recurring.
   - **Suggested fix:** Add a criterion: "THE Page SHALL decode with `TextDecoder("utf-8", { fatal: true })` and, on failure, with `TextDecoder("windows-1252")`. A file starting with a UTF-16 BOM SHALL be decoded as UTF-16." Add a component test with a Windows-1252 `£` file.

4. **Severity:** major
   - **Where:** R4.6 (`"columns-unreadable"`) vs R4.12
   - **Problem:** For a file with no recognised header, parser R11.3 returns the cells of the first non-empty row as `columns`, and that row is usually a transaction. R4.6 then prints a transaction row with its amount, which R4.12 forbids.
   - **Failing example:** The headerless file `01/02/2026,NETFLIX.COM,-15.49` gives `columns: ["01/02/2026","NETFLIX.COM","-15.49"]`, and the error message shows them.
   - **Suggested fix:** List the column names only when at least one cell isn't shaped like a date or an amount. Otherwise say "No header row was found." Simpler alternative: never list cells that look like a date or an amount. Add the headerless case to the R10.3 component tests.

5. **Severity:** major
   - **Where:** R4.6, the out-of-scope column-mapping item, product.md must-have list
   - **Problem:** The slice has no mapping screen, and the parser's header lists miss common real layouts. Those files dead-end in `"columns-unreadable"`. The spec doesn't tell the user what to do, and doesn't note which formats are affected.
   - **Failing example:**
     - UK (Nationwide, HSBC): `Date,Description,Paid out,Paid in`. `paid out` and `paid in` are not in parser R2.4.
     - Chase US: `Details,Posting Date,Description,Amount,...`. `posting date` is not in R2.1, and `Details` is taken as the description.
   - **Suggested fix:** Either amend statement-parser R2.1/R2.4 to add `posting date`, `paid out`, `paid in`, `money out`, `money in`, and say in this spec which spec it amends. Or make the R4.6 message say which canonical column is missing ("No date column found among: …").

6. **Severity:** major
   - **Where:** R3.2, R5.1
   - **Problem:** The Analyzer outcome drops `detectedCurrency`, `detectedDateFormat` and `detectedSignConvention`. The page then shows parser defaults as fact. If no symbol or currency column is found, every amount gets a `$`. money.md says to surface the currencies to the user.
   - **Failing example:** UK `Date,Description,Amount` with `-10.99` and no `£` gives `detectedCurrency: { code: "USD", source: "default" }`, and the page shows "Netflix $10.99, $131.88 a year".
   - **Suggested fix:** Carry these three objects in the `"results"` and `"no-subscriptions"` outcomes. Add R5.1a: "WHEN `detectedCurrency.source` is `"default"`, or `detectedDateFormat.assumed` or `detectedSignConvention.assumed` is `true`, THE Page SHALL say which value was assumed, as text."

7. **Severity:** major
   - **Where:** R10.1, R9.1, R9.2
   - **Problem:** `@zombills/core` exports only `./dist/index.js`, and R9.1 forbids importing from `src`. Root `npm test` and `npm run typecheck` never build core first, so web tests fail on a clean checkout or in CI.
   - **Failing example:** Fresh clone, `npm ci && npm test` gives "Failed to resolve entry for package @zombills/core".
   - **Suggested fix:** Require one of two options. Option A: a root `pretest` and `pretypecheck` running `npm run build -w @zombills/core`. Option B: a Vitest-only `resolve.alias` from `@zombills/core` to `packages/core/src/index.ts`, with R9.1 stating the exception for tests.

8. **Severity:** major
   - **Where:** R5.7 vs R5.11
   - **Problem:** R5.7 says to show "the Currency total" for every currency group. R5.11 says totals exist only for currencies with at least one Counted subscription. The spec doesn't say what to show for a group made only of ended or guessed subscriptions.
   - **Failing example:** A EUR group holding one single-charge `netflix` subscription (`cadenceAssumed: true`) has no total entry, so the group can't render one.
   - **Suggested fix:** "WHEN a group has no Counted subscription, THE Page SHALL show the total as `formatMoney(0, currency)` with the not-included note." Or say the total line is omitted. Add the case to a component test.

9. **Severity:** major
   - **Where:** R5.11 (PBT)
   - **Problem:** "Every total SHALL be a safe integer" is false for arbitrary `Subscription` values. The spec also doesn't say what happens on overflow.
   - **Failing example:** Two Counted USD subscriptions with `yearlyCostCents = Number.MAX_SAFE_INTEGER` sum to an unsafe number.
   - **Suggested fix:** Bound the generator to `yearlyCostCents ≤ 999_999_9900 × 52` and at most 10,000 subscriptions. The real maximum total is about 5.2e15, which is safe. Also state: "IF a sum would not be a safe integer, THE totals function SHALL throw `RangeError`."

10. **Severity:** minor
    - **Where:** R10.5
    - **Problem:** `packages/core/src/detect/samples.test.ts` asserts the subscriptions but no Currency total, so "the Currency total the core sample test expects" doesn't exist. The shown text also depends on the browser locale (R6.1, R5.8).
    - **Failing example:** From detector R10.1, `us-signed.csv` has 4 active subscriptions, none guessed: 65988 + 34800 + 21588 + 13188 = 135564. That shows as "$1,355.64" in en-US, but the Euro currency format puts the `$` after the number (e.g. "1.355,64 $") on a Playwright run whose browser locale is de-DE.
    - **Suggested fix:** State the expected rows (Adobe Creative Cloud, Riverside Gym Membership, Netflix, Spotify, in that order) and the total `135564` / "$1,355.64". Require `locale: "en-US"` and `timezoneId: "UTC"` in the Playwright config.

11. **Severity:** minor
    - **Where:** R6.3, R6.7, Glossary "Minor units"
    - **Problem:** The spec handles currencies with 0 fraction digits but not those with 3. `formatMoney(1234, "KWD")` shows "KWD 12.340", a third digit the data never had, because the parser rejects 3 decimals (parser R5.7). The glossary credits money.md with "display value is `amountCents / 100` for every currency", but money.md doesn't say that. The source is parser R5.6.
    - **Failing example:** A KWD statement with `-1.250` rows gives `"no-transactions"` with no hint why. `1250` minor units would show as "KWD 12.500".
    - **Suggested fix:** Set `maximumFractionDigits` to 2 for currencies whose default is more than 2. Cite parser R5.6 in the glossary. Add a KWD example to R6.7.

12. **Severity:** minor
    - **Where:** R3.2 (`"empty"`)
    - **Problem:** The `"empty"` outcome depends on two exact English reason strings in `parse-statement.ts:65` and `:89`. They are not exported constants, so any rewording silently turns an empty file into a `"parse-error"`.
    - **Failing example:** If the parser text changes to "The CSV file is empty", the user sees "could not be read: The CSV file is empty" instead of "The file is empty."
    - **Suggested fix:** Amend statement-parser to export the reason constants (or add a `code` field to `ErrorResult`), and match on those.

13. **Severity:** minor
    - **Where:** R4.6 (`"no-transactions"`)
    - **Problem:** A header-only file returns `"mapped"` with 0 transactions and 0 `rowErrors`. The message then reads "No rows could be read, 0 rows failed".
    - **Failing example:** `Date,Description,Amount\n`
    - **Suggested fix:** "WHEN `rowErrors` is 0, say the statement has no transaction rows."

14. **Severity:** minor
    - **Where:** R4.2, R3.8
    - **Problem:** "or similar" and "let the browser paint" can't be tested as written.
    - **Suggested fix:** Fix the status text, for example "Reading <name>…". Specify the mechanism: wait one `requestAnimationFrame` plus `setTimeout(0)` before calling the Analyzer, and have the component test assert the working text appears before the outcome.

Points I checked that hold up:
- Counted subscriptions (`status: "active"` and `cadenceAssumed: false`) match detector R9.8.
- The R6.6 en-US property is true for `|n| ≤ 999_999_9900`.
- R6.7's examples (including the JPY ones) match how Node's `Intl` formats them.
- Every outcome kind in R3.2 maps to a real parser return, except the invalid-option errors, which can't happen because the Pipeline passes no options.

Verdict: approve after fixes

## Resolution

| Finding | Decision | Where changed in requirements.md |
| --- | --- | --- |
| 1 | Accepted the suggested reword: after the initial load, only same-origin `GET` requests for static files in `dist`, with no query and no body; no other origin ever. | R7.1; R10.5 checks the same rule |
| 2 | Accepted: CSP added at build time only by a small Vite plugin (`apply: "build"`, `transformIndexHtml`, before every script and link tag) with the full policy from the finding; `build.assetsInlineLimit: 0`; `build.modulePreload: { polyfill: false }`. | R7.6 (rewritten), new R7.7 |
| 3 | Accepted: UTF-16 BOM (LE or BE) decoded as UTF-16, otherwise `TextDecoder("utf-8", { fatal: true })` with a `windows-1252` fallback; the NUL check runs on the decoded text. Component test with the UK Sample re-encoded as Windows-1252. | R3.8, new R3.10, R4.5, R10.2, R10.3 |
| 4 | Accepted: cells shaped like a date or an amount are never listed; when none is left, the message says no header row was found. Headerless case added to the component tests. | R4.6 (`"columns-unreadable"` row), R4.12 (defines "shaped like"), R10.3 |
| 5 | Both parts. (a) The message names which of date, description and amount is missing. (b) Parser amendment adds `posting date`, `paid out`, `paid in`, `money out`, `money in`; `transaction date` was already in `header-names.ts`, so it is not added. Includes unit tests and the note to update statement-parser R2.1/R2.4. | R3.2 (`"columns-unreadable"` row), new R3.9, R4.6, R10.2, R10.3, out-of-scope list in the Introduction, new Requirement 11 (11.1–11.3, 11.5, 11.6) |
| 6 | Accepted: `detectedCurrency`, `detectedDateFormat` and `detectedSignConvention` are carried in the `"results"` and `"no-subscriptions"` outcomes, and an assumed currency, date format or sign convention is shown as text. | Glossary "Assumed values", R3.2, new R5.1a, R10.3 |
| 7 | Option A: root `pretest` and `pretypecheck` scripts build `@zombills/core` first. R9.1 stays: public entry only, in tests too. | R9.1, new R9.2a |
| 8 | A currency group with no Counted subscription shows no total line, only the not-included note. Added to the component tests. | R5.7, R10.3 |
| 9 | Accepted: bounded generator (at most 10,000 subscriptions, `yearlyCostCents ≤ 999_999_9900 × 52`) and a `RangeError` on an unsafe sum. | R5.11, new R5.11a, R10.2 |
| 10 | Accepted: expected `us-signed.csv` rows in order (Adobe Creative Cloud, Riverside Gym Membership, Netflix, Spotify) and total `135564` / "$1,355.64", checked against `packages/core/src/detect/samples.test.ts` (65988 + 34800 + 21588 + 13188); Playwright `locale: "en-US"`, `timezoneId: "UTC"`. | R10.5 |
| 11 | Accepted: `maximumFractionDigits: 2` (and minimum 2) for currencies whose default is above 2; glossary cites parser R5.6; KWD example `formatMoney(1250, "KWD", "en-US")` = `"KWD 12.50"`, checked in Node. | Glossary "Minor units", R6.3, R6.7 |
| 12 | Amendment: the parser exports its two empty-input reason strings as named constants and the Analyzer matches on them. Same amendment requirement as 5b. | R3.2 (`"empty"` row), new R11.4, R11.6 |
| 13 | Accepted: with 0 failed rows, the message says the statement has no transaction rows. | R4.6 (`"no-transactions"` row) |
| 14 | Accepted: status text exactly `Reading <name>…`; one `requestAnimationFrame` then `setTimeout(0)` before calling the Analyzer; the component test asserts the working text appears before the outcome. | R3.8, R4.2, R10.3 |
| Follow-up (Chase Details column) | Added: when several header cells match `DESCRIPTION_HEADERS`, the name earliest in the list wins and the leftmost cell only breaks ties between equal names, so Chase US `Details,Posting Date,Description,…` maps description to `Description`. Statement-parser R2.2 text to be updated; existing parser tests still pass except any asserting leftmost choice between two different description names. Unit test for the Chase header. | New R11.7, R11.6 |
