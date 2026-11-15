# Review: subscription-classifier design (review 1)

Reviewer: Kiro custom agent `spec-reviewer` (Opus 5.5), 2026-11-15. Findings copied verbatim below; resolution table appended after fixes.

I found no blockers. There are 4 major and 7 minor findings. The parts you asked me to check most closely are mostly sound:

- **Requirements tables:** I traced every row of R2.5, R3.5, R4.2 and R5.4 through the design's pseudocode, and each gives the outcome the requirements state. Finding 6 is one fixture default that could break this.
- **Integer-only money:** `isBandRise` and the safe-integer check in `findPriceRise` are correct.
- **Amazon Prime change:** The snapshot entry really does sort first, because sorting is by `JSON.stringify([key,…])` (`normalize/samples.test.ts:31`). `AMAZON PRIME VIDEO MEMBERSHIP` resolves through the 22-character variant `prime video membership`, which beats the 12-character `amazon prime`. The design's `sub(…)` call matches the helper at `detect/samples.test.ts:35`.
- **Web changes:** `label-text.ts` falls under the `logic/` purity and privacy lint block and uses only `formatMoney`. The e2e locator `> ul > li > strong` is not affected by the new lines.

I reviewed by reading the code and did not run the test suite.

**Requirement ids not fully covered by a component and test:**
- **R9.9:** the en-US component test is replaced by a different test (finding 2).
- **R1.1:** no test calls `classifySubscriptions` from the built `dist` (finding 11).
- **R10.6:** `source` and `serviceId` are never asserted (finding 10).
- **R9.8, R10.4:** these are document edits only, so no test is expected.

### Findings

1. **Major. Where:** "Existing tests and snapshots that change", which lists `page-state` and `announce` tests as unchanged; `apps/web/src/slice/page-state.test.ts:29-35`, `apps/web/src/slice/logic/announce.test.ts:28-44`.
   - **Problem:** Once `ResultsOutcome.subscriptions` becomes `ClassifiedSubscription[]`, these tests build results outcomes from plain `Subscription` values, which lack `priceRise` and `trial`. `apps/web/tsconfig.json` includes `src`, so `npm run typecheck` fails. Vitest does not typecheck, so it still passes.
   - **Failing example:** `const RESULTS: ResultsOutcome = { …, subscriptions: [SUB] }`, where `SUB` comes from `subscriptionArb: Arbitrary<Subscription>`, gives TS2322 "Property 'priceRise' is missing".
   - **Suggested fix:** List both files as changed. Map the values with `(s) => ({ ...s, priceRise: null, trial: null })`, or add a `classifiedSubscriptionArb` to `logic/test-arbitraries.ts`.

2. **Major. Where:** R9.9; design review decision 5; "Web tests" (`slice-page.test.tsx`).
   - **Problem:** R9.9 requires a component test that renders the US Sample with locale `en-US` and finds the R9.3 Netflix text. The design replaces it with a default-locale component test, an en-US unit test and an e2e check. That departs from an approved criterion without amending it.
   - **Failing example:** On an `en-GB` machine, the component test passes against `£`/`$` text that the en-US criterion would reject. The literal string `Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)` is never checked in a component test.
   - **Suggested fix:** Either amend R9.9 to name the en-US `label-text.test.ts` plus the e2e check, and record it in a review resolution, or pin the locale in that one component test (for example by spying on `Intl.NumberFormat` to force `en-US`).

3. **Major. Where:** Design decision "Cadence factor table", review decision 2, P4, `detectorOutputArb`.
   - **Problem:** P4 is said to catch drift between `CADENCE_FACTOR` and the detector's `YEARLY_FACTOR` (`build-subscription.ts:21`), but it cannot do so in practice:
     - Source (b) derives `yearlyCostCents` with the test's own factor, so the check is circular there.
     - Source (a) almost never produces a `priceRise`. The series arbitraries use constant amounts, and the hand-made branches (intro 100→1499, inferred 750→1499) are deliberately not `possessed`. Weekly and yearly rises are never produced.
   - **Failing example:** Change `YEARLY_FACTOR.weekly` to 53. P4 still passes, because no weekly price rise from detector output reaches it.
   - **Suggested fix:** In `band.test.ts`, add one fixture per cadence through `detectSubscriptions` (known weekly ×3, known monthly ×2, known yearly pair) and assert `yearlyCostCents === currentAmountCents * CADENCE_FACTOR[cadence]`. In source (b), use literal factors (52/12/1) rather than importing `CADENCE_FACTOR`.

4. **Major. Where:** "Example-based unit tests", `possessed.test.ts` (R2.4 overflow case).
   - **Problem:** The proposed values do not overflow, so the `!Number.isSafeInteger(perYear)` branch is never tested.
   - **Failing example:** With first `1` and current `floor(MAX_SAFE/52) + 1 = 173215370283481`, the per-charge rise is `173215370283480`, and `× 52 = 9007199254740960 ≤ MAX_SAFE`. The case gets `"possessed"`, against the test's expectation.
   - **Suggested fix:** Use current `floor(MAX_SAFE/52) + 2`. The per-charge rise is then `173215370283481`, and `× 52 = 9007199254741012 > MAX_SAFE`. Assert `labels` has no `"possessed"` and `priceRise: null`.

5. **Minor. Where:** "Generators", the `detectorOutputArb` Inferred intro branch.
   - **Problem:** "A statement that starts one month before the first charge" gives `startedInStatement: false`. Detector R9.6 requires more than one Period plus Tolerance (1 month + 3 days).
   - **Failing example:** An unrelated transaction on 2025-12-10, then `750` on 2026-01-10 and `1499` on 02-10 and 03-10. The gap is exactly 1 month, so `startedInStatement` is false and there is no Inferred intro. The branch never exercises the path it exists for.
   - **Suggested fix:** Start the statement at least 35 days before (for example 2025-12-01). Add a fixed-seed test asserting that source (a) produces at least one `introCharge`, one `freeTrialDate` and one Inferred intro.

6. **Minor. Where:** `test-fixtures.ts` `makeSubscription`, whose default for `startedInStatement` is not stated.
   - **Problem:** The R2.5 rows give only `priceHistory`. If the default is `true` and a fixture repeats the second price, the row turns into an Inferred intro and flips.
   - **Failing example:** The 1549 → 1799 row built as charges `1549`, `1799`, `1799` with `startedInStatement: true` gives an Inferred intro, a Paid price history of `[1799]`, and not `possessed`. The table expects `possessed`.
   - **Suggested fix:** State that the default is `false`, and that only the rows naming `startedInStatement: true` set it.

7. **Minor. Where:** P2 together with `answersArb` ("an object with a `get` method").
   - **Problem:** `structuredClone` throws `DataCloneError` on a function value, so P2 crashes on that branch.
   - **Failing example:** `structuredClone({ get: () => "not-using" })` throws.
   - **Suggested fix:** Clone and compare only `Map` answers. For non-`Map` values, assert that `get` was never called, using a spy.

8. **Minor. Where:** P5, which says "`firstFullCharge` deep-equals an element of `charges`".
   - **Problem:** `charges` elements are `NormalizedTransaction` objects with nine fields, so a `PricePoint` is never deep-equal to one.
   - **Suggested fix:** Change the wording to "equals `{ date, amountCents }` of some element of `charges`".

9. **Minor. Where:** Design decision "Shallow copy" and review decision 1, against the Introduction's "never changes any other field".
   - **Problem:** Shallow copying meets R1.4 and R1.5. But every re-classification shares `evidence`, `charges` and `priceHistory` with the detector output and with earlier results. A graveyard-ui cadence correction (detector R9.8) that mutates `evidence.cadenceAssumed` would silently change every copy.
   - **Suggested fix:** Keep the shallow copy. Add a TSDoc note on `classifySubscriptions` ("nested values are shared with the input; treat results as read-only"), and add a hand-off line for the graveyard-ui spec saying corrections must build new objects.

10. **Minor. Where:** R10.6; `detect/samples.test.ts:163-189`.
    - **Problem:** R10.6 requires `serviceId: "amazon-prime"` and `source: "known"` for the UK Amazon Prime Subscription. The detector sample test checks neither, and the design adds no assertion for them.
    - **Suggested fix:** For the UK sample, assert `source` and `serviceId` of the `amazon-prime` row.

11. **Minor. Where:** R1.1; design decision "Module format"; `packages/core/src/build.test.ts`.
    - **Problem:** No test calls `classifySubscriptions` through the built `dist/index.js`, which is how the Reaper loads the package. A missing `.js` extension or a missing barrel line would go unnoticed until runtime.
    - **Suggested fix:** Add a `build.test.ts` case that imports `dist/index.js`, runs detect and then classify on the US sample, and prints the Netflix labels (`["possessed"]`).

Verdict: approve after fixes

## Resolution

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1. `page-state` and `announce` tests fail typecheck | Accepted. Web `logic/test-arbitraries.ts` gains `classifiedSubscriptionArb` (`subscriptionArb` mapped with `priceRise: null, trial: null`); both tests build results outcomes from it. Both files removed from the unchanged list | design.md: Existing tests and snapshots that change |
| 2. R9.9 en-US component test replaced without amending the requirement | First option: R9.9 amended to name the en-US `label-text.test.ts` unit test and the E2E check (`demo-path.spec.ts`, locale `en-US`); the component test renders the US Sample in the default locale | requirements.md: R9.9. design.md: Web tests (note under the table, e2e row); Design review decisions intro, 5, 8, 9 |
| 3. P4 cannot catch cadence factor drift | Accepted. `band.test.ts` runs one known fixture per cadence (weekly ×3, monthly ×2, yearly pair) through `detectSubscriptions` and asserts `yearlyCostCents === currentAmountCents * CADENCE_FACTOR[cadence]`. Source (b) uses literal factors 52/12/1 | design.md: Design decisions (Cadence factor table); Generators step 5; Example-based unit tests (`band.test.ts`); Design review decision 2 |
| 4. R2.4 overflow case does not overflow | Accepted. Current is `floor(MAX_SAFE/52) + 2`; asserts no `"possessed"` and `priceRise: null` | design.md: Example-based unit tests (`possessed.test.ts`) |
| 5. Inferred intro branch gives `startedInStatement: false` | Accepted. The statement starts at least 35 days before the first charge (2025-12-01). New fixed-seed test asserts source (a) yields an `introCharge`, a `freeTrialDate` and an Inferred intro | design.md: Generators (`detectorOutputArb`; `test-arbitraries.test.ts` paragraph) |
| 6. `makeSubscription` default for `startedInStatement` unstated | Accepted. Default `false`; only rows naming `startedInStatement: true` set it | design.md: Generators (`test-fixtures.ts` paragraph) |
| 7. `structuredClone` throws on a non-`Map` with a function | Accepted. P2 clones and compares only `Map` answers; for non-`Map` values a spy shows `get` was never called | design.md: Correctness properties (P2) |
| 8. P5 deep-equality with a `NormalizedTransaction` | Accepted. Reworded to "equals `{ date, amountCents }` of some element of `charges`" | design.md: Correctness properties (P5) |
| 9. Shallow copy shares nested values | Shallow copy kept. TSDoc read-only note on `classifySubscriptions`; hand-off line for graveyard-ui: corrections must build new objects | design.md: Design decisions (Shallow copy); Function signatures; Design review decision 1 |
| 10. R10.6 `source` and `serviceId` never asserted | Accepted. The UK sample test asserts `source: "known"` and `serviceId: "amazon-prime"` on the `amazon-prime` row | design.md: Existing tests and snapshots that change (`detect/samples.test.ts`) |
| 11. No test classifies through `dist/index.js` | Accepted. New `build.test.ts` case runs detect then classify on the US Sample in plain Node through `dist/index.js` and asserts Netflix labels `["possessed"]` | design.md: Design decisions (Module format); Existing tests and snapshots that change (`build.test.ts`) |
