# Review: graveyard-ui requirements (review 1)

Reviewer: Kiro custom agent `spec-reviewer` (Opus 5.5), 2026-11-15. Findings copied verbatim below; resolution table appended after fixes.

I reviewed `graveyard-ui/requirements.md` against the steering docs, the earlier specs, and the code in `apps/web/src/slice`, `apps/web/src/spike`, `apps/web/e2e/demo-path.spec.ts`, `packages/core/src/classify` and `samples/us-signed.csv`. Only `requirements.md` exists in the spec folder, so I skipped the traceability check against design and tasks. The code-batch check doesn't apply either, since nothing has been implemented yet.

## Findings

**1. Blocker: R11.3, R11.8. The "only Candidate" rule hands an answer to a different service.**
- **Problem:** When there is exactly one Candidate, the Orphan attaches to it without any price check. On a shared key like `APPLE.COM/BILL`, the detector changes the remaining service's id to `*` once the other one is gone (detector Introduction).
- **Failing example:** The Graveyard holds `sub:USD:monthly:99:k` (iCloud+, `"not-using"`). The next statement shows only Apple Music, as `sub:USD:monthly:*:k` at 1099. The single Candidate is Apple Music, so the iCloud+ answer moves to it. Apple Music gets `zombie` and a tombstone saving `13188`, but the user never answered for Apple Music.
- **Fix:** A Candidate qualifies only when its `priceHistory` contains the Orphan's `currentAmountCents`, or when `max(p, q) ≤ 2 × min(p, q)` (the detector's R3.6 join rule), with `p` the Orphan's amount and `q` the Candidate's. Apply "exactly one" to the qualifying Candidates. R11.8 rows 1 and 2 still pass, because 1099 → 1199 is within a factor of 2, while 99 → 1099 is not.

**2. Blocker: R11.9. The idempotence property is false.**
- **Problem:** A re-attach in one pass removes a subscription from the Free set. That can leave a single Candidate for another Orphan in a second pass.
- **Failing example:** Orphans A (99) and B (700), Triple `k`. Free subscriptions S1 (`priceHistory` [99]) and S2 (`priceHistory` [1199]).
  - Pass 1: A → S1. B has 2 Candidates and no price match, so it stays.
  - Pass 2: S2 is now the only Free Candidate, so B → S2.
- **Fix:** Define re-attach as passes repeated until no record changes. Each pass is simultaneous, so order independence still holds. Or compute Candidates once from the Free set before re-attach and state that a second run uses the same set. Finding 1's qualification rule also makes B reject S2.

**3. Major: R9.5 (last sentence) against R9.4, R2.9, R6.5 and R9.9. "Treated as unanswered" can't happen as written.**
- **Problem:** The record still has the subscription's id, so it is a Current record. That keeps it in the Answers map (zombie label), out of the Queue, and its guessed `yearlySavingCents` in the Savings totals. Counting a guessed cost breaks detector R9.8.
- **Failing example:** Netflix is buried from a 3-month statement (not guessed, `confirmedCadence: null`). Next, a 1-month statement shows Netflix as a single guessed charge with the same id. The card doesn't rise, and the guessed saving is counted.
- **Fix:** On refresh, remove such a record from the Graveyard (or reset it to unanswered), so the subscription joins the Queue and asks for the cadence again. Add this case to the R9.8 PBT.

**4. Major: R8.3 and R9.5 against detector R9.8. "Bury after all" on an Earlier Kept record can count a guessed cost.**
- **Problem:** An Answer record doesn't store whether its cadence was guessed. A Kept record of a guessed subscription keeps `confirmedCadence: null` (R9.5). Once it becomes an Earlier record, "Bury after all" keeps the stored `yearlySavingCents`, which is the guessed amount.
- **Failing example:** The user keeps a guessed Amazon Prime charge (`13900`, guessed monthly, saving `166800`). Later a statement without Prime is analysed. "Bury after all" on the Earlier record adds `$1,668.00` to the counter.
- **Fix:** Don't offer "Bury after all" on Earlier records; offer only removal. This also cuts scope. The alternative is to store a `cadenceAssumed` flag and ask for the cadence.

**5. Major: R10.7 against real Pipeline output. A store the Page wrote can fail its own validation and be wiped.**
- **Problem:** `id` is limited to 1,000 characters and `merchant` to 500. Neither the parser nor the normalizer bounds description length, and an unidentified key holds the whole residue. R10.9 then clears the whole store.
- **Failing example:** A 1,200-character memo line that recurs monthly gives an id longer than 1,000. The Page writes it while Remembering. After a reload it shows "Your saved graveyard could not be read, so it was cleared." and every tombstone is gone.
- **Fix:** Either refuse to store (and say so) any record that would fail R10.7, or bound the limits by the 1 MiB file limit. Also drop only the invalid records rather than the whole store. Add an over-long record to the R10.13 round-trip test.

**6. Major: R10.5, R10.7. Redundant stored fields are never checked against the id.**
- **Problem:** `merchantKey`, `currency` and `cadence` are all contained in `id` (R8.1). R10.7 doesn't require them to agree, and re-attach uses the stored Triple, not the id.
- **Failing example:** A stored record `{ id: "sub:USD:monthly:*:netflix", currency: "GBP", … }` passes validation. It re-attaches to a GBP subscription and its saving counts in the £ total.
- **Fix:** Require `id === "sub:" + currency + ":" + cadence + ":" + d + ":" + merchantKey`, with `d` matching `\*|\d+(-\d+)?`. Or stop storing the three fields and derive them from `id`.
- **Field necessity:** `yearlySavingCents` can be derived from `currentAmountCents` and the cadence. `carriedOver` only drives a note. Both can stay, but they aren't needed.

**7. Major: R5.3–R5.5 against R14.2. Focus falls to `<body>` during the burial.**
- **Problem:** Focus is on "No, bury it". The card unmounts when the mound starts closing (the Spike's `closing` phase), and the tombstone only mounts at `buried`. In between, focus is on a removed element, which R14.2 forbids. Screen readers lose their place.
- **Failing example:** A keyboard user presses Enter on "No, bury it". About 600 ms later `document.activeElement` is `body`. The next Tab starts from the top of the page.
- **Fix:** When the burial starts, move focus to a persistent stage container (`tabIndex={-1}`, `aria-label="Burying <merchant>"`). Then move it to the tombstone at `buried`. Also say where focus goes for the R5.6 cadence question: to the radio group when it opens, and back to "No, bury it" after "Back".

**8. Major: R1.6, R15.3 against vertical-slice R5.7, R8.3 and R10.5. The yearly Currency total disappears, but the live region still announces it.**
- **Problem:** The plain list is removed and nothing replaces "Yearly total (USD): $1,355.64". R14.3 keeps vertical-slice R8.3, which announces "Yearly total in USD: $1,355.64." for text that is no longer on the page. R15.3 says the totals logic is "kept", but nothing uses it.
- **Fix:** Show one line per currency in the Rising summary, for example "Still draining $1,355.64 a year" in `--blood`. This gives the theme real work: the draining total next to the saved total. Otherwise, amend vertical-slice R8.3 and R5.7 explicitly.

**9. Major: R3.2, R6.1, R7.2, R14.1. Apple bundles produce cards and controls with identical names.**
- **Problem:** Both Apple subscriptions have the display name "Apple payment (merchant not shown)". The two cards, the tombstones "Here lies Apple payment (merchant not shown)." and the two "Unbury …" buttons can't be told apart by name.
- **Failing example:** With iCloud+ and Apple Music both buried, a screen reader lists two "Unbury Apple payment (merchant not shown)" buttons.
- **Fix:** When two Risen subscriptions or records share a `merchant`, add the amount and cadence to the heading and the accessible names, for example "Unbury Apple payment (merchant not shown), $0.99 a month".

**10. Minor: R2.5–R2.7. Two buttons named "Visit the graveyard" are shown at once.**
- **Problem:** At the end of the Queue, "Next" reads "Visit the graveyard" while the always-present control has the same name. Playwright's `getByRole` strict mode fails, and screen-reader users hear a duplicate.
- **Fix:** Hide the persistent control while "Next" has that name, or name the persistent one "Open the graveyard".

**11. Minor: R7.4 against R2.9. "Answer now" reorders the Queue, but the Queue PBT doesn't model it.**
- **Problem:** R2.9 says only "Skip for now" changes the order.
- **Fix:** Add "Answer now" (move to front) to the R2.9 action set.

**12. Minor: R3.10, R3.2. The `--blood` yearly figure can fail the contrast test.**
- **Problem:** `--blood` on `--fog` is 4.3:1, per the comment in `spike/undead-card.tsx`. It passes AA only as large text.
- **Fix:** State the size in the spec: at least 24 px, or 18.66 px bold.

**13. Minor: R10.1 hint text against what is stored.**
- **Problem:** An unidentified `merchantKey` is the cleaned bank text of a line. It keeps processor reference numbers and phone numbers (merchant-normalizer R6.2), for example `unidentified:paypal:paypal *1234567890`. privacy.md allows this (opt-in, on the device only). But the hint "Your statement and its transactions are never saved" is slightly untrue. The R16.4 "no `NETFLIX.COM` text" check passes only because Netflix is a Known service.
- **Fix:** Change the hint to "Only merchant names, amounts and your answers are saved; transactions and dates are not." Add an e2e or component check with an unidentified key.

**14. Minor: R15.3 is missing two vertical-slice references.**
- **Problem:** Vertical-slice R9.5 ("including `#spike`") and R8.1 ("the spike link") also change, but R15.3 doesn't list them. R1.2 keeps vertical-slice R9 "unchanged", and R9 includes R9.5.
- **Fix:** Add both to R15.3 and exclude R9.5 in R1.2.

**15. Minor: R4.3 states a guessed cadence as fact.**
- **Problem:** "It goes on charging $139.00 a month." for a guessed subscription breaks the spooky-design rule that copy states only facts from the statement.
- **Fix:** When `cadenceAssumed` is true, write "It goes on charging $139.00 (how often is a guess)."

**16. Minor: R13.4 and R7.10 have untestable wording.**
- **Problem:** "Fog SHALL thin" gives no amount, and "stay usable" gives no outcome.
- **Fix:** Give fog opacity steps, for example "fog opacity × 0.85 per Tombstone, floor 0.3". Use "no horizontal scroll at 320 px, no overlapping tombstone boxes" for R7.10.

**17. Minor: R10.11. The lint rule misses property access.**
- **Problem:** `no-restricted-globals` catches `localStorage` but not `window.localStorage`.
- **Fix:** Also use `no-restricted-properties` for `window.localStorage`, `window.sessionStorage`, `window.indexedDB`, `window.caches` and `document.cookie`.

## Results for checks (c), (d), (f)

- **(c) Currencies and money:** R6.2–R6.7 keep a separate total per currency, never convert, use integer arithmetic and throw `RangeError` when a total is not a safe integer. The PBT bound (1,000 × 999_999_9900 × 52 ≈ 5.2e15) is a safe integer. The counter must round the tween value with `Math.round` before `formatMoney`, as `spike/savings-counter.tsx` already does. No finding.
- **(d) Reduced motion:** R13.2–R13.3 are consistent with spooky-design. Keyboard and screen-reader gaps are in findings 7, 9 and 10.
- **(f) E2E against the real US sample:** The expectations match.
  - Order is Adobe 65988, Riverside Gym 34800, Netflix 21588, Spotify 13188, all active.
  - Netflix's `priceHistory` is 1549 → 1799, which gives `+$30.00 a year`.
  - $215.88 + $131.88 = $347.76.
  - "$54.99" and "$659.88" are right, and "Seen since at least 2 Jan 2026" is right because `startedInStatement` is false.
  - The only gap: R16.4 drops the existing `$1,355.64` check without saying so (see finding 8).

## What to cut or defer to fit about 24 tasks

These cut the least from the demo and the Costume Contest judging:

1. **R10 and R12 (opt-in persistence, Forget):** product.md doesn't list persistence as must-have. Cutting it removes the storage module, the lint rule, the validator, two PBTs, the R10.9 and R10.10 notes and about 5 component tests, which is roughly 5 to 6 tasks. Findings 5, 6 and 13 go with it.
2. **R11 (re-attach):** It only matters across statements or after a reload. Without R10 it almost never runs in the demo. Defer it and keep Orphans as Earlier records. Findings 1 and 2 go with it.
3. **R8.3 "Bury after all"** (keep "Unbury"), and Earlier-record handling (R7.7, R8.2). Finding 4 goes with it.
4. **R5.6 cadence radio group:** Instead, guessed subscriptions rise, and their tombstone reads "Saving unknown: guessed from one charge", left out of the totals. This still meets detector R9.8. No sample has a guessed subscription, so the demo loses nothing.
5. **R7.4 "Answer now", R7.10's 30-tombstone check, R13.4's progressive fog** (keep the spike's single on/off `fogCleared`), and R6.4's count-down case.
6. **R9.6 extra line for ended tombstones and R7.5 "Already stopped":** None of the samples has an ended subscription.

Keep these, because judges see them: R1, R2 (without 2.8), R3, R4, R5.1–R5.5 and R5.7, R6, R7.1–R7.3 and R7.6, R13.1–R13.3 and R13.6, R14, and the e2e of R16.4 without its storage steps.

Verdict: approve after fixes

## Resolution

Scope was cut to fit the 4 Dec deadline (about 20 to 24 tasks). Persistence, re-attach, "Forget everything" and Earlier-record controls move to a future spec `graveyard-memory`; their requirement numbers stay as stubs, and `requirements.md` ends with "Hand-off to graveyard-memory", which carries findings 1, 2, 4, 5, 6, 13 and 17 with their fixes.

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1 | Deferred to graveyard-memory (re-attach cut) | R11 stub; Hand-off to graveyard-memory |
| 2 | Deferred to graveyard-memory (re-attach cut) | R11 stub; Hand-off to graveyard-memory |
| 3 | Fixed: on refresh, a record with `cadenceAssumed: false` whose subscription is now guessed is removed, so it is unanswered and joins the Queue; added to the answers PBT | R9.5, R9.8, R16.1; Glossary (`cadenceAssumed` field) |
| 4 | Deferred to graveyard-memory ("Bury after all" on Earlier records cut); for Current records a guessed burial now saves `null` | R8.2 stub, R8.3; Hand-off to graveyard-memory |
| 5 | Deferred to graveyard-memory (persistence cut) | R10 stub; Hand-off to graveyard-memory |
| 6 | Deferred to graveyard-memory (persistence cut); `merchantKey` dropped from the in-memory record | R10 stub; Glossary; Hand-off to graveyard-memory |
| 7 | Fixed: focus moves to a persistent stage container named "Burying <Display name>" when the burial starts, then to the tombstone. The cadence question it also mentioned is cut | R5.3, R5.5, R14.2, R16.2 |
| 8 | Fixed: Rising summary shows "Still draining <total> a year" per currency in `--blood` as large text; the vertical-slice live-region totals are the same figures | R1.6, R1.6a, R14.3, R15.3, R16.2, R16.4 |
| 9 | Fixed: new Glossary term Display name adds amount and cadence when two shown items share a `merchant`; used in headings, tombstones, lists and accessible names | Glossary, R3.2, R6.1, R7.2–R7.5, R14.1, R14.3, R16.1 |
| 10 | Fixed: the persistent control is "Open the graveyard"; no two visible controls may share a name | R2.6, R5.4, R14.1, R16.2 |
| 11 | Fixed: "Answer now" kept and added to the Queue PBT (moves to front) | Glossary (Queue), R2.9, R7.4 |
| 12 | Fixed: `--blood` text is at least 24 px, or at least 18.66 px bold, and tested at 3:1 | R1.6a, R3.2, R3.10 |
| 13 | Deferred to graveyard-memory (persistence cut) | R10 stub; Hand-off to graveyard-memory |
| 14 | Fixed: R1.2 excludes vertical-slice R9.5's "including `#spike`"; R15.3 adds notes for vertical-slice R8.1 and R9.5 | R1.2, R15.3 |
| 15 | Fixed: a guessed kept card says "It goes on charging <amount> (how often is a guess)." | R4.3, R16.2 |
| 16 | Fixed: R7.10's 30-tombstone check dropped (now "no horizontal scrolling at 320 px"); fog is the Spike's on/off `fogCleared` with opacity `1` or `0.45` | R7.10, R13.4 |
| 17 | Deferred to graveyard-memory (storage lint rule cut) | Hand-off to graveyard-memory |
| Follow-up: draining goes down when buried | Fixed: per currency, Still draining = Currency total − Counted savings (non-null `yearlySavingCents` of Current buried records of Counted subscriptions), integer minor units, clamped at `0`; it falls by exactly what the counter rises and returns on "Unbury"; new PBT draining + Counted savings = Currency total; US e2e now checks $1,139.76 after burying Netflix | R1.6a, R1.6b, R14.3, R15.3, R16.1, R16.2, R16.4; Introduction |

### Scope cuts

| Cut criterion | Outcome |
| --- | --- |
| R10.1–R10.14 opt-in persistence | Deferred to graveyard-memory (R10 stub) |
| R11.1–R11.9 re-attach | Deferred to graveyard-memory (R11 stub); unmatched answers stay Earlier records |
| R12.1–R12.6 "Forget everything" | Deferred to graveyard-memory (R12 stub) |
| R7.7 Earlier / carried-over notes | Deferred to graveyard-memory (stub) |
| R8.2 "Unbury" on Earlier records | Deferred to graveyard-memory (stub); Earlier records have no change control |
| R8.3 "Bury after all" on Earlier records | Deferred to graveyard-memory; kept for Current records |
| R10.11 storage lint rule | Deferred to graveyard-memory |
| R15.2 amendment of vertical-slice R7.3 | Dropped; vertical-slice R7.3 holds unchanged (nothing is stored) |
| R16.2 storage, invalid-store and Forget component tests; R16.1 storage PBTs | Dropped with R10 and R12 |
| R16.4 e2e Remember and Forget steps | Dropped; the `localStorage.length === 0` check stays |
| R5.6 cadence radio group | Dropped; a guessed burial shows "Saving unknown: guessed from one charge" and adds nothing to totals |
| Glossary `confirmedCadence`, `carriedOver`, `merchantKey`, Storage key, Remembering | Dropped; `cadenceAssumed` and nullable `yearlySavingCents` added |
| R13.4 progressive fog thinning | Dropped; single on/off `fogCleared` |
| R9.6 extra "No charge since" line on ended tombstones | Dropped; shown as a regular tombstone |
| R7.10 30-tombstone check | Dropped |
| R7.5 "Already stopped" | Kept as a plain list |
| R6.4 count-down case | Kept: "Unbury" on a Current record still lowers a total (jump, no tween), so it does not exist only for "Bury after all" |
