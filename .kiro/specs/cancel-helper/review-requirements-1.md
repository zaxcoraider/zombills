# Review of `cancel-helper/requirements.md`

## Blockers

**1. Blocker: R5.4 and R6.2 use `URL`, which the core typecheck can't see**
- **Problem:** The validator has to use the WHATWG `URL` parser, but `packages/core` doesn't declare `URL` anywhere. `tsconfig.base.json` sets `"lib": ["ES2022"]` with no DOM, and `packages/core/tsconfig.json` sets `"types": []`. No core source file uses `URL` today; only tests do, and tests compile with `types: ["node"]`.
- **Failing example:** `new URL(entry.url)` in `packages/core/src/cancel/validate.ts` makes `npm run typecheck` and the core build fail with `Cannot find name 'URL'`.
- **Fix:** State the approach in R5.4. One option is a minimal ambient declaration in `cancel/` (`declare const URL: { new (s: string): { protocol: string; hostname: string; … } }`). The other is to move `validateCancelDatabase` into a test-only `test-*.ts` helper. Don't add `"DOM"` to `lib`: it would let `document` and `window` typecheck in core.

**2. Blocker: lone surrogates make `mailtoHref` throw (R3.2, R3.8, R11.1, R11.6)**
- **Problem:** The R3.2 cleaning rule only says not to split a surrogate pair. It never removes lone surrogates. `encodeURIComponent` throws `URIError` on a lone surrogate. R11.1 asks for arbitrary strings, so fast-check will produce one.
- **Failing example:** `mailtoHref(cancellationEmail({ serviceName: "\uD800", … }))` throws, so R11.6 fails.
- **Fix:** In R3.2, add: "replace every lone surrogate with U+FFFD before cleaning". `String.prototype.toWellFormed` does this on Node 20 and later. Also state that `mailtoHref` never throws.

**3. Blocker: R8.5 "names unique on the Page" contradicts the fixed link texts in R7.5 and R7.7**
- **Problem:** `Open in my email app`, `Apple subscriptions`, `Google Play subscriptions` and `Open the Netflix cancel page` contain no Display name. Any two Helper panels in the DOM therefore share names. That includes collapsed panels whose content stays mounted for `aria-controls`, and `querySelectorAll` in `test-a11y.ts` sees those too.
- **Failing example:** Bury Netflix and Spotify (both likely `appStoreMayApply: true`), then open both `How to cancel` panels: `Apple subscriptions` appears twice. In the graveyard-ui R6.8 case (US Netflix plus UK Netflix), `Open the Netflix cancel page` appears twice.
- **Fix:** Give every panel link an `aria-label` that contains its visible text plus "for <Display name>". For example: `Open in my email app for Netflix`, or `Apple subscriptions, for Netflix (opens in a new tab)`. Alternatively, render panel content only while it is expanded and allow one open panel at a time. Say which in R8.5.

## Major

**4. Major: the no-network scan reads string literals, so ordinary step text fails it (R4.3)**
- **Problem:** `findForbiddenReferences` and `findWordReferences` check string literals as well as identifiers (`test-no-network-scan.ts:45-55`). Step and `reason` strings in the data file get scanned for `window`, `document`, `navigator` and `console`.
- **Failing example:** A PlayStation Plus or Nintendo step such as `"On your console, open Settings."`, or `"Sign in in a browser window."`, fails the scan with `console` or `window` at the data file's line.
- **Fix:** Apply the extra `console`, `sessionStorage`, `indexedDB` and `document.cookie` check to identifiers and property accesses only (`findClockAndRandomReferences` already works this way). Or exclude `cancel-data.ts` from string-literal scanning and say so.

**5. Major: R1.4, R6.7, R6.8 and R6.11 make `lastChecked` attest a human check that a task cannot produce**
- **Problem:** The validator only checks the date's form. An agent running the tasks will fill in 59 URLs and today's date, so `lastChecked` stops meaning "a person opened it".
- **Failing example:** A task writes `netflix: { url: "https://www.netflix.com/cancelplan", lastChecked: "2026-11-20" }` without anyone opening the page. Every test passes.
- **Fix:** Add a criterion that `lastChecked` is set only in a task marked as a human step. Until then, entries carry a sentinel (for example `lastChecked: null` plus an `unverified` issue), and the data test fails while any entry is unverified.

**6. Major: R6.3 asks the validator to detect any public suffix, which can't be done without the Public Suffix List**
- **Problem:** "SHALL NOT be a public suffix" can't be tested without the PSL, and adding it is a new dependency (`tech.md`).
- **Failing example:** `providerDomains: ["co.jp"]` or `["github.dev"]` passes the deny list but is a public suffix or shared hosting domain.
- **Fix:** Change the wording to "SHALL NOT be a domain on the validator's deny list (at least …)" and drop the general public-suffix claim.

**7. Major: R7.1 and R7.4 copy is false for ended subscriptions**
- **Problem:** Graveyard-ui R9.6 keeps a Tombstone whose subscription is now `"ended"`. The stone line `Still feeding until you cancel.` and the panel line `Burying it here does not stop the payments.` then claim charges the statement shows have stopped (`spooky-design.md`: copy states facts only).
- **Failing example:** Bury Netflix, then load a later statement where Netflix is `status: "ended"`. The tombstone still says it is feeding.
- **Fix:** Either add `ended`, or a status the UI passes in, so the stone can show "It stopped charging on <date>." and the panel can be skipped. Or state the current behaviour as an accepted limitation in the Introduction.

**8. Major: R8.6 checks 390 px, but graveyard-ui requires no horizontal scroll at 320 px**
- **Problem:** Graveyard-ui R3.10 and R7.10, and `demo-path.spec.ts` step 9, require no horizontal scrolling at 320 px. R8.6 and R10.5 only check 390 px. Long hosts and the email body are the most likely cause of overflow at 320 px.
- **Failing example:** The panel fits at 390 px but `scrollWidth` is 336 at 320 px. That breaks graveyard-ui R7.10, and no test catches it, because demo-path step 9 never opens a panel.
- **Fix:** Use 320 px in R8.6 and R10.5, or check both widths.

**9. Major: the Copy button's accessible name doesn't contain its visible label (R7.7, R8.3)**
- **Problem:** WCAG 2.5.3 Label in Name requires the visible text to be part of the accessible name. `Copy email` is not a substring of `Copy cancellation email for Netflix`, and `Copied` isn't either.
- **Failing example:** A voice-control user says "click Copy email" and nothing matches.
- **Fix:** Use the name `Copy email for <Display name>`. For the 2-second state, change only the visible text and announce through the live region, or include "Copied" in the name.

**10. Major: the scope is large for the Dec 4 deadline (R6, R11.9, R11.10, R2 regional URLs)**
- **Problem:** The spec asks for 59 hand-checked entries with up to three regional URLs each, 15 validator rules with one fixture each, a generator of valid databases plus 11 kinds of edits, and an `anything()` totality PBT. Together these probably cost more than the UI itself.
- **Failing example:** R11.9 needs a generator of Known ids, domains and URLs that already satisfies every R6 rule. That is effectively a second validator.
- **Fix:**
  - Allow `regionalUrls` only where they're needed (`amazon-prime`, and a few others).
  - Replace R11.9 with the per-rule unit fixtures R10.1 already lists.
  - Keep R11.10 only for `entries` and `emailOnly` at the top level.

## Minor

**11. Minor: R8.1 and R8.2 put up to six links between the tombstone and Next**
- **Problem:** On the Burial stage, the panel comes before Next in tab order (`rising-view.tsx:196`). A keyboard user has to Tab past the cancel link, both store links, Copy and the email link to reach Next. That changes the one-question flow of graveyard-ui R14.2.
- **Fix:** State where Next sits relative to the panel: before it in the DOM, or with a skip link.

**12. Minor: R5.1 types `rule` as `CancelDataRule`, but it is never defined or exported (R1.1)**
- **Fix:** Define it as a union of the rule names listed in R6 and add it to the R1.1 export list.

**13. Minor: the Glossary points to terms graveyard-ui doesn't define**
- **Problem:** The Glossary says "Burial stage" and "Graveyard view" are "as defined in the graveyard-ui spec". Graveyard-ui defines "Burial sequence". The stage exists only in code (`burial-stage.tsx`).
- **Fix:** Define "Burial stage" here as the `[data-burial-stage]` container in `burial-stage.tsx`.

**14. Minor: the R3.10 Riverside example uses `$45.00`, but the US Sample charges `2900` ($29.00)**
- **Problem:** R7.10 then tests Riverside's email. An implementer copying R3.10 into the component test would assert the wrong amount.
- **Fix:** Use `$29.00`.

**15. Minor: R2.1 strips `www.` from `host`, but R11.7 requires `host` to be on the Provider domain list**
- **Failing example:** `providerDomains: ["www.netflix.com"]` with a URL on `www.netflix.com`: `host` becomes `netflix.com`, which isn't on the list, so the R11.7 PBT fails.
- **Fix:** In R6.3, forbid Provider domains that start with `www.`.

**16. Minor: R3.2 cleaning leaves format characters in the email**
- **Problem:** Bidi and format characters (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF) survive cleaning, so a statement memo can visually reorder the subject.
- **Fix:** Also replace the Unicode `Cf` category with a space, or remove it, and add those characters to the R11.4 checks.

**17. Minor: R4.7 doesn't say what the `mailto:` link sends where**
- **Problem:** The `mailto:` link passes the merchant and amount to whatever mail handler the browser has registered. That may be a webmail site (for example Gmail as the handler), so the data reaches a server when the user clicks. It is user-initiated, but `privacy.md` promises that nothing leaves the browser.
- **Fix:** Add a short hint under the link: `Opens your email app with this text filled in.`

**18. Minor: a second Copy may not be announced (R8.3)**
- **Problem:** The live region gets the same text again, so screen readers may stay silent.
- **Fix:** Clear the region before writing, or add the copy count.

**19. Minor: R11.2 is ill-defined in three cases**
- **Problem:** "Replace each occurrence of N in its template slot" is unclear when `N` is empty, when `N === A`, or when `N` appears in the template text (`N = "Please"`).
- **Fix:** Define the property positionally: build the expected body from the template, the cleaned values and the marker positions, then compare.

**20. Minor: the R6.8 clock check fails on the day a person records a check (local time vs UTC)**
- **Failing example:** In IST (UTC+5:30), someone checks a link at 01:00 on 2026-11-17 and writes `lastChecked: "2026-11-17"`. The UTC date is still 2026-11-16, so the test fails.
- **Fix:** Allow `lastChecked` up to UTC today + 1.

**21. Minor: R5.1 doesn't say what happens when `appStoreLinks` is omitted**
- **Fix:** Say whether app-store links are skipped or the frozen `APP_STORE_LINKS` is used, or make the argument required.

**22. Minor: R2.4 and R11.7 don't rule out prototype-key lookups**
- **Problem:** If the lookup uses a plain object, `getCancelHelp("constructor", "USD")` or `"__proto__"` can resolve to something other than email-only.
- **Fix:** Require a `Map` lookup and add those two strings as unit cases.

**23. Minor: the single EU region (R2.2) fits providers with per-country sites poorly**
- **Problem:** A French user paying in EUR is sent to `amazon.de`.
- **Fix:** State that the EU URL is set only when the page is shared EU-wide. Otherwise the default URL is used.

**24. Minor: R9.4 misses hand-built `AnswerRecord` literals**
- **Problem:** `tombstone.test.tsx:17` (`NETFLIX`), `test-fixtures.ts` and the graveyard arbitraries build `AnswerRecord` by hand. Adding a required `serviceId` breaks `npm run typecheck` in those files.
- **Fix:** List them in R9.4 and R10.3.

**Checklist items that don't apply:** item 8 (code batch), because this is a requirements review with no implemented code. Item 7 (traceability), because the spec has no `tasks.md` or `design.md` yet.

Verdict: approve after fixes

## Resolution

All 24 findings were accepted. "R" numbers refer to `requirements.md`.

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1 | One minimal ambient `URL` declaration in `packages/core/src/cancel` (constructor plus the string properties the validator reads). No DOM lib, no other global, no `URLSearchParams`. | R5.4 |
| 2 | Lone surrogates become U+FFFD before cleaning. `mailtoHref` never throws and repairs lone surrogates in hand-built emails. | R3.2, R3.8, R3.10 (new example row), R10.1, R11.1, R11.4, R11.6 |
| 3 | Every panel link and button gets an `aria-label` that starts with its exact visible text and ends with ` for <Display name>`. New-tab links keep a visually hidden `(opens in a new tab)`, attached with `aria-describedby` so the name still ends with the Display name. Uniqueness is checked with two panels mounted. | R7.5, R7.7, R8.5, R10.2 |
| 4 | The extra `console`, `sessionStorage`, `indexedDB` and `document.cookie` check reads identifiers and property accesses only. The shared `findForbiddenReferences` is unchanged and still reads strings, so the spec now says step and `reason` text must avoid its words (for example "browser tab", not "browser window"). | R4.3 |
| 5 | `lastChecked` is `string \| null`, with `null` meaning unverified, and agent tasks always write `null`. The panel hides `Link checked` when it is `null`. The new `unverified` rule fires only with `requireVerified: true`. The R5.5 data test runs without that option. The last task, a human or Claude Code step, opens the URLs, sets the dates and adds the `requireVerified: true` test. | Introduction, R1.2, R1.4, R2.1, R5.1, R5.5, R5.6 (new), R6.7, R6.8, R6.12 (new), R7.5, R10.1, R10.2 |
| 6 | Deny-list wording only. The general public-suffix claim is dropped, and other suffixes are left to the reviewer. | R6.3 |
| 7 | New Glossary term "Ended tombstone": a Current record whose subscription is a graveyard-ui Ended subscription (graveyard-ui R9.6). The UI computes it as `haunt.byId.get(record.id)?.status === "ended"` (`haunt-view.ts`) and passes it to `Tombstone` as a boolean. The stone then says `It has stopped charging.` and shows no `How to cancel` button and no Helper panel. The stage tombstone is never ended. | Glossary, R7.1, R7.3, R7.10, R10.2 |
| 8 | Check both 320 px and 390 px. | R8.6, R10.5 |
| 9 | Merged with #3. While the button shows `Copied`, its name is `Copied for <Display name>`; otherwise it is `Copy email for <Display name>`. Label in Name requires the visible word to be in the name, and this was the simplest option that meets it, so the visible `Copied` state stays. | R7.7, R8.3, R8.5 |
| 10 | `regionalUrls` is set only where the page really differs, usually `{}` (for example `amazon-prime`). The R11.9 generated-database property is dropped in favour of the per-rule fixtures in R10.1. The totality property (formerly R11.10, now R11.9) covers only the top-level `entries` and `emailOnly`. The old R11.11 is now R11.10. | Introduction, R1.2, R6.6, R10.1, R11.9, R11.10 |
| 11 | The panel stays between the tombstone and `Next` in DOM and tab order on purpose, with no skip link. A note in graveyard-ui R14.2 is required. | R8.2, R9.2 |
| 12 | `CancelDataRule` is defined as a union of the R6 rule names plus `unverified`, and exported. | R1.1, R5.1 |
| 13 | "Burial stage" is defined as the `[data-burial-stage]` container in `burial-stage.tsx`. "Graveyard view" now points to `graveyard-view.tsx` and graveyard-ui R7. | Glossary |
| 14 | Riverside's amount is `$29.00`, which matches `samples/us-signed.csv`. | R3.10, R7.10 |
| 15 | Provider domains must not start with `www.`. | R6.3 |
| 16 | Unicode `Cf` characters are replaced with a space during cleaning, and the property tests check for them. | R3.2, R11.1, R11.4 |
| 17 | Added the hint `Opens your email app with this text filled in.` under the email link. | Introduction, R4.7, R7.7, R10.2 |
| 18 | Clear the live region, then write the message in a later task. | R8.3, R10.2 |
| 19 | The R11.2 property is now positional: the expected output is built from template pieces and an independent reference cleaner. | R11.2 |
| 20 | `lastChecked` may be up to UTC today + 1. | R6.8 |
| 21 | The `appStoreLinks` argument is now required. | R5.1 |
| 22 | The lookup must use a `Map`. Added `"constructor"` and `"__proto__"` example rows and unit cases. | R2.4, R2.7, R10.1 |
| 23 | An `"EU"` URL is set only when the page is shared EU-wide; otherwise the default URL is used. | Glossary "Region", R2.2, R6.6 |
| 24 | The hand-built `AnswerRecord` literals are listed. `test-fixtures.ts` builds none today, so the list names the files that do: `tombstone.test.tsx`, `logic/graveyard.test.ts` and `logic/test-arbitraries.ts`, plus any other file a search finds. | R9.4, R10.3 |
