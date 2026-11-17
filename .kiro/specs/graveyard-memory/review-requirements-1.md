# Review of graveyard-memory requirements — spec-reviewer, 2026-11-17

I found 1 blocker, 6 major and 9 minor findings. The spec covers everything the graveyard-ui hand-off deferred, and it resolves hand-off findings 1, 2, 4, 5, 6, 13 and 17. The problems below are about multi-tab privacy, hostile data, two contradictions with existing tests, and scope.

I checked the spec against `graveyard.ts`, `haunt-view.ts`, `queue.ts`, `page-state.ts`, `slice-page.tsx`, `graveyard-view.tsx`, `announce.ts`, `savings-counter.tsx`, `test-arbitraries.ts`, `eslint.config.js`, `main.tsx` and `cancel-data.ts`.

### Blocker

**1. "Forget everything" does not wipe the Store when a second tab is open**
- **Where:** Out of scope ("last write wins"), R8.4, R8.5, R3.1.
- **Problem:** Tab B keeps Memory on in React state. Its next Graveyard change writes the whole old Graveyard back under the Store key. The R8.5 announcement "Nothing is kept on this device." is then false. Unticking in another tab (R1.4) fails the same way.
- **Failing example:**
  1. Open the site in tabs A and B with Memory on and Netflix buried.
  2. In A, choose Forget everything, then Forget.
  3. In B, choose Unbury Netflix. B calls `setItem` and the Store holds Netflix again.
- **Suggested fix:** Add a criterion: "WHEN a `storage` event arrives for the Store key with `newValue === null`, THE Page SHALL turn Memory off and untick the checkbox without writing, and SHALL keep its in-memory Graveyard." That is one listener in the Store module. Move "not listening to `storage`" out of the Out of scope list. Add one unit test that fires a synthetic `StorageEvent`.

### Major

**2. A valid but hostile Store can permanently break the Page**
- **Where:** R2.3, R4.6, R4.7; `savingsTotals` and `sumSavings` in `graveyard.ts` throw `RangeError`.
- **Problem:** Each record passes R2.3 because `currentAmountCents × factor` is safe. The per-currency sum across records is not checked. `deriveHaunt` then throws during render on every load, and "Forget everything" is inside the broken page.
- **Failing example:** `{"version":1,"records":[{"id":"sub:USD:yearly:*:a","merchant":"A","serviceId":null,"currentAmountCents":9007199254740991,"answer":"not-using","cadenceAssumed":false,"carriedOver":false},{…same with key b…}]}`
- **Suggested fix:** In R2.3, cap `currentAmountCents` at `999_999_9900` (the parser limit, detector R6.5). In R4.4, cap records at 1,000 and drop the rest, counting them in `dropped`. The sum then stays below `999_999_9900 × 52 × 1000 ≈ 5.2e14`. Add a decode PBT: "for every `ok` result, `savingsTotals(graveyard)` does not throw."

**3. R2.5 contradicts the round-trip and write-protocol PBTs**
- **Where:** R2.5, R11.1 round-trip, R3.8; `test-arbitraries.ts:341-343`; `cancel-data.ts:852`.
- **Problem:** Decode turns any `serviceId` that is not in `CANCEL_ENTRIES` into `null`. So `decode(encode(g))` is not deeply equal to `g` when a record has the email-only Known id `planet-fitness`, or the arbitraries' `"constructor"` or `"merchant:x"`. The rule also has no visible effect: `getCancelHelp` already returns `email-only` for any id without an entry (cancel-helper R2.4).
- **Failing example:** A Planet Fitness tombstone with `serviceId: "planet-fitness"` reloads as `serviceId: null`.
- **Suggested fix:** Drop R2.5. If you keep it, check against `KNOWN_SERVICES` ids (exported from `@zombills/core`, normalizer R4.1) instead of `CANCEL_ENTRIES`. Then R11.1 must generate only Known ids or `null`.

**4. The price-ratio rule can move an answer to a different service on a shared key**
- **Where:** Glossary "Qualifying candidate", R6.2, R6.9, user story of R6.
- **Problem:** The `max(p, q) ≤ 2 × min(p, q)` branch matches a different service on `APPLE.COM/BILL` (detector Introduction, known limitation). The user story promises the answer is never moved to a different service. Here the wrong service never rises and its cost counts as a saving. Asking again is the safer failure.
- **Failing example:** The Graveyard has Apple Music at `1099` answered "not-using" (`…:1099:k`) and iCloud+ at `99` (`…:99:k`). In the next statement Apple Music has stopped, and Apple TV+ is alone on the key as `sub:USD:monthly:*:k` at `999`, with `priceHistory` `[999]`. Apple Music's answer moves to Apple TV+, Apple TV+ does not rise, and $119.88 counts as saved.
- **Suggested fix:** Use only the history rule: `s.priceHistory` holds `o.currentAmountCents`. Apple Music going from `1099` to `1199` still re-attaches whenever the statement shows the old price. This also resolves more ties: with two Netflix plans at `1549` and `1799` and only `*:netflix` at `1799` left, the ratio rule makes both records candidates and nothing moves. If you keep the ratio rule, limit it to keys that do not start with `unidentified:` and add the failing example above to R6.9.

**5. The carried-over flag breaks graveyard-ui PBT 9.8, which R6.11 says still holds**
- **Where:** R6.6, R6.11, graveyard-ui R9.8 ("Unbury followed by Bury after all … SHALL restore a record deeply equal to the buried one").
- **Problem:** On a Current record that was carried over, Unbury then Bury after all gives a record with the carried-over flag false, which is not deeply equal to the original. R7.7 makes this exception for Earlier records only.
- **Suggested fix:** In R6.11, add "except that the carried-over flag becomes `false`". Add a note to graveyard-ui R9.8 saying this spec changed it. Also state that `refreshGraveyard` must copy the flag: today it rebuilds records with `answerRecordFor` (`graveyard.ts`), which would reset it.

**6. The existing arbitraries cannot build the Graveyards these PBTs need**
- **Where:** R11.1 round-trip and derived fields, R3.8, R6.10; `test-arbitraries.ts:339-347`.
- **Problem:** The current record arbitrary uses `id: fc.string({maxLength: 6})` and `currentAmountCents` from `min: 0`. Encode drops almost every such record (R2.2, R2.3), so the round trip either fails or only tests empty Graveyards. A filtered generator would hide the hard cases.
- **Suggested fix:** Add an R11.1 bullet requiring a new `pageRecordArb`:
  - the id is built as `sub:${currency}:${cadence}:${d}:${merchantKey}`;
  - `d` is `*`, the amount, or the amount plus `-r`;
  - `merchantKey` covers Known, `merchant:` and `unidentified:` keys containing `:` and spaces;
  - the amount is from 1 to `999_999_9900`;
  - `yearlySavingCents` is derived as in R2.4.

  Require a check that no generated record is dropped.

**7. The scope does not fit about one day of tasks**
- **Where:** Introduction "Scope budget" (14 to 18 tasks), R6, R3.8, R11.
- **Problem:** The spec has 8 PBTs, re-attach with multi-pass semantics, three new Earlier-record actions that work without a statement, a confirmation dialog, a lint override, amendments to 3 specs and a new Playwright path. Re-attach (R6) is the riskiest part and the least needed for the demo.
- **Suggested fix:** Set a cut line in the spec:
  - **Phase A:** codec, Store module, opt-in, load, failures, Forget, Earlier controls, lint.
  - **Phase B:** R6 re-attach and the R6.8 summary line, after Phase A is merged.

  Write R3.8 against a pure function `storageCommands(prevMemory, nextMemory) → Command[]` instead of driving whole Page action sequences. That keeps the write protocol testable without React.

### Minor

**8. An unknown future schema version gets deleted**
- **Where:** R4.3, R4.9.
- **Problem:** A newer Store (`version: 2`) is treated as unreadable and removed, so an older cached build would destroy a newer user's data.
- **Suggested fix:** WHEN `version` is a number greater than 1, start with Memory off, do not remove the key, and show "Your saved graveyard was made by a newer version of Zombills." Ticking the checkbox then overwrites it.

**9. Loading a readable Store triggers an unneeded write**
- **Where:** R3.1, R4.4, R4.5.
- **Problem:** "SHALL NOT write WHEN the encoded text equals the text it last wrote" has no "last written" text after a load, so the first effect writes on every reload. A Store with ignored extra fields re-encodes differently from what was read, and the spec does not say whether that is rewritten.
- **Suggested fix:** On an `ok` load, set the last written text to the raw Store text. Add: "WHEN `encode(graveyard)` differs from the loaded text, THE Page SHALL write once." This also removes extra fields from the stored copy.

**10. The record size limit is far above `localStorage` quota**
- **Where:** R2.3 (ids and merchant names up to 1,048,576 code units each), R5.2.
- **Problem:** A typical quota is about 5 MB. Two records whose unidentified ids are near that size can exceed it, and R5.2 then turns Memory off for the whole Graveyard instead of dropping one record. Long ids are also unidentified residues of raw bank text.
- **Suggested fix:** Have encode leave out records whose id or merchant name exceeds 4,096 code units, using the R3.5 note. Decode still accepts records up to 1 MiB. This keeps graveyard-ui hand-off finding 5 satisfied, because the Page says which answers it could not keep.

**11. The storage failure notes can stack misleadingly**
- **Where:** R5.2, R5.3, R5.7 row 2.
- **Problem:** When the `localStorage` getter throws, a tick fails `setItem`, and the follow-up `removeItem` also throws. That adds "would not clear the saved graveyard…" even though nothing was ever saved.
- **Suggested fix:** Show the R5.3 note only when the `removeItem` came from untick, an unreadable Store or Forget, not after a failed write.

**12. Two PBTs assume a Storage that does not throw**
- **Where:** R8.8, R3.8.
- **Problem:** R8.8 expects "the fake Storage SHALL have no Store key", which fails when `removeItem` throws (allowed by R5.3).
- **Suggested fix:** Say "with a fake Storage whose `removeItem` does not throw". For the throwing case, assert Memory is off and the R5.3 note is shown.

**13. Strict Mode makes the lazy initial read run twice**
- **Where:** R4.1, R11.3; `main.tsx` renders `<StrictMode>`.
- **Problem:** In dev, the lazy initializer of `useReducer` runs twice, so there are 2 `getItem` calls.
- **Suggested fix:** Read the Store once in `main.tsx`, through the Store module, and pass the Read result to `<App>` as a prop. Alternatively, limit "exactly once" to production and to the component tests, which render without Strict Mode.

**14. When Memory turns on by itself on load, the user is not told while answering**
- **Where:** R4.4, R1.7.
- **Problem:** A readable Store turns Memory on without a tick, which is a problem on a shared computer. The R1.7 line disappears after the first analysis, and the checkbox is only in the Graveyard view. So a second person's answers are saved with no sign on the Rising screen.
- **Suggested fix:** WHILE Memory is on, the Rising summary shows "Your answers are kept on this device." with a link or button to the Memory panel.

**15. The hint wording overstates what is left out**
- **Where:** R1.5.
- **Problem:** The id of an unidentified key keeps the bank line minus dates and card prefixes, so it can hold reference and phone numbers. A guessed subscription stores one charge's amount plus that text, which is close to "a transaction".
- **Suggested fix:** "Only merchant text as printed on your statement (it can include reference numbers), amounts and your answers are kept…"

**16. Smaller gaps**
- **R8.6 never applies.** `open-graveyard` resets the stage to `ask` (`page-state.ts`), so the Burial stage never runs while the Memory panel is visible. Drop it, or make it refer to the R7.4 tombstone rise.
- **R1.1 placement is unclear.** It does not say where the panel sits relative to Resting, Not answered yet and Already stopped. Suggest "directly before the back button".
- **R10.3 lint override.** It should state that the `slice/logic` block also gets the new property bans (`window.localStorage` and the others). Flat config replaces that block's options too, not only the web block's.
- **R8.4 stale summary line.** Forget should also clear the R6.8 carried-over line.
- **R7.3 and R7.4 need a reducer path for Earlier records.** They must work in the `idle`, `error` and `no-subscriptions` views. Today `currentRecordSubscription` requires `results` and a Subscription (`page-state.ts`). Add actions keyed on the record.
- **R1.6 changes the `idle` sentence.** R11 should list `slice-page.test.tsx` among the tests to update.
- **R2.3 regex.** Use the `s` flag or `[^]` instead of `.`, so the check does not depend on the normalizer collapsing line breaks. Low risk.

### Checklist items with no findings
- **EARS form:** the criteria are testable, and the copy rules in R1.8 list concrete forbidden claims.
- **Money:** all stored and derived values are integer cents; `yearlySavingCents` is derived, not stored.
- **Traceability:** cannot be checked. `.kiro/specs/graveyard-memory/` has no `design.md` or `tasks.md` yet.
- **Code batch:** does not apply. Nothing is implemented yet, so I did not run the tests.

Verdict: approve after fixes

## Resolution

All 16 findings accepted, applied to `requirements.md` on 2026-11-17.

| # | Decision | Change in `requirements.md` |
| --- | --- | --- |
| 1 | Accepted | New R3.9: a `storage` event for the Store key with `newValue === null` turns Memory off and unticks the checkbox, with no write and the in-memory Graveyard kept; the Store module owns the listener. Removed from Out of scope; Memory glossary updated; unit test with a synthetic `StorageEvent` in R11.2. |
| 2 | Accepted | R2.3 caps `currentAmountCents` at `999_999_9900`; R4.4 keeps at most 1,000 records and counts the rest in `dropped`; R11.1 decode PBT asserts `savingsTotals` never throws on an `ok` result; R2.6 and R11.2 examples added. |
| 3 | Accepted | R2.5 dropped (marked removed; `serviceId` kept as stored); R2.6 example and R11.2 reference updated. |
| 4 | Accepted | Qualifying candidate uses the history rule only; ratio rule removed. Apple TV+ example added to R6.9 as a must-not-move case; other R6.9 rows adjusted to the history rule. |
| 5 | Accepted | R6.11 gains the carried-over exception and requires a note in graveyard-ui R9.8 (also listed in R10.8); R6.6 requires `refreshGraveyard` to copy the flag. |
| 6 | Accepted | R11.1 bullet for a new `pageRecordArb`, a no-record-dropped check, and no use of the existing record arbitrary or filtering. |
| 7 | Accepted | Cut line in the Introduction (Phase A and Phase B); each requirement marked with its phase; R3.8 specified against a pure `storageCommands(prevMemory, nextMemory)`. |
| 8 | Accepted | New Read result `newer` and R4.10: key kept, Memory off, note "Your saved graveyard was made by a newer version of Zombills."; `version: 2` moved out of the R4.9 unreadable examples. |
| 9 | Accepted | R3.1: after an `ok` load the last-written text is the raw Store text; one write when `encode(graveyard)` differs. |
| 10 | Accepted | R2.2: encode leaves out records whose `id` or `merchant` exceeds 4,096 code units (R3.5 note); decode still accepts up to 1 MiB; round-trip PBT uses 4,096-unit records. |
| 11 | Accepted | R5.3 note shown only for removals from untick, an unreadable Store or Forget. |
| 12 | Accepted | R8.8 and R3.8 assume a non-throwing `removeItem`; throwing cases stated separately. |
| 13 | Accepted | R4.1: `main.tsx` reads the Store once through the Store module and passes the Read result to `<App>` as a prop; R11.3 first-visit test updated. |
| 14 | Accepted | New R1.10: Rising summary line "Your answers are kept on this device." with a "Memory settings" button to the Memory panel while Memory is on; covered in R11.3. |
| 15 | Accepted | R1.5 hint and the Introduction privacy note use the suggested wording. |
| 16 | Accepted | R8.6 retargeted to the R7.4 tombstone rise; R1.1 places the panel directly before the back button; R10.3 adds the bans to the `slice/logic` block; R8.4 clears the R6.8 line; new R7.9 reducer actions keyed on the record for `idle`, `error` and `no-subscriptions`; R11.3 lists `slice-page.test.tsx`; R2.3 regex uses the `s` flag. |
