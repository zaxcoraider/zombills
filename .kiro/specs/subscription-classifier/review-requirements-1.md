# Review: subscription-classifier requirements (review 1)

Reviewer: Kiro custom agent `spec-reviewer` (Opus 5.5), 2026-11-15. Findings copied verbatim below; resolution table appended after fixes.

I found no blockers and seven major issues. The sample expectations in R8.1 and R6.7 match the real detector output: `detect/samples.test.ts` and `normalize/samples.test.ts` both pass, and they assert `priceHistory`, `status: "active"` and `introCharge`/`freeTrialDate: null` for every sample subscription. I could not run ad-hoc `node` scripts in this session, so the failing examples below are worked out from detector R3.6/R3.7 and `build-subscription.ts`, not executed.

Checklist items that do not apply yet: traceability (item 7) needs `design.md` and `tasks.md`, which don't exist, and the code batch (item 8) needs implemented tasks. I found nothing for performance or flakiness.

1. **Major. Where:** R3.1, R3.4, R11.1(b); detector R3.6 and R3.7.
   - **Problem:** The detector only sets `introCharge` when the intro is less than half the full price. Detector R3.6 joins a one-charge known Segment to the next one as a *price change* whenever `max ≤ 2 × min`, and that join runs before R3.7. So the common "50 % off first month" pattern comes out as `possessed`, not `trial-trap`. R3.4's claim that the detector already checked the intro price only covers the case where the intro is below half the full price.
   - **Failing example:** Netflix `750` on 2026-01-10, then `1499` on 02-10 and 03-10. Since `1499 ≤ 1500`, the detector joins them: `priceHistory` 750 → 1499, `introCharge: null`. The classifier returns `["possessed"]`, "+$89.88 a year", and no trial trap.
   - **Suggested fix:** Pick one and state it:
     - Amend detector R3.6/3.7 so that a one-charge `A` followed by a higher `B` with at least 2 Regular charges, where `A` is the earliest Series charge and `startedInStatement` is true, becomes an Introductory charge.
     - Or list "intro price at or above half the full price is reported as possessed" in the classifier's out-of-scope list.

     In both cases, constrain the R11.1(b) arbitrary to `2 × intro < firstRegular` so it only builds states the detector can produce.

2. **Major. Where:** R3 and the Introduction; detector R3.7 ("`c` is in no Series").
   - **Problem:** A multi-month intro becomes a separate Subscription with no trial signal at all.
   - **Failing example:** Known `netflix` at `100` on 2026-01-10, 02-10 and 03-10, then `1499` on 04-10 and 05-10. The detector produces two Series: the 2× price-join limit fails and the 100s already form a Series. You get `sub:USD:monthly:100:netflix` (status `ended`) and `sub:USD:monthly:1499:netflix`, and neither is `trial-trap`.
   - **Suggested fix:** Add this case to the out-of-scope list, or open a detector amendment.

3. **Major. Where:** R2.1, R2.3; `detect/build-subscription.ts` `buildPriceHistory`.
   - **Problem:** `priceHistory` records every in-band change (variation within 5 %), so FX-converted or metered charges get `possessed`, and the label flips on and off from month to month.
   - **Failing example:** Generic GBP charges for a USD plan: `775`, `798`, `790`, `812` on the 10th of each month, all in one Amount band. The latest change is 790 → 812, so the result is `possessed`, "+£2.64 a year". If the next month is `805`, the label disappears.
   - **Suggested fix:** Count a rise only when it crosses an Amount band, using `(to − from) × 20 > from` (integer arithmetic, same rule as detector R3.2). Add the example above to R2.5 as "not possessed".

4. **Major. Where:** R2.1–R2.3, `PriceRise`; your question (a).
   - **Problem:** The rule only looks at the latest step, so the UI loses context in two ways:
     - 10 → 12 → 14 reports only 12 → 14, and the UI cannot say "up from $10".
     - 10 → 15 → 12 gets no label, although the user now pays 20 % more than the first price the statement shows. `product.md` defines possessed simply as a price increase.
   - **Suggested fix:**
     - Add `firstSeen: PricePoint` (the first Paid price history entry) and `increaseSinceFirstSeenPerYearCents` to `PriceRise`, so the UI can say "up from $10.00 on 2 Jan".
     - Decide explicitly whether "last price > first paid price" also counts as possessed, and add the 1000 → 1500 → 1200 row to R2.5 with whichever outcome you choose.
     - For 1500 → 1000 → 1200, which the spec currently labels possessed, the UI should show that the price is still below the first one seen.

5. **Major. Where:** R10 (Prime Video amendment), R10.3 and R10.4.
   - **Problem:** The sample charge of £8.99 is the UK *Amazon Prime* monthly price; standalone Prime Video costs £5.99. The merchant-normalizer Introduction itself says Amazon prints "PRIME VIDEO" for Prime membership charges. So "PRIME VIDEO MEMBERSHIP" most likely names the Prime membership. Mapping it to a new `prime-video` service misnames it, and the future cancel helper would point to the wrong flow. It also needs exceptions to normalizer R4.4 and R4.11. R10.3's `AMAZON PRIME VIDEO MEMBERSHIP` → `prime-video` is the clearest case.
   - **Suggested fix:** Drop the new service and add `contains("prime video membership")` and `contains("primevideo membership")` to `amazon-prime`. This follows R4.8's rule that a line maps to a service when the bank text names the subscription ("membership"). R4.4 and R4.11 then need no exception, the service count stays 59, and the UK row becomes `amazon-prime` / "Amazon Prime". If you keep `prime-video`, say why a £8.99 "membership" is Prime Video rather than Prime.

6. **Major. Where:** R10.5; `normalize/samples.test.ts:15-33`.
   - **Problem:** The snapshot stores one entry per *distinct, sorted* identity, so it has one Primevideo entry, not "three rows". The new key `prime-video` (or `amazon-prime`) also sorts to a different position in the list.
   - **Failing example:** As worded, R10.5 cannot be satisfied: no three-row change exists, and the diff also shows the entry moving.
   - **Suggested fix:** Reword to "the single `uk-debit-credit.csv` entry for `PRIMEVIDEO MEMBERSHIP` changes to … and moves to its sorted position; no other entry changes."

7. **Major. Where:** R6.2, R6.5; your question (e).
   - **Problem:** Re-analysing the same file gives the same ids (detector R8.4), so the answers API works for reloads. It fails across price changes on shared keys: the id holds `currentAmountCents`, so a stored `"not-using"` answer is dropped in the same statement that makes the subscription `possessed`.
   - **Failing example:** Apple Music on `APPLE.COM/BILL` next to iCloud+. The answer is stored for `sub:USD:monthly:1099:unidentified:apple:…`. The next statement has 1199, the id becomes `…:1199:…`, and the zombie label disappears silently.
   - **Suggested fix:** Add a note that the graveyard-ui spec must keep answers for ids missing from the current result, and offer to re-attach them by `merchantKey` + `currency` + `cadence`. Also say that `answers` is a `Map`, so the graveyard UI must convert to and from JSON for `localStorage`.

8. **Minor. Where:** R3.1; `build-subscription.ts` `findFreeTrialDate`.
   - **Problem:** `freeTrialDate` is set for generic and unidentified Groups too, and its window includes the first charge's own date. The detector kept `introCharge` to known Groups to avoid false trial signals, but this path has no such guard. A `0.00` authorization row (parser debit/credit R7.4) on the same day as the first charge produces a trial trap.
   - **Failing example:** `FIT GYM` `0.00` on 2026-02-05 plus `2900` on 02-05, 03-05 and 04-05. The page shows "Free trial ended on 5 Feb 2026 (free on 5 Feb 2026, then $29.00)".
   - **Suggested fix:** In the classifier, require `freeTrialDate !== evidence.firstChargeDate`. Or amend detector R9.5 to make the window exclusive of the charge date and restrict it to known sources.

9. **Minor. Where:** R3.1, R5.
   - **Problem:** `trial-trap` never expires. With concatenated statements (the Reaper), an intro from 11 months ago still labels the subscription. `product.md` describes it as the *first* paid charge after a free or cheap period.
   - **Suggested fix:** Either add a cut-off (for example `regularChargeCount ≤ 3`) or state that the label lasts while the intro is in the data.

10. **Minor. Where:** Introduction, R2.5 (yearly row); your question (c).
    - **Problem:** A yearly subscription cannot be `possessed` or `trial-trap` with 2 to 3 months of data. It needs two charges about 12 months apart (detector R4.3, R5.1), and a single yearly charge has `cadenceAssumed: true`, which R5.1 excludes. The same holds for a yearly intro, which needs a charge 12 months before.
    - **Suggested fix:** Say this in the Introduction so neither the demo nor the UI expects it.

11. **Minor. Where:** R7.3 against R3.2 and the Paid price history glossary entry.
    - **Problem:** R7.3 says the classifier "SHALL NOT … compare … dates", but R3.2 and the Paid price history definition match date strings for equality.
    - **Suggested fix:** Reword to "SHALL NOT parse or create dates, and compares date strings only for equality."

Verdict: approve after fixes

## Resolution

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1. Intro at or above half the full price comes out as `possessed` | Fixed in the classifier; the detector and its spec are unchanged. New Glossary term **Inferred intro charge**: `introCharge` is `null`, the first `priceHistory` entry is a single charge (so the first Series charge), `startedInStatement` is `true`, at least 2 charges are at the next price, and the step is a Band rise. It is a trial signal (`trial.introCharge` = that charge, `firstFullCharge` = the second `priceHistory` entry) and is removed from the Paid price history, so that step is never `possessed`. The Band rise condition was added so in-band drift (finding 3) cannot pass as an intro. The R11.1(b) arbitrary only builds detector-reachable states (`2 × intro < firstRegular`, single-charge first entries only for known sources). | Introduction (label bullets); Glossary (Paid price history, Inferred intro charge); R1.2 `TrialDetails`; R2.5 (750 → 1499 row); R3.1, R3.2, R3.4, R3.5 (750 → 1499, 1499 row and its `startedInStatement: false` counterpart); R4.2; R8.1 note; R11.1, R11.4 |
| 2. A multi-month intro becomes a separate Subscription | Out of scope, documented with the 100 × 3 then 1499 example | Introduction, out-of-scope list |
| 3. In-band variation counts as a rise | Accepted. A step counts as a rise only when it crosses an Amount band: `(to − from) × 20 > from`, in integer arithmetic | Glossary (Band rise); R2.1, R2.3; R2.5 (GBP FX drift row, not `possessed`) |
| 4. Only the latest step is reported | Rule changed: `possessed` when the current price is a Band rise from the first Paid price. `PriceRise` now holds `firstSeen`, `currentAmountCents`, `latestRise` (latest band-crossing step, or `null`) and increases per charge and per year measured from `firstSeen`. Rows: 1000 → 1200 → 1400 possessed (latest step 1200 → 1400); 1000 → 1500 → 1200 possessed (+200 vs first); 1500 → 1000 → 1200 not possessed; FX drift not possessed; also 1000 → 1040 → 1080 possessed with `latestRise: null`. The page text is now `Price went up from $10.00 (2 Jan 2026) to $14.00 (+$48.00 a year)` | Introduction; R1.2 `PriceRise`; R2.1–R2.5; R4.2; R8.1 table; R9.3; R11.4, R11.5 |
| 5. `PRIMEVIDEO MEMBERSHIP` is Amazon Prime, not Prime Video | Accepted. The `prime-video` service is dropped; `contains("prime video membership")` and `contains("primevideo membership")` are added to `amazon-prime`; the service count stays 59; there are no R4.4/R4.11 exceptions; the UK row becomes `amazon-prime` / Amazon Prime. The list of expected changes is updated | Introduction; R10 title, preamble, R10.1–R10.4, R10.6 |
| 6. The snapshot has one entry, not three rows | Rewording accepted | R10.5 |
| 7. Answers are lost when a price change changes the id | Accepted. Added a note for graveyard-ui: keep answers for missing ids, offer to re-attach them by `merchantKey` + `currency` + `cadence`, and convert the `Map` to and from JSON for `localStorage` | R6.5 |
| 8. A `0.00` authorisation on the first charge date gives a trial trap | Accepted in the classifier: `freeTrialDate` counts only when it differs from `evidence.firstChargeDate` | R3.1, R3.2; R3.5 (FIT GYM row) |
| 9. `trial-trap` never expires | Cut-off added: `trial-trap` only while `evidence.regularChargeCount ≤ 3` | R3.1; R3.5 (4-charge row); R11.1, R11.4 |
| 10. A yearly Subscription cannot be labelled with 2 to 3 months of data | Accepted | Introduction, new detector-limits list |
| 11. R7.3 contradicts the date-equality checks | Accepted: "SHALL NOT parse or create dates, and compares date strings only for equality" | R7.3 |
| Follow-up: equal cut-off | The cut-off now counts only full-price charges, so it is the same for both intro kinds: `regularChargeCount` for an `evidence.introCharge` intro, `regularChargeCount - 1` for an Inferred intro charge; the label holds while that count is `≤ 3`. `750`, `1499`, `1499`, `1499` is labelled; a fourth `1499` is not | R3.1; R3.5 (750 → 1499 row now 3 full-price charges, new 4-charge Inferred intro row); R11.1, R11.4 |
