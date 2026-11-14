# Requirements review 1 (spec-reviewer agent, Kiro CLI, Opus 5.5, 2026-11-14)

1. **Severity: blocker**
   - **Where:** R4.2, R4.3, R11.8
   - **Problem:** Each expected date is computed from the previous actual charge. When a shift pushes a charge across the end of February, the next on-time charge looks 4–5 days early, so the Series splits. This makes the R11.8 property false. It also breaks a gym billed on the 1st whose bank moves the March charge back to the Friday before.
   - **Failing example:**
     - R11.8 generator (anchor 27, shift 0–2): 2026-01-27, 2026-03-01 (Feb 27 + 2), 2026-03-27, 2026-04-27. The interval 03-01 → 03-27 is 5 days before `addMonths(03-01, 1)` = 04-01. It is neither on schedule nor late.
     - Gym on the 1st: 2026-01-02, 02-02, 02-27, 04-01, 05-01. 02-27 → 04-01 is 5 days after 03-27, and the late rule fails because 05-01 is 4 days after `addMonths(02-27, 2)` = 04-27. The result is two subscriptions, `…:2900-1:…` (ended) and `…:2900-2:…`.
   - **Suggested fix:** In R4.3, add: "`b` is also on schedule WHEN it is within Tolerance of `addMonths(f, j)`, where `f` is the Segment's first Regular charge and `j` is `b`'s period index." Keep the previous-charge rule so the 3rd → 5th billing move still works. Add both examples to the R4.8 table.

2. **Severity: blocker**
   - **Where:** R3.4, R4.7, R5.1, R5.2, R5.6
   - **Problem:** The spec doesn't say whether "choose the Segments that cover the most charges" runs before or after the minimum-evidence and density checks. It also doesn't say whether one band can hold Segments of different cadences. The two readings give different results, and each one breaks a stated goal.
   - **Failing example:**
     - Reading "filter first": a generic coffee at 450 every Monday, Jan 5 – Feb 2, a 3-week holiday, then Mar 2, 9, 16, 23. The Segment {Feb 2, Mar 2} has n = 2, equal amounts and m = 2 < 3, so it is reported as a medium monthly card. That breaks R5's user story.
     - Reading "select first, mixed cadences": a generic 999 band on Jan 1, 8, 15 (one-off purchases) and a monthly charge on Jan 1, Feb 1, Mar 1, Apr 1. Weekly {Jan 1, 8, 15} plus monthly {Feb 1 – Apr 1} covers 6 charges, which beats monthly-only (4). Jan 1 drops out of the real subscription, which changes `firstChargeDate` and `startedInStatement`.
   - **Suggested fix:** State the pipeline order explicitly. For example: per band, enumerate Segments of all three cadences → drop Segments that can never be reported (generic or unidentified weekly) → choose the cover → join (R3.6) and add intro charges (R3.7) → apply R5.1 and R5.6. Add the two examples above as fixtures. Say whether one band can hold Segments of different cadences.

3. **Severity: blocker**
   - **Where:** R11.3, R5.4, R2.4, R3.4
   - **Problem:** Several tie-breaks end at "input position" or at nothing, between elements that aren't identical. That makes R11.3 (order independence) false. R11.3 also says "five Transaction fields", but a Transaction has four.
   - **Failing example:**
     - R5.4: `[{2026-03-01,"NETFLIX.COM",1549,USD,netflix}, {2026-03-01,"NETFLIX.COM",999,USD,netflix}]`. Swapping the two changes `currentAmountCents` from 999 to 1549, or the reverse.
     - R3.4: one band with charges on Jan 10, Feb 9, Feb 11 and Mar 10. {Jan 10, Feb 9, Mar 10} and {Jan 10, Feb 11, Mar 10} both cover 3 charges, start on the same date and have a deviation sum of 2. Nothing decides which Feb charge is "not-recurring".
   - **Suggested fix:** End every tie-break chain with a total order on content: date, then `amountCents`, then `description`, then `merchant.displayName`, `source`, `serviceId`, `processor`, and only then position, which is reached only for identical elements. For R3.4, finish with "then the lexicographically smallest list of charge dates, then amounts". In R11.3, change the wording to "four Transaction fields".

4. **Severity: should-fix**
   - **Where:** Introduction (out-of-scope list), R4.3, R6.2
   - **Problem:** The Introduction says "every N days" plans are not detected. But a 28-day plan passes as monthly indefinitely: each 28-day interval is 0–3 days before `addMonths`. The New York Times, which is in KNOWN_SERVICES, bills every 4 weeks. Its yearly cost comes out as ×12 when the real figure is ×13, an understatement of 7.7 %.
   - **Failing example:** 2026-01-01, 01-29, 02-26, 03-26, 04-23, 05-21 … 12-03, 12-31 at 2500. Each interval deviates by −3, −2, 0, −3, −2, …, all within ±3. The result is monthly, `yearlyCostCents: 30000`, but the user pays 32500.
   - **Suggested fix:** Either reject a monthly Series when every interval is exactly 28 days (and add a fixture), or move "4-weekly plans are detected as monthly and their yearly cost is understated by 1/13" into the out-of-scope list. In both cases, correct the Introduction sentence.

5. **Severity: should-fix**
   - **Where:** R5.4, R7.5, R7.7, R6.2
   - **Problem:** The assumed cadence for a single known charge changes yearly cost by a factor of 12 in either direction, and the result is always "active". R7.7 also contradicts R7.5 on long inputs.
   - **Failing example:**
     - Amazon Prime annual charge of 13900 on 2026-03-20, statement ending 03-31: assumed monthly, `yearlyCostCents: 166800`, and the tombstone shows a 12× saving.
     - Netflix 1549 on 2026-01-02, statement ending 03-25 (the user cancelled): assumed yearly, active. This contradicts R7's user story.
     - The Reaper concatenates statements so that a single charge on 2025-01-10 sits in input that ends on 2026-03-01. R7.5 says ended (2026-01-10 + 7 < 03-01), but R7.7 says active.
   - **Suggested fix:** Make R7.7 conditional ("unless R7.5 gives ended"). Also add a criterion that says how consumers must treat `cadenceAssumed: true`. For example, the graveyard UI asks the user for the cadence before counting savings. Reference that from the classifier and graveyard-ui specs.

6. **Severity: should-fix**
   - **Where:** R3.7, R9.4
   - **Problem:** For generic and unidentified keys, any cheaper one-off charge one period before a Series becomes its Introductory charge. That is a false trial-trap signal.
   - **Failing example:** Under the key `unidentified:apple:apple.com/bill 866-712-7753 ca`, there is an app purchase of 199 on 2026-01-10, then Apple Music at 1099 on 02-10 and 03-10. The 199 purchase becomes `introCharge`, and the classifier labels Apple Music a trial trap.
   - **Suggested fix:** Limit R3.7 to `source: "known"`, or to groups whose key has only one Series. Add the example as a negative fixture.

7. **Severity: should-fix**
   - **Where:** R5.6
   - **Problem:** The density rule rejects a real iCloud+ subscription as soon as there are two app purchases at the same price within its span. The spec's own example uses only one, which hides this.
   - **Failing example:** iCloud+ at 99 on Jan 12, Feb 12 and Mar 12, plus app purchases at 99 on Jan 20 and Feb 25. That gives m = 5 and 2n − 1 = 5, so iCloud+ is rejected.
   - **Suggested fix:** State this as a known limitation in the out-of-scope list and add it as a fixture. Alternatively, count in `m` only same-band charges that fall within Tolerance of a half-period point between expected dates. That still rejects fortnightly habits.

8. **Severity: should-fix**
   - **Where:** R4.6, R7.5
   - **Problem:** The two late-charge rules don't fit real billing:
     - A failed payment that the merchant re-bills from the retry date (Apple, many gyms) is not accepted as late, because R4.6 only continues the schedule from `a`.
     - R7.5 marks a Series ended while its next charge is still within the 4–10-day late window that R4.6 accepts. The user is then told a live subscription is dead.
   - **Failing example:**
     - Re-bill: 2026-01-15, 02-22, 03-22. 02-22 is not late, because 03-22 is 7 days after 03-15. The result is a Series of 02-22 and 03-22 only, and 01-15 becomes not-recurring.
     - Ended too early: last charge 02-15, As-of 03-20. 03-15 + 3 = 03-18 is before 03-20, so the Series is ended, even though a charge on 03-21 would have been accepted as late.
   - **Suggested fix:** In R4.6, also accept `b` as late when `c` is on schedule after `b` with `k = 1`. In R7.5, use +10 days for monthly. If you keep +3, add an evidence flag such as `overdue: true` and say how the UI should present it.

9. **Severity: should-fix**
   - **Where:** R3.2, Introduction (out-of-scope list)
   - **Problem:** A subscription billed in a foreign currency and converted by the bank changes amount each month with the exchange rate and any foreign-transaction fee. A 5 % band splits it, so it is missed. The spec doesn't mention this case.
   - **Failing example:** A UK card paying a USD 10.00 plan: GBP charges of 775, 821 and 798. The amounts 775 and 821 differ by 46 (46 × 20 = 920 > 775), so they fall into different bands and no Segment has 3 charges.
   - **Suggested fix:** Add to the out-of-scope list: "Charges converted from another currency whose amount varies by more than 5 % are not detected." Alternatively, widen the band for generic and unidentified sources and give a number.

10. **Severity: should-fix**
    - **Where:** R2.1, R1.6, R1.12, R1.13, R3.6, R5.4
    - **Problem:** The definition of a valid transaction has gaps:
      - `description` is never validated, yet R2.4 and R5.4 compare it.
      - R1.12 requires `charges` to be deep copies of arbitrary input objects, including extra properties, cycles and getters. That conflicts with "never throws" for any element contents. The normalizer (R8.2) explicitly drops extra properties.
      - A Group can mix `source` or `serviceId` values, which leaves "the Group's source" (R3.6, R5.4) and "the values shared by every charge" (R1.6) undefined.
    - **Failing example:**
      - `{date:"2026-01-01", description: Symbol(), amountCents:100, currency:"USD", merchant:{…}}` is valid, and `<` on a Symbol throws.
      - An element whose `date` getter throws breaks R1.13.
      - Two "netflix" charges, one with `source:"known"` and one with `source:"generic"`, form one Group with two sources.
    - **Suggested fix:**
      - Add "`description` is a string" to R2.1.
      - Require that the key prefix agrees with `source` (known → no `:`, `serviceId === key`), as in normalizer R1.7.
      - In R1.12, say `charges` contain copies of the four Transaction fields plus the five merchant fields only.
      - Limit R1.13 and R11.1 to plain data values, or require every field read to be guarded.

11. **Severity: should-fix**
    - **Where:** R8.2, R8.3, R8.5
    - **Problem:** Ids have a uniqueness gap and stability gaps:
      - The `-r` rank can tie, so R8.3 isn't guaranteed.
      - On shared keys such as APPLE.COM/BILL, the id changes with a price rise, or when the other subscription is gone in the next statement. A kept or buried state in `localStorage` is then lost.
      - The cadence in the id flips between yearly and monthly for a single-charge subscription (R5.4) as soon as a later statement shows more charges.
    - **Failing example:**
      - Two Series in one Group, both starting 2026-01-01 and both ending at 1499: one from a 999 band joined to 1499 charges on Mar 1 and Apr 1, the other from a 1200 band joined to 1499 charges on Mar 3 and Apr 3. Both get `1499-1`.
      - Apple Music going from 1099 to 1199 next to iCloud+ changes `…:1099:…` to `…:1199:…`.
    - **Suggested fix:**
      - Extend the rank tie-break to "then by the list of Series charge dates, then amounts". R5.6 makes exact duplicates impossible, so this makes ids unique.
      - Add the shared-key and assumed-cadence instability to the out-of-scope list, so the graveyard-ui spec can plan for it.

12. **Severity: should-fix**
    - **Where:** R3.4, R11
    - **Problem:** "Choose the Segments that cover the most charges" is a set-cover choice with tie-breaks, and the spec puts no bound on it. Unlike normalizer R9.10, there is no input-size criterion, so a brute-force implementation would pass review.
    - **Failing example:** A year of a generic lunch at 1050 on every weekday (about 250 charges in one band) admits a combinatorial number of monthly Segment choices.
    - **Suggested fix:** Add: "THE Detector SHALL process 10,000 transactions, including a single band of 1,000 equal charges, in O(n log n + b²) per band…". Make the test count operations or use a generous bound (for example 2 s), to avoid flaky CI timing.

13. **Severity: should-fix**
    - **Where:** R11.11, R4.5, R3.6
    - **Problem:** R11.11 says "monthly Series", which includes price-change Series. Refunding a charge at a price-change boundary can break the join, so the property is false. The spec also doesn't say whether a 2-period gap at a join (R3.6) counts in `missedPeriods`, or whether it counts towards the k-ratio rule in R4.4.
    - **Failing example:** Generic 999 on Jan 1, 999 on Feb 1, 1099 on Mar 1, 1099 on Apr 1, with a refund of Feb 1. Segment A now has one charge, so no join happens. The result is a medium Series of Mar 1 and Apr 1 with `missedPeriods: 0`.
    - **Suggested fix:** Restrict the R11.11 generator to one constant amount, as in R11.8. In R4.5, state that the join gap counts as `k = 1` or `k = 2` for both R4.4 and `missedPeriods`.

14. **Severity: nit**
    - **Where:** R5.1, Introduction
    - **Problem:** The spec doesn't say what short statements show. A 1-month statement shows no generic or unidentified subscription at all, such as a local gym billed on the 1st. A generic annual plan needs more than 12 months of data.
    - **Failing example:** Fitzone Gym on 2026-01-10 in a statement covering Jan 1–31 gives `subscriptions: []`.
    - **Suggested fix:** List both cases in the out-of-scope list, so the UI spec can prompt for at least 2–3 months of data.

15. **Severity: nit**
    - **Where:** R2.7, R3.9, R5.3, R12.6
    - **Problem:** Some criteria are rationale rather than testable EARS statements, and R12.6 doesn't match R12.2 or R7.3:
      - R5.3 ("SHALL rely on Amount bands") can't fail a test.
      - R2.7 opens with "Because…".
      - R12.6 says the Detector itself "SHALL fail the static analysis check".
      - R12.6's list leaves out `localStorage` (R12.2) and `new Date()` (R7.3).
    - **Failing example:** None needed.
    - **Suggested fix:**
      - Move R5.3 and R3.9's second sentence into notes.
      - Reword R2.7 as "IF a Credit is in a different Group from every Charge, THEN …".
      - Reword R12.6 as "THE static analysis check SHALL fail when the Detector source references …", and add `localStorage` and `new Date(` with no arguments.

16. **Severity: nit**
    - **Where:** R10.1 (us-signed, Greenleaf Market)
    - **Problem:** The stated reason is incomplete. 2026-03-09 also fails `k = 2`: it is 4 days after 03-05.
    - **Failing example:** 2026-01-05 → 2026-03-09.
    - **Suggested fix:** Write "(… 2026-03-09 is 4 days after the `k = 2` date 2026-03-05)".

17. **Severity: nit**
    - **Where:** R6.5
    - **Problem:** "an exact integer or leave the Series unreported" lets two implementations pass the same test with different results.
    - **Failing example:** A weekly known charge with `amountCents = 2^53 / 40` overflows when multiplied by 52.
    - **Suggested fix:** Choose one: "leave unreported; its charges get role `not-recurring`".

18. **Severity: nit**
    - **Where:** R11.10
    - **Problem:** The habit generator uses exact 7- and 14-day intervals with no jitter and no skipped weeks, so it never exercises the case in finding 2.
    - **Failing example:** The coffee holiday gap in finding 2.
    - **Suggested fix:** Add a shift of 0–2 days per charge and random skipped weeks to the generator.

Verdict: approve after fixes

---

## Review 1 resolution

| Finding | Decision | Criteria changed |
| --- | --- | --- |
| 1 | Applied: a charge is also on schedule within Tolerance of the date computed from the Segment's first charge; both examples added | R4.3, R4.8 |
| 2 | Applied: explicit step order; generic and unidentified weekly Segments dropped before the cover; one cadence per band; rejected Series are not re-chosen; both examples added as fixtures | R3.10 (new), R3.11 (new), R4.7 |
| 3 | Applied: Content order (all fields, then position) ends every tie-break; R3.4 ends with the smallest charge list; "four Transaction fields" | Glossary, R2.4, R3.4, R3.6, R3.7, R5.4, R11.3 |
| 4 | No new cadence: plans billed every 28 to 31 days are detected as monthly, 4-weekly cost understated by 1/13, stated as out of scope; Introduction bullet corrected | Introduction |
| 5 | Applied: single-charge status follows R7.5; consumers must not count savings or derive labels from an assumed cadence until the user confirms it | R7.7, R9.8 (new) |
| 6 | Applied: Introductory charges for source `"known"` only; Apple negative fixture | R3.7, R3.9 |
| 7 | Known limitation in the out-of-scope list; iCloud+ fixture shows the current rejection | Introduction, R5.6 |
| 8 | Applied: re-bill from the retry date accepted as late; monthly "ended" grace is +10 days | R4.6, R4.8, R7.5 |
| 9 | Out of scope: bank-converted foreign-currency charges varying by more than 5 % | Introduction |
| 10 | Applied: `description`, `processor` and key/source agreement validated; `charges` copy only the 4 + 5 fields; never-throws limited to plain data | R1.6, R1.12, R1.13, R2.1, R11.1 |
| 11 | Applied: rank tie-break by charge dates then amounts; shared-key and assumed-cadence id instability listed as out of scope | R8.2, Introduction |
| 12 | Applied: 10,000 transactions under 2 s, plus a counted `c × b²` comparison bound per band | R11.14 (new) |
| 13 | Applied: refund property limited to one amount; the join gap counts as `k = 1` or `k = 2` | R4.5, R11.11 |
| 14 | Applied: short statements listed as out of scope | Introduction |
| 15 | Applied: R5.3 and R3.9's rationale turned into notes; R2.7 reworded as IF/THEN; R12.6 reworded and extended with `localStorage` and `new Date(` | R2.7, R3.9, R5.3, R12.6 |
| 16 | Applied: Greenleaf reason completed | R10.1 |
| 17 | Applied: overflow leaves the Series unreported, charges `"not-recurring"` | R6.5 |
| 18 | Applied: shift and non-consecutive skipped weeks in the habit generator; long gaps covered by the R3.11 fixture | R11.10 |
