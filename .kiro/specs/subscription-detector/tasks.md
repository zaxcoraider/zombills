# Implementation Plan: subscription-detector

Tasks run in dependency order. Every source file lives in `packages/core/src/detect/` unless a path says otherwise. Each task writes its code and its tests together, and is done only when `npm test -w @zombills/core` passes. Property IDs (P1–P20) refer to the Testing strategy in `design.md`, and every property test's name starts with its ID (e.g. `"P15: date arithmetic round-trips"`).

The tasks are grouped into batches. The whole suite, including the existing statement-parser and merchant-normalizer tests, must be green at the end of every task, not only at the end of each batch. A task that adds a step never needs a later task to make its tests pass: each step is tested on its own inputs before `detectSubscriptions` wires the steps together in task 17.

Rules that apply to every task:

- All money is integer cents. No division except the exact `(m − m % 20) / 20` in `bands.ts`, no `Math.round`, no averaging; the yearly cost is one multiplication checked with `Number.isSafeInteger` (`money.md`, Req 6.2, 6.5).
- All dates are Day numbers or `CivilDate`s from `dates.ts`. No `Date` object is ever built, with or without arguments (Req 7.3).
- No network, DOM, `localStorage`, `console.*`, `Intl`, `toLocale*`, `localeCompare`, `Date.now`, `performance.now`, `Math.random` or `crypto.randomUUID` in non-test files of `src/detect` (`privacy.md`, Req 12). Strings are compared by code units with `<` / `>`.
- No mutable module-level state. Module-level tables are frozen. The comparison counter is an argument, never a module variable (Req 12.5).
- After step 1, code reads only the `Entry` objects built by `validateElement`, never the input elements, and never uses input position except to write `usage` (design "Design decisions", Req 1.12, 11.3).
- No blanket `try/catch`. The only throw is the `TypeError` for a non-array `transactions` (Req 1.13).
- Files are kebab-case, constants are `SCREAMING_SNAKE_CASE`, unit tests go in `*.test.ts` and property tests in `*.property.test.ts` next to the source file (`structure.md`).
- TypeScript strict mode. Any `any` needs a comment explaining why (`tech.md`). Every relative import ends in `.js` (design "Module format"). The only cast in the module is the `processor` cast in `build-subscription.ts` (design "Internal types").
- `packages/core` already exists. No scaffold or dependency changes are needed; `vitest` and `fast-check` are installed, and the build `tsconfig` already excludes `**/*.test.ts`, `**/*.property.test.ts` and `**/test-*.ts`.

---

## Batch 1: foundations

- [ ] 1. Public types, internal types, barrel and date arithmetic (`types.ts`, `internal-types.ts`, `index.ts`, `dates.ts`)
  - In `types.ts`, write `Cadence`, `SubscriptionStatus`, `Confidence`, `DetectOptions`, `PricePoint`, `StatementInfo`, `DetectionEvidence`, `Subscription`, `TransactionRole`, `TransactionUsage` and `DetectionResult` exactly as in design "Public types". Import `MerchantSource` and `NormalizedTransaction` from `../normalize/types.js` as types only, and do not re-export them.
  - In `internal-types.ts`, write `CivilDate`, `Entry`, `Group`, `Band`, `StepKind`, `Interval`, `Segment`, `Series`, `ComparisonCounter` and `Assigned` as in design "Internal types" and "Function signatures".
  - Create `index.ts` exporting the public types only, and add `export * from "./detect/index.js";` to `packages/core/src/index.ts`.
  - In `dates.ts`, write `isLeap`, `daysInMonth`, `parseIsoDate`, `dayNumber` (days-from-civil, integer operations only), `fromDayNumber`, `isLastDayOfMonth`, `addMonths` (any integer `k`, clamped day) and `formatDate` (4-digit year, 5 digits only for year 10000) as in design "Date arithmetic".
  - Unit tests (`dates.test.ts`): leap years 1900, 2000, 2024, 2026; the glossary examples `addMonths(2026-01-31, 1)` = `2026-02-28`, `addMonths(2024-01-31, 1)` = `2024-02-29`, `addMonths(2024-02-29, 12)` = `2025-02-28`; negative `k` (`addMonths(2026-03-27, −1)` = `2026-02-27`); year `0000` accepted and leap; `parseIsoDate` rejects `2026-02-29`, `2026-13-01`, `2026-00-10`, `2026-01-32`, `26-01-01`, `2026-1-1`, `" 2026-01-01"`, non-strings; `formatDate(10000, 1, 15)` = `10000-01-15`.
  - Property test (`dates.property.test.ts`): **P15** (round trip over 0000–9999; consecutive dates differ by 1; `addMonths` equals a month-by-month reference; `1970-01-01` → 0, `2000-03-01` → 11017).
  - _Requirements: 1.1 (types), 1.2, 1.3, 1.4 (type), 1.5, 1.8 (types), 7.3, 9.1; glossary Day number, Months after_

- [ ] 2. Validation and fixture builders (`validate.ts`, `test-fixtures.ts`)
  - Write `validateElement(value, index)`: the seven checks of design "Validation" in that order, returning the first failure as a `reason` that names the field (e.g. `"date: not a real calendar date"`). Each field is read once into the `Entry` (without `rank`); the `merchant` object is copied field by field.
  - Write `test-fixtures.ts`: builders for hand-written rows, e.g. `charge("2026-01-15", 999, "merchant:gym")`, `credit(...)`, `zero(...)`, which fill a valid `description`, `currency` (default `USD`) and a `merchant` whose `source`, `serviceId` and `displayName` agree with the key (a key without `:` is `known`, `merchant:` is `generic`, `unidentified:` is `unidentified`).
  - Unit tests (`validate.test.ts`):
    - one failing case per check, each with the expected field name in `reason`: not an object, `null`, an array, an object with a class prototype, `Object.create(null)` accepted; bad date; non-string `description`; `amountCents` `1.5`, `NaN`, `2 ** 53`, `"999"`; currency `usd`, `US`, `USDX`; `merchant` missing, empty `key`, empty `displayName`, unknown `source`, `serviceId` a number, `processor` `undefined`;
    - key/source disagreement for each source (`known` key with `:`, `known` with `serviceId !== key`, `generic` without the `merchant:` prefix or with a `serviceId`, `unidentified` without its prefix);
    - the returned `Entry` does not share the input's `merchant` object, and a valid element with extra properties is accepted;
    - every builder in `test-fixtures.ts` produces an element that passes.
  - _Requirements: 1.10, 1.12 (fields read once), 1.13 (no throw on plain data), 2.1_

- [ ] 3. Content order and cadence constants (`content-order.ts`, `cadence-rules.ts`)
  - Write `compareContent` with the levels of design "Content order": `date.day`, `amountCents`, `description`, `merchant.displayName`, `merchant.source`, `merchant.serviceId` (`null` first), `merchant.processor` (`null` first), `currency`, `merchant.key`, then `index`; strings by code units.
  - Write the frozen `Readonly<Record<Cadence, number>>` tables `TOLERANCE_DAYS`, `MAX_K`, `MIN_GAP_DAYS`, `WINDOW_DAYS` (from / to), `LATE_MIN_DAYS`, `LATE_MAX_DAYS`, `ENDED_GRACE_DAYS` from design "Cadence constants", and `addPeriods(date, cadence, k)`.
  - Unit tests (`content-order.test.ts`): each level decides when all earlier levels are equal, in turn, including `currency` and `merchant.key` before `index`; `null` sorts before any string; `"Z" < "a"`; two entries differing only in `index` compare by `index`; sorting a shuffled list gives the same order every time.
  - Unit tests (`cadence-rules.test.ts`): every table value equals the design table; every table is frozen; `addPeriods` weekly adds `7k` days, monthly equals `addMonths(d, k)`, yearly equals `addMonths(d, 12k)`, for positive and negative `k`.
  - _Requirements: 2.4 (tie-break order), 4.1, 4.3 (Tolerance and `k` table), 4.6 (late window), 7.5 (grace); glossary Content order, Period, Tolerance_

> **Batch 1 done:** `npm test -w @zombills/core` green; the parser and normalizer suites are unchanged.

---

## Batch 2: step 1 and step 2

- [ ] 4. Statement range and As-of date (`statement.ts`)
  - Write `buildStatementInfo(sorted, options)`: `firstDate` and `lastDate` from the first and last sorted entry, distinct `currencies` by code units, and `asOf` / `asOfSource` from `options.asOf` only when `options` is a non-null, non-array object and `parseIsoDate` accepts the value, read once. Write `resolveAsOf(info)`.
  - Unit tests (`statement.test.ts`): no entries → `null` dates, `currencies: []`, `asOf: null`, `asOfSource: null`; a valid `asOf` gives `"option"` even when it is before `firstDate` or after `lastDate`; `asOf` `"2026-02-30"`, `20260301`, `""`, and `options` `null`, `42`, `[]`, `{}` all give `lastDate` with `"statement"`; `currencies` `["EUR", "GBP", "USD"]` for mixed input; `resolveAsOf` returns the matching `CivilDate` or `null`.
  - _Requirements: 1.4, 1.14 (statement part), 7.1, 7.2_

- [ ] 5. Full refunds (`refunds.ts`)
  - Write `matchRefunds(sorted)` as in design "Full refunds": per Group, Charges indexed by amount in Content order; Credits processed in Content order; a binary search for the last Charge on or before the Credit's date, then the "previous unmatched" pointers back to `r.day − 45`; on the latest qualifying date, the first unmatched Charge in Content order. Return the `refunded` and `refunds` sets.
  - Unit tests (`refunds.test.ts`):
    - a Credit 0 days and 45 days after its Charge matches; 46 days does not; a Credit dated before the Charge does not;
    - with two qualifying Charges, the latest is matched; with several unmatched Charges on that latest date, the first in Content order is matched;
    - many identical same-day Charges and Credits pair up one to one;
    - each Charge and each Credit is matched at most once (two Credits, one Charge → one `"money-in"`);
    - a partial refund matches nothing;
    - a Credit in another currency or under another key never matches, including the Req 2.7 order/refund keys.
  - _Requirements: 2.4, 2.5 (matching), 2.6, 2.7_

- [ ] 6. Groups and Amount bands (`bands.ts`)
  - Write `groupCharges(sorted, refunded, refunds)`: Groups keyed by `key + "\u0000" + currency`, in Content order of their first entry, holding live Charges, Zero-amount rows and `"money-in"` Credits in Content order; refunded Charges and their Credits are left out.
  - Write `splitIntoBands(charges)` with the overflow-free test `a − m ≤ (m − m % 20) / 20` from design "Groups and Amount bands"; band ids `0, 1, …` in ascending `low`.
  - Unit tests (`bands.test.ts`): `999`/`1029` one band; `999`/`1049` two; `1549`/`1799` two; `99`/`1099` two; `1000`/`1050` one and `1000`/`1051` two (the 5 % edge); amounts near `Number.MAX_SAFE_INTEGER` band without overflow; Charges of the same key in two currencies form two Groups; a refunded Charge is in no band; Zero-amount rows and Credits are in no band; supermarket `5430`, `6118`, `4782` give three bands (the Req 5.3 note).
  - Property test (`bands.property.test.ts`): **P16** on arrays of safe positive integers generated in the test (bands partition the distinct amounts; `20 × (high − low) ≤ low` checked with `BigInt`; each next band's `low` fails the test against the previous band's `low`).
  - _Requirements: 2.2, 3.1, 3.2, 5.3 (note)_

> **Batch 2 done:** step 1 and step 2 tested on their own; suite green.

---

## Batch 3: schedule rules and Segments

- [ ] 7. Schedule rules (`schedule.ts`)
  - Write `expectedDays(prev, anchor, anchorIndex, cadence, k)` and `deviation(...)` from design "Schedule rules": the forward date (with the month-end alternative for monthly), the backward check and the anchor date (with its month-end alternative), the anchor date counting only when `b.day − a.day ≥ MIN_GAP_DAYS[cadence]`. Write `classifyStep`, which reports on schedule with `k = 1` or `k = 2` (`k = 1` only for yearly) or, for monthly, late (`b.day − addMonths(a, 1).day` from 4 to 10).
  - Unit tests (`schedule.test.ts`):
    - month-end alternative: `2026-02-28` → `2026-03-31` deviation 0; `2026-01-31` → `2026-02-28` deviation 0;
    - backward check: `2026-03-01` → `03-27` on schedule (2 days); yearly `2023-03-07` → `2024-02-28` on schedule (7 days); `2026-01-15` → `02-26` and Greenleaf `01-05` → `03-09` (with `k = 2`) still off;
    - anchor rule: from anchor `2026-01-01` with `02-04`, `03-07`, `04-10` each 3 days late, `04-28` is refused (18 days after `04-10`); a candidate exactly 25 days after the previous charge may use the anchor date, 24 days may not;
    - late window: 4 and 10 days after `addMonths(a, 1)` are late, 3 is on schedule, 11 is neither; weekly and yearly never give late;
    - weekly `k = 2` accepted, yearly `k = 2` refused; Tolerance edges ±2, ±3, ±7 accepted and one day more refused.
  - _Requirements: 4.2, 4.3, 4.6 (late test)_

- [ ] 8. Growing one chain (`segments.ts`, `growChain` and `longestValidPrefix`)
  - Write `growChain` as in design "Growing one chain": successors with a strictly later Day number; the preference classes on schedule `k = 1`, then late (monthly), then on schedule `k = 2`; inside a class the smallest deviation (fewest days late for a late charge), then Content order; after a late charge only the two continuations of Req 4.6, never a second late charge. Scan only the previous-charge and anchor windows found by binary search on the band's sorted Day numbers, and add one to `counter.comparisons` (when a counter is given) for each charge examined.
  - Write `longestValidPrefix`: the longest prefix of 2 or more charges with at least one `k = 1` interval and no more `k = 2` than `k = 1` intervals, a prefix may end on a late charge; otherwise `null`.
  - Unit tests (`segments.test.ts`, chain cases), each as the chain grown from the first charge:
    - Req 3.4: Jan 10, Feb 9, Feb 11, Mar 10 → Jan 10, Feb 9, Mar 10;
    - gym: Jan 2, Feb 2, Feb 27, Apr 1, May 1 → all five, `k = 1` throughout;
    - review finding 1: 03-01, 03-27, 04-27, 05-27 → all four;
    - retry: Jan 15, Feb 22, Mar 22 and Jan 15, Feb 22, Mar 15 → all three, Feb 22 late, both out-intervals `k = 1`;
    - 11 days late: Jan 15, Feb 26, Mar 26 → `[Jan 15]`, no valid prefix;
    - two same-date charges never in one chain;
    - `longestValidPrefix` cuts a trailing run of `k = 2` steps; Jan 15, Mar 15 has no valid prefix;
    - the counter grows when given and the result is identical without it.
  - _Requirements: 3.4 (steps 2–3), 4.4, 4.5 (k = 2 intervals), 4.6 (continuations, no two late in a row)_

- [ ] 9. Cover and cadence choice per band (`segments.ts`, `coverBand` and `chooseBandCover`)
  - Write `coverBand(band, cadence, counter)`: the earliest-start sweep of design "Cover per cadence", returning the multi-charge Segments and the one-charge leftovers (`cadence: null`).
  - Write `chooseBandCover(band, source, counter)`: run `coverBand` for monthly and yearly, plus weekly only for `"known"`; take the cadence covering the most charges, then the shorter Period; no covered charge → leftovers only.
  - Unit tests (`segments.test.ts`, cover cases):
    - Req 3.4 example: Feb 11 is a leftover; generic `999` on 01-01, 02-01, 02-03, 03-03 → one Segment 01-01, 02-01, 03-03 and leftover 02-03;
    - Req 3.11 coffee: cover is Jan 5, Feb 2, Mar 2; Jan 12, 19, 26, Mar 9, 16, 23 are leftovers;
    - Req 3.11 generic `999` on Jan 1, 8, 15, Feb 1, Mar 1, Apr 1: Segment Jan 1 to Apr 1 monthly, Jan 8 and Jan 15 leftovers, no weekly cover tried for `"generic"`;
    - known weekly charges over 6 weeks → weekly (covers more than monthly); a known band that both weekly and monthly cover equally → weekly (shorter Period); yearly chosen only when it covers more;
    - every Segment in one band has the same cadence;
    - shuffling the band's input order before sorting gives the same Segments.
  - _Requirements: 3.3, 3.4 (steps 1 and 4), 3.10 (steps 3–4), 4.7_

> **Batch 3 done:** Segments and covers tested per band; suite green.

---

## Batch 4: Series, acceptance and single known charges

- [ ] 10. Joins across bands (`series.ts`, `joinSegments`)
  - Write `joinSegments(group, segments)` as in design "Joins across bands": pieces in Content order of their first charge plus a Day-number index; for each unconsumed piece, extend the Series built so far with the best candidate until none is left; keep it when it has 2 or more Regular charges. Candidates come from a binary-searched window keyed to the last charge `l`; the conditions are the design's list (different band, compatible cadence, wholly later, on schedule after `l` with `k = 1` or `k = 2` by the previous-charge rule or late for monthly, ratio `max ≤ 2 × min`, `S` with 2 charges or a `"known"` source, Req 4.4 still holding). Two one-charge pieces of a `"known"` Group join only one Period apart, trying monthly then yearly. Tie-breaks: earliest first charge, then smaller `|q − p|`, then Content order.
  - Unit tests (`series.test.ts`, join cases):
    - Netflix `1549` 01-02, 02-02 and `1799` 03-02 → one Series of 3; Streaming Dienst shape with a generic source and a 2-charge `A` joins;
    - known one-charge pieces: 1 month apart → monthly; 12 months apart → yearly; 2 months apart or the same date → no join; generic one-charge pieces never join; generic one-charge `A` (supermarket `5430`, `6118`) does not join;
    - ratio exactly 2 joins, `2 × min + 1` does not;
    - late join 4 and 10 days after `addMonths(l, 1)` joins, 11 does not; refused after a late `l`; refused when `B`'s second charge fits neither continuation;
    - a join that would leave more `k = 2` than `k = 1` intervals is refused and `B` stays free;
    - overlapping Segments (iCloud+ `99` and Apple Music `1099`, both monthly 01-12 to 03-12) stay two Series;
    - candidate tie-breaks: earliest first charge, then smaller `|q − p|`, then Content order; the Series whose first piece is first in Content order takes a contested piece;
    - join intervals carry `k` and kind (`missedPeriods` counted later from these).
  - _Requirements: 3.5, 3.6, 3.10 (step 5, joins), 4.5 (join gap)_

- [ ] 11. Introductory charges (`series.ts`, `addIntroCharges`)
  - Write `addIntroCharges(group, series, leftovers)` as in design "Introductory charges": `"known"` Groups only; Series in Content order of their first Regular charge `r`; candidates are leftovers with a lower amount, dated before `r`, with `r` on schedule after them with `k = 1`; latest, then lower amount, then Content order; each leftover used at most once and each Series gets at most one.
  - Unit tests (`series.test.ts`, intro cases):
    - Netflix `100` 01-10, `1499` 02-10, 03-10 → intro `100`, 2 Regular charges, intro adds no interval;
    - unidentified Apple key `199` 01-10, `1099` 02-10, 03-10 → no intro; generic → no intro;
    - a Series with 1 Regular charge gets no intro; a leftover at a higher amount is not an intro; a leftover two months before `r` is not an intro;
    - two candidates: the later wins; same date: the lower amount; then Content order;
    - two Series of one Group compete for a leftover: the Series first in Content order takes it.
  - _Requirements: 3.7, 3.8, 3.9, 3.10 (step 5, intros)_

- [ ] 12. Minimum evidence and density (`accept.ts`)
  - Write `meetsMinimum`, `densityCount` (two binary searches per band of the Regular charges, live charges only) and `acceptSeries(series)` returning the `Confidence` or `null`, as in design "Minimum evidence and density".
  - Unit tests (`accept.test.ts`):
    - every Req 5.1 row at its minimum and one below: known monthly and yearly `n = 2` high, `n = 1` rejected; known weekly `n = 3` high, `n = 2` rejected; generic and unidentified monthly `n = 3` high, `n = 2` equal amounts medium, `n = 2` unequal rejected; yearly `n = 2` medium, `n = 3` high; generic weekly always rejected;
    - density at `m = 2n − 2` kept and `m = 2n − 1` rejected; the intro's band is not counted; refunded charges are not counted; charges just outside the span are not counted;
    - iCloud+ with one app purchase `m = 4` kept; with two `m = 5` rejected; coffee `n = 3`, `m = 6` rejected; generic `999` `n = 4`, `m = 6` kept.
  - _Requirements: 5.1, 5.2, 5.5, 5.6, 3.10 (step 6)_

- [ ] 13. Single known charges (`single-charge.ts`)
  - Write `reportSingleKnownCharges(groups, accepted, asOf)` as in design "Single known charges": for each `"known"` Group with no accepted Series and a live charge, the latest charge (ties by Content order) as a one-charge Series with `confidence: "low"`, `cadenceAssumed: true`, monthly when `asOf.day ≤ addMonths(charge, 1).day + 3`, else yearly.
  - Unit tests (`single-charge.test.ts`): the monthly/yearly boundary at exactly `addMonths + 3` and one day later; Netflix `1549` and `999` on the same date → the `999` charge; a Group whose only charge is refunded gives nothing; a Group with an accepted Series gives nothing; generic and unidentified Groups give nothing; a charge of a rejected Series can be reported.
  - _Requirements: 5.4, 5.5 (exception), 3.10 (step 7)_

> **Batch 4 done:** steps 5–7 tested on hand-built Groups and Segments; suite green.

---

## Batch 5: building Subscriptions and the public function

- [ ] 14. Amounts, price history, charge copies and status (`build-subscription.ts`, part 1)
  - Write `buildSubscription(series, statement, asOf)` with every field except `evidence` (filled with a placeholder of the right shape until task 15): `currentAmountCents` from the last Regular charge; `yearlyCostCents = currentAmountCents × {52, 12, 1}` and `null` when it is not a safe integer; `priceHistory` from intro plus Regular charges by date; `charges` as new objects with exactly the 4 + 5 fields (the `processor` cast); `merchant` from the last charge's `displayName`; `merchantKey`, `serviceId`, `source`, `currency` from the Group; `labels: []`, no `cancel`; `status` from `next = addPeriods(lastRegular, cadence, 1)` and `ENDED_GRACE_DAYS`.
  - Unit tests (`build-subscription.test.ts`, part 1):
    - yearly cost for each cadence; an amount near `MAX_SAFE_INTEGER / 12` monthly returns `null`, the same amount yearly does not;
    - `priceHistory`: one entry for a constant price; intro `100` then `1499` gives two entries; 1549, 1549, 1799 gives two; its last entry equals `currentAmountCents`;
    - `charges` are fresh objects with exactly the 9 fields, an extra input property is not copied, and `merchant` is a fresh object;
    - `merchant` is the last charge's `displayName` when display names differ; `labels` is `[]` and `cancel` is absent (`"cancel" in sub` is `false`);
    - status: last charge 2026-02-20 monthly, `asOf` 2026-03-30 → `"active"`, 2026-03-31 → `"ended"`; weekly grace 2 and yearly grace 7 at their edges; `asOf` before the last Regular charge → `"active"`; an ended Subscription keeps its last price.
  - _Requirements: 1.6, 1.7, 1.12, 6.1, 6.2, 6.3, 6.4, 6.5, 7.4, 7.5, 7.6, 7.8_

- [ ] 15. Evidence (`build-subscription.ts`, part 2)
  - Fill `evidence` as in the design's Evidence table: `regularChargeCount`, `firstChargeDate`, `lastChargeDate`, `nextExpectedDate` (`formatDate` of `next`), `missedPeriods` (intervals with `k = 2`, join gaps included), `lateChargeDates` (ascending), `cadenceAssumed`, `introCharge`, `freeTrialDate` (binary search on the Group's zero rows), `startedInStatement` and `partialRefunds` (the Group's `"money-in"` Credits from `e` to the last Regular charge + 45 days, negative amounts, ascending).
  - Unit tests (`build-subscription.test.ts`, part 2):
    - `freeTrialDate`: a zero row exactly at `addPeriods(e, cadence, −1)` minus the Tolerance is used, one day earlier is not; a zero row on `e`'s date is used; the latest of two qualifying rows wins; a zero row of another Group is ignored;
    - `startedInStatement` with `firstDate` 2026-01-02: a Series starting 02-05 gives `false`, 02-06 gives `true`; with an intro, `e` is the intro;
    - `partialRefunds`: a Credit at the last Regular charge + 45 days is included, + 46 is excluded, one before `e` is excluded;
    - `missedPeriods` 1 for Jan 15, Feb 15, Apr 15, May 15; `lateChargeDates: ["2026-02-22"]` for the retry row; `cadenceAssumed` `true` only for a step-7 Series;
    - `nextExpectedDate` for a charge in year 9999 has a 5-digit year.
  - _Requirements: 2.3 (trial evidence only), 4.5, 4.6 (`lateChargeDates`), 5.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [ ] 16. Ids and ordering (`ids.ts`)
  - Write `assignIds(subs, series)` and `sortSubscriptions(subs)` as in design "Ids": groups by `(merchantKey, currency, cadence)`; `"*"` for a group of one; `String(currentAmountCents)` otherwise; `"<amount>-<r>"` for shared amounts, ranked by first charge date, then the list of charge dates, then the list of charge amounts, element by element with a prefix first. Sort by `yearlyCostCents` descending, then `id` by code units.
  - Unit tests (`ids.test.ts`): `sub:USD:monthly:*:netflix`; the Req 8.2 Apple example ids `…:99:…` and `…:1099:…`; two Subscriptions of one amount get `-1` and `-2` by first date, then by date list, then by amount list, and a prefix list ranks first; the same key in two currencies or two cadences gets `*` each; a key containing `:` is the whole remainder after the fourth `:`; sort order with equal yearly costs falls back to `id`.
  - _Requirements: 1.11, 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 17. `detectSubscriptions` and usage (`detect-subscriptions.ts`, `usage.ts`)
  - Write `buildUsage(length, roles)`: one entry per input position, in input order, defaulting to `"not-recurring"` for valid Charges with no other role.
  - Write `detectSubscriptionsCounted(transactions, options, counter)` running the eight steps of design "Overview" in order, and `detectSubscriptions(transactions, options)` calling it with no counter. Throw `TypeError("detectSubscriptions: transactions must be an array")` only for a non-array. Charges of rejected Series and of overflowed Subscriptions get `"not-recurring"`.
  - Export `detectSubscriptions` from `index.ts`; do not export `detectSubscriptionsCounted`.
  - Unit tests (`detect-subscriptions.test.ts`):
    - empty array → `subscriptions: []`, `usage: []`, `null` dates, `currencies: []`, and `asOf` from a valid option or `null`;
    - non-arrays (`undefined`, `null`, `{}`, `"x"`) throw `TypeError`; a sparse array hole is `"invalid"`;
    - a mix of a Netflix Series, a refunded charge and its refund, a partial refund, a zero row, an invalid element and a one-off purchase gives each role once, `subscriptionId` exactly on `"subscription-charge"` entries, `reason` non-null exactly on `"invalid"`, and every `"subscription-charge"` entry listed in that Subscription's `charges`;
    - invalid elements do not move `firstDate` or `lastDate`;
    - a frozen input array of frozen elements does not throw and is unchanged;
    - `detectSubscriptions` from `../index.js` is the same function.
  - _Requirements: 1.1, 1.8, 1.9, 1.10, 1.13, 1.14, 2.3 (role), 2.5 (roles), 2.8, 3.10 (step order), 5.5 (roles), 6.5 (roles)_

> **Batch 5 done:** `detectSubscriptions` complete and exported; suite green.

---

## Batch 6: fixtures and samples

Every fixture goes through the public `detectSubscriptions` and checks the full expected result the row names: roles for every input element, the Subscriptions with id, cadence, amounts and `priceHistory`, and the evidence fields the row mentions. Dates are 2026 unless stated. All fixture tasks add a `describe` block per requirement to `fixtures.test.ts` and build rows with `test-fixtures.ts`. A fixture that fails is a Detector bug to fix in the module that owns the step, not a fixture to change.

- [ ] 18. Fixtures, part 1: refunds, grouping and Series (Req 2.7, 3.4–3.7, 3.11)
  - Req 2.7: `ONLINE MARKETPLACE ORDER` `2347` on 02-14 and `REFUND` `−2347` on 02-17 under different keys → order `"not-recurring"`, refund `"money-in"`.
  - Req 3.4: generic `999` on 01-10, 02-09, 02-11, 03-10 → Series 01-10, 02-09, 03-10; 02-11 `"not-recurring"`. Generic `999` on 01-01, 02-01, 02-03, 03-03 → one Subscription with id `…:*:…`; 02-03 `"not-recurring"`.
  - Req 3.5: unidentified Apple key, `99` and `1099` monthly 01-12 to 03-12 → two Subscriptions, ids `…:99:…` and `…:1099:…`.
  - Req 3.6: Netflix `1549` 01-02, 02-02, `1799` 03-02 → one Series, history 1549 → 1799; Netflix `1549` 01-02, `1799` 02-02 → monthly, `confidence: "high"`, `cadenceAssumed: false`, id `sub:USD:monthly:*:netflix`; Netflix `1549` 01-02, 02-02, `1799` 03-07 → `lateChargeDates: ["2026-03-07"]`, `currentAmountCents: 1799`; generic supermarket `5430` 01-10, `6118` 02-10 → no Subscription.
  - Req 3.7: Netflix `100` 01-10, `1499` 02-10, 03-10 → `introCharge: { date: "2026-01-10", amountCents: 100 }`, `regularChargeCount: 2`; unidentified Apple key `199` 01-10, `1099` 02-10, 03-10 → `introCharge: null`, 01-10 `"not-recurring"`.
  - Req 3.11: both rows (coffee: no Subscription, all 9 `"not-recurring"`; generic `999`: one Subscription 01-01 to 04-01, `confidence: "high"`, 01-08 and 01-15 `"not-recurring"`).
  - _Requirements: 2.7, 3.4, 3.5, 3.6, 3.7, 3.11_

- [ ] 19. Fixtures, part 2: cadence (Req 4.8)
  - All 12 rows of the Req 4.8 table, one test each, as generic monthly charges at one amount in one band, with the result the row states: month-end rows `missedPeriods: 0`; the leap-year row; 01-30, 03-02, 03-30; the weekend shift; the missed month (`missedPeriods: 1`); both retry rows (`lateChargeDates: ["2026-02-22"]`); the 11-days-late row (Series 02-26, 03-26 with `confidence: "medium"`, 01-15 `"not-recurring"`); 01-27, 03-01, 03-27, 04-27; the gym row; 01-15, 03-15 (no Subscription); quarterly (no Subscription).
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.8_

- [ ] 20. Fixtures, part 3: evidence, single charges and status (Req 5.4, 5.6, 7.5, 7.7, 9.8)
  - Req 5.4: Netflix `1549` and `999` on 03-01 → one low-confidence Subscription for the `999` charge, in both input orders.
  - Req 5.6: iCloud+ `99` on 01-12, 02-12, 03-12 plus one app purchase at `99` → kept; plus app purchases on 01-20 and 02-25 → no Subscription and 5 `"not-recurring"`.
  - Req 7.5: monthly, last charge 02-20; `asOf` 03-30 → `"active"`, `asOf` 03-31 → `"ended"`, `statement.asOfSource: "option"`.
  - Req 7.7: known single charge 2025-01-10, statement ending 2026-03-01 → yearly, `"ended"`, `cadenceAssumed: true`.
  - Req 9.8: Amazon Prime `13900` on 03-20, statement ending 03-31 → monthly, `yearlyCostCents: 166800`, `cadenceAssumed: true`; Netflix `1549` on 01-02, statement ending 03-25 → yearly, `"active"`, `cadenceAssumed: true`.
  - _Requirements: 5.4, 5.6, 7.5, 7.7, 9.3, 9.8_

- [ ] 21. Fixtures, part 4: out-of-scope cases and id stability (Introduction)
  - 4-weekly: NYT `2500` every 28 days 01-01 to 12-31 → monthly, `yearlyCostCents: 30000`.
  - Other cadences: a fortnightly generic plan and a quarterly generic plan → no Subscription; quarterly Netflix `1549` on 01-15, 04-15, 07-15, range to 07-20 → one low-confidence single-charge Subscription for 07-15.
  - Two accounts: generic `1099` monthly on the 5th and on the 20th → no Subscription; Spotify `1099` the same → one low-confidence single-charge Subscription.
  - Replaced service: unidentified Apple `1099` 2025-11-10 to 2026-01-10 and `999` 02-10 to 04-10 → one Series, history 1099 → 999.
  - Converted currency: generic GBP `775` 01-15, `821` 02-15, `798` 03-15 → no Subscription.
  - Short statement: generic Fitzone `2499` on 01-10 only, range 01-01 to 01-31 → `subscriptions: []`.
  - Id stability: Apple Music `1099` next to iCloud+ `99`, then a second run with Apple Music at `1199` → id changes from `…:1099:…` to `…:1199:…`; Netflix single charge 01-02 with range to 03-25, then a second run adding 02-02 and 03-02 → id changes from `…:yearly:*:netflix` to `…:monthly:*:netflix`.
  - _Requirements: 3.6 (replaced service), 4.1, 5.4 (Introduction cases), 6.2 (4-weekly), 8.2 (id change), 8.5_

- [ ] 22. Sample statements (`samples.test.ts`)
  - For each of `us-signed.csv`, `uk-debit-credit.csv`, `eu-semicolon.csv` and `with-preamble.csv`: read it with `node:fs`, run `parseStatement` (no options), `normalizeTransactions` and `detectSubscriptions` (no options), and compare with the Req 10.1 tables: the Subscriptions in order with `merchantKey`, `merchant`, `currentAmountCents`, `yearlyCostCents` and `priceHistory`; the shared fields (monthly, active, high, `labels: []`, 3 Regular charges, `missedPeriods: 0`, empty evidence lists, `cadenceAssumed: false`, `introCharge: null`, `freeTrialDate: null`, `startedInStatement: false`, id `sub:<currency>:monthly:*:<merchantKey>`); the Statement range; the usage counts per role; the named non-recurring merchants by key.
  - Do not edit any file in `samples/`. A mismatch is a Detector bug or a spec change to raise, not a fixture to adjust (Req 10.2).
  - _Requirements: 10.1, 10.2_

> **Batch 6 done:** every example in the requirements passes end to end; suite green.

---

## Batch 7: generators and correctness properties

Property tests use fast-check's default 100 runs; P1 and P3 use 300 (design "Testing strategy"). Each property's failure message must show the shrunk input.

- [ ] 23. Base generators and the whole-result properties (`test-arbitraries.ts`)
  - Write `isoDateArb` (2020–2030, with a rare 0000–9999 branch), `merchantArb(source)`, `validTxArb` (amounts `−10⁶` to `10⁶` including zero; `USD`, `EUR`, `GBP`) and `junkElementArb` as in design "Generators".
  - Self-tests (`test-arbitraries.test.ts`): every `validTxArb` value passes `validateElement`; every `junkElementArb` value that is not a valid transaction fails it.
  - Property tests (`detect-subscriptions.property.test.ts`):
    - **P1** never throws, on mixed valid and junk arrays with `fc.anything()` options without getters; `usage.length` equals the input length; a non-array throws `TypeError`;
    - **P2** deterministic;
    - **P4** each charge used once, with the Req 1.9 usage rules checked in both directions and `reason` non-null exactly for `"invalid"`;
    - **P14** no mutation (input deep-equals its `structuredClone` taken before the call) and exact 4 + 5 field copies;
    - **P19** adding Zero-amount rows inside the Statement range changes only `evidence.freeTrialDate`, and every added row is `"zero-amount"`.
  - _Requirements: 1.8, 1.9, 1.10, 1.12, 1.13, 2.3, 9.5, 11.1, 11.2, 11.4_

- [ ] 24. Order independence, ids and statement range
  - Property test (`order-independence.property.test.ts`): **P3** on `validTxArb` arrays with forced duplicates and same-date ties, checking `subscriptions` and `statement` deep-equal under a random permutation and each element's `role` and `subscriptionId` unchanged, letting fully equal elements swap.
  - Property test (`ids.property.test.ts`): **P12** (unique ids, the Req 11.12 pattern, remainder equal to `merchantKey`).
  - Property test (`statement.property.test.ts`): **P13** (min and max valid dates or `null`, sorted distinct currencies, `asOf` for valid, invalid and absent options).
  - _Requirements: 1.4, 2.4, 3.4 (input-order independence), 5.4 (tie-break), 7.1, 7.2, 8.3, 8.4, 11.3, 11.12, 11.13_

- [ ] 25. Series generators, amounts and status
  - Add `monthlySeriesArb`, `weeklySeriesArb` and `yearlyPairArb` to `test-arbitraries.ts` as in design "Generators" (the yearly pair shifts only `b`).
  - Self-tests: every generated monthly series has 4–24 charges at one amount with shifts of 0–2 days; every yearly pair is 12 months plus 0–7 days apart.
  - Property tests (`amounts.property.test.ts`): **P5** yearly cost formula; **P6** no floats, including amounts near `MAX_SAFE_INTEGER / 12`, where no unsafe product is reported; **P17** price history.
  - Property test (`status.property.test.ts`): **P18** status against a random valid `asOf`.
  - _Requirements: 6.1, 6.2, 6.4, 6.5, 7.4, 7.5, 7.8, 11.5, 11.6_

- [ ] 26. Cadence, habits, unrelated purchases and refunds
  - Add `habitArb` and `unrelatedChargesArb(input)` to `test-arbitraries.ts`. Self-tests: no 7-day habit has a gap above 16 days; every unrelated charge has a fresh generic key, an input currency and a date inside the input's range.
  - Property test (`detect-subscriptions.property.test.ts`): **P7** unrelated purchases.
  - Property tests (`cadence.property.test.ts`): **P8** missed month (including anchor days 27–28 with a shift of 2, review finding 1); **P9** cadence recognition (monthly anchor 1–31, known weekly, known yearly pair); **P10** habits.
  - Property test (`refunds.property.test.ts`): **P11** a full refund of one middle charge.
  - _Requirements: 2.4, 2.5, 4.1, 4.2, 4.3, 4.5, 5.2, 5.6, 8.5, 11.7, 11.8, 11.9, 11.10, 11.11_

> **Batch 7 done:** P1–P19 green; suite green.

---

## Batch 8: privacy, environment and performance

- [ ] 27. Privacy and environment checks
  - Add the opt-in clock and randomness check to `src/test-no-network-scan.ts` as in design "Privacy and environment": property accesses `Date.now`, `performance.now`, `Math.random`, `crypto.randomUUID`, and a `NewExpression` with callee `Date` and no arguments, found on the syntax tree. The parser and normalizer tests keep calling the existing check unchanged and stay green.
  - `no-network.test.ts` in `src/detect`: run both checks over every non-test `.ts` file of `src/detect`, failing with the file, line and identifier. Self-tests for the new check: fixtures with `Date.now()`, `new Date()`, `Math.random()` and `crypto.randomUUID()` are reported; `new Date(2026, 0, 1)`, a comment mentioning `Date.now` and an identifier `randomize` are not.
  - `node-env.test.ts` in `src/detect`: import `detectSubscriptions` from the package entry (`../index.js`) under the Node environment, run it on a small Netflix fixture, and check that `window`, `document`, `navigator` and `localStorage` are undefined.
  - Extend `src/build.test.ts`: the plain-Node import of `dist/index.js` also calls `detectSubscriptions` on two Netflix charges a month apart and expects one Subscription with id `sub:USD:monthly:*:netflix`.
  - _Requirements: 7.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6; privacy.md_

- [ ] 28. Comparison bound and timing (`performance.test.ts`, `performance.property.test.ts`)
  - Add `driftingLateBandArb` to `test-arbitraries.ts` as in design "Generators".
  - Property test (`performance.property.test.ts`): **P20** for single-Group, single-band inputs of `b` charges from `driftingLateBandArb`, `monthlySeriesArb` with one amount and random dates at one amount, for known and generic sources: `detectSubscriptionsCounted` with a fresh counter gives `counter.comparisons ≤ 24 × b²`.
  - `performance.test.ts`:
    - bands of 100 and 1,000 charges, known and generic, in two shapes (equal charges on consecutive days; 10 interleaved drifting monthly chains with every fourth step 7 days late): `counter.comparisons ≤ 24 × b²` for each;
    - the two 10,000-transaction inputs of Req 11.14 (a 1,000-charge band plus filler; a year of weekday lunches at `1050` plus filler) each finish in under 2 s after one warm-up call, timed with `performance.now()` in the test file only;
    - two calls with separate counters give equal counts (no state kept between calls).
  - _Requirements: 11.14, 12.5_

> **Batch 8 done:** feature complete; suite green.

---

- [ ] 29. Checkpoint: run the whole suite
  - From the repo root, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. All must pass with no skipped or `.only` tests, and the statement-parser and merchant-normalizer suites must be unchanged.
  - Check that `packages/core/dist` contains no test files, no `test-arbitraries`, `test-fixtures` or `test-no-network-scan` output and no `node:fs` import, and that `dist/index.js` exports `detectSubscriptions` and not `detectSubscriptionsCounted` in plain Node (`build.test.ts` covers the call).
  - Check that every property P1–P20 has a passing `it`/`test` whose name starts with its ID, and that `grep -rE 'console\.|toLocale|localeCompare|Intl\.|new Date|Date\.now|Math\.random' packages/core/src/detect` finds nothing outside test files.
  - Check traceability: every acceptance criterion in `requirements.md` (1.1–1.14, 2.1–2.8, 3.1–3.11, 4.1–4.8, 5.1–5.7, 6.1–6.5, 7.1–7.8, 8.1–8.5, 9.1–9.8, 10.1–10.2, 11.1–11.14, 12.1–12.6) appears in at least one task's `_Requirements_` line above.
  - Stop and report results. Do not start the classifier or any other spec.
  - _Requirements: all (traceability)_

---

## Property → task map

| Property | Task |
| --- | --- |
| P1 never throws | 23 |
| P2 deterministic | 23 |
| P3 order independence | 24 |
| P4 each charge used once | 23 |
| P5 yearly cost formula | 25 |
| P6 no floats | 25 |
| P7 unrelated purchases | 26 |
| P8 missed month | 26 |
| P9 cadence recognition | 26 |
| P10 habits | 26 |
| P11 refunds | 26 |
| P12 ids | 24 |
| P13 statement range | 24 |
| P14 no mutation and exact copies | 23 |
| P15 date arithmetic | 1 |
| P16 bands | 6 |
| P17 price history | 25 |
| P18 status | 25 |
| P19 zero rows | 23 |
| P20 comparison counter | 28 |
