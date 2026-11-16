# Review of cancel-helper/design.md

I found no blockers. The core algorithms are correct: surrogate repair, `Cf` cleaning, the 80-code-point cut, mailto encoding, date math, host matching and the `Map` lookup. The module-scoped `declare const URL` typechecks under both `tsconfig.json` (`types: []`) and `tsconfig.test.json`, and ESLint won't complain about it, because typescript-eslint's recommended config turns off `no-redeclare` for TS files. Five majors would make a task fail or push someone to weaken a test.

## Major

**1. Validator test table contradicts the validator's own rules**
- **Section:** Testing strategy, `validate.test.ts` row, against "Rules per record" and Design review decision 5.
- **Problem:** The test table expects `field-type` for "a missing `steps`" and "a non-string `url`". The rules table and decision 5 report those as `steps-count` and `url-form`.
- **Failing example:** `validateCancelDatabase([{ ...valid, steps: undefined }], …)` returns `rule: "steps-count"`. A test written from the table asserts `"field-type"` and fails, so the task runner either edits the validator or loosens the test.
- **Fix:** In the test row, move "missing `steps`" under `steps-count` and "non-string `url`" under `url-form`. Keep `field-type` for the fields Req 6.9 lists and for a `null` entry.

**2. Web tests and core properties depend on data that later batches write, with no task order fixed**
- **Section:** Data file layout ("Batches"), Testing strategy (P6, P7, `cancel-helper.test.tsx`, `graveyard-flow.test.tsx`).
- **Problem:** `netflix` arrives only in batch 4. Several tests need it or need a non-empty `CANCEL_ENTRIES`:
  - the Netflix link panel, store links and steps in `cancel-helper.test.tsx`;
  - the Req 7.10 flow test in `graveyard-flow.test.tsx`;
  - the e2e Netflix check;
  - P7's `fc.constantFrom(...CANCEL_ENTRIES)`, which throws when the array is empty.
- **Failing example:** The UI task runs after batch 1. `getCancelHelp("netflix","USD")` returns `email-only`, so the "Netflix link panel" test fails. Or the lookup property task runs before batch 1, and `fc.constantFrom()` throws "expects at least one value".
- **Fix:** State the order: the lookup and property task comes after batch 1, and every task that tests the Netflix panel comes after batch 4. Alternatively, build the panel component tests on a `vi.mock("@zombills/core")` entry, as the design already does for the `lastChecked` case, and keep real Netflix data only in the flow and e2e tests, ordered after batch 4.

**3. Unit tests pin facts about the data that a person may later change**
- **Section:** `lookup.test.ts` ("the `amazon-prime` UK row uses its UK URL"); `cancel-helper.test.tsx` ("store note and both store links when `appStoreMayApply`" on Netflix); the line "batch 1 contains `amazon-prime` with regional URLs" under P6/P7.
- **Problem:** The data agent, or the human step of Req 6.12, may correctly decide `amazon-prime` needs `regionalUrls: {}`, or that Netflix has `appStoreMayApply: false`. These tests then fail, and the cheapest fix is deleting a case.
- **Failing example:** The human step finds one global Amazon page and removes the `UK` URL. `lookup.test.ts` fails.
- **Fix:** Add an internal `lookupIn(entries)` (or `createLookup`) that `getCancelHelp` wraps. Test region choice and the store note on fixtures, and keep the real-data tests to properties (P6, P7) that hold whatever the data says.

**4. The `answers` property check on `serviceId` can never fail**
- **Section:** Amendment to graveyard-ui, "Property and unit tests of Answer records".
- **Problem:** The design says the web subscription arbitraries "already produce both `null` and string `serviceId` values". In fact `test-arbitraries.ts:53` hard-codes `serviceId: null`. The added P4 check "record `serviceId` equals subscription's" therefore only ever compares `null` with `null`. The "add a `null` branch if missing" instruction is also backwards: the string branch is the one missing.
- **Failing example:** `answerRecordFor` returns `serviceId: null` unconditionally, and P4 still passes.
- **Fix:** Give the subscription arbitrary `serviceId: fc.option(fc.constantFrom("netflix","spotify","amazon-prime"), {nil:null})`, tied to `source: "known"`. Correct the sentence in the design.

**5. A Copy announcement can be followed by a stale haunt sentence being re-announced**
- **Section:** Copy flow, the `SlicePage` live region.
- **Problem:** `useEffect(() => setNotice(null), [model])` hands the region back to `announcement(model)` on any model change. `announcement` returns `eventSentence(event…)` while `model.event` is still set (`announce.ts:93`). A model change that leaves `event` in place therefore switches the text from the Copy notice back to the old burial sentence. Screen readers announce that change again.
- **Failing example:** Bury Netflix, press Copy (the region reads "Email for Netflix copied."), then dispatch any action that keeps `event` "buried", such as a focus request. The region reverts to "Netflix is buried. Saves $215.88 a year…" and is read out a second time.
- **Fix:** Clear `notice` only when `announcement(model)` changes. Track the previous string in a ref and compare in the effect. Alternatively, put the notice in `PageModel` so the reducer decides.

## Minor

**6. `Map` keeps the last duplicate, not the first**
- **Section:** Lookup (`lookup.ts`).
- **Problem:** The design says `ENTRY_BY_ID` "keeps the first entry for a duplicated id". `new Map(pairs)` overwrites, so it keeps the last one.
- **Failing example:** Entries `[{serviceId:"x",url:A},{serviceId:"x",url:B}]` give `get("x").url === B`.
- **Fix:** Correct the sentence. The `duplicate-id` rule stops this from shipping anyway.

**7. `getCancelHelp` pseudo-code does not typecheck**
- **Section:** Lookup.
- **Problem:** `Object.hasOwn(entry.regionalUrls, region) ? entry.regionalUrls[region] : entry.url` has type `string | undefined`, because `hasOwn` does not narrow a `Partial` record. Assigning it to `url: string` fails under `strict`.
- **Failing example:** `npm run typecheck` reports TS2322 on the `url` field.
- **Fix:** `const url = (region !== null ? entry.regionalUrls[region] : undefined) ?? entry.url;`. With `exactOptionalPropertyTypes` a present key is never `undefined`, so this matches Req 2.3 and P7.

**8. Sort ranks are missing for some field names the validator emits**
- **Section:** Validator, "Output order".
- **Problem:** The field rank list has no rank for `entries`, `emailOnly`, `appStoreLinks`, `apple` or `google`, which the whole-list and App-store issues use. The comparator returns `NaN`, which sorts as 0. P8 says it re-sorts "with the documented key", so its author has to invent ranks.
- **Failing example:** `validateCancelDatabase(E, O, K, {} as any)` gives `apple` and `google` issues in an order the design does not define.
- **Fix:** Add these names to the field ranks, for example before `entry` at rank −1. State that the `apple` and `google` issues sit at index 0 and 1 with field `entry`, or else name the field they use.

**9. "Whitespace" is not defined for the P1 reference cleaner**
- **Section:** Cleaning; `test-reference.ts`.
- **Problem:** `cleanField` uses JS `\s` plus `\p{Cc}` and `\p{Cf}`. The reference cleaner is described as "a per-code-point test written out from the Req 3.2 ranges", but Req 3.2's `Cf` list starts with "includes", so it is not complete. A reference that hard-codes only the listed ranges disagrees with `\p{Cf}` on characters such as U+0600 or U+E0001, and on Zs characters such as U+1680 if whitespace is left vague. `fc.string({unit:"binary"})` generates these.
- **Failing example:** `serviceName: "a\u0600b"`. The implementation returns `"a b"`; a list-based reference returns `"a\u0600b"`, so P1 fails.
- **Fix:** Define whitespace as `\s` (White_Space plus U+FEFF), and make the reference test each code point with `/\p{Cf}/u`, `/\p{Cc}/u`, `/\p{Zs}/u` plus the listed line separators. Independence comes from the per-code-point loop, not from avoiding the property escapes.

**10. The live-region and timer tests in `cancel-helper.test.tsx` have no harness**
- **Section:** Component tests, `cancel-helper.test.tsx`.
- **Problem:** On its own, `CancelHelper` uses the default `AnnounceContext`, whose `announce` does nothing, so "a second Copy clears the live region, then rewrites it" has no region to read. Vitest 5's fake timers also fake `requestAnimationFrame`, so `nextFrame` never resolves unless the test advances timers. `userEvent` hangs under fake timers without `advanceTimers`.
- **Fix:** Run the live-region cases in `graveyard-flow.test.tsx` through `SlicePage`, or give the test a provider that renders a `role="status"` node. For the 2-second case, use `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` and `vi.advanceTimersByTimeAsync`.

**11. The region name departs from Req 7.4 without a requirements amendment**
- **Section:** Design review decision 3, and decision 1 (Req 5.4).
- **Problem:** The heading's accessible name becomes `Seal the grave: <d>`. Tests written from Req 7.4/10.2, such as `getByRole("region", { name: "Seal the grave" })`, fail. Decision 1 also changes Req 5.4's wording. Both are proposals that `requirements.md` does not yet reflect, and tasks are built from requirements.
- **Fix:** Amend Req 5.4 and Req 7.4 before writing `tasks.md`, or drop the hidden span.

**12. Cancel URLs are scanned too, not only steps and reasons**
- **Section:** Data file layout, Privacy and environment.
- **Problem:** `findForbiddenReferences` reads every string literal in `cancel-data.ts`, URLs included. A real help URL whose path contains `document` or `window` as a whole word fails `no-network.test.ts`.
- **Failing example:** A path such as `…/help/document/cancel` fails the scan.
- **Fix:** Extend the data rule to URL strings. If a real URL needs one of these words, the human step has to choose another page, or the scan gets a documented exception for `cancel-data.ts` URLs.

**13. Two signatures disagree between sections (nit)**
- **Section:** Module layout, web table, against Copy flow.
- **Problem:** The table gives `useCopyEmail(text, displayName)`. The Copy flow section gives `useCopyEmail(text, displayName, emailRef)`. Separately, P9 checks `isOnDomain` against the same expression it is implemented with, so it can only fail through a typo.
- **Fix:** Use one signature in both places. For P9, also assert fixed cases inside the property: `isOnDomain("notnetflix.com","netflix.com") === false` and `isOnDomain("a.b.netflix.com","netflix.com") === true`.

## Checked and correct

- **Coverage:** every criterion of Req 1–11 maps to a design section or test.
- **Existing code:** `byId`, the `Tombstone` and `BurialStage` props, `nextFrame`, `useFocusRequest`, `expectUniqueButtonNames`, the panel's place before `Next` in `rising-view.tsx`, and the lint rules (`navigator.clipboard` and `getSelection` are allowed; `Date.UTC` and `Intl` are allowed in `logic/`) all match the code.
- **Data batches:** the five batches add up to 59 ids and are in sorted order.

Verdict: approve after fixes

## Resolution

All 13 findings were accepted with the reviewer's suggested fix. Where the reviewer offered two options, the decision column names the one taken.

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1 | Missing `steps` moved to `steps-count` and non-string `url` to `url-form`. `field-type` keeps the Req 6.9 fields, a `null` entry, a non-object `appStoreLinks` and a missing `google` link. | design.md: Testing strategy, `validate.test.ts` row |
| 2 | `cancel-helper.test.tsx` mocks `@zombills/core` (`vi.importActual` plus a fixture `getCancelHelp`). Only `graveyard-flow.test.tsx` and the e2e tests use real Netflix data. New "Task order": the lookup and property task after batch 1 (non-empty `CANCEL_ENTRIES`); every task that tests real Netflix after batch 4, which contains `netflix`. | design.md: Data file layout ("Task order", new), Correctness properties (note under P9), Component tests (`cancel-helper.test.tsx`, `graveyard-flow.test.tsx`) |
| 3 | Internal `lookupIn(entries)` builds the `Map`; `getCancelHelp = lookupIn(CANCEL_ENTRIES)`. Region choice, `host`, the store flag and the Req 2.7 `"netflix"` rows are tested on fixtures. Real-data tests are properties only (P6, P7), which assume no particular entry. The data rule no longer says `amazon-prime` will have regional URLs. | design.md: Design decisions ("Lookup table"), Module layout (`lookup.ts`), Function signatures, Data file layout rules, Lookup, Privacy and environment, Correctness properties note, `lookup.test.ts` row, Performance |
| 4 | `subscriptionArb` gains `serviceId: fc.option(fc.constantFrom("netflix","spotify","amazon-prime"), {nil:null})`, used only when `source` is `"known"`. The wrong sentence about the existing arbitraries is replaced. | design.md: Amendment to graveyard-ui (hand-built records table, "Property and unit tests of Answer records") |
| 5 | `notice` is cleared only when the string `announcement(model)` changes, tracked in a ref. A flow test checks that an unchanged sentence leaves the Copy notice in place. | design.md: Design decisions ("Copy announcement"), Copy flow (`SlicePage` pseudo-code and text), `graveyard-flow.test.tsx` row, Design review decision 7 |
| 6 | Corrected: `new Map(pairs)` keeps the last duplicate. | design.md: Lookup |
| 7 | `url = (region !== null ? entry.regionalUrls[region] : undefined) ?? entry.url`, with the reason it typechecks and matches Req 2.3. | design.md: Lookup |
| 8 | Field rank −1 for `entries`, `emailOnly`, `appStoreLinks`, `apple`, `google`. App-store issues: `appStoreLinks` at index −1, `apple` at index 0 and `google` at index 1 with those field names; a link's own fields use its index. | design.md: Validator ("Rules per record" text, "Output order") |
| 9 | Whitespace means JS `\s` (White_Space plus U+FEFF); `\p{Cf}` is the whole category. The reference cleaner tests each code point with `/\p{Cf}/u`, `/\p{Cc}/u`, `/\p{Zs}/u` plus the listed separators. | design.md: Cleaning, `test-reference.ts` paragraph |
| 10 | Live-region cases moved to `graveyard-flow.test.tsx` through `SlicePage`. `cancel-helper.test.tsx` uses a recording `AnnounceContext.Provider`, and its 2-second case uses `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` and `vi.advanceTimersByTimeAsync`. | design.md: Component tests |
| 11 | requirements.md amended: Req 5.4 names the module-scoped `declare const URL` in `url-parts.ts`; Req 7.4 gives the heading a visually hidden `: <Display name>`, so the region name is `Seal the grave: <Display name>`. Recorded in `review-requirements-1.md` Resolution as amended by design review 1 #11. | requirements.md R5.4, R7.4; review-requirements-1.md Resolution; design.md: Design decisions ("Region names"), Design review decisions 1, 3 and 10 |
| 12 | The data rule covers URL strings and every other string literal in `cancel-data.ts`. A real URL that needs a scanned word is replaced by another official page. No scan exception. | design.md: Data file layout rules, Privacy and environment |
| 13 | One signature, `useCopyEmail(text, displayName, emailRef)`, in both places. P9 also asserts fixed cases and `"not" + d` / `"help." + d` for every generated domain. | design.md: Module layout (web table), P9 |
| Browser fix after task 20 | Browser fix after task 20: region name had a space in Chromium; heading now uses aria-label | requirements.md R7.4; design.md: Design decisions ("Region names"), Helper panel, Design review decisions 3; `cancel-helper.tsx` |
