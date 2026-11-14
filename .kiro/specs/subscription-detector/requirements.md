# Requirements Document

## Introduction

The `subscription-detector` module lives in `packages/core/src/detect` and is exported from `@zombills/core`. It takes the normalized transactions of one statement (the output of `normalizeTransactions`, merchant-normalizer spec) and finds the recurring charges in them. Each recurring charge becomes a `Subscription`, which the web UI shows as an undead card.

The detector sits between the merchant normalizer and the classifier. It groups charges by merchant key and currency, splits a key into separate series when one key bills several subscriptions, decides the cadence (weekly, monthly or yearly), computes the current and yearly cost in integer cents, decides whether the subscription is still active, and gives every subscription a stable id. It also returns the evidence the classifier needs to set labels (price history, an introductory low charge, a zero-amount trial row, whether the subscription started inside the statement).

The module is pure TypeScript with no network calls, no DOM access and no clock. Any "as of" date is derived from the statement or passed in as an option. Statement data never leaves the browser.

Out of scope for this spec:

- Labels (`zombie`, `possessed`, `trial-trap`). The detector always returns `labels: []`; the classifier spec sets them from the evidence defined here.
- The `cancel` field (cancel-helper spec). The detector never sets it.
- Cadences other than weekly, monthly and yearly. Fortnightly (every 2 weeks), quarterly and half-yearly plans are not detected: their charges do not satisfy any cadence in Requirement 4 and are reported as not recurring. The `Subscription.cadence` type stays `"weekly" | "monthly" | "yearly"`.
- 4-weekly plans, and any plan billed every 28 to 31 days. Each interval is within ±3 days of `addMonths` of the previous charge, so they are detected as monthly. For a 4-weekly plan, `yearlyCostCents` counts 12 charges where the user pays 13, so the yearly cost is understated by 1/13 (about 7.7 %). Example: The New York Times at `2500` every 28 days gives `yearlyCostCents: 30000`; the user pays `32500`. Other "every N days" plans are not detected.
- Two subscriptions of the same merchant key, currency, cadence and price paid from the same account (for example two family members' Spotify accounts at the same price). Requirement 5.6 rejects such a band as too dense, so neither is reported.
- A real subscription next to two or more one-off purchases at the same price within its span. Requirement 5.6 rejects it as too dense (known limitation). Example: iCloud+ at `99` on 2026-01-12, 02-12 and 03-12 plus app purchases at `99` on 2026-01-20 and 02-25 under the same `APPLE.COM/BILL` key give no Subscription (Requirement 5.6 fixture).
- A subscription that ends and is replaced by a different service under the same unidentified key at a price within a factor of 2 in the next period (for example Apple Music at 10.99 ending in January and Apple TV+ at 9.99 starting in February, both as `APPLE.COM/BILL`). Requirement 3.6 merges them as one series with a price change, because the bank text cannot tell them apart.
- Currency conversion. Each currency is detected on its own (`money.md`).
- Charges converted by the bank from another currency whose amount varies by more than 5 % from month to month (exchange rate plus any foreign-transaction fee). They fall into different Amount bands (Requirement 3.2) and are not detected. Example: a UK card paying a USD 10.00 plan with GBP charges of `775`, `821` and `798` gives no Subscription.
- Merging charges across statements. Each call sees one set of transactions; the Reaper may concatenate several statements before calling.
- Short statements. A `"generic"` or `"unidentified"` subscription needs at least 2 charges (Requirement 5.1), so a statement covering one month usually shows none of them (Fitzone Gym charged once on 2026-01-10 in a statement covering 2026-01-01 to 01-31 gives `subscriptions: []`), and a generic annual plan needs more than 12 months of data. The web UI spec should prompt for at least 2 to 3 months of statements.
- Id stability in two cases (Requirement 8), which the graveyard-ui spec must plan for:
  - On a key shared by several Subscriptions of one cadence (such as `APPLE.COM/BILL`), the id holds `currentAmountCents`, so it changes with a price change (Apple Music from `1099` to `1199` changes `…:1099:…` to `…:1199:…`), and changes to `*` when the other Subscription is absent from a later statement.
  - A single-charge Subscription's cadence is assumed (Requirement 5.4), so its id changes between `yearly` and `monthly` when a later statement shows more charges.

---

## Glossary

- **Detector**: The `subscription-detector` module within `packages/core/src/detect`.
- **NormalizedTransaction**: The merchant-normalizer type: a `Transaction` `{ date, description, amountCents, currency }` plus `merchant: MerchantIdentity` `{ key, displayName, source, serviceId, processor }`. `date` is ISO `yyyy-mm-dd`; `amountCents` is integer cents, positive = money out, negative = money in; `source` is `"known"`, `"generic"` or `"unidentified"`.
- **Valid transaction**: An input element that passes Requirement 2.1. Invalid elements are skipped and reported.
- **Charge**: A valid transaction with `amountCents > 0` (money out).
- **Credit**: A valid transaction with `amountCents < 0` (money in).
- **Zero-amount row**: A valid transaction with `amountCents === 0`.
- **Group**: All valid transactions with the same `merchant.key` and the same `currency`.
- **Statement range**: `firstDate` and `lastDate`, the earliest and latest `date` among all valid transactions (charges, credits and zero-amount rows of every merchant).
- **As-of date**: The date the Detector judges "active" and "ended" against: `options.asOf` when valid, otherwise the statement's `lastDate` (Requirement 7).
- **Day number**: The number of days from 1970-01-01 to a date in the proleptic Gregorian calendar, computed with integer arithmetic. **Days between** `a` and `b` is `dayNumber(b) − dayNumber(a)`.
- **Months after** (`addMonths(d, k)`): The date `k` calendar months after `d`, keeping the day of month of `d`, or the last day of the target month when that month is shorter. `addMonths(2026-01-31, 1)` = `2026-02-28`; `addMonths(2024-01-31, 1)` = `2024-02-29`; `addMonths(2024-02-29, 12)` = `2025-02-28`. A year is 12 months.
- **Period**: One step of a cadence: 7 days (weekly), 1 month (monthly), 12 months (yearly).
- **Tolerance**: The allowed difference in days between an actual and an expected charge date: ±2 days weekly, ±3 days monthly, ±7 days yearly (Requirement 4).
- **Amount band**: A set of charges in one Group whose amounts are close enough to be the same price with small variation (Requirement 3.2).
- **Segment**: A run of charges from one Amount band that follow each other on schedule for one cadence (Requirement 4).
- **Series**: The charges of one subscription: one Segment, or several Segments joined by a price change or an introductory charge (Requirement 3). Every reported `Subscription` is one Series.
- **Regular charge**: A Series charge that is not the Introductory charge.
- **Introductory charge**: A single lower charge one Period before a Series' first Regular charge (Requirement 3.7). Evidence for the classifier's trial-trap label.
- **Interval multiple** (`k`): For two consecutive Regular charges `a`, `b` of a Series, the number of Periods between them (1 = on schedule, 2 = one missed charge).
- **Confidence**: `"high"`, `"medium"` or `"low"`, how strong the evidence for a Subscription is (Requirement 5).
- **Subscription status**: `"active"` or `"ended"` (Requirement 7).
- **Content order**: A total order on Valid transactions used to end every tie-break: by `date`, then `amountCents`, then `description`, then `merchant.displayName`, `merchant.source`, `merchant.serviceId` (`null` first) and `merchant.processor` (`null` first), all strings in code-unit order, and only then by input position. Input position is therefore reached only for elements whose four Transaction fields and `merchant` are all equal.

---

## Requirements

### Requirement 1: Public API and result shape

**User Story:** As the web UI, I want one function that turns a normalized statement into subscriptions plus the statement facts I need to explain them, so that I can show the undead cards, the date range and which rows were used without re-deriving anything.

#### Acceptance Criteria

1. THE Detector SHALL export from `@zombills/core` a function `detectSubscriptions(transactions: readonly NormalizedTransaction[], options?: DetectOptions): DetectionResult` and the types `DetectOptions`, `DetectionResult`, `Subscription`, `Cadence`, `SubscriptionStatus`, `Confidence`, `DetectionEvidence`, `PricePoint`, `StatementInfo`, `TransactionRole` and `TransactionUsage`.
2. THE Detector SHALL define `DetectOptions` as `{ asOf?: string }`, where `asOf` is an ISO `yyyy-mm-dd` date (Requirement 7).
3. THE Detector SHALL define `DetectionResult` as `{ subscriptions: Subscription[]; statement: StatementInfo; usage: TransactionUsage[] }`.
4. THE Detector SHALL define `StatementInfo` as `{ firstDate: string | null; lastDate: string | null; asOf: string | null; asOfSource: "option" | "statement" | null; currencies: string[] }`. `firstDate` and `lastDate` are the Statement range, `null` when there is no valid transaction. `asOf` and `asOfSource` are as in Requirement 7. `currencies` lists the distinct currencies of all valid transactions, sorted ascending.
5. THE Detector SHALL define `Subscription` as the architecture's type extended with detection fields:

   ```ts
   type Subscription = {
     id: string;                       // Requirement 8
     merchant: string;                 // display name (Criterion 6)
     merchantKey: string;              // merchant.key of every charge
     serviceId: string | null;         // merchant.serviceId (non-null only for source "known")
     source: MerchantSource;           // merchant.source
     currency: string;
     cadence: Cadence;                 // "weekly" | "monthly" | "yearly"
     charges: NormalizedTransaction[]; // Series charges, oldest first
     currentAmountCents: number;
     yearlyCostCents: number;
     labels: ("zombie" | "possessed" | "trial-trap")[]; // always [] from the Detector
     priceHistory: PricePoint[];       // { date: string; amountCents: number }
     status: SubscriptionStatus;       // "active" | "ended"
     confidence: Confidence;           // "high" | "medium" | "low"
     evidence: DetectionEvidence;      // Requirement 9
     cancel?: { url?: string; email?: string; notes?: string }; // never set by the Detector
   };
   ```

6. THE Detector SHALL set `merchant` to the `merchant.displayName` of the latest charge in the Series, and `merchantKey`, `serviceId`, `source` and `currency` to the values shared by every charge of the Series. Requirement 2.1 makes `source` and `serviceId` functions of `merchant.key`, so every charge of a Group shares them, and "the Group's source" is well defined.
7. THE Detector SHALL set `labels` to an empty array and SHALL NOT set `cancel` on any Subscription.
8. THE Detector SHALL define `TransactionUsage` as `{ index: number; role: TransactionRole; subscriptionId: string | null; reason: string | null }` and `TransactionRole` as one of `"subscription-charge"`, `"refunded-charge"`, `"refund"`, `"money-in"`, `"zero-amount"`, `"not-recurring"`, `"invalid"`. THE `usage` array SHALL have exactly one entry per input element, in input order, with `index` equal to its position in the input.
9. THE Detector SHALL set `subscriptionId` to the Subscription's id exactly when the role is `"subscription-charge"`, and to `null` otherwise. Every charge listed in a Subscription's `charges` SHALL have role `"subscription-charge"` with that Subscription's id, and every `"subscription-charge"` entry SHALL be listed in exactly that Subscription's `charges`. A zero-amount row that the Detector uses as trial evidence (Requirement 9.5) keeps role `"zero-amount"`.
10. THE Detector SHALL set `reason` to a non-empty description for role `"invalid"` (naming the field that failed) and to `null` for every other role.
11. THE Detector SHALL return `subscriptions` sorted by `yearlyCostCents` descending, then by `id` ascending (code-unit order).
12. THE Detector SHALL return new objects and SHALL NOT mutate the input array or any input element. Each object in `charges` SHALL be a new object holding copies of exactly the four Transaction fields (`date`, `description`, `amountCents`, `currency`) and a new `merchant` object with exactly the five MerchantIdentity fields (`key`, `displayName`, `source`, `serviceId`, `processor`) of the input element it comes from. Other properties of the input are not copied.
13. THE `detectSubscriptions` function SHALL throw a `TypeError` only when `transactions` is not an array (a type contract violation, as in the statement parser and normalizer). FOR ALL arrays of plain data values (primitives, `null`, and plain objects and arrays without getters, proxies or prototype tricks, with any contents) and any plain-data `options` value, it SHALL return a `DetectionResult` and SHALL NOT throw.
14. WHEN the input is an empty array, THE Detector SHALL return `subscriptions: []`, `usage: []` and a `StatementInfo` with `null` dates, `asOf` as in Requirement 7.2 and `currencies: []`.

---

### Requirement 2: Which transactions count

**User Story:** As a user, I want only money I actually paid to count towards a subscription, and refunded charges left out, so that the app never asks me to cancel something I got my money back for.

#### Acceptance Criteria

1. THE Detector SHALL treat an input element as a Valid transaction only when it is a plain object and: `date` is a string of the form `yyyy-mm-dd` naming a real calendar date; `description` is a string; `amountCents` is a safe integer (`Number.isSafeInteger`); `currency` is a string of exactly 3 upper-case ASCII letters; and `merchant` is a plain object whose `key` and `displayName` are non-empty strings, whose `source` is one of the three MerchantSource values, whose `serviceId` and `processor` are each a string or `null`, and whose `key` agrees with `source` as in normalizer Requirement 1.3–1.7: for `"known"`, `key` contains no `:` and `serviceId === key`; for `"generic"`, `key` starts with `"merchant:"` and `serviceId` is `null`; for `"unidentified"`, `key` starts with `"unidentified:"` and `serviceId` is `null`. IF an element fails any of these checks, THEN THE Detector SHALL give it role `"invalid"` with a `reason`, and SHALL ignore it in every other requirement, including the Statement range.
2. THE Detector SHALL build Series only from Charges (`amountCents > 0`).
3. THE Detector SHALL give every Zero-amount row role `"zero-amount"`. A Zero-amount row SHALL NOT be a Series charge, SHALL NOT count as a missed or present charge in any interval, and SHALL NOT change `currentAmountCents` or `priceHistory`. Its only effect on a Subscription is the trial evidence in Requirement 9.5.
4. THE Detector SHALL match Credits to Charges as full refunds before building any Series: a Credit `r` is a full refund of a Charge `c` when they are in the same Group, `−r.amountCents === c.amountCents`, and `r.date` is 0 to 45 days after `c.date` (inclusive). THE Detector SHALL process Credits in ascending date order and match each to the latest still-unmatched Charge that qualifies; each Charge and each Credit SHALL be matched at most once. WHEN several Credits share a date, or several qualifying Charges share a date, THE Detector SHALL break the tie by Content order, so that only identical transactions are ordered by position.
5. WHEN a Charge is fully refunded (Criterion 4), THE Detector SHALL give the Charge role `"refunded-charge"` and the Credit role `"refund"`, and SHALL treat the Charge as absent when building Series. A refunded month in the middle of a monthly Series therefore counts as a missed charge (Requirement 4.5).
6. THE Detector SHALL give every Credit that is not a full refund role `"money-in"`. Such Credits, including partial refunds, SHALL NOT remove or change any Charge; a partial refund in the same Group as a Series is reported as evidence only (Requirement 9.7).
7. IF a Credit and a Charge are in different Groups, THEN THE Detector SHALL NOT match them as a refund, even when the amounts match. The Credit gets role `"money-in"` and the Charge is judged on its own. Example: the normalizer gives a refund line its own key when the bank prints different text (`"ONLINE MARKETPLACE ORDER 2K4LL9"` → `merchant:online-marketplace-order`, `"ONLINE MARKETPLACE REFUND 2K4LL9"` → `merchant:online-marketplace-refund`), so the two are not matched.
8. THE Detector SHALL give every Charge that is not in any Series role `"not-recurring"`.

---

### Requirement 3: Grouping, amount bands and series

**User Story:** As a user whose bank prints several Apple subscriptions as the same `APPLE.COM/BILL` line, I want each one shown as its own card, and as a user whose Netflix price went up, I want one Netflix card that shows the increase, so that the cards match what I actually pay for.

#### Acceptance Criteria

1. THE Detector SHALL group Charges by `merchant.key` and `currency`. Charges from different Groups SHALL never be in the same Series. Charges in different currencies SHALL never be compared, merged or summed.
2. THE Detector SHALL split each Group into Amount bands as follows, using only integer arithmetic: take the distinct charge amounts in ascending order; the smallest amount `m` not yet in a band starts a new band; every remaining amount `a` with `(a − m) × 20 ≤ m` joins that band (at most 5 % above `m`); repeat until every amount is in a band. A band holds every Charge of the Group whose amount is in it. Examples: `999` and `1029` are one band (`30 × 20 = 600 ≤ 999`); `999` and `1049` are two bands (`50 × 20 = 1000 > 999`); `1549` and `1799` are two bands; `99` and `1099` are two bands.
3. THE Detector SHALL find Segments within each Amount band only (Requirement 4 defines when consecutive charges are on schedule). Two charges in different bands SHALL be in the same Series only through Criterion 6 or Criterion 7.
4. WHEN a band holds charges that do not fit any Segment (a one-off purchase at the same price as a subscription), THE Detector SHALL leave them out of every Series, subject to the density rule in Requirement 5.6. The Detector SHALL choose the Segments of a band that cover the most charges; on a tie it SHALL prefer the choice whose first Segment starts earliest, then the one with the smaller sum of absolute day deviations from the expected dates (for each charge, the smallest deviation over its expected dates in Requirement 4.2–4.3), then the one whose list of covered charges, each in Content order and compared element by element by Content order, is smallest. Example: one band with charges on Jan 10, Feb 9, Feb 11 and Mar 10 gives the Segment Jan 10, Feb 9, Mar 10; Feb 11 is `"not-recurring"`. The choice SHALL depend only on the set of charges, not on input order.
5. THE Detector SHALL keep two Segments of the same Group apart as two different subscriptions WHEN their date spans overlap, that is, when either has a charge dated between the first and last charge of the other. Example: iCloud+ at `99` and Apple Music at `1099` under the key `unidentified:apple:apple.com/bill 866-712-7753 ca`, both charged every month, give two Series and two Subscriptions.
6. THE Detector SHALL join an earlier Segment `A` and a later Segment `B` of the same Group and cadence, from different bands, into one Series with a price change WHEN all of these hold:
   - every charge of `A` is dated before every charge of `B`;
   - the first charge of `B` is 1 or 2 Periods after the last charge of `A`, within Tolerance (Requirement 4);
   - with `p` the amount of the last charge of `A` and `q` the amount of the first charge of `B`, `max(p, q) ≤ 2 × min(p, q)`;
   - `A` has at least 2 charges, or the Group's `source` is `"known"`.

   The 2-charge condition stops a varying generic purchase (a supermarket at `5430` in January and `6118` in February) from being read as one charge followed by a price change. WHEN `A` could join more than one Segment, THE Detector SHALL join the one whose first charge is earliest, then the one with the smaller `|q − p|`, then the one whose first charge comes first in Content order. Joining MAY repeat, so a Series can hold several price changes. Example: Netflix at `1549` on 2026-01-02 and 2026-02-02 and `1799` on 2026-03-02 is one Series.
7. WHEN the Group's `source` is `"known"`, a Charge `c` is in no Series, and a Series `S` of the same Group has at least 2 Regular charges, `c.amountCents` is lower than the amount of the first Regular charge of `S`, and the first Regular charge of `S` is one Period after `c` within Tolerance, and Criterion 6 did not join `c`'s Segment to `S`, THEN THE Detector SHALL add `c` to `S` as its Introductory charge. A Series SHALL have at most one Introductory charge; when several Charges qualify, THE Detector SHALL take the latest, then the one with the lower amount, then the first in Content order. Example: a `100` charge on 2026-01-10 followed by `1499` on 2026-02-10 and 2026-03-10, all with key `netflix`, gives one Series whose Introductory charge is the `100` charge. Groups of source `"generic"` and `"unidentified"` never get an Introductory charge, because a cheaper one-off purchase under the same text would give a false trial signal. Negative example: under the key `unidentified:apple:apple.com/bill 866-712-7753 ca`, an app purchase of `199` on 2026-01-10 followed by Apple Music at `1099` on 2026-02-10 and 2026-03-10 gives a Series with `introCharge: null`; the `199` charge is `"not-recurring"`.
8. THE Detector SHALL count only Regular charges towards the minimum evidence (Requirement 5), the interval rules (Requirement 4) and the status (Requirement 7). The Introductory charge SHALL appear in `charges` and `priceHistory` and in `evidence.introCharge` (Requirement 9.4).
9. THE Detector SHALL apply Criteria 2–8 to every source alike, except that Criterion 7 applies to `"known"` Groups only.

   *Note:* splitting a key into several Series is how unidentified keys such as `APPLE.COM/BILL` and generic keys that bill two plans are separated.
10. THE Detector SHALL run these steps in this order, and no step SHALL revisit the result of an earlier one:
    1. Validate (Requirement 2.1) and match full refunds (Requirement 2.4–2.5).
    2. Form Groups and Amount bands (Criteria 1–2).
    3. Per band and per cadence, find the candidate Segments (Requirement 4). Weekly Segments are not considered for `"generic"` and `"unidentified"` Groups, because they can never be reported (Requirement 5.2).
    4. Per band, choose one cadence and the Segments of that cadence that cover the most charges (Criterion 4, Requirement 4.7). One band SHALL hold Segments of one cadence only. Coverage counts only Segments of 2 or more charges; every charge of the band left over is a one-charge Segment, which has no cadence of its own and takes the cadence of the Segment it is joined to in step 5.
    5. Join Segments into Series (Criterion 6), then add Introductory charges (Criterion 7).
    6. Apply the minimum evidence and the density rule (Requirement 5.1, 5.6) to each Series. A rejected Series SHALL NOT be split, shortened or re-chosen; its charges get role `"not-recurring"` (Requirement 5.5).
    7. Report single known charges (Requirement 5.4).
    8. Compute amounts, status, evidence and ids (Requirements 6–9).
11. Examples the implementation SHALL satisfy (step order of Criterion 10):

    | Charges (one Group, one band) | Result |
    | --- | --- |
    | Generic coffee at `450` every Monday 2026-01-05 to 2026-02-02, none for 3 weeks, then 2026-03-02, 03-09, 03-16, 03-23 | no Subscription. The cover is the monthly Segment 2026-01-05, 02-02, 03-02 (`n = 3`); its span holds `m = 6` band charges, `6 ≥ 5`, so step 6 rejects it, and the shorter Segment 02-02, 03-02 is never tried. All 9 charges are `"not-recurring"`. |
    | Generic `999` on 2026-01-01, 01-08, 01-15, 02-01, 03-01, 04-01 | one monthly Subscription 2026-01-01, 02-01, 03-01, 04-01 (`n = 4`, `m = 6 < 7`, `confidence: "high"`, `firstChargeDate: "2026-01-01"`); 2026-01-08 and 01-15 are `"not-recurring"`. Weekly Segments are not considered (step 3). |

---

### Requirement 4: Cadence

**User Story:** As a user whose monthly charges land on the 28th in February, move to Monday when the 1st is a Sunday, or skip a month when a payment fails, I want them still recognised as one monthly subscription, so that real subscriptions are not missed because of how banks process dates.

#### Acceptance Criteria

1. THE Detector SHALL support exactly three cadences: `"weekly"`, `"monthly"` and `"yearly"`. Every Series SHALL have exactly one cadence.
2. FOR two consecutive Regular charges `a` and `b` of a Series and an Interval multiple `k`, THE Detector SHALL compute the expected date of `b` as: weekly, `a` plus `7 × k` days; monthly, `addMonths(a, k)`; yearly, `addMonths(a, 12)`. For monthly, WHEN `a` is the last day of its month, the last day of the target month SHALL also count as an expected date, so `2026-02-28` → `2026-03-31` has a deviation of 0.
3. THE Detector SHALL treat `b` as on schedule after `a` WHEN the absolute number of days between `b` and an expected date of `b` is at most the Tolerance for the cadence:

   | Cadence | Tolerance | Allowed `k` |
   | --- | --- | --- |
   | weekly | ±2 days | 1 or 2 |
   | monthly | ±3 days | 1 or 2 |
   | yearly | ±7 days | 1 |

   The tolerance covers weekends, bank holidays and processing delays. It is measured from the previous Regular charge, so a merchant that moves its billing day once (from the 3rd to the 5th) stays one Series.

   THE Detector SHALL also treat `b` as on schedule WHEN it is within the same Tolerance of the expected date computed from the Segment's first Regular charge `f`: Criterion 2 with `a = f` and `k = j` (yearly: `addMonths(f, 12 × j)`), where `j` is `b`'s period index (the sum of the `k` values of the intervals from `f` to `b`). This keeps a charge that a shift pushed across a month end, or moved back before a weekend, from splitting the Series.
4. THE Detector SHALL require, for a Series with 2 or more Regular charges, that every interval between consecutive Regular charges is on schedule (Criterion 3) or late (Criterion 6), that at least one interval has `k = 1`, and that the number of intervals with `k = 2` is at most the number with `k = 1`. So a fortnightly habit is never weekly (every interval has `k = 2`), and two charges two months apart are not monthly.
5. THE Detector SHALL count every interval with `k = 2` as one missed period in `evidence.missedPeriods`. A missed or fully refunded month in a monthly Series SHALL NOT end the Series. The gap at a price-change join (Requirement 3.6) is an interval like any other: it has `k = 1` or `k = 2` by how many Periods separate the two charges, and counts towards Criterion 4 and `missedPeriods` accordingly.
6. FOR monthly Series only, THE Detector SHALL accept a late charge: `b` is late after `a` WHEN `b` is 4 to 10 days after the expected date for `k = 1`, and either `b` is the last Regular charge of the Series, or the next Regular charge `c` is on schedule after `a` with `k = 2` (so the schedule continues from `a`, not from the late `b`), or `c` is on schedule after `b` with `k = 1` (the merchant re-bills from the retry date). Two consecutive Regular charges SHALL NOT both be late. For Criterion 4, the interval into a late charge and the interval out of it each count as `k = 1`, and neither counts as a missed period. THE Detector SHALL list late charges in `evidence.lateChargeDates`. A charge more than 3 days early, or more than 10 days late, is not on schedule.
7. WHEN a band's charges could form Segments of more than one cadence, THE Detector SHALL choose for the whole band the cadence whose cover (Requirement 3.10 step 4) holds more charges, then the shorter Period. All Segments of a band have that cadence.
8. Examples the implementation SHALL satisfy (monthly, one Group, one band):

   | Regular charge dates | Result |
   | --- | --- |
   | 2026-01-31, 2026-02-28, 2026-03-31 | one monthly Series, `missedPeriods: 0` |
   | 2024-01-31, 2024-02-29, 2024-03-29 | one monthly Series (`addMonths(2024-02-29, 1)` = `2024-03-29`) |
   | 2026-01-30, 2026-03-02, 2026-03-30 | one monthly Series (2026-03-02 is 2 days after 2026-02-28) |
   | 2026-01-01, 2026-02-02, 2026-03-02 (weekend shift) | one monthly Series |
   | 2026-01-15, 2026-02-15, 2026-04-15, 2026-05-15 | one monthly Series, `missedPeriods: 1` |
   | 2026-01-15, 2026-02-22, 2026-03-15 | one monthly Series, `lateChargeDates: ["2026-02-22"]` |
   | 2026-01-15, 2026-02-22, 2026-03-22 (re-billed from the retry date) | one monthly Series, `lateChargeDates: ["2026-02-22"]` |
   | 2026-01-15, 2026-02-26, 2026-03-26 | 2026-02-26 is 11 days late: one monthly Series 2026-02-26, 2026-03-26 (subject to Requirement 5); 2026-01-15 is not recurring |
   | 2026-01-27, 2026-03-01, 2026-03-27, 2026-04-27 | one monthly Series, `missedPeriods: 0` (2026-03-27 is 0 days from `addMonths(2026-01-27, 2)`) |
   | 2026-01-02, 2026-02-02, 2026-02-27, 2026-04-01, 2026-05-01 (gym billed on the 1st) | one monthly Series, `missedPeriods: 0` (2026-04-01 is 1 day before `addMonths(2026-01-02, 3)` = 2026-04-02) |
   | 2026-01-15, 2026-03-15 | no monthly Series (no `k = 1` interval) |
   | 2026-01-15, 2026-04-15, 2026-07-15 (quarterly) | no Series (out of scope) |

---

### Requirement 5: Minimum evidence, habits and confidence

**User Story:** As a user with a statement that covers only one to three months, I want real subscriptions found even with few charges, but I do not want my weekly coffee or my supermarket shop to rise as an undead card, so that every card is worth my attention.

#### Acceptance Criteria

1. THE Detector SHALL report a Series as a Subscription only when it meets the minimum evidence for its source and cadence, and SHALL set `confidence` as follows (`n` = number of Regular charges):

   | `source` | Cadence | Minimum | `confidence` |
   | --- | --- | --- | --- |
   | `known` | monthly or yearly | `n ≥ 2` | `"high"` |
   | `known` | weekly | `n ≥ 3` | `"high"` |
   | `generic` or `unidentified` | monthly | `n ≥ 3`, or `n = 2` with both charges of exactly equal amount | `"high"` when `n ≥ 3`; `"medium"` when `n = 2` |
   | `generic` or `unidentified` | yearly | `n ≥ 2` | `"high"` when `n ≥ 3`; `"medium"` when `n = 2` |
   | `generic` or `unidentified` | weekly | never reported | n/a |
   | `known` | any, single charge | Criterion 4 | `"low"` |

2. THE Detector SHALL NOT report weekly Series for `"generic"` or `"unidentified"` sources. A weekly same-price habit (a coffee shop every Monday, a weekly supermarket shop) never names a Known service, so it never becomes a weekly Subscription.
3. *(Note, not a testable criterion; kept so the numbering of Criteria 4–7 does not change.)* Amount bands (Requirement 3.2) keep varying purchases apart: supermarket, fuel and restaurant charges whose amounts differ by more than 5 % fall into different bands and so form no Segment of more than one charge.
4. WHEN a Group of source `"known"` yields no reported Subscription and has at least one Charge that is not fully refunded, THE Detector SHALL report one Subscription for the Group's latest such Charge (ties broken by Content order, so `1549` and `999` Netflix charges on the same date give `999` whatever the input order), with that charge as its only Regular charge, `confidence: "low"` and `evidence.cadenceAssumed: true`. Its cadence SHALL be `"monthly"` WHEN the As-of date is on or before `addMonths(charge date, 1)` plus 3 days (the next monthly charge could not appear yet), and `"yearly"` otherwise (a monthly plan would have charged again, so the charge is more likely an annual plan). The Group's other Charges SHALL get role `"not-recurring"`. The Detector SHALL NOT report single charges of `"generic"` or `"unidentified"` sources.
5. A Series that does not meet its minimum SHALL NOT be reported, and its charges, including an Introductory charge, SHALL get role `"not-recurring"` (unless Criterion 4 reports one of them).
6. *(Density rule)* FOR every candidate Series, with `n` its Regular charges and `m` the number of Charges of its Group (not fully refunded) whose amount lies in any Amount band of the Series and whose date lies from its first to its last Regular charge inclusive, THE Detector SHALL reject the Series WHEN `m ≥ 2 × n − 1`. This stops a weekly or fortnightly same-price habit from being read as monthly by picking one charge a month (a fortnightly habit gives `m = 2 × n − 1` over the span of the picked charges), while allowing an occasional one-off purchase at the same price (an app bought at `99` next to three iCloud+ charges at `99`: `m = 4`, `n = 3`, kept). Two such purchases are too many: iCloud+ at `99` on 2026-01-12, 02-12 and 03-12 plus app purchases at `99` on 2026-01-20 and 02-25, all under the key `unidentified:apple:apple.com/bill 866-712-7753 ca`, give `m = 5 ≥ 5`, so no Subscription is reported and all five charges are `"not-recurring"` (a known limitation, see the Introduction).
7. THE Detector SHALL record `n` in `evidence.regularChargeCount`.

---

### Requirement 6: Amounts, price history and yearly cost

**User Story:** As a user, I want each card to show what I pay now and what that costs per year, in exact cents, so that the tombstone's saving is correct.

#### Acceptance Criteria

1. THE Detector SHALL set `currentAmountCents` to the amount of the latest Regular charge of the Series.
2. THE Detector SHALL set `yearlyCostCents` to `currentAmountCents × 52` for weekly, `currentAmountCents × 12` for monthly and `currentAmountCents × 1` for yearly, computed in integer arithmetic. It SHALL NOT average, divide or round any amount.
3. THE Detector SHALL allow amounts within one Series to vary within the Amount band (Requirement 3.2) and across bands only through a price change (Requirement 3.6) or an Introductory charge (Requirement 3.7). The latest charge decides `currentAmountCents` in every case.
4. THE Detector SHALL build `priceHistory` from the Series charges in date order (Introductory charge included): the first charge, then every charge whose `amountCents` differs from the previous charge's. Each entry is `{ date, amountCents }` of that charge. So `priceHistory` is never empty, its last entry's `amountCents` equals `currentAmountCents`, and a Series with one constant price has exactly one entry.
5. Every money field the Detector returns (`currentAmountCents`, `yearlyCostCents`, `priceHistory[].amountCents`, `evidence.introCharge.amountCents`, `evidence.partialRefunds[].amountCents`) SHALL be a safe integer. FOR inputs with `|amountCents| ≤ 999_999_9900` (the parser's limit) `yearlyCostCents` stays below `Number.MAX_SAFE_INTEGER`; for larger valid inputs, WHEN any of these fields would not be a safe integer, THE Detector SHALL leave the Series unreported and give its charges role `"not-recurring"`.

---

### Requirement 7: As-of date, active and ended

**User Story:** As a user, I want to see which subscriptions have already stopped charging me, so that I do not try to bury something that is already dead, while still seeing what it used to cost.

#### Acceptance Criteria

1. WHEN `options.asOf` is a string of the form `yyyy-mm-dd` naming a real calendar date, THE Detector SHALL use it as the As-of date and set `statement.asOf` to it and `statement.asOfSource` to `"option"`.
2. WHEN `options.asOf` is absent or invalid, THE Detector SHALL ignore it and use the Statement range's `lastDate` as the As-of date, with `asOfSource: "statement"`. WHEN there is also no valid transaction, `asOf` and `asOfSource` SHALL be `null`.
3. THE Detector SHALL NOT read the system clock, `Date.now()`, `new Date()` without arguments, the time zone or the locale. All date arithmetic SHALL be calendar arithmetic on `yyyy-mm-dd` strings or Day numbers.
4. THE Detector SHALL set `evidence.nextExpectedDate` to the expected date one Period after the last Regular charge (Requirement 4.2 with `k = 1`; for monthly, `addMonths(last, 1)`).
5. THE Detector SHALL set `status: "ended"` WHEN the As-of date is more than the grace after `evidence.nextExpectedDate`, and `status: "active"` otherwise. The grace is 2 days weekly, 10 days monthly (the late-charge allowance of Requirement 4.6, so a charge that would still be accepted as late cannot have been missed yet) and 7 days yearly. Example: a monthly Series whose last charge is 2026-02-20 is active with As-of date 2026-03-30 (2026-03-20 + 10 days) and ended with As-of date 2026-03-31.
6. THE Detector SHALL report ended Subscriptions with the same fields and the same minimum-evidence rules as active ones. `currentAmountCents` and `yearlyCostCents` of an ended Subscription describe the last price it charged.
7. A single-charge Subscription (Requirement 5.4) SHALL get its status from Criterion 5 with its assumed cadence, like any other Subscription. With the cadence choice of Requirement 5.4 it is `"active"` unless the As-of date is more than 12 months plus 7 days after its charge, which can happen when the Reaper concatenates statements (a single charge on 2025-01-10 in input ending 2026-03-01 is `"ended"`).
8. WHEN the As-of date is before a Series' last Regular charge, THE Detector SHALL set `status: "active"`.

---

### Requirement 8: Stable ids

**User Story:** As the web UI, which stores burials by subscription id in `localStorage`, I want the same statement to give the same ids every time it is uploaded, so that a buried subscription stays buried after a reload.

#### Acceptance Criteria

1. THE Detector SHALL build each id as `"sub:" + currency + ":" + cadence + ":" + discriminator + ":" + merchantKey`, where the discriminator is `"*"` WHEN the result holds exactly one Subscription with that `merchantKey`, `currency` and `cadence`.
2. WHEN the result holds several Subscriptions with the same `merchantKey`, `currency` and `cadence`, THE Detector SHALL set each one's discriminator to its `currentAmountCents` in decimal; WHEN two of those share a `currentAmountCents`, each of them SHALL get `<currentAmountCents>-<r>`, where `r` is its 1-based rank by first Series charge date (earliest first), then by the list of Series charge dates, then by the list of Series charge amounts (both compared element by element). Requirement 5.6 rules out two Series with the same dates and amounts in one Group, so the ranks are distinct. Example: `"sub:USD:monthly:99:unidentified:apple:apple.com/bill 866-712-7753 ca"` and `"sub:USD:monthly:1099:unidentified:apple:apple.com/bill 866-712-7753 ca"`.
3. THE Detector SHALL guarantee that ids are unique within one result. (Currency and cadence contain no `:`, and the discriminator contains no `:`, so the key, which may contain `:`, is always the whole remainder.)
4. THE Detector SHALL derive ids only from these fields, with no random values, no counters kept between calls, no hashing that depends on the runtime, and no clock. Re-running the Detector on the same transactions, in any order, SHALL give the same ids.
5. THE id of a Subscription that is the only one of its key, currency and cadence SHALL NOT depend on its amount, its dates or its number of charges, so a price increase or a newer statement covering other months keeps the id (useful to the Reaper, which scans a new statement every month).

---

### Requirement 9: Evidence for the classifier and the card

**User Story:** As the classifier, I want the facts behind each subscription (price changes, an introductory low charge, a free-trial row, whether it started inside the statement), and as the user, I want to see why a card rose, so that labels are derived from data and every card can explain itself.

#### Acceptance Criteria

1. THE Detector SHALL define `DetectionEvidence` as:

   ```ts
   type DetectionEvidence = {
     regularChargeCount: number;       // Requirement 5.7
     firstChargeDate: string;          // first Regular charge
     lastChargeDate: string;           // last Regular charge
     nextExpectedDate: string;         // Requirement 7.4
     missedPeriods: number;            // Requirement 4.5
     lateChargeDates: string[];        // Requirement 4.6, ascending
     cadenceAssumed: boolean;          // Requirement 5.4
     introCharge: PricePoint | null;   // Requirement 3.7
     freeTrialDate: string | null;     // Criterion 5
     startedInStatement: boolean;      // Criterion 6
     partialRefunds: PricePoint[];     // Criterion 7, ascending by date
   };
   ```

2. THE Detector SHALL NOT judge whether a price change makes a Subscription "possessed" or whether an introductory charge makes it a "trial trap"; it reports `priceHistory` and the evidence, and the classifier decides.
3. THE Detector SHALL set `cadenceAssumed: false` for every Subscription except the single-charge ones of Requirement 5.4.
4. THE Detector SHALL set `introCharge` to `{ date, amountCents }` of the Introductory charge, or `null` when the Series has none.
5. THE Detector SHALL set `freeTrialDate` to the date of the latest Zero-amount row of the same Group dated from one Period plus Tolerance before the earliest Series charge up to that charge's date inclusive, or `null` when there is none.
6. THE Detector SHALL set `startedInStatement: true` WHEN the earliest Series charge (the Introductory charge when present) is more than one Period plus Tolerance after the Statement range's `firstDate`, so an earlier charge at the same cadence would have been visible in the statement, and `false` otherwise. For a single-charge Subscription the assumed cadence is used.
7. THE Detector SHALL set `partialRefunds` to the Credits with role `"money-in"` in the same Group dated from the earliest Series charge to 45 days after the last Series charge inclusive, each as `{ date, amountCents }` with the Credit's own negative `amountCents`.
8. WHEN `cadenceAssumed` is `true`, the `cadence`, `yearlyCostCents` and `status` of the Subscription are a guess from one charge and can be wrong by a factor of 12 either way (an annual Amazon Prime charge of `13900` read as monthly gives `yearlyCostCents: 166800`; a cancelled Netflix charge read as yearly stays `"active"`). Consumers SHALL NOT count such a Subscription's `yearlyCostCents` towards a saving until the user has confirmed or corrected the cadence: the graveyard UI asks the user for the cadence before burying it, and the classifier SHALL NOT derive a label from its cadence. The classifier and graveyard-ui specs SHALL reference this criterion.

---

### Requirement 10: The sample statements

**User Story:** As the demo, I want each built-in sample statement to produce a known, sensible set of undead cards, so that the judges see real detection with price increases and no supermarket zombies.

#### Acceptance Criteria

1. WHEN each file in `samples/` is parsed with `parseStatement` (no options), normalized with `normalizeTransactions` and passed to `detectSubscriptions` (no options), THE Detector SHALL return exactly the Subscriptions below, in this order. For every one of them: `cadence: "monthly"`, `status: "active"`, `confidence: "high"`, `labels: []`, 3 Regular charges, `missedPeriods: 0`, `lateChargeDates: []`, `cadenceAssumed: false`, `introCharge: null`, `freeTrialDate: null`, `startedInStatement: false`, `partialRefunds: []`, and an id of the form `"sub:<currency>:monthly:*:<merchantKey>"`.

   **`us-signed.csv`** (USD, Statement range 2026-01-02 to 2026-03-25):

   | `merchantKey` | `merchant` | `currentAmountCents` | `yearlyCostCents` | `priceHistory` |
   | --- | --- | --- | --- | --- |
   | `adobe` | Adobe Creative Cloud | 5499 | 65988 | 2026-01-12: 5499 |
   | `merchant:riverside-gym-membership` | Riverside Gym Membership | 2900 | 34800 | 2026-01-21: 2900 |
   | `netflix` | Netflix | 1799 | 21588 | 2026-01-02: 1549; 2026-03-02: 1799 |
   | `spotify` | Spotify | 1099 | 13188 | 2026-01-03: 1099 |

   Not recurring: Greenleaf Market (2 charges in one band, 2026-01-05 and 2026-03-09, no `k = 1` interval, and 2026-03-09 is 4 days after the `k = 2` date 2026-03-05), Harvest Foods, Lone Star Fuel (`4218` and `3960` are different bands), Taco Planet, Online Marketplace Order. Money in: the payroll credits and Online Marketplace Refund (a different key from the order, Requirement 2.7). Usage: 12 `"subscription-charge"`, 7 `"money-in"`, 7 `"not-recurring"`.

   **`uk-debit-credit.csv`** (GBP, Statement range 2026-01-02 to 2026-03-21):

   | `merchantKey` | `merchant` | `currentAmountCents` | `yearlyCostCents` | `priceHistory` |
   | --- | --- | --- | --- | --- |
   | `merchant:fitzone-gym-ltd` | Fitzone Gym Ltd | 2499 | 29988 | 2026-01-10: 2499 |
   | `netflix` | Netflix | 1299 | 15588 | 2026-01-02: 1099; 2026-03-02: 1299 |
   | `spotify` | Spotify | 1199 | 14388 | 2026-01-05: 1199 |
   | `merchant:primevideo-membership` | Primevideo Membership | 899 | 10788 | 2026-01-09: 899 |
   | `disney-plus` | Disney+ | 799 | 9588 | 2026-01-15: 799 |

   Not recurring: Highfield Stores London (`3864` and `4127` are different bands), Market Square Foods, City Travel Card. Money in: the four salary credits and Online Shop Refund Ref. Usage: 15 `"subscription-charge"`, 5 `"money-in"`, 5 `"not-recurring"`.

   **`eu-semicolon.csv`** (EUR, Statement range 2026-01-02 to 2026-03-27):

   | `merchantKey` | `merchant` | `currentAmountCents` | `yearlyCostCents` | `priceHistory` |
   | --- | --- | --- | --- | --- |
   | `merchant:fitnessstudio-lindenhof` | Fitnessstudio Lindenhof | 2490 | 29880 | 2026-01-12: 2490 |
   | `merchant:streaming-dienst-monatsbeitrag` | Streaming Dienst Monatsbeitrag | 1499 | 17988 | 2026-01-03: 1299; 2026-03-02: 1499 |
   | `merchant:musikdienst-premium` | Musikdienst Premium | 999 | 11988 | 2026-01-09: 999 |

   The Streaming Dienst Series joins the `1299` Segment (2026-01-03, 2026-02-02; two charges, Requirement 3.6) to the `1499` charge. Not recurring: Supermarkt Nord (`5430`, `6118`, `4782`, three bands), Tankstelle Am Ring (`4875`, `5210`, two bands). Money in: the four salary credits and Online Shop Rueckerstattung. Usage: 9 `"subscription-charge"`, 5 `"money-in"`, 5 `"not-recurring"`.

   **`with-preamble.csv`** (USD, Statement range 2026-01-03 to 2026-03-20):

   | `merchantKey` | `merchant` | `currentAmountCents` | `yearlyCostCents` | `priceHistory` |
   | --- | --- | --- | --- | --- |
   | `merchant:fit-house-membership` | Fit House Membership | 3500 | 42000 | 2026-01-20: 3500 |
   | `merchant:streamly-video-monthly` | Streamly Video Monthly | 1399 | 16788 | 2026-01-03: 1199; 2026-03-03: 1399 |
   | `merchant:cloudvault-storage-200gb` | Cloudvault Storage 200gb | 299 | 3588 | 2026-01-09: 299 |

   Not recurring: Corner Grocery (`3460`, `2945`, `4112`, three bands). Money in: the payroll credits. Usage: 9 `"subscription-charge"`, 3 `"money-in"`, 3 `"not-recurring"`.

2. A unit test SHALL check Criterion 1 for all four samples. The sample files SHALL NOT be changed to make the test pass; a mismatch is a Detector bug or a spec change.

---

### Requirement 11: Correctness properties

**User Story:** As the Zombills test suite, I want property-based tests for the Detector's core guarantees, so that fast-check finds statements that break detection before a user does.

#### Acceptance Criteria

1. *(PBT: never throws)* FOR ALL arrays whose elements are arbitrary plain data values (Requirement 1.13: valid NormalizedTransactions, objects with missing or wrongly typed fields, `null`, numbers, strings) and FOR ALL plain-data `options` values, `detectSubscriptions` SHALL return a `DetectionResult` and SHALL NOT throw, and `usage.length` SHALL equal the input length.
2. *(PBT: deterministic)* FOR ALL inputs, calling `detectSubscriptions` twice with the same arguments SHALL return deeply equal results.
3. *(PBT: order independence)* FOR ALL arrays of valid NormalizedTransactions and FOR ALL permutations of them, `subscriptions` and `statement` SHALL be deeply equal for the original and the permuted input, and for every input element the permuted result's usage entry SHALL have the same `role` and `subscriptionId` as the original's, except that elements whose four Transaction fields and `merchant` are all equal MAY exchange their entries.
4. *(PBT: each charge used at most once)* FOR ALL inputs, no input element SHALL appear in the `charges` of more than one Subscription; every charge in a Subscription SHALL have `amountCents > 0` and the Subscription's `merchantKey` and `currency`; `charges` SHALL be sorted by date ascending with distinct dates; and the usage rules of Requirement 1.9 SHALL hold.
5. *(PBT: yearly cost formula)* FOR ALL Subscriptions in any result, `yearlyCostCents` SHALL equal `currentAmountCents × 52`, `× 12` or `× 1` for weekly, monthly and yearly exactly, and `currentAmountCents` SHALL equal the `amountCents` of the last Regular charge and of the last `priceHistory` entry.
6. *(PBT: no floats)* FOR ALL Subscriptions, every money field listed in Requirement 6.5 SHALL satisfy `Number.isSafeInteger`, and `evidence.regularChargeCount` and `evidence.missedPeriods` SHALL be non-negative integers.
7. *(PBT: unrelated purchases)* FOR ALL inputs with at least one valid transaction, adding any number of Charges, each with a `"generic"` merchant key that appears nowhere else in the input or among the added Charges, with any currency already in the input and dated from `firstDate` to `lastDate`, SHALL leave `subscriptions` deeply equal, and SHALL give every added Charge role `"not-recurring"`.
8. *(PBT: missed month)* FOR ALL monthly Series of 4 to 24 charges of one merchant key (source `"known"` or `"generic"`) at one constant amount, dated `addMonths(start, i)` for an anchor day from 1 to 28 plus a shift of 0 to 2 days per charge, mixed with unrelated transactions of other keys, the Series SHALL be detected as one monthly Subscription with all its charges. Removing any one charge that is neither the first nor the last SHALL still give one monthly Subscription with the same `id`, all the remaining charges and `missedPeriods: 1`.
9. *(PBT: cadence recognition)* FOR ALL anchor days from 1 to 31 and FOR ALL starts, monthly charges on exactly `addMonths(start, i)` (3 to 24 charges) SHALL be one monthly Subscription; FOR ALL weekly charges of a `"known"` merchant 7 days apart with a shift of 0 to 2 days each (3 to 52 charges) SHALL be one weekly Subscription; FOR ALL two charges of a `"known"` merchant 12 months apart with a shift of 0 to 7 days SHALL be one yearly Subscription.
10. *(PBT: habits are not subscriptions)* FOR ALL `"generic"` merchant keys with charges of one constant amount every 7 days or every 14 days, over 3 to 26 weeks, with a shift of 0 to 2 days per charge and, for the 7-day habit, random skipped weeks (never two in a row, so no gap between charges exceeds 16 days), the result SHALL contain no Subscription with that key. Longer gaps such as a holiday are covered by the fixture in Requirement 3.11, not by this property, because a habit with long enough gaps is indistinguishable from a monthly plan.
11. *(PBT: refunds)* FOR ALL monthly Series of at least 4 charges at one constant amount (as in Criterion 8) and FOR ALL choices of one middle charge, adding a Credit of the same Group with the negated amount dated 0 to 45 days after that charge (and before the next charge) SHALL give that charge role `"refunded-charge"`, the Credit role `"refund"`, and the same Subscription id with `missedPeriods` one higher.
12. *(PBT: stable ids)* FOR ALL inputs, ids SHALL be unique within the result and SHALL match `^sub:[A-Z]{3}:(weekly|monthly|yearly):(\*|\d+(-\d+)?):.+$`, with the part after the fourth `:` equal to `merchantKey`.
13. *(PBT: statement range)* FOR ALL inputs, `statement.firstDate` and `statement.lastDate` SHALL be the minimum and maximum `date` of the valid elements (or `null`), and `statement.currencies` SHALL be their sorted distinct currencies.
14. *(Input size)* THE Detector SHALL process 10,000 valid transactions, including one band of 1,000 equal charges on distinct dates and a year of a generic lunch at `1050` on every weekday (about 260 charges in one band), in under 2 s each in the CI test run. THE Segment and cover choice (Requirement 3.4, 3.10) SHALL NOT enumerate subsets of a band's charges: for a band of `b` charges, the number of pairwise charge comparisons SHALL be at most `c × b²` for a constant `c` stated in the design, plus `O(n log n)` for sorting `n` transactions overall. A test SHALL check this by counting comparisons through an internal counter argument that is not part of the public API and keeps no module-level state (Requirement 12.5), comparing bands of 100 and 1,000 charges, so the check does not depend on CI timing.

---

### Requirement 12: No network calls, no DOM access, no clock

**User Story:** As the Zombills privacy contract, I want the Detector to be a pure in-browser module, so that the user's charges never leave their device and results depend only on the statement.

#### Acceptance Criteria

1. THE Detector SHALL NOT contain any call to `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, or any other network API.
2. THE Detector SHALL NOT access `document`, `window`, `navigator`, `localStorage`, or any other DOM or browser-global API.
3. THE Detector SHALL NOT read the current time (`Date.now()`, `new Date()` without arguments, `performance.now()`) or use `Math.random()` or `crypto.randomUUID()`.
4. WHEN the Detector module is imported in a Node.js Vitest environment with no browser polyfills loaded, THE Detector SHALL load and execute its exported functions without throwing a ReferenceError or any other runtime error caused by a missing browser global.
5. THE Detector SHALL NOT keep mutable module-level state between calls, so that results depend only on the arguments.
6. THE static analysis check SHALL fail, with an error naming the offending API, WHEN the Detector source references a network API (`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`), a DOM or browser-global API (`document`, `window`, `navigator`, `localStorage`), or a clock or randomness API (`Date.now`, `new Date(` with no arguments, `performance.now`, `Math.random`, `crypto.randomUUID`).
