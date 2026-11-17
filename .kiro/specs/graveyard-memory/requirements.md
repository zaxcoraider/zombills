# Requirements Document

## Introduction

The `graveyard-memory` feature lets a user keep their graveyard on their own device between visits. Today the Graveyard (graveyard-ui Requirement 9) lives in memory only: a reload starts empty, and an answer whose subscription id changed between statements stays behind as an Earlier record while the subscription rises again.

This spec takes over everything the graveyard-ui spec deferred ("Hand-off to graveyard-memory" in `.kiro/specs/graveyard-ui/requirements.md`):

- **Opt-in persistence** (graveyard-ui Requirement 10). Off by default. A checkbox "Remember my graveyard on this device" turns it on. While it is on, the Page keeps the Answer records, and nothing else, in `localStorage` under one key with a versioned schema. Unreadable or tampered data is ignored safely, and a storage failure (quota, private mode, storage disabled) never breaks the Page.
- **Re-attaching answers when ids change** (graveyard-ui Requirement 11). An answer whose id is missing from a new statement moves to the one matching subscription with the same `merchantKey`, `currency` and `cadence` whose price history holds the answered price, as subscription-classifier Requirement 6.5 asks.
- **"Forget everything"** (graveyard-ui Requirement 12). One control that removes the stored graveyard and empties the in-memory one.
- **Earlier records** (graveyard-ui Requirements 7.7, 8.2, 8.3). The note "From an earlier statement", and "Unbury" and "Bury after all" on Earlier records.
- **The storage lint rule.** All storage access in one module, enforced by ESLint.

User decision (2026-11-17): full scope, opt-in. The user decides; the Page never turns persistence on by itself.

### Privacy

`privacy.md` allows `localStorage` for the graveyard, opt-in and on the user's own device only. This spec keeps every other rule:

- No network request, no cookie, no `sessionStorage`, IndexedDB or Cache API, nothing in the URL.
- No new dependency. The build-time CSP (`apps/web/csp-plugin.ts`) and the Netlify headers stay unchanged; `localStorage` is not governed by CSP.
- What is stored is the minimum needed to rebuild the graveyard: per answer the subscription id, the merchant name, the Known service id, the current amount, the answer and two flags. No statement text, row, transaction, description, date, price history, evidence, statement summary or file name is stored. No time stamp is stored.
- The app's privacy wording changes to say exactly this (Requirement 1.5, 1.6).

Two parts of a stored record are cleaned bank text, not service names: the `merchant` of a generic or unidentified merchant (for example "Blue Bottle Coffee Oakland", or a name printed for a person-to-person payment), and the `merchantKey` inside the `id`. The wording therefore says "merchant text as printed on your statement (it can include reference numbers)" (graveyard-ui review 1, finding 13; spec review 1, finding 15).

### Decision: what a stored record holds

A stored record holds `id` and derives `currency`, `cadence` and `merchantKey` from it, instead of storing them next to it. The detector id is `sub:<currency>:<cadence>:<d>:<merchantKey>` (subscription-detector Requirement 8, `packages/core/src/detect/ids.ts`), and currency and cadence never contain `:`. Storing the three fields separately would let a tampered record count in a currency its id does not name (graveyard-ui review 1, finding 6). `yearlySavingCents` is also derived (`currentAmountCents` × Cadence factor, or `null` when `cadenceAssumed`), so a stored total cannot disagree with its amount.

### Decision: "Unbury" on an Earlier record keeps the record

The hand-off summary says "Unbury removes an Earlier record". This spec instead makes "Unbury" on an Earlier record do what it does on a Current record: the answer becomes `"still-using"` and the record moves to the Resting list, where "Bury after all" can undo it (Requirement 7). Reasons:

- The same button does the same thing everywhere. A removed Earlier record would vanish from the view with no statement to rise from, which looks like data loss.
- The record keeps `cadenceAssumed`, so "Bury after all" on an Earlier guessed record gives `yearlySavingCents: null` and never counts a guessed cost (graveyard-ui review 1, finding 4).
- Removing answers is covered by "Forget everything".

### Scope budget

The deadline is 4 Dec. This spec is sized for about 14 to 18 tasks: the pure store codec and validator with its PBTs, the storage module and its failure handling, the opt-in control and wording, the load path, re-attach with its PBT, Earlier-record controls and notes, "Forget everything", the lint rule, the amendments to earlier specs, and the tests.

The work is split at a cut line (spec review 1, finding 7). Each requirement says which phase it belongs to.

- **Phase A:** the Codec, the Store module, the opt-in control, the load path, storage failures, "Forget everything", the Earlier-record controls and the lint rule.
- **Phase B:** re-attach (Requirement 6), including the carried-over note (Requirement 7.2) and the Rising summary line of Requirement 6.8. Phase B starts after Phase A is merged and can be dropped without changing Phase A.

### Out of scope

- Syncing between devices or browsers, accounts, export or import of the graveyard. Between tabs, the Page reacts only to the Store key being removed (Requirement 3.9); otherwise, with two tabs open and Memory on, the last write wins.
- Storing the Analysis outcome, the statement, the Rising order, the current screen, the Share image or the cancel-helper panel state.
- Service names on the share image. They stay deferred (share-card Introduction, "Deferred"; share-card review 1, findings 8 and 9): generic merchant text can hold places or people's names, and this spec does not change what the image shows. A restored Tombstone counts in the share card's Buried count and Savings totals exactly like any other Tombstone.
- Asking the user to confirm a re-attach. A re-attach happens only when the match is unambiguous (Requirement 6), and the record says it was carried over.
- Merging statements. Each analysis still replaces the previous one (graveyard-ui Out of scope).
- Expiring old records. Records stay until the user changes or forgets them.

### Notes taken over from earlier specs

- Ids are not always stable (subscription-detector Introduction and Requirement 8; subscription-classifier Requirement 6.5). On a key shared by several subscriptions of one cadence, such as `APPLE.COM/BILL`, the id holds `currentAmountCents`, so a price change gives a new id; and when only one subscription is left on the key, its discriminator becomes `*`.
- The classifier ignores answers whose id is not in its input (subscription-classifier Requirement 6.5). `answers` is a `Map`, which `JSON.stringify` does not serialise; the store uses its own array format (Requirement 2) and the Answers map is still built from Current records only (graveyard-ui Requirement 9.4).
- The refresh rule of graveyard-ui Requirement 9.5 still applies, including after a re-attach: a record answered while not guessed goes back to unanswered when its subscription is now guessed.
- The Display name rule (graveyard-ui Glossary) applies to restored, Earlier and re-attached records like any other.
- The Answer record (graveyard-ui Glossary, `apps/web/src/slice/logic/graveyard.ts`) already holds `serviceId` (cancel-helper Requirement 9) and `cadenceAssumed`.
- The Page already shows "Open the graveyard" on the `idle`, `error` and `no-subscriptions` states when the Graveyard has a record (`apps/web/src/slice/slice-page.tsx`), and the Graveyard view already has "Back to the start" when no statement has been analysed. A restored Graveyard uses both.

---
## Glossary

- **Page**, **Answer record**, **Graveyard**, **Tombstone**, **Kept record**, **Current record**, **Earlier record**, **Answers map**, **Savings totals**, **Queue**, **Risen subscription**, **Display name**, **Burial sequence**, **Graveyard view**, **Rising**, **Cadence factor**, **Live region**: As defined in the graveyard-ui spec Glossary (and share-card Glossary for Live region).
- **Answer record** (amended): gains one field, `carriedOver: boolean`, `true` when the record was moved to its current id by a Re-attach (Requirement 6) and its answer has not been changed since. Every record made by graveyard-ui Requirements 4, 5 and 8 has `carriedOver: false`.
- **Triple**: The `currency`, `cadence` and `merchantKey` of a subscription, or of a record as derived from its `id` (Requirement 2.4).
- **Memory**: The setting "Remember my graveyard on this device". It is **on** from the moment the user ticks the checkbox, or the Page loads a readable Store (Requirement 4.4), until the user unticks it, "Forget" runs, a write fails (Requirement 5.2) or another tab removes the Store key (Requirement 3.9); otherwise it is **off**. The Page holds it in React state; there is no separate stored flag, so a Store at the Store key means Memory was on when it was written.
- **Store key**: The `localStorage` key `zombills.graveyard.v1`. It is the only key the Page reads or writes.
- **Store**: The string at the Store key, the JSON of a **Stored graveyard**:

  ```ts
  type StoredGraveyard = {
    version: 1;
    records: StoredRecord[];   // Graveyard order
  };

  type StoredRecord = {
    id: string;                // "sub:<currency>:<cadence>:<d>:<merchantKey>"
    merchant: string;
    serviceId: string | null;
    currentAmountCents: number;
    answer: "still-using" | "not-using";
    cadenceAssumed: boolean;
    carriedOver: boolean;
  };
  ```

  Example (`us-signed.csv`, Netflix buried):

  ```json
  {"version":1,"records":[{"id":"sub:USD:monthly:*:netflix","merchant":"Netflix","serviceId":"netflix","currentAmountCents":1799,"answer":"not-using","cadenceAssumed":false,"carriedOver":false}]}
  ```

- **Store module**: The one module in `apps/web/src` that touches `localStorage` (Requirement 10.3). Every call it makes is wrapped so that it never throws.
- **Codec**: Pure functions in `apps/web/src/slice/logic` that turn a Graveyard into Store text (**encode**) and Store text into a **Read result** (**decode**), with no storage, DOM, clock, randomness or logging.
- **Read result**: What decode returns: `{ kind: "empty" }` (no Store), `{ kind: "ok", graveyard, dropped }` (a readable Store; `dropped` is the number of stored records left out, Requirement 4.4), `{ kind: "newer" }` (a Store from a newer schema version, Requirement 4.10) or `{ kind: "unreadable" }` (Requirement 4.3).
- **Valid stored record**: A value that passes every check of Requirement 2.3.
- **Storage failure**: Any exception thrown by reading `window.localStorage` or by `getItem`, `setItem` or `removeItem` (for example `SecurityError` when storage is disabled, `QuotaExceededError` when it is full).
- **Orphan record**: An Earlier record, at the moment a new Analysis outcome arrives (its `id` is not the id of any subscription in the outcome).
- **Free subscription**: A subscription of the new Analysis outcome whose `id` has no record in the Graveyard.
- **Qualifying candidate** of an Orphan record `o`: A Free subscription `s` with the same Triple as `o`, which is not guessed unless `o.cadenceAssumed` is `true`, and whose price history holds the answered price: `s.priceHistory` holds an entry with `amountCents === o.currentAmountCents` (graveyard-ui review 1, finding 1). There is no price-ratio rule: on a shared key such as `APPLE.COM/BILL` a ratio match can be a different service, and asking again is the safer failure (spec review 1, finding 4).
- **Re-attach**: Moving an Orphan record to a Qualifying candidate (Requirement 6).
- **Memory panel**: The section of the Graveyard view added by this spec, with the Memory checkbox, its hint, the storage notes and "Forget everything" (Requirement 1).

---

## Requirements

### Requirement 1: The Memory control and the privacy wording

**Phase:** A

**User Story:** As a user who cares about privacy, I want my graveyard to be forgotten unless I ask for it to be kept, and to be told exactly what is kept, so that I stay in control of what stays on my device.

#### Acceptance Criteria

1. THE Graveyard view SHALL show the Memory panel directly before the back button ("Back to the rising" or "Back to the start"), so after the tombstones, the totals, the Resting, Not answered yet and Already stopped lists and the Share panel: a section with the heading "Memory", a native checkbox labelled "Remember my graveyard on this device", its hint (Criterion 5), any storage note (Requirements 4 and 5) and "Forget everything" (Requirement 8). The panel SHALL be shown WHEN the Graveyard view is shown, also when the Graveyard is empty.
2. THE checkbox SHALL be unticked on a first visit and whenever Memory is off. THE Page SHALL NOT tick it, or turn Memory on, by itself.
3. WHEN the user ticks the checkbox, THE Page SHALL turn Memory on and write the Store (Requirement 3.1). WHEN the write succeeds, THE Live region SHALL announce "Your graveyard will be kept on this device until you forget it." WHEN it fails, THE Page SHALL handle it as Requirement 5.2 says.
4. WHEN the user unticks the checkbox, THE Page SHALL turn Memory off and remove the Store key (Requirement 3.4), keep the in-memory Graveyard unchanged, and announce "Your graveyard is no longer kept on this device. It is kept until you close this page."
5. THE hint, linked to the checkbox with `aria-describedby`, SHALL read: "Only merchant text as printed on your statement (it can include reference numbers), amounts and your answers are kept, in this browser on this device. Transactions, dates and file names are not. Nothing is sent anywhere."
6. THE `idle` sentence of graveyard-ui Requirement 1.3 SHALL become: "Your statement stays on this device and is never uploaded. Nothing is kept after you close this page unless you choose to remember your graveyard. A statement covering 2 to 3 months gives the best results."
7. WHEN the Page loads with a readable Store that holds at least one record, THE `idle` panel SHALL also show "Your graveyard from this device is back: <n> buried, <m> resting." with `<n>` the number of Tombstones and `<m>` the number of Kept records, above the existing "Open the graveyard" control. The line SHALL stay until the first statement is analysed or the Graveyard is emptied.
8. Copy SHALL keep the tone of `spooky-design.md`: short sentences, no exclamation points, and no claim the app cannot back (it SHALL NOT say the data is encrypted, safe from other users of the device, or "private" without qualification).
9. THE checkbox, hint and every note SHALL meet WCAG AA contrast on the Graveyard view surface, checked in `apps/web/src/contrast.test.ts` WHEN they use a text and background pair not already listed there.
10. WHILE Memory is on, THE Rising summary SHALL show "Your answers are kept on this device." with a button "Memory settings" that opens the Graveyard view and moves focus to the Memory checkbox, so a second person on a shared computer sees that answers are being saved (spec review 1, finding 14).

### Requirement 2: The Stored graveyard format

**Phase:** A

**User Story:** As the Page, I want one small, versioned format with a strict check, so that what I read back is exactly what I wrote, and anything else is ignored.

#### Acceptance Criteria

1. THE Codec's encode SHALL turn a Graveyard into `JSON.stringify` of a Stored graveyard with `version: 1` and one Stored record per Answer record, in Graveyard order, holding exactly the seven fields of the Glossary taken from the Answer record. It SHALL NOT write `currency`, `cadence`, `merchantKey`, `yearlySavingCents` or any other field.
2. Encode SHALL be total for every Graveyard the Page can build: it SHALL NOT throw, and every Stored record it writes SHALL be a Valid stored record (Criterion 3). WHEN an Answer record would not give a Valid stored record, encode SHALL leave that record out and report how many it left out (Requirement 3.5). Encode SHALL also leave out, and count in the same report, every record whose `id` or `merchant` is longer than 4,096 UTF-16 code units, so one long unidentified bank line cannot fill the `localStorage` quota for the whole Graveyard (spec review 1, finding 10).
3. A value SHALL be a Valid stored record only WHEN all of the following hold:
   - it is a plain object, and `id`, `merchant`, `serviceId`, `currentAmountCents`, `answer`, `cadenceAssumed` and `carriedOver` are own properties (other properties are ignored and not kept);
   - `id` is a string matching `/^sub:([A-Z]{3}):(weekly|monthly|yearly):(\*|\d+(?:-\d+)?):(.+)$/s` (the `s` flag, so a line break in the key does not depend on the normalizer collapsing it), with `merchantKey` the last group, which may contain `:`;
   - WHEN the discriminator (third group) is not `*`, its number before any `-` equals `currentAmountCents` written in base 10 with no leading zeros;
   - `merchant` is a non-empty string;
   - `serviceId` is `null` or a non-empty string;
   - `currentAmountCents` is an integer from `1` to `999_999_9900` (the parser limit, subscription-detector Requirement 6.5), so with at most 1,000 records (Requirement 4.4) every Savings total stays below `999_999_9900 × 52 × 1000 ≈ 5.2e14` and `savingsTotals` cannot throw (spec review 1, finding 2);
   - `answer` is `"still-using"` or `"not-using"`;
   - `cadenceAssumed` and `carriedOver` are booleans;
   - `id` and `merchant` are each at most 1,048,576 UTF-16 code units long (the vertical-slice 1 MiB file limit, so a record the Page built from a real statement always fits; graveyard-ui review 1, finding 5). Decode accepts records up to this limit even though encode writes only records up to 4,096 code units (Criterion 2).
4. FROM a Valid stored record THE Codec SHALL build the Answer record `{ id, merchant, serviceId, currency, cadence, currentAmountCents, answer, cadenceAssumed, carriedOver, yearlySavingCents }`, with `currency` and `cadence` the first two groups of the `id` pattern, and `yearlySavingCents` = `null` WHEN `cadenceAssumed` is `true`, otherwise `currentAmountCents × Cadence factor(cadence)`. The Triple of a record SHALL always be derived from its `id` by the same pattern.
5. *(Removed by spec review 1, finding 3.)* THE Codec SHALL keep `serviceId` as stored. `getCancelHelp` already returns `email-only` for an id with no cancel entry (cancel-helper Requirement 2.4).
6. Examples:

   | Stored record (changed field only, else the Glossary example) | Result |
   | --- | --- |
   | as in the Glossary | valid; `currency: "USD"`, `cadence: "monthly"`, `yearlySavingCents: 21588` |
   | `"id": "sub:USD:monthly:1099:unidentified:apple:apple.com/bill 866-712-7753 ca"`, `"currentAmountCents": 1099` | valid; `merchantKey` is `unidentified:apple:apple.com/bill 866-712-7753 ca` |
   | `"id": "sub:USD:monthly:1199:netflix"` (amount `1799`) | invalid: discriminator does not match the amount |
   | `"id": "sub:usd:monthly:*:netflix"` | invalid: currency not upper case |
   | `"cadenceAssumed": true` | valid; `yearlySavingCents: null` |
   | `"currentAmountCents": 17.99` | invalid |
   | `"yearlySavingCents": 99999` added | valid; the extra field is ignored, `yearlySavingCents` stays `21588` |
   | `"serviceId": "no-such-service"` | valid; `serviceId: "no-such-service"` |
   | `"currentAmountCents": 9999999901` | invalid: above `999_999_9900` |

### Requirement 3: Writing the Store

**Phase:** A

**User Story:** As a user who ticked "Remember my graveyard on this device", I want every answer kept as soon as I give it, so that a reload or a closed tab loses nothing.

#### Acceptance Criteria

1. WHILE Memory is on, THE Page SHALL write the encoded Graveyard (Requirement 2.1) to the Store key with one `setItem` call: when Memory is turned on, and after every change to the Graveyard (an answer recorded, changed, refreshed, re-attached or removed by graveyard-ui Requirement 9.5 or this spec). After the write that turns Memory on, it SHALL NOT write WHEN the encoded text equals the last-written text. After an `ok` load (Requirement 4.4) the last-written text SHALL be the raw Store text read on load; WHEN `encode(graveyard)` differs from it, THE Page SHALL write once, which also removes ignored extra fields from the stored copy (spec review 1, finding 9).
2. THE answer SHALL be written when it is recorded (graveyard-ui Requirement 5.4), not when the Burial sequence ends, so a reload during a burial keeps it.
3. WHILE Memory is off, THE Page SHALL make no `setItem` or `clear` call, no `getItem` call after the one read on load (Requirement 4.1), and no `removeItem` call other than the ones of Requirements 1.4 (untick), 4.3 (unreadable Store), 5.2 (after a failed write) and 8.4 ("Forget"). On a first visit with no Store, the whole graveyard-ui flow therefore makes exactly one storage call, the `getItem` on load.
4. WHEN Memory is turned off (Requirement 1.4) or by "Forget everything" (Requirement 8), THE Page SHALL call `removeItem` on the Store key once.
5. WHEN encode leaves records out (Requirement 2.2), THE Page SHALL keep them in memory, write the rest, and show in the Memory panel "<n> answers could not be kept on this device. They are kept until you close this page." (with `<n>` 1: "1 answer could not be kept on this device. It is kept until you close this page.")
6. THE Page SHALL NOT call `clear()` and SHALL NOT read, write or remove any key other than the Store key.
7. THE Page SHALL NOT write the Store from a render function. Writes SHALL happen after the state change that caused them (for example in an effect), so that React Strict Mode double rendering does not double them.
8. *(PBT: write protocol)* The write decisions SHALL be made by a pure function `storageCommands(prevMemory, nextMemory) → Command[]` in `apps/web/src/slice/logic`, where a Memory snapshot holds at least Memory on or off, the Graveyard, the last-written text and whether a removal was requested ("Forget", an unreadable Store), and a Command is a write of a text or a removal of the Store key. FOR ALL sequences of snapshots produced by the Page reducer from actions (answer, change, new outcome, tick, untick, forget, load), with the Commands applied to a fake Storage whose `setItem` and `removeItem` do not throw: WHILE Memory is off no write SHALL be issued and only the removals allowed by Criterion 3; each step SHALL issue at most one write; no write SHALL repeat the last-written text; and WHILE Memory is on, after each step the fake Storage SHALL decode (Requirement 4) to a Graveyard deeply equal to the in-memory Graveyard minus the records encode left out. The throwing cases are unit tests: a throwing `setItem` gives Memory off and the note of Requirement 5.2, and a throwing `removeItem` gives Memory off and the note of Requirement 5.3 (spec review 1, findings 7 and 12).
9. WHEN a `storage` event arrives for the Store key with `newValue === null` (another tab removed it by unticking or "Forget"), THE Page SHALL turn Memory off and untick the checkbox without writing or removing anything, and SHALL keep its in-memory Graveyard. The Store module SHALL own the one `storage` listener; the Page subscribes to it in an effect and unsubscribes on unmount. Without this, the other tab's next change would write the forgotten Graveyard back (spec review 1, finding 1).

### Requirement 4: Reading the Store on load

**Phase:** A

**User Story:** As a returning user, I want my graveyard back when I open the page, and if what was kept cannot be read, I want the page to work anyway and tell me what happened.

#### Acceptance Criteria

1. WHEN the page loads, `apps/web/src/main.tsx` SHALL read the Store once through the Store module (one `getItem` on the Store key, then decode) before the first render, and pass the Read result to `<App>` as a prop. No component SHALL read the Store, so React Strict Mode cannot double the read (spec review 1, finding 13).
2. WHEN `getItem` returns `null`, decode SHALL return `{ kind: "empty" }`; Memory SHALL be off and the Graveyard empty, as today.
3. WHEN the text is not JSON, or is JSON but not a plain object, or its `version` is neither the number `1` nor a number greater than `1` (Criterion 10), or its `version` is `1` and its `records` is not an array, decode SHALL return `{ kind: "unreadable" }`. THE Page SHALL then remove the Store key (Requirement 3.4), start with Memory off and an empty Graveyard, and show in the `idle` panel, and in the Memory panel only while the Graveyard holds a record, "Your saved graveyard could not be read, so it was ignored." until the user ticks the checkbox or analyses a statement. (Amended at task 11, option a: the Memory panel is in the Graveyard view, which an empty Graveyard cannot open, so with an unreadable Store the note shows in the `idle` panel only.) (Amended by design review 1 #9: "cleared" became "ignored", so the note does not contradict the Requirement 5.3 note when the removal fails.)
4. WHEN the Store is readable, decode SHALL return `{ kind: "ok", graveyard, dropped }`: the Answer records of the Valid stored records in stored order, keeping the first record of each `id` and dropping later ones with the same `id`, keeping at most the first 1,000 such records, and `dropped` = the number of array elements not kept (invalid, duplicate or beyond the first 1,000). One invalid record SHALL NOT discard the others (graveyard-ui review 1, finding 5). THE Page SHALL start with Memory on and that Graveyard; every restored record is an Earlier record until a statement is analysed.
5. WHEN `dropped` is greater than `0`, THE Page SHALL write the Store again with the kept records (Requirement 3.1) and show in the `idle` panel, and in the Memory panel only while the Graveyard holds a record, "<n> saved answers could not be read and were left out." (with `<n>` 1: "1 saved answer could not be read and was left out.") until the user analyses a statement, ticks or unticks the checkbox, or forgets everything. (Amended at task 11, option a.)
6. Decode SHALL never throw, for any string or `null` input, including deeply nested JSON, very long strings and `__proto__` keys. It SHALL NOT use `eval`, `Function` or a JSON reviver that runs code from the text, and it SHALL NOT let a `__proto__` key change any object's prototype.
7. THE restored Graveyard SHALL behave as one built in the same page session (graveyard-ui Requirements 6 to 9): its Tombstones count in the Savings totals and the counter, the fog clears WHEN it holds a Tombstone (graveyard-ui Requirement 13.4), and the share card uses it unchanged.
8. Example: the Store `{"version":1,"records":[<Netflix as in the Glossary>,{"id":"oops"}]}` loads Netflix as a Tombstone with the counter "$215.88", shows "1 saved answer could not be read and was left out.", and rewrites the Store with Netflix only.
9. Examples of `{ kind: "unreadable" }`: `""`, `"{"`, `"null"`, `"[]"`, `{"version":0,"records":[]}`, `{"version":"1","records":[]}`, `{"version":1}`.
10. WHEN the Store is a plain object whose `version` is a number greater than `1`, decode SHALL return `{ kind: "newer" }`. THE Page SHALL keep the Store key (no `removeItem`), start with Memory off and an empty Graveyard, and show in the `idle` panel, and in the Memory panel only while the Graveyard holds a record, "Your saved graveyard was made by a newer version of Zombills." until the user ticks the checkbox or analyses a statement. A tick, which the user can give only in the Graveyard view and so only after a statement has given the Graveyard a record, overwrites the Store (Requirement 3.1). Example: `{"version":2,"records":[]}` (spec review 1, finding 8). (Amended at task 11, option a: with a `newer` Store the note and the checkbox are never on screen together, so the tick-overwrites rule is not an `idle`-screen flow.)

### Requirement 5: Storage failures never break the Page

**Phase:** A

**User Story:** As a user in a private window or a browser with storage turned off, I want the app to work exactly as before and tell me plainly that it cannot remember, so that nothing breaks.

#### Acceptance Criteria

1. IF reading `window.localStorage` or calling `getItem` on load throws a Storage failure, THEN THE Page SHALL treat the result as `{ kind: "empty" }`, start with Memory off, and render normally. No note SHALL be shown until the user ticks the checkbox.
2. IF `setItem` throws a Storage failure (including `QuotaExceededError` and `SecurityError`), THEN THE Page SHALL turn Memory off, untick the checkbox, try `removeItem` on the Store key once so an outdated Store does not come back on the next load, keep the in-memory Graveyard unchanged, show in the Memory panel "This browser would not save your graveyard. It is kept until you close this page.", and announce the same text.
3. IF `removeItem` throws a Storage failure, THEN THE Page SHALL carry on as if it had succeeded (Memory off, Graveyard as Requirement 1.4 or 8 says). WHEN the removal came from an untick (Requirement 1.4), an unreadable Store (Requirement 4.3) or "Forget" (Requirement 8.4), THE Page SHALL show in the Memory panel "This browser would not clear the saved graveyard. Clear this site's data in the browser settings to remove it." It SHALL NOT show this note after the `removeItem` that follows a failed write (Criterion 2), where nothing may ever have been saved (spec review 1, finding 11).
4. WHEN the user ticks the checkbox again after a failure, THE Page SHALL try to write again (Requirement 3.1). THE Page SHALL NOT retry by itself.
5. THE Store module SHALL catch every exception from storage access and return a result value; no Storage failure SHALL reach React, an error boundary, the console or the Page's `error` state, and the Rising, Graveyard view, savings counter and Share panel SHALL keep working.
6. THE Page SHALL make no more than one `setItem` call per Graveyard change, so a full storage cannot cause a loop of writes.
7. Examples:

   | Storage | On load | Tick | After burying Netflix |
   | --- | --- | --- | --- |
   | works, empty | Memory off | Store written; announced as Requirement 1.3 | Store holds Netflix |
   | `window.localStorage` getter throws `SecurityError` | Memory off, no note | note of Criterion 2; unticked | no storage call |
   | `setItem` throws `QuotaExceededError` on the second write | Memory off | first write succeeds | note of Criterion 2; Memory off; `removeItem` tried; Netflix tombstone stays |

### Requirement 6: Re-attaching answers when ids change

**Phase:** B (all criteria, including the summary line of Criterion 8)

**User Story:** As a user whose subscription changed price, I want my earlier answer to follow it to the new statement, so that I am not asked the same question again, and never have my answer moved to a different service.

#### Acceptance Criteria

1. WHEN a new Analysis outcome arrives, THE Graveyard logic SHALL Re-attach before the refresh of graveyard-ui Requirement 9.5, in one pure function `reattach(graveyard, subscriptions)` that returns a new Graveyard and mutates nothing.
2. A pass SHALL work on the Orphan records and Free subscriptions at the start of the pass, all at once: an Orphan record `o` SHALL be moved to a Free subscription `s` exactly WHEN `s` is the only Qualifying candidate of `o`, and `o` is the only Orphan record of which `s` is a Qualifying candidate. Two Orphan records that share their only Qualifying candidate SHALL both stay Earlier records.
3. Moving `o` to `s` SHALL replace `o` in place (same Graveyard position) with a record that has `s.id`, `o.answer`, `carriedOver: true` and the other fields refreshed from `s` as graveyard-ui Requirement 9.5 says. Its `cadenceAssumed` SHALL be `s.evidence.cadenceAssumed`.
4. `reattach` SHALL repeat passes until a pass moves no record, and return that Graveyard. (One pass shrinks the set of Free subscriptions, so a second pass can find a single Qualifying candidate for another Orphan record; graveyard-ui review 1, finding 2.) Because each pass that changes anything removes at least one Orphan record, there are at most as many passes as Orphan records, plus one.
5. `reattach` SHALL NOT change a Current record, add a record, remove a record, change an `answer`, or move a record to a subscription with a different Triple.
6. WHEN the user changes the answer of a record with `carriedOver: true` ("Unbury" or "Bury after all"), its `carriedOver` SHALL become `false`. A refresh SHALL keep `carriedOver` as it is: `refreshGraveyard` (`apps/web/src/slice/logic/graveyard.ts`) SHALL copy the flag from the old record instead of rebuilding it with `answerRecordFor`.
7. A re-attached record SHALL then count as a Current record: it is in the Answers map, its subscription does not rise, and the classifier labels it (a `"not-using"` record gives `zombie`, graveyard-ui Requirement 9.9).
8. WHEN at least one record was re-attached for the new outcome, THE Rising summary SHALL show "<n> earlier answers were carried over to this statement." (with `<n>` 1: "1 earlier answer was carried over to this statement.") below the Still-draining lines, and the Live region announcement on entering `results` SHALL include the same sentence.
9. Examples (USD, monthly, `k` = `unidentified:apple:apple.com/bill 866-712-7753 ca`):

   | Graveyard before | New outcome (Free subscriptions) | Result |
   | --- | --- | --- |
   | `sub:USD:monthly:1099:k` Apple Music `"not-using"` at `1099`; `sub:USD:monthly:99:k` iCloud+ `"still-using"` at `99` | only `sub:USD:monthly:*:k` at `1199`, `priceHistory` 1099 → 1199 | Apple Music record moves to `…:*:k`, `carriedOver: true`, `currentAmountCents: 1199`, `yearlySavingCents: 14388`; iCloud+ stays an Earlier record (the history has no 99) |
   | `sub:USD:monthly:1099:k` Apple Music `"not-using"` at `1099`; `sub:USD:monthly:99:k` iCloud+ at `99` | only `sub:USD:monthly:*:k` at `999` (Apple TV+, never answered), `priceHistory` 999 | must not move: the history has neither 1099 nor 99. Apple TV+ rises and its cost is not counted as saved (spec review 1, finding 4) |
   | `sub:USD:monthly:99:k` iCloud+ `"not-using"` | only `sub:USD:monthly:*:k` at `1099` (Apple Music, never answered) | no move: the history has no 99 (graveyard-ui review 1, finding 1); Apple Music rises |
   | `sub:USD:monthly:1099:k` and `sub:USD:monthly:999:k`, both answered | only `sub:USD:monthly:*:k` at `1099`, `priceHistory` 999 → 1099 | no move: the subscription is the only Qualifying candidate of two Orphan records; both stay Earlier records and it rises |
   | `sub:USD:monthly:1099:k` `"not-using"` | `sub:USD:monthly:1199:k` and `sub:USD:monthly:1299:k`, each with `priceHistory` holding 1099 | no move: two Qualifying candidates |
   | `sub:USD:monthly:*:netflix` `"not-using"` | `sub:USD:monthly:*:netflix` | not an Orphan record: the id matches, nothing moves |
   | `sub:GBP:monthly:*:netflix` `"not-using"` | `sub:USD:monthly:*:netflix` | no move: different Triple |

10. *(PBT: re-attach)* FOR ALL Graveyards and subscription lists from the web test arbitraries, extended so that several subscriptions and records share a Triple with different amounts and discriminators: `reattach` applied twice SHALL equal `reattach` applied once (idempotent); the result SHALL hold the same number of records, at most one per `id`, with the same answers in the same positions; every record whose `id` changed SHALL have had an id not in the outcome, SHALL now name a subscription that had no record, SHALL have the same Triple as before and `carriedOver: true`, and that subscription SHALL have been a Qualifying candidate of it; no Current record SHALL change; and the inputs (deep-frozen) SHALL be unchanged.
11. *(PBT: re-attach and refresh)* FOR ALL Graveyards, subscription lists and sequences of new outcomes, answers and changes, the properties of graveyard-ui Requirement 9.8 SHALL still hold with re-attach applied before each refresh, except that "Unbury" followed by "Bury after all" on a record with `carriedOver: true` restores a record deeply equal to the buried one except `carriedOver: false` (Criterion 6). graveyard-ui Requirement 9.8 SHALL get a note that this spec amends it (spec review 1, finding 5).

### Requirement 7: Earlier and carried-over records in the Graveyard view

**Phase:** A, except Criterion 2 (Phase B)

**User Story:** As a user looking at a graveyard that spans several statements or visits, I want to see which answers come from an earlier statement and change any of them, so that the graveyard stays mine to correct.

#### Acceptance Criteria

1. THE Graveyard view SHALL show the note "From an earlier statement" on every Earlier record, on its tombstone and on its Resting list item, as text after the Display name. This replaces graveyard-ui Requirement 7.7.
2. THE Graveyard view SHALL show the note "Answer carried over from an earlier statement" on every Current record with `carriedOver: true`, in the same place.
3. Each Earlier Tombstone SHALL have an "Unbury" button. WHEN it is activated, THE Page SHALL set the record's `answer` to `"still-using"` and `carriedOver` to `false`, keep its position, `cadenceAssumed` and other fields, and move it to the Resting list. The Savings totals SHALL drop by its `yearlySavingCents` (nothing WHEN it is `null`), and the counter SHALL jump to the new value (graveyard-ui Requirement 6.4). This replaces graveyard-ui Requirement 8.2 (see the Introduction, "Decision").
4. Each Earlier Kept record SHALL have a "Bury after all" button. WHEN it is activated, THE Page SHALL set its `answer` to `"not-using"` and `carriedOver` to `false`, with `yearlySavingCents` derived as in Requirement 2.4 (so `null` WHEN `cadenceAssumed` is `true`; graveyard-ui review 1, finding 4), and run the tombstone rise and counter count-up of graveyard-ui Requirement 8.3 in the Graveyard view. This completes graveyard-ui Requirement 8.3.
5. Changing an Earlier record SHALL NOT change the Answers map, the classifier labels or the Still-draining figures of the current statement (the record is not a Current record), and SHALL NOT change any other record.
6. Focus and announcements after a change on an Earlier record SHALL follow graveyard-ui Requirements 8.4 and 14.3, using the Display name.
7. *(PBT: Earlier changes)* FOR ALL Graveyards and outcomes, and FOR ALL Earlier records: "Unbury" followed by "Bury after all" on a Tombstone SHALL restore a record deeply equal to the original except `carriedOver: false`; "Bury after all" on a record with `cadenceAssumed: true` SHALL give `yearlySavingCents: null`; and the Savings totals SHALL change by exactly that record's `yearlySavingCents` (or `0` WHEN it is `null`).
8. Example (Memory on, no statement analysed, Store with Netflix USD `21588` buried and Spotify USD `13188` buried): the Graveyard view shows both tombstones, each with "From an earlier statement", and "You buried $347.76 a year."; "Unbury Netflix" moves Netflix to Resting, the total becomes "$131.88" and the Store holds Netflix with `"still-using"`; "Bury after all Netflix" brings back "$347.76".
9. THE Page reducer SHALL have actions for "Unbury" and "Bury after all" keyed on the record `id`, which work on Earlier records in every Page state, including `idle`, `error` and `no-subscriptions` where there are no `results` and no Subscription (today `currentRecordSubscription` in `page-state.ts` requires both; spec review 1, finding 16).

### Requirement 8: "Forget everything"

**Phase:** A

**User Story:** As a user who wants a clean slate, for example on a shared computer, I want one control that removes everything the app kept, so that no trace of my answers is left on the device.

#### Acceptance Criteria

1. THE Memory panel SHALL show a "Forget everything" button WHEN the Graveyard has at least one record or Memory is on.
2. WHEN "Forget everything" is activated, THE Memory panel SHALL show, in place of the button, the text "Forget every answer and tombstone? This cannot be undone." with the buttons "Forget" and "Cancel", as a group labelled by that text, and focus SHALL move to "Cancel". Escape SHALL act as "Cancel".
3. WHEN "Cancel" is activated, THE Page SHALL change nothing, show the "Forget everything" button again and move focus to it.
4. WHEN "Forget" is activated, THE Page SHALL: remove the Store key (Requirement 3.4) whether Memory was on or off; turn Memory off and untick the checkbox; empty the Graveyard; put every Risen subscription of the current outcome back in the Queue in Rising order (graveyard-ui Requirement 2.3), with the Rising stage reset to its first card; clear any storage note, the `idle` line of Requirement 1.7 and the carried-over line of Requirement 6.8; and keep the current statement and Analysis outcome.
5. After "Forget", the counter SHALL jump to the value of graveyard-ui Requirement 6.2 with no Tombstones (no count-down), the fog SHALL return (graveyard-ui Requirement 13.4), the Graveyard view SHALL show "Nothing buried yet.", focus SHALL move to the heading "Your graveyard", and the Live region SHALL announce "Everything is forgotten. Nothing is kept on this device."
6. WHILE the tombstone rise of Requirement 7.4 is running, "Forget everything" and "Forget" SHALL be `aria-disabled` and ignore activation. (The Burial sequence of the Rising never runs while the Memory panel is shown, because `open-graveyard` resets the stage to `ask`.)
7. "Forget everything" SHALL NOT touch any other key, `sessionStorage`, cookies or caches (the Page never writes them), and SHALL NOT reload the page.
8. *(PBT: forget)* FOR ALL Graveyards, outcomes and Memory states, after "Forget": the Graveyard SHALL be empty; the Queue SHALL equal the Risen subscriptions in Rising order; the Answers map SHALL be empty, so no classified subscription has the `zombie` label; Memory SHALL be off; and, with a fake Storage whose `removeItem` does not throw, the fake Storage SHALL have no Store key. With a `removeItem` that throws, Memory SHALL be off and the note of Requirement 5.3 SHALL be shown.

### Requirement 9: Accessibility and screen states

**Phase:** A

**User Story:** As a keyboard or screen-reader user, I want to turn Memory on and off, read every note and forget everything without a mouse, so that the memory works for me too.

#### Acceptance Criteria

1. The checkbox, "Forget everything", "Forget", "Cancel", and "Unbury" and "Bury after all" on Earlier records SHALL be reachable and operable with the keyboard alone, in DOM order, with the `--moss` focus ring at a 2px offset (graveyard-ui Requirement 14.1). "Unbury" and "Bury after all" SHALL include the Display name in their accessible name, and no two controls shown at the same time SHALL have the same accessible name.
2. Every storage note (Requirements 3.5, 4.3, 4.5, 4.10, 5.2, 5.3) SHALL be plain text in the Memory panel and, WHEN it appears after a user action, SHALL also be announced through the Live region. Notes shown on load SHALL NOT be announced; they are in the `idle` panel, which is read in order.
3. The notes "From an earlier statement" and "Answer carried over from an earlier statement" SHALL be text, not colour or icon alone, and SHALL be part of the list item's content read by screen readers.
4. Focus SHALL never be left on a removed element: after "Forget", after a change that moves a record between lists, and after a Storage failure unticks the checkbox (focus stays on the checkbox).
5. The Memory panel SHALL stack to a single column at widths up to 640 px with no horizontal scrolling at 320 px, spacing on the 8 px grid.
6. The screen-state table of graveyard-ui Requirement 1.10 SHALL change for the Graveyard row: Default as before, plus the Memory panel; Processing n/a (storage calls are synchronous); Empty "Nothing buried yet." with the Memory panel; Error the storage notes of Requirements 4 and 5, with the Graveyard still shown. The Gate row SHALL gain, in its Default state, the restored line of Requirement 1.7 and, in its Error state, the unreadable and dropped notes of Requirement 4.

### Requirement 10: Privacy, the storage lint rule and changes to earlier specs

**Phase:** A

**User Story:** As the Zombills privacy contract, I want storage to be possible in exactly one place, for exactly one key and only when the user asked, so that statement data still never leaves the browser and nothing else is kept.

#### Acceptance Criteria

1. Vertical-slice Requirements 7.1, 7.2, 7.4 to 7.7 and graveyard-ui Requirement 15.1 SHALL keep holding: no request other than same-origin `GET`s for static files in `dist`; no third-party request; no `console`, `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` or `EventSource` in `apps/web/src` outside tests; the same build-time CSP string (`CSP_POLICY` in `apps/web/csp-plugin.ts` unchanged); no new runtime or dev dependency.
2. Vertical-slice Requirement 7.3 and graveyard-ui Requirements 9.7 and 15.2 SHALL be amended, with a note in each that this spec changed it, to: THE Page SHALL NOT write statement text, transactions, subscriptions or any value derived from them to `localStorage`, `sessionStorage`, IndexedDB, the Cache API, cookies or the URL, with one exception: WHILE Memory is on, the Store key in `localStorage` SHALL hold the Stored graveyard of Requirement 2, and nothing else. graveyard-ui Requirement 9.7's "lost on reload" SHALL read "lost on reload unless Memory is on".
3. All access to `localStorage` SHALL be in the Store module (for example `apps/web/src/slice/storage/graveyard-store.ts`). ESLint SHALL enforce this for `apps/web/src/**/*.{ts,tsx}` outside tests and outside that module with:
   - `no-restricted-globals` for `localStorage`, `sessionStorage`, `indexedDB` and `caches`;
   - `no-restricted-properties` for `localStorage`, `sessionStorage`, `indexedDB` and `caches` on `window`, `globalThis` and `self`, and for `cookie` on `document` (graveyard-ui review 1, finding 17).

   Inside the Store module the same rules SHALL forbid everything except `localStorage` and `window.localStorage`. Because flat config replaces rule options, each override SHALL repeat the existing network entries (`WEB_NETWORK_GLOBALS`, `WEB_NETWORK_PROPERTIES`) so no current ban is lost. The `slice/logic` block, which sets its own options for these rules, SHALL also get the new storage and cookie bans next to its existing ones; a lint test or fixture SHALL show that `window.sessionStorage`, `document.cookie` and `localStorage` outside the Store module each fail.
4. THE Codec SHALL stay in `apps/web/src/slice/logic` under the existing purity rules (no storage, DOM, clock or randomness).
5. THE Page SHALL NOT store anything in a cookie, and the Netlify headers and `netlify.toml` SHALL NOT change.
6. THE `privacy-guard` hook and the `no-network` scans SHALL keep passing with no new exception.
7. THE share card SHALL keep showing no service names (share-card Introduction, "Deferred"). This spec SHALL NOT add names, amounts per service or dates to the image, its alt text or its file; restored and re-attached Tombstones count in its Buried count and totals like any other.
8. THE graveyard-ui `requirements.md` SHALL get a note in Requirements 7.7, 8.2, 8.3, 9.7, 9.8 (Requirement 6.11), 10, 11, 12, 15.2, 16.2 and 16.4 and in its Introduction saying that `graveyard-memory` now covers or changes it, and the vertical-slice `requirements.md` SHALL get the note of Criterion 2 in Requirement 7.3.

### Requirement 11: Tests

**Phase:** A, except the tests of Phase B requirements (re-attach PBTs, the re-attach example table and the re-attach component test), which are Phase B

**User Story:** As the team, I want the memory covered by property, component and browser tests, so that a storage bug can neither lose a user's graveyard nor break the demo.

#### Acceptance Criteria

1. Pure logic SHALL have unit tests and the property tests marked *(PBT)* in this spec, in `.property.test.ts` files next to their source, with fast-check's default 100 runs: write protocol (Requirement 3.8, against `storageCommands`), re-attach (6.10), re-attach and refresh (6.11), Earlier changes (7.7), forget (8.8), and:
   - A new `pageRecordArb` in the web test arbitraries SHALL build Answer records the Page can build: the id is `sub:${currency}:${cadence}:${d}:${merchantKey}`; `d` is `*`, the amount, or the amount plus `-r`; `merchantKey` covers Known, `merchant:` and `unidentified:` keys containing `:` and spaces; the amount is from `1` to `999_999_9900`; and `yearlySavingCents` is derived as in Requirement 2.4. A test SHALL check that encode leaves out no generated record. The existing record arbitrary (`id: fc.string({maxLength: 6})`, amounts from `0`) SHALL NOT be used for the Codec PBTs, and the generator SHALL NOT be filtered (spec review 1, finding 6).
   - *(PBT: round-trip)* FOR ALL Graveyards the Page can build (from `pageRecordArb`), including records with unidentified `merchantKey`s that contain `:` and spaces, guessed records, `serviceId: null`, `carriedOver: true`, and records whose `id` or `merchant` is exactly 4,096 code units long: decode(encode(g)) SHALL return `{ kind: "ok", graveyard, dropped: 0 }` with `graveyard` deeply equal to `g`.
   - *(PBT: decode never throws)* FOR ALL strings, FOR ALL JSON values (`fc.jsonValue()`) and FOR ALL Stored graveyards with any one field of any record replaced by an arbitrary JSON value: decode SHALL return a Read result without throwing; every returned record SHALL come from a Valid stored record; the result SHALL hold at most one record per `id`, no more records than the input array, and `dropped` SHALL equal the input length minus the result length; no returned object SHALL have a prototype other than `Object.prototype`; and for every `ok` result, `savingsTotals(graveyard)` SHALL NOT throw (Requirements 2.3 and 4.4).
   - *(PBT: derived fields)* FOR ALL Valid stored records, the decoded `currency` and `cadence` SHALL be the ones named in its `id`, and `yearlySavingCents` SHALL be `null` exactly when `cadenceAssumed` is `true` and otherwise `currentAmountCents × Cadence factor(cadence)`.
2. Unit tests SHALL cover every example table in Requirements 2.6, 5.7 and 6.9, the examples of Requirements 4.8, 4.9, 4.10 and 7.8, encode leaving out a record longer than 4,096 code units (Requirement 2.2), a load of 1,001 valid records (1,000 kept, `dropped: 1`), and the `storage` listener of Requirement 3.9 with a synthetic `StorageEvent` (`key` the Store key, `newValue: null`): Memory turns off, the checkbox is unticked, the Graveyard is unchanged and no storage call is made.
3. Component tests (Vitest, jsdom, Testing Library, `userEvent`) SHALL cover, with a spied or fake `localStorage`:
   - first visit: the checkbox unticked, the hint text of Requirement 1.5, the new `idle` sentence of Requirement 1.6 (updating `apps/web/src/slice/slice-page.test.tsx`, which checks the old sentence); with `<App>` given an `empty` Read result, no storage call through the whole graveyard-ui flow (the one `getItem` is in `main.tsx`, Requirement 4.1; this replaces the "no storage" check of graveyard-ui Requirement 16.2);
   - tick, bury Netflix: the Store text equals the Glossary example, and the Rising summary shows the line and button of Requirement 1.10; untick: `removeItem` called once and the tombstone still shown;
   - a Store with an unidentified Apple record: the hint wording is shown and the Store holds no description text other than the `merchant` and the `id` (no date, no file name, no amount history);
   - load with a valid Store: the `idle` line of Requirement 1.7, "Open the graveyard", the tombstones with "From an earlier statement", the counter; then analysing `us-signed.csv` makes Netflix a Current record, so Netflix does not rise and the note is gone;
   - load with an unreadable Store, with one bad record and with a newer-version Store: the notes of Requirements 4.3, 4.5 and 4.10 in the `idle` panel (and in the Memory panel for the bad-record example, whose Graveyard holds Netflix), the rewrite, and no `removeItem` for the newer Store; load with a valid Store that matches its encoding: no write. (Amended at task 11, option a: these flows do not tick the checkbox to overwrite a newer-version Store. That tick, after an analysis, still overwrites it and stays covered by the Requirement 4.10 unit tests and the "tick after analysing" flow.)
   - Storage failures: a throwing `localStorage` getter, a throwing `getItem`, a `setItem` that throws `QuotaExceededError`, a throwing `removeItem`: the notes of Requirement 5, the checkbox state, and every Page state still working;
   - re-attach: a Graveyard with Apple Music at `1099` and an outcome where it is `…:*:k` at `1199`: the card does not rise, the Rising summary line of Requirement 6.8, the note "Answer carried over from an earlier statement";
   - "Unbury" and "Bury after all" on Earlier records, with the totals of Requirement 7.8 and focus on the moved item;
   - "Forget everything": the confirmation with focus on "Cancel", Escape, "Cancel", "Forget" with the effects of Requirement 8.4 and 8.5;
   - reduced motion: the Earlier "Bury after all" uses only `opacity` (graveyard-ui Requirement 13.2).
4. THE Playwright test `apps/web/e2e/demo-path.spec.ts` SHALL keep its CSP, request, console and storage checks for the graveyard-ui demo path (with `localStorage.length` `0` while Memory is off) and SHALL add a memory path: tick "Remember my graveyard on this device" after burying Netflix; check that `localStorage` holds only the Store key and that its value parses to `version: 1` with one record; reload; check the `idle` line, open the graveyard and see "Here lies Netflix." with "From an earlier statement" and the counter "$215.88"; activate "Forget everything" then "Forget"; check `localStorage.length` is `0`, `sessionStorage.length` is `0` and `document.cookie` is `""`. The test SHALL fail on any request that breaks Requirement 10.1 or any console output.
5. THE root `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` SHALL pass, and the Playwright test SHALL pass with `npm run test:e2e --workspace @zombills/web`.
