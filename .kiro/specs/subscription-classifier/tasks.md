# Implementation Plan: subscription-classifier

Tasks run in dependency order. Paths are relative to `packages/core/src/` unless they start with `apps/`, `samples/` or `.kiro/`. Each task writes its code and its tests together. Property IDs (P1–P9) refer to "Correctness properties" in `design.md`, and every property test's name starts with its ID (e.g. `"P4: price-rise arithmetic"`).

The tasks are grouped into batches. The whole suite (`npm test` at the repo root, which builds core and runs the core and web Vitest suites) and `npm run typecheck` at the repo root must be green at the end of every task, not only at the end of each batch. Task 12 is documentation only.

Each task is sized for one fresh agent run: at most two or three source files plus their tests. A task never needs a later task to make its own tests pass. Each task names the existing tests it may change; every other existing test, snapshot and fixture stays as it is.

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`, Req 7). Files in `classify/` are pure: no network, DOM, browser-global or storage API, no clock (`Date.now()`, `new Date()` with no arguments, `performance.now()`), no randomness, no `console`, no mutable module-level state (Req 7.1, 7.2). No `Date` object is created; dates are copied from the input and compared with `===` only (Req 7.3).
- `classify/` imports only `../detect/types.js`, and only types (design "Privacy and environment"). Tests may import from `../detect/` and from the package root.
- Money is integer minor units (`money.md`). Band rises use the integer rule `(to − from) × 20 > from`; tests check money arithmetic against `BigInt` where the design says so.
- ES modules under `module: NodeNext`: every relative import ends in `.js` (design "Design decisions").
- `apps/web` imports the classifier and its types only from `@zombills/core`, never from `packages/core/src`, in tests too (vertical-slice Req 9.1). Files in `apps/web/src/slice/logic/` stay pure, like the rest of that folder.
- Files are kebab-case, constants `SCREAMING_SNAKE_CASE`; unit tests in `*.test.ts(x)` and property tests in `*.property.test.ts` next to the source file (`structure.md`). Test helpers use the `test-` prefix so the build excludes them.
- TypeScript strict mode. Any `any` needs a comment explaining why (`tech.md`). No new dependency anywhere; do not run `npm install`.
- The files in `samples/` are never edited (Req 8.3). The parser snapshot `parse/__snapshots__/parse-statement.test.ts.snap` does not change (Req 10.5).
- Do not commit.

---

## Batch 1: merchant-normalizer amendment (Requirement 10)

- [x] 1. Prime Video membership as Amazon Prime (`normalize/known-services.ts`)
  - In `known-services.ts`, append `contains("prime video membership")` and `contains("primevideo membership")` to the `amazon-prime` Variants, after the existing three. No service added, removed or reordered; 59 services; ids unchanged (Req 10.1).
  - Existing tests this task may change, and only as listed:
    - `normalize/known-services.test.ts`: `EXCLUDED_TEXTS` gains `"primevideo"` next to `"prime video"` (Req 10.2, 10.4).
    - `normalize/normalize-merchant.test.ts`: `KNOWN` gains `PRIMEVIDEO MEMBERSHIP`, `PRIME VIDEO MEMBERSHIP` and `AMAZON PRIME VIDEO MEMBERSHIP` → `amazon-prime`, plus a display-name check `Amazon Prime` for the first; `GENERIC` gains `PRIMEVIDEO*2K4LJ8MB3`; "never matches the company-wide names" gains `PRIMEVIDEO`. Nothing removed (Req 10.3).
    - `normalize/__snapshots__/samples.test.ts.snap`: regenerate with `vitest -u` for `normalize/samples.test.ts` only. Check the diff: only the `uk-debit-credit.csv` `Primevideo Membership` identity changes, to `{ displayName: "Amazon Prime", key: "amazon-prime", processor: null, serviceId: "amazon-prime", source: "known" }`, and moves first; the other three samples are byte-identical (Req 10.5).
    - `detect/samples.test.ts`: the UK row becomes `sub("amazon-prime", "Amazon Prime", 899, 10788, ["2026-01-09", 899])`, still fourth; add one assertion that this row has `source: "known"` and `serviceId: "amazon-prime"` (Req 10.6).
    - `apps/web/src/slice/logic/analyze-statement.test.ts`: the UK row `["Primevideo Membership", 10788]` becomes `["Amazon Prime", 10788]`. No other change here; task 15 adds the labels column.
  - Confirm `PRIME VIDEO*2K4LJ8MB3` and `PRIME VIDEO CHANNELS` stay generic (existing tests) and that `known-services.property.test.ts` and `test-known-service-fixtures.ts` pass unchanged (Req 10.4, 10.7).
  - _Requirements: 10.1, 10.2, 10.3, 10.4 (tests), 10.5, 10.6 (tests), 10.7_

> **Batch 1 done:** root `npm test` green; `git diff` of `parse/__snapshots__` is empty.

---

## Batch 2: classifier logic (`classify/`)

Every file in this batch is pure and tested in Vitest's default `node` environment. The detector, parser and normalizer suites stay unchanged.

- [x] 2. Types, Band rise, cadence factor and the fixture builder (`classify/types.ts`, `classify/band.ts`, `classify/test-fixtures.ts`)
  - `types.ts`: `UsageAnswer`, `SubscriptionLabel` (internal alias), `PriceRise`, `TrialDetails` and `ClassifiedSubscription`, exactly as design "Data models"; it imports `PricePoint` and `Subscription` from `../detect/types.js` as types and does not re-export them.
  - `band.ts`: the frozen `CADENCE_FACTOR` (`weekly: 52`, `monthly: 12`, `yearly: 1`) and `isBandRise(from, to)` as in design "Band rise and cadence factor" (`to <= from` → `false`, else `to − from > (from − from % 20) / 20`).
  - `test-fixtures.ts`: `makeSubscription({ cadence?, currency?, source?, merchantKey?, charges, intro?, freeTrialDate?, startedInStatement?, status?, cadenceAssumed? })`, deriving every other field as step 5 of design "Generators" does. `startedInStatement` defaults to `false`. Literal factors `52`/`12`/`1`, not `CADENCE_FACTOR`.
  - New `band.test.ts`: the design examples (`1549 → 1799`, `1000 → 1050`, `1000 → 1051`, `775 → 812`, `1000 → 1080`, `999 → 1049`, `999 → 1029`); equal and falling amounts; `0 → 1`; amounts near `Number.MAX_SAFE_INTEGER` checked against a `BigInt` version of `(to − from) × 20 > from`; `CADENCE_FACTOR` values and `Object.isFrozen`; one fixture per cadence through `detectSubscriptions` (known weekly ×3, known monthly ×2, known yearly pair) asserting `yearlyCostCents === currentAmountCents * CADENCE_FACTOR[cadence]` (design review decision 2).
  - Add a short `makeSubscription` sanity case to `band.test.ts`: a 3-charge monthly fixture has `priceHistory`, `yearlyCostCents`, `regularChargeCount` and `firstChargeDate` derived as step 5 says.
  - No existing test changes.
  - _Requirements: 1.2 (types), glossary Band rise and Cadence factor (used by 2.1, 2.2)_

- [x] 3. Inferred intro and Paid price history (`classify/paid-history.ts`)
  - `findInferredIntro(s)` and `paidPriceHistory(s, inferred)` as in design "Inferred intro and Paid price history", with the checks in glossary order. `paidPriceHistory` returns a slice of `priceHistory` and does not copy entries.
  - New `paid-history.test.ts`: every row of the design's worked-examples table, built with `makeSubscription`, plus an `introCharge` that does not match `priceHistory[0]` (Paid price history unchanged).
  - No existing test changes.
  - _Requirements: glossary Inferred intro charge and Paid price history (used by 2.1, 3.1, 4.2)_

- [x] 4. Possessed (`classify/possessed.ts`)
  - `findPriceRise(s, paid)` as in design "Possessed": first paid price against `currentAmountCents`; `latestRise` from the last consecutive Band-rise pair; `increasePerYearCents` checked with `Number.isSafeInteger` (Req 2.4); `firstSeen` is a new object.
  - New `possessed.test.ts`: every Req 2.5 row with its full expected `priceRise`, and the overflow case of design "Example-based unit tests" (weekly, first `1`, current `floor(MAX_SAFE / 52) + 2` → `null`; `+ 1` still gives a `priceRise`). `classifySubscriptions` does not exist yet, so the rows go through a local helper `rise(s) = findPriceRise(s, paidPriceHistory(s, findInferredIntro(s)))`; task 6 switches the helper to `classifySubscriptions`.
  - No existing test changes.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 5. Trial trap (`classify/trial-trap.ts`)
  - `findTrial(s, inferred)` as in design "Trial trap": the three trial signals (a `freeTrialDate` equal to `firstChargeDate` does not count), the full-price charge count cut-off at 3 (`regularChargeCount − 1` with an Inferred intro), `firstFullCharge` from `priceHistory[1]` or from the charge on `firstChargeDate`, the Req 3.3 guard, and new objects for `introCharge` and `firstFullCharge`.
  - New `trial-trap.test.ts`: every Req 3.5 row; full-price charge count exactly 3 and 4 for `introCharge`, Inferred intro and `freeTrialDate`; the Req 3.3 guard (`firstChargeDate` not in `charges` → `null`). The rows go through a local helper `trial(s) = findTrial(s, findInferredIntro(s))`; the "not `possessed`" parts of the Req 3.5 rows use the task 4 helper. Task 6 switches both to `classifySubscriptions`.
  - No existing test changes.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 6. Zombie answers, `classifySubscriptions` and the public export (`classify/classify-subscriptions.ts`, `classify/index.ts`, `index.ts`)
  - `classify-subscriptions.ts`: `classifySubscriptions`, `classifyOne` and `answerFor` as in design "Entry point", with the TSDoc read-only note of design "Function signatures". Non-array → `TypeError("classifySubscriptions: subscriptions must be an array")`; non-`Map` `answers` (including duck-typed objects with `get`) → empty; `"ended"` → `labels: []`; `cadenceAssumed` → only `"zombie"` possible; labels pushed in Canonical label order; result keys spread last so stale `labels`, `priceRise` and `trial` are replaced.
  - `classify/index.ts` as in design "Data models"; `packages/core/src/index.ts` gains `export * from "./classify/index.js";` after the detector line.
  - New `classify-subscriptions.test.ts`: the cases of design "Example-based unit tests" for this file (every Req 5.4 row; both labels with and without `"not-using"`, the Req 4.2 example; non-array inputs `undefined`, `null`, `{}`, `"x"`; `answers` absent, `null`, `{}`, `[]`, `{ get: () => "not-using" }`; the Req 6.4 values; Req 6.5 unknown and non-string keys; an element carrying stale `["zombie", "possessed", "trial-trap"]`, `priceRise` and `trial`, and re-classifying with `"still-using"` removing `"zombie"`; an extra own property surviving; `[]` → `[]`).
  - Existing tests this task may change: `possessed.test.ts` and `trial-trap.test.ts` helpers now call `classifySubscriptions([s])[0]` (assertions unchanged); `build.test.ts` gains the case of design "Existing tests and snapshots that change": a fresh Node process imports `dist/index.js`, runs parse, normalize, detect and classify on `samples/us-signed.csv` and prints the Netflix labels; the test expects `["possessed"]`.
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 11.10_

- [x] 7. Privacy scan and Node environment (`test-no-network-scan.ts`, `classify/no-network.test.ts`, `classify/node-env.test.ts`)
  - `test-no-network-scan.ts` gains `findWordReferences(source, file, words)`: the same syntax-tree walk as `findForbiddenReferences`, with the word list as a parameter. `findForbiddenReferences`, `FORBIDDEN` and the other exports are unchanged, so the parser, normalizer and detector scans are unaffected.
  - New `classify/no-network.test.ts`: scans every non-test `.ts` file under `src/classify` with `sourceFilesUnder`, `findForbiddenReferences`, `findClockAndRandomReferences` and `findWordReferences(…, ["console", "sessionStorage", "indexedDB"])`, as the detector's `no-network.test.ts` does; asserts the file list is non-empty and includes `classify-subscriptions.ts`; checks the helper reports `console.log(x)` and `sessionStorage` with file and line and ignores a comment that mentions `console`.
  - New `classify/node-env.test.ts`: imports `classifySubscriptions` from `../index.js`, asserts the same absent browser globals as `detect/node-env.test.ts` (Node's built-in `navigator` allowed), and classifies the detector output of three Netflix charges at `1549`, `1549`, `1799` (`["possessed"]`).
  - No other existing test changes.
  - _Requirements: 7.1 (no module state, checked by review of `band.ts`), 7.2, 7.3, 7.4, 7.5_

> **Batch 2 done:** `npm test -w @zombills/core` and `npm run build -w @zombills/core` green; `dist/index.js` exports `classifySubscriptions`.

---

## Batch 3: property tests (Requirement 11)

Generators go in `classify/test-arbitraries.ts`, which only tests import. The reference `oracle(s, answer)` is written once, straight from the requirement text (glossary, Req 2.1, 3.1, 5, 6.3) with `BigInt` for the Band rise, in `classify/test-oracle.ts` so that P3 and P5 share it. It imports nothing from `src/classify` except types. (The design places the oracle "in the test file"; a shared `test-` file keeps one copy for the two files that need it.) Property tests use fast-check's default 100 runs per input source; P1 and P3 use 300.

- [x] 8. Generators and their coverage test (`classify/test-arbitraries.ts`)
  - `classifierSubscriptionArb` (source (b)): the six steps of design "Generators", with literal cadence factors. `classifierSubscriptionsArb`: 0 to 8 values with unique ids `sub:<currency>:<cadence>:<i>:<key>` and a branch that carries leftover `labels`, `priceRise` and `trial`.
  - `detectorOutputArb` (source (a)): `fc.oneof` over the detector's `monthlySeriesArb`, `weeklySeriesArb`, `yearlyPairArb` and arrays of `validTxArb`, optionally mixed with `unrelatedChargesArb`, through `detectSubscriptions(…).subscriptions`; plus the hand-made branch (intro `100` then `1499`; Inferred intro `750` then `1499` with an unrelated transaction 2025-12-01; a zero row before the first charge).
  - `answersArb(ids)`: a `Map` of 0 to 10 entries mixing input ids, random strings, numbers and `null` as keys, and `"still-using"`, `"not-using"`, `"maybe"`, `null`, `1`, `undefined` as values; with low probability a non-`Map` value (`undefined`, `null`, `{}`, `[]`, an object with `get`), typed through `unknown` with a comment.
  - New `test-arbitraries.test.ts`: 2,000 fixed-seed samples of `classifierSubscriptionArb` hit each case listed in Req 11.1 and keep the step 5 invariants; a fixed-seed sample of `detectorOutputArb` has at least one `introCharge`, one `freeTrialDate` and one Inferred intro (`findInferredIntro` non-null).
  - No existing test changes.
  - _Requirements: 11.1_

- [x] 9. Oracle and P1–P3 (`classify/test-oracle.ts`, `classify/classify-subscriptions.property.test.ts`)
  - `test-oracle.ts`: `oracle(s, answer)` returning the expected `labels`, whether `priceRise` and `trial` are set, and the expected Inferred intro, as above.
  - New `classify-subscriptions.property.test.ts` with P1, P2 and P3 exactly as in design "Correctness properties", each on both sources of Req 11.1 with `answersArb`. P2 compares the input and `Map` answers with a `structuredClone` taken before the call, and for a non-`Map` `answers` uses a spy on `get` to show it is never called.
  - No existing test changes.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10, 2.1, 3.1, 4.1, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 11.2, 11.3, 11.4_

- [x] 10. P4–P9 (`classify/possessed.property.test.ts`, `classify/trial-trap.property.test.ts`, `classify/classify-subscriptions.property.test.ts`)
  - New `possessed.property.test.ts`: P4 (price-rise arithmetic in `BigInt`, `latestRise` is the last consecutive Band-rise pair and `null` only when there is none).
  - New `trial-trap.property.test.ts`: P5 (trial details), using `test-oracle.ts` for the expected Inferred intro.
  - Append P6 (idempotent), P7 (deterministic), P8 (answers touch only zombie; extra non-id keys change nothing) and P9 (input order, `fc.shuffledSubarray` of full length) to `classify-subscriptions.property.test.ts`. P1–P3 are not changed.
  - No other existing test changes.
  - _Requirements: 1.6, 2.2, 2.4, 3.2, 4.3, 6.5, 6.6, 7.1, 11.5, 11.6, 11.7, 11.8, 11.9_

> **Batch 3 done:** `npm test -w @zombills/core` green; every property P1–P9 has a test whose name starts with its ID.

---

## Batch 4: samples and requirement documents

- [x] 11. Sample expectations (`classify/samples.test.ts`)
  - New test only; no source file. For each file in `samples/`: read, `parseStatement` (no options), `normalizeTransactions`, `detectSubscriptions` (no options), `classifySubscriptions` (no answers). Assert as in design "Sample tests": exactly the Req 8.1 row has `labels: ["possessed"]`, its full `priceRise` and `trial: null`; every other Subscription has `labels: []`, `priceRise: null`, `trial: null`; the result minus `labels`, `priceRise`, `trial` deep-equals the detector output minus `labels`, in order.
  - For `us-signed.csv`, each Req 6.7 row: build the answer map from the ids as written, classify again, and compare the Netflix, Spotify and Adobe labels; the `hulu` id is not in the result.
  - If a Sample disagrees with Req 8.1, stop and report; do not edit `samples/` or loosen the expectation.
  - No existing test changes.
  - _Requirements: 6.7, 8.1, 8.2, 8.3_

- [x] 12. Requirement text in the three earlier specs (`.kiro/specs/merchant-normalizer/requirements.md`, `.kiro/specs/subscription-detector/requirements.md`, `.kiro/specs/vertical-slice/requirements.md`)
  - Documentation only; no code and no test. Mark each change "(changed by subscription-classifier)".
  - merchant-normalizer Requirement 4.8: the example table gains the Req 10.3 rows; the list of tokens that are not Variants gains `"primevideo"`. The service count (59) and the Requirement 4.2 table stay unchanged (Req 10.4).
  - subscription-detector Requirement 10.1, UK table: the `merchant:primevideo-membership` row becomes key `amazon-prime`, display name `Amazon Prime`, id `sub:GBP:monthly:*:amazon-prime`, with a note that only the sample expectation changed and no detector rule (Req 10.6).
  - vertical-slice Introduction, out-of-scope list: a note that the subscription-classifier spec moved `possessed` and `trial-trap` in scope as plain text lines, and that `zombie` and the "Still using this?" question stay out of scope (Req 9.8).
  - Change nothing else in those files.
  - _Requirements: 9.8, 10.4 (requirements text), 10.6 (requirements text)_

> **Batch 4 done:** root `npm test` green; the three spec files differ only in the marked places.

---

## Batch 5: labels on the vertical-slice page (Requirement 9)

Paths in this batch start with `apps/web/`. Pure-logic tests run in the `node` environment; component test files start with `// @vitest-environment jsdom`. Expected text in jsdom tests is built in the machine's default locale with the label-text functions, like the existing component tests; the exact `en-US` strings are pinned only in `label-text.test.ts` and the E2E test (design review decision 5).

- [x] 13. Label text (`apps/web/src/slice/logic/label-text.ts`)
  - `TextPart`, `priceRiseParts(rise, currency, locale?)`, `trialParts(trial, currency, locale?)` and `partsToText(parts)` exactly as in design "Label text", using `formatMoney` and `formatDisplayDate`. No other file formats money.
  - New `label-text.test.ts`: through `partsToText`, the three Req 9.3 examples (hand-built `en-US`, `us-signed` `en-US` `Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)`, `uk-debit-credit` `en-GB`) and the three Req 9.4 examples in `en-US`; the money parts are `kind: "money"` and equal the `formatMoney` outputs; `trialParts` with neither field gives `[]`. Values are hand-built `PriceRise` and `TrialDetails` typed from `@zombills/core`.
  - No existing test changes.
  - _Requirements: 9.3, 9.4, 9.9 (label-text test)_

- [x] 14. Analyzer wiring and result types (`apps/web/src/slice/logic/analyze-statement.ts`, `apps/web/src/slice/logic/totals.ts`, `apps/web/src/slice/logic/test-arbitraries.ts`)
  - `analyze-statement.ts`: import `classifySubscriptions` and `ClassifiedSubscription` from `@zombills/core`; inside the existing `try`, `const subscriptions = classifySubscriptions(detection.subscriptions);` with no answers; the `"results"` outcome is typed `subscriptions: ClassifiedSubscription[]`. The no-subscriptions check, `currencyTotals` and `facts` are unchanged (Req 9.1, 9.2).
  - `totals.ts`: make `CurrencyGroup<S extends Subscription = Subscription>` and `groupForDisplay<S extends Subscription>` generic, type-only; logic, `currencyTotals` and `isCounted` unchanged (design review decision 6).
  - `test-arbitraries.ts`: add `classifiedSubscriptionArb` = `subscriptionArb` mapped with `(s) => ({ ...s, priceRise: null, trial: null })`.
  - Existing tests this task may change, types only, assertions unchanged: `src/slice/page-state.test.ts` and `src/slice/logic/announce.test.ts` build results outcomes from `classifiedSubscriptionArb` or hand-built values mapped the same way. If `npm run typecheck` reports another existing test that builds a `"results"` outcome from plain `Subscription`s, give it the same type-only change and name it in the task report. `subscription-item.tsx` may need its prop type widened only if typecheck requires it; task 16 owns its rendering.
  - Existing test this task may change: `analyze-statement.property.test.ts` P3 (keep the `P3:` name prefix) expects `classifySubscriptions(detectSubscriptions(…).subscriptions)`, and with `priceRise`, `trial` and `labels` removed from each item, the detector's subscriptions in the same order; reason: the old P3 expected the detector's output verbatim, which the classifier now extends.
  - Check: root `npm test` and `npm run typecheck` green; `totals.test.ts`, `totals.property.test.ts` and `analyze-statement.throw.test.ts` pass unchanged; in `analyze-statement.property.test.ts` only P3 changes (below) and P1, P2, P4 pass unchanged.
  - _Requirements: 9.1, 9.2 (wiring)_

- [x] 15. Analyzer tests for labels and a classifier throw (`apps/web/src/slice/logic/analyze-statement.test.ts`, `apps/web/src/slice/logic/analyze-statement.classify-throw.test.ts`)
  - Tests only; no source file.
  - Existing test this task may change: in `analyze-statement.test.ts` the per-Sample table becomes `outcome.subscriptions.map((s) => [s.merchant, s.yearlyCostCents, s.labels])`, with `["possessed"]` on the Req 8.1 row and `[]` elsewhere (the UK row is `["Amazon Prime", 10788, []]`), and the labelled row's `priceRise` deep-equals Req 8.1. Totals assertions unchanged.
  - New `analyze-statement.classify-throw.test.ts`: `vi.mock("@zombills/core", …)` keeps the real module and replaces `classifySubscriptions` with one that throws `new Error("boom: Netflix 17.99")`; `analyzeStatement(usSigned)` returns `{ kind: "parse-error", reason: GENERIC_FAILURE_REASON }` and the reason contains none of `Netflix`, `17.99`, `boom`.
  - _Requirements: 9.1, 9.2, 9.9 (Analyzer per Sample)_

- [x] 16. Label lines in the list item (`apps/web/src/slice/subscription-item.tsx`)
  - Prop type `ClassifiedSubscription`. Add the `Line` component of design "List item": money parts in `<span className="money">`, other parts as plain text. Render the price-rise line, then the trial line, after the cost and "Ended" lines and before the price-history list, each only when `priceRise` / `trial` is not `null`. No locale argument, no colour, icon, art or animation, no new CSS; no text for `"zombie"` (Req 9.5, 9.6, 9.7).
  - `results-view.tsx` needs no code change; if typecheck says otherwise, stop and report.
  - New `subscription-item.test.tsx` (jsdom), rendering `SubscriptionItem` inside a `<ul>` for hand-built `ClassifiedSubscription` values from a local builder: each Req 9.4 row shows exactly its line; with both labels the price-rise line comes before the trial line and the price-history list after both (document order); with neither, no "Price went up" or "ended on" text; every money figure in the lines is inside a `.money` span; no `zombie` text when `labels` contains `"zombie"`.
  - No existing test changes.
  - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.9 (item component tests)_

- [x] 17. Page and E2E checks (`apps/web/src/slice/slice-page.test.tsx`, `apps/web/e2e/demo-path.spec.ts`)
  - Tests only; no source file.
  - Existing tests this task may change, additions only: in `slice-page.test.tsx` "Results from a Sample" (us-signed), assert the Netflix item contains `partsToText(priceRiseParts(netflix.priceRise, "USD"))` and that no other item contains `Price went up`. In `demo-path.spec.ts`, after the US Sample's results appear (locale `en-US`), assert the page contains `Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)`. Existing assertions unchanged.
  - Check: root `npm test` green, then `npm run test:e2e --workspace @zombills/web` passes.
  - _Requirements: 9.3, 9.6, 9.9 (page and E2E checks)_

> **Batch 5 done:** root `npm test`, `npm run typecheck` and `npm run lint` green; the E2E test passes against the built site.

---

- [x] 18. Checkpoint: run everything and check traceability
  - On a clean core build (delete only `packages/core/dist`, which the build recreates), run from the repo root `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. All must pass with no skipped or `.only` tests. Then run `npm run test:e2e --workspace @zombills/web`.
  - Check with `git diff --stat` that the only changed existing tests and snapshots are those named in tasks 1, 6, 14, 15 and 17 (and any extra type-only change reported in task 14), that `parse/__snapshots__/parse-statement.test.ts.snap` and `samples/` are unchanged, and that no detector or parser source file changed.
  - Check that every property P1–P9 has a passing test whose name starts with its ID.
  - Check by search, outside test files of `packages/core/src/classify`: no `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `document`, `window`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, `console`, `Date.now`, `new Date`, `performance.now`, `Math.random` or `crypto`; imports only from `../detect/types.js` and sibling files, each ending in `.js`. In `apps/web/src`, no import path containing `packages/core`.
  - Check that `packages/core/dist` contains no `test-arbitraries`, `test-fixtures` or `test-oracle` code.
  - Check that every acceptance criterion in `requirements.md` (1.1–1.10, 2.1–2.5, 3.1–3.5, 4.1–4.3, 5.1–5.4, 6.1–6.7, 7.1–7.5, 8.1–8.3, 9.1–9.9, 10.1–10.7, 11.1–11.10) appears in at least one task's `_Requirements_` line above, and that each row of the traceability table below names a test or check that exists and passes. Fix the table if a test name or file differs.
  - Do not commit. Stop and report results. Do not start the graveyard-ui or cancel-helper work.
  - _Requirements: all (traceability)_

---

## Property → task map

| Property | Task |
| --- | --- |
| P1 Never throws, order kept | 9 |
| P2 No other field changes | 9 |
| P3 Labels only from evidence | 9 |
| P4 Price-rise arithmetic | 10 |
| P5 Trial details | 10 |
| P6 Idempotent | 10 |
| P7 Deterministic | 10 |
| P8 Answers touch only zombie | 10 |
| P9 Input order | 10 |

## Traceability: acceptance criterion → test

Test files without a path are under `packages/core/src/classify/`. `SI` is `apps/web/src/slice/subscription-item.test.tsx`; `SP` is `apps/web/src/slice/slice-page.test.tsx`; `E2E` is `apps/web/e2e/demo-path.spec.ts`.

| Criterion | Test or check | Task |
| --- | --- | --- |
| 1.1 | `build.test.ts` (dist classifies the US Sample); `node-env.test.ts` (import from `../index.js`) | 6, 7 |
| 1.2 | Typecheck of `types.ts`; P3 (`priceRise`/`trial` set exactly with their labels) | 2, 9 |
| 1.3 | P1; P9 | 9, 10 |
| 1.4 | P2; `classify-subscriptions.test.ts` (extra own property survives) | 6, 9 |
| 1.5 | P2 | 9 |
| 1.6 | `classify-subscriptions.test.ts` (stale labels, `"still-using"` removes `"zombie"`); P6 | 6, 10 |
| 1.7 | P3 | 9 |
| 1.8 | `classify-subscriptions.test.ts` (`answers` absent); P1 | 6, 9 |
| 1.9 | `classify-subscriptions.test.ts` (`[]`); P1 | 6, 9 |
| 1.10 | `classify-subscriptions.test.ts` (non-array inputs, non-`Map` answers); P1 | 6, 9 |
| 2.1 | `possessed.test.ts`; P3 | 4, 9 |
| 2.2 | `possessed.test.ts`; P4 | 4, 10 |
| 2.3 | `possessed.test.ts` (rise-then-fall, fall-then-rise, in-band rows) | 4 |
| 2.4 | `possessed.test.ts` (overflow case); P4 | 4, 10 |
| 2.5 | `possessed.test.ts` (every row) | 4 |
| 3.1 | `trial-trap.test.ts` (signals, same-day `freeTrialDate`, cut-off 3 and 4); P3 | 5, 9 |
| 3.2 | `trial-trap.test.ts`; P5 | 5, 10 |
| 3.3 | `trial-trap.test.ts` (guard) | 5 |
| 3.4 | `trial-trap.test.ts` (Req 3.5 rows pass with no price comparison); `paid-history.test.ts` | 3, 5 |
| 3.5 | `trial-trap.test.ts` (every row) | 5 |
| 4.1 | `classify-subscriptions.test.ts` (both labels, with and without `"not-using"`); P3 | 6, 9 |
| 4.2 | `classify-subscriptions.test.ts` (Req 4.2 example); `trial-trap.test.ts` (not `possessed` rows); P3 | 5, 6, 9 |
| 4.3 | P8 | 10 |
| 5.1 | `classify-subscriptions.test.ts` (Req 5.4 rows); P3 | 6, 9 |
| 5.2 | `classify-subscriptions.test.ts` (`cadenceAssumed` with `"not-using"`); P3 | 6, 9 |
| 5.3 | `classify-subscriptions.test.ts` (ended rows); P3 | 6, 9 |
| 5.4 | `classify-subscriptions.test.ts` (every row) | 6 |
| 6.1 | P3 (`"zombie"` only from answers) | 9 |
| 6.2 | P2 (answers unchanged, `get` not called on non-`Map`) | 9 |
| 6.3 | `classify-subscriptions.test.ts`; P3 | 6, 9 |
| 6.4 | `classify-subscriptions.test.ts` (Req 6.4 values); P3 | 6, 9 |
| 6.5 | `classify-subscriptions.test.ts` (unknown and non-string keys); P8 | 6, 10 |
| 6.6 | P8 | 10 |
| 6.7 | `samples.test.ts` (us-signed answer rows) | 11 |
| 7.1 | P7; checkpoint review (only the frozen `CADENCE_FACTOR` at module level) | 10, 18 |
| 7.2 | `no-network.test.ts`; checkpoint search | 7, 18 |
| 7.3 | `no-network.test.ts` (clock references); checkpoint search for `new Date` | 7, 18 |
| 7.4 | `no-network.test.ts` (including the `findWordReferences` self-check) | 7 |
| 7.5 | `node-env.test.ts` | 7 |
| 8.1 | `samples.test.ts` (four Samples) | 11 |
| 8.2 | `samples.test.ts` (order and other fields) | 11 |
| 8.3 | `samples.test.ts`; checkpoint `git diff` of `samples/` | 11, 18 |
| 9.1 | `apps/web/src/slice/logic/analyze-statement.test.ts` (labels per Sample) | 14, 15 |
| 9.2 | `apps/web/src/slice/logic/analyze-statement.classify-throw.test.ts` | 15 |
| 9.3 | `apps/web/src/slice/logic/label-text.test.ts`; SP (Netflix line); E2E (exact `en-US` text) | 13, 17 |
| 9.4 | `label-text.test.ts`; SI (each trial row) | 13, 16 |
| 9.5 | SI (both labels: order; neither: no line) | 16 |
| 9.6 | SI (`.money` spans, price-history list kept); SP | 16, 17 |
| 9.7 | SI (no `zombie` text) | 16 |
| 9.8 | Review of `.kiro/specs/vertical-slice/requirements.md` (no test) | 12 |
| 9.9 | The tests of tasks 13, 15, 16 and 17; root `npm test` keeps every existing slice test green | 13–17 |
| 10.1 | `normalize/known-services.test.ts` (59 services, ids, Variant form) | 1 |
| 10.2 | `known-services.test.ts` (`EXCLUDED_TEXTS` with `"primevideo"`); `normalize/normalize-merchant.test.ts` (`PRIMEVIDEO*2K4LJ8MB3` generic) | 1 |
| 10.3 | `normalize-merchant.test.ts` (new `KNOWN` rows and display name) | 1 |
| 10.4 | `known-services.test.ts`; `known-services.property.test.ts` unchanged; review of `.kiro/specs/merchant-normalizer/requirements.md` | 1, 12 |
| 10.5 | `normalize/__snapshots__/samples.test.ts.snap` diff; checkpoint `git diff` of the parser snapshot | 1, 18 |
| 10.6 | `detect/samples.test.ts` (UK row, `source`, `serviceId`); `analyze-statement.test.ts` (UK row); review of `.kiro/specs/subscription-detector/requirements.md` | 1, 12, 15 |
| 10.7 | Root `npm test`; checkpoint `git diff --stat` | 1, 18 |
| 11.1 | `test-arbitraries.test.ts` | 8 |
| 11.2 | P1 | 9 |
| 11.3 | P2 | 9 |
| 11.4 | P3 | 9 |
| 11.5 | P4 | 10 |
| 11.6 | P6 | 10 |
| 11.7 | P7 | 10 |
| 11.8 | P8 | 10 |
| 11.9 | P9 | 10 |
| 11.10 | `possessed.test.ts`, `trial-trap.test.ts`, `classify-subscriptions.test.ts` | 4, 5, 6 |
