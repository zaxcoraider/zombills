# Review of graveyard-memory design.md (2026-11-17)

I found no blockers, 5 major findings and 13 minor findings. The design follows `requirements.md` and all 16 resolutions of review 1. These parts hold up under checking:

- **Store module.** `graveyard-store.ts` is the only file that touches storage.
- **Single read.** `main.tsx` reads the Store once, outside React, so Strict Mode cannot double the read.
- **Write rules.** Rule 0 of `storageCommands` (design.md:263) is needed. Without it, Strict Mode's second effect run after a failed load-time write would call `setItem` a second time.
- **Codec.** The 999_999_9900 amount cap and the 1,000-record cap keep `savingsTotals` safe. The id regex runs in linear time.
- **Re-attach.** The algorithm is correct and idempotent. Free subscriptions only shrink between passes, so the fixed point is stable, and refresh never removes a moved record.

Most problems are in the tests and the task plan, not in the runtime design. `tasks.md` does not exist yet, so I checked traceability against the "Task order" section. Nothing is implemented, so I did not run typecheck, lint or tests.

## Major

**1. P4 never writes a Current record, because the outcome generator does not make detector ids**
- **Where:** design.md:624 (P4); `test-arbitraries.ts:37` and `:307` (`id: fc.string({ maxLength: 6 })`).
- **Problem:** P4's new outcomes come from `answerableSubscriptionArb`, whose ids are strings like `"a"`. The Codec leaves every record built from them out, because the id does not match `STORED_ID_PATTERN`. So the check "Store equals the model minus left-out records" passes trivially for every answer and change. The restored records (real ids) also never collide with outcome ids, so the "load, then analyse, and the record becomes Current" path is never generated.
- **Failing example:** Bury `"a"` with Memory on. Encode leaves it out, the Store holds `{"version":1,"records":[]}`, and P4 passes. A bug that writes the old Graveyard on a change would go unnoticed.
- **Fix:** Add a `pageSubscriptionArb` that builds `id` from the same parts as `pageRecordArb`. It should use `merchantKey`, `currency`, `cadence` and `currentAmountCents` that agree with the id, and `yearlyCostCents = amount × factor`. Let P4's starting Graveyard reuse some of those ids so restored records can become Current. Add an assertion that at least one step writes a non-empty `records` array, checked with `fc.statistics` or an explicit count.

**2. The `storage-lint.test.ts` fixtures fail as written, because of `@typescript-eslint/no-unused-expressions`**
- **Where:** design.md:579, 582 and the fixture table; `typescript-eslint` 8.72.2 recommended sets `@typescript-eslint/no-unused-expressions: "error"`.
- **Problem:** Bare expression statements are errors. The expected counts will not match, and an implementer is likely to "fix" this by loosening the assertions.
- **Failing example:**
  - `window.localStorage.getItem("k"); localStorage.length;` in `STORE_MODULE` gives 1 error, where the table expects none.
  - `window.sessionStorage.length;` gives 2 errors, where the table expects one.
  - `globalThis.localStorage; sessionStorage; fetch("x");` gives 5 errors, where the table expects three.
- **Fix:** Write the fixtures as calls or assignments (`void localStorage.length;` or `const n = localStorage.length; export { n };`). Assert on messages filtered to `ruleId ∈ {no-restricted-globals, no-restricted-properties}`, and assert the exact count of those.

**3. The existing `guardHolds` in `page-state.property.test.ts` will fail at task 5, and the design does not list it**
- **Where:** `page-state.property.test.ts:124-135` (`unbury` and `bury-after-all` require `results !== null && current(id)`); design.md:676 lists only the key-list change.
- **Problem:** After task 5, `unbury` on an Earlier record on the Graveyard screen changes the model. The existing property then asserts `expect(model).toBe(before)` and fails whenever the generator reaches an Earlier record, for example after a second `finish` with a redrawn outcome.
- **Fix:** Add to "Existing tests that change": update `guardHolds` so `unbury` and `bury-after-all` hold when `screen === "graveyard"` and a record with that id and the opposite answer exists, in any view. Add it to task 5.

**4. Task 1 breaks `npm run typecheck`: `AnswerRecord` literals are missing from the plan**
- **Where:** design.md:723 (task 1). Cancel-helper Req 9.4 had the same problem for `serviceId`.
- **Problem:** `carriedOver` is a required `readonly` field. Hand-built records exist in files the design does not list, so task 1 cannot end with typecheck passing.
- **Failing example:** `yearlySavingCents:` literals exist in `cancel-text.test.ts`, `cancel-helper.test.tsx`, `share-panel.share.test.tsx` and `tombstone.test.tsx`, besides the three files listed.
- **Fix:** In task 1, list these files and add "plus any other file that a search for `yearlySavingCents:` finds building a record".

**5. The design does not say how `memory` and `dispatch` reach `MemoryPanel` and `RisingView`**
- **Where:** design.md:543 (`RisingViewProps` gains `memoryOn`), the Graveyard view UI section, `graveyard-view.tsx:19-27`, and `slice-page.tsx:243`.
- **Problem:** `GraveyardView` gets `haunt` and `dispatch`, not the model, so it cannot render `MemoryPanel` without a new prop. `graveyard-view.test.tsx:78` and `rising-view.test.tsx:43` render these components directly, so required new props break their helpers.
- **Fix:** Add `memory: MemoryModel` and `hasRecords` (or derive `hasRecords` from `haunt`) to `GraveyardViewProps`, and pass `model.memory` from `SlicePage`. Make `memoryOn` and `carriedOver` required and update both test helpers in task 8. Add those two files to "Existing tests that change".

## Minor

**6. `busy` stays false when the same tombstone rises a second time**
- **Where:** design.md:534.
- **Problem:** `risenId` is never reset, so `busy = enteringId !== null && risenId !== enteringId` is false during the second rise of a record. "Forget everything" is then active during that rise, against Req 8.6.
- **Failing example:** "Bury after all X" (it rises, `risenId = X`), then "Unbury X", then "Bury after all X" again.
- **Fix:** Key the rise state on `model.focus.seq` or `model.event`, for example store `risenSeq` and compare it to the seq of the `buried` event. Alternatively, reset `risenId` in an effect when `enteringId` changes. Add this case to `memory-panel.test.tsx` or `graveyard-view.test.tsx`.

**7. The default store reads `window` when the module loads**
- **Where:** design.md:302 (`events: window`), which contradicts "touches nothing until a method is called".
- **Problem:** Building the object literal reads `window`, so importing `graveyard-store.ts` in a `node`-environment test throws `ReferenceError`. `vite.config.ts` sets `environment: "node"` by default.
- **Fix:** Use `events: () => window`, or read `window` inside `onRemovedElsewhere`.

**8. A load-time rewrite can announce the left-out note, against Req 9.2**
- **Where:** design.md:394 (`store-written` sets `left-out` when `leftOut > memory.leftOut`) and design.md:357.
- **Problem:** The `"load"` write dispatches `store-written` with `turnedOn: false`. Requirement 9.2 says notes shown on load are not announced.
- **Failing example:** A Store with one record whose `merchant` is 5,000 code units. Decode accepts it (≤ 1 MiB), encode leaves it out, and the live region announces "1 answer could not be kept…" with no user action.
- **Fix:** Pass the command `reason` in `store-written`, and set no event when the reason is `"load"`.

**9. A failed removal can cancel or contradict the message that came before it**
- **Where:** the `store-remove-failed` row of the action table; Req 1.4, 4.3, 5.3 and 8.5.
- **Problem:**
  - After an untick or Forget, `store-remove-failed` replaces the `not-kept` or `forgotten` event in the same frame, so the user never hears that Memory went off or that the Graveyard was emptied.
  - On load, the unreadable note "…so it was cleared." shows next to "This browser would not clear the saved graveyard…", which contradicts it.
- **Fix:**
  - Announce one combined sentence (`MEMORY_NOT_KEPT` or `FORGOTTEN` with its last clause replaced by `REMOVE_FAILED_NOTE`), or keep the first event and append the note.
  - For the unreadable case, show only the remove-failed note, or reword Req 4.3 to "…so it was ignored." Note this in the requirements as an amendment.

**10. The lint rules miss common bypasses**
- **Where:** the ESLint section; Req 10.3; `eslint.config.js:56-58`.
- **Problem:** `no-restricted-properties` matches only `Identifier.property`. It misses `(window as Window).localStorage` (a `TSAsExpression`), `const w = window; w.localStorage`, `globalThis.window.localStorage`, `document.defaultView!.localStorage`, `window["local" + "Storage"]` and `cookieStore`. A TypeScript cast is a plausible accidental pattern.
- **Fix:** Keep the rules Req 10.3 asks for. Add a text scan to `static-checks.test.ts`: no non-test file under `apps/web/src` other than `STORE_MODULE` may contain the words `localStorage`, `sessionStorage`, `indexedDB`, `caches.`, `cookieStore` or `.cookie`. Exclude `memory-text.ts` copy if needed, or scan identifiers only.

**11. A small multi-tab race remains**
- **Where:** Req 3.9, the hook's `onRemovedElsewhere`.
- **Problem:** The browser delivers `storage` events asynchronously. A change in tab B that happens after A's `removeItem` but before B handles the event writes the forgotten Graveyard back. This is rare and inherent to the API.
- **Fix:** Add a line to the error-handling table saying so. It is acceptable for the hackathon. An optional fix is to call `getItem` before a `"change"` write and skip the write when the key is gone, but that conflicts with Req 3.3's single read, so documenting it is the cheaper choice.

**12. Several requirements have no planned test**
- **Where:** the Testing strategy section.
- **Problem and fix, per requirement:**
  - Req 9.5 (no horizontal scrolling at 320 px): add the Memory panel and the confirmation group to `e2e/layout.spec.ts`.
  - Req 4.1 (`main.tsx` reads once and no component reads): add a static check that `.load(` appears only in `main.tsx`.
  - Req 3.9 UI (the checkbox is unticked after a removal elsewhere, with no storage call): add it to `graveyard-memory-flow.test.tsx`. Req 11.2 asks for it, and the hook test covers only the dispatch.
  - Req 1.1 (the panel sits directly before the back button and shows when the Graveyard is empty): add it to `graveyard-view.test.tsx`.
  - Req 9.4 (focus stays on the checkbox after a failed write): add it to the flow test.
  - Req 11.2 says the Req 5.7 table is covered by unit tests, but the design covers it only in the flow test. Map each row to a named test.

**13. A required documentation amendment is missing from task 10**
- **Where:** task 10; Req 9.6 and 10.8.
- **Problem:** Req 9.6 changes the screen-state table of graveyard-ui R1.10, but neither the R10.8 list nor task 10 includes an R1.10 note.
- **Fix:** Add "graveyard-ui R1.10 table (Req 9.6)" to task 10's amendment notes.

**14. Tasks 5 and 8 are too big for one small Kiro run**
- **Where:** design.md:727 and 730.
- **Problem:** Task 5 changes the reducer (8 actions, `replaceView` and `finishedModel`, which build the model field by field and must now carry `memory`), `haunt-view`, `announce` and 4 test files, including the `guardHolds` work of finding 3. Task 8 covers the panel, the Earlier controls, the notes, the rise tracking, `tombstone.tsx`, the Rising line and 3 test files.
- **Fix:**
  - Split task 5 into 5a (`MemoryModel`, `initialPageModel`, the memory actions, `replaceView` and `finishedModel` carrying `memory`) and 5b (the Earlier `unbury` and `bury-after-all` path, `forget`, `earlierIds`, the announcements, `guardHolds`).
  - Split task 8 into 8a (`MemoryPanel` and its test) and 8b (Graveyard view wiring, Earlier controls and notes, `busy`, the Rising line).

**15. A test-only module is in the wrong folder, and a new root test is not typechecked**
- **Where:** design.md:115 and the `storage-lint.test.ts` row; `apps/web/tsconfig.json` `include`.
- **Problem:** `test-store.ts` sits in `slice/graveyard/`, but it fakes the storage layer, and the logic test P4 has to import it from there. `storage-lint.test.ts` at the `apps/web` root is not in the tsconfig `include` list, so `npm run typecheck` skips it, unlike its neighbours `csp-plugin.test.ts` and `netlify-config.test.ts`.
- **Fix:** Move the file to `slice/storage/test-store.ts`, and add `storage-lint.test.ts` to `include`.

**16. P7 requires tracking which pass moved a record**
- **Where:** design.md:627.
- **Problem:** "against the Free subscriptions of the pass it moved in" means the test has to reimplement the passes.
- **Fix:** Free subscriptions only shrink, so a candidate in any pass is also a candidate against the initial Free set. Check against the initial Free set, which is exactly what Req 6.10 asks.

**17. The default `App` store writes to jsdom's real `localStorage`**
- **Where:** design.md:487.
- **Problem:** A component test that ticks the checkbox through a plain `render(<App />)` writes to jsdom `localStorage`, and that state leaks into later tests in the same file.
- **Fix:** Say that every test that ticks must pass a fake store. Alternatively, have the shared test setup call `localStorage.clear()` in `afterEach`, or add a check that fails when `localStorage.length > 0` after each test.

**18. The 4,096-unit limit does not keep one big Graveyard under the storage quota**
- **Where:** the Codec section, Req 2.2 and review 1 #10.
- **Problem:** 1,000 records × (4,096 + 4,096 units) is about 8 M units, which is above Chrome's roughly 5 M-unit quota. The failed write then turns Memory off for the whole Graveyard, which is the outcome #10 wanted to avoid. Real ids are far shorter, so this is unlikely.
- **Fix:** Optionally add a total budget, for example stop keeping records once the text passes 1 M units and count the rest in `leftOut`. Otherwise note it as a known limit.

## Checklist items with no findings

- **EARS form and vague words:** this applies to requirements, not the design, and the design copies the exact strings.
- **Money:** all amounts stay integer cents; `yearlySavingCents` is derived by `yearlySavingFor`, and the caps make the sums safe.
- **Real-world CSV data:** the design does not handle CSV data.
- **Privacy:** there are no requests, cookies, `sessionStorage` or logs. Every `catch` is bare, the CSP is unchanged, and only the Store key is touched.
- **Strict Mode and opt-in:** I traced mount, a failed write, untick, Forget, a removal elsewhere and `clear()`. With Memory off no write is possible, and Forget turns Memory off in the same reducer step, so its effect issues only the `remove`.
- **Re-attach:** I checked it against every row of the Req 6.9 table; idempotence and termination hold.

Verdict: approve after fixes

## Resolution

All 18 findings accepted with the suggested fix and applied to `design.md`. Finding 9 also amends `requirements.md` Req 4.3.

| # | Decision | Change in design.md |
| --- | --- | --- |
| 1 | Accepted | New `pageSubscriptionArb` and `pageOutcomeArb` with detector-shaped ids; P4's starting Graveyard shares ids with the outcomes; P4 asserts that some step writes a non-empty `records` array |
| 2 | Accepted | Fixtures written as calls, assignments or `void` expressions; assertions keep only `no-restricted-globals` and `no-restricted-properties` messages and check exact counts |
| 3 | Accepted | `guardHolds` update listed in "Existing tests that change" and in task 5b |
| 4 | Accepted | Task 1 lists `cancel-text.test.ts`, `graveyard.property.test.ts`, `cancel-helper.test.tsx`, `share-panel.share.test.tsx`, `tombstone.test.tsx` and any other file found by a search for `yearlySavingCents:` |
| 5 | Accepted | `GraveyardViewProps` gains required `memory` and `enteringSeq`; `hasRecords` is derived from `haunt`; `memoryOn` is required on `RisingViewProps`; both test helpers listed |
| 6 | Accepted | `busy` keyed on `risenSeq` against `enteringSeq` (the focus seq of the rise); second-rise case added to `graveyard-view.test.tsx` |
| 7 | Accepted | `StoreTarget.events` is a function; `window` is read inside `onRemovedElsewhere` |
| 8 | Accepted | `store-written` carries the command `reason`; no event for `"load"` |
| 9 | Accepted: one combined sentence; Req 4.3 reworded | `store-remove-failed` sets the `not-kept` or `forgotten` event with `removeFailed: true`, announced as that sentence with its last clause (`It is kept until you close this page.` or `Nothing is kept on this device.`) replaced by `REMOVE_FAILED_NOTE`, not followed by it, so the two never contradict (exact strings: `MEMORY_NOT_KEPT_REMOVE_FAILED` and `FORGOTTEN_REMOVE_FAILED` in design.md's copy table); the `remove-failed` event kind is gone. `UNREADABLE_NOTE` reads "…so it was ignored." (requirements.md Req 4.3, amended by design review 1 #9) |
| 10 | Accepted: static text scan | `static-checks.test.ts` scans non-test files under `apps/web/src`, except `STORE_MODULE` and the test helpers, for storage and cookie words |
| 11 | Accepted: documented only | New error-handling row for the multi-tab race |
| 12 | Accepted | Tests added: `e2e/layout.spec.ts` at 320 px (9.5), single-`load` static check (4.1), checkbox unticked after removal elsewhere (3.9) and focus kept after a failed write (9.4) in the flow test, panel placement with an empty Graveyard (1.1), named tests for each Req 5.7 row (11.2) |
| 13 | Accepted | Task 10 and the Phase table include the graveyard-ui R1.10 table note |
| 14 | Accepted | Task 5 split into 5a (memory model) and 5b (Earlier changes, Forget, announcements, `guardHolds`); task 8 split into 8a (Memory panel) and 8b (Graveyard view wiring) |
| 15 | Accepted | `test-store.ts` moved to `slice/storage/`; `storage-lint.test.ts` (and `vitest.setup.ts`) added to the tsconfig `include` |
| 16 | Accepted | P7 checks candidates against the initial Free subscriptions |
| 17 | Accepted: both | Ticking tests pass a fake store; new `vitest.setup.ts` (registered in `setupFiles`) clears jsdom `localStorage` after each test |
| 18 | Accepted: known limit only | New error-handling row; no total budget |
