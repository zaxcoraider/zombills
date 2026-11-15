# Requirements Document

## Introduction

The `subscription-classifier` module lives in `packages/core/src/classify` and is exported from `@zombills/core`. It takes the `Subscription` values that `detectSubscriptions` returns (subscription-detector spec) and sets their `labels`:

- **`possessed`**: the user now pays more than the first paid price the statement shows, by more than an Amount band. Decided from `priceHistory`.
- **`trial-trap`**: the first paid charge after a free or low-price period. Decided from `evidence.introCharge`, `evidence.freeTrialDate` and, for an intro price the detector reads as a price change, from `priceHistory` (Requirement 3).
- **`zombie`**: the user said they no longer use it. A bank statement cannot show whether a service is still used (`product.md`), so this label comes only from the user's answers, which the caller passes in. The question UI ("Still using this?") belongs to the graveyard-ui spec; this spec only defines how answers are given to the classifier.

Next to the labels, the classifier returns the details the UI needs to explain `possessed` and `trial-trap` in plain words (first price seen and its date, current price, latest rise, increase per charge and per year, trial and first full-price charges), all in integer minor units of the subscription's own currency. It never reorders, drops or changes any other field.

The module is pure TypeScript: no network, no DOM, no clock, no randomness, no logging, no storage. Statement data never leaves the browser (`privacy.md`).

This spec also:

- wires the classifier into the vertical-slice page, which shows each label as a plain text line (Requirement 9);
- amends the merchant normalizer so that `PRIMEVIDEO MEMBERSHIP`, as printed in `samples/uk-debit-credit.csv`, is recognised as Amazon Prime (Requirement 10).

Limits that follow from the detector, so neither the demo nor the UI should expect these labels:

- A yearly Subscription cannot be `possessed` or `trial-trap` with 2 to 3 months of data. A price change needs two charges about 12 months apart (subscription-detector Requirements 4.3 and 5.1), and a single yearly charge has `cadenceAssumed: true`, which Requirement 5.1 excludes. A yearly intro likewise needs a charge 12 months before the first full-price charge.

Out of scope for this spec:

- The "Still using this?" question, Keep / Bury, tombstones, the graveyard and any persistence of answers (graveyard-ui spec). The classifier only reads answers it is given.
- Haunted art, card styling, icons or animation for labels. The slice page shows labels as plain text.
- Correcting the cadence of a single-charge Subscription (subscription-detector Requirement 9.8; graveyard-ui spec).
- A sample statement with a trial trap. No sample in `samples/` has an `introCharge` or a `freeTrialDate`, and the detector spec forbids editing the samples to fit a test, so `trial-trap` is shown by unit-test fixtures only.
- Intros that last more than one charge. The detector makes them a separate Subscription (subscription-detector Requirement 3.7 needs the intro charge to be in no Series), so neither part gets `trial-trap`. Example: known `netflix` at `100` on 2026-01-10, 2026-02-10 and 2026-03-10, then `1499` on 2026-04-10 and 2026-05-10 gives `sub:USD:monthly:100:netflix` (`status: "ended"`) and `sub:USD:monthly:1499:netflix`, neither labelled `trial-trap`. Fixing this needs a detector amendment, which this spec does not make.
- Comparing prices across subscriptions or currencies. Every comparison is within one Subscription, whose charges all share one currency.

---

## Glossary

- **Classifier**: The `subscription-classifier` module within `packages/core/src/classify`.
- **Detector**: The `subscription-detector` module (`detectSubscriptions`).
- **Subscription**: The detector's `Subscription` type (subscription-detector Requirement 1.5), including `priceHistory`, `status`, `currency`, `cadence` and `evidence`.
- **Detector output**: The `subscriptions` array of any `DetectionResult` returned by `detectSubscriptions`.
- **Minor units**: Integer cents (`money.md`). Every money value in this spec is a safe integer in the Subscription's own `currency`.
- **Cadence factor**: `52` for `"weekly"`, `12` for `"monthly"`, `1` for `"yearly"`, the factor of `yearlyCostCents = currentAmountCents × factor` (`money.md`, subscription-detector Requirement 11.5).
- **Eligible subscription**: A Subscription with `status: "active"` and `evidence.cadenceAssumed: false`. Only Eligible subscriptions can get `possessed` or `trial-trap` (Requirement 5).
- **Paid price history**: The Subscription's `priceHistory` without its introductory entry. WHEN `evidence.introCharge` is not `null` and the first `priceHistory` entry has the same `date` and `amountCents` as `evidence.introCharge`, or WHEN the Subscription has an Inferred intro charge, the Paid price history is `priceHistory` minus that first entry; otherwise it is `priceHistory` unchanged. The detector puts the Introductory charge first in `priceHistory` (subscription-detector Requirement 3.8, 6.4), so the step from the intro price to the first regular price is never read as a price rise.
- **Band rise**: A rise from amount `from` to amount `to` (both in minor units) that crosses an Amount band: `(to − from) × 20 > from`, computed in integer arithmetic (the same 5 % rule as subscription-detector Requirement 3.2). A higher amount that does not satisfy this is variation within one band (for example FX conversion or metered charges) and is not a rise.
- **Inferred intro charge**: An intro price that the detector joined to the full price as a price change (subscription-detector Requirement 3.6 joins a one-charge known Segment to the next whenever `max ≤ 2 × min`, so an intro at or above half the full price never becomes `evidence.introCharge`). A Subscription has an Inferred intro charge WHEN all of these hold: `evidence.introCharge` is `null`; `priceHistory` has at least 2 entries, `p0` and `p1` the first two; exactly one element of `charges` has `amountCents` equal to `p0.amountCents` (so `p0` is a single charge, and since `charges` is oldest first and `priceHistory` starts at the first charge, it is the first Series charge); `evidence.startedInStatement` is `true`; `p0` to `p1` is a Band rise; and at least 2 elements of `charges` have `amountCents` equal to `p1.amountCents`. The Inferred intro charge is then `{ date: p0.date, amountCents: p0.amountCents }`. Example: `750` on 2026-01-10, then `1499` on 2026-02-10 and 2026-03-10, with `startedInStatement: true`.
- **Usage answer**: The user's answer to "Still using this?" for one Subscription: `"still-using"` or `"not-using"`.
- **Usage answers**: A `ReadonlyMap<string, UsageAnswer>` from Subscription `id` to Usage answer.
- **Canonical label order**: `"zombie"`, `"possessed"`, `"trial-trap"`, the order of the `labels` union in the `Subscription` type.

---

## Requirements

### Requirement 1: Public API and result shape

**User Story:** As the web UI, I want one function that takes the detected subscriptions and the user's answers and gives them back with labels and the details behind each label, so that every card can say why it is marked without re-deriving anything.

#### Acceptance Criteria

1. THE Classifier SHALL export from `@zombills/core` a function `classifySubscriptions(subscriptions: readonly Subscription[], answers?: ReadonlyMap<string, UsageAnswer>): ClassifiedSubscription[]` and the types `UsageAnswer`, `ClassifiedSubscription`, `PriceRise` and `TrialDetails`.
2. THE Classifier SHALL define the types as:

   ```ts
   type UsageAnswer = "still-using" | "not-using";

   type PriceRise = {
     firstSeen: PricePoint;          // first entry of the Paid price history
     currentAmountCents: number;     // = Subscription.currentAmountCents
     latestRise: {                   // latest consecutive Paid price history step that is a Band rise, or null
       fromAmountCents: number;
       toAmountCents: number;
       date: string;                 // date of the first charge at toAmountCents
     } | null;
     increasePerChargeCents: number; // currentAmountCents − firstSeen.amountCents, > 0
     increasePerYearCents: number;   // increasePerChargeCents × Cadence factor
   };

   type TrialDetails = {
     freeTrialDate: string | null;      // evidence.freeTrialDate
     introCharge: PricePoint | null;    // evidence.introCharge, or the Inferred intro charge
     firstFullCharge: PricePoint;       // first charge at the full price
   };

   type ClassifiedSubscription = Subscription & {
     priceRise: PriceRise | null;       // non-null exactly when labels has "possessed"
     trial: TrialDetails | null;        // non-null exactly when labels has "trial-trap"
   };
   ```

3. THE Classifier SHALL return an array with the same length as `subscriptions`, whose element `i` comes from input element `i`. It SHALL NOT reorder, drop, merge or add subscriptions.
4. FOR every element, THE Classifier SHALL return a new object whose fields other than `labels`, `priceRise` and `trial` are equal (deep equality) to the input element's. The `labels` array SHALL be a new array.
5. THE Classifier SHALL NOT mutate the input array, any input element, any object reachable from an input element, or `answers`.
6. THE Classifier SHALL compute `labels`, `priceRise` and `trial` only from the element's own fields and the answer for its `id`, and SHALL ignore any `labels`, `priceRise` or `trial` already present on the input element. So classifying again with new answers replaces the earlier labels, and an answer changed from `"not-using"` to `"still-using"` removes `"zombie"`.
7. THE Classifier SHALL list each label at most once, in Canonical label order.
8. WHEN `answers` is absent, THE Classifier SHALL behave as if it were an empty map.
9. WHEN the input is an empty array, THE Classifier SHALL return an empty array.
10. THE `classifySubscriptions` function SHALL throw a `TypeError` only when `subscriptions` is not an array (a type contract violation, as in the parser, normalizer and detector). FOR ALL arrays of Subscriptions from Detector output, and FOR ALL values of `answers` (including a value that is not a `Map`, which SHALL be treated as an empty map), it SHALL return a result and SHALL NOT throw.

---

### Requirement 2: Possessed (price went up)

**User Story:** As a user, I want to be told plainly when a subscription now costs more than it used to, by how much and since when, so that I notice price rises I never agreed to look at.

#### Acceptance Criteria

1. THE Classifier SHALL decide `possessed` by comparing the current price with the **first paid price** the statement shows: WHEN the element is an Eligible subscription, the Paid price history has at least 2 entries, and `first` = the first entry's `amountCents` to `current` = `currentAmountCents` is a Band rise (`(current − first) × 20 > first`), THE Classifier SHALL add `"possessed"` to `labels`. Otherwise it SHALL NOT add `"possessed"`.
2. WHEN `"possessed"` is added, THE Classifier SHALL set `priceRise` as: `firstSeen` = a new `{ date, amountCents }` equal to the first Paid price history entry; `currentAmountCents` = the element's `currentAmountCents`; `latestRise` = `{ fromAmountCents: prev.amountCents, toAmountCents: next.amountCents, date: next.date }` for the last pair of consecutive Paid price history entries `prev`, `next` where `prev.amountCents` to `next.amountCents` is a Band rise, or `null` when no such pair exists (for example several small in-band rises that together cross the band); `increasePerChargeCents = currentAmountCents − firstSeen.amountCents`; `increasePerYearCents = increasePerChargeCents × Cadence factor`. Otherwise `priceRise` SHALL be `null`.
3. The rise SHALL be measured from the first paid price, so the UI can say "up from $10.00 on 2 Jan". A rise followed by a fall SHALL still be `possessed` while the current price is more than a band above the first paid price, and SHALL NOT be `possessed` once it is not. A fall followed by a rise SHALL be `possessed` only when the current price is more than a band above the first paid price; a price still below the first one seen is not a rise. In-band variation (a step that is not a Band rise) SHALL NOT make a Subscription `possessed`, so FX-converted or metered charges do not flip the label from month to month.
4. Every money field of `priceRise` SHALL be a safe integer in the Subscription's `currency`. IF `increasePerYearCents` would not be a safe integer, THEN THE Classifier SHALL NOT add `"possessed"` and SHALL set `priceRise: null`. (For Detector output this cannot happen: `increasePerYearCents < yearlyCostCents`, which the detector keeps safe, subscription-detector Requirement 6.5.)
5. Examples the implementation SHALL satisfy (Eligible, monthly, USD unless stated):

   | `priceHistory` | `introCharge` | Result |
   | --- | --- | --- |
   | 2026-01-02: 1549; 2026-03-02: 1799 | `null` | `possessed`; `priceRise` `{ firstSeen: { date: "2026-01-02", amountCents: 1549 }, currentAmountCents: 1799, latestRise: { fromAmountCents: 1549, toAmountCents: 1799, date: "2026-03-02" }, increasePerChargeCents: 250, increasePerYearCents: 3000 }` |
   | 2026-01-12: 5499 | `null` | not `possessed`; `priceRise: null` |
   | 2026-01-02: 1799; 2026-03-02: 1549 | `null` | not `possessed` (a price drop) |
   | 2026-01-02: 1000; 2026-02-02: 1500; 2026-03-02: 1200 | `null` | `possessed` (rise, then a fall, still `+200` above the first price); `firstSeen` 2026-01-02: 1000; `latestRise` `1000` → `1500` on 2026-02-02; `+200` per charge, `+2400` a year |
   | 2026-01-02: 1000; 2026-02-02: 1200; 2026-03-02: 1400 | `null` | `possessed`; `firstSeen` 2026-01-02: 1000 (up from $10); `latestRise` `1200` → `1400` on 2026-03-02; `+400` per charge, `+4800` a year |
   | 2026-01-02: 1500; 2026-02-02: 1000; 2026-03-02: 1200 | `null` | not `possessed` (`1200` is still below the first price `1500`) |
   | 2026-01-02: 1000; 2026-02-02: 1040; 2026-03-02: 1080 | `null` | `possessed` (`80 × 20 > 1000`); `firstSeen` 2026-01-02: 1000; `latestRise: null` (neither step is a Band rise); `+80` per charge, `+960` a year |
   | GBP, 2026-01-10: 775; 2026-02-10: 798; 2026-03-10: 790; 2026-04-10: 812 | `null` | not `possessed` (FX drift within one band: `(812 − 775) × 20 = 740`, not more than `775`) |
   | 2026-01-10: 100; 2026-02-10: 1499 | 2026-01-10: 100 | not `possessed` (the step from the intro charge is the trial trap, Requirement 3) |
   | 2026-01-10: 750; 2026-02-10: 1499 (charges `750`, `1499`, `1499` on the 10th of Jan to Mar; `startedInStatement: true`) | `null` | not `possessed` (`750` is an Inferred intro charge, so the Paid price history is 2026-02-10: 1499 only; `trial-trap`, Requirement 3) |
   | 2026-01-10: 100; 2026-02-10: 1499; 2026-04-10: 1699 | 2026-01-10: 100 | `possessed`; `firstSeen` 2026-02-10: 1499; `latestRise` `1499` → `1699` on 2026-04-10; `+200` per charge, `+2400` a year (and `trial-trap`, Requirement 4) |
   | weekly, 2026-01-05: 500; 2026-02-02: 600 | `null` | `possessed`; `firstSeen` 2026-01-05: 500; `+100` per charge, `+5200` a year |
   | yearly, 2025-01-15: 13900; 2026-01-15: 14900 | `null` | `possessed`; `firstSeen` 2025-01-15: 13900; `+1000` per charge, `+1000` a year |

---

### Requirement 3: Trial trap (first full price after a free or cheap start)

**User Story:** As a user, I want to know when a subscription I started as a free trial or at an intro price is now charging me the full price, so that I can cancel the ones I only meant to try.

#### Acceptance Criteria

1. WHEN the element is an Eligible subscription, its full-price charge count is `≤ 3`, and it has at least one trial signal, THE Classifier SHALL add `"trial-trap"` to `labels`. Otherwise it SHALL NOT add `"trial-trap"`. The trial signals are:
   - `evidence.introCharge` is not `null`;
   - the Subscription has an Inferred intro charge (Glossary);
   - `evidence.freeTrialDate` is not `null` and differs from `evidence.firstChargeDate`. A free-trial date on the same day as the first charge is most likely a `0.00` card authorisation (parser debit/credit Requirement 7.4), not a trial, so it SHALL NOT count.

   The cut-off keeps the label to the first full-price charges, as `product.md` defines a trial trap ("the first paid charge after a free or low-price period"); with concatenated statements (the Reaper) an intro from many months ago SHALL NOT keep the label. The full-price charge count counts only charges at the full price, so the cut-off is the same for both intro kinds: `evidence.regularChargeCount` when the Subscription has no Inferred intro charge (an `evidence.introCharge` is not a Regular charge), and `evidence.regularChargeCount - 1` when it has one (the detector counts an Inferred intro charge as a Regular charge). Example: `750`, `1499`, `1499`, `1499` with an Inferred intro charge (`regularChargeCount: 4`) has a full-price charge count of 3 and is labelled; a fourth `1499` makes it 4, so it is not.
2. WHEN `"trial-trap"` is added, THE Classifier SHALL set `trial` to `{ freeTrialDate, introCharge, firstFullCharge }`:
   - `freeTrialDate` = `evidence.freeTrialDate` when it counts as a trial signal, otherwise `null`;
   - `introCharge` = a new object equal to `evidence.introCharge` when that is not `null`, else a new object equal to the Inferred intro charge when there is one, else `null`;
   - `firstFullCharge` = for an Inferred intro charge, `{ date, amountCents }` of the second `priceHistory` entry (the first charge at the full price); otherwise `{ date, amountCents }` of the element of `charges` whose `date` equals `evidence.firstChargeDate` (the first Regular charge).

   Otherwise `trial` SHALL be `null`.
3. IF `firstFullCharge` is to come from `charges` and no element of `charges` has `date` equal to `evidence.firstChargeDate`, THEN THE Classifier SHALL NOT add `"trial-trap"` and SHALL set `trial: null`. (The detector always lists the first Regular charge in `charges`, so this only guards against values that are not Detector output.)
4. THE Classifier SHALL NOT check the trial price against the full price beyond these rules. The detector sets `introCharge` only for a charge below half the first Regular charge (subscription-detector Requirements 3.6 and 3.7: a higher intro is joined as a price change), the Inferred intro charge covers an intro at or above half the full price by requiring a Band rise, and a Zero-amount row is free by definition.
5. Examples the implementation SHALL satisfy (Eligible, monthly, USD):

   | Evidence and charges | Result |
   | --- | --- |
   | `introCharge` 2026-01-10: 100; Regular charges 1499 on 2026-02-10 and 2026-03-10; `freeTrialDate: null` | `trial-trap`; `trial` `{ freeTrialDate: null, introCharge: { date: "2026-01-10", amountCents: 100 }, firstFullCharge: { date: "2026-02-10", amountCents: 1499 } }`; not `possessed` |
   | `freeTrialDate` "2026-01-05"; Regular charges 1099 on 2026-02-05, 2026-03-05, 2026-04-05; `introCharge: null` | `trial-trap`; `trial` `{ freeTrialDate: "2026-01-05", introCharge: null, firstFullCharge: { date: "2026-02-05", amountCents: 1099 } }` |
   | `freeTrialDate` "2026-01-03"; `introCharge` 2026-01-10: 100; Regular charges 1499 on 2026-02-10 and 2026-03-10 | `trial-trap`; `trial` holds both the free-trial date and the intro charge, `firstFullCharge` 2026-02-10: 1499 |
   | `introCharge: null`, `freeTrialDate: null` | no `trial-trap`; `trial: null` |
   | known `netflix`, `introCharge: null`; `priceHistory` 2026-01-10: 750; 2026-02-10: 1499; charges `750` on 2026-01-10, `1499` on 2026-02-10, 2026-03-10 and 2026-04-10; `startedInStatement: true`; `regularChargeCount: 4` (full-price charge count 3) | `trial-trap`; `trial` `{ freeTrialDate: null, introCharge: { date: "2026-01-10", amountCents: 750 }, firstFullCharge: { date: "2026-02-10", amountCents: 1499 } }`; not `possessed` (Requirement 2.5) |
   | as above but `startedInStatement: false` | no `trial-trap`; `possessed` from `firstSeen` 2026-01-10: 750 (an earlier charge could have been at `750`, so it is not known to be an intro) |
   | generic `merchant:fit-gym`, `freeTrialDate` "2026-02-05", `firstChargeDate` "2026-02-05"; Regular charges 2900 on 2026-02-05, 2026-03-05, 2026-04-05; `introCharge: null` | no `trial-trap` (the `0.00` row is on the first charge's date) |
   | `introCharge` 2026-01-10: 100; Regular charges 1499 on 2026-02-10, 03-10, 04-10 and 05-10 (`regularChargeCount: 4`) | no `trial-trap` (past the cut-off); `trial: null` |
   | known `netflix` Inferred intro row above plus a fourth `1499` on 2026-05-10 (`regularChargeCount: 5`, full-price charge count 4) | no `trial-trap` (past the cut-off); `trial: null`; not `possessed` (Requirement 2.5) |

---

### Requirement 4: Both labels at once

**User Story:** As a user, I want to see every reason a subscription deserves my attention, so that a trial that has also gone up in price tells me both.

#### Acceptance Criteria

1. THE Classifier SHALL decide `possessed` (Requirement 2) and `trial-trap` (Requirement 3) independently. WHEN both apply, `labels` SHALL contain both, in Canonical label order (`["possessed", "trial-trap"]`, or `["zombie", "possessed", "trial-trap"]` with a `"not-using"` answer), and both `priceRise` and `trial` SHALL be set.
2. Because `possessed` uses the Paid price history, the step from an intro charge (from `evidence.introCharge` or an Inferred intro charge) to the first full price SHALL count only as `trial-trap`, never also as `possessed`. A Subscription is both only when its price rose again by more than a band above the first full-price charge (Requirement 2.5, last intro row: intro `100` on 2026-01-10, `1499` from 2026-02-10, `1699` from 2026-04-10 gives `possessed` with `firstSeen` 2026-02-10: 1499 and `trial-trap` with `firstFullCharge` 2026-02-10: 1499).
3. A label SHALL NOT change the result of another label: adding or removing a Usage answer SHALL NOT change `possessed`, `trial-trap`, `priceRise` or `trial`.

---

### Requirement 5: Guessed and ended subscriptions

**User Story:** As a user, I want labels only where the data supports them, so that a guess from one charge or a subscription that has already stopped never gets a warning it does not deserve.

#### Acceptance Criteria

1. WHEN `evidence.cadenceAssumed` is `true`, THE Classifier SHALL NOT add `"possessed"` or `"trial-trap"`, and SHALL set `priceRise: null` and `trial: null`. Its cadence is a guess from one charge (subscription-detector Requirement 9.8): `increasePerYearCents` would multiply by a guessed Cadence factor, and its `freeTrialDate` window (one Period plus Tolerance, subscription-detector Requirement 9.5) is measured with the guessed Period, so either label would be derived from the guessed cadence, which Requirement 9.8 forbids. Such a Subscription has a single charge, so its `priceHistory` has one entry and `introCharge` is `null` anyway.
2. WHEN `evidence.cadenceAssumed` is `true`, THE Classifier SHALL still apply `"zombie"` from a `"not-using"` answer (Requirement 6). The answer is about use, not cadence. Its guessed `yearlyCostCents` stays out of any saving until the user confirms the cadence (subscription-detector Requirement 9.8; graveyard-ui spec).
3. WHEN `status` is `"ended"`, THE Classifier SHALL set `labels: []`, `priceRise: null` and `trial: null`, whatever the answers. An ended Subscription has stopped charging (subscription-detector Requirement 7.5), so there is nothing left to cancel and no current price to warn about. A `"not-using"` answer for its `id` SHALL be ignored, and SHALL apply again WHEN a later classification sees the same `id` with `status: "active"` (for example after a later statement).
4. Examples the implementation SHALL satisfy:

   | Subscription | Answer | `labels` |
   | --- | --- | --- |
   | active, `cadenceAssumed: true`, one charge 13900 on 2026-01-15, `freeTrialDate` "2026-01-01" | none | `[]` |
   | active, `cadenceAssumed: true`, as above | `"not-using"` | `["zombie"]` |
   | ended, monthly, `priceHistory` 2025-09-02: 1549; 2025-11-02: 1799 | none | `[]` |
   | ended, monthly, `introCharge` 2025-09-10: 100 | `"not-using"` | `[]` |

---

### Requirement 6: Zombie (the user's answer)

**User Story:** As a user, I want to be the one who decides that a subscription is a zombie, so that the app never calls something dead that I still use, and as the graveyard UI, I want a simple way to hand my user's answers to the classifier.

#### Acceptance Criteria

1. THE Classifier SHALL NOT derive `"zombie"` from any statement data (amounts, dates, cadence, status or evidence). `product.md`: a bank statement cannot show whether a service is still used.
2. THE Classifier SHALL take the user's answers as the optional `answers` argument, a `ReadonlyMap<string, UsageAnswer>` keyed by Subscription `id`. THE Classifier SHALL only read `answers` (with `get`) and SHALL NOT keep it or any part of it after the call returns.
3. WHEN the element has `status: "active"` and `answers.get(element.id) === "not-using"`, THE Classifier SHALL add `"zombie"` to `labels`.
4. WHEN the answer for the element's `id` is `"still-using"`, is absent, or is any value other than the two Usage answers (for example `"maybe"`, `null` or `1` from a hand-built map), THE Classifier SHALL NOT add `"zombie"`. No answer SHALL mean no `zombie` label.
5. THE Classifier SHALL ignore every entry of `answers` whose key is not the `id` of an input element, including non-string keys. Such entries SHALL NOT add, remove or change anything in the result. (Ids can change between statements in the cases listed in the subscription-detector Introduction; an answer for an old id is simply not applied.) Note for the graveyard-ui spec: the id holds `currentAmountCents`, so a price change gives a new id and a stored `"not-using"` answer silently stops applying in the very statement that makes the Subscription `possessed` (for example Apple Music under `APPLE.COM/BILL` going from `1099` to `1199`). The graveyard-ui spec SHALL therefore keep stored answers whose ids are missing from the current result, and offer to re-attach them to a current Subscription with the same `merchantKey`, `currency` and `cadence`. `answers` is a `Map`, which `JSON.stringify` does not serialise, so the graveyard UI SHALL convert it to and from a JSON-safe form (for example an array of `[id, answer]` pairs) for `localStorage`.
6. The `"zombie"` label SHALL NOT affect `possessed`, `trial-trap`, `priceRise` or `trial` (Requirement 4.3).
7. Examples the implementation SHALL satisfy, for the US Sample's Detector output (Requirement 8):

   | `answers` | Netflix `labels` | Spotify `labels` | Adobe Creative Cloud `labels` |
   | --- | --- | --- | --- |
   | absent | `["possessed"]` | `[]` | `[]` |
   | `sub:USD:monthly:*:netflix` → `"not-using"` | `["zombie", "possessed"]` | `[]` | `[]` |
   | `sub:USD:monthly:*:spotify` → `"not-using"`, `sub:USD:monthly:*:adobe` → `"still-using"` | `["possessed"]` | `["zombie"]` | `[]` |
   | `sub:USD:monthly:*:hulu` → `"not-using"` (no such id) | `["possessed"]` | `[]` | `[]` |

---

### Requirement 7: Pure, deterministic and private

**User Story:** As the Zombills privacy contract, I want the classifier to be a pure in-browser function, so that labels depend only on the subscriptions and answers and nothing about the user's statement leaves the device.

#### Acceptance Criteria

1. THE Classifier SHALL return deeply equal results for deeply equal arguments, and SHALL NOT keep mutable module-level state between calls.
2. THE Classifier SHALL NOT call any network API (`fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`), access any DOM, browser-global or storage API (`document`, `window`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`), read the clock (`Date.now()`, `new Date()` with no arguments, `performance.now()`), use randomness (`Math.random()`, `crypto.randomUUID()`) or call `console` methods.
3. THE Classifier SHALL compute every date it returns by copying a date string from its input. It SHALL NOT parse or create dates, and compares date strings only for equality, so it cannot depend on the time zone or the current date.
4. A static analysis test SHALL scan every non-test source file in `packages/core/src/classify` with the shared scan in `packages/core/src/test-no-network-scan.ts` (`findForbiddenReferences` and `findClockAndRandomReferences`, as the detector's `no-network.test.ts` does), plus a check for `console`, `sessionStorage` and `indexedDB`, and SHALL fail with an error naming the file, line and offending API.
5. WHEN the Classifier module is imported in a Node.js Vitest environment with no browser polyfills, THE Classifier SHALL load and run `classifySubscriptions` without a runtime error caused by a missing browser global.

---

### Requirement 8: The sample statements

**User Story:** As the demo, I want each built-in sample statement to show the price rises a judge can check against the file, so that `possessed` is visibly derived from real data.

#### Acceptance Criteria

1. WHEN each file in `samples/` is parsed with `parseStatement` (no options), normalized with `normalizeTransactions`, passed to `detectSubscriptions` (no options) and then to `classifySubscriptions` (no answers), THE Classifier SHALL return exactly these labelled Subscriptions, and every other Subscription of that Sample SHALL have `labels: []`, `priceRise: null` and `trial: null`:

   | Sample | `merchantKey` | `labels` | `priceRise` |
   | --- | --- | --- | --- |
   | `us-signed.csv` | `netflix` | `["possessed"]` | `firstSeen` 2026-01-02: 1549; current `1799`; `latestRise` `1549` → `1799` on 2026-03-02; `+250` per charge; `+3000` a year |
   | `uk-debit-credit.csv` | `netflix` | `["possessed"]` | `firstSeen` 2026-01-02: 1099; current `1299`; `latestRise` `1099` → `1299` on 2026-03-02; `+200` per charge; `+2400` a year |
   | `eu-semicolon.csv` | `merchant:streaming-dienst-monatsbeitrag` | `["possessed"]` | `firstSeen` 2026-01-03: 1299; current `1499`; `latestRise` `1299` → `1499` on 2026-03-02; `+200` per charge; `+2400` a year |
   | `with-preamble.csv` | `merchant:streamly-video-monthly` | `["possessed"]` | `firstSeen` 2026-01-03: 1199; current `1399`; `latestRise` `1199` → `1399` on 2026-03-03; `+200` per charge; `+2400` a year |

   No Sample has a `trial-trap`: every Sample Subscription has `introCharge: null`, `freeTrialDate: null` and `startedInStatement: false`, so none has an Inferred intro charge (subscription-detector Requirement 10.1).
2. THE classified Sample results SHALL keep the Detector's order and every other field, so the Subscriptions, in order, are those of subscription-detector Requirement 10.1 as amended by Requirement 10.6 of this spec.
3. A unit test in `packages/core/src/classify` SHALL check Criteria 1 and 2 for all four Samples, and the examples of Requirement 6.7 for `us-signed.csv`. The sample files SHALL NOT be changed to make the test pass.

---

### Requirement 9: Labels on the vertical-slice page

**User Story:** As a user of the plain slice page, I want each subscription to say in words when its price went up or its trial ended, so that I see what the labels mean before the haunted UI exists.

This requirement changes `apps/web` (the vertical-slice spec).

#### Acceptance Criteria

1. THE Analyzer (`apps/web/src/slice/logic/analyze-statement.ts`) SHALL call `classifySubscriptions(detection.subscriptions)` with no answers, imported from `@zombills/core` (vertical-slice Requirement 9.1), and SHALL return its result as the `subscriptions` of the `"results"` outcome, typed `ClassifiedSubscription[]`. The `"no-subscriptions"` decision, the Currency totals and the display ordering (vertical-slice Requirement 5.2, 5.7) SHALL be unchanged, because the Classifier changes no field they read.
2. A Classifier error SHALL be handled like any other Pipeline error: the Analyzer's existing `catch` returns the generic failure reason and drops the error object (vertical-slice Requirement 3.3).
3. WHEN a subscription has `"possessed"`, THE Page SHALL show, inside its list item, the text `Price went up from <first> (<first date>) to <current> (+<per year> a year)`, with `<first>` and `<first date>` from `priceRise.firstSeen`, `<current>` from `priceRise.currentAmountCents`, the amounts formatted by the Money formatter in the subscription's `currency` and the date by `formatDisplayDate`. Example (hand-built, en-US, `firstSeen` 2026-01-02: 1000, current `1400`, monthly): `Price went up from $10.00 (2 Jan 2026) to $14.00 (+$48.00 a year)`. Example (`us-signed.csv`, en-US): `Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)`. Example (`uk-debit-credit.csv`, en-GB): `Price went up from £10.99 (2 Jan 2026) to £12.99 (+£24.00 a year)`.
4. WHEN a subscription has `"trial-trap"`, THE Page SHALL show, inside its list item, one line chosen by which evidence `trial` holds, with `<end>` the date of `firstFullCharge` and `<full>` its amount:

   | `trial` holds | Text | Example (en-US) |
   | --- | --- | --- |
   | `freeTrialDate` only | `Free trial ended on <end> (free on <freeTrialDate>, then <full>)` | `Free trial ended on 5 Feb 2026 (free on 5 Jan 2026, then $10.99)` |
   | `introCharge` only | `Intro price ended on <end> (<intro amount> on <intro date>, then <full>)` | `Intro price ended on 10 Feb 2026 ($1.00 on 10 Jan 2026, then $14.99)` |
   | both | `Free trial and intro price ended on <end> (free on <freeTrialDate>, <intro amount> on <intro date>, then <full>)` | `Free trial and intro price ended on 10 Feb 2026 (free on 3 Jan 2026, $1.00 on 10 Jan 2026, then $14.99)` |

5. WHEN both labels apply, THE Page SHALL show the price-rise line first and the trial line second. WHEN neither applies, THE Page SHALL show neither line.
6. THE label lines SHALL be plain text in Inter, with money figures in tabular figures like every other amount (vertical-slice Requirement 6.5), and SHALL NOT rely on colour, icons, art or animation. The existing price-history list (vertical-slice Requirement 5.4) SHALL stay.
7. THE Page passes no answers, so it SHALL never show a `zombie` label. The "Still using this?" question and its answers belong to the graveyard-ui spec.
8. THE vertical-slice `requirements.md` SHALL get a note in its Introduction's out-of-scope list that this spec moved the `possessed` and `trial-trap` labels in scope as plain text, and that `zombie` and the "Still using this?" question stay out of scope.
9. Tests SHALL cover: the Analyzer returning the labels of Requirement 8.1 for each Sample; a unit test of the label text (`apps/web/src/slice/logic/label-text.test.ts`) that pins the `en-US` Netflix text of Criterion 3 for the `us-signed.csv` Sample, and an E2E check (`apps/web/e2e/demo-path.spec.ts`, locale `en-US`) that finds that exact text on the page; a component test that renders the `us-signed.csv` Sample in the default locale, finds the Netflix price-rise line, and finds no "Price went up" text in any other list item; and component tests of the subscription list item for each row of Criterion 4 and for a subscription with both labels (Criterion 5), using hand-built `ClassifiedSubscription` values. The existing slice tests SHALL still pass, with the UK Sample expectation updated for Requirement 10.

---

### Requirement 10: Amendment to merchant-normalizer (Prime Video membership as Amazon Prime)

**User Story:** As a UK user whose bank prints `PRIMEVIDEO MEMBERSHIP`, I want it shown as Amazon Prime, so that I recognise the subscription and the cancel helper can find it later.

This requirement changes `packages/core/src/normalize` (the merchant-normalizer spec).

Today `PRIMEVIDEO MEMBERSHIP` matches no Variant and becomes generic `merchant:primevideo-membership` with display name `Primevideo Membership`. The `£8.99` charge in `samples/uk-debit-credit.csv` is the UK Amazon Prime monthly price (standalone Prime Video costs `£5.99`), and the merchant-normalizer Introduction notes that Amazon prints `PRIME VIDEO` for Prime membership charges. So the line names the Prime membership. Merchant-normalizer Requirement 4.8 and design review decision 5 keep `"prime video"` alone out of every service's Variants, because Amazon also prints `PRIME VIDEO*…` for rentals and channel add-ons; but `"prime video membership"` names the subscription ("membership"), which is the Requirement 4.8 rule for mapping a line to a service. The fix is two new Variants on the existing `amazon-prime` service. No new service is added.

#### Acceptance Criteria

1. THE Normalizer SHALL add to the Variants of `amazon-prime` in `packages/core/src/normalize/known-services.ts` exactly these two: `contains("prime video membership")` and `contains("primevideo membership")`. No service SHALL be added or removed, the service count SHALL stay 59, and the ids of all services SHALL stay unchanged (merchant-normalizer Requirement 4.3).
2. `"prime video"` and `"primevideo"` on their own SHALL NOT be Variants of any service. `"primevideo"` SHALL be added to the list of tokens that are not Variants (merchant-normalizer Requirement 4.8 and its test in `known-services.test.ts`). So `PRIME VIDEO*2K4LJ8MB3` and `PRIME VIDEO CHANNELS` stay generic as today, and `PRIMEVIDEO*2K4LJ8MB3` is generic.
3. Examples the implementation SHALL satisfy:

   | Raw description | Result |
   | --- | --- |
   | `PRIMEVIDEO MEMBERSHIP` | `amazon-prime`, display name `Amazon Prime` |
   | `PRIME VIDEO MEMBERSHIP` | `amazon-prime` |
   | `AMAZON PRIME VIDEO MEMBERSHIP` | `amazon-prime` |
   | `AMAZON PRIME MEMBERSHIP`, `AMAZON PRIME VIDEO` | `amazon-prime`, unchanged |
   | `PRIME VIDEO*2K4LJ8MB3`, `PRIME VIDEO CHANNELS` | generic `merchant:prime-video`, `merchant:prime-video-channels`, unchanged |

4. Merchant-normalizer Requirements 4.4 and 4.11 need no exception: `amazon-prime` keeps its display name `Amazon Prime` as a Variant. The merchant-normalizer `requirements.md` SHALL be updated, with a note that this spec changed it: the Requirement 4.8 table (the rows of Criterion 3) and the Requirement 4.8 list of tokens that are not Variants (`"primevideo"`). Its service count (59) and the Requirement 4.2 table SHALL stay unchanged. The `known-services.test.ts` Variant and not-a-Variant checks SHALL be updated to match; the Requirement 4.11 property test and the Requirement 4.10 fixtures (`test-known-service-fixtures.ts`) need no change.
5. The normalizer sample snapshot `packages/core/src/normalize/__snapshots__/samples.test.ts.snap` SHALL be regenerated. The single `uk-debit-credit.csv` entry for `PRIMEVIDEO MEMBERSHIP` SHALL change to `key: "amazon-prime"`, `displayName: "Amazon Prime"`, `source: "known"`, `serviceId: "amazon-prime"`, `processor: null` and move to its sorted position; no other entry SHALL change. The parser snapshot (`parse/__snapshots__/parse-statement.test.ts.snap`) SHALL NOT change, because the parser does not normalize.
6. THE UK Sample's Detector output SHALL change only in that Subscription: `merchantKey: "amazon-prime"`, `merchant: "Amazon Prime"`, `serviceId: "amazon-prime"`, `source: "known"` and `id: "sub:GBP:monthly:*:amazon-prime"`, with `currentAmountCents: 899`, `yearlyCostCents: 10788`, `priceHistory` 2026-01-09: 899, `confidence: "high"` and its place in the order unchanged (fourth, by `yearlyCostCents`). No other UK line normalizes to `amazon-prime`, so no Group merges. The following SHALL be updated to match, with a note that this spec changed them: the UK table in subscription-detector Requirement 10.1 (the sample expectation only; no detector rule changes), the UK expectation in `packages/core/src/detect/samples.test.ts`, and the `"Primevideo Membership"` expectation in `apps/web/src/slice/logic/analyze-statement.test.ts`.
7. All other existing normalizer, detector and web tests SHALL pass unchanged.

---

### Requirement 11: Correctness properties

**User Story:** As the Zombills test suite, I want property-based tests for the classifier's guarantees, so that fast-check finds subscriptions that get a wrong or unexplained label before a user does.

#### Acceptance Criteria

1. THE property tests SHALL draw Subscriptions from two sources: (a) Detector output, by running `detectSubscriptions` on the detector's existing test arbitraries; and (b) a Subscription arbitrary in `packages/core/src/classify` that builds values keeping the detector's invariants (`priceHistory` non-empty with consecutive entries of different amounts and the last equal to `currentAmountCents`; `yearlyCostCents = currentAmountCents × Cadence factor`; when `introCharge` is set, it is the first `priceHistory` entry, its date is `charges[0].date`, and `2 × introCharge.amountCents < ` the first Regular charge's amount (detector Requirements 3.6 and 3.7 join any higher intro as a price change); when `introCharge` is `null`, a first `priceHistory` entry that is a single charge followed by a different price only when `source` is `"known"` (detector Requirement 3.6 joins a one-charge Segment only for known Groups); `charges` is oldest first with distinct dates, holds a charge dated `evidence.firstChargeDate`, and `evidence.regularChargeCount` equals the number of non-intro charges; a `cadenceAssumed` value has one charge) and varies `cadence`, `status`, `cadenceAssumed`, `startedInStatement`, `regularChargeCount`, `introCharge`, `freeTrialDate` (including a date equal to `firstChargeDate`), in-band steps, and price rises and falls. A unit test SHALL check that source (b) produces each of: a current price more than a band above the first paid price, a rise followed by a fall back to within a band of the first paid price, an in-band step only, an intro charge, an Inferred intro charge, a free-trial date equal to `firstChargeDate`, a full-price charge count (Requirement 3.1) above 3 with a trial signal, `"ended"` and `cadenceAssumed: true`. Answers SHALL be drawn as maps whose keys mix input ids and other strings, and whose values mix the two Usage answers with other values.
2. *(PBT: never throws, order preserved)* FOR ALL inputs from Criterion 1 and FOR ALL answer maps, `classifySubscriptions` SHALL NOT throw, SHALL return an array of the input's length, and the result's ids SHALL equal the input's ids in the same order.
3. *(PBT: no other field changes)* FOR ALL inputs, each result element with `labels`, `priceRise` and `trial` removed SHALL deeply equal its input element with `labels` (and any `priceRise` or `trial`) removed, and the input SHALL deeply equal a copy taken before the call.
4. *(PBT: labels only from evidence)* FOR ALL inputs and answers, for every result element: `"possessed"` is in `labels` exactly when `priceRise !== null`, exactly when the element is an Eligible subscription whose Paid price history has at least 2 entries and whose `currentAmountCents` is a Band rise from the first Paid price history amount; `"trial-trap"` is in `labels` exactly when `trial !== null`, exactly when the element is an Eligible subscription with a full-price charge count `≤ 3` (Requirement 3.1) and at least one trial signal of Requirement 3.1 (and, unless it has an Inferred intro charge, a charge dated `firstChargeDate`); a result with an Inferred intro charge in `trial` SHALL NOT have a `priceRise` whose `firstSeen` is that charge; `"zombie"` is in `labels` exactly when `status` is `"active"` and `answers.get(id) === "not-using"`. An element with `status: "ended"` SHALL have `labels: []`; an element with `cadenceAssumed: true` SHALL have no label other than `"zombie"`. `labels` SHALL have no duplicates and follow Canonical label order.
5. *(PBT: price rise arithmetic)* FOR ALL result elements with `priceRise !== null`: every money field is a safe integer; `currentAmountCents` equals the element's `currentAmountCents`; `firstSeen` equals the first Paid price history entry; `increasePerChargeCents = currentAmountCents − firstSeen.amountCents` and `increasePerChargeCents × 20 > firstSeen.amountCents`; `increasePerYearCents = increasePerChargeCents × Cadence factor` and `increasePerYearCents = yearlyCostCents − firstSeen.amountCents × Cadence factor` exactly, so no minor unit is lost or gained; and when `latestRise` is not `null`, its `fromAmountCents` and `toAmountCents`/`date` are consecutive Paid price history entries forming a Band rise, with no later consecutive pair that is a Band rise.
6. *(PBT: idempotent)* FOR ALL inputs and FOR ALL answer maps `a` and `b`, `classifySubscriptions(classifySubscriptions(s, a), a)` SHALL deeply equal `classifySubscriptions(s, a)`, and `classifySubscriptions(classifySubscriptions(s, a), b)` SHALL deeply equal `classifySubscriptions(s, b)`.
7. *(PBT: deterministic)* FOR ALL inputs and answers, two calls with the same arguments SHALL return deeply equal results.
8. *(PBT: answers only touch zombie)* FOR ALL inputs and FOR ALL answer maps `a` and `b`, the results for `a` and `b` SHALL be deeply equal after removing `"zombie"` from every `labels` array; and the results for `a` and for `a` plus any entries whose keys are not input ids SHALL be deeply equal.
9. *(PBT: input order)* FOR ALL inputs and FOR ALL permutations of them, classifying the permuted input SHALL give the permutation of the original result.
10. Unit tests SHALL cover every example table in Requirements 2, 3, 5 and 6, a non-array input throwing `TypeError`, a non-`Map` `answers` value treated as empty, an input element that already carries labels (Requirement 1.6), and the guard of Requirement 3.3.
