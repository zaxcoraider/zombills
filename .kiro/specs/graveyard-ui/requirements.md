# Requirements Document

## Introduction

The `graveyard-ui` feature turns the plain vertical-slice page of `apps/web` into the haunted Zombills flow, the Costume Contest centrepiece. The theme does real work (`product.md`): every element below carries state, gives feedback or guides attention.

- After analysis, each detected subscription **rises** as an undead card in the art-spike style. The card shows the merchant, cadence, amount, yearly cost and the data labels from the classifier (`possessed` with its price-rise sentence, `trial-trap` with its trial sentence), and asks "Still using this?".
- "Yes, let it rest" keeps it. "No, bury it" records a `"not-using"` answer, which the classifier turns into the `zombie` label, and plays the burial. A **tombstone** with the yearly saving is left behind and the **savings counter** climbs.
- The **graveyard** view lists every tombstone with its saving per year, the total per currency, and the kept subscriptions in a calm list. Any answer for the current statement can be changed there.
- Answers and tombstones stay in memory for the page session only. Nothing is written to any storage; a reload starts with an empty graveyard. Opt-in persistence, re-attaching answers when ids change and "Forget everything" are deferred to the future spec `graveyard-memory` (see "Hand-off to graveyard-memory" at the end). *(Note: changed by `graveyard-memory` Requirements 1 to 12: opt-in persistence, re-attach and "Forget everything" are now specified there, and with Memory on the graveyard survives a reload.)*

The page keeps everything the vertical slice built: the drop area, file button and Sample buttons; the file checks, byte decoding and analysis Pipeline; every Page state and error message; the CSP, the no-network rule and the lint rules (vertical-slice Requirements 2 to 4 and 6 to 9). The visual parts come from the art spike in `apps/web/src/spike` (`UndeadCard`, `Tombstone`, `SavingsCounter`, `BurialMound`, `SinkCrumbs`, the backdrop layers and the icons), generalised from their hard-coded Netflix fixture to real `ClassifiedSubscription` values. After that the spike route is retired (Requirement 1).

### Decision: one card at a time

The Rising shows **one undead card at a time**, in a fixed order (biggest yearly cost first), with a progress line ("2 of 4 answered"), a "Skip for now" control, and a way to reach the graveyard at any point. Reasons:

- **Demo.** The spike's burial is a full-stage scene: the card sinks through the ground line, the earth closes and the tombstone rises in the same place. That needs the stage to itself. In a 2-minute video one card filling the screen reads clearly; a grid of small cards with burials happening inside grid cells does not.
- **10+ subscriptions.** A user answers one question at a time instead of scanning a wall of cards. "Skip for now" moves a card to the end of the queue, the progress line shows what is left, and the graveyard lists every unanswered subscription with an "Answer now" control, so no card can be lost.
- **Keyboard and screen readers.** There is exactly one question in focus, with two buttons. After each answer focus moves to the outcome (tombstone or kept note) and then to "Next", so a screen-reader user hears one subscription, one answer and one result per step.

The alternative, all cards in a grid, makes 10+ subscriptions easier to scan but splits attention, needs a per-cell burial that loses the spike's ground-line effect, and makes Tab order long. The graveyard view covers the "see everything at once" need.

### Scope budget

The deadline is 4 Dec. This spec is sized for about 20 to 24 tasks: the pure Graveyard logic and its five PBTs, the moved Spike components, the Rising, the card, keep and bury, tombstones and counter, the Graveyard view, changing answers, motion, accessibility, the vertical-slice notes and the tests. Anything that needs storage or matching across statements is deferred to `graveyard-memory`.

### Out of scope

- Cancel links and cancellation emails (cancel-helper spec). The burial records the user's decision; it does not cancel anything. The burial copy SHALL NOT say the subscription was cancelled.
- The shareable graveyard image (share-card spec).
- The Reaper (separate repo).
- Sound. `spooky-design.md` makes sound optional and off by default; this spec adds none.
- The column-mapping screen. The `"columns-unreadable"` error state of vertical-slice Requirement 4.6 stays as it is.
- The Séance scanning animation (`design.md`). The `working` state keeps the vertical-slice text `Reading <name>…`, on the haunted backdrop.
- Cancel helper data on the card (`Subscription.cancel`).
- Merging statements. Each analysis replaces the previous one; only answers and tombstones carry over, in memory (Requirement 9.7).
- Deferred to `graveyard-memory`: opt-in `localStorage` persistence (Requirement 10), re-attaching answers whose id changed (Requirement 11), "Forget everything" (Requirement 12), "Bury after all" and "Unbury" on Earlier records, the "From an earlier statement" notes, and the storage lint rule.
- Asking the user for the cadence of a guessed subscription. A guessed subscription can be buried, but its saving is shown as unknown and left out of every total (Requirement 5.6).

### Notes taken over from earlier specs

- Ids are not always stable (subscription-detector Introduction and Requirement 8; subscription-classifier Requirement 6.5). On a key shared by several subscriptions of one cadence, such as `APPLE.COM/BILL`, the id holds `currentAmountCents`, so a price change gives a new id: Apple Music going from `1099` to `1199` changes `sub:USD:monthly:1099:…` to `sub:USD:monthly:1199:…`. In this spec such an answer stays as an Earlier record and the new id rises again; re-attach is deferred to `graveyard-memory`.
- Classifier results share `charges`, `priceHistory`, `evidence` and `cancel` with the detector output by reference (subscription-classifier design decision 1). The UI SHALL NOT mutate a `Subscription`, a `ClassifiedSubscription` or any nested value.
- A guessed subscription (`evidence.cadenceAssumed: true`) has a cadence and yearly cost guessed from one charge. Its yearly cost SHALL NOT count towards a saving (subscription-detector Requirement 9.8). Its Answer record has `yearlySavingCents: null` and is left out of every total (Requirement 5.6, 6.3).
- `status: "ended"` subscriptions never get the `zombie` label (subscription-classifier Requirement 5.3). They do not rise (Requirement 2.2).

---
## Glossary

- **Page**: The Zombills page of `@zombills/web` at the site root. It was the vertical-slice Page; this spec changes its `results` and `no-subscriptions` states and adds the Rising and the Graveyard view.
- **Spike**: The art spike in `apps/web/src/spike` (`BurialSpike` and the components it uses).
- **Pipeline**, **Analyzer**, **Analysis outcome**, **Page state**, **Statement source**, **Sample**, **Money formatter**, **Counted subscription**, **Currency total**, **Assumed values**: As defined in the vertical-slice spec. The Analyzer already returns `ClassifiedSubscription[]` (subscription-classifier Requirement 9.1).
- **Usage answer**: `"still-using"` or `"not-using"` (subscription-classifier `UsageAnswer`).
- **Cadence factor**: `52` weekly, `12` monthly, `1` yearly (`money.md`).
- **Risen subscription**: A subscription of the current Analysis outcome with `status: "active"`. Only Risen subscriptions get a card.
- **Ended subscription**: A subscription of the current Analysis outcome with `status: "ended"`.
- **Answer record**: What the Page keeps for one answered subscription:

  ```ts
  type AnswerRecord = {
    id: string;                 // Subscription.id when answered
    merchant: string;           // display name
    currency: string;           // ISO 4217
    cadence: Cadence;           // Subscription.cadence (the detector's, possibly guessed)
    currentAmountCents: number;
    answer: UsageAnswer;
    cadenceAssumed: boolean;    // Subscription.evidence.cadenceAssumed when answered or refreshed
    yearlySavingCents: number | null; // yearlyCostCents; null when cadenceAssumed (saving unknown)
  };
  ```

  It holds no transaction, charge date, price history, description text or evidence. It lives in memory only.

  *(Note, cancel-helper Req 9: the record also holds `serviceId: string | null`, the Subscription's Known service id or `null`.)*
- **Graveyard**: The list of Answer records the Page holds, at most one per `id`, in the order the answers were first given.
- **Tombstone**: An Answer record with `answer: "not-using"`. Each one is shown as a tombstone.
- **Kept record**: An Answer record with `answer: "still-using"`.
- **Current record**: An Answer record whose `id` is the id of a subscription in the current Analysis outcome.
- **Earlier record**: An Answer record that is not a Current record (answered for an earlier statement in the same page session).
- **Answers map**: The `ReadonlyMap<string, UsageAnswer>` built from the Current records and passed to `classifySubscriptions`.
- **Savings totals**: For each currency, the sum of `yearlySavingCents` of the Tombstones in that currency whose `yearlySavingCents` is not `null`.
- **Queue**: The Risen subscriptions with no Current record, in Rising order (Requirement 2.3), as changed by "Skip for now" and "Answer now".
- **Display name**: The `merchant` of a subscription or record. WHEN another Risen subscription or Answer record shown on the Page has the same `merchant`, the Display name SHALL be `<merchant>, <amount> a <week|month|year>` with `currentAmountCents` and `cadence`, for example "Apple payment (merchant not shown), $0.99 a month". Headings, tombstone text, list items and accessible names SHALL use the Display name. *(Amended after design review 1:)* WHEN two Display names are still equal after this rule, including a `merchant` that equals another item's long form, each name after the first SHALL get the suffix " (2)", " (3)" … in Graveyard-then-Rising order, so that every Display name on the Page is distinct.
- **Burial sequence**: The card sinks, the earth closes and the tombstone rises (Spike phases `condemned` → `sinking` → `closing` → `buried`).

---

## Requirements

### Requirement 1: The haunted page, its entry and the retired spike

**User Story:** As a user, I want to land on the graveyard and drop my statement in the same way as before, so that the haunted look adds meaning without taking away anything that already works.

#### Acceptance Criteria

1. THE Page SHALL be shown at the site root on the Spike's night scene: the sky, moon and fog layers (`BackdropLayers`, `ForegroundFog`) and the `Ground`, with the main heading "Zombills" in IM Fell English and the line "Your bank statement is haunted." in every Page state.
2. THE Page SHALL keep, unchanged in behaviour, vertical-slice Requirements 2 (drop area, file button, Samples, drag-over text, drops outside the drop area, keyboard-operable drop area), 3 (Analyzer, byte decoding, the paint before analysis), 4 (Page states, file checks, every error message, "Start again", a new statement replacing the current one), 6 (Money formatter) and 9 (static build, except 9.5's "including `#spike`", which Requirement 1.8 replaces). Their existing tests SHALL keep passing, changed only where this spec changes the `results` and `no-subscriptions` content.
3. WHILE the Page is in the `idle` state, THE Page SHALL show the drop area, the file button, the Sample buttons and the vertical-slice sentence that the statement stays on the device and that 2 to 3 months give the best results.
4. WHILE the Page is in the `working` or `error` state, THE Page SHALL show the vertical-slice content for that state on the night scene, on a `--fog` surface that meets WCAG AA.
5. WHEN the Analyzer returns `"no-subscriptions"`, THE Page SHALL show the heading "No undead here." followed by the vertical-slice text of vertical-slice Requirement 4.7 and "Start again".
6. WHEN the Analyzer returns `"results"`, THE Page SHALL show the statement summary of vertical-slice Requirement 5.1 and 5.1a (source name, `firstDate` to `lastDate`, transactions read, rows skipped, Assumed values as text), then the Rising summary, then the Rising (Requirement 2). The plain subscription list (`ResultsView`, `SubscriptionItem`) SHALL no longer be shown.
6a. THE Rising summary SHALL show one line per currency that has a Currency total (vertical-slice Requirement 5.7), in the order of `StatementInfo.currencies`: "Still draining <amount> a year", with the amount by the Money formatter, in `--blood` as large text (at least 24 px, or at least 18.66 px bold). The amount (the Still-draining figure) SHALL be, per currency, the vertical-slice Currency total minus the Counted savings: the sum of `yearlySavingCents` of the Current records with `answer: "not-using"` in that currency whose subscription is a Counted subscription (so `yearlySavingCents` is not `null`; guessed burials subtract nothing). It SHALL be an integer in minor units and never negative (clamped at `0`). Burying a Counted subscription SHALL lower it by exactly the amount the savings counter rises, and "Unbury" SHALL raise it back by the same amount. WHEN a currency has any subscription that is not a Counted subscription, the vertical-slice note that ended and guessed subscriptions are not included SHALL follow its line. The live-region announcement of vertical-slice Requirement 8.3 SHALL use the same Still-draining figures. Examples (`us-signed.csv`, en-US): before any answer, "Still draining $1,355.64 a year"; after burying Netflix (`21588`), "Still draining $1,139.76 a year" ($1,355.64 − $215.88) with the counter at "$215.88"; after "Unbury", "Still draining $1,355.64 a year" again.
6b. *(PBT: still draining)* FOR ALL Currency totals and FOR ALL Graveyards of Current records drawn over the same subscriptions and sequences of bury, keep and unbury actions, for every currency with a Currency total: the Still-draining figure plus the Counted savings SHALL equal the Currency total; the Still-draining figure SHALL be a non-negative integer; and burying then unburying a Counted subscription SHALL leave it unchanged.
7. THE Spike components SHALL be moved out of `apps/web/src/spike` into the Page's own component folder and take their data from props instead of `spike-data.ts`. After the move, `BurialSpike.tsx`, `spike-data.ts`, `apps/web/src/routing/spike-view.tsx` and the `apps/web/src/spike` folder SHALL be deleted, and nothing SHALL import from them.
8. THE `#spike` address SHALL be retired: the site SHALL show the Page for every URL hash, including `#spike`, and the Page SHALL NOT link to `#spike`. The hash router (`use-hash-route.ts`) SHALL be removed with its test, since the site then has one view. This replaces vertical-slice Requirement 1.2 to 1.5 and Requirement 10.4.
9. THE Page SHALL switch between the Rising and the Graveyard view (Requirement 7) with React state only. It SHALL NOT write the view, an answer or any subscription value to the URL.
10. Every screen SHALL have a designed default, processing, empty and error state (`spooky-design.md`):

    | Screen | Default | Processing | Empty | Error |
    | --- | --- | --- | --- | --- |
    | Gate (`idle`) | drop area and Samples | `working`: `Reading <name>…` | n/a (default is the empty state) | vertical-slice error states |
    | Rising | one undead card | Burial sequence | no Risen subscriptions (Requirement 2.2) | not reachable: an Analyzer error is a Page `error` |
    | Graveyard | tombstones, total, kept list | n/a (no async work) | "Nothing buried yet." (Requirement 7.6) | n/a (no storage or async work in this spec) |

    *(Note: changed by `graveyard-memory` Requirement 9.6: the Gate (`idle`) row gains the restored line and the load notes, and the Graveyard row gains the Memory panel, with its storage error notes, so the Graveyard row is no longer "n/a (no storage or async work)".)*

### Requirement 2: The Rising (one card at a time)

**User Story:** As a user with many subscriptions, I want them to rise one by one, biggest first, with a clear count of what is left, so that I can answer each one without losing track.

#### Acceptance Criteria

1. WHEN the Page enters the `results` state, THE Page SHALL show the first subscription of the Queue as an undead card (Requirement 3) rising from the ground, and above it a progress line `<answered> of <risen> answered`, where `<risen>` is the number of Risen subscriptions and `<answered>` the number of them with a Current record.
2. WHEN the outcome has no Risen subscription (every subscription is an Ended subscription), THE Page SHALL show the heading "No undead here." and the text "Every recurring charge found has already stopped.", with no card, and the Ended list of Requirement 7.5.
3. THE Rising order SHALL be: Risen subscriptions grouped by currency in the order of `StatementInfo.currencies`, and within each currency the order of vertical-slice Requirement 5.2 (Counted subscriptions first, then guessed ones; by `yearlyCostCents` descending, then `merchant` in code-unit order, then `id`). Example (`us-signed.csv`): Adobe Creative Cloud, Riverside Gym Membership, Netflix, Spotify.
4. THE card SHALL show the control "Skip for now". WHEN it is activated, THE Page SHALL move that subscription to the end of the Queue without recording an answer and show the next card. WHEN the Queue holds only that subscription, "Skip for now" SHALL NOT be shown.
5. WHEN the user has answered a card and its outcome is shown (Requirement 4.3, 5.5), THE Page SHALL show a "Next" button. WHEN it is activated, THE Page SHALL show the first subscription of the Queue. WHEN the Queue is empty, the button SHALL read "Visit the graveyard" and open the Graveyard view.
6. THE Page SHALL show an "Open the graveyard" control in the Rising at all times, which opens the Graveyard view (Requirement 7) without answering the current card. Returning to the Rising (Requirement 7.8) SHALL show the first subscription of the Queue, or the "all answered" state of Criterion 7.
7. WHEN the Queue is empty and no Burial sequence is running, THE Rising SHALL show "Every undead has an answer." with the "Visit the graveyard" button.
8. WHEN a new Analysis outcome replaces the current one, THE Queue SHALL be rebuilt from the new outcome after the refresh of Requirement 9.5: subscriptions that already have a Current record SHALL NOT rise again.
9. *(PBT: Queue)* FOR ALL lists of Risen subscriptions with distinct ids, FOR ALL sets of Current records and FOR ALL sequences of "Skip for now" and "Answer now" actions, the Queue SHALL contain exactly the Risen subscriptions with no Current record, each once; "Skip for now" SHALL change only the position of the skipped subscription (to the end); "Answer now" SHALL change only the position of its subscription (to the front); and with no actions the Queue SHALL follow the Rising order of Criterion 3.

### Requirement 3: The undead card

**User Story:** As a user, I want each card to tell me what the charge is, what it costs me a year and why it was flagged, so that I can decide whether I still use it.

#### Acceptance Criteria

1. THE undead card SHALL be the Spike's `UndeadCard` look (fog surface, sway, state label, two answer buttons), fed by one `ClassifiedSubscription` from `classifySubscriptions(outcome.subscriptions, answersMap)` (Requirement 9.3). It SHALL be a labelled region (`section` with `aria-labelledby` its merchant heading).
2. THE card SHALL show, as text: the Display name as its heading; the cadence word from `CADENCE_LABELS` ("Weekly", "Monthly", "Yearly"); `currentAmountCents` with its currency; `yearlyCostCents` with its currency, labelled "a year" and shown in `--blood` as large text (at least 24 px, or at least 18.66 px bold), the still-draining figure; and the question "Still using this?". Money SHALL use the Money formatter in the subscription's `currency`, with tabular figures.
3. THE card SHALL show one state label with an icon and a word, never colour alone: "Undead" (open-eye icon) before an answer, "Zombie" (shovel icon) WHEN the classified `labels` contain `"zombie"`, and "Resting" (closed-eye icon) after "Yes, let it rest". The "Zombie" label SHALL come from the classifier's `labels`, not from a separate flag.
4. WHEN `labels` contain `"possessed"`, THE card SHALL show a "Possessed" label with its own icon and the word, in `--ember`, and below it the price-rise sentence produced by the existing `priceRiseParts` (subscription-classifier Requirement 9.3). Example (`us-signed.csv`, en-US): `Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)`.
5. WHEN `labels` contain `"trial-trap"`, THE card SHALL show a "Trial trap" label with its own icon and the word, in `--spectre`, and below it the sentence produced by the existing `trialParts` (subscription-classifier Requirement 9.4). Example (en-US, intro charge only): `Intro price ended on 10 Feb 2026 ($1.00 on 10 Jan 2026, then $14.99)`. WHEN both labels apply, the possessed label and sentence SHALL come first.
6. WHEN `priceHistory` has more than one entry, THE card SHALL show every entry as date and amount, oldest first, in a list named "Price history" (vertical-slice Requirement 5.4).
7. WHEN `evidence.cadenceAssumed` is `true`, THE card SHALL say "Guessed from a single charge" and show the yearly cost as "about <yearly> a year (estimate)", as the slice does (vertical-slice Requirement 5.6).
8. THE card SHALL show the line "Seen since <date>", with `<date>` the first Series charge date (`charges[0].date`, by `formatDisplayDate`) and, WHEN `evidence.startedInStatement` is `false`, the words "at least": "Seen since at least 2 Jan 2026". The card copy SHALL state only facts from the statement and SHALL NOT claim usage ("unopened", "forgotten", "last used").
9. THE card SHALL NOT show logos or brand assets; service names are text only.
10. THE card SHALL fit a single column at widths up to 640 px with no horizontal scrolling at 320 px, and every new text and background pair (including `--ember`, `--spectre` and `--blood` on the card surface, with `--blood` tested at the large-text threshold of 3:1 since it is only used as large text) SHALL meet WCAG AA and be added to `apps/web/src/contrast.test.ts`.

### Requirement 4: "Yes, let it rest" (keep)

**User Story:** As a user, I want to keep a subscription I still use without any fuss, so that the app never shames me for it.

#### Acceptance Criteria

1. THE card SHALL have the button "Yes, let it rest" with the closed-eye icon.
2. WHEN it is activated, THE Page SHALL add or replace the Answer record for that subscription with `answer: "still-using"` (Requirement 9.1).
3. THE card SHALL then settle (Spike `resting` phase), its state label SHALL change to "Resting", and the outcome text SHALL be "Kept. It rests." followed by "It goes on charging <amount> a <week|month|year>." with the subscription's `currentAmountCents` and cadence. WHEN `evidence.cadenceAssumed` is `true`, the second sentence SHALL be "It goes on charging <amount> (how often is a guess)." Focus SHALL move to the outcome text.
4. Keeping SHALL NOT change the Savings totals.
5. Example (`us-signed.csv`, en-US): keeping Adobe Creative Cloud shows "Kept. It rests." and "It goes on charging $54.99 a month.", the progress line becomes "1 of 4 answered" and the counter stays at "$0.00".

### Requirement 5: "No, bury it" and the Burial sequence

**User Story:** As a user, I want to bury a subscription I no longer use and watch it go into the ground, so that my decision feels final and I can see what it saves.

#### Acceptance Criteria

1. THE card SHALL have the button "No, bury it" with the shovel icon.
2. WHEN it is activated, THE Page SHALL add or replace its Answer record with `answer: "not-using"`, `cadenceAssumed` from `evidence.cadenceAssumed` and `yearlySavingCents` = its `yearlyCostCents` (or `null` for a guessed subscription, Criterion 6), re-classify (Requirement 9.3) so its `labels` gain `"zombie"`, and start the Burial sequence.
3. THE Burial sequence SHALL follow the Spike: the state label changes to "Zombie"; the card shudders, sinks below the ground line (ease-in, about 600 ms) while earth crumbs fall; the burial mound closes; the tombstone rises in the card's place (Requirement 6). WHILE it runs, the answer buttons, "Skip for now" and "Next" SHALL be `aria-disabled` and ignore activation. WHEN it starts, focus SHALL move to the stage container, an element that stays mounted for the whole sequence, with `tabIndex={-1}` and the accessible name "Burying <Display name>".
4. THE answer SHALL be recorded when the button is activated, not when the animation ends. WHEN the Page leaves the Rising during the Burial sequence (a new statement, "Start again", or "Open the graveyard"), the Answer record SHALL stay.
5. WHEN the tombstone has risen, THE Page SHALL move focus from the stage container to the tombstone and show "Next" (Requirement 2.5), and the savings counter SHALL count up to the new total (Requirement 6.4).
6. WHEN "No, bury it" is activated on a guessed subscription (`evidence.cadenceAssumed: true`), THE Page SHALL bury it like any other (Criterion 2 to 5) with `yearlySavingCents: null`. Its tombstone SHALL say "Saving unknown: guessed from one charge" in place of "Saves <amount>/year.", and it SHALL add nothing to the Savings totals or the counter (subscription-detector Requirement 9.8). The Page SHALL NOT ask for the cadence and SHALL NOT change the Subscription or its `evidence`.
7. THE burial copy SHALL NOT say the subscription was cancelled. Until the cancel-helper spec exists, the tombstone SHALL carry the line "Cancel it with the provider to stop the charges." *(Note, cancel-helper: the tombstone's last line is now the one in cancel-helper Req 7.1.)*
8. Examples (`us-signed.csv`, en-US):

   | Action | Answer record | Savings totals |
   | --- | --- | --- |
   | bury Netflix | `{ id: "sub:USD:monthly:*:netflix", answer: "not-using", cadenceAssumed: false, yearlySavingCents: 21588, … }` | USD `21588` ("$215.88") |
   | then bury Spotify | adds `sub:USD:monthly:*:spotify`, `yearlySavingCents: 13188` | USD `34776` ("$347.76") |
   | then bury a hand-built guessed Amazon Prime charge of `13900` (guessed `"monthly"`, `yearlyCostCents` `166800`) | `cadenceAssumed: true`, `yearlySavingCents: null`; tombstone "Saving unknown: guessed from one charge" | unchanged, USD `34776` |

### Requirement 6: Tombstones and the savings counter

**User Story:** As a user, I want a tombstone that says what each burial saves and a running total at the top, so that I can see my progress after every decision.

#### Acceptance Criteria

1. THE tombstone SHALL be the Spike's `Tombstone` look, fed by one Tombstone (Answer record). It SHALL be a labelled region whose name is "Here lies <Display name>." and SHALL show, as text: "Here lies <Display name>."; "Fed on you every <week|month|year>." using `cadence`; "Saves" and `yearlySavingCents` in `--moss` with "/year." (or, WHEN `yearlySavingCents` is `null`, "Saving unknown: guessed from one charge"); and the line of Requirement 5.7. Example (`us-signed.csv`, en-US): "Here lies Netflix.", "Fed on you every month.", "Saves $215.88/year."
2. THE savings counter SHALL be the Spike's `SavingsCounter` look, in the page header, labelled "Saved per year". It SHALL show one line per currency that has at least one Tombstone with a non-null `yearlySavingCents`, each with the currency's Savings total formatted by the Money formatter in that currency, ordered by currency code in code-unit order. WHEN there are no such Tombstones, it SHALL show `formatMoney(0, c)` for the first currency of the current statement (`StatementInfo.currencies[0]`), or nothing WHEN no statement has been analysed.
3. THE Savings totals SHALL never add amounts of different currencies, never convert between currencies, never show a grand total across currencies (`money.md`), and never include a Tombstone whose `yearlySavingCents` is `null`.
4. WHEN a Savings total goes up, its figure SHALL count up from the old to the new value as a Framer Motion tween of about 800 ms, showing whole minor units only (the tween value rounded with `Math.round`). WHEN it goes down ("Unbury", Requirement 8.1), it SHALL jump to the new value. The figure SHALL be `aria-hidden` and a visually hidden text SHALL hold the final value, so screen readers never hear the count.
5. THE Savings totals SHALL include every Tombstone in the Graveyard, Current and Earlier records alike (an Earlier record is a burial from an earlier statement in the same page session).
6. IF a Savings total would not be a safe integer, THEN THE totals function SHALL throw a `RangeError`. The Pipeline's bounds keep real totals far below this; a unit test SHALL cover it with two Tombstones of `Number.MAX_SAFE_INTEGER`.
7. *(PBT: savings totals)* FOR ALL Graveyards of at most 1,000 Answer records with currencies drawn from at least three codes, `yearlySavingCents` safe non-negative integers at most `999_999_9900 × 52` or `null`, and both answers: the Savings totals SHALL have exactly one entry per currency with at least one Tombstone whose `yearlySavingCents` is not `null`; each SHALL equal the exact integer sum of the non-null `yearlySavingCents` of the Tombstones in that currency; Kept records and `null` savings SHALL add nothing; and no entry SHALL include an amount from another currency.
8. Examples: no Tombstones after the US Sample: "$0.00". Netflix (USD `21588`) buried from `us-signed.csv`, then the UK Sample analysed and its Netflix (GBP `15588`) buried: two lines, "£155.88" then "$215.88" (code order `GBP`, `USD`).

### Requirement 7: The Graveyard view

**User Story:** As a user, I want one place that shows everything I buried, what it saves me per year, and what I kept, so that I can see the payoff and change my mind.

#### Acceptance Criteria

1. THE Graveyard view SHALL have the heading "Your graveyard" and, WHEN at least one Tombstone exists, one line per currency "You buried <total> a year." with that currency's Savings total, in the order of Requirement 6.2.
2. THE Graveyard view SHALL show every Tombstone as a tombstone (Requirement 6.1, in a smaller size), in Graveyard order, as a semantic list. Each Current record SHALL have an "Unbury" button (Requirement 8). Earlier records SHALL have no change control in this spec.
3. THE Graveyard view SHALL list the Kept records under the heading "Resting" as a plain list with no animation or highlight colour: Display name, cadence, amount and "a year" cost. Each Current record SHALL have a "Bury after all" button (Requirement 8).
4. THE Graveyard view SHALL list the Queue under the heading "Not answered yet": Display name and yearly cost, each with an "Answer now" button that moves that subscription to the front of the Queue and returns to the Rising with its card shown.
5. THE Graveyard view SHALL list Ended subscriptions of the current outcome under the heading "Already stopped" as a plain list: Display name and "last charged <date>" (`evidence.lastChargeDate`), with no answer controls. An Ended subscription with a Current record SHALL be shown only in the list its record belongs to.
6. WHEN the Graveyard has no Tombstone, THE Graveyard view SHALL show "Nothing buried yet." in place of the tombstones and the total.
7. *Deferred to `graveyard-memory`* (notes for Earlier and carried-over records). *(Note: changed by `graveyard-memory` Requirements 5 and 7: the note "From an earlier statement" and the carried-over note are specified there.)*
8. THE Graveyard view SHALL have a "Back to the rising" button WHEN a statement has been analysed.
9. WHEN the Graveyard view opens, focus SHALL move to its heading.
10. THE Graveyard view SHALL stack to a single column at widths up to 640 px with no horizontal scrolling at 320 px.

### Requirement 8: Changing an answer

**User Story:** As a user who changed my mind, I want to unbury a subscription or bury one I kept, so that my graveyard matches what I really decided.

#### Acceptance Criteria

1. WHEN "Unbury" is activated on a Current record, THE Page SHALL set its `answer` to `"still-using"`, re-classify so `"zombie"` leaves its `labels`, and move it to the Resting list. The Savings totals SHALL drop by its `yearlySavingCents` (nothing WHEN it is `null`).
2. *Deferred to `graveyard-memory`* ("Unbury" on an Earlier record). *(Note: changed by `graveyard-memory` Requirement 7: "Unbury" on an Earlier record is specified there.)*
3. WHEN "Bury after all" is activated on a Kept Current record, THE Page SHALL set its `answer` to `"not-using"` and run Requirement 5 (with `yearlySavingCents: null` WHEN the subscription is guessed, Requirement 5.6), with the tombstone rising in the Graveyard view and the counter counting up. "Bury after all" on an Earlier record is deferred to `graveyard-memory`. *(Note: changed by `graveyard-memory` Requirement 7: "Bury after all" on an Earlier record is specified there.)*
4. After a change, focus SHALL move to the changed item in its new list, and the live region SHALL announce it (Requirement 14.3).
5. A change SHALL NOT change the Answer records of other subscriptions.
6. Example (`us-signed.csv`, en-US): bury Netflix and Spotify (USD `34776`), then "Unbury" Netflix: the total becomes `13188` ("$131.88"), Netflix is listed under "Resting" with "Bury after all", and Netflix's card would show "Resting".

### Requirement 9: Answer records and classification

**User Story:** As the Page, I want one pure module that holds the user's answers and turns them into classifier input and savings, so that labels, tombstones and totals always agree.

#### Acceptance Criteria

1. THE Graveyard logic SHALL be pure TypeScript in `apps/web` (no React, DOM, storage, clock, randomness or logging) and SHALL provide at least: recording an answer for a subscription, changing an answer (Requirement 8), building the Answers map, refreshing records for a new Analysis outcome (Criterion 5), the Queue (Requirement 2.9), the Display names (Glossary) and the Savings totals (Requirement 6). Each function SHALL return new values and SHALL NOT mutate its arguments or any `Subscription` value reachable from them.
2. Recording an answer for a subscription whose `id` already has a record SHALL replace that record in place (same position); otherwise it SHALL append a new record. The Graveyard SHALL never hold two records with the same `id`.
3. THE Page SHALL classify with `classifySubscriptions(outcome.subscriptions, answersMap)` from `@zombills/core`, recomputed whenever the outcome or the Graveyard changes, and SHALL take every label it shows (including "Zombie") from that result.
4. THE Answers map SHALL hold exactly one entry per Current record, `id → answer`, and no entry for an Earlier record.
5. WHEN a new Analysis outcome arrives, every Current record SHALL be refreshed from its subscription: `merchant`, `currency`, `cadence`, `currentAmountCents` and `cadenceAssumed` from the subscription, and `yearlySavingCents` = `yearlyCostCents`, or `null` WHEN the subscription is guessed. Exception: WHEN the subscription is guessed and the record has `cadenceAssumed: false` (the answer was given while a fuller statement showed it as not guessed), THE Page SHALL remove the record, so the subscription is unanswered, joins the Queue and rises again. Earlier records SHALL stay unchanged. *(Note, cancel-helper Req 9.2: a refresh also copies `serviceId`.)*
6. A Tombstone whose subscription is now an Ended subscription SHALL be shown as a regular tombstone, and its saving still counts (Requirement 6.5). The classifier gives it no `zombie` label (subscription-classifier Requirement 5.3).
7. THE Graveyard SHALL live in memory for the page session only: it SHALL survive a new statement and "Start again", and SHALL be lost on reload. THE Page SHALL NOT write it to any storage. "Start again" SHALL still drop the statement text and Analysis outcome (vertical-slice Requirement 7.5). *(Note: changed by `graveyard-memory` Requirement 10.2: the Graveyard is lost on reload unless Memory is on, and the Page may write the Stored graveyard, and nothing else, to the Store key while Memory is on.)*
8. *(PBT: answers)* FOR ALL Graveyards, subscriptions and sequences of record, change and refresh actions: the Graveyard SHALL hold at most one record per `id`; the last answer given for an `id` SHALL be its record's answer; recording the same answer twice SHALL equal recording it once; "Unbury" followed by "Bury after all" on a Current record SHALL restore a record deeply equal to the buried one; the Answers map keys SHALL be exactly the ids of Current records; `yearlySavingCents` SHALL be `null` exactly when `cadenceAssumed` is `true`, and otherwise equal `currentAmountCents × Cadence factor(cadence)`; after a refresh, no record with `cadenceAssumed: false` SHALL name a guessed subscription, and every such subscription that is a Risen subscription SHALL be in the Queue; and the inputs (deep-frozen in the test) SHALL be unchanged.
9. *(PBT: classifier agreement)* FOR ALL subscription lists from the web test arbitraries (`apps/web/src/slice/logic/test-arbitraries.ts`, since web tests import only the public `@zombills/core` entry, vertical-slice Requirement 9.1) and FOR ALL action sequences, a subscription's classified `labels` SHALL contain `"zombie"` exactly when it is active and has a Current record with `answer: "not-using"`.

### Requirement 10: Opt-in persistence

*Deferred to `graveyard-memory`.* In this spec the Graveyard is never written to any storage (Requirement 9.7, 15.2). Findings carried over: see "Hand-off to graveyard-memory". *(Note: changed by `graveyard-memory` Requirements 1 to 5 and 10: opt-in persistence is specified there.)*

### Requirement 11: Re-attaching answers when ids change

*Deferred to `graveyard-memory`.* In this spec an answer whose id is not in a new outcome stays as an Earlier record, and the subscription with the new id rises again. Findings carried over: see "Hand-off to graveyard-memory". *(Note: changed by `graveyard-memory` Requirement 11 (Phase B): re-attach is specified there.)*

### Requirement 12: "Forget everything"

*Deferred to `graveyard-memory`.* With no storage, a reload already forgets everything. *(Note: changed by `graveyard-memory` Requirement 8: "Forget everything" is specified there.)*

### Requirement 13: Motion and reduced motion

**User Story:** As a user who is sensitive to motion, I want the same story told with simple fades, so that I can still see what was buried and what it saves.

#### Acceptance Criteria

1. All motion SHALL use Framer Motion, with the values of `spooky-design.md`: card rise spring (`stiffness: 120, damping: 14`), sink ease-in about 600 ms, tombstone rise spring (`stiffness: 80, damping: 12`), fog drift 20 to 40 s loops that never cover text, counter tween about 800 ms. No CSS `@keyframes` SHALL drive state-driven motion.
2. WHEN `useReducedMotion()` is `true`, THE Page SHALL change only `opacity`, each change at most 150 ms: the card fades in; on bury it fades out (the `condemned` shudder and the crumbs are skipped); the mound and the tombstone fade in; the fog does not drift; the counter shows the new figure with a fade instead of counting; "Resting" settles with no movement.
3. With reduced motion the burial SHALL still be understandable without motion: the state label reads "Zombie" before the card fades, the tombstone text "Here lies <Display name>." and its saving line appears, the live region announces it (Requirement 14.3), and focus moves to the tombstone.
4. The fog SHALL use the Spike's single on/off `fogCleared`: fog layer opacity `1` while the Graveyard has no Tombstone, and `0.45` once it has at least one, as an opacity change in both motion modes.
5. No content SHALL flash, strobe or cycle colours, and the Page SHALL play no sound.
6. The Burial sequence SHALL end through animation-complete callbacks with a fallback timer of 2 s, so a skipped or interrupted animation (for example a background tab) cannot leave the card stuck with disabled buttons.

### Requirement 14: Accessibility

**User Story:** As a keyboard or screen-reader user, I want to answer every card and hear each result, so that the haunted flow works for me too.

#### Acceptance Criteria

1. Every control (answer buttons, "Skip for now", "Next", "Open the graveyard", "Visit the graveyard", "Back to the rising", "Unbury", "Bury after all", "Answer now", and every vertical-slice control) SHALL be reachable and operable with the keyboard alone in a logical Tab order, with the `--moss` focus ring at a 2px offset, and SHALL have an accessible name. "Unbury", "Bury after all" and "Answer now" SHALL include the Display name in their accessible name (for example "Unbury Netflix", or "Unbury Apple payment (merchant not shown), $0.99 a month" WHEN two Apple subscriptions are shown). No two controls shown at the same time SHALL have the same accessible name.
2. WHEN a card appears, focus SHALL move to its heading WHEN the user caused it ("Next", "Skip for now", "Answer now", entering `results`); after an answer, focus SHALL move to the outcome (Requirement 4.3), or during a burial to the stage container and then the tombstone (Requirement 5.3, 5.5). Focus SHALL never be left on a removed element. WHILE the Page is `working`, the file button and the Sample buttons SHALL be `aria-disabled="true"` and ignore activation, not carry the HTML `disabled` attribute, so the Sample button the user clicked keeps focus. *(Note, cancel-helper Req 8.2: the Helper panel sits between the stage tombstone and "Next" in DOM and tab order on purpose.)*
3. THE Page SHALL keep one polite live region and announce, in addition to vertical-slice Requirement 8.3 (whose Currency totals are replaced by the Still-draining figures of Requirement 1.6a): a new card ("<Display name>. <cadence>, <amount>. <yearly> a year. Still using this?", followed by each label sentence); a keep ("<Display name> rests. Kept."); a burial ("<Display name> is buried. Saves <saving> a year. Saved per year: <totals>.", or "<Display name> is buried. Saving unknown: guessed from one charge." WHEN `yearlySavingCents` is `null`); and an unbury ("<Display name> is unburied and rests."). Example (`us-signed.csv`, en-US): "Netflix is buried. Saves $215.88 a year. Saved per year: $215.88.", after which the vertical-slice totals announcement says "Still draining $1,139.76 a year".
4. Decorative art (sky, moon, fog, ground, mound, crumbs, stone drawing) SHALL be `aria-hidden`. All meaning SHALL be in text: state labels, data labels, tombstone text and money figures.
5. Labels SHALL never be colour-only: "Undead", "Zombie", "Resting", "Possessed" and "Trial trap" each have an icon and a word.
6. THE Page SHALL meet WCAG AA contrast for every text and background pair it uses, including text over the night scene, checked in `apps/web/src/contrast.test.ts`.
7. THE layout SHALL be a single column at widths up to 640 px, spacing on the 8 px grid, and money figures always text in Inter with tabular figures.

### Requirement 15: Privacy and changes to the vertical-slice spec

**User Story:** As the Zombills privacy contract, I want the haunted page to keep every rule of the slice, so that statement data still never leaves the browser and nothing is stored.

#### Acceptance Criteria

1. Vertical-slice Requirement 7.1, 7.2, 7.4, 7.5, 7.6 and 7.7 SHALL keep holding: no request other than same-origin `GET`s for static files in `dist`; no third-party request; no `console`, `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` or `EventSource` in `apps/web/src` outside tests; the same build-time CSP; `assetsInlineLimit: 0`; no preload polyfill. New art SHALL be inline SVG or files in `dist`; no font, image or script SHALL come from another host.
2. Vertical-slice Requirement 7.3 SHALL keep holding unchanged: THE Page SHALL NOT write statement text, transactions, Answer records or any value derived from them to `localStorage`, `sessionStorage`, IndexedDB, the Cache API, cookies or the URL. *(Note: changed by `graveyard-memory` Requirement 10.2: while Memory is on, the Store key in `localStorage` holds the Stored graveyard, and nothing else.)*
3. The vertical-slice `requirements.md` SHALL get notes, each saying this spec changed it: in Requirement 1, that `#spike` and the hash switch are retired (Requirement 1.8); in Requirement 5, that the plain list is replaced by the Rising and the Graveyard view, with its ordering, grouping and totals logic kept and the Currency totals shown as "Still draining <amount> a year" after subtracting Counted savings (Requirement 1.6a); in Requirement 8.1, that the spike link is gone; in Requirement 9.5, that "including `#spike`" no longer applies; in Requirement 10.4 and 10.5, the changed tests (Requirement 16); and in its Introduction's out-of-scope list, that `zombie`, "Still using this?", Keep / Bury, tombstones and the graveyard are now in scope.
4. THE `privacy-guard` hook and the `no-network` scans SHALL keep passing with no new exception.

### Requirement 16: Tests

**User Story:** As the team, I want the haunted flow covered by property, component and browser tests, so that the demo path cannot break silently before judging.

#### Acceptance Criteria

1. Pure logic SHALL have unit tests and the property tests marked *(PBT)* in this spec, in `.property.test.ts` files next to their source, with fast-check's default 100 runs: Queue (Requirement 2.9), still draining (1.6b), Savings totals (6.7), answers (9.8, including the refresh rule of 9.5) and classifier agreement (9.9). Unit tests SHALL cover every example table in Requirements 5.8, 6.8 and 8.6, the `RangeError` of Requirement 6.6, and the Display name rule (Glossary) with two Apple subscriptions of the same `merchant`.
2. Component tests (Vitest, jsdom, Testing Library, `userEvent`) SHALL render the Page with the `us-signed.csv` Sample and cover:
   - the Rising summary "Still draining $1,355.64 a year" and the first card, Adobe Creative Cloud with "Monthly", "$54.99", "$659.88" a year and "Still using this?", and the progress line "0 of 4 answered";
   - the Netflix card shows "Possessed" and `Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)`; a hand-built trial-trap subscription shows "Trial trap" and its sentence; a hand-built subscription with both shows both, possessed first;
   - keep: "Kept. It rests.", the "Resting" label, the counter unchanged, focus on the outcome;
   - bury: the "Zombie" label, focus on the stage container named "Burying Netflix" while the sequence runs, then the tombstone "Here lies Netflix." with "Saves $215.88/year.", the counter's text value "$215.88", the Rising summary "Still draining $1,139.76 a year", the live-region text of Requirement 14.3, focus on the tombstone;
   - "Skip for now" moving a card to the end, and "Next" turning into "Visit the graveyard" at the end of the Queue while "Open the graveyard" stays a separate control;
   - a hand-built guessed subscription: keeping it shows "(how often is a guess)"; burying it shows "Saving unknown: guessed from one charge" and leaves the counter unchanged;
   - the Graveyard view: tombstones, "You buried $347.76 a year." after Netflix and Spotify, the Resting list, "Not answered yet" with "Answer now", "Already stopped", and "Nothing buried yet.";
   - "Unbury" and "Bury after all", with the totals of Requirement 8.6 and focus on the moved item;
   - no storage: no `getItem`, `setItem`, `removeItem` or `clear` call on a spied `localStorage` through the whole flow; analysing the Sample again after burying Netflix keeps its tombstone and Netflix does not rise; *(Note: changed by `graveyard-memory` Requirement 11.3: this check now renders `<App />` with the default empty load; the storage flows are tested there.)*
   - reduced motion (mocked `useReducedMotion`): the motion props use only `opacity`, and the burial still reaches the tombstone with its text and announcement;
   - the vertical-slice state tests (idle, working, every error, no-subscriptions with "No undead here.", the Windows-1252 file, "Start again") still passing with updated content assertions.
3. THE Spike route tests (`apps/web/src/routing/use-hash-route.test.ts` and the `#spike` tests in `apps/web/src/app.test.tsx`) SHALL be removed and replaced by one test that `#spike` shows the Page.
4. THE Playwright test `apps/web/e2e/demo-path.spec.ts` SHALL keep its CSP, request, console and storage checks and follow the demo path with `locale: "en-US"` and `timezoneId: "UTC"`: choose "US bank, signed amounts"; check "Still draining $1,355.64 a year"; keep Adobe Creative Cloud and Riverside Gym Membership with "Yes, let it rest"; check that the Netflix card shows the price-rise text of Requirement 3.4; activate "No, bury it"; check the tombstone "Here lies Netflix." with "Saves $215.88/year.", the counter "$215.88" and "Still draining $1,139.76 a year"; open the graveyard and check "You buried $215.88 a year."; check `localStorage.length` is `0`; then "Start again" returns to the drop area. It SHALL fail on any request that breaks Requirement 15.1 or any console output. *(Note: changed by `graveyard-memory` Requirement 11.4: the same file gains a second test for the memory path; this test, including `localStorage.length` `0` with Memory off, is unchanged.)*
5. THE root `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` SHALL pass, and the Playwright test SHALL pass with `npm run test:e2e --workspace @zombills/web`.

---

## Hand-off to graveyard-memory

The future spec `graveyard-memory` takes over Requirements 10 (opt-in persistence), 11 (re-attach) and 12 ("Forget everything"), "Unbury" and "Bury after all" on Earlier records (Requirements 7.7, 8.2, 8.3), and the storage lint rule. This spec folder is not committed yet, so the removed text is summarised here:

- **Persistence (old R10):** an unticked checkbox "Remember my graveyard on this device"; while unticked, no storage writes (one `getItem` on load allowed); ticking writes `{ "version": 1, "records": AnswerRecord[] }` to `localStorage` key `zombills.graveyard.v1` after every change; unticking removes the key; a pure, never-throwing reader with a strict validator; an invalid store is cleared with the note "Your saved graveyard could not be read, so it was cleared."; a throwing `localStorage` unticks with "This browser would not save your graveyard. It is kept until you close this page."; all storage access in one module enforced by ESLint; PBTs for round-trip and "reading never throws". Vertical-slice Requirement 7.3 then needs an amendment that allows Answer records, and only those, in that key.
- **Re-attach (old R11):** an Orphan record (id not in the new outcome) moves to the single Free subscription with the same `merchantKey`, `currency` and `cadence` (the Triple), marked `carriedOver: true` with the note "Answer carried over from an earlier statement"; ties stay Earlier records; the record needs `merchantKey` again.
- **Forget (old R12):** "Forget everything" with a "Forget" / "Cancel" confirmation (focus on "Cancel") that removes the key, empties the Graveyard and puts every Risen subscription back in the Queue.
- **Earlier records (old R7.7, R8.2, R8.3):** the note "From an earlier statement"; "Unbury" removes an Earlier record; "Bury after all" on an Earlier Kept record.

These review findings (`review-requirements-1.md`) apply to that work and must be resolved there:

| Finding | Problem | Fix to carry over |
| --- | --- | --- |
| 1 (Blocker, R11.3, R11.8) | The "only Candidate" rule moves an answer to a different service on a shared key such as `APPLE.COM/BILL` (iCloud+ answer lands on Apple Music once its id becomes `…:*:k`). | A Candidate qualifies only when its `priceHistory` holds the Orphan's `currentAmountCents`, or when `max(p, q) ≤ 2 × min(p, q)` (detector R3.6 join rule), `p` the Orphan's amount and `q` the Candidate's. Apply "exactly one" to qualifying Candidates. |
| 2 (Blocker, R11.9) | Re-attach is not idempotent: one pass shrinks the Free set, so a second pass can find a single Candidate for another Orphan. | Repeat simultaneous passes until no record changes, or compute Candidates once from the Free set before re-attach and use the same set on a second run. Finding 1's rule also removes the example. |
| 4 (Major, R8.3, R9.5) | "Bury after all" on an Earlier Kept record of a guessed subscription counts the guessed yearly cost. | Offer only removal on Earlier records, or store `cadenceAssumed` (this spec's Answer record already has it) and keep `yearlySavingCents: null` for guessed records. |
| 5 (Major, R10.7) | Length limits (`id` ≤ 1,000, `merchant` ≤ 500) can reject a store the Page wrote itself (long unidentified memo lines), and R10.9 then wipes the whole store. | Refuse to store, and say so, any record that would fail validation, or bound the limits by the 1 MiB file limit; drop only invalid records, not the whole store; add an over-long record to the round-trip PBT. |
| 6 (Major, R10.5, R10.7) | Stored `merchantKey`, `currency` and `cadence` are never checked against `id`, so a tampered record can count in the wrong currency. | Require `id === "sub:" + currency + ":" + cadence + ":" + d + ":" + merchantKey` with `d` matching `\*\|\d+(-\d+)?`, or store only `id` and derive the three fields. `yearlySavingCents` and any carried-over flag are derivable and optional. |
| 13 (Minor, R10.1) | The hint "Your statement and its transactions are never saved" is slightly untrue: an unidentified `merchantKey` keeps cleaned bank text such as processor reference or phone numbers. | Hint: "Only merchant names, amounts and your answers are saved; transactions and dates are not." Add an e2e or component check with an unidentified key. |
| 17 (Minor, R10.11) | `no-restricted-globals` catches `localStorage` but not `window.localStorage`. | Also use `no-restricted-properties` for `window.localStorage`, `window.sessionStorage`, `window.indexedDB`, `window.caches` and `document.cookie`. |

Also carry over: the Display name rule (Glossary) for re-attached and stored records, and the refresh rule of Requirement 9.5 (a record answered while not guessed goes back to unanswered when its subscription is now guessed).
