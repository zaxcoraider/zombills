# Design review 1 (spec-reviewer agent, Kiro CLI, Opus 5.5, 2026-11-14)

No blockers in the design itself; one fix needs a requirements change (Req 4.3 backward check). All four Req 10.1 samples and every R-table example reproduce. The comparison bound c = 20 was not proven.

## Design review decisions

| # | Decision | Reason / better rule |
| --- | --- | --- |
| 1 | **Accept** greedy sweep | The maximum cover in the design's own example reports one plan twice (`…:999-1:…` and `…:999-2:…`), so the greedy sweep gives the better answer. Req 3.4, 3.10 step 4 and 4.7 still say "most charges", so they need rewording to describe the sweep. |
| 2 | **Accept** | Req 5.4 is the testable criterion, and Req 9.8 already stops the guessed yearly cost from counting. Amend the "two Spotify accounts" and quarterly lines in the Introduction. |
| 3 | **Reject** | See finding 2 for the replacement rule. |
| 4 | **Accept** | Req 4.4 is a SHALL anyway. A refused join leaves B free for other Series. |
| 5 | **Accept** | Measuring from the end of the Series built so far is the only reading that works when joins repeat. |
| 6 | **Accept** | This is consistent with Req 3.8, which says only Regular charges count towards Req 5. Amend Req 5.6 to say "any Amount band of its Regular charges". |
| 7 | **Accept** | Req 5.4 says "no reported Subscription", which conflicts with the step order in Req 3.10. Amend Req 5.4 to say "no Series accepted in step 6". This only matters above the parser's amount limit. |
| 8 | **Reject** | See finding 6. |
| 9 | **Accept** | |
| 10 | **Accept, fix the wording** | Continuation 1 after a late charge is the same test as the `k = 2` class, so preferring the late step never loses a charge. The claim that both `missedPeriods` and `lateChargeDates` are kept "as small as the data allows" is wrong: the late step trades one missed period for one late date. Say that instead. |
| 11 | **Accept** | |
| 12 | **Reject until re-derived** | See finding 3. |

## Findings

1. **Severity: should-fix (needs a requirements change; the design itself is fine)**
   - **Where:** Req 4.3, Req 11.8, Req 11.11; design property table P8 and P11.
   - **Problem:** A first charge that a shift pushes past the end of February gets stranded. The rule that measures from the first charge (the "anchor") is that same charge, so it can't help, and measuring from the previous charge sees a 26-day gap, which is 5 days early. P8 will find this.
   - **Failing example:** Generic `999`, start 2026-02-27, shifts 2, 0, 0, 0. That gives the dates 03-01, 03-27, 04-27, 05-27. The expected date after 03-01 is 04-01, and 03-27 is 5 days off, so 03-01 becomes `"not-recurring"`. The same thing happens in 2024 with anchor 28: 02-28 + 2 days = 03-01, then 03-28.
   - **Suggested fix:** Add a backward check to Req 4.3: "`b` is also on schedule after `a` WHEN `a` is within Tolerance of `addMonths(b, −k)` (yearly `addMonths(b, −12)`)." For 03-01 and 03-27 the backward date is 02-27, 2 days off, so the pair is accepted. This changes none of the Req 4.8 rows: 01-15→02-26 is 11 days off, 01-15→03-15 still has no `k = 1` interval, and Greenleaf 01-05→03-09 is 4 days off. Then delete "more than 3 days early … is not on schedule" from Req 4.6, which the anchor rule already contradicts. The fallback is to restrict the generator, but that weakens the test.

2. **Severity: should-fix**
   - **Where:** Design review decision 3; Req 3.6 and Req 3.10 step 4.
   - **Problem:** In a 2-month statement, a price change at a known service never joins, so the `possessed` label is lost. The id also flips from `yearly` to `monthly` on the next upload. Req 3.6 already lets a single known charge start a join ("A has at least 2 charges, or the Group's source is known"). Only the missing cadence blocks it.
   - **Failing example:** Netflix `1549` on 01-02 and `1799` on 02-02. Today this gives one charge reported alone with `cadenceAssumed: true` and `priceHistory` holding only `1799`.
   - **Suggested fix:** Add to Req 3.6: "WHEN the Group's source is `"known"` and `A` and `B` are both one-charge Segments, they SHALL join when the other conditions hold and the charge of `B` is one Period after the charge of `A` within Tolerance (previous-charge rule with the month-end alternative), trying monthly and then yearly. The Series takes the first cadence that fits. Weekly is not tried, because a known weekly Series needs `n ≥ 3`." Only `k = 1` is allowed, because Req 4.4 needs one `k = 1` interval. The example then gives one monthly Series with `confidence: "high"`, `priceHistory` 1549 → 1799 and id `sub:USD:monthly:*:netflix`. I checked that these still behave as before:
     - Req 5.4: the two charges are on the same date, so B is not after A.
     - Req 3.7 intro: `1499 > 2 × 100`, so the price-change test fails.
     - Quarterly Netflix and the two Spotify accounts: one band, so no join.
     - Req 3.6 supermarket: generic, not known.
     - Req 9.8 and 7.7: single charges.
     - Req 10 Netflix: a Segment followed by one charge, which is unchanged.
   - **Side effect to accept explicitly:** Netflix `999` then `1499` a month apart now becomes a price change rather than an intro. Req 3.7's "Criterion 6 did not join" already implies this for three-charge inputs.

3. **Severity: should-fix**
   - **Where:** Design "Comparison bound"; Req 4.3, Req 11.14.
   - **Problem:** The bound assumes every next charge is at least 25 days after the previous one, but the anchor rule doesn't guarantee that. After drift, an anchor date can sit just after the previous charge. The derivation also skips the extra windows scanned after a late charge. The test (equal charges on consecutive days) never drifts and never takes a late step, so it can't catch either problem.
   - **Failing example:** Monthly from f = 01-01: 02-04, 03-07 and 04-10 each pass the previous-charge rule at 3 days off. Then 04-28 is 3 days from `addMonths(f, 4)` = 05-01, so Req 4.3 accepts an 18-day "monthly" interval.
   - **Suggested fix:** Amend Req 4.3 so the anchor rule only applies when `b` is also at least one Period minus Tolerance after `a` (25 days monthly, 5 weekly, 358 yearly). All Req 4.8 rows, 3.4, 3.11, the NYT example and finding 1 still pass, since every gap there is 25 days or more. Then re-derive c, counting the late-state windows; 24 is a safe figure. Add a band built to drift and take late steps to `performance.test.ts`.

4. **Severity: should-fix**
   - **Where:** Req 11.9 yearly; `yearlyPairArb`.
   - **Problem:** If both charges get an independent 0–7 day shift, crossing a 29 February adds one more day.
   - **Failing example:** Start 2023-02-28 with shifts 7 and 0 gives 2023-03-07 and 2024-02-28. The expected date is 2024-03-07, which is 8 days away.
   - **Suggested fix:** Specify `b = addMonths(a, 12) + s` with `s` from 0 to 7. The backward check in finding 1 also fixes this case (2023-02-28 vs 03-07 is 7 days).

5. **Severity: should-fix**
   - **Where:** Testing strategy; Req 9.5, 9.6, 9.7.
   - **Problem:** Nothing tests that `freeTrialDate` gets set, that `startedInStatement` can be `true`, or that `partialRefunds` can be non-empty. P19 only checks that nothing else changes, and the samples only cover `null`, `false` and `[]`.
   - **Suggested fix:** Add `build-subscription.test.ts` with:
     - a zero-amount row exactly at the edge of the window (`e` minus one Period minus Tolerance) and one day outside it;
     - a Series starting 01-02 + 1 month + 3 days (false) and +4 days (true);
     - a partial refund at the last charge + 45 days (included) and + 46 days (excluded).

6. **Severity: should-fix**
   - **Where:** Design review decision 8; `content-order.ts`; the glossary's Content order.
   - **Problem:** The glossary says input position is reached "only for elements whose four Transaction fields and merchant are all equal". Its list leaves out `currency` and `merchant.key`, so that sentence is false.
   - **Suggested fix:** Compare `currency` and `merchant.key` before `index` in `compareContent`. It costs nothing and makes the global sort depend only on content. Amend the glossary list to match.

7. **Severity: nit**
   - **Where:** Design "Full refunds"; Req 2.4.
   - **Problem:** Walking backwards from the last Charge with `c.day ≤ r.day` lands on the last same-date Charge in Content order, but the text says the first one wins. Also, a Group with many identical same-day Charges and Credits makes the scan quadratic.
   - **Suggested fix:** After finding the latest date, step to the first unmatched Charge on that date. Keep a "previous unmatched" pointer per amount list, so skipped Charges are not rescanned.

8. **Severity: nit**
   - **Where:** `internal-types.ts` `Entry.merchant.processor`, against `NormalizedTransaction`.
   - **Problem:** Req 2.1 accepts any string as `processor`, but the output type is `ProcessorId | null`. Under strict TypeScript the copy into `charges` needs a cast.
   - **Suggested fix:** State the cast with a comment (`as ProcessorId | null`, input validated only as a string per Req 2.1).

9. **Severity: nit**
   - **Where:** Design "Joins across bands" and "Introductory charges".
   - **Problem:** The search for the next piece is quadratic in the number of pieces in a Group. A known Group with thousands of distinct amounts could reach about 10⁸ checks. Finding 2 adds more single-charge joins to that search.
   - **Suggested fix:** Sort the pieces by first-charge day and binary-search the window from one Period minus Tolerance to two Periods plus Tolerance after the last charge.

10. **Severity: nit**
    - **Where:** Fixture table, Req 5.6 second row.
    - **Problem:** The sweep also builds a second Segment, 01-20 → 02-25, which counts as a late charge. Density rejects it only because `m = 3 = 2n − 1`. The fixture doesn't pin this down.
    - **Suggested fix:** Note that second Segment in the expected result, so a change to the late rule shows up.

11. **Severity: nit (requirements)**
    - **Where:** Req 3.6.
    - **Problem:** A price change billed late doesn't join, which hides the price increase.
    - **Failing example:** Netflix `1549` on 01-02 and 02-02, then `1799` on 03-07. The `1799` charge becomes `"not-recurring"` and `currentAmountCents` stays `1549`.
    - **Suggested fix:** Consider allowing the late window (4–10 days) at monthly joins.

## Checks with no findings

- **Samples:** All four Req 10.1 samples come out as listed: Subscriptions, order, price histories, `startedInStatement: false` and usage counts (12/7/7, 15/5/5, 9/5/5, 9/3/3).
- **R-table examples:** Every example in Req 3.4, 3.5, 3.6, 3.7, 3.11 and 4.8 gives the stated result, as do the 5.4, 5.6, 7.5, 7.7 and 9.8 fixtures and the Introduction fixtures (NYT gives 30000).
- **Other properties:** P10 holds because every monthly interval is longer than 16 days and so skips a habit charge, giving `m ≥ 2n − 1`; finding 3's minimum gap would make that airtight. P3 holds by the single sort; P12 by the rank argument; P5 and P6 by the safe-integer check.
- **Money:** Integer cents throughout, the overflow-safe banding test is correct, and the safe-integer check is monotone.
- **Privacy and environment:** No network, DOM, clock or randomness use; the static scan covers Req 12.6.
- **Not applicable:**
  - EARS (checklist 1): the design has no acceptance criteria of its own.
  - Traceability (checklist 7): no `tasks.md` exists yet.
  - Code batch (checklist 8): nothing is implemented yet.

Verdict: approve after fixes

## Review resolution

Applied to `requirements.md` and `design.md` on request. No tasks, no code, no commit.

| Finding | Decision | Sections / criteria changed |
| --- | --- | --- |
| Decisions table 1, 2, 4, 5, 6, 7, 9, 10, 11 | Accepted as the reviewer gave them, with the wording fixes | Design "Design review decisions" items marked accepted; item 10 reworded (late step trades a missed period for a late date); item 5 notes the late rule now applies at monthly joins. Requirements: see findings below and Req 3.4, 3.10 step 4, 4.7 (decision 1), Introduction (decision 2), Req 5.6 (decision 6), Req 5.4 (decision 7) |
| Decisions table 3, 8 | Rejected; replaced by findings 2 and 6 | Design decisions 3 and 8 marked rejected with pointers |
| Decisions table 12 | Re-derived per finding 3 | Design decision 12; "Comparison bound" |
| 1 Stranded first charge after February | Accepted | Req 4.3: backward check added; Req 4.6: "more than 3 days early … not on schedule" sentence removed. Design: "Schedule rules" (backward column, `deviation`, note on month-end effect), `deviation` signature, "Growing one chain" example, joins and intro rules use the backward check, `schedule.test.ts`, P8 note |
| 2 Known one-charge price change never joins | Accepted, side effect accepted explicitly | Req 3.6: known one-charge + one-charge join (k = 1, monthly then yearly, no weekly, no late) with Netflix example and the price-change-not-intro note; Req 3.10 step 4 cadence of joined one-charge Segments. Design: "Joins across bands" candidate rules and examples, `series.test.ts`, fixture row |
| 3 Comparison bound unproven | Accepted | Req 4.3: minimum gap for the anchor rule (25 / 5 / 358 days) with the drift example. Design: `MIN_GAP_DAYS`, `WINDOW_DAYS`, window definitions in "Growing one chain", "Comparison bound" re-derived (13 b² cover + 3 b² joins/intros = 16 b², stated c = 24), Performance table, `performance.test.ts` drifting/late band, P20 counter property, `driftingLateBandArb` |
| 4 Yearly generator crosses 29 February | Accepted | Req 11.9 yearly: `b = addMonths(a, 12)` plus 0–7 days. Design: `yearlyPairArb` |
| 5 Evidence fields untested | Accepted | Design: `build-subscription.test.ts` row (freeTrialDate edge, startedInStatement 02-05 / 02-06, partialRefunds + 45 / + 46) |
| 6 Content order omits currency and key | Accepted | Glossary Content order lists `currency` and `merchant.key`. Design: "Content order" section, `content-order.test.ts` |
| 7 Refund tie-break and quadratic scan | Accepted | Design: "Full refunds" (first unmatched charge on the latest date; "previous unmatched" pointers), Performance table, `refunds.test.ts` |
| 8 `processor` type | Accepted | Design: `internal-types.ts` comment stating the `as ProcessorId \| null` cast; `build-subscription.test.ts` |
| 9 Quadratic join search | Accepted | Design: "Joins across bands" (pieces indexed by first-charge day, binary-searched window) |
| 10 Second Segment in Req 5.6 fixture | Accepted | Design: Req 5.6 fixture row names both Segments and their `m` |
| 11 Late price change does not join | Accepted: late window (4–10 days) allowed at monthly joins, except between two one-charge pieces | Req 3.6: late join condition (not after a late charge; `B`'s second charge must continue as Req 4.6 requires) and Netflix 03-07 example. Design: join candidate rules, `series.test.ts`, fixture row |

Re-checked by hand after the edits:

- **Req 10.1 samples.** All four still give the listed Subscriptions, order, price histories and usage counts (12/7/7, 15/5/5, 9/5/5, 9/3/3). Every sample interval is 28–31 days, so the minimum gap never applies, and no sample date sits where `addMonths` clamps, so the backward check changes nothing. No known Group has two one-charge pieces in different bands. The only multi-band generic merchants (Lone Star Fuel, Highfield Stores, Market Square Foods, Supermarkt Nord, Tankstelle Am Ring, Corner Grocery) are one-charge pieces, which never start a join, so late joins add nothing. Greenleaf 01-05 → 03-09 is 4 days off by the forward, backward and anchor rules.
- **R-table examples.** Req 3.4, 3.5, 3.6 (both original rows), 3.7 (both), 3.11 (both) and all 12 rows of Req 4.8 still give the stated results. In the gym row, 02-27 → 04-01 is now also on schedule by the backward check (2 days) and has a gap of 33 days. In the 01-27 / 03-01 / 03-27 row, the anchor step has a gap of 26 days. The 5.4, 5.6, 7.5, 7.7 and 9.8 fixtures and the Introduction fixtures are unchanged: NYT still gives 30000 (every gap is 28 days); quarterly and two-account Netflix and Spotify have one band, so they do not join; the Req 3.7 intro example fails the factor-2 test (1499 > 200) before any join.
- **New examples.** Netflix 1549 01-02 / 1799 02-02 gives one monthly high-confidence Series. Netflix 1549 01-02, 02-02 / 1799 03-07 gives a late join with `lateChargeDates: ["2026-03-07"]`. The Req 4.3 drift example rejects 04-28 (18-day gap).

Stopped for review.
