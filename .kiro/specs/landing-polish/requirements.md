# Requirements Document

## Introduction

The `landing-polish` feature redesigns the first screen of `apps/web`: the `idle` view of the Page (`apps/web/src/slice/slice-page.tsx`) on the night scene (`NightScene`, `graveyard-backdrop.tsx`). Costume Contest judges see this screen first, and today it does not hold up. Problems seen on the live site at 1280 px wide:

1. **The moon is half covered by the header card.** The moon is drawn in the fixed backdrop at `left: 70%; top: 17%` of the viewport, `clamp(11rem, 22vw, 20rem)` wide, and its disc is 40 % of that box. At 1280 px the 640 px content column spans x = 320 to 960 and the disc spans about x = 840 to 952, so it sits behind the header card. It looks like a bug.
2. **Nothing catches the eye above the fold.** The screen is three plain `--fog` boxes of similar weight: the header, the `idle` sentence and the gate.
3. **There is no clear first step.** Four equal Sample buttons, the drop area and "Choose a file" compete for attention.
4. **Nothing says what the app does** before the user commits a statement.
5. **The privacy sentence is a paragraph** that reads like small print, although privacy is the product's main promise.
6. **Nothing says who made it** or where the code and The Reaper live.

User decision (2026-11-17): add a hero (the title in the display face, the tagline and a piece of original SVG art), one dominant primary action that loads the US Sample, the other Samples and the file inputs as secondary controls, a three-step "how it works", a compact privacy badge with the full sentence kept, and a footer. Fix the moon for every viewport from 320 to 1920 px wide.

### What stays

- Every existing behaviour of the Page: the Analyzer, every Page state and message, the Rising, the Graveyard view, the Memory panel, the cancel helper, the Share panel, "Start again" and its focus move to the drop area, and the gate shown with "Read another statement" on the non-landing states.
- Accessibility: one `h1`, no skipped heading levels, keyboard reach and the `--moss` focus ring, contrast of at least 4.5:1 for all text (this spec asks 4.5:1 for large text too, above the 3:1 WCAG AA minimum), and the reduced-motion rules of `spooky-design.md`.
- Privacy (`privacy.md`): no network request at runtime, no third-party asset, no new storage. The CSP in `apps/web/csp-plugin.ts` stays as it is. It already allows inline style attributes (`style-src 'self' 'unsafe-inline'`), which Framer Motion and the backdrop use, and inline SVG needs no `img-src`.
- No new dependency. Fonts stay bundled through `@fontsource`. Existing motion keeps using Framer Motion, and `index.css` keeps no `@keyframes` (static check in `apps/web/src/static-checks.test.ts`). *(Amended 2026-11-17: user asked for a cooler landing.)* The Landing effects of Requirement 9 are the one exception: they use CSS keyframes, kept in one stylesheet of their own (Requirement 9.6).
- Existing tests and the Playwright flows. Their locators may be amended where this spec renames or moves a control, but no assertion may be weakened or removed. Where an assertion no longer holds (for example "the `idle` view has no link"), it is replaced by a stricter one that states the new truth exactly.

### Decision: the full privacy sentence moves to the footer, the badge points to it

The `idle` sentence of graveyard-memory Requirement 1.6 has three sentences. The first two are the privacy promise, including the remember-graveyard wording. The third, "A statement covering 2 to 3 months gives the best results.", is a tip for choosing a file. This spec splits them:

- The **Privacy note** (the first two sentences, word for word) sits in the footer on every Page state and screen, so it is always on the page, not hidden behind a toggle.
- The **Privacy badge** in the hero says "Your statement never leaves your device." and has a button "Read the privacy note" that moves focus to the Privacy note.
- The tip moves next to the drop area, where the user picks a file.

A disclosure (`aria-expanded`) was the other option. It was rejected because the sentence would then be hidden by default, and an in-page `#` link was rejected because it writes to the URL (graveyard-ui Requirement 1.9 keeps the URL unchanged). The button follows the existing "Memory settings" pattern (graveyard-memory Requirement 1.10).

The badge adds "Your statement" to the approved words "Never leaves your device" so the claim names what never leaves. A remembered graveyard also stays on the device, so the claim holds with Memory on.

### Decision: the primary action keeps the Sample's source name

The Primary action loads the existing US Sample (`us-signed.csv`). Its label is new, but the Sample's `label`, "US bank, signed amounts", stays the source name. So "Reading US bank, signed amounts…", the statement summary and every later text stay as they are, and only the locators that click the US Sample change.

### Decision: automatic motion ends within 5 seconds

*(Amended 2026-11-17: user asked for a cooler landing. No longer deferred.)* WCAG 2.2.2 (Pause, Stop, Hide) asks for a pause control on motion that starts by itself and lasts more than 5 seconds. Every effect that starts by itself on load (the ghost's rise and float, the ground fog, the title flicker and the bat) therefore plays once and settles within 5 s. After that the Landing view moves only in response to the user (hover or focus on the Primary action). This keeps the art calm for judges reading the page and needs no pause button. The existing undead-card sway is outside this spec. *(Amended by design review 1 #7.)* The backdrop fog bands rest in place on the Landing view (their reduced-motion pose), so the Landing view has no endless drift; they keep drifting on Non-landing views, which this rule does not cover.

### Scope budget

The deadline is 4 Dec. This spec is sized for about 5 tasks: the document-anchored moon and its layout test; the Landing view structure, Hero and Primary action with the `working` origin field; the Secondary samples, Own-statement section, How it works, Privacy badge and Footer; the test amendments; and the notes in earlier specs.

To fit that budget (review-requirements-1, finding 9) the layout tests use the 14 fixed viewport sizes only, Non-landing views are checked at 320, 1280 and 1920 px wide only, and the pure moon-placement property (former Requirement 2.8) is dropped.

Each requirement says which phase it belongs to.

- **Phase A:** everything except hero motion. The hero art ships as a still picture.
- **Phase B:** the Landing effects (the "Decision: automatic motion ends within 5 seconds" above, Requirement 9, Requirement 13.6 and the motion part of Requirement 13.5), about 2 tasks on top of the 5 above. *(Amended 2026-11-17: user asked for a cooler landing. No longer deferred.)* Phase B builds on Phase A; Phase A does not depend on Phase B.

### Out of scope

- Changes to the Rising, the Graveyard view, the Memory panel, the cancel helper, the Share panel or the share image, other than the footer below them and the moon rule of Requirement 2.
- New Samples or changes to Sample files.
- Sound, a theme switch, a cookie banner, a language switch, a logo or favicon redesign.
- Social preview tags (`og:image` and the like). They would need an image asset and are a separate decision.
- The existing ambient motion (fog drift, undead-card sway).

---
## Glossary

- **Page**, **Page state**, **Sample**, **drop area**, **file button**, **Analyzer**, **Graveyard**, **Graveyard view**, **Rising**, **Live region**, **Memory**, **Store**: As defined in the vertical-slice, graveyard-ui and graveyard-memory Glossaries.
- **Landing view**: What the Page shows WHILE the main screen is shown (not the Graveyard view) and the Page state is `idle`, or is `working` with `origin: "landing"`. The `working` view carries a field `origin: "landing" | "other"`, set by the `start` action to `"landing"` exactly when the view before it was `idle` and the screen was `main`, and to `"other"` otherwise. A `working` state started from `results`, `error`, `no-subscriptions` or the Graveyard view (including the Graveyard view while `idle`, when a Sample is chosen from its gate) is a Non-landing view and keeps the layout of the state it started from.
- **Non-landing view**: Every other Page state and screen: `working` with `origin: "other"`, `results`, `no-subscriptions`, `error` and the Graveyard view.
- **Banner**: The `header` landmark at the top of the Page. It holds the `h1` "Zombills", the tagline and the savings counter (`SavingsCounter`, the group "Saved per year") in every Page state.
- **Hero**: The top part of the Landing view, seen as one block: the Banner, followed by the first part of `main` with the Hero line, the Hero art, the Primary action, the Secondary samples, the Privacy badge and, when present, the Return notes. The Primary action is in `main`, so a screen-reader user who jumps to the main landmark lands on it.
- **Hero line**: The sentence under the tagline, "We find the subscriptions still feeding on you. You decide which ones to bury."
- **Hero art**: The original inline SVG picture in the Hero (Requirement 3.4): a tombstone with a ghost rising from it and a soft glow. Decorative to assistive technology.
- **US Sample**: The Sample with `fileName` `us-signed.csv` and `label` "US bank, signed amounts".
- **Primary action**: The one dominant button of the Landing view, which analyses the US Sample (Requirement 4).
- **Secondary samples**: The three Samples other than the US Sample, shown on the Landing view as small text-style buttons (Requirement 5).
- **Return notes**: The graveyard-memory content of the `idle` panel: the restored line (graveyard-memory Requirement 1.7), any load note (graveyard-memory Requirement 4) and the "Open the graveyard" button when the Graveyard has a record.
- **Own-statement section**: The Landing view section that holds the tip, the drop area and the file button.
- **How it works**: The Landing view section with three numbered steps (Requirement 6).
- **Privacy badge**: The one-line privacy claim in the Hero with its "Read the privacy note" button (Requirement 7).
- **Privacy note**: The first two sentences of the graveyard-memory `idle` sentence, word for word: "Your statement stays on this device and is never uploaded. Nothing is kept after you close this page unless you choose to remember your graveyard." Shown in the Footer.
- **Tip**: "A statement covering 2 to 3 months gives the best results."
- **Footer**: The `footer` landmark (`contentinfo`) at the end of the Page, after `main`, in every Page state and screen (Requirement 8).
- **Card**: An element of the Page drawn on an opaque or near-opaque surface: every element with a `--fog` background (for example `bg-fog/95` panels, the drop area, buttons with `bg-fog`), the Primary action, undead cards and tombstones.
- **Content box**: One of these rectangles, in document coordinates (`getBoundingClientRect()` plus the scroll offset):
    - the border box of any Card, any control and the Hero art;
    - for text, each rectangle in the union of `Range.getClientRects()` over every non-empty text node (glyph rectangles, not the element box).

  Excluded: anything inside an element with `aria-hidden="true"`, anything inside a visually hidden (`sr-only`, clip-rect) element such as the Live region, and every rectangle with zero area.
- **Moon disc**: The filled disc of the moon (today the `circle r="40"` in `Moon`), not its halo or the sky glow. It carries the attribute `data-moon-disc` so tests can measure it.
- **Viewport set**: The viewport sizes (width × height, in CSS px) the layout tests use: 320×568, 360×640, 375×667, 390×844, 414×896, 640×800, 768×1024, 1024×768, 1280×720, 1280×800, 1366×768, 1440×900, 1600×900 and 1920×1080. No random sizes are drawn.
- **Non-landing viewport set**: 320×568, 1280×720 and 1920×1080, the sizes at which the layout tests check Non-landing views.
- **Fold**: The bottom edge of the viewport at scroll position 0.

---
## Requirements

### Requirement 1: The Landing view, its order and its landmarks

**Phase:** A

**User Story:** As a first-time visitor, I want the first screen to show what the app is, one obvious way to try it, what happens next and that my statement stays with me, in that order, so that I understand the app before I scroll.

#### Acceptance Criteria

1. THE Landing view SHALL show, in this DOM order: the Banner (`h1` "Zombills", the tagline "Your bank statement is haunted." and the savings counter); then, inside `main`, the Hero line, the Hero art, the Primary action, the Secondary samples, the Privacy badge and the Return notes when present; then How it works; then the Own-statement section; then, after `main`, the Footer. Below 768 px of viewport width the visual order SHALL be the DOM order, in one column. WHERE the Landing view uses two columns (Requirement 3.6), the `h1` and tagline run full width in the Banner, only the `main` part of the Hero is split into two columns, THE Hero art MAY sit in the second column and the savings counter MAY sit at the top right; the focusable elements SHALL keep the DOM order above, so the focus order matches the reading order.
2. THE Page SHALL have exactly one `h1`, "Zombills", in every Page state and screen. On the Landing view the headings SHALL be, in order: `h1` "Zombills"; `h2` "How it works"; `h3` "Find the undead", `h3` "Count what they cost", `h3` "Bury them"; `h2` "Or read your own statement". No heading level SHALL be skipped. The `h2` "Or try a sample statement" of the Sample buttons SHALL NOT be shown on the Landing view (Requirement 5.1 gives the Secondary samples their own label).
3. THE Landing view SHALL have the landmarks `header` (the Banner), `main` and `footer` (the Footer), each exactly once, and the Live region SHALL stay where it is today, outside them. No landmark element SHALL use `display: contents`.
4. THE Landing view SHALL NOT show the `idle` panel of today (the `--fog` box that holds the `idle` sentence). Its parts SHALL move: the Privacy note to the Footer (Requirement 8), the Tip to the Own-statement section (Requirement 5.4) and the Return notes into the Hero (Criterion 5).
5. WHEN the Return notes are present, THE Hero SHALL show them directly after the Privacy badge, with the restored line, then any load note, then "Open the graveyard", with the same text and behaviour as graveyard-memory Requirements 1.7 and 4 and graveyard-ui (the button opens the Graveyard view).
6. THE Non-landing views SHALL keep their content and order of today: the Banner, then the state content, then the gate (with "Read another statement" on `results` and the Graveyard view, as today), then "Start again" when shown, then the Footer. On them the gate SHALL keep all four Sample buttons labelled with their Sample `label`, and SHALL NOT show the Primary action, the Hero line, the Hero art, the Privacy badge or How it works.
7. Every Non-landing view (`working` with `origin: "other"`, `results` including the Rising, `no-subscriptions`, `error` and the Graveyard view) SHALL keep `main` at its width of today (`max-w-[640px]`). THE Landing view MAY use a wider layout, at most 1120 px of content width.
8. WHEN "Start again" is activated, THE Page SHALL return to the Landing view and move focus to the drop area, as vertical-slice Requirement 4.10 says, and scroll it into view (`focusAndReveal`). WHEN "Back to the start" is activated in the Graveyard view, THE Page SHALL show the Landing view with the focus behaviour of today.
9. THE Landing view SHALL handle every screen state of `spooky-design.md`: default (the Hero, How it works and the Own-statement section), processing (Requirement 4.5), empty (the default is the empty state, as graveyard-ui Requirement 1.10 says) and error (a file or Sample that fails leads to the `error` state of today, a Non-landing view).

### Requirement 2: The moon is never behind a card

**Phase:** A

**User Story:** As a judge opening the site on any screen, I want the moon to sit clear in the sky, so that the scene looks made on purpose and not broken.

#### Acceptance Criteria

1. FOR every size in the Viewport set, WHILE the Landing view is shown, THE Moon disc SHALL lie wholly inside the viewport at scroll position 0, and SHALL NOT intersect any Content box.
2. WHILE the Landing view is shown, THE Moon disc SHALL be anchored to the document: it scrolls with the page and keeps its document position at every scroll position. Because of this the check is scroll-invariant: THE Moon disc, in document coordinates, SHALL NOT intersect any Content box in the whole document, visible or not.
3. FOR every size in the Non-landing viewport set, WHILE a Non-landing view is shown at scroll position 0, THE Moon disc SHALL NOT intersect any Content box in the viewport. On a Non-landing view the Moon disc MAY lie partly or wholly outside the viewport, MAY stay fixed to the viewport, and MAY sit at a different place and size than on the Landing view (it may jump when the view changes). Content that scrolls past a fixed moon on a Non-landing view is allowed. *(Amended by design review 1 #10.)* On a Non-landing view below 1024 px wide the moon and its sky glow MAY be not drawn at all.
4. THE Moon disc SHALL be at least 48 px across WHEN any part of it is inside the viewport, so it still reads as a moon on small screens.
5. THE sky glow centred on the moon (today the first layer of `SKY_BACKGROUND`) and the moon's halo SHALL be drawn inside the moon's own positioned element, so they move with the disc. The layout test SHALL check that the centre of the glow element's box (`data-moon-glow`) and the centre of the halo element's box are each within 1 px of the `[data-moon-disc]` centre.
6. THE moon SHALL keep its look of today (the disc gradient, the maria, the halo) and its colours from the seven tokens. Only its position and size MAY change. *(Amended by design review 1 #10.)* The Landing moon is not under the vignette, so it is slightly brighter than today; that is allowed.
7. THE Playwright layout test SHALL check Criteria 1, 2 and 4 for every size in the Viewport set, and Criterion 3 for every size in the Non-landing viewport set, after `document.fonts.ready`, with `prefers-reduced-motion: reduce` emulated so no swaying or entering element moves its boxes. For Criterion 2 it SHALL do one exact check in document coordinates against every Content box of the document (no sampling of scroll positions). It SHALL run the Landing check in each of these states: an empty Graveyard; a restored Graveyard showing the restored line, a dropped-records load note and "Open the graveyard"; and `working` (origin `"landing"`). A failure SHALL name the viewport size, the state and the Content box it hit.
8. *(Dropped by review-requirements-1, finding 9.)* No pure moon-placement function or property test is required.
9. No text Content box SHALL lie within the moon's halo radius, 2.5 × the Moon disc radius from the disc centre, in every case where Criteria 1 to 3 apply. The layout test of Criterion 7 SHALL check this alongside the disc check.

### Requirement 3: The Hero

**Phase:** A

**User Story:** As a judge seeing the site for the first time, I want a large title, a clear line about what the app does and a striking picture, so that the first screen has character and explains itself.

#### Acceptance Criteria

1. THE Hero SHALL show the `h1` "Zombills" in IM Fell English (`font-display`) at a font size of at least 3 rem below 640 px of viewport width and at least 4.5 rem from 1024 px, and the tagline "Your bank statement is haunted." in IM Fell English at least 1.5 rem. The `h1` text and the tagline text SHALL stay as they are today.
2. THE Hero SHALL show the Hero line, "We find the subscriptions still feeding on you. You decide which ones to bury.", in Inter, after the tagline.
3. On the Landing view, THE `h1`, the tagline and the Hero line SHALL sit directly on the night scene, with no Card behind them. Their contrast SHALL be checked against the lightest colour the scene can show behind them (Requirement 10.2).
4. THE Hero art SHALL be an original inline SVG made for this project: a tombstone with a ghost rising from it, lit by a soft glow. It SHALL use only the seven colour tokens of `index.css`, directly or through `color-mix()`, and SHALL contain no text, no `<image>`, no `<foreignObject>`, no external reference (`href` or `url()` that is not a `#` fragment in the same SVG) and no brand shape. Gradient, filter and clip ids SHALL come from `useId` so they never clash with the backdrop's ids.
5. THE Hero art SHALL have `aria-hidden="true"` and SHALL NOT be focusable. It SHALL carry meaning for the sighted user, as the theme rule of `product.md` asks: it shows the app's metaphor (a charge rising from the grave) and sits directly next to or above the Primary action, so it leads the eye to it. In Phase B it also leans toward the Primary action while that is hovered or focused (Requirement 9.1 (a)).
6. WHEN the viewport is at least 1024 px wide, THE `main` part of the Hero MAY use two columns: the Hero line and the Primary action on one side and the Hero art on the other, with the `h1` and tagline running full width above them in the Banner. The grid SHALL NOT span the `header` and `main` landmarks. Below 768 px THE Hero SHALL be one column.
7. WHEN the viewport is 1280×720, 1280×800, 1366×768, 1440×900, 1600×900, 1920×1080, 390×844 or 414×896, THE `h1`, the tagline, the Hero line, the Primary action, the Privacy badge and the Hero art SHALL each lie wholly above the Fold.
8. FOR every size in the Viewport set, THE `h1`, the tagline and the Primary action SHALL each lie wholly above the Fold, and THE Hero art SHALL be at least 96 px tall.
9. THE Hero art SHALL show its final, still pose in Phase A, after its automatic motion has ended in Phase B, and WHILE reduced motion is preferred: the ghost risen above the tombstone, the glow at rest.
10. THE Hero art's bounding box, including its glow, SHALL NOT intersect any text Content box. The layout test of Requirement 2.7 SHALL check this at every size in the Viewport set.

### Requirement 4: The Primary action

**Phase:** A

**User Story:** As a visitor without a statement at hand, I want one obvious button that shows me the app on a sample, and to know it is a sample, so that I can see what it does in one click without wondering whose money I am looking at.

#### Acceptance Criteria

1. THE Landing view SHALL show exactly one Primary action: a native `button` with two lines of visible text, "Summon the undead" and, below it, "with a sample US bank statement". Its accessible name SHALL be its visible text, "Summon the undead with a sample US bank statement" (WCAG 2.5.3, label in name). The two lines SHALL be separated by a literal space text node in the DOM, so the name keeps its space where block display is not applied (jsdom). It SHALL have no `aria-label` that differs from that text.
2. WHEN the Primary action is activated, THE Page SHALL analyse the US Sample exactly as choosing the US Sample button does today: the source name SHALL be "US bank, signed amounts", the Page SHALL enter `working` with "Reading US bank, signed amounts…" and then show the outcome of today, with no network request (vertical-slice Requirement 2.3).
3. THE Primary action SHALL be visually dominant: it SHALL be the only control on the Landing view with a filled `--moss` background, with `--night` text; its first line SHALL be at least 1.25 rem and semibold or bolder; it SHALL be at least 56 px tall and at least 44 px wide (Requirement 10.5); and it SHALL come before the Secondary samples, the drop area and the file button in both DOM and visual order.
4. THE Primary action SHALL show the focus ring of `spooky-design.md` (`--moss`, 2 px offset, with the glow), which SHALL have a contrast of at least 3:1 against the night scene next to it. Hover SHALL change its look by more than colour alone (the candle glow and the ghost's lean of Requirement 9.1 (e) and (a)), and the hover style SHALL also apply on `:focus-visible`.
5. WHILE the Page is `working` on the Landing view, THE Primary action, the Secondary samples, the drop area and the file button SHALL be disabled the way graveyard-ui Requirement 14.2 says (`aria-disabled="true"`, handlers that do nothing, focus kept), and THE Landing view SHALL show "Reading <source name>…" directly after the Primary action, without moving anything above it. On the Landing view this `working` line sits on a `--fog` surface, as graveyard-ui Requirement 1.4 asks for `working` content. The Landing view is kept only when the `working` view has `origin: "landing"` (Glossary).
6. WHEN the Analyzer finishes, THE Page SHALL leave the Landing view and show the outcome with the focus behaviour of today.

### Requirement 5: The Secondary samples and the Own-statement section

**Phase:** A

**User Story:** As a visitor with my own statement or who wants another bank layout, I want those choices still there but out of the way, so that the first step stays obvious and nothing I could do before is lost.

#### Acceptance Criteria

1. THE Landing view SHALL show the Secondary samples directly after the Primary action as one line (wrapping when narrow) that starts with the text "Other samples:" followed by a list (`ul`) of three native `button` elements labelled with their Sample `label`, in `SAMPLES` order: "UK bank, debit and credit columns", "EU bank, semicolons", "Statement with a header block". The list SHALL have the accessible name "Other sample statements" (`aria-label` on the `ul`, or `aria-labelledby` pointing at the "Other samples:" text).
2. THE Secondary samples SHALL look like text links: `--bone` text, underlined, no fill and no border, at the body font size or smaller (not below 0.875 rem). They SHALL keep the `button` role, because they start an analysis and do not navigate. Each SHALL have a hit area of at least 44 × 44 px, made through padding.
3. WHEN a Secondary sample is activated, THE Page SHALL analyse that Sample exactly as its Sample button does today.
4. THE Own-statement section SHALL be a `section` with the `h2` "Or read your own statement", the Tip as a paragraph, the drop area and the file button, in that order, with the drop area, the file button, the hidden file input and their behaviour unchanged (vertical-slice Requirement 2; `DropZone`, including `data-focus="drop-zone"`, the accessible name "Drop area: choose or drop a CSV statement", the drag-over text and `accept=".csv,text/csv"`).
5. THE drop area and the file button SHALL look secondary to the Primary action: no filled `--moss` background, and the drop area SHALL be at most 128 px tall at the default text size.
6. A file dropped anywhere on the Landing view outside the drop area SHALL still be ignored (vertical-slice Requirement 2.6).
7. THE Sample buttons component used by the Non-landing gate SHALL keep its heading "Or try a sample statement" and its four buttons of today (Requirement 1.6).

### Requirement 6: How it works

**Phase:** A

**User Story:** As a visitor deciding whether to try it, I want three short steps that say what will happen, so that I know what I get before I share a statement with the page.

#### Acceptance Criteria

1. THE Landing view SHALL show How it works as a `section` with the `h2` "How it works" and an ordered list (`ol`) of three steps, each with an `h3` and one short paragraph, in this order and with this exact text:

    | Step | `h3` | Paragraph |
    | --- | --- | --- |
    | 1 | Find the undead | Drop in a statement. Every charge that keeps coming back rises from the grave. |
    | 2 | Count what they cost | See what each one drains from you in a year. |
    | 3 | Bury them | Bury the ones you no longer use, and get help to cancel them. |

2. Each step SHALL show its number (1, 2, 3) as visible text, so the order does not depend on the list markers or on colour. A decorative icon MAY be added per step only from the existing icon set (`graveyard/icons.tsx`) or the same tokens, with `aria-hidden="true"`.
3. WHEN the viewport is at least 768 px wide, THE three steps MAY sit in one row of three equal columns. Below 640 px they SHALL stack in one column (`spooky-design.md`).
4. THE copy SHALL keep the tone of `spooky-design.md`: short sentences, no exclamation points, and no claim the app cannot back. It SHALL NOT say the app cancels anything for the user (`product.md`: no auto-cancellation) or that it knows what the user uses.
5. How it works SHALL contain no control. It explains; the Primary action and the Own-statement section act.

### Requirement 7: The Privacy badge

**Phase:** A

**User Story:** As a visitor who will not hand a bank statement to a website, I want the privacy promise in plain sight next to the button, and the full wording one step away, so that I can trust the page before I try it.

#### Acceptance Criteria

1. THE Hero SHALL show the Privacy badge directly after the Secondary samples: one line with the text "Your statement never leaves your device." and, after it, a native `button` "Read the privacy note". A decorative icon MAY precede the text, with `aria-hidden="true"`; the claim SHALL NOT rely on the icon or on colour.
2. WHEN "Read the privacy note" is activated, THE Page SHALL move focus to the Privacy note in the Footer (an element with `tabindex="-1"`) and scroll it into view, by calling `focusAndReveal` directly on a ref to the Privacy note (the `[data-focus]` effect only searches `main`, and the Footer is outside it), with an instant scroll WHILE reduced motion is preferred. THE URL SHALL NOT change.
3. THE badge SHALL look like a compact label, not a panel: one line at 640 px and wider, at most two lines below 640 px at the default text size, with the button styled as an underlined text link and a hit area as Requirement 5.2 says.
4. THE badge text SHALL make no further claim: it SHALL NOT say "private", "secure", "encrypted" or "anonymous" (graveyard-memory Requirement 1.8).
5. THE Privacy badge SHALL be shown on the Landing view only. On Non-landing views the Privacy note in the Footer stays.

### Requirement 8: The Footer and the Privacy note

**Phase:** A

**User Story:** As a judge, I want to see that the app was built with Kiro and find its code and its companion app, and as a user I want the full privacy wording always on the page, so that I can check both.

#### Acceptance Criteria

1. THE Page SHALL show the Footer after `main` in every Page state and screen. THE Footer SHALL contain, in this order: the Privacy note; the text "Built with Kiro."; a link "Zombills on GitHub" to `https://github.com/zaxcoraider/zombills`; and a link "The Reaper on GitHub" to `https://github.com/zaxcoraider/zombills-reaper`, followed by the text "The Reaper is a Kiro Crew app that watches for new statements each month and drafts cancellation emails when you ask."
2. THE Privacy note SHALL be one paragraph with exactly the text "Your statement stays on this device and is never uploaded. Nothing is kept after you close this page unless you choose to remember your graveyard." and `tabindex="-1"`. THE Tip SHALL NOT be in the Footer; it appears only in the Own-statement section (Requirement 5.4).
3. Each link in the Footer SHALL open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`), so a click never unloads the Page and loses an in-memory Graveyard, and SHALL say so as the cancel helper links do: the text "(opens in a new tab)" (`NEW_TAB_TEXT`) referenced with `aria-describedby`. Its accessible name SHALL start with its visible text.
4. THE Footer SHALL NOT load anything: no image, no icon font, no badge from a third-party host, no embedded GitHub widget. Opening the Page SHALL make no request to `github.com` or any other host; only following a link does, and that is a navigation the user chooses.
5. THE Footer text SHALL be at least 0.875 rem, `--bone` (or a `--bone` mix that passes Requirement 10.2), and the links SHALL be underlined.
6. THE Footer text SHALL meet Requirement 10.2 against the lightest colour behind it, including the Ground, the hills and the foreground fog where the Footer can sit over them. WHERE that cannot be met on the bare scene, THE Footer SHALL sit on a `--fog` or `--night` surface.
7. THE `IDLE_SENTENCE` constant in `apps/web/src/slice/logic/memory-text.ts` SHALL be replaced by two constants, `PRIVACY_NOTE` (the Privacy note) and `STATEMENT_TIP` (the Tip), whose text joined with one space is exactly the graveyard-memory Requirement 1.6 sentence. The memory-text unit test SHALL assert both texts exactly and that their join equals that sentence.
8. Before release, a person SHALL confirm by hand that `https://github.com/zaxcoraider/zombills-reaper` is a public repository that loads without sign-in. This is a manual release step, not an automated test.

### Requirement 9: The Landing effects

**Phase:** B. *(Amended 2026-11-17: user asked for a cooler landing. No longer deferred. This text replaces the earlier Framer Motion version of the requirement.)*

**User Story:** As a judge, I want the landing to come alive when it opens and to answer when I point at the button, and as a user who prefers less motion, I want a still picture or motion that stops by itself, so that the scene feels made with care without getting in the way.

#### Acceptance Criteria

1. THE Landing view SHALL have exactly these effects, each an original SVG or CSS effect made for this project:
    - (a) **Ghost.** WHEN the Landing view is first shown after the page loads, THE ghost in the Hero art SHALL rise once from behind its tombstone, float gently up and down, and settle in its final pose. WHILE the Primary action is hovered or has focus, THE ghost SHALL lean and drift toward the Primary action, and SHALL return to its final pose when hover and focus leave.
    - (b) **Ground fog.** Fog wisps on the ground band of the Hero art (its mound) SHALL drift slowly across it once and settle.
    - (c) **Title glow.** THE `h1` "Zombills" SHALL have a faint moonlight glow that fades in, with at most one subtle flicker (one dip and recovery), and then holds still.
    - (d) **Bat.** One bat SHALL cross in front of the Landing moon disc once on load and then be gone.
    - (e) **Candle glow.** WHILE the Primary action is hovered or has keyboard focus, it SHALL show a warm, candle-like glow around it, which MAY flicker briefly and then holds still.
2. All automatic motion (Criterion 1 (a) rise and float, (b), (c) and (d)) SHALL stop within 5 s of the Landing view being shown (WCAG 2.2.2): for every CSS animation, `animation-delay` + `animation-duration` × `animation-iteration-count` SHALL be at most 5 s, and the iteration count SHALL be finite. Motion driven by hover or focus (Criterion 1 (a) lean and (e)) is allowed while the user holds it, and SHALL also be finite (a transition, or an animation with a finite count).
3. No effect SHALL flash more than 3 times in any 1 s (WCAG 2.3.1): in every keyframes rule that changes `opacity`, `text-shadow` or `box-shadow`, consecutive keyframe stops SHALL be at least 334 ms apart.
4. WHILE reduced motion is preferred (`prefers-reduced-motion: reduce`), every effect SHALL be replaced by its still end state from the first paint: the ghost in its final pose, the fog at rest, the title glow at its rest value with no flicker, no bat, and the candle glow shown on hover and focus without flicker or fade. No lean SHALL happen. No animation and no transition SHALL run on the effect elements.
5. THE automatic effects SHALL play once per page load. WHEN the Page returns to the Landing view from another state in the same page session (for example after "Start again"), THE effects SHALL be shown in their still end state, and the hover and focus effects SHALL work as in Criterion 1.
6. THE effects SHALL use only CSS `@keyframes` and transitions, or SMIL inside the SVG, with no external image, font or library, no JavaScript animation loop (`requestAnimationFrame`, `setInterval`, or timers that change style) and no Framer Motion. Every `@keyframes` rule of this spec SHALL be in one stylesheet, `apps/web/src/slice/landing/landing-motion.css`, imported by the Landing components and bundled by Vite; `index.css` SHALL keep no `@keyframes`. Only `transform`, `opacity`, `text-shadow` and `box-shadow` SHALL be animated, so no effect changes layout or moves a Content box (Requirement 2).
7. No effect SHALL lower the contrast of any text below 4.5:1 (Requirement 10.2), or of the focus ring and the Primary action's boundary below 3:1 (Requirement 10.3), at the effect's brightest value. No effect SHALL draw over a text Content box or the Moon disc's clearance (Requirements 2.1, 2.9 and 3.10): the ghost and the fog stay inside the Hero art's box, the bat stays inside the moon's halo box, the title glow lies only around the `h1`'s own glyphs, and the candle glow ends before the nearest text Content box outside the Primary action. The effect elements are `aria-hidden` decoration or CSS paint, not Content boxes.
8. THE effects SHALL NOT delay or block the Primary action: it SHALL be operable from the first paint, and activating it during the automatic motion SHALL start the analysis at once. WHILE the Page is `working` on the Landing view (the Primary action is `aria-disabled`), THE ghost SHALL NOT lean and the candle glow SHALL NOT show.

### Requirement 10: Accessibility

**Phase:** A (Criterion 7 also covers Phase B)

**User Story:** As a keyboard, screen-reader or low-vision user, I want the new first screen to work as well as the old one, so that the polish does not shut me out.

#### Acceptance Criteria

1. WHEN the user presses Tab from the top of the Landing view with an empty Graveyard, THE focus SHALL visit, in this order: the Primary action; the three Secondary samples; "Read the privacy note"; the drop area; the file button; "Zombills on GitHub"; "The Reaper on GitHub". WHEN the Return notes show "Open the graveyard", it SHALL come directly after "Read the privacy note". The savings counter, the Hero art and How it works SHALL add no tab stop.
2. Every text on the Landing view and in the Footer SHALL have a contrast of at least 4.5:1, large text included, against the lightest colour that can be behind it. For text on the night scene, that colour is the sky gradient at that point with the sky glow and the fog layers at their highest density composited on top. The moon halo and the Hero art glow are never under text (Requirements 2.9 and 3.10), so they are not composited. For text on a Card, it is the Card surface. *(Amended by design review 1 #12.)* Stars and the fence's moonlight lines, single marks under 2 px, are not composited: on the Landing view a star may sit behind a bare-scene glyph, and that is an accepted deviation. `apps/web/src/contrast.test.ts` SHALL check each new text and background pair, computed from the tokens and the alphas the design uses, and SHALL fail if one is below 4.5:1.
3. Non-text parts that carry meaning (the Primary action's boundary is its fill; the drop area's dashed border; the focus ring) SHALL have a contrast of at least 3:1 against what is next to them (WCAG 1.4.11).
4. Every control SHALL show the focus ring of `spooky-design.md` on `:focus-visible`, and no Card, art or backdrop layer SHALL cover a focused control or its ring.
5. Every control on the Landing view and in the Footer SHALL meet WCAG 2.5.8 as that criterion defines it (a 24 × 24 px target, or a 24 px diameter circle centred on each undersized target that intersects no other target or its circle); the Secondary samples and "Read the privacy note" SHALL have 44 × 44 px hit areas through padding (Requirements 5.2 and 7.3); the Primary action, the drop area and the file button SHALL be at least 44 × 44 px.
6. WHEN the viewport is 320×568, and WHEN it is 390×844 with the root font size at 200 %, THE Landing view and the Footer SHALL have no sideways scroll (`scrollWidth <= innerWidth`), no text SHALL be clipped, and the Primary action SHALL be wholly inside the viewport after the page is scrolled to it.
7. WHILE reduced motion is preferred, THE Landing view SHALL show no position, scale or rotation motion, as `spooky-design.md` asks (Requirement 9.4).
8. THE Hero art and every decorative layer SHALL be hidden from assistive technology, and no text SHALL be drawn only inside SVG.
9. THE Live region SHALL say nothing new on the Landing view: its text on `idle` SHALL stay `""` as today, and "Read the privacy note" SHALL NOT announce anything (the focus move is the feedback).

### Requirement 11: Privacy, the CSP, dependencies and the theme rule

**Phase:** A

**User Story:** As the team, I want the new screen to keep every promise the app already makes, so that polish never costs privacy or the hackathon rules.

#### Acceptance Criteria

1. Opening the Page and using the Landing view, including the Primary action, the Secondary samples, "Read the privacy note" and the Hero art motion, SHALL make no network request other than the same-origin `GET`s for the built files in `dist` that the demo-path test allows today. No font, image, icon or script SHALL be loaded from another host.
2. THE `CSP_POLICY` string and `injectCsp` in `apps/web/csp-plugin.ts`, the Netlify headers and their tests SHALL stay unchanged. Any new style SHALL work under that policy: Tailwind classes, `index.css` rules, the bundled `landing-motion.css` (Requirement 9.6), React `style` attributes and inline SVG presentation attributes. No `<style>` element SHALL be added at runtime and no `eval`-like API SHALL be used.
3. THE feature SHALL add no dependency to any `package.json` and no new file under `apps/web/public`. Fonts SHALL stay the bundled `@fontsource` IM Fell English and Inter.
4. THE only absolute URLs in non-test source under `apps/web/src` SHALL be the two GitHub links of Requirement 8.1. A static check in `apps/web/src/static-checks.test.ts` SHALL enforce this, ignoring the SVG namespace `http://www.w3.org/2000/svg` when it appears.
5. THE feature SHALL add no storage access, cookie or URL write (graveyard-memory Requirement 10; the existing storage static check stays).
6. Every spooky element added by this spec SHALL do work, as `product.md` asks: the Hero art shows the app's metaphor and leads to the Primary action (Requirement 3.5), the three steps name the app's states in its own metaphor (undead, cost, burial), and "Summon the undead" names what the Primary action does. Any added element that does none of this SHALL be removed. *(Amended 2026-11-17: user asked for a cooler landing.)* Of the Requirement 9 effects, the ghost's lean and the candle glow give feedback on the Primary action, and the rise shows the metaphor. The ground fog, the title glow and the bat only set the scene on load. The user accepted them as scene-setting on 2026-11-17, and Requirement 9.2 limits them to the first 5 s.
7. No service logo, brand asset or gore SHALL be added (`spooky-design.md`, "What not to do"). The "Built with Kiro." line and the GitHub links SHALL be text only, with no Kiro or GitHub logo.

### Requirement 12: Existing behaviour and changes to earlier specs

**Phase:** A

**User Story:** As the team, I want the earlier specs to say what the Landing view changed, so that the specs and the code agree.

#### Acceptance Criteria

1. THE Page SHALL keep every behaviour that graveyard-ui Requirement 1.2 lists, the graveyard-memory behaviour of the `idle` state (restored line, load notes, "Open the graveyard") and every Non-landing view as it is today, except where this spec changes the `idle` layout, moves the privacy sentence and adds the Footer.
2. THE following notes SHALL be added to the earlier specs, in their existing style "(Changed by landing-polish: …)":
    - vertical-slice Requirement 2.2: on the Landing view, the US Sample is offered by the Primary action and the other three Samples as Secondary samples; the Non-landing gate keeps four Sample buttons.
    - graveyard-ui Requirement 1.1: the `h1` and tagline stay in every Page state; on the Landing view they sit in the Hero on the night scene, not on a Card.
    - graveyard-ui Requirement 1.3: the `idle` content is the Landing view; the vertical-slice sentence is split into the Privacy note in the Footer and the Tip in the Own-statement section.
    - graveyard-memory Requirement 1.6: the sentence is shown as the Privacy note (Footer, every state) plus the Tip (Own-statement section), word for word.
    - graveyard-ui Requirement 1.10: the Gate (`idle`) row's default is the Landing view (Hero, How it works, Own-statement section).
    - graveyard-ui Requirement 1.4: on the Landing view the `working` line "Reading <source name>…" sits directly after the Primary action, on a `--fog` surface.
    - vertical-slice Requirement 4.1: on the Landing view, `idle` shows the Primary action, three Secondary samples, the Tip in the Own-statement section and the Privacy note in the Footer, not four Sample buttons and one sentence.
    - graveyard-memory Requirements 1.7, 4.3, 4.5 and 4.10: the restored line, the load notes and "Open the graveyard" are the Return notes in the Hero, directly after the Privacy badge, not in the `idle` panel.
    - graveyard-memory Requirement 9.2: load notes are not announced because they are in the Hero, which is read in order.
    - graveyard-memory Requirement 9.6: wherever it says the `idle` panel, read the Hero's Return notes.
3. THE design SHALL list every existing test assertion it amends, with the old and the new locator or expectation. An amendment SHALL change only how a control is found (its name, role or place) or replace an expectation that this spec makes false with one that states the new truth exactly. No assertion SHALL be removed, made optional or widened (for example by replacing an exact text with a regular expression that matches more).

### Requirement 13: Tests

**Phase:** A (Criterion 6 and the motion part of Criterion 5 are Phase B)

**User Story:** As the team, I want the new screen pinned down by tests, so that a later change cannot bring back the covered moon or a hidden privacy promise.

#### Acceptance Criteria

1. Component tests (Vitest, jsdom) SHALL render the Page and check on the Landing view: the heading outline of Requirement 1.2, exactly; the landmarks of Requirement 1.3; the Primary action's accessible name and that activating it shows "Reading US bank, signed amounts…" and then the outcome of today; the three Secondary samples, by name and order, and that each starts its Sample; that no button on the Landing view is named "US bank, signed amounts"; the Privacy badge text and that "Read the privacy note" moves focus to the Privacy note without changing `location.href`; the How it works text of Requirement 6.1, exactly; the Footer content of Requirement 8.1, with each link's `href`, `target`, `rel` and description; and the tab order of Requirement 10.1, exactly, with and without "Open the graveyard".
2. THE existing test "shows the heading, tagline, privacy sentence, inputs and samples" SHALL be amended so that `expect(screen.queryByRole("link")).toBeNull()` becomes: the Page has exactly two links, both inside the Footer, named and pointing as Requirement 8.1 says. `getByText(IDLE_SENTENCE)` SHALL become `getByText(PRIVACY_NOTE)` and `getByText(STATEMENT_TIP)`, each matching exactly one element. The `for (const sample of SAMPLES)` loop that finds each Sample button by `label` SHALL be replaced by: the Primary action by its exact name; the three Secondary samples by exact name and in `SAMPLES` order; and `expect(SAMPLES).toHaveLength(4)`. The check on `main`'s width SHALL move to every Non-landing view (Requirement 1.7). In `graveyard-memory-flow.test.tsx`, both `IDLE_SENTENCE` assertions (lines 238 and 447 at the time of review) SHALL be replaced by `PRIVACY_NOTE` and `STATEMENT_TIP`, each matching exactly one element.
3. Every test that today starts the US Sample from the `idle` state by the button name "US bank, signed amounts" (unit tests in `apps/web/src/slice` and `apps/web/e2e/demo-path.spec.ts` and `layout.spec.ts`) SHALL instead activate the Primary action by its accessible name. Tests that choose a Sample from a Non-landing gate SHALL stay as they are. Every later assertion of those tests SHALL stay as it is.
4. Component tests SHALL check that a Non-landing view (`results`, `no-subscriptions`, `error`, the Graveyard view) shows the Footer and the Privacy note, shows no Primary action, Hero line, Hero art, Privacy badge or How it works, and keeps its gate with four Sample buttons and "Read another statement" where it is shown today.
5. THE Playwright layout test SHALL cover Requirement 2.7 (the moon and its halo, over the Viewport set and the Non-landing viewport set), Requirement 3.10 (Hero art clear of text), Requirements 3.7 and 3.8 (the Fold), Requirement 4.3 (the Primary action is the only `--moss`-filled control, by computed style) and Requirement 10.6 (320×568 and 200 % text). It SHALL wait for `document.fonts.ready` and SHALL emulate `prefers-reduced-motion: reduce` for the box checks. *(Phase B:)* one run of the moon and Hero art checks at 1280×720 without reduced motion, 6 s after load, when all automatic motion has ended (Requirement 9.2). *(Amended by design review 1 #14.)* The test waits by polling until every animation in `document.getAnimations()` is finished, with a 5.5 s timeout, not for a fixed 6 s.
6. *(Phase B. Amended 2026-11-17: user asked for a cooler landing.)* Motion tests SHALL check Requirement 9:
    - **Finite and within 5 s.** A Playwright test at 1280×720 without reduced motion SHALL read, for every element of the Landing view, the computed `animation-name`, `animation-duration`, `animation-delay` and `animation-iteration-count`, and SHALL fail if any animation has an infinite count or delay + duration × count above 5 s. It SHALL also check `document.getAnimations()`: every `CSSAnimation` has a finite `effect.getComputedTiming().endTime` of at most 5000 ms. *(Amended by design review 1 #7.)* The check covers every animation in `document.getAnimations()`, not only `CSSAnimation`, and also checks that the backdrop fog bands do not move on the Landing view. It SHALL repeat both checks while the Primary action is hovered and while it has keyboard focus. A Vitest static check SHALL parse `landing-motion.css` and assert the same bound for every `animation` declaration, no `infinite`, and the 334 ms stop rule of Requirement 9.3.
    - **Reduced motion.** With `prefers-reduced-motion: reduce` emulated, `document.getAnimations()` SHALL hold no `CSSAnimation` or `CSSTransition` on the effect elements at load, on hover and on focus; the ghost's computed `transform` SHALL equal its final pose; and the bat SHALL have computed `opacity` 0.
    - **End state equals still state.** *(Amended by design review 1 #5 and #6: replaces the Screenshots bullet, which compared platform-specific pixel baselines and masked the effects it meant to compare.)* A Playwright test at 1280×720 SHALL read the computed `transform`, `opacity`, `text-shadow` and `box-shadow` of every effect element: after all automatic motion has ended they SHALL equal the values under `prefers-reduced-motion: reduce` exactly, and with every `CSSAnimation` paused at `currentTime` 0 they SHALL differ from them (the ghost behind the stone, the bat on the moon). No platform-specific pixel baseline SHALL be committed.
    - **Once per load.** A component test (jsdom) SHALL check that the effect elements carry `data-motion="play"` on the first Landing view and `data-motion="still"` after "Start again" (Requirement 9.5), and that the Primary action starts the analysis while `data-motion="play"`.
7. `apps/web/src/contrast.test.ts` SHALL check every new text and background pair (Requirement 10.2), including the effect pairs of Requirement 9.7 at their brightest values, and `apps/web/src/static-checks.test.ts` SHALL check Requirement 11.4. THE existing `@keyframes` (on `index.css`), storage, CSP and Netlify checks SHALL keep passing unchanged. `static-checks.test.ts` SHALL also check that `@keyframes` appears in no file under `apps/web/src` other than `slice/landing/landing-motion.css`, and that no file under `slice/landing/` calls `requestAnimationFrame` or `setInterval` (Requirement 9.6).
8. THE demo-path test SHALL keep its CSP, request, console and storage checks, unchanged, and SHALL also check that the landing makes no request before the Primary action is activated other than the allowed `dist` files. For that check the request listener SHALL be attached before `page.goto`, so requests made during load are recorded.
9. THE root `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` SHALL pass, and the Playwright tests SHALL pass with `npm run test:e2e --workspace @zombills/web`.
10. THE page-state reducer tests and property tests SHALL cover the `working` `origin` field: `start` sets `"landing"` exactly when the view was `idle` and the screen `main`, and `"other"` from `results`, `error`, `no-subscriptions` and the Graveyard view (including the Graveyard view while `idle`).
