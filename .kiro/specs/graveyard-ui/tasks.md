# Implementation Plan: graveyard-ui

Tasks run in dependency order. Paths are relative to `apps/web/` unless they start with `.kiro/`, `packages/` or `samples/`. Each task writes its code and its tests together. Property IDs (P1–P7) refer to "Correctness properties" in `design.md`, and every property test's name starts with its ID (e.g. `"P1: skip moves the id to the end of the Queue"`).

The tasks are grouped into batches. The whole suite (`npm test` at the repo root) must be green at the end of every task, not only at the end of each batch. `npm run typecheck` and `npm run lint` must pass at the end of every task as well; until task 20 the `src/spike/**` lint exemption still exists, but it covers only files under `src/spike/`, so every file moved into `src/slice/graveyard/` must pass the full web lint rules as soon as it is written.

Each task is sized for one fresh agent run: at most two or three source files plus their tests. A task never needs a later task to make its own tests pass. When a task changes an existing test, the task names it under "Existing tests"; no other existing test may change in that task.

Rules that apply to every task:

- Statement data never leaves the browser (`privacy.md`, Req 15). No `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`, `EventSource` or `console.*` in non-test files of `apps/web/src`. Nothing derived from a statement goes to `localStorage`, `sessionStorage`, cookies or the URL (Req 15.2). The `privacy-guard` hook and the `no-network` scans pass with no new exception (Req 15.4).
- Files in `src/slice/logic/` are pure: no React, no DOM, no storage, no clock, no `Math.random`, no logging. The purity lint block covers `logic/graveyard.ts`, `logic/queue.ts` and `logic/haunt-view.ts` by path.
- Money is integer minor units (`money.md`). Only `src/slice/logic/money.ts` (`formatMoney`) turns minor units into display text; no file divides an amount by 100 or calls `toFixed`. The Spike's `formatCents` is never copied.
- `apps/web` imports the Pipeline and the classifier only from `@zombills/core`, never from `packages/core/src`, in tests too.
- All motion goes through Framer Motion, and every motion value lives in `src/slice/graveyard/motion.ts` (`tech.md`, Req 13). No `@keyframes` in `index.css`.
- Pure-logic and property tests run in Vitest's default `node` environment. Component test files start with `// @vitest-environment jsdom` and set `MotionGlobalConfig.skipAnimations = true` in `beforeAll` (reset in `afterAll`), except `graveyard-flow.motion.test.tsx` (design "Testing strategy").
- Expected money text in component tests is built with `formatMoney(…)` in the default locale; exact `en-US` strings are pinned only in logic unit tests and in the E2E test.
- Files are kebab-case, components PascalCase, constants `SCREAMING_SNAKE_CASE`; unit tests go in `*.test.ts(x)` and property tests in `*.property.test.ts` next to the source file (`structure.md`). The Page keeps the name `SlicePage` and the folder `src/slice/`.
- TypeScript strict mode. Any `any` needs a comment explaining why (`tech.md`). No new dependency.
- Until task 19, `src/spike/` and `src/routing/` are read but not changed; art moves by copying into `src/slice/graveyard/`, and the originals are deleted in task 19.
- Do not commit.

---

## Batch 1: pure logic (`src/slice/logic/`)

Every source file in this batch is pure and tested in the `node` environment. Generators go in `src/slice/logic/test-arbitraries.ts`, which only tests import. Nothing in this batch is rendered yet, so no existing component test changes.

- [x] 1. Answer records and the Graveyard (`logic/graveyard.ts`, `logic/test-arbitraries.ts`)
  - Create `graveyard.ts` with `AnswerRecord`, `Graveyard`, `EMPTY_GRAVEYARD`, `answerRecordFor`, `recordAnswer`, `isCurrentRecord`, `answersMap`, `refreshGraveyard` and `settledGraveyard`, following the signatures and "Rules inside the module" in design "Graveyard logic". `answerRecordFor` reads only the eight fields it copies, so no charge, date or description reaches a record (Req 9.1).
  - In `test-arbitraries.ts`, add `answerableSubscriptionArb`, `answerableListArb(max)`, `answerRecordArb`, `graveyardActionArb(ids)` and `deepFreeze` as listed in design "Correctness properties". Leave `subscriptionArb` as it is.
  - Unit tests `graveyard.test.ts`: the Req 5.8 table (Netflix `21588`, then Spotify, then the guessed Amazon Prime with `cadenceAssumed: true` and `yearlySavingCents: null`); Req 8.6 unbury keeps the record in its position; refresh cases (Current record refreshed, Earlier record kept by identity, record removed when its subscription turned guessed); a record built from a `us-signed.csv` subscription has exactly the eight `AnswerRecord` keys. Use hand-built guessed subscriptions inline here; task 6 adds the shared `test-fixtures.ts`.
  - Property tests in `graveyard.property.test.ts`: **P4** and **P5** (P5 calls `classifySubscriptions` from `@zombills/core`).
  - Existing tests: none change.
  - _Requirements: 4.2, 5.2, 5.6, 5.8, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.8, 9.9, 16.1_

- [x] 2. Savings totals and Still draining (`logic/graveyard.ts`)
  - Add `savingsTotals` and `StillDraining`/`stillDraining` to `graveyard.ts` as in design "Graveyard logic": one entry per currency in code-unit order; `RangeError` as soon as a running sum is not a safe integer; Still draining subtracts only Counted `not-using` Current records, clamps at 0, and gives a currency with no Currency total `remainingCents: null` and `hasExcluded: true`.
  - Unit tests in `graveyard.test.ts`: Req 6.8 (no Tombstones → `[]`; USD `21588` then GBP `15588` → `[GBP, USD]`); Req 6.6 two `Number.MAX_SAFE_INTEGER` savings throw `RangeError`; Still draining for `us-signed.csv` is `135564`, `113976` after burying Netflix and `135564` after unbury; a guessed burial subtracts nothing; `settledGraveyard` leaves the burying record out of both figures.
  - Property tests in `graveyard.property.test.ts`: **P2** and **P3**.
  - Existing tests: none change.
  - _Requirements: 1.6a, 1.6b, 5.5, 6.2, 6.3, 6.5, 6.6, 6.7, 6.8, 16.1_

- [x] 3. Display names (`logic/graveyard.ts`)
  - Add `Nameable` and `displayNames(items, locale?)` to `graveyard.ts`: plain merchant when unique, long form `"<merchant>, <formatMoney(amount)> a <week|month|year>"` when another distinct id shares the merchant, then one suffix pass (` (2)`, ` (3)`, …) in input order over all final names, skipping suffixed names already taken. Items with the same id are one item. Comparisons use the raw `merchant` string.
  - Unit tests in `graveyard.test.ts`: the two Apple subscriptions at `99` and `299` monthly; a unique merchant keeps its plain name; equal long forms get " (2)"; two `A` items at `$1.00` monthly plus an item whose merchant is literally `"A, $1.00 a month (2)"` give three distinct names. Pin `en-US` strings here.
  - Property test in `graveyard.property.test.ts`: **P6**.
  - Existing tests: none change.
  - _Requirements: 14.1 (Glossary "Display name"), 16.1_

- [x] 4. Rising order and the Queue (`logic/queue.ts`)
  - Create `queue.ts` with `risingOrder`, `queueOf`, `skipInOrder` and `answerNowInOrder` as in design "Queue". `risingOrder` filters `status === "active"` and flattens `groupForDisplay(subscriptions, [], statement.currencies)` from `totals.ts`; it does not reimplement the order rule.
  - Unit tests `queue.test.ts`: `risingOrder` for `us-signed.csv` is Adobe Creative Cloud, Riverside Gym Membership, Netflix, Spotify; Ended ids are left out; currencies follow `StatementInfo.currencies`; skip and answer-now examples; unknown ids leave the order unchanged; an id whose record is removed reappears at its own position.
  - Property test `queue.property.test.ts`: **P1**.
  - Existing tests: none change.
  - _Requirements: 2.3, 2.4, 2.9, 7.4, 16.1_

- [x] 5. Derived haunt view (`logic/haunt-view.ts`)
  - Create `haunt-view.ts` with `HauntView` and `deriveHaunt` as in design "Derived view". It is the only caller of `classifySubscriptions` in the view; it builds `risen` in Rising order, `ended` (Ended with no Current record), `queue`, `answeredCount`, `names` (Graveyard records, then Risen subscriptions), `tombstones`, `kept`, and `savings`, `stillDraining` and `fogCleared` from the settled Graveyard; `counterFallbackCurrency` is `statement.currencies[0]` for `results` and `no-subscriptions`, otherwise `null`.
  - `PageModel` gains its new fields only in task 6. So that this task does not need task 6, type the parameter as a local `HauntInput` interface (the view, `graveyard`, the Queue order and the burying id), each field named as in design "Page state". Task 6 checks that `PageModel` is assignable to `HauntInput`.
  - Unit tests `haunt-view.test.ts`: for `us-signed.csv` with an empty Graveyard, `risen` has four items, `answeredCount` 0, Still draining `135564`, fallback `"USD"`; with Netflix mid-burial, `savings` is empty and Still draining stays `135564`; after the burial settles, `savings` is USD `21588` and Netflix's `labels` contain `"zombie"`; an Earlier record shows under `tombstones` but not in `currentIds`, and its saving counts in `savings` (Req 6.5); a Tombstone whose subscription is now Ended stays under `tombstones`, still counts, and has no `zombie` label (Req 9.6); `idle` gives `statement: null` and fallback `null`.
  - Existing tests: none change.
  - _Requirements: 1.6a, 2.1, 2.3, 2.9, 5.5, 6.2, 6.5, 7.1, 7.5, 9.3, 9.6, 13.4_

> **Batch 1 done:** root `npm test`, `npm run typecheck` and `npm run lint` green; P1–P6 pass.

---

## Batch 2: page state, focus requests and the live region

The reducer stays pure and lives in `src/slice/page-state.ts`. The vertical-slice transitions keep their behaviour; every new action follows the transition table in design "Page and burial state machine", and every `id`-guarded action whose guard fails returns the same model object.

- [x] 6. Page model and the Rising actions (`page-state.ts`, `graveyard/test-fixtures.ts`)
  - Add `BurialPhase`, `RisingStage`, `RisingModel`, `Screen`, `HauntEvent`, `FocusTarget`, `FocusRequest` and the new `PageModel` fields (`graveyard`, `screen`, `event`, `focus`) as in design "Page state"; the `results` view gains `rising`. Update `INITIAL_PAGE_MODEL`.
  - Implement `finish` (results: `refreshGraveyard`, `risingOrder`, stage `ask`, event and focus per the table, including `all-answered` and `state-heading`), the focus and screen effects of `finish` other kinds, `fail`, `reject`, `start` and `reset`, and the actions `keep`, `bury`, `burial-step` and `burial-finish`. Every focus request gets a `seq` one higher than the last.
  - Add a type-level check (in `page-state.test.ts`) that `PageModel` is assignable to task 5's `HauntInput`; if a field name differs, rename it in `haunt-view.ts` rather than in the model.
  - Create `graveyard/test-fixtures.ts` with the hand-built `ClassifiedSubscription`s of design "New and changed files" (trial trap, possessed + trial trap, guessed Amazon Prime, two Apple subscriptions); only tests import it.
  - Unit tests in `page-state.test.ts`: each row of the table for these actions, with each guard's "unchanged" case; `reset` and a second `finish` keep the Graveyard; `finish` refreshes it; `burial-step` with the wrong phase or id is ignored; `burial-finish` after `buried` is ignored; `bury` with `reducedMotion: true` starts at `sinking`; `finish` after all 4 US subscriptions are answered gives event `all-answered` and focus `all-answered`, never `card(undefined)`.
  - Existing tests: `page-state.test.ts` and `page-state.property.test.ts` model literals gain the new fields; existing assertions on `runId` and `view` stay exact (`toBe` and `toEqual`, never a partial match on the whole model), and the new fields are asserted separately. `logic/announce.test.ts`: only the `results()` helper gains `rising: { order: [], stage: { kind: "ask" } }`, no assertion changes, because the `results` view now requires `rising` and the helper would not typecheck without it. `slice-page.tsx` only needs to keep compiling; no component test changes.
  - _Requirements: 2.1, 2.8, 4.1, 4.2, 5.1, 5.2, 5.3, 9.5, 9.7, 13.2, 14.2_

- [x] 7. Screens, skip, next and the Graveyard actions (`page-state.ts`, `page-state.property.test.ts`)
  - Implement `skip`, `next`, `open-graveyard`, `back-to-rising`, `back-to-start`, `answer-now`, `unbury` and `bury-after-all` with the guards of the transition table. `open-graveyard` during a burial sets stage `ask` and keeps the record (Req 5.4). `screen` is never written to the URL.
  - Unit tests in `page-state.test.ts`: every row for these actions with its "unchanged" case; `open-graveyard` mid-burial keeps the record and sets stage `ask`; `back-to-rising` with no Risen focuses `state-heading`; `back-to-start` focuses `drop-zone` in `idle` and `state-heading` in `error`; `skip` on the last Queue member is ignored; `unbury` then `bury-after-all` gives a Graveyard deeply equal to before.
  - Property test: rename the vertical-slice P15 property in `page-state.property.test.ts` to **P7** and extend it as in design "Correctness properties" (new actions mixed in; Graveyard unchanged by the seven non-answer actions; `rising` present exactly in `results`; failed guards return the same object).
  - Existing tests: `page-state.property.test.ts` (P15 becomes P7).
  - _Requirements: 2.4, 2.5, 2.7, 2.8, 5.4, 7.2, 7.4, 7.6, 7.9, 8.1, 8.3, 8.5, 9.7, 1.9, 16.1_

- [x] 8. Focus requests (`graveyard/use-focus-request.ts`, `slice-page.tsx`, `drop-zone.tsx`)
  - Create `FocusRequestContext` and `useFocusRequest(key)` as in design "Page shell": a ref callback that sets `data-focus={key}`, focuses on mount when the request names `key` and `claim(seq)` succeeds, and never steals focus again for a handled `seq`.
  - In `slice-page.tsx`, provide the context (with `handledSeq` in a ref) and add the effect keyed on `model.focus?.seq` that finds an already-mounted `[data-focus]` element by comparing `el.dataset.focus` (no selector built from the id, no `CSS.escape`).
  - Move the drop area to `data-focus="drop-zone"` in place of `focusDropZoneRef`; move the `error-view.tsx` and `no-subscriptions-view.tsx` headings to `useFocusRequest("state-heading")` (Req 14.2). Until task 18 deletes `results-view.tsx`, keep the slice's way of focusing the results heading for that view only.
  - Unit tests `graveyard/use-focus-request.test.tsx` (jsdom): focus on mount when named; no focus for another key; an element mounted after the request still claims it; a remount with the same `seq` does not refocus; a new `seq` for the same key focuses again; ids containing spaces, `:`, `/` and `*` work.
  - Existing tests: none change; the `slice-page.test.tsx` focus assertions ("Start again", error cases, "No subscriptions", "Results from a Sample") must pass as they are.
  - _Requirements: 14.2_

- [x] 9. Live region (`logic/announce.ts`, `slice-page.tsx`)
  - Replace `announcement(view, locale?)` with `announcement(model, locale?)` built on `deriveHaunt`, as in design "Live region": the slice sentences unchanged; the results sentence with the Still-draining sentence (one per currency with a figure) and the first card; the card, keep, bury (Req 14.3 example), guessed bury, unbury and all-answered sentences; Netflix's card sentence ends with the price-rise sentence.
  - In `slice-page.tsx`, pass the model to `announcement`.
  - Unit tests: rewrite `logic/announce.test.ts` for `announcement(model)`: the slice cases now build a `PageModel`; the results case expects "Found 4 recurring charges. Still draining $1,355.64 a year. Adobe Creative Cloud. Monthly, $54.99. $659.88 a year. Still using this?"; the event sentences above; two currencies give two Still-draining sentences.
  - Existing tests: `logic/announce.test.ts` (rewritten); `slice-page.test.tsx` "Results from a Sample" (live-region text only, to the new results sentence). All other live-region assertions stay.
  - _Requirements: 1.6a, 14.3_

> **Batch 2 done:** root `npm test`, `npm run typecheck` and `npm run lint` green; P7 passes; the vertical-slice page behaves as before apart from the results live-region sentence.

---

## Batch 3: moved Spike art (`src/slice/graveyard/`)

Each task copies Spike code into `src/slice/graveyard/` following design "What becomes of each Spike file", and changes only what that table lists. The Spike originals stay in place and keep working until task 19. Nothing in this batch is rendered by `SlicePage` yet, so no existing component test changes. Moved components import their motion values from `motion.ts` instead of keeping local copies.

- [ ] 10. Motion values and the burial fallback (`graveyard/motion.ts`, `graveyard/use-burial-fallback.ts`)
  - Create `motion.ts` with every constant and helper in design "Motion values": `CARD_RISE_SPRING`, `CARD_SETTLE_SPRING`, `SHUDDER`, `SINK_EASE`, `SINK`, `TOMBSTONE_RISE_SPRING`, `COUNTER_TWEEN`, `REDUCED_FADE`, `BURIAL_FALLBACK_MS`, `CARD_VARIANTS` and `CARD_REDUCED_VARIANTS` (the Spike's `MOTION_VARIANTS` and `REDUCED_VARIANTS` from `spike/undead-card.tsx`), `cardVariants`, `tombstoneMotion`, `moundMotion`, `counterFade` and `fogFade`. Copy the Spike values; do not retune them.
  - Create `useBurialFallback(stage, dispatch)`: one `setTimeout(BURIAL_FALLBACK_MS)` keyed on the burying id (not the phase) that dispatches `burial-finish(id)`, cleared on cleanup.
  - Unit tests `motion.test.ts` (node), as in design "Unit tests (logic)": every `…(true)` result animates only `opacity` with `duration ≤ 0.15`; `…(false)` uses `120/14`, `0.6 s` ease-in, `80/12` and `0.8 s`; `fogFade(_, true)` → opacity `0.45`, `fogFade(_, false)` → `1`; `BURIAL_FALLBACK_MS === 2000`; no exported value animates a colour or opacity with `repeat`.
  - Unit tests `use-burial-fallback.test.ts` (jsdom, `renderHook`, fake timers, spy `dispatch`): fires `burial-finish(id)` once at 2,000 ms and not at 1,999 ms; a phase change within the same id does not restart the timer; a change to `buried` or another id before 2 s clears it.
  - Existing tests: none change.
  - _Requirements: 13.1, 13.2, 13.5, 13.6_

- [ ] 11. Icons, label chips and their contrast (`graveyard/icons.tsx`, `graveyard/label-chip.tsx`, `src/contrast.test.ts`)
  - Copy `spike/spike-icons.tsx` to `icons.tsx`: keep `Icon`, `EyeOpenIcon`, `EyeClosedIcon` and `ShovelIcon`; drop `ReplayIcon`; add `EmberIcon` and `HourglassIcon` in the same 24-unit, 1.75-stroke style. Every `svg` is `aria-hidden="true"`.
  - Create `LabelChip({ kind, reduceMotion })` with the five kinds, words, icons and classes of design "Label chip"; the state chip keeps the Spike's `AnimatePresence mode="wait"` swap (4 px `y`, 0 px when reduced); data chips are static. The chip always shows the word next to the icon (Req 3.3–3.5, 14.5).
  - Unit tests `label-chip.test.tsx` (jsdom): each kind renders its word; the icon is `aria-hidden`; no `img` element.
  - In `contrast.test.ts`, add the `mixOklab(a, b, t)` helper and the pairs of design "Contrast pairs" except the stone face: `moss`, `ember`, `spectre` on `fog` (4.5), `blood` on `fog` (3.0, large text), `night` on `moss`, `bone` on `night`, each chip's text on `mixOklab(fog, chipColour, 0.1)`, and `text-bone/70`, `text-bone/90` on `fog`.
  - Existing tests: `src/contrast.test.ts` (new pairs only; existing assertions unchanged).
  - _Requirements: 3.3, 3.4, 3.5, 3.10, 14.4, 14.5, 14.6_

- [ ] 12. Night scene and burial earth (`graveyard/graveyard-backdrop.tsx`, `graveyard/burial-earth.tsx`, `graveyard/night-scene.tsx`)
  - Copy `spike/graveyard-backdrop.tsx` (`BackdropLayers`, `ForegroundFog`, `Ground`, `SKY_BACKGROUND`, `GROUND_TOP`) and `spike/burial-earth.tsx` (`SinkCrumbs`, `BurialMound`) unchanged apart from import paths and taking their motion values from `motion.ts` (`fogFade`, `moundMotion`).
  - Create `NightScene({ fogCleared, reduceMotion, children })` as in design "Night scene": `relative isolate min-h-svh text-bone` with the Spike's `SCENE_STYLE` (`--ground-h: clamp(7rem, 24svh, 15rem)`, `SKY_BACKGROUND`) and `VIGNETTE` from `spike/BurialSpike.tsx`; the backdrop in a `fixed inset-0` element, `Ground` and `ForegroundFog` fixed to the viewport bottom; every layer `aria-hidden` and `pointer-events-none`. The page scrolls; the scene is not `h-svh overflow-clip`.
  - Unit tests `night-scene.test.tsx` (jsdom): children render; every `svg` and backdrop layer has `aria-hidden="true"`; no `img`; `fogCleared` switches the fog opacity target (`0.45` / `1`) under `skipAnimations`.
  - Existing tests: none change.
  - _Requirements: 1.1, 13.1, 13.4, 14.4_

- [ ] 13. Money text and the tombstone (`graveyard/money-text.tsx`, `graveyard/tombstone.tsx`, `subscription-item.tsx`)
  - Move `Money` (the `.money` span) and `TextLine` (the `TextPart` renderer) out of `subscription-item.tsx` into `money-text.tsx`; `subscription-item.tsx` imports them from there until task 18 deletes it.
  - Copy `spike/tombstone.tsx` to `tombstone.tsx` and generalise it as in design "Tombstone": props `record`, `displayName`, `size: "stage" | "list"`, `entering`, `reduceMotion`, `action`; keep `StoneArt`, `Flourish`, `STONE`, `SLAB`, `BEVEL`, the lean and `.engraved`; `section` with `aria-labelledby` on "Here lies <name>.", `tabIndex={-1}`, `useFocusRequest("tombstone:<id>")` in place of the mount `focus()`; text "Fed on you every <period>.", "Saves <Money>/year." or "Saving unknown: guessed from one charge", and "Cancel it with the provider to stop the charges."; drop "since March"; `tombstoneMotion` when `entering`.
  - Unit tests `tombstone.test.tsx` (jsdom): region name "Here lies Netflix."; the "Saves" figure via `formatMoney`; the unknown-saving text for a `null` saving; the cancel line; no text containing "cancelled"; the `action` slot renders only in the list size.
  - In `contrast.test.ts`, add the stone-face pairs: `bone` and `moss` on `mixOklab(fog, bone, 0.2)` (`#3e424a`), threshold 4.5.
  - Existing tests: `subscription-item.test.tsx` must pass unchanged; `src/contrast.test.ts` (stone-face pairs only).
  - _Requirements: 3.2, 5.6, 5.7, 6.1, 14.6, 14.7_

> **Batch 3 done:** root `npm test`, `npm run typecheck` and `npm run lint` green; `src/slice/graveyard/` holds the motion values, icons, chips, night scene, burial earth and tombstone, and the Spike still runs at `#spike`.

---

## Batch 4: card, burial stage, counter, Graveyard view and the page shell

Tasks 14–17 build components that `SlicePage` does not render yet, tested on their own with `graveyard/test-fixtures.ts` and Pipeline output from `@zombills/core`. Task 18 switches the Page over, and is the only task in this batch that changes existing component tests.

- [ ] 14. Undead card (`graveyard/undead-card.tsx`)
  - Copy `spike/undead-card.tsx` and generalise it as in design "Undead card": props as in `UndeadCardProps`; keep `CardPhase`, `VARIANT_FOR_PHASE`, `swayFor`, the grave-light overlay, `BUTTON_BASE`, the 22.5 rem fog surface and its shadows; variants from `motion.ts`; `article` → `section aria-labelledby`; `h2` → `h3` with `useFocusRequest("card-heading:<id>")`; `StateLabel` → `LabelChip`; correct the yearly-figure comment to 4.53:1.
  - Content rows as in the design table: state chip from `labels.includes("zombie")` / `resting` phase; data chips with the price-rise and trial `TextLine`s, possessed first; money via `Money`; the guessed texts; "Seen since" / "Seen since at least"; the `Price history` list when `priceHistory.length > 1`; "Still using this?", the two buttons and "Skip for now" when `canSkip`; `KeptNote` with `useFocusRequest("outcome:<id>")` and "It goes on charging …". While `condemned` or `sinking` the buttons stay rendered with `aria-disabled="true"` and ignore clicks. No logo or image.
  - Unit tests `undead-card.test.tsx` (jsdom), taking over the label-line, order, `.money` and "no zombie text" cases of `subscription-item.test.tsx` (the last becomes "the Zombie chip comes from `labels`"): possessed sentence; "Trial trap" chip and `Intro price ended on 10 Feb 2026 ($1.00 on 10 Jan 2026, then $14.99)`; both labels, possessed first; price-history list; "Seen since at least 2 Jan 2026"; guessed text; every money figure in a `.money` span; no `img`; buttons `aria-disabled` and inert in `condemned`; "Skip for now" absent when `canSkip` is false.
  - Existing tests: none change (`subscription-item.test.tsx` is deleted in task 18).
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.3, 5.1, 5.3_

- [ ] 15. Burial stage and the Rising (`graveyard/burial-stage.tsx`, `graveyard/rising-view.tsx`)
  - Create `BurialStage` as in design "Burial stage": the stage container (`tabIndex={-1}`, `role="group"`, `useFocusRequest("stage:<id>")`, `aria-label="Burying <name>"` while burying), keyed by subscription id; the Spike stage layout from `spike/BurialSpike.tsx` (clip at `bottom: var(--ground-h)`, card at `-bottom-3`, tombstone at `-bottom-7`, mound at `calc(var(--ground-h) - 22px)`, crumbs only while `sinking` and not reduced); the card-phase mapping and the `burial-step` callbacks.
  - Create `RisingView` as in design "Rising": `h2` "Recurring charges found" and a `StatementSummary` moved from `results-view.tsx`; the Still-draining lines and not-included notes (including the code-prefixed note alone for a currency with `remainingCents: null`); the progress line and "Open the graveyard"; the no-Risen state ("No undead here.", "Every recurring charge found has already stopped.", `EndedList`); the all-answered state; "Next" / "Visit the graveyard" below the stage, `aria-disabled` while burying.
  - Unit tests `rising-view.test.tsx` (jsdom), rendering `RisingView` with a model built through `pageReducer` and `deriveHaunt`: first card and "0 of 4 answered" for `us-signed.csv`; the burial sequence reaches the tombstone and dispatches `burial-step` three times; the stage group is named "Burying Netflix" while burying; "Next" reads "Visit the graveyard" when the Queue is empty; the no-Risen and all-answered states; the EUR note shows alone for the "Guessed-only group" CSV.
  - Existing tests: none change.
  - _Requirements: 1.6, 1.6a, 2.1, 2.2, 2.5, 2.6, 2.7, 5.3, 5.5_

- [ ] 16. Savings counter (`graveyard/savings-counter.tsx`)
  - Copy `spike/savings-counter.tsx` and change it as in design "Savings counter": one `CounterLine` per currency, keyed by currency, inside `role="group" aria-label="Saved per year"` with the Spike caption; `formatMoney` in place of `formatCents`; `COUNTER_TWEEN` with no delay; `initialCents` = `cents` for lines present at first mount and 0 for lines added later; a drop or reduced motion sets the value at once; figure `aria-hidden` with a sibling `sr-only` value; `min-w-[7ch]`. Returns `null` with no totals and no fallback.
  - Unit tests `savings-counter.test.tsx` (jsdom): nothing rendered with no totals and no fallback; `formatMoney(0, "USD")` with the fallback; two lines in `GBP`, `USD` order; the `sr-only` value; a decrease shows the new value at once; a USD line added after a `€0.00` fallback line reaches its value.
  - Existing tests: none change.
  - _Requirements: 6.2, 6.3, 6.4, 6.8_

- [ ] 17. Graveyard view (`graveyard/graveyard-view.tsx`, `graveyard/test-a11y.ts`)
  - Create `GraveyardView` as in design "Graveyard view": `h2` "Your graveyard" with `useFocusRequest("graveyard-heading")`; "You buried <Money> a year." per currency or "Nothing buried yet."; the tombstone grid with "Unbury <name>" for Current records; "Resting" with `resting-item:<id>` focus targets and "Bury after all <name>"; "Not answered yet" with "Answer now <name>"; "Already stopped"; "Back to the rising" or "Back to the start", never both. Empty sections are left out; only the entering tombstone animates.
  - Create `test-a11y.ts` with `expectUniqueButtonNames(container)`; only tests import it.
  - Unit tests `graveyard-view.test.tsx` (jsdom): totals text via `formatMoney`; tombstones in Graveyard order; the Resting, Not answered yet and Already stopped sections; an Earlier record shows a tombstone with no "Unbury"; "Nothing buried yet."; `hasStatement: false` shows "Back to the start" only; the two Apple fixtures give "Unbury Apple payment (merchant not shown), $0.99 a month" and the $2.99 one, and `expectUniqueButtonNames` passes.
  - Existing tests: none change.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.9, 8.1, 14.1_

- [ ] 18. Page shell (`slice-page.tsx`, deletes `results-view.tsx` and `subscription-item.tsx`)
  - Wire `SlicePage` as in design "Page shell": `useReducedMotion`, `deriveHaunt` in `useMemo`, `useBurialFallback`, `NightScene`, the header panel (`h1` "Zombills", "Your bank statement is haunted.", `SavingsCounter`), and `main` with the state content (`order-1`), the Gate block (`order-2`, key `gate`, never remounted) and the controls row (`order-3`) for every view and screen; `RisingView` in `results` on `main`, `GraveyardView` on the `graveyard` screen; "Open the graveyard" in the Gate block when the Graveyard is not empty; `bg-fog/95` panels for text over the scene. Remove the slice's results-heading focus, the spike footer link and the `no-subscriptions-view.tsx` heading text ("No undead here.").
  - Delete `results-view.tsx`, `subscription-item.tsx` and `subscription-item.test.tsx`; nothing may import them.
  - New `graveyard-flow.test.tsx` (jsdom, rendering `<App />`) with the design cases "first card", "keep", "Netflix card", "bury", "burial fallback" (stubbed `BurialMound`, fake timers) and "Gate keeps focus".
  - Existing tests, changed exactly as in design "Existing tests that change": `slice-page.test.tsx` "Idle" (drops the spike-link assertion, adds the tagline "Your bank statement is haunted."), "Keyboard" (Tab order ends after the four Samples), "Results from a Sample", "No subscriptions", "Replace result", "Windows-1252 file", "Guessed-only group" and "Ended"; new "fog panels" case. "Start again", "Working", the error cases, "Skipped rows", "Assumed value", "Drag-over text" and "Drop outside" stay unchanged; `fade-in.test.tsx` unchanged.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.6a, 1.8 (link), 2.1, 3.3, 3.4, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4, 5.5, 5.7, 6.1, 6.2, 6.4, 13.6, 14.2, 14.3, 14.6_

> **Batch 4 done:** root `npm test`, `npm run typecheck` and `npm run lint` green; the Page shows the Rising, the burial and the Graveyard view.

---

## Batch 5: retire the Spike, finish the flow tests, update the vertical-slice spec, E2E

- [ ] 19. Delete the Spike and the hash route (`App.tsx`, `src/spike/`, `src/routing/`, `src/static-checks.test.ts`)
  - `App.tsx` renders `<SlicePage />` only. Delete `src/spike/` (whole folder), `src/routing/use-hash-route.ts`, `src/routing/use-hash-route.test.ts` and `src/routing/spike-view.tsx`. Before deleting, check with a search that nothing outside those folders imports them.
  - Rewrite `app.test.tsx` as the one test of design "Component tests": `location.hash = "#spike"` before render → the `h1` "Zombills" and the drop area; no link to `#spike` anywhere.
  - New node test `src/static-checks.test.ts`: `index.css` has no `@keyframes`; no file under `src/**/*.{ts,tsx}` has an import specifier matching `/spike|routing/`.
  - Existing tests: `app.test.tsx` (both cases replaced by the one above); `routing/use-hash-route.test.ts` (deleted).
  - _Requirements: 1.7, 1.8, 1.9, 13.1, 16.3_

- [ ] 20. Remove the Spike lint exemption (`eslint.config.js`)
  - Delete the `apps/web/src/spike/**` exemption block. Confirm the purity block names `logic/graveyard.ts`, `logic/queue.ts` and `logic/haunt-view.ts` (add them by path if it does not cover them).
  - Run `npm run lint` at the root and fix every finding in the moved files under `src/slice/graveyard/` without disabling a rule; in particular nothing divides by 100 and nothing calls `toFixed`.
  - Existing tests: none change.
  - _Requirements: 1.7, 15.1, 15.4_

- [ ] 21. Flow tests: skip, guessed, Graveyard view and changed answers (`graveyard-flow.test.tsx`)
  - Tests only; fix any source bug they find in the file that owns it and name it in the task notes.
  - Add the design cases "skip and next", "guessed" (the CSV of the slice's "Guessed-only group" test, kept in one run and buried in a second), "Graveyard view" (including "Answer now" returning to the gym card with focus on its heading, "Nothing buried yet.", and "Back to the start" from `idle` returning focus to the drop area), "Already stopped" (the slice's "Ended" CSV) and "change answers" (Unbury Netflix → `formatMoney(13188)`, focus on the Resting item, live region; "Bury after all Netflix" → `34776`, focus on its tombstone).
  - Existing tests: none change.
  - _Requirements: 2.2, 2.4, 2.5, 2.7, 4.3, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 8.1, 8.3, 8.4, 8.5, 8.6, 14.2, 14.3, 16.2_

- [ ] 22. Flow tests: privacy, names, decoration and motion (`graveyard-flow.test.tsx`, `graveyard-flow.reduced.test.tsx`, `graveyard-flow.motion.test.tsx`)
  - Tests only, as in task 21.
  - In `graveyard-flow.test.tsx`: "no storage" (spies on `Storage.prototype` `getItem`, `setItem`, `removeItem`, `clear` never called; `document.cookie === ""`; `location.hash` unchanged; choosing the US Sample again after burying Netflix keeps its tombstone and Netflix never becomes the card); "unique names and Tab order" (`expectUniqueButtonNames` after every step of the keep, bury, skip, Graveyard-view and change-answer cases, and the Tab order from the top on the first card); "scene is decorative" (every `svg` and backdrop layer `aria-hidden`, no `img`).
  - `graveyard-flow.reduced.test.tsx`: `vi.mock("framer-motion", …)` with `useReducedMotion` returning `true` via `vi.importActual`; the burial skips "condemned", reaches the tombstone text and announcement, and focus lands on the tombstone.
  - `graveyard-flow.motion.test.tsx`: `skipAnimations` left off; Enter on "Yes, let it rest", then `waitFor` until focus is on "Kept. It rests." and never on `body` once the note has mounted.
  - Existing tests: none change.
  - _Requirements: 1.9, 2.8, 4.3, 9.7, 13.2, 13.3, 14.1, 14.2, 14.4, 15.2, 16.2_

- [ ] 23. Notes in the vertical-slice requirements (`.kiro/specs/vertical-slice/requirements.md`)
  - Documentation only; no code and no test.
  - Add a note "(changed by graveyard-ui)" at each place Req 15.3 lists: Requirement 1 (`#spike` and the hash switch retired); Requirement 5 (the plain list replaced by the Rising and the Graveyard view, ordering, grouping and totals logic kept, Currency totals shown as "Still draining <amount> a year" after subtracting Counted savings); Requirement 8.1 (the spike link is gone); Requirement 9.5 ("including `#spike`" no longer applies); Requirements 10.4 and 10.5 (the changed tests, pointing at graveyard-ui Requirement 16); the Introduction's out-of-scope list (`zombie`, "Still using this?", Keep / Bury, tombstones and the graveyard now in scope).
  - Change nothing else in that file.
  - _Requirements: 15.3_

- [ ] 24. E2E demo path (`e2e/demo-path.spec.ts`)
  - Keep steps 1–3 (console and error collection, load, CSP tag) and 7–8 (request and `dist` checks) and the `locale: "en-US"`, `timezoneId: "UTC"` settings. Replace steps 4–6 with the eight steps of design "E2E test": the Rising summary `$1,355.64` scoped to `main p`; keep Adobe Creative Cloud and Riverside Gym Membership with "Next" between; the Netflix price-rise text; "No, bury it"; "Here lies Netflix." with "Saves $215.88/year.", the counter `$215.88`, "Still draining $1,139.76 a year" and the live-region text; "Open the graveyard" → "You buried $215.88 a year."; empty storage, cookies and unchanged URL; "Start again" focuses the drop area; at 320 × 640 no horizontal overflow on the Rising and the Graveyard view.
  - Check: `npm run test:e2e --workspace @zombills/web` passes; the root `npm test` runs no Playwright file.
  - Existing tests: `e2e/demo-path.spec.ts` steps 4–6 only.
  - _Requirements: 3.10, 7.10, 14.7, 15.1, 15.2, 16.4_

> **Batch 5 done:** no `spike` or `routing` import remains; root `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` green; the E2E test passes.

---

## Batch 6: checkpoint

- [ ] 25. Checkpoint: full verification and traceability review
  - Run from the repo root, on a clean core build: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; then `npm run test:e2e --workspace @zombills/web` (Req 16.5). All must pass.
  - Searches over `apps/web/src` (non-test files) that must find nothing: `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `console.`, `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `document.cookie`, `/ 100`, `toFixed`, `formatCents`, `@keyframes`, hex colours in `.tsx` files, and imports of `spike`, `routing` or `packages/core/src`. Search `dist` for any host other than the page's own (Req 15.1).
  - Check that the `privacy-guard` hook passes with no new exception (Req 15.4), that `src/spike/` and `src/routing/` no longer exist, and that `results-view.tsx` and `subscription-item.tsx` are gone.
  - Walk the table below: each criterion's named test exists and passes, or, for a documentation criterion, the text is in place. Deferred criteria (7.7, 8.2, Requirements 10–12) need no test here; confirm the Graveyard is still never written to storage.
  - Report any gap as a finding instead of fixing it here, unless the fix is a one-line test or text change.
  - _Requirements: all_

### Traceability

"GF" is `graveyard-flow.test.tsx`; "SP" is `slice-page.test.tsx`.

| Req | Covered by | Task |
| --- | --- | --- |
| 1.1 | SP: Idle (tagline); `night-scene.test.tsx` | 12, 18 |
| 1.2 | GF: Gate keeps focus; SP state tests unchanged | 18 |
| 1.3 | SP: Idle | 18 |
| 1.4 | SP: fog panels | 18 |
| 1.5 | SP: No subscriptions ("No undead here.") | 18 |
| 1.6 | SP: Results from a Sample, Replace result, Windows-1252 file; `rising-view.test.tsx` | 15, 18 |
| 1.6a | `graveyard.test.ts` (Still draining); `haunt-view.test.ts`; `announce.test.ts`; GF: first card, bury; SP: Guessed-only group, Ended | 2, 5, 9, 15, 18 |
| 1.6b | P2 | 2 |
| 1.7 | `static-checks.test.ts`; lint with the exemption removed | 19, 20 |
| 1.8 | `app.test.tsx`; SP: Idle, Keyboard (no spike link) | 18, 19 |
| 1.9 | `page-state.test.ts` (screen never in the URL); GF: no storage (`location.hash` unchanged) | 7, 22 |
| 1.10 | SP state tests (idle, working, every error, no-subscriptions); GF: first card, Already stopped, Graveyard view ("Nothing buried yet.") | 18, 21 |
| 2.1 | GF: first card; `rising-view.test.tsx`; `page-state.test.ts` | 6, 15, 18 |
| 2.2 | GF: Already stopped; `rising-view.test.tsx` | 15, 21 |
| 2.3 | `queue.test.ts`; P1; SP: Guessed-only group (EUR first) | 4, 18 |
| 2.4 | `queue.test.ts`; P1; GF: skip and next | 4, 7, 21 |
| 2.5 | GF: skip and next; `rising-view.test.tsx` | 15, 21 |
| 2.6 | `rising-view.test.tsx` ("Open the graveyard" in the toolbar) | 15 |
| 2.7 | GF: skip and next ("Every undead has an answer."); `page-state.test.ts` | 6, 7, 21 |
| 2.8 | P7; GF: no storage (analysing again keeps the Graveyard) | 7, 22 |
| 2.9 | P1; `haunt-view.test.ts` | 4, 5 |
| 3.1 | `undead-card.test.tsx` (region named by the heading) | 14 |
| 3.2 | `undead-card.test.tsx` (`.money` spans); GF: first card | 14, 18 |
| 3.3 | `label-chip.test.tsx`; `undead-card.test.tsx`; GF: first card, bury | 11, 14, 18 |
| 3.4 | `undead-card.test.tsx`; GF: Netflix card | 14, 18 |
| 3.5 | `undead-card.test.tsx` (trial trap; both, possessed first) | 11, 14 |
| 3.6 | `undead-card.test.tsx` (price history) | 14 |
| 3.7 | `undead-card.test.tsx` (guessed); SP: Guessed-only group | 14, 18 |
| 3.8 | `undead-card.test.tsx` ("Seen since") | 14 |
| 3.9 | `undead-card.test.tsx` (no `img`) | 14 |
| 3.10 | `contrast.test.ts` (`blood` on `fog`, large text); E2E 320 px | 11, 24 |
| 4.1 | `page-state.test.ts` (`keep`) | 6 |
| 4.2 | `graveyard.test.ts`; `page-state.test.ts` | 1, 6 |
| 4.3 | `undead-card.test.tsx`; GF: keep, guessed; `graveyard-flow.motion.test.tsx` | 14, 18, 21, 22 |
| 4.4 | GF: keep (counter `formatMoney(0)`) | 18 |
| 4.5 | GF: keep | 18 |
| 5.1 | `page-state.test.ts` (`bury`); `undead-card.test.tsx` | 6, 14 |
| 5.2 | `graveyard.test.ts`; `page-state.test.ts`; GF: bury | 1, 6, 18 |
| 5.3 | `page-state.test.ts` (burial guards); `undead-card.test.tsx` (`aria-disabled`); `rising-view.test.tsx`; GF: bury | 6, 14, 15, 18 |
| 5.4 | `page-state.test.ts` (`open-graveyard` mid-burial) | 7 |
| 5.5 | `graveyard.test.ts` (`settledGraveyard`); `haunt-view.test.ts`; GF: bury | 2, 5, 15, 18 |
| 5.6 | `graveyard.test.ts` (guessed record); `tombstone.test.tsx`; GF: guessed | 1, 13, 21 |
| 5.7 | `tombstone.test.tsx` (cancel line, no "cancelled"); GF: bury | 13, 18 |
| 5.8 | `graveyard.test.ts` (Req 5.8 table) | 1 |
| 6.1 | `tombstone.test.tsx`; GF: bury | 13, 18 |
| 6.2 | `graveyard.test.ts`; P3; `savings-counter.test.tsx`; GF: bury | 2, 16, 18 |
| 6.3 | P3; `savings-counter.test.tsx` (one line per currency) | 2, 16 |
| 6.4 | `savings-counter.test.tsx`; GF: bury | 16, 18 |
| 6.5 | `haunt-view.test.ts` (Earlier record counts) | 2, 5 |
| 6.6 | `graveyard.test.ts` (`RangeError`); P3 | 2 |
| 6.7 | P3 | 2 |
| 6.8 | `graveyard.test.ts` (Req 6.8 table); `savings-counter.test.tsx` | 2, 16 |
| 7.1 | `graveyard-view.test.tsx`; GF: Graveyard view | 17, 21 |
| 7.2 | `graveyard-view.test.tsx` ("Unbury"); GF: Graveyard view | 17, 21 |
| 7.3 | `graveyard-view.test.tsx` (Resting); GF: Graveyard view | 17, 21 |
| 7.4 | `queue.test.ts`; P1; GF: Graveyard view ("Answer now") | 4, 7, 21 |
| 7.5 | `graveyard-view.test.tsx`; GF: Already stopped | 17, 21 |
| 7.6 | `graveyard-view.test.tsx`; GF: Graveyard view ("Nothing buried yet.") | 17, 21 |
| 7.7 | Deferred to `graveyard-memory` | — |
| 7.8 | `graveyard-view.test.tsx` (Back to the rising / start) | 17 |
| 7.9 | `page-state.test.ts`; GF: Graveyard view (focus) | 7, 17, 21 |
| 7.10 | E2E 320 px on the Graveyard view | 24 |
| 8.1 | `graveyard-view.test.tsx`; GF: change answers | 7, 17, 21 |
| 8.2 | Deferred to `graveyard-memory` | — |
| 8.3 | `page-state.test.ts`; GF: change answers | 7, 21 |
| 8.4 | GF: change answers (focus on the moved item) | 21 |
| 8.5 | P4; GF: change answers | 1, 21 |
| 8.6 | `graveyard.test.ts` (Req 8.6 table); GF: change answers | 1, 21 |
| 9.1 | `graveyard.test.ts` (eight keys); P4 | 1 |
| 9.2 | P4 | 1 |
| 9.3 | P5; `haunt-view.test.ts` | 1, 5 |
| 9.4 | P4 (`answersMap`) | 1 |
| 9.5 | `graveyard.test.ts` (refresh); P4; `page-state.test.ts` (`finish` refreshes) | 1, 6 |
| 9.6 | `haunt-view.test.ts` (Ended tombstone) | 5 |
| 9.7 | P7; GF: no storage | 6, 7, 22 |
| 9.8 | P4 | 1 |
| 9.9 | P5; GF: Netflix card | 1, 18 |
| 10–12 | Deferred to `graveyard-memory`; GF: no storage confirms nothing is written | 22 |
| 13.1 | `motion.test.ts`; `static-checks.test.ts` | 10, 19 |
| 13.2 | `motion.test.ts`; `graveyard-flow.reduced.test.tsx` | 10, 22 |
| 13.3 | `graveyard-flow.reduced.test.tsx` | 22 |
| 13.4 | `motion.test.ts` (`fogFade`); `night-scene.test.tsx`; `haunt-view.test.ts` | 5, 10, 12 |
| 13.5 | `motion.test.ts` (no flashing loops) | 10 |
| 13.6 | `use-burial-fallback.test.ts`; GF: burial fallback | 10, 18 |
| 14.1 | P6; `graveyard.test.ts`; `graveyard-view.test.tsx`; GF: unique names and Tab order | 3, 17, 22 |
| 14.2 | `use-focus-request.test.tsx`; `page-state.test.ts`; GF focus assertions | 6, 8, 18, 21, 22 |
| 14.3 | `announce.test.ts`; GF: keep, bury, change answers | 9, 18, 21 |
| 14.4 | `night-scene.test.tsx`; GF: scene is decorative | 12, 22 |
| 14.5 | `label-chip.test.tsx` (word and icon) | 11 |
| 14.6 | `contrast.test.ts`; SP: fog panels | 11, 13, 18 |
| 14.7 | `tombstone.test.tsx`; E2E 320 px | 13, 24 |
| 15.1 | E2E request checks; checkpoint searches | 24, 25 |
| 15.2 | GF: no storage; E2E storage checks | 22, 24 |
| 15.3 | Review of `.kiro/specs/vertical-slice/requirements.md` (no test) | 23 |
| 15.4 | `privacy-guard` hook; lint | 20, 25 |
| 16.1 | P1–P6 and the logic unit tests | 1–4 |
| 16.2 | GF, `undead-card.test.tsx`, `graveyard-flow.reduced.test.tsx`, SP | 14, 18, 21, 22 |
| 16.3 | `app.test.tsx`; `use-hash-route.test.ts` deleted | 19 |
| 16.4 | `e2e/demo-path.spec.ts` | 24 |
| 16.5 | Checkpoint commands | 25 |
