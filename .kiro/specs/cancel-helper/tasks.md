# Implementation Plan: cancel-helper

Tasks run in dependency order. Paths start with `packages/core/` or `apps/web/` unless they start with `.kiro/`; inside a core task, `src/cancel/` means `packages/core/src/cancel/`, and inside a web task, `src/` means `apps/web/src/`. Each task writes its code and its tests together. Property IDs (P1–P9) refer to "Correctness properties" in `design.md`, and every property test's name starts with its ID (e.g. `"P1: the email is the template filled with the cleaned name and amount"`).

The tasks are grouped into batches, in the order of design "Task order": data batch 1 comes before the lookup and property task, and data batch 4 (which writes `netflix`) comes before every test that reads the real Netflix entry.

Test policy:

- Each task runs the tests it names (with `npx vitest run <files>` in the owning workspace, or the Playwright command it names), plus `npm run typecheck` and `npm run lint` at the repo root. All of these must pass at the end of the task. The root `typecheck` builds `@zombills/core` first, so a web task that imports a new core export runs it before its web tests.
- The full suite (`npm test` at the repo root) is run once per batch, by the reviewer, at the batch's "done" line.
- No task may break an existing test. When a task changes an existing test, the task names it under "Existing tests"; no other existing test may change in that task. A task never needs a later task to make its own tests pass.

Each task is sized for one fresh agent run: at most two or three source files plus their tests.

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`, Req 4). `src/cancel` has no network, DOM, browser-global or storage access, no clock (`Date.now()`, `new Date()` with no arguments, `performance.now()`), no randomness and no `console` (Req 4.1). It keeps no mutable module-level state and never mutates its arguments (Req 4.2). The web app never requests, prefetches, preconnects to or embeds a cancel URL or App-store link (Req 4.6), and never writes the email text or `mailto:` href to storage, cookies, the URL or the console (Req 4.7). The `privacy-guard` hook, the `no-network` scans and the build-time CSP pass with no new exception (Req 10.6).
- No test, script, build step or CI job requests a cancel URL (Req 4.5). The data rules are checked only on the data in the repository.
- Every `lastChecked` a task agent writes is `null` (Req 1.4, 6.12). Only the last task, a human step, opens URLs and writes dates.
- `src/cancel` imports only `../detect/types.js` (the `Cadence` type). It never imports the normalizer; the Known service ids reach the validator as an argument, and tests read them from `KNOWN_SERVICES` (Glossary "Known service id").
- The only `new URL` call and its module-scoped `declare const URL` live in `src/cancel/url-parts.ts`. Do not add `"DOM"` to any core `lib`, a global `.d.ts`, or any other browser-global declaration (Req 5.4). Do not use `String.prototype.toWellFormed` (design "Design decisions").
- No string literal anywhere in a non-test file of `src/cancel` (steps, `reason`, URLs, messages) contains `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `document`, `window`, `navigator` or `localStorage` as a whole word, because the shared `findForbiddenReferences` scan reads string literals (Req 4.3). Write "browser tab", not "browser window".
- Money is integer minor units (`money.md`). Core never formats money; the web formats the email amount with `formatMoney` from `src/slice/logic/money.ts`, and no file divides an amount by 100 or calls `toFixed`.
- `apps/web` imports the Cancel module only from `@zombills/core`, never from `packages/core/src`, in tests too. The web calls only `getCancelHelp`, `cancellationEmail`, `mailtoHref`, `APP_STORE_LINKS` and `getKnownService`; no web code calls `validateCancelDatabase`.
- Files in `src/slice/logic/` are pure (no React, no DOM, no storage, no clock, no randomness, no logging); the existing purity lint covers them.
- All motion goes through Framer Motion, and every motion value lives in `src/slice/graveyard/motion.ts` (`tech.md`, Req 7.8, 8.7). No `@keyframes`, no new design token, no CSS file change.
- Component test files start with `// @vitest-environment jsdom`, set `MotionGlobalConfig.skipAnimations = true` in `beforeAll` (reset in `afterAll`), and spy on `console.error` and `console.warn`, failing on any call. Expected money text in component tests is built with `formatMoney(…)` in the default locale; exact `en-US` strings are pinned only in core and logic unit tests and in the E2E tests.
- Files are kebab-case, components PascalCase, constants `SCREAMING_SNAKE_CASE`; unit tests go in `*.test.ts(x)` and property tests in `*.property.test.ts` next to the source file (`structure.md`). Test helpers in `src/cancel` are named `test-*.ts`, so the build excludes them.
- TypeScript strict mode, with `exactOptionalPropertyTypes`. Any `any` needs a comment explaining why (`tech.md`). No new dependency.
- Do not commit.

---

## Batch 1: core functions without data (`packages/core/src/cancel/`)

Nothing in this batch reads `CANCEL_ENTRIES`, which does not exist yet. Generators go in `src/cancel/test-arbitraries.ts` and the P1–P3 oracle in `src/cancel/test-reference.ts`; only tests import them. Nothing is exported from the package root yet (task 8 adds the barrel), so no existing test changes.

- [ ] 1. Types and text cleaning (`cancel/types.ts`, `cancel/clean-text.ts`)
  - Create `types.ts` exactly as in design "Types and public API": `CancelRegion`, `CancelLinkKind`, `CancelEntry`, `EmailOnlyService`, the internal `AppStoreLink` and `AppStoreLinks`, `CancelHelp`, `EmailInput`, `CancellationEmail`, `CancelDataRule` (in the listed order, which is the validator's rule rank), `ValidateCancelOptions` and `CancelDataIssue`. It imports only `Cadence` from `../detect/types.js`.
  - Create `clean-text.ts` with `toWellFormedText` (a loop over code units that keeps pairs and turns each lone surrogate into U+FFFD) and `cleanField(value: unknown)` as in design "Cleaning": surrogate repair first, then one `SEPARATORS = /[\s\p{Cc}\p{Cf}\u2028\u2029]+/gu` replace with one space, `trim`, cut to 80 code points with `Array.from`, `trim` again. A non-string gives `""`.
  - Unit tests `clean-text.test.ts`: `toWellFormedText` on a pair, a lone high, a lone low, a reversed pair and `""`; `cleanField` on each Req 3.2 character class (whitespace, U+0000–U+001F, U+007F–U+009F, U+2028, U+2029, U+00AD, U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+FEFF) and on U+0600 and U+E0001; a mixed run such as `"\n\t "` and `"\u200B "` becomes one space; 80 and 81 code points; a cut that would split a pair; a cut that leaves a trailing space; `"Net\u200Bflix\uD800"` → `"Net flix\uFFFD"`; a number and `undefined` give `""`.
  - Existing tests: none change.
  - _Requirements: 1.2, 2.1, 3.1, 3.2, 5.1_

- [ ] 2. Email generator and `mailtoHref` (`cancel/email.ts`)
  - Create `email.ts` with `cancellationEmail` and `mailtoHref` as in design "Email template" and "`mailtoHref`". `cancellationEmail` reads exactly the five `EmailInput` properties of a non-null object (else `{}`), cleans name and amount with `cleanField`, accepts a currency only when it matches `/^[A-Z]{3}$/`, picks the period word with a `switch`, states a cadence only when `cadenceAssumed === false` and the cadence is valid, leaves out the amount line and its blank line when the cleaned amount is empty, and joins the Req 3.3 lines with `\n`. Values are inserted with `+`, never `String.prototype.replace`. `mailtoHref` repairs surrogates in `subject` and `body` with `toWellFormedText`, turns `\n` into `\r\n` in the body, and returns `"mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body)`, with no recipient.
  - Unit tests `email.test.ts`: every Req 3.10 row (subject and amount line), with the full Netflix body written out as the Req 3.3 text; the weekly, monthly and yearly lines; `cadenceAssumed: true` gives `My most recent charge was …`; an invalid cadence with `cadenceAssumed: false` gives the assumed line (Req 3.7); an invalid currency drops ` (C)`; an empty amount drops the line and its blank line; `[Your name]` twice and `[Your account email]` once; `$&` and `$1` in a name are copied as text; extra properties (`name`, `email`, `cardNumber`) are ignored; `mailtoHref` of the Netflix email equals a literal string; `mailtoHref({ subject: "\uD800", body: "a\nb" })` is `mailto:?subject=%EF%BF%BD&body=a%0D%0Ab`; a non-object input and non-string fields do not throw.
  - Existing tests: none change.
  - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.10, 4.1, 4.2, 10.1_

- [ ] 3. Email properties (`cancel/test-arbitraries.ts`, `cancel/test-reference.ts`, `cancel/email.property.test.ts`)
  - Tests only; fix any source bug they find in the file that owns it and name it in the task notes.
  - In `test-arbitraries.ts`, add `nastyStringArb`, `cadenceArb`, `currencyArb`, `emailInputArb` (with a branch where name and amount are equal and a branch where the name is `""`) and `emailInputWithExtrasArb`, as in design "Generators". Invalid cadences are typed through `unknown` with a comment.
  - In `test-reference.ts`, write `referenceClean(s)` from the requirement text as in design "Generators": a `for…of` walk by code point, U+D800–U+DFFF to U+FFFD, separator runs to one space (tested one code point at a time against `/\p{Cf}/u`, `/\p{Cc}/u`, `/\p{Zs}/u`, U+0009–U+000D, U+0085, U+2028, U+2029, U+FEFF), and the 80-code-point cut with a counter in the same loop; and `referenceEmail(input)`, which builds the expected subject and body by concatenating the written-out template pieces of Req 3.3 and 3.4 with `N`, `A` and `C` by position. It imports nothing from `src/cancel` apart from types.
  - Property tests in `email.property.test.ts`: **P1**, **P2**, **P3**, **P4** and **P5** (P5 with its second run on hand-built emails of `nastyStringArb` fields). Default 100 runs.
  - Existing tests: none change.
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.2, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [ ] 4. URL parts, URL rules and dates (`cancel/url-parts.ts`, `cancel/url-rules.ts`, `cancel/date-rules.ts`)
  - Create `url-parts.ts` with `UrlParts` and `parseUrl(text: unknown)` exactly as in design "`URL` declaration": the module-scoped `declare const URL: new (input: string) => UrlParts;`, the comment explaining it, a `typeof` guard and the one `try`/`catch` around `new URL`.
  - Create `url-rules.ts` with `TRACKING_PARAMS` (the Glossary names, lower case, as a `ReadonlySet`), `DENIED_DOMAINS` (at least the Req 6.3 list), `isOnDomain`, and the `checkUrl` and `checkDomains` helpers of design "URL checks" and "Rules per record" (`domain-form` per element: not a string, not `^[a-z0-9-]+(\.[a-z0-9-]+)+$`, an empty label, `www.` prefix, denied, duplicate). `checkUrl` returns at most one issue per rule for a field; an unparseable URL gives only `url-form`; the query name is percent-decoded in the second and last `try` of `src/cancel`; a fragment is not read.
  - Create `date-rules.ts` with `isCheckedDate` as in design "Dates": integer arithmetic on the digits, no `Date`, floor `"2025-01-01"`.
  - Unit tests: `url-parts.test.ts` (a valid `https` URL gives the seven fields; a non-string and `"not a url"` give `null`); `url-rules.test.ts` (`isOnDomain` examples including `notnetflix.com` and `help.netflix.com`; every name of `TRACKING_PARAMS`; `DENIED_DOMAINS` holds the Req 6.3 list; `checkUrl` on one case of each of its outcomes); `date-rules.test.ts` (leap years 2028, 2100 not leap, 2400; month and day bounds; `2026-02-29` and `2026-13-01` fail; `2028-02-29` passes; `2024-12-31` fails and `2025-01-01` passes; `"2026-1-01"` fails).
  - In `test-arbitraries.ts`, add `domainArb` and `hostArb` as in design "Generators". Property test `url-rules.property.test.ts`: **P9**, with its fixed cases.
  - Existing tests: none change.
  - _Requirements: 5.4, 6.2, 6.3, 6.4, 6.7, 6.10, 6.11, 11.1, 11.10_

- [ ] 5. Validator (`cancel/validate.ts`)
  - Create `validateCancelDatabase(entries, emailOnly, knownServiceIds, appStoreLinks, options?)` as in design "Validator": the four passes (Cancel entries, Email-only ids, App-store links, coverage), the `requireVerified` pass guarded against absent, `null` or non-object `options`, then one sort by `(list, index, field, sub-field, rule)` with the ranks of "Output order", returning issues without the private key. Use `checkUrl`, `checkDomains` and `isCheckedDate` from task 4. Every value is checked with `typeof`, `Array.isArray` and `Object.hasOwn` before it is read; the function never throws and never reads `APP_STORE_LINKS` itself.
  - Malformed values get the rules of design review decision 5 (non-string `serviceId` → `unknown-service`, non-array `steps` → `steps-count`, non-object `regionalUrls` → `region-key`, and so on).
  - Unit tests `validate.test.ts` on fixtures only: the valid fixture (two Known ids, one entry, one email-only id, both App-store links) gives `[]`; one failing fixture per Req 6 rule, each asserting exactly the expected `rule` and `field`, with every case listed in design "Example-based unit tests" for `validate.test.ts` (including each `url-form` case, `%75tm_x`, `UTM_Medium`, the fragment and `id=123` that pass, each `step-text` check, `region-key` `FR`, both `region-duplicate` cases, the `date-form` cases, each Req 6.9 `field-type` field, a `null` entry, `appStoreLinks` not an object, a missing `google` link); `requireVerified` on and off on a fixture with one `lastChecked: null` entry; one fixture with several issues across lists checks the Output order, including `steps[10]` after `steps[2]`.
  - Existing tests: none change.
  - _Requirements: 1.4, 5.1, 5.2, 5.3, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 6.10, 6.12, 10.1_

> **Batch 1 done:** reviewer runs root `npm test`, `npm run typecheck` and `npm run lint`, all green; P1–P5 and P9 pass; `src/cancel` holds the types, cleaning, email, URL, date and validator modules, and nothing is exported from `@zombills/core` yet.

---

## Batch 2: first data batch, lookup and the public API

Rules for every data task (tasks 6, 9, 10, 11 and 13), from design "Data file layout":

- Write the records of the task's batch only, in `serviceId` code-unit order, appended to the end of `CANCEL_ENTRIES` or `EMAIL_ONLY_SERVICE_IDS` through the freezing helpers `cancelEntry` and `emailOnly`, under a `// --- Batch N: first … last ---` comment. The ids are those of design "Batches"; take each `serviceId` and display name from `KNOWN_SERVICES`.
- Every record has `lastChecked: null`. Do not open, fetch or test any URL; write each from what you know of the provider's official cancel, manage-subscription or help page, on the provider's own domain. The human step (task 23) checks them.
- Each URL is in the exact form the WHATWG parser prints back (`href` equals the text): `https`, lower-case host, a trailing `/` after a bare host, no user info, no port, no Tracking parameter, and a query parameter only when the page needs it. Every URL's host is on the record's `providerDomains`; each domain is lower case, 2 or more labels, no `www.`, not on the deny list, listed once.
- `kind` says what the page is: `"cancel"`, `"manage"` or `"help"`. `regionalUrls` is `{}` unless the provider really uses a different page for that Region; an `"EU"` key only for a page shared EU-wide. No regional URL equals `url` or another regional URL.
- 1 to 3 steps, each one instruction starting with a verb, 3 to 120 characters, naming buttons and menu items as the provider labels them, ending with `.`, with no URL, no `www.`, no `<` or `>`, no `!`, no line break and no spooky wording (Req 1.5, 6.5). Example for `netflix`: `"Sign in and open Account."`, `"Choose Cancel Membership."`, `"Confirm with Finish Cancellation."`.
- `appStoreMayApply` is `true` when the provider sells the subscription inside its iOS or Android app.
- An id goes to `EMAIL_ONLY_SERVICE_IDS` only when no official page lets a signed-in user cancel or manage the subscription (for example, in person, by post or by phone only); being hard to find is not a reason (Req 1.4). Record the reason. `planet-fitness` is the likely candidate; few or none others are expected.
- No string in the file has one of the scan words of "Rules that apply to every task" as a whole word, URLs included; if the real page's URL has one, pick another official page.
- Set `WRITTEN_THROUGH` in `cancel-data.test.ts` to the batch's last id. The data test then expects exactly one `missing-service` issue for each Known id after that id, and nothing else.

- [ ] 6. Data batch 1 and the data test (`cancel/cancel-data.ts`)
  - Create `cancel-data.ts` with the shape of design "Shape of the file": the header comments (data only, Req 1.8; `lastChecked` null until the human step), the private helpers `cancelEntry`, `emailOnly` and `appStoreLink` that freeze every object, array and record they build, `APP_STORE_LINKS` (labels `Apple subscriptions` and `Google Play subscriptions`, Apple's and Google's own subscription management or help pages, with Apple's and Google's own domains), `CANCEL_ENTRIES` and `EMAIL_ONLY_SERVICE_IDS`.
  - Write data batch 1: `1password`, `adobe`, `amazon-music`, `amazon-prime`, `apple-music`, `apple-tv-plus`, `audible`, `calm`, `canva`, `chatgpt-plus`, `classpass`, `crunchyroll`. `amazon-prime` may take a `UK` regional URL with both `amazon.com` and `amazon.co.uk` in `providerDomains`, if the UK page really differs.
  - Unit tests `cancel-data.test.ts`: `WRITTEN_THROUGH = "crunchyroll"` and `pending(id)` as in design "Batches"; the data test calls `validateCancelDatabase(CANCEL_ENTRIES, EMAIL_ONLY_SERVICE_IDS, KNOWN_SERVICES.map((s) => s.serviceId), APP_STORE_LINKS)` with no options and expects exactly the `missing-service` issues of the pending ids, printing every issue's `message` on failure; every non-null `lastChecked` is at most the UTC date plus one day (the clock is read in this test file only, Req 6.8); a recursive `Object.isFrozen` walk over the three constants; both arrays sorted; the two App-store labels. `KNOWN_SERVICES` is imported from `../normalize/known-services.js` in the test only.
  - Existing tests: none change.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.12, 10.1_

- [ ] 7. Lookup and the data-reading properties (`cancel/lookup.ts`)
  - Create `lookup.ts` with `statementRegion` (exact `"USD"`, `"GBP"`, `"EUR"`, else `null`), the internal `lookupIn(entries)` that builds a `Map` once and is never written, `getCancelHelp = lookupIn(CANCEL_ENTRIES)`, and the private `hostOf` (host of the chosen URL via `parseUrl`, without a leading `www.`), as in design "Lookup". A `serviceId` that is not a string gives `{ kind: "email-only", serviceId: null }`. `lookupIn` is exported from the file for tests only; task 8 leaves it out of the barrel.
  - Unit tests `lookup.test.ts`: `statementRegion` for `USD`, `GBP`, `EUR`, `usd`, `" USD"`, `JPY`, `""`; the Req 2.7 `"email-only"` rows (`null`, `"Netflix"`, `"merchant:riverside-gym"`, `"constructor"`, `"__proto__"`) and `"toString"`, `"hasOwnProperty"`, `""` through `getCancelHelp`; `getCancelHelp(42 as unknown as string, "USD")` gives `serviceId: null`; the two `"netflix"` rows on `lookupIn` with a fixture `netflix` entry; region choice on `lookupIn` fixtures (a `UK` regional URL for `GBP`, the default for `EUR`, `USD` and `JPY`; no regional URLs gives the default everywhere); `host` drops `www.` and keeps other subdomains; `linkKind`, `steps`, `appStoreMayApply` and `lastChecked` copied from the fixture. No unit test pins a fact about the real data.
  - In `test-arbitraries.ts`, add `serviceIdArb` as in design "Generators". Property tests `lookup.property.test.ts`: **P6** and **P7** on the entries written so far (P7's `fc.constantFrom(...CANCEL_ENTRIES)` needs the non-empty array of task 6). Property test `validate.property.test.ts`: **P8**, with `fc.anything()` in place of `entries` and, separately, `emailOnly`, the other arguments real.
  - Existing tests: none change.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 4.2, 5.2, 5.3, 10.1, 11.1, 11.7, 11.8, 11.9_

- [ ] 8. Public API and the static scan (`cancel/index.ts`, `src/index.ts`, `src/test-no-network-scan.ts`)
  - Create `cancel/index.ts` exactly as in design "`index.ts`" (the three constants, the five functions, the ten types; not `lookupIn`, `AppStoreLink`, `AppStoreLinks` or any internal helper), and add `export * from "./cancel/index.js";` to `packages/core/src/index.ts` after the classifier line.
  - Add `findCodeReferences(source, file, words, accesses)` to `src/test-no-network-scan.ts` as in design "Privacy and environment": identifiers and `object.property` accesses only, never string literals, templates, regular expressions or comments; same `Violation` shape with file and line. The existing exports stay unchanged.
  - Unit test `cancel/index.test.ts`: `import * as core from "../index.js"`; each of the eight value names is present with the expected `typeof`; the test imports the ten type names from `../index.js` so `npm run typecheck` covers them.
  - Unit test `cancel/no-network.test.ts`: scans every non-test `.ts` file under `src/cancel` with `sourceFilesUnder`, `findForbiddenReferences` and `findClockAndRandomReferences` unchanged, and with `findCodeReferences(…, ["console", "sessionStorage", "indexedDB"], [["document", "cookie"]])`; asserts the file list is non-empty and includes `cancel-data.ts` and `url-parts.ts`; fails naming file, line and API. It also checks the helper: `console.log(x)` and `document.cookie` are reported with file and line; `"On your console, open Settings."` and a comment mentioning `console` are not.
  - Existing tests: none change (`test-no-network-scan.ts` gains an export; its existing callers in the classifier and other modules keep passing).
  - _Requirements: 1.1, 1.8, 4.1, 4.3_

> **Batch 2 done:** reviewer runs root `npm test`, `npm run typecheck` and `npm run lint`, all green; P6–P8 pass on batch 1 data; `@zombills/core` exports the Cancel module; the data test accepts only the `missing-service` issues after `crunchyroll`.

---

## Batch 3: remaining data and the Node checks

Each data task follows "Rules for every data task" in Batch 2 and changes only `cancel-data.ts` and the `WRITTEN_THROUGH` line of `cancel-data.test.ts`. The data test, P6, P7 and P8 run on the data written so far after every task.

- [ ] 9. Data batch 2 (`cancel/cancel-data.ts`)
  - Write `dazn`, `deezer`, `deliveroo-plus`, `discovery-plus`, `disney-plus`, `doordash-dashpass`, `dropbox`, `duolingo`, `ea-play`, `espn-plus`, `expressvpn`, `google-one`, all `lastChecked: null`.
  - Set `WRITTEN_THROUGH = "google-one"`.
  - Run `cancel-data.test.ts`, `lookup.property.test.ts`, `validate.property.test.ts` and `no-network.test.ts`.
  - Existing tests: `cancel-data.test.ts` (`WRITTEN_THROUGH` only).
  - _Requirements: 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.12_

- [ ] 10. Data batch 3 (`cancel/cancel-data.ts`)
  - Write `grammarly`, `grubhub-plus`, `headspace`, `hellofresh`, `hulu`, `icloud`, `instacart-plus`, `kindle-unlimited`, `linkedin-premium`, `max`, `medium`, `microsoft-365`, all `lastChecked: null`.
  - Set `WRITTEN_THROUGH = "microsoft-365"`.
  - Run `cancel-data.test.ts`, `lookup.property.test.ts`, `validate.property.test.ts` and `no-network.test.ts`.
  - Existing tests: `cancel-data.test.ts` (`WRITTEN_THROUGH` only).
  - _Requirements: 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.12_

- [ ] 11. Data batch 4, with `netflix` (`cancel/cancel-data.ts`)
  - Write `netflix`, `new-york-times`, `nintendo-switch-online`, `nordvpn`, `pandora`, `paramount-plus`, `peacock`, `peloton`, `planet-fitness`, `playstation-plus`, `siriusxm`, `sling-tv`, all `lastChecked: null`. Decide for `planet-fitness` between a Cancel entry and an Email-only id by Req 1.4 and record the reason if it is email-only.
  - The `netflix` entry has `netflix.com` in `providerDomains` and the steps of Req 1.5 unless the provider's labels differ; later tasks read it.
  - Set `WRITTEN_THROUGH = "sling-tv"`.
  - Run `cancel-data.test.ts`, `lookup.property.test.ts`, `validate.property.test.ts` and `no-network.test.ts`.
  - Existing tests: `cancel-data.test.ts` (`WRITTEN_THROUGH` only).
  - _Requirements: 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.12_

- [ ] 12. Node environment and build checks (`cancel/node-env.test.ts`, `src/build.test.ts`)
  - Tests only; needs the `netflix` entry of task 11.
  - New `node-env.test.ts`, like `classify/node-env.test.ts`: imports every exported function from `../index.js` under Vitest's Node environment, asserts the same absent browser globals (Node's built-in `navigator` allowed), and calls each once: `getCancelHelp("netflix", "USD")` gives `kind: "link"`, `cancellationEmail` of the Req 3.10 Netflix row, `mailtoHref` of the result, `statementRegion("GBP")`, and `validateCancelDatabase` on the real data (proving the platform `URL` works without a polyfill).
  - In `build.test.ts`, add one case that imports the built `dist/index.js` in a fresh Node process and prints `getCancelHelp("netflix", "USD").kind`, expecting `link`, so a missing `.js` extension or barrel line fails.
  - Existing tests: `packages/core/src/build.test.ts` (one new case; existing cases unchanged).
  - _Requirements: 1.1, 4.4, 4.5_

- [ ] 13. Data batch 5 and the final data test (`cancel/cancel-data.ts`)
  - Write `spotify`, `strava`, `the-economist`, `the-guardian`, `tidal`, `uber-one`, `wall-street-journal`, `washington-post`, `xbox-game-pass`, `youtube-music`, `youtube-premium`, all `lastChecked: null`.
  - In `cancel-data.test.ts`, delete `WRITTEN_THROUGH`, `pending` and the filter, so the data test is the Req 5.5 test as written: the result must be `[]`, and the failure prints every issue's `message`. Check that the 59 Known ids now each appear exactly once across the two lists.
  - Run `cancel-data.test.ts`, `lookup.property.test.ts`, `validate.property.test.ts`, `node-env.test.ts` and `no-network.test.ts`.
  - Existing tests: `cancel-data.test.ts` (gate removed).
  - _Requirements: 1.3, 1.4, 1.5, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.11, 6.12_

> **Batch 3 done:** reviewer runs root `npm test`, `npm run typecheck` and `npm run lint`, all green; `validateCancelDatabase` on the real data returns `[]`; every `lastChecked` is `null`; the reviewer reads every URL and Provider domain in the `cancel-data.ts` diff (Req 6.11).

---

## Batch 4: Answer record amendment, Helper panel and wiring (`apps/web/`)

Tasks 14–17 and 19 test their components with fixtures or with `vi.mock("@zombills/core")` and read no real data, except where a task says otherwise. Task 18 uses the real `us-signed.csv` Sample and the real Netflix entry, which exists since task 11.

- [ ] 14. Amendment to graveyard-ui: `serviceId` on the Answer record (`logic/graveyard.ts`, `logic/test-arbitraries.ts`, `.kiro/specs/graveyard-ui/requirements.md`)
  - In `graveyard.ts`, add `readonly serviceId: string | null` to `AnswerRecord` (after `merchant`, with the TSDoc of design "Amendment to graveyard-ui"), and have `answerRecordFor` copy `subscription.serviceId`; its TSDoc says "the nine fields". Nothing else in the module changes: `refreshGraveyard` already rebuilds Current records through `answerRecordFor`, and `id`, `displayNames`, `savingsTotals`, `stillDraining` and the record order do not read `serviceId`.
  - In `test-arbitraries.ts`, `answerRecordArb` gains `serviceId: fc.option(fc.constantFrom("netflix", "spotify", "amazon-prime", "constructor", "merchant:x"), { nil: null })`; `subscriptionArb` gains a `serviceId: fc.option(fc.constantFrom("netflix", "spotify", "amazon-prime"), { nil: null })` field mapped to `v.source === "known" ? v.serviceId : null`, replacing the hard-coded `null`.
  - Add `serviceId` to every hand-built `AnswerRecord` literal, as in design "Hand-built records that gain `serviceId`": `tombstone.test.tsx` (`NETFLIX` `"netflix"`, `GUESSED` `"amazon-prime"`), `graveyard.test.ts` (the Subscription's `serviceId` in expected records; `null` in the local `record(…)` builder), `graveyard.property.test.ts` (the P3 overflow record, `null`). Rerun a search for `AnswerRecord` and `yearlySavingCents:` in `apps/web/src` and add `serviceId` to any other literal it finds.
  - Tests: P4 in `graveyard.property.test.ts` also checks that every record's `serviceId` equals its subscription's, after recording and after a refresh; `graveyard.test.ts` gains one case: a record built from a subscription with `serviceId: "netflix"` has `"netflix"`, and refreshing it from a subscription with the same id and `serviceId: null` gives `null`. The existing "eight keys" case becomes nine keys. Run `graveyard.test.ts`, `graveyard.property.test.ts`, `tombstone.test.tsx`, `haunt-view.test.ts` and `page-state.property.test.ts`.
  - In `.kiro/specs/graveyard-ui/requirements.md`, add the four notes of design "Requirement notes in `graveyard-ui/requirements.md`", each naming cancel-helper: Glossary "Answer record" (also holds `serviceId`), Req 9.5 (a refresh also copies `serviceId`), Req 5.7 (the tombstone's last line is now cancel-helper Req 7.1), Req 14.2 (the Helper panel sits between the stage tombstone and `Next` in DOM and tab order on purpose, cancel-helper Req 8.2). Change nothing else in that file, and do not change the graveyard-ui `design.md` or `tasks.md`.
  - Existing tests: `logic/graveyard.test.ts`, `logic/graveyard.property.test.ts`, `logic/test-arbitraries.ts`, `graveyard/tombstone.test.tsx` (`serviceId` on the two records only).
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.3_

- [ ] 15. Panel text (`logic/cancel-text.ts`)
  - Create `cancel-text.ts` with the signatures and constants of design "Panel text": `knownNameFor` (via `getKnownService`), `emailInputFor` (Known display name or `merchant`; `formatMoney(currentAmountCents, currency, locale)` with no locale by default; `currency`, `cadence` and `cadenceAssumed` from the record; never the Display name), `copyTextOf` (`subject + "\n\n" + body`), `cancelLinkText` (a `switch` on `linkKind` for `cancel page`, `manage page`, `help page`, then ` (<host>)`), `withFor`, `checkedLine` (the `display-date.ts` digit pattern, `Date.UTC`, `Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })`; `null` for `null` or malformed input; no `Date` object), `copiedNotice`, `panelLine`, and `PANEL_HEADING`, `APP_STORE_NOTE`, `LINK_INTRO`, `EMAIL_ONLY_INTRO`, `BRACKETS_NOTE`, `MAILTO_HINT`, `NEW_TAB_TEXT`, `COPY_FAILED_NOTICE` with the exact Req 7 and 8 text.
  - Unit tests `cancel-text.test.ts` (node): `emailInputFor` for a Known record (`"Netflix"`), a generic record (`"Riverside Gym Membership"`) and a record with an unknown id (its merchant); a Display name with ` (2)` or the long form never appears in the input; the Netflix email built from it has the amount line `I am currently charged $17.99 (USD) every month.` in `en-US`; `cancelLinkText` for the three kinds; `withFor`; `checkedLine("2026-11-17", "en-US")` is `Link checked November 2026.`, and `null` for `null` and `"2026-13-01"`; `copiedNotice("Netflix")` is `Email for Netflix copied.`; `copyTextOf`; `panelLine("Netflix")`.
  - Existing tests: none change.
  - _Requirements: 3.9, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8.3, 8.4, 8.5_

- [ ] 16. Stone line and panel motion values (`graveyard/tombstone.tsx`, `graveyard/motion.ts`)
  - In `tombstone.tsx`, `TombstoneProps` gains `ended?: boolean` (default `false`). The paragraph that held `Cancel it with the provider to stop the charges.` keeps its classes and reads `It has stopped charging.` when `ended`, else `Still feeding until you cancel.`. Nothing else on the stone changes.
  - In `motion.ts`, add `helperPanelMotion(reduced)` (opacity 0→1 and `y` 6→0 over 0.2 s; opacity only over `REDUCED_FADE` when reduced), `helperPanelVariants(reduced)` (`collapsed` opacity 0, `shown` opacity 1, with the same timings) and `COPY_LABEL_FADE` (opacity only, 0.15 s).
  - Unit tests: `tombstone.test.tsx`, the case "shows the cancel line and never says 'cancelled'" now expects `Still feeding until you cancel.` by default, `It has stopped charging.` with `ended`, and no `Cancel it with the provider to stop the charges.` in either; `motion.test.ts` adds: `helperPanelMotion(true)`, `helperPanelVariants(true)` and `COPY_LABEL_FADE` animate only `opacity` with `duration ≤ 0.15`; `helperPanelMotion(false)` uses `y` 6 and 0.2 s; none repeats.
  - Existing tests: `graveyard/tombstone.test.tsx` (the cancel-line case), `graveyard/motion.test.ts` (new cases only).
  - _Requirements: 7.1, 7.8, 8.7, 10.3_

- [ ] 17. Helper panel and the copy flow (`graveyard/cancel-helper.tsx`, `graveyard/use-copy-email.ts`, `graveyard/use-announce.ts`)
  - Create `use-announce.ts` with `AnnounceValue`, `AnnounceContext` (default `announce` does nothing) and `useAnnounce()`, as in design "Copy flow".
  - Create `use-copy-email.ts` with `COPIED_MS = 2000` and `useCopyEmail(text, displayName, emailRef)` as in design "Copy flow": a missing `navigator.clipboard` or `writeText` that is not a function, throws or rejects selects the email text with `getSelection().selectAllChildren` (wrapped so a missing selection API is ignored) and announces `COPY_FAILED_NOTICE`; success sets `copied` for `COPIED_MS` (restarted on a second Copy) and announces `copiedNotice(displayName)`. Neither branch calls `focus()`, throws or logs. The timer and an unmounted flag are cleared in the effect cleanup.
  - Create `CancelHelper({ record, displayName, reduceMotion })` with the structure of design "Helper panel": `section aria-labelledby`, `h3` `Seal the grave` plus an `sr-only` `: <displayName>`, `panelLine`, one `sr-only` `(opens in a new tab)` span per panel; for `"link"`: the cancel link (`href` = `url`, `target="_blank"`, `rel="noopener noreferrer"`, `aria-describedby` the new-tab span, `aria-label` = `withFor(text, displayName)`, the Known display name or `record.merchant` in the text), the steps in an `ol`, the store note and both `APP_STORE_LINKS` links when `appStoreMayApply`, the `checkedLine` when not `null`, `LINK_INTRO`; for `"email-only"`: `EMAIL_ONLY_INTRO`; then `BRACKETS_NOTE`, the `[data-email-text]` `div` (`whitespace-pre-wrap select-text`, subject in `font-semibold`, `textContent` exactly `copyTextOf(email)`), the Copy button (visible `Copy email` / `Copied` in a keyed `motion.span` with `COPY_LABEL_FADE`, `aria-label` following it), the `Open in my email app` link (`href` = `mailtoHref(email)`, no `target`) and `MAILTO_HINT`. Every link and button has `inline-flex min-h-11 min-w-11 items-center`; external links are underlined; the section sets `[overflow-wrap:anywhere]`; no positive `tabindex`, no logo, no icon. It reads only the record and the Cancel module.
  - Unit tests `cancel-helper.test.tsx` (jsdom): `vi.mock("@zombills/core")` keeps the real module through `vi.importActual` and replaces only `getCancelHelp` with fixture `CancelHelp` values, as in design "Component tests". Cover every case listed there for `cancel-helper.test.tsx`: region name `Seal the grave: <d>`, the line, link text and fixture `href`, `target`, `rel` and `aria-describedby` on every external link, steps in an `ol`, the store note and both store links, no `Link checked` line for `lastChecked: null` and the line for the dated copy, the intros, the email text, the bracket note, `MAILTO_HINT`; the email-only panel for a generic record; every link and button name starts with its visible text and ends with ` for <d>`; Tab order heading line → cancel link → store links → Copy → email-app link and no positive `tabindex`; Copy with a mocked `writeText` (called once with `copyTextOf(email)`, `Copied` and `Copied for <d>`, back after `COPIED_MS` with fake timers and `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, focus kept); a rejecting mock and a missing `navigator.clipboard` select exactly the email text; a test `AnnounceContext.Provider` records `copiedNotice(d)` or `COPY_FAILED_NOTICE`; unmounting while `writeText` is pending writes no state and logs nothing.
  - Existing tests: none change.
  - _Requirements: 2.6, 4.6, 4.7, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8.1, 8.3, 8.4, 8.5, 8.6, 8.8, 10.2_

- [ ] 18. Panel on the Burial stage and the live region (`graveyard/burial-stage.tsx`, `slice-page.tsx`)
  - In `burial-stage.tsx`, when `stage.kind === "buried"` and `record !== null`, render `CancelHelper` in a `motion.div className="mt-6 flex justify-center px-3"` with `helperPanelMotion(reduceMotion)`, after the clipped `relative isolate overflow-clip` box and inside the `[data-burial-stage]` container, as in design "Burial stage". Focus still goes to the tombstone; the panel takes none.
  - In `slice-page.tsx`, add the `notice` state, the sequence ref, the `announce(text)` function (clear to `""`, then write in `nextFrame()` unless a newer announce or sentence came first), the effect that hands the region back only when the string `announcement(model)` changes, and `AnnounceContext.Provider` around `main` next to `FocusRequestContext.Provider`; the `role="status"` node renders `notice ?? announcement(model)`, as in design "Copy flow".
  - Tests in `graveyard-flow.test.tsx` (jsdom, `<App />`, `us-signed.csv` Sample, real Netflix data): the stage tombstone shows `Still feeding until you cancel.` and not `Cancel it with the provider to stop the charges.`; burying Netflix shows the Netflix panel of Req 7.10 (link text `Open the Netflix … page (<host>)`, an `https` `href` whose host is on the Netflix entry's `providerDomains`, the Netflix steps, `target="_blank"` and `rel="noopener noreferrer"` on every external link, subject `Please cancel my Netflix subscription`, the amount line with `formatMoney(1799, "USD")`) below the tombstone and before `Next` in DOM order; focus lands on the tombstone, and Tab from it reaches the panel's controls before `Next`; burying Riverside Gym Membership shows `No cancel page on file. Send them this instead:` and an email naming `Riverside Gym Membership` with `formatMoney(2900, "USD")`; after Copy (mocked `writeText`) the live region reads `Email for Netflix copied.`; a second Copy empties the region first and rewrites it after the next frame (`findByText`, real timers); a rejecting mock and a missing `navigator.clipboard` give `COPY_FAILED_NOTICE` with no console output; a model change that keeps `announcement(model)` leaves the Copy notice in place; the next card's sentence replaces it.
  - Existing tests: `graveyard-flow.test.tsx` gains cases; if an existing assertion expects Tab to go from the stage tombstone straight to `Next`, change it to pass through the panel (Req 8.2) and name it in the task notes. `announce.test.ts` and `slice-page.test.tsx` stay unchanged.
  - _Requirements: 2.6, 4.6, 4.7, 7.1, 7.2, 7.5, 7.6, 7.7, 7.10, 8.2, 8.3, 8.4, 10.2_

- [ ] 19. `How to cancel` in the Graveyard view and unique names (`graveyard/graveyard-view.tsx`, `graveyard/test-a11y.ts`)
  - In `graveyard-view.tsx`, compute `ended = haunt.byId.get(record.id)?.status === "ended"` per tombstone and pass it to `Tombstone`. `TombstoneActions` renders a `flex flex-wrap justify-center gap-3` row with `Unbury` (unchanged) and, when not `ended`, `HelperDisclosure`: a native `button` `How to cancel` with `aria-expanded`, `aria-controls` (from `useId`) and `aria-label="How to cancel <name>"`, and an always-mounted `motion.div` with `hidden={!open}`, `initial={false}` and `helperPanelVariants(reduceMotion)`, holding `CancelHelper`, as in design "Graveyard view". An Ended tombstone has neither.
  - In `test-a11y.ts`, `expectUniqueButtonNames` queries `button, a[href]` with the same `aria-label`-then-text rule; it keeps its name.
  - Unit tests in `graveyard-view.test.tsx`: `How to cancel <name>` toggles `aria-expanded` with click, Enter and Space, keeps focus, and its `aria-controls` names the panel; the panel starts collapsed and `hidden`; an Ended tombstone (an outcome where the buried Netflix has `status: "ended"`) shows `It has stopped charging.`, no `Still feeding until you cancel.` and no `How to cancel Netflix`; two tombstones with both panels mounted pass `expectUniqueButtonNames`, and each panel's names start with their visible text and end with ` for <Display name>`.
  - `graveyard-flow.reduced.test.tsx`: with reduced motion, the panel's mount and the disclosure use only opacity with a duration of at most 0.15 s, asserted on the `motion.ts` values as the existing reduced tests do.
  - Run `graveyard-view.test.tsx`, `graveyard-flow.test.tsx`, `graveyard-flow.reduced.test.tsx` and `cancel-helper.test.tsx`.
  - Existing tests: `graveyard/test-a11y.ts` (also checks links); `graveyard-view.test.tsx` and `graveyard-flow.reduced.test.tsx` (new cases only). The existing `expectUniqueButtonNames` callers in `graveyard-view.test.tsx` and `graveyard-flow.test.tsx` must pass unchanged; if one fails because two links share a name, fix the source, not the test.
  - _Requirements: 7.1, 7.3, 7.10, 8.5, 8.7, 10.2_

> **Batch 4 done:** reviewer runs root `npm test`, `npm run typecheck` and `npm run lint`, all green; burying shows the Helper panel under the stage tombstone; every tombstone in the Graveyard view that is not ended has `How to cancel`.

---

## Batch 5: E2E, checkpoint and the human verification step

Tasks 20 and 21 read the real Netflix entry in a real browser. Neither clicks a cancel link, an App-store link or the `mailto:` link.

- [ ] 20. E2E demo path (`e2e/demo-path.spec.ts`)
  - Keep every graveyard-ui Req 16.4 step and check, the `locale: "en-US"` and `timezoneId: "UTC"` settings, and the request check that fails on any request to a host other than the Page's origin.
  - After the Netflix tombstone appears, add: the Helper panel `Seal the grave: Netflix` is visible; its cancel link has an `https` `href` whose host is on the Netflix entry's `providerDomains` (read from `CANCEL_ENTRIES` imported from `@zombills/core` in the test) and `rel="noopener noreferrer"` and `target="_blank"`; `Open in my email app` has an `href` starting `mailto:?subject=Please%20cancel%20my%20Netflix%20subscription`; the email text has `I am currently charged $17.99 (USD) every month.`; the hint `Opens your email app with this text filled in.` is shown. The existing storage, cookie and URL checks run after the panel is shown, so they also cover the email text.
  - Check: `npm run test:e2e --workspace @zombills/web` passes; the root `npm test` runs no Playwright file.
  - Existing tests: `e2e/demo-path.spec.ts` (new checks after the Netflix tombstone; existing steps unchanged).
  - _Requirements: 4.6, 4.7, 7.10, 10.4_

- [ ] 21. E2E layout of the panel (`e2e/layout.spec.ts`)
  - Add a test at 320 × 568 and 390 × 844, and at 390 × 844 with `document.documentElement.style.fontSize = "200%"`: choose the US Sample, bury Netflix, wait for the Helper panel, then assert `document.documentElement.scrollWidth <= innerWidth`, that every link and button in the panel has a bounding box of at least 44 × 44 CSS px, and that the panel's box does not overlap the stage tombstone's stone box or the Burial mound.
  - Check: `npm run test:e2e --workspace @zombills/web` passes.
  - Existing tests: `e2e/layout.spec.ts` (new test only; the graveyard-ui layout cases unchanged).
  - _Requirements: 7.2, 8.6, 10.5_

> **Batch 5 (tasks 20–21) done:** reviewer runs root `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and `npm run test:e2e --workspace @zombills/web`, all green.

- [ ] 22. Checkpoint: full verification and traceability review
  - Run from the repo root, on a clean core build: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; then `npm run test:e2e --workspace @zombills/web`. All must pass.
  - Searches that must find nothing: in non-test files of `packages/core/src/cancel`, `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `console.`, `Date.now`, `new Date()`, `performance.now`, `Math.random`, `randomUUID`, `toWellFormed(`, an import other than `../detect/types.js` and sibling files, a `.d.ts` file, and a `lastChecked` with a date; in non-test files of `apps/web/src`, `rel="prefetch"`, `preconnect`, `dns-prefetch`, `<iframe`, `<img`, `favicon`, a `target="_blank"` link without `rel="noopener noreferrer"`, `validateCancelDatabase`, an import from `packages/core/src`, `/ 100` and `toFixed`. `"DOM"` is in no core `lib`. Search `dist` for any host other than the page's own, apart from the cancel and App-store URLs as plain `href` text (Req 4.6).
  - Check that the `privacy-guard` hook, the `no-network` scans and the CSP of `csp-plugin.ts` pass with no new exception (Req 10.6); that no test, script or CI file requests a cancel URL (Req 4.5); and that every `lastChecked` in `cancel-data.ts` is still `null`.
  - Traceability: list every acceptance criterion in `requirements.md` (1.1–1.8, 2.1–2.7, 3.1–3.10, 4.1–4.7, 5.1–5.6, 6.1–6.12, 7.1–7.10, 8.1–8.8, 9.1–9.4, 10.1–10.6, 11.1–11.10) and confirm that each one is named in the `_Requirements:_` line of at least one task in this file and in the table below. Then walk the table: each criterion's named test exists and passes, or, for a documentation or review criterion, the text or check is in place. Criteria 5.6 (the `requireVerified: true` test on real data) and 6.12 (dates) are completed by task 23.
  - Report any gap as a finding instead of fixing it here, unless the fix is a one-line test or text change.
  - _Requirements: all; in particular 4.1, 4.5, 4.6, 4.7, 6.11, 10.6_

- [ ] 23. Verify every link by hand and record the dates (human step — Claude Code, not a Kiro task agent)
  - Done by a person, or by Claude Code driving a real browser. A Kiro task agent never runs this task and never writes a date (Req 1.4, 6.12).
  - Open every `url` and every `regionalUrls` value in `CANCEL_ENTRIES`, and both `APP_STORE_LINKS` URLs. For each, confirm that the page is the provider's own cancel, manage-subscription or help page on a domain the provider or its parent company owns, that `kind` says what the page is, that the steps match the page's current labels (Req 1.5), that `appStoreMayApply` is right, and that each `providerDomains` entry really belongs to the provider (Req 6.11). For each Email-only id, confirm that no official page lets a signed-in user cancel or manage the subscription, or move it to `CANCEL_ENTRIES` (Req 1.4).
  - Fix any entry that is wrong, keeping every rule of Req 6 (the data test of Req 5.5 must still return `[]`).
  - Set each record's `lastChecked` to the `yyyy-mm-dd` date its URLs were opened (the local date of the check is allowed, Req 6.8), for Cancel entries and Email-only ids alike.
  - In `cancel-data.test.ts`, add the second data test of Req 5.6: `validateCancelDatabase(CANCEL_ENTRIES, EMAIL_ONLY_SERVICE_IDS, KNOWN_SERVICES.map((s) => s.serviceId), APP_STORE_LINKS, { requireVerified: true })` must return `[]`, printing every issue's `message` on failure.
  - Check: root `npm test`, `npm run typecheck`, `npm run lint` and `npm run test:e2e --workspace @zombills/web` pass; the Helper panel for Netflix now shows `Link checked <Month yyyy>.`. Do not commit.
  - Existing tests: `cancel-data.test.ts` (the `requireVerified: true` test added).
  - _Requirements: 1.4, 1.5, 5.6, 6.8, 6.11, 6.12_

### Traceability

"GF" is `apps/web/src/slice/graveyard-flow.test.tsx`; "CH" is `cancel-helper.test.tsx`; "GV" is `graveyard-view.test.tsx`. Core test files are in `packages/core/src/cancel/`.

| Req | Covered by | Task |
| --- | --- | --- |
| 1.1 | `index.test.ts`; `build.test.ts` (dist case); `node-env.test.ts` | 8, 12 |
| 1.2 | `types.ts` under typecheck; `cancel-data.test.ts` (data test) | 1, 6 |
| 1.3 | `cancel-data.test.ts` (sorted; `unsorted` rule) | 6, 9, 10, 11, 13 |
| 1.4 | `validate.test.ts` (coverage rules); `cancel-data.test.ts`; human check of Email-only ids | 5, 6, 9, 10, 11, 13, 23 |
| 1.5 | `validate.test.ts` (`step-text`); data tasks; human check of steps | 6, 9, 10, 11, 13, 23 |
| 1.6 | `cancel-data.test.ts` (labels; data test on App-store links) | 6 |
| 1.7 | `cancel-data.test.ts` (recursive `Object.isFrozen`) | 6 |
| 1.8 | `cancel-data.ts` header; `no-network.test.ts` | 6, 8 |
| 2.1 | `types.ts`; `lookup.test.ts`; P6 | 1, 7 |
| 2.2 | `lookup.test.ts` (`statementRegion`); P7 | 7 |
| 2.3 | `lookup.test.ts` (region choice on `lookupIn`); P7 | 7 |
| 2.4 | `lookup.test.ts` (prototype keys, case and space variants); P6 | 7 |
| 2.5 | `lookup.test.ts` (non-string id); P6 | 7 |
| 2.6 | CH (fixture `getCancelHelp` by record id); GF: Riverside Gym email-only | 17, 18 |
| 2.7 | `lookup.test.ts` (every row) | 7 |
| 3.1 | `types.ts`; `email.test.ts` | 1, 2 |
| 3.2 | `clean-text.test.ts`; P1, P3 | 1, 3 |
| 3.3 | `email.test.ts` (full Netflix body); P1 | 2, 3 |
| 3.4 | `email.test.ts` (amount lines); P1 | 2, 3 |
| 3.5 | `email.test.ts` (placeholders, extra properties); P1, P2, P4 | 2, 3 |
| 3.6 | P4 | 2, 3 |
| 3.7 | `email.test.ts` (invalid cadence, non-object input); P4 | 2, 3 |
| 3.8 | `email.test.ts` (`mailtoHref` literals, lone surrogate); P5 | 2, 3 |
| 3.9 | `cancel-text.test.ts` (`emailInputFor`) | 15 |
| 3.10 | `email.test.ts` (every row) | 2 |
| 4.1 | `no-network.test.ts`; checkpoint searches | 2, 8, 22 |
| 4.2 | P4; P6 (deep-equal on equal region); `lookup.ts` Map never written | 2, 3, 7 |
| 4.3 | `no-network.test.ts` (shared scans, `findCodeReferences`) | 8 |
| 4.4 | `node-env.test.ts` | 12 |
| 4.5 | No URL request in any test (checkpoint review) | 12, 22 |
| 4.6 | CH, GF (`target`, `rel`); E2E request check; checkpoint searches | 17, 18, 20, 22 |
| 4.7 | CH (copy only on activation; hint); E2E storage, cookie and URL checks | 17, 18, 20, 22 |
| 5.1 | `types.ts`; `validate.test.ts` | 1, 5 |
| 5.2 | `validate.test.ts` (Output order); P8 | 5, 7 |
| 5.3 | `validate.test.ts` (malformed values); P8 | 5, 7 |
| 5.4 | `url-parts.ts` under both typecheck configs; `url-parts.test.ts` | 4 |
| 5.5 | `cancel-data.test.ts` (gated, then exact) | 6, 13 |
| 5.6 | `validate.test.ts` (`requireVerified` on and off); `requireVerified: true` test on real data | 5, 23 |
| 6.1 | `validate.test.ts` (coverage fixtures); data test | 5, 6, 9, 10, 11, 13 |
| 6.2 | `url-rules.test.ts`; `validate.test.ts` (`https-only`, `url-form`) | 4, 5, 6 |
| 6.3 | `url-rules.test.ts`; P9; `validate.test.ts` (`provider-domain`, `domain-form`) | 4, 5, 6 |
| 6.4 | `url-rules.test.ts`; `validate.test.ts` (`tracking-param`, fragment, `id=123`) | 4, 5, 6 |
| 6.5 | `validate.test.ts` (`steps-count`, `step-text`) | 5, 6 |
| 6.6 | `validate.test.ts` (`region-key`, `region-duplicate`) | 5, 6 |
| 6.7 | `date-rules.test.ts`; `validate.test.ts` (`date-form`) | 4, 5, 6 |
| 6.8 | `cancel-data.test.ts` (UTC today + 1) | 6, 23 |
| 6.9 | `validate.test.ts` (`field-type`) | 5, 6 |
| 6.10 | `validate.test.ts` (App-store link fixtures); data test | 4, 5, 6 |
| 6.11 | Reviewer reads every domain in the `cancel-data.ts` diff; human check of domains | 4, 13, 22, 23 |
| 6.12 | Every agent-written `lastChecked` is `null` (checkpoint search); dates set by the human step | 5, 6, 9, 10, 11, 13, 23 |
| 7.1 | `tombstone.test.tsx`; GF (stage line); GV (Ended tombstone) | 16, 18, 19 |
| 7.2 | GF (panel below the tombstone, before `Next`); E2E layout (no overlap) | 18, 21 |
| 7.3 | GV (`How to cancel` disclosure; none on an Ended tombstone) | 19 |
| 7.4 | `cancel-text.test.ts`; CH (region name, line) | 15, 17 |
| 7.5 | `cancel-text.test.ts`; CH (link panel); GF: Netflix panel | 15, 17, 18 |
| 7.6 | `cancel-text.test.ts`; CH (email-only panel); GF: Riverside Gym | 15, 17, 18 |
| 7.7 | CH (email block, bracket note, `MAILTO_HINT`); GF | 15, 17, 18 |
| 7.8 | `cancel-text.test.ts` (plain text); `motion.test.ts`; CH (no logo) | 15, 16, 17 |
| 7.9 | CH (record and Cancel module only); `cancel-text.test.ts` | 15, 17 |
| 7.10 | GF (Netflix, Riverside Gym); GV (Ended Netflix); E2E demo path | 18, 19, 20 |
| 8.1 | CH (Tab order, no positive `tabindex`) | 17 |
| 8.2 | GF (focus on the tombstone; Tab reaches the panel before `Next`) | 18 |
| 8.3 | CH (Copied state, `announce`); GF (live region, second Copy) | 15, 17, 18 |
| 8.4 | CH (selection fallback); GF (`COPY_FAILED_NOTICE`, no console output) | 15, 17, 18 |
| 8.5 | `cancel-text.test.ts` (`withFor`); CH (names); GV (two panels, `expectUniqueButtonNames` with links) | 15, 17, 19 |
| 8.6 | CH (44 px classes, `overflow-wrap`); E2E layout at 320 and 390 px and 200 % text | 17, 21 |
| 8.7 | `motion.test.ts`; `graveyard-flow.reduced.test.tsx` | 16, 19 |
| 8.8 | CH (underlined links; text store note) | 17 |
| 9.1 | `graveyard.test.ts` (nine keys; `serviceId` copied) | 14 |
| 9.2 | `graveyard.test.ts` (refresh to `null`); P4; graveyard-ui requirement notes | 14 |
| 9.3 | Existing `graveyard.test.ts`, P2–P6 and `haunt-view.test.ts` unchanged and passing | 14 |
| 9.4 | P4 with the new `subscriptionArb`; hand-built literals updated | 14 |
| 10.1 | `email.test.ts`, `validate.test.ts`, `lookup.test.ts`, `cancel-data.test.ts` | 2, 5, 6, 7 |
| 10.2 | CH; GF; GV; `graveyard-flow.reduced.test.tsx` | 17, 18, 19 |
| 10.3 | `tombstone.test.tsx` (both stone lines, `serviceId`) | 14, 16 |
| 10.4 | `e2e/demo-path.spec.ts` | 20 |
| 10.5 | `e2e/layout.spec.ts` | 21 |
| 10.6 | `privacy-guard` hook, `no-network` scans, CSP, lint | 22 |
| 11.1 | `test-arbitraries.ts` generators; default 100 runs | 3, 4, 7 |
| 11.2 | P1 | 3 |
| 11.3 | P2 | 3 |
| 11.4 | P3 | 3 |
| 11.5 | P4 | 3 |
| 11.6 | P5 | 3 |
| 11.7 | P6 | 7 |
| 11.8 | P7 | 7 |
| 11.9 | P8 | 7 |
| 11.10 | P9 | 4 |
