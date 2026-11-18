# Requirements Document

## Introduction

The `pro-polish` feature brings every screen after the Landing view, and the site chrome around all screens, up to the finish of the Landing view that `landing-polish` shipped. The source is the user's brief of 2026-11-18, kept in this folder as `brief.md`. Its items R1 to R11 map to Requirements 1 to 11 below.

Problems seen on the built site at 1280×800 and 390×844 (results after Summon, after one Bury with "Seal the grave", the Graveyard view):

1. **The Non-landing header is a plain `--fog` box** (`slice-page.tsx`, the `header` with `h1` "Zombills", the tagline and `SavingsCounter`). It has no brand mark and no way home other than "Start again" at the bottom of the page.
2. **The Footer is a text block** (`SiteFooter`, `site-footer.tsx`): the Privacy note, "Built with Kiro." and two underlined links on a `bg-night/80` box. It does not look like part of the scene.
3. **The statement panel is a stack of plain boxes.** The gate on Non-landing views (`DropZone` and `SampleButtons` in a `bg-fog/95` box headed "Read another statement") and the Own-statement section (`OwnStatement`) show a dashed rectangle, a "Choose a file" button outside it and four full-width Sample buttons with technical names ("EU bank, semicolons").
4. **A shared link shows no preview.** `apps/web/index.html` has a title and a favicon only.
5. **Results and the Graveyard view sit on the old fixed scene.** `NightScene` pins the ridge and fence to the viewport on Non-landing views, the vignette and sky do not fade into the page, and `BurialStage` draws a hard-edged `rounded-2xl overflow-clip` box around the card and tombstone.
6. **Every button looks the same.** Most controls use one class string, `rounded border border-bone bg-fog px-4 py-2 text-bone` (in `rising-view.tsx`, `graveyard-view.tsx`, `memory-panel.tsx`, `cancel-helper.tsx`, `error-view.tsx`, `no-subscriptions-view.tsx`, `slice-page.tsx`), so "Next", "Open the graveyard", "Start again", "Unbury" and "Forget everything" have equal weight.
7. **Desktop width is wasted.** Non-landing `main` is `max-w-[640px]` at every width.
8. **"Seal the grave" leads with the email.** `CancelHelper` shows the cancel link and steps, then the full email text, Copy and "Open in my email app"; "Next" sits outside the panel, below the stage, in `RisingView`.
9. **The Graveyard view is one long `--fog` panel**: tombstones in a two-column list, "Not answered yet" as full rows with a button each, and the Memory panel with its full hint text always shown.
10. **Small rough edges**: the assumed-currency note reads like body text; "N of M answered" is a bare sentence; the undead card sways forever (`swayFor` in `undead-card.tsx`, `repeat: Infinity`), which makes it harder to click and breaks WCAG 2.2.2.
11. **The Landing view does not say it is free** and its Sample names are technical.

### What stays

- Every behaviour of the Page and its reducer (`page-state.ts`) that this spec does not name: the Analyzer, the Rising, the burial sequence, the Queue, Memory, the cancel helper's content, the Share panel and the share image, the Live region text, focus requests, and every message text not listed here.
- Money handling (`money.md`): integer cents, `Money` for every figure, no new arithmetic on amounts.
- Accessibility: one `h1`, no skipped heading level, keyboard reach, the `--moss` focus ring, contrast of at least 4.5:1 for all text (large text too, as landing-polish asks), WCAG 2.5.8 targets with 44 × 44 px for the new controls, and the reduced-motion rules of `spooky-design.md`.
- Privacy (`privacy.md`): no network request at runtime other than the same-origin `dist` files, no third-party asset, no new storage key. The `CSP_POLICY` string in `apps/web/csp-plugin.ts` stays as it is.
- No new dependency in any `package.json`, runtime or dev. All art is original SVG or CSS made for this project, using the seven colour tokens.
- The Landing view of landing-polish, except the copy and footer changes of Requirements 2, 3 and 11.
- Existing tests, including the 320×568 Fold check and every Playwright flow. Where this spec changes a behaviour, the assertion is amended to state the new truth exactly and the amendment is listed in the design with a note. No assertion is weakened, made optional or deleted.

### Decision: the home control is the `h1` on Non-landing views

The brief asks for the brand mark and wordmark as one control that returns home, and the Page must keep exactly one `h1` "Zombills" (graveyard-ui Requirement 1.1, landing-polish Requirement 1.2). On Non-landing views the `h1` therefore holds one native `button`, which holds the Brand mark and the visible word "Zombills". The button's accessible name is "Zombills, back to the start", which starts with its visible text (WCAG 2.5.3). A `button` is used, not a link, because going home changes the Page state and never the URL (graveyard-ui Requirement 1.9). The heading's accessible name becomes "Zombills, back to the start"; tests that find the Non-landing `h1` by name are amended to that name. The tagline is not shown in the compact header; it stays on the Landing view.

The other options were a visually hidden `h1` next to the button (rejected: screen readers would read "Zombills" twice) and an `h1` with no control (rejected: the brief asks for the mark itself to be the way home).

### Decision: the leave question tells the truth about what is lost

Going home runs the existing `reset` path: the Graveyard stays in the page, and the current statement's results are put away (the unanswered Queue and the skip order), so answering the rest needs the statement read again. The brief's sentence "Your answers are lost unless you remember your graveyard." is not true at the moment of leaving; answers are lost when the page is closed. `spooky-design.md` says copy states only facts. The question therefore names both losses: "Go back to the start? This statement's results are put away, and your answers are kept only until you close this page unless you remember your graveyard." It is asked only when there are results to lose, that is on `view.kind === "results"` (either screen). The buttons stay "Stay" and "Leave", as the brief asks; both are secondary and "Stay" takes focus. "Start again" keeps its behaviour of today and asks nothing.

### Decision: Sample names change at the source

The brief renames the Samples to plain names. The name the user clicks must match the name the app then reports ("Reading … …", the statement summary), so the Sample `label` in `apps/web/src/slice/samples.ts` changes, and `fileName` stays. This replaces the landing-polish Decision "the primary action keeps the Sample's source name". The Primary action's visible text, "Summon the undead" / "with a sample US bank statement", does not change. Tests that assert the old labels are amended to the new ones.

| `fileName` | Old `label` | New `label` |
| --- | --- | --- |
| `us-signed.csv` | US bank, signed amounts | US bank statement |
| `uk-debit-credit.csv` | UK bank, debit and credit columns | UK bank statement |
| `eu-semicolon.csv` | EU bank, semicolons | European bank statement |
| `with-preamble.csv` | Statement with a header block | Statement with extra top lines |

### Decision: the "Privacy note" tombstone moves focus to the Privacy note

The Footer keeps the Privacy note visible, word for word, below its row of tombstones. This is the "one short privacy line" of the brief, and the target of the Privacy badge's "Read the privacy note" (landing-polish Requirement 7.2). The "Privacy note" tombstone is a `button` that moves focus to that paragraph the same way. The other options were a disclosure (rejected: it hides the promise by default, which landing-polish already rejected) and a separate privacy page (rejected: a new public file and a navigation that could unload an in-memory Graveyard).

### Decision: the share preview image is committed, not built

Open Graph needs an absolute image URL, so `index.html` names `https://zombills.netlify.app/og-image.png`. The SVG source and the 1200×630 PNG are both committed under `apps/web/public`. Exporting the PNG at build time would need a rasteriser, which is a new dependency. The PNG is exported once with the Playwright already in the repo and committed. The preview is read by link-preview crawlers, never fetched by the Page at runtime, so the CSP and the runtime request checks are unchanged.

### Scope budget

The deadline is 4 Dec. This spec is sized for about 8 tasks.

- **Phase A (chrome and system):** Requirements 1, 2, 4, 6 and 11. About 4 tasks: the button variants; the compact header and leave question; the footer graveyard; the share preview and landing copy.
- **Phase B (screens):** Requirements 3, 5, 7, 8, 9 and 10. About 4 tasks: the statement panel; the scene and desktop layout; Seal the grave and the Graveyard view; the small polish. Phase B uses the variants of Requirement 6. Phase A does not depend on Phase B.

Requirements 12 and 13 cover both phases.

### Out of scope

- The share image of the Share panel (`share-card.ts`) and its layout.
- New Samples or changes to Sample file contents.
- The undead card's content, labels and answer pair, other than its motion (Requirement 10.4).
- Sound, a theme switch, a language switch, a favicon redesign.
- Routing or any URL change.

---
## Glossary

- **Page**, **Page state**, **Sample**, **drop area**, **file button**, **Analyzer**, **Graveyard**, **Graveyard view**, **Rising**, **Queue**, **Live region**, **Memory**, **Store**, **Answer record**: As defined in the vertical-slice, graveyard-ui and graveyard-memory Glossaries.
- **Landing view**, **Non-landing view**, **Hero**, **Primary action**, **Secondary samples**, **Own-statement section**, **Privacy badge**, **Privacy note**, **Tip**, **Card**, **Content box**, **Fold**: As defined in the landing-polish Glossary.
- **Screen state**: One row of the table in Requirement 6.4: the Page state, the screen (`main` or `graveyard`) and, on `results`, the Rising stage (`ask`, `rested`, `burying`, `buried`, all answered, no undead).
- **Compact header**: The `header` landmark on every Non-landing view (Requirement 1). It holds the Home control and the savings counter (`SavingsCounter`, the group "Saved per year").
- **Brand mark**: The `BrandMark` SVG of `apps/web/src/slice/landing/brand-mark.tsx`. Decorative, `aria-hidden="true"`.
- **Home control**: The native `button` inside the Non-landing `h1` that holds the Brand mark and the word "Zombills", with the accessible name "Zombills, back to the start".
- **Leave question**: The inline confirmation the Home control shows when the Leave rule holds (Requirement 1.4).
- **Leave rule**: The Page shows `results` (`model.view.kind === "results"`, on either screen). A pure function `shouldAskBeforeLeaving(model)` computes it from `model.view`.
- **Footer graveyard**: The new `SiteFooter` (Requirement 2): the Ground strip, the Footer tombstones and the Privacy note.
- **Footer tombstone**: One small tombstone-shaped control in the Footer graveyard. There are four, in this order: "Zombills on GitHub", "The Reaper", "Privacy note", "Built with Kiro".
- **Peek ghost**: The small decorative ghost that peeks from behind a Footer tombstone on hover or focus. It has the look of the Hero art ghost: cream (`--bone`), two oval eyes, no mouth.
- **Statement panel**: The panel where the user picks a statement: on the Landing view the Own-statement section, on Non-landing views the gate. It holds the Grave drop area, the hint, the Tip and the Sample chips (Requirement 3).
- **Grave drop area**: The drop area (`DropZone`, `data-focus="drop-zone"`) drawn as an open grave in SVG, with a Resting ghost and the "Choose a file" button inside it.
- **Resting ghost**: The small ghost lying in the Grave drop area. It rises while a file is dragged over the area.
- **Sample chip**: One small tombstone- or scroll-shaped `button` that starts a Sample, labelled with the Sample's new `label` (Decision "Sample names change at the source").
- **Statement disclosure**: The `button` "Try another statement" with `aria-expanded` that shows and hides the Statement panel and "Start again" on `results` and on the Graveyard view (Requirement 3.7).
- **Share preview**: The `meta` tags in `apps/web/index.html` and the preview image they name (Requirement 4).
- **Scene band**: On the Landing view, the ridge and fence band (`RidgeBand`) that scrolls with the page, and the sky (`LANDING_SKY_BACKGROUND`) that fades into `--night`. Requirement 5 applies it to Non-landing views.
- **Stage**: The area of `BurialStage` where the undead card is asked, sinks, and the tombstone rises, with its `Ground`.
- **Button variant**: One of `primary`, `secondary`, `tertiary` and `danger` (Requirement 6.1), applied through one shared class map or component.
- **Wide layout**: The Non-landing layout at viewport widths of 1024 px and more (Tailwind `lg`), Requirement 7.
- **Helper panel**: `CancelHelper` (`cancel-helper.tsx`), headed "Seal the grave" (`PANEL_HEADING`).
- **Email disclosure**: The `button` "Write to them instead" with `aria-expanded` inside the Helper panel that shows and hides the email text, Copy and "Open in my email app" (Requirement 8).
- **Waiting chip**: One compact `button` in "Not answered yet" of the Graveyard view showing a Display name and its yearly cost; activating it answers that subscription now (Requirement 9.3).
- **Progress dots**: The row of dots next to "N of M answered", one per risen subscription (Requirement 10.2).
- **Automatic motion**: Motion that starts without user input: here the undead card sway (Requirement 10.4).

---
## Requirements

### Requirement 1: The compact header and the way home

**Phase:** A · **Brief:** R1 · **Steering:** `product.md` (theme rule), `spooky-design.md` (accessibility rules)

**User Story:** As a user deep in my results or my graveyard, I want the Zombills mark at the top to take me back to the start, and to be asked first when leaving would put away this statement's results, so that I can always get home without losing work by surprise.

#### Acceptance Criteria

1. WHILE a Non-landing view is shown, THE Page SHALL show the Compact header in place of today's `bg-fog/95` header in `slice-page.tsx`: the Home control on the left and the savings counter on the right, in one row from 360 px of viewport width. Below 360 px the counter MAY wrap below the Home control. From 640 px (`sm`) the counter's currency lines SHALL sit in one row, not stacked. WHILE the counter shows at most two currency lines, the Compact header SHALL be at most 88 px tall at 640 px and wider at the default text size. It SHALL NOT show the tagline.
2. THE Home control SHALL be a native `button` inside the `h1`, holding the Brand mark (`aria-hidden="true"`, at least 32 px and at most 48 px square) and the visible text "Zombills" in IM Fell English. Its accessible name SHALL be exactly "Zombills, back to the start". The Page SHALL keep exactly one `h1` in every Page state and screen.
3. WHEN the Home control is activated AND the Leave rule does not hold, THE Page SHALL return to the Landing view at once and move focus to the Primary action, with the scroll of `focusAndReveal`. The Graveyard, Memory and the savings totals SHALL stay as they are. From `results` (on either screen), `error` and `no-subscriptions` this SHALL be the `reset` transition of `page-state.ts` with the focus target changed; from the Graveyard view while `idle` it SHALL be the `back-to-start` transition with the same focus target.
4. WHEN the Home control is activated AND the Leave rule holds, THE Page SHALL show the Leave question as the first child of `main`, without leaving the current view: a `role="group"` labelled by the text "Go back to the start? This statement's results are put away, and your answers are kept only until you close this page unless you remember your graveyard.", with the buttons "Stay" and "Leave" (both secondary), and SHALL move focus to "Stay". WHEN the Home control is activated again while the Leave question is open, THE Page SHALL keep it open and move focus to "Stay". THE Leave question SHALL close on any change of the Page state's kind (`view.kind`) or of the screen, and not on a change within one state kind (such as a burial step); WHEN it closes while focus is inside it, focus SHALL move to the Home control. *(Amended by design review 1 #6.)*
5. WHEN "Leave" is activated, THE Page SHALL act as Criterion 3. WHEN "Stay" is activated or Escape is pressed inside the Leave question, THE Page SHALL close the Leave question and return focus to the Home control. Nothing else SHALL change.
6. THE Leave question SHALL follow the pattern of today's Forget confirmation (`ForgetControl` in `memory-panel.tsx`): inline, no modal, no focus trap, and no Live region text (the focus move is the feedback).
7. WHILE the Page is `working` on a Non-landing view, THE Home control SHALL be `aria-disabled="true"` and do nothing, with focus kept, as graveyard-ui Requirement 14.2 says for the other controls.
8. THE Landing view SHALL keep the `LandingBanner` of today: the `h1` "Zombills" with no control in it, the tagline and the counter. The Home control SHALL NOT be shown on the Landing view.
9. "Start again" and "Back to the start" SHALL keep their behaviour of today and SHALL NOT show the Leave question.
10. *(PBT: Leave rule)* FOR ALL Page models built by folding generated `PageAction` sequences through `pageReducer` from `initialPageModel` of a generated `ReadResult` (a new Page-model arbitrary in `apps/web/src/slice/logic/test-arbitraries.ts`, built on its existing Graveyard, outcome and action arbitraries), `shouldAskBeforeLeaving(model)` SHALL equal `model.view.kind === "results"`, SHALL NOT throw, and SHALL NOT depend on `screen`, `graveyard`, `memory`, `focus` or `event`. A unit test SHALL check that the arbitrary produces every view kind and both screens.
11. *(PBT: going home keeps the Graveyard)* FOR ALL Page models from the arbitrary of Criterion 10 with a Non-landing view other than `working`, applying the go-home transition SHALL give a model whose view is `idle`, whose screen is `main`, whose focus request targets the Primary action, and whose `graveyard` and `memory` are deeply equal to the input's.

### Requirement 2: The Footer graveyard

**Phase:** A · **Brief:** R2 · **Steering:** `product.md` (theme rule), `privacy.md`, `spooky-design.md` (motion rules, what not to do)

**User Story:** As a judge, I want the footer to look like a small graveyard where every stone is a link, and as a user I want the privacy promise still in plain sight, so that the footer is part of the scene and still does its job.

#### Acceptance Criteria

1. THE Page SHALL show the Footer graveyard as the `footer` landmark after `main` on the Landing view and on every Non-landing view, replacing the text block of today's `SiteFooter`. It SHALL hold, in DOM order: the Ground strip (decorative, `aria-hidden`), a list (`ul`) of the four Footer tombstones with the accessible name "Site links", and the Privacy note. It SHALL add no heading, so the heading outline of every view is unchanged.
2. THE Footer tombstones SHALL be, in this order and with this visible text:

    | # | Visible text | Element | Target or action |
    | --- | --- | --- | --- |
    | 1 | Zombills on GitHub | `a` | `https://github.com/zaxcoraider/zombills` |
    | 2 | The Reaper | `a` | `https://github.com/zaxcoraider/zombills-reaper` |
    | 3 | Privacy note | `button` | moves focus to the Privacy note (Criterion 5) |
    | 4 | Built with Kiro | `a` | `https://kiro.dev` |

3. THE Reaper tombstone's description SHALL be shown as visible text of at least 0.875 rem, the one-line description "A Kiro Crew app that watches for new statements each month and drafts cancellation emails when you ask.", spanning the full width directly under the tombstone list (so it never makes one grid cell taller than the others). It SHALL be referenced from the link with `aria-describedby`, together with the new-tab text.
4. Each link of Criterion 2 SHALL open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`), SHALL have `NEW_TAB_TEXT` ("(opens in a new tab)") referenced with `aria-describedby`, and its accessible name SHALL start with its visible text.
5. WHEN the "Privacy note" tombstone is activated, THE Page SHALL move focus to the Privacy note with `focusAndReveal` on the same ref the Privacy badge uses, with an instant scroll WHILE reduced motion is preferred. THE URL SHALL NOT change and the Live region SHALL say nothing.
6. THE Privacy note SHALL stay one paragraph with exactly the text of `PRIVACY_NOTE` and `tabindex="-1"`, below the tombstone row, at least 0.875 rem. It is the one privacy line of the Footer; the Footer SHALL contain no other privacy sentence.
7. Each Footer tombstone SHALL be drawn with inline SVG or CSS shapes from the seven tokens (a rounded-top stone on a Ground strip of grass and earth), with its text as real HTML text on the stone, not inside the SVG. The whole stone SHALL be the control's hit area, at least 44 × 44 px, and at least 96 px wide at 390 px of viewport width.
8. WHEN a Footer tombstone is hovered by a `(hover: hover)` pointer or has `:focus-visible`, THE stone SHALL lift by at most 4 px and a Peek ghost SHALL rise from behind it by at most 12 px, both with Framer Motion (`tech.md`: CSS keyframes and transitions are allowed only in `landing-motion.css`), at most 300 ms, that holds while hover or focus holds and returns when it ends. The ghost and lift SHALL stay inside the footer's own box and SHALL NOT cover any text Content box. A tap on a touch screen SHALL NOT leave the stone lifted or the Peek ghost shown; the spec relies on Framer Motion's `whileHover` ignoring touch input for this.
9. WHILE reduced motion is preferred, THE Footer tombstones SHALL NOT move and THE Peek ghost SHALL NOT move or appear by motion; hover and focus SHALL instead change only the stone's outline or fill colour (from `--fog` to a `--moss` outline), with at most a 150 ms opacity fade and no change of position, scale or rotation.
10. WHEN the viewport is narrower than 640 px, THE four Footer tombstones SHALL sit in a 2 × 2 grid in the order of Criterion 2 read row by row. From 640 px they SHALL sit in one row. At 320×568 and at 390×844 with 200 % root font size, the Footer SHALL cause no sideways scroll and clip no text.
11. THE Footer text SHALL meet a contrast of at least 4.5:1 against the stone, the Ground strip or the scene behind it, at rest and in the hover and focus state. THE focus ring SHALL be the `--moss` ring of `spooky-design.md` and SHALL NOT be hidden by the Peek ghost.
12. THE Footer SHALL load nothing: no image file, no icon font, no third-party badge or widget, no Kiro or GitHub logo. Opening the Page SHALL make no request to `github.com`, `kiro.dev` or any other host.
13. THE Footer SHALL NOT contain "Built with Kiro." as a separate sentence; the "Built with Kiro" tombstone replaces it. `BUILT_WITH_KIRO`, `REPO_LINK`, `REAPER_LINK` and `REAPER_DESCRIPTION` in `landing-text.ts` SHALL be updated to the texts and targets of Criteria 2 and 3, and a new `KIRO_LINK` SHALL be added.
14. Every Footer tombstone does work under the theme rule of `product.md`: it is a control, and its lift and Peek ghost give hover and focus feedback.

### Requirement 3: The Statement panel

**Phase:** B · **Brief:** R3 · **Steering:** `product.md` (must-have: drag-and-drop upload, built-in samples; theme rule), `spooky-design.md`, `privacy.md`

**User Story:** As a user with a statement file, I want the place to drop it to look like part of the graveyard, to tell me where to get a CSV, and to answer when I drag a file over it, so that reading my own statement feels as easy as trying a sample.

#### Acceptance Criteria

1. THE Statement panel SHALL show, in this order: its heading; the hint "Most banks let you download your transactions as a CSV file. Look for Export or Download in online banking."; the Tip; the Grave drop area; and, on Non-landing views only, the Sample chips. The heading SHALL be the `h2` "Or use your own statement" on the Landing view (replacing "Or read your own statement") and "Try another statement" on Non-landing views (replacing "Read another statement", and shown on `error` and `no-subscriptions` too).
2. THE Tip SHALL be exactly "Tip: 2 to 3 months of transactions works best." (the new `STATEMENT_TIP`). It SHALL appear once per page.
3. THE Grave drop area SHALL be `DropZone` with its behaviour of today unchanged: `role="button"`, `data-focus="drop-zone"`, the accessible name "Drop area: choose or drop a CSV statement", Enter and Space open the picker, the drag depth counter, the drag-over text "Release to read this file", the `working` text "Reading…", `accept=".csv,text/csv"`, and a drop outside it ignored (vertical-slice Requirement 2.6). Only its drawing, the place of "Choose a file", the element that holds the drag handlers (Criterion 5) and the resting text on devices without hover (Criterion 14) SHALL change.
4. THE Grave drop area SHALL be drawn as an open grave in inline SVG (`aria-hidden="true"`, tokens only, no text in the SVG): an earth rim around a dark pit, with the Resting ghost lying in it. Its visible text SHALL be HTML text over the drawing, with a contrast of at least 4.5:1 against the pit. Its outline SHALL have a contrast of at least 3:1 against the scene (WCAG 1.4.11), as the dashed border of today does.
5. THE "Choose a file" button SHALL sit inside the Grave drop area's box as a secondary button (Requirement 6), SHALL NOT be a descendant of the `role="button"` element (no nested interactive controls), and SHALL keep its behaviour. The `role="button"` element and the button SHALL be siblings in one wrapper, with the button placed over the grave's drawing. The drag and drop handlers and the drag depth counter SHALL sit on that wrapper, so the whole drawn grave is the drop target; `role="button"`, its name and its keyboard behaviour SHALL stay on the inner element.
6. WHILE a file is dragged over the Grave drop area AND it is not disabled, THE Resting ghost SHALL rise out of the pit by 16 to 32 px and the grave rim SHALL glow `--moss`; WHEN the drag leaves or the file is dropped, they SHALL return to rest. The motion SHALL use Framer Motion with the spring or tween values of `spooky-design.md` and SHALL be at most 400 ms. WHILE reduced motion is preferred, THE ghost SHALL NOT move; the rim SHALL change to `--moss` with an opacity fade of at most 150 ms. The drag-over state SHALL also be shown in text (Criterion 3), so it never relies on colour or motion.
7. WHILE the Page shows `results` (either screen) or the Graveyard view, THE Statement panel and "Start again" SHALL be inside the Statement disclosure: an `h2` holding a native `button` "Try another statement" with `aria-expanded` and `aria-controls`, collapsed on first show of each view, with the collapsed content `hidden` (not merely transparent). Inside the disclosure, its `h2` "Try another statement" is the Statement panel's heading; the panel SHALL NOT repeat it. On `error` and `no-subscriptions` THE Statement panel SHALL be shown open, with no disclosure, so the user can try again at once.
8. WHEN "Try another statement" is activated, THE disclosure SHALL toggle and focus SHALL stay on its button. WHEN a focus request targets the drop area while the disclosure is collapsed, THE disclosure SHALL open first so the request lands. WHEN a `dragenter` event whose `dataTransfer.types` includes `"Files"` reaches the window while the disclosure is collapsed AND the Page is not `working`, THE disclosure SHALL open, so a new drop can replace the result (vertical-slice Requirement 4.11); focus SHALL NOT move.
9. ON Non-landing views, THE Sample chips SHALL replace the four full buttons of `SampleButtons`: a list (`ul`) with the accessible name "Sample statements", of four native `button` elements in `SAMPLES` order, each labelled with its Sample `label` (Decision "Sample names change at the source"), each shaped as a small tombstone or scroll in SVG or CSS (`aria-hidden` art, HTML text), each at least 44 × 44 px, wrapping to as many rows as needed. They SHALL start their Sample as the Sample buttons do today, and be `aria-disabled` WHILE `working`.
10. ON the Landing view, THE Secondary samples SHALL keep their place and look of landing-polish Requirement 5, with the new labels; the Own-statement section SHALL show no Sample chips, so no Sample is offered twice on the Landing view.
11. THE heading "Or try a sample statement" of `SampleButtons` SHALL be replaced on Non-landing views by the chips' list name; the heading outline SHALL skip no level.
12. Every spooky element of the Statement panel does work under the theme rule: the open grave marks where a statement goes, the Resting ghost rising confirms a file is over the area, and the chip shapes mark the Samples as the app's own graveyard records.
13. A file dropped anywhere inside the Grave drop area's box, including on "Choose a file", SHALL be read, and the drag-over state SHALL hold while the pointer is anywhere inside that box. A component test SHALL drop a file on "Choose a file" and check that it is read and that moving the drag onto the button keeps the drag-over text.
14. WHILE the device has no hover (`(hover: none)`), THE Grave drop area's resting text SHALL be "Tap to choose a CSV statement" in place of "Drop a CSV statement here". The drag-over text, the `working` text and the accessible name SHALL stay as in Criterion 3.

### Requirement 4: The Share preview

**Phase:** A · **Brief:** R4 · **Steering:** `privacy.md`, `spooky-design.md` (tokens, no logos), `tech.md` (Netlify static hosting)

**User Story:** As someone who shares the Zombills link, I want the preview to show the haunted graveyard and the pitch, so that people know what they are clicking.

#### Acceptance Criteria

1. `apps/web/index.html` SHALL contain, in its `head`: `<meta name="description">` with the content "Your bank statement is haunted. Zombills finds the subscriptions still feeding on you, in your browser. Your statement never leaves your device."; `og:type` `website`; `og:title` "Zombills"; `og:description` the same content as the description; `og:url` `https://zombills.netlify.app/`; `og:image` `https://zombills.netlify.app/og-image.png`; `og:image:type` `image/png`; `og:image:width` 1200; `og:image:height` 630; `og:image:alt` "A ghost rising from a tombstone under the moon, with the words Zombills and Your bank statement is haunted."; `twitter:card` `summary_large_image`; and `twitter:title`, `twitter:description` and `twitter:image` matching the Open Graph values.
2. THE preview image SHALL be original art drawn for this project: `apps/web/public/og-image.svg` as the source and `apps/web/public/og-image.png`, exactly 1200 × 630 px and at most 300 KB, exported from it. It SHALL show the night sky, the moon, a tombstone, the cream ghost with two oval eyes and no mouth, a `--moss` glow, the word "Zombills" in IM Fell English and the tagline "Your bank statement is haunted.". It SHALL use the seven colour tokens' hex values and SHALL contain no service logo, no Kiro or GitHub logo and no statement data.
3. THE SVG source SHALL have no external reference (`href` or `url()` other than a `#` fragment in the same file) and no `<script>`, `<foreignObject>` or embedded raster image. Its text SHALL be converted to paths (no `<text>` element), so the PNG shows the display face without a font. The art rules of Requirement 12.3 that fit inline SVG in components (`aria-hidden`, `useId`, no text) do not apply to this file; this criterion and Criterion 2 are its rules.
4. THE PNG SHALL be committed. The export MAY be a Playwright spec run by hand and kept out of the default e2e run (for example tagged and skipped unless an environment variable is set), which renders the SVG with the existing Playwright dev dependency; no new dependency SHALL be added.
5. THE `CSP_POLICY` string, `injectCsp` and the Netlify headers SHALL stay unchanged. THE Page SHALL NOT request `og-image.png` or `og-image.svg` at runtime; the demo-path request check SHALL keep passing unchanged.
6. THE new absolute URLs SHALL be in `index.html` only. The static check of landing-polish Requirement 11.4 on `apps/web/src` SHALL be amended to allow exactly the Footer URLs of Requirement 2.2 (three, with `https://kiro.dev`).
7. A Playwright spec, run against the built site the e2e run already serves, SHALL read the served `index.html` and check every tag and value of Criterion 1, that `og-image.png` is served from `dist` as a PNG of 1200 × 630 px (read from its IHDR chunk) and at most 300 KB, and that the CSP `meta` tag still comes directly after `<meta charset>` (`injectCsp`), before every new tag. The root `npm test` SHALL NOT need a built web app.

### Requirement 5: The night scene on Non-landing views

**Phase:** B · **Brief:** R5 · **Steering:** `spooky-design.md` (motion rules, fog never obscures content), `product.md` (theme rule)

**User Story:** As a judge moving from the landing into the results, I want the same night scene to carry on, so that the app feels like one place and not a landing page bolted onto an older app.

#### Acceptance Criteria

1. WHILE a Non-landing view is shown, THE `NightScene` SHALL use the Scene band of the Landing view: the sky on the fixed layer fading into `--night` (`LANDING_SKY_BACKGROUND` or a variant of it), and the ridge and fence (`RidgeBand`) in the document flow, so they scroll with the page. On Non-landing views the ridge band SHALL sit directly before the Footer and SHALL NOT intersect any Content box. The fixed ridge, fixed fence and fixed `Ground` of today (`BackdropLayers` with `ridge`, and `Ground` in the second fixed layer) SHALL NOT be drawn on Non-landing views.
2. ON Non-landing views, no horizontal edge of a backdrop layer SHALL stay pinned to the viewport while the page scrolls: the layout test SHALL scroll a `results` view and a Graveyard view at 1280×800 and 390×844 by `min(400, scrollHeight − innerHeight)` px, which SHALL be at least 100 px (the test builds a Graveyard tall enough), and check that the ridge band's box moves by the scroll amount (±1 px).
3. ON Non-landing views, THE moon MAY keep the Non-landing rules of landing-polish Requirement 2.3. THE ambient fog bands SHALL rest in their reduced-motion pose, with no drift, as landing-polish already does on the Landing view (WCAG 2.2.2), and no fog layer SHALL lower the contrast of any text below 4.5:1 (landing-polish Requirement 10.2). A Playwright test SHALL check on a `results` view and a Graveyard view, without reduced motion, that each fog band's computed `transform` is the same 10 s apart.
4. THE Stage SHALL have no hard-edged box: the `rounded-2xl` clip box of `BurialStage` SHALL NOT draw a visible edge, background or border against the scene. The Stage MAY keep clipping at the ground line for the sink (the card disappears into the earth) and MAY keep `Ground` as its own earth band, provided its top and side edges blend into the scene (a gradient to transparent of at least 24 px) and no straight dark rectangle is visible behind the card or the tombstone.
5. THE burial sequence (`condemned`, `sinking`, `closing`, `buried`), `SinkCrumbs`, `BurialMound`, the card's sink at the ground line and the tombstone's rise SHALL behave as today, with the same timings and the same reduced-motion behaviour.
6. THE layout test SHALL check, at 1280×800 and 390×844 with reduced motion emulated, in the `ask` and `buried` stages, that the Stage's own box has computed `background-color` transparent, `border-width` 0 and no `box-shadow`, and that the Stage's `Ground` has no `box-shadow` and a background whose first stop is transparent with the next stop at least 24 px further on. The existing test "results view keeps the fixed fence and has no ridge band" SHALL be amended to state the new truth: the results view has the ridge band in the flow and no fixed fence.

### Requirement 6: Button variants

**Phase:** A · **Brief:** R6 · **Steering:** `spooky-design.md` (tokens, focus ring, contrast), `tech.md` (Tailwind, no component library), `structure.md` (naming)

**User Story:** As a user, I want the one thing I should do next to stand out and the risky actions to look risky, so that I never have to read every button to find my way.

#### Acceptance Criteria

1. THE web app SHALL define four Button variants in one place (a `button-variants.ts` class map or a `Button` component under `apps/web/src/slice/`), built with Tailwind classes and the tokens:
    - **primary**: `--moss` fill, `--night` text, semibold;
    - **secondary**: transparent or `--fog` fill, a `--bone` outline of 1 px at an alpha that meets Criterion 4, `--bone` text;
    - **tertiary**: no fill, no border, `--bone` underlined text, like a text link;
    - **danger**: no fill, a `--blood` outline and `--blood` text, or the same at a quieter alpha ("quiet danger") that still meets Criterion 4.
2. Every variant SHALL have a minimum height of 44 px and a minimum width of 44 px, the same corner radius (one token for primary, secondary and danger), the same horizontal padding, the focus ring of `spooky-design.md` on `:focus-visible` (the `--moss` glow with a 2 px offset; `BARE_FOCUS` where the button sits on the bare scene), and an `aria-disabled` look that keeps a contrast of at least 4.5:1 for its text.
3. Every `button`, and every `a` styled as a button, in `apps/web/src/slice/**` SHALL use a Button variant, except: the controls of `UndeadCard` (whose answer pair "Yes, let it rest" / "No, bury it" and "Skip for now" keep their look of today, as the brief asks), the Primary action, the Secondary samples, the Sample chips, the Footer tombstones, the Home control, the Grave drop area and the Waiting chips, which have their own designed look. The card's moss "No, bury it" SHALL carry `data-variant="primary"` while keeping its look, and the card's answer block (the answer pair and "Skip for now") SHALL be hidden once the card's phase is not `undead`, so no moss control stays on screen during `condemned` and `sinking`. A static check SHALL find that every `button`, and every `a` styled as a button, under `apps/web/src/slice/**` outside the exempt list carries `data-variant`.
4. Every variant's text SHALL have a contrast of at least 4.5:1 against its own fill, or against the surface or scene behind it when it has no fill, at rest, on hover, on focus and when `aria-disabled`. A variant's outline SHALL have a contrast of at least 3:1 against what is next to it (WCAG 1.4.11). `apps/web/src/contrast.test.ts` SHALL check each variant pair against `--fog`, `--night` and the lightest scene colour where the variant is used on the bare scene.
5. IN every Screen state, at most one control SHALL carry `data-variant="primary"` or use the `bg-moss` fill, and in the states marked below exactly one SHALL. The assignments SHALL be:

    | Screen state | Primary | Secondary | Tertiary | Danger |
    | --- | --- | --- | --- | --- |
    | Landing view | the Primary action (landing-polish) | "Choose a file" | — | — |
    | `results`, `ask` | "No, bury it" (card pair, unchanged) | "Open the graveyard", "Memory settings" | "Try another statement", "Start again" | — |
    | `results`, `rested` | "Next" or "Visit the graveyard" | "Open the graveyard", "Memory settings" | as above | — |
    | `results`, `burying` | "Next" (`aria-disabled`); the card's answer block is hidden | as above | as above | — |
    | `results`, `buried` | "Next" or "Visit the graveyard", inside the Helper panel (Requirement 8.4) | "Open the graveyard", the cancel link's button-styled actions | as above | — |
    | `results`, all answered | "Visit the graveyard" | "Memory settings" | as above | — |
    | `results`, no undead | none | "Open the graveyard" when shown | as above | — |
    | `working` | none (all controls of the state content `aria-disabled`; the Footer tombstones stay active) | — | — | — |
    | `error`, `no-subscriptions` | "Start again" | "Choose a file", "Open the graveyard" | — | — |
    | Graveyard view with tombstones | the Share panel's next step: "Make an image" before an image exists, then "Share image" or "Save image" (and "Make the image again" turns secondary) | "How to cancel", "Back to the rising" / "Back to the start", "Bury after all" | "Try another statement", "Start again" | "Unbury" (quiet), "Forget everything" |
    | Graveyard view, nothing buried | none | as above | as above | "Forget everything" when shown |
    | Leave question open | none inside it | "Stay", "Leave" | — | — |
    | Forget confirmation open | none | "Cancel" | — | "Forget" |

    Rows marked "none" have no primary control; every other row has exactly one. *(Assumption: the brief's "exactly one primary per screen state" is read as "at most one, and exactly one where a next step exists", since the empty and `working` states have no next step to promote.)* While a Leave question or Forget confirmation is open, its row applies to the controls inside it, and the rest of the screen keeps its row, including its one primary control. "Stay" takes focus when the Leave question opens (Requirement 1.4).

6. THE "Next" button SHALL keep `aria-disabled="true"` WHILE `burying`, as today, and keep the primary look with the disabled styling of Criterion 2.
7. *(PBT: one primary)* A component test SHALL render the Page in each Screen state of Criterion 5 (reached by dispatching actions from the US Sample results, and from generated Graveyards from `test-arbitraries.ts` for the Graveyard view rows) and SHALL count elements carrying the primary variant's marker attribute `data-variant="primary"`, and interactive elements (`button`, `a[href]`, `[role=button]`, `input`) with the `bg-moss` fill, so decorations such as filled Progress dots are not counted *(Amended by design review 1 #9)*: each count SHALL be 0 in the "none" rows and 1 in all others. For the Graveyard view rows it SHALL run as a fast-check property over generated Graveyards with at most 20 records; that property MAY render the Graveyard view component alone, with the view data the Page would derive, instead of the whole Page. *(Amended by design review 1 #16.)*

### Requirement 7: The Wide layout

**Phase:** B · **Brief:** R7 · **Steering:** `spooky-design.md` (cards stack to one column at mobile widths, 8 px grid)

**User Story:** As a user on a laptop, I want the card and my running totals side by side, so that I can answer and see the effect without scrolling.

#### Acceptance Criteria

1. WHEN the viewport is at least 1024 px wide AND the Page shows `results` on the main screen, THE Rising SHALL use two columns inside a `main` of at most 1120 px content width: the Stage (the undead card, the tombstone, and the Helper panel below them) in the left column, and the summary panel of `RisingView` ("Recurring charges found", the statement summary, "Still draining", the progress line, "Open the graveyard", the Memory line) with the Statement disclosure in the right column. `RisingView` SHALL take the Statement disclosure as a slot (a prop from `slice-page.tsx`) and render it after the Stage in the DOM, in one grid with the named areas `summary`, `stage` and `statement`. The right column SHALL be at least 20 rem wide; only the summary panel MAY stick to the top of the viewport while the left column scrolls.
2. WHEN the viewport is at least 1024 px wide AND the Graveyard view is shown, THE tombstones SHALL sit in a grid of at least three columns at 1280 px and at least four at 1600 px, inside a `main` of at most 1120 px content width. An open Helper panel SHALL span the full row, as today.
3. THE DOM order SHALL stay as today: in `RisingView`, the summary panel before the Stage; so keyboard and screen-reader order are unchanged at every width. WHERE the Wide layout places the summary in the right column, it SHALL do so with CSS grid placement, and THE tab sequence SHALL be: the summary panel's controls ("Open the graveyard", "Memory settings"), then the Stage's controls, then "Try another statement", then "Start again" when the disclosure is open. *(Assumption: the brief's "card on the left" is met visually with `grid-column` placement, while the reading order stays summary then card.)*
4. Below 1024 px THE Non-landing views SHALL keep their single column and their order of today, at `max-w-[640px]` (landing-polish Requirement 1.7), with no change at 390×844 other than the components this spec restyles.
5. `working`, `error` and `no-subscriptions` SHALL keep the single column at every width.
6. THE layout test SHALL check at 1280×800 and 1600×900 that the Stage's box and the summary panel's box do not overlap and sit side by side (the Stage's right edge left of the summary's left edge), that each undead card and the tombstone are wholly inside the viewport and the Stage after Next and Skip (amending the existing test "each card is whole inside the stage and the viewport, also after Next and Skip" to run at these sizes too), and at 1280×800 that the Graveyard view grid has at least three tombstones on its first row when at least three are buried.

### Requirement 8: Seal the grave

**Phase:** B · **Brief:** R8 · **Steering:** `product.md` (cancel helper: cancel URLs first, email template for the rest; no auto-cancellation), `privacy.md`

**User Story:** As a user who has just buried a subscription, I want the way to cancel it first and the email only if I need it, with the next card one obvious click away, so that sealing the grave is quick.

#### Acceptance Criteria

1. WHEN the Helper panel is shown for a Cancel entry (`help.kind === "link"`), it SHALL show, in this order: the heading "Seal the grave"; `panelLine(displayName)`; the cancel link; the steps; the app-store note and links when they apply; the checked line when present; and then the Email disclosure. `LINK_INTRO` ("Or ask them in writing:") SHALL be removed from the visible flow, since the Email disclosure's label replaces it.
2. THE Email disclosure SHALL be a native `button` "Write to them instead" with `aria-expanded` and `aria-controls`, collapsed on first show, and its accessible name SHALL be `withFor("Write to them instead", displayName)`. Its content SHALL be today's `BRACKETS_NOTE`, the email text (`data-email-text`, selectable), the Copy button, "Open in my email app" and `MAILTO_HINT`, with their behaviour, names and Live region notices of today (cancel-helper Requirements 7 and 8). The collapsed content SHALL be `hidden`.
3. WHEN the Helper panel is shown with no Cancel entry (`help.kind === "email-only"`), THE email part SHALL be shown open with no disclosure, after `EMAIL_ONLY_INTRO`, because the email is the only help there is.
4. ON the Rising, WHEN the stage is `buried`, THE "Next" button (or "Visit the graveyard" when the Queue is empty) SHALL be the last control inside the Helper panel, as the primary variant, and SHALL NOT also be shown below the Stage. WHEN the stage is `rested` or `burying`, "Next" SHALL stay where it is today, below the Stage. Its behaviour (`next` or `open-graveyard`, `aria-disabled` WHILE `burying`) SHALL stay as today.
5. IN the Graveyard view, THE Helper panel opened by "How to cancel" SHALL have the same order and Email disclosure, and SHALL have no "Next".
6. THE Helper panel SHALL keep its `section` with `aria-labelledby`, its heading's accessible name `${PANEL_HEADING}: ${displayName}`, its `NEW_TAB_TEXT` description on each external link, and its `helperPanelMotion` entrance. It SHALL be drawn on the `--fog` Card surface with no hard-edged dark box around it other than its own rounded Card.
7. THE existing focus target after a burial (the stage tombstone: `reachBuried` requests `"tombstone"`, graveyard-ui Requirement 5.5) SHALL stay. From the stage tombstone, which has focus after the rise, "Next" SHALL be reached after the cancel link, each App-store link and "Write to them instead": 3 Tab presses when `appStoreMayApply` is false, 5 when it is true.
8. Tests in `cancel-helper.test.tsx` that find the email text, Copy or "Open in my email app" SHALL be amended to open the Email disclosure first for link entries. No assertion on their text, `href` or notices SHALL change. The layout test "Helper panel fits … at 390x844 with 200% text" (`layout.spec.ts`) SHALL be amended to open "Write to them instead" before measuring, so it still measures the long email lines (cancel-helper Requirement 8.6), and the design SHALL list this amendment.

### Requirement 9: The Graveyard view

**Phase:** B · **Brief:** R9 · **Steering:** `product.md` (graveyard view with total saved; the metaphor is the UI), `privacy.md` (opt-in `localStorage` only), `money.md`

**User Story:** As a user looking back at what I buried, I want my tombstones standing in a row on the ground, what is still waiting as quick chips, and memory as one clear switch, so that the graveyard reads at a glance.

#### Acceptance Criteria

1. THE `GraveyardView` SHALL show the tombstones as a grid (`ul`) whose items stand on one drawn ground line per row (a `Ground`-style strip of grass and earth under each row, decorative, `aria-hidden`), wrapping to new rows: one column below 640 px, two from 640 px, and the Wide layout columns of Requirement 7.2. The heading "Your graveyard" (`font-display`, focus target `graveyard-heading`) and the "You buried … a year." lines SHALL stay first, with their text and `Money` figures of today.
2. Each tombstone SHALL keep its actions in this order: "How to cancel" (secondary, with `aria-expanded`, unchanged behaviour) and "Unbury" (quiet danger, accessible name "Unbury <Display name>", unchanged behaviour). Ended subscriptions SHALL keep showing no "How to cancel", as today. *(The brief lists Unbury first; this spec puts the non-destructive action first so a keyboard user meets it first. Assumption: order is not part of the brief's intent.)*
3. "Not answered yet" SHALL keep its `h3` and show each queued subscription as a Waiting chip: a native `button` with visible text "<Display name> · <yearly cost> a year" (with "about " and " (estimate)" exactly as today when `cadenceAssumed`), accessible name "Answer now " followed by the exact visible text (so it contains the visible text, WCAG 2.5.3), at least 44 px tall, in a wrapping row. Activating it SHALL dispatch `answer-now` as the "Answer now" button does today. Tests that find "Answer now <Display name>" by exact name SHALL be amended to the new exact name.
4. THE Memory panel (`MemoryPanel`) SHALL show, in this order: the `h3` "Memory"; one toggle for `MEMORY_LABEL` ("Remember my graveyard on this device"); one short sentence under it, `MEMORY_SHORT` = "Kept only in this browser, on this device."; a "What is kept?" disclosure (native `button`, `aria-expanded`, collapsed on first show) whose content is today's `MEMORY_HINT`, word for word; then the load, storage and left-out notes; then "Forget everything" (danger) and its confirmation, unchanged.
5. THE toggle SHALL stay a native `input type="checkbox"` (visually a switch is allowed, with `role="switch"` only if the design keeps `checked` and the change event unchanged), SHALL keep the focus target `memory-checkbox`, SHALL be described by the short sentence and by `MEMORY_HINT` (`aria-describedby` with both ids, in that order; a referenced `hidden` element still gives its text, so graveyard-memory Requirement 1.5 keeps holding), and SHALL dispatch `set-memory` exactly as today. The "Memory settings" button of the Rising SHALL still move focus to it.
6. WHEN "What is kept?" is collapsed, `MEMORY_HINT` SHALL be in the DOM and `hidden`. THE privacy claim of the short sentence SHALL be true with Memory on or off, and SHALL make no claim beyond `MEMORY_HINT` (no "private", "secure", "encrypted", "anonymous", graveyard-memory Requirement 1.8).
7. "Back to the rising" SHALL be the secondary variant and stay the last control of the view. "Back to the start" (when the Graveyard view is shown from `idle`) SHALL be the secondary variant too. "Bury after all" in "Resting" SHALL be secondary. The `bg-fog/95` single panel around the whole view MAY be split into Cards per section, or removed where text sits on a surface that meets the contrast rule.
8. THE Share panel, "Resting", "Already stopped" and their text SHALL stay as today, restyled with Button variants only.
9. Tests in `graveyard-view.test.tsx`, `memory-panel.test.tsx` and `graveyard-memory-flow.test.tsx` that find `MEMORY_HINT` by text SHALL be amended to open "What is kept?" first, or to query it including hidden elements, with the exact text kept.

### Requirement 10: Small polish on the Rising

**Phase:** B · **Brief:** R10 · **Steering:** `spooky-design.md` (motion rules, reduced motion, tabular numbers), WCAG 2.2.2

**User Story:** As a user answering cards, I want notes to stay out of the way, to see how far along I am, and the card to hold still when I go to click it, so that answering is calm and easy.

#### Acceptance Criteria

1. THE assumed-value notes of `assumedValueNotes` (including "No currency was found in the statement, so amounts are shown in …") SHALL be shown in `StatementSummary` and `NoSubscriptionsView` as a muted footnote: at most 0.875 rem (not below 0.8125 rem), a `--bone` mix that keeps a contrast of at least 4.5:1, after the main summary line. Their text SHALL stay exactly as today.
2. "N of M answered" SHALL keep its text, and SHALL be followed by the Progress dots: `M` dots in the original Rising order (the order the subscriptions rose in, not `rising.order` after "Skip" or "Answer now"), a dot filled `--moss` for each answered subscription and an outline dot for each unanswered one, `aria-hidden="true"` (the text carries the count). WHEN `M` is more than 12, THE dots SHALL be replaced by a single bar of the same meaning, so the dots or bar element itself never wraps at 320 px at the default text size.
3. *(PBT: Progress dots)* FOR ALL Page models in `results` with `M` risen subscriptions, a pure function `progressDots(model)` SHALL return an array of length `M` when `M ≤ 12` and `null` otherwise, with exactly `answeredCount` entries marked filled, and the filled count SHALL equal the number in the visible text.
4. THE undead card sway (`swayFor` in `undead-card.tsx`) SHALL be finite: it SHALL stop within 5 s of the card reaching its `undead` phase (WCAG 2.2.2), for example by a finite `repeat` that ends in the rest pose (`rotate: 0`). WHILE the card is hovered by a non-touch pointer or any control inside it has `:focus-visible`, it SHALL settle at once to the rest pose (`rotate: 0`), and SHALL NOT start again after it has stopped, so the card never stays tilted. Focus on the card heading (the focus target when a card is shown) SHALL NOT settle it. *(Amended by design review 1 #1.)*
5. WHILE reduced motion is preferred, THE card SHALL show no sway, as today.
6. THE rise, sink and condemn motion of the card, and its timings, SHALL stay as today.
7. A Vitest test SHALL check that the sway transition's `repeat` is finite and that `delay + duration × (repeat + 1)` is at most 5 s, and a Playwright test at 1280×800 without reduced motion SHALL read the card wrapper's computed `transform` 5.5 s and 6.0 s after the card's `undead` phase starts, and both SHALL equal the rest pose (`none` or the identity matrix), and SHALL read it 2.5 s after that start and find it not the identity, so the test proves the sway ran *(Amended by design review 1 #1)*; as an extra check, `document.getAnimations()` SHALL hold no running animation on it. (Framer Motion drives `rotate` from JavaScript, so `getAnimations()` alone would not see the sway.)

### Requirement 11: Landing copy

**Phase:** A · **Brief:** R11 · **Steering:** `product.md` (pitch; won't have: accounts, bank linking), `spooky-design.md` (tone of voice), `privacy.md`

**User Story:** As a first-time visitor, I want to see at once that trying it costs nothing and needs no sign-up or bank login, so that I try it.

#### Acceptance Criteria

1. THE Hero SHALL show, directly after the Primary action and before the Secondary samples (and before the `working` line when shown), the line "Free. No sign-up. No bank login." in Inter at the body size, `--bone`, on the bare scene with a contrast of at least 4.5:1 (landing-polish Requirement 10.2). It SHALL be text only, with no control.
2. THE line is true for the product (`product.md`: no accounts, no bank linking, free static hosting) and SHALL make no other claim.
3. THE Secondary samples SHALL show the new Sample labels (Decision "Sample names change at the source"): "UK bank statement", "European bank statement", "Statement with extra top lines", in `SAMPLES` order. The "Other samples:" label and the list name "Other sample statements" SHALL stay.
4. THE Landing view SHALL keep the Privacy badge and the Privacy note in the Footer. THE Footer SHALL carry no other privacy sentence (Requirement 2.6), and "Built with Kiro." SHALL no longer appear as footer text (Requirement 2.13).
5. THE Own-statement section heading SHALL be "Or use your own statement" (Requirement 3.1), and the heading outline of landing-polish Requirement 1.2 SHALL be amended to that text.
6. THE Fold checks of landing-polish Requirements 3.7 and 3.8 SHALL still hold with the new line, at every size of the landing-polish Viewport set; the Primary action SHALL stay wholly above the Fold at 320×568.

### Requirement 12: Accessibility, privacy and the theme rule across the feature

**Phase:** A and B · **Steering:** `privacy.md`, `tech.md`, `spooky-design.md`, `product.md`

**User Story:** As the team, I want the polish to keep every promise the app already makes, so that a better look never costs privacy, access or the hackathon rules.

#### Acceptance Criteria

1. Using any screen this spec changes SHALL make no network request other than the same-origin `GET`s for the built files in `dist` that the demo-path test allows today. The demo-path test's CSP, request, console and storage checks SHALL keep passing unchanged, and SHALL also cover the Home control, the Leave question, the Footer tombstones and the Statement disclosure.
2. THE feature SHALL add no dependency to any `package.json`, no storage key, no cookie, no URL write and no `<style>` element at runtime. New files under `apps/web/public` SHALL be only `og-image.svg` and `og-image.png` (Requirement 4).
3. All new art (the Footer tombstones and Peek ghost, the Grave drop area and Resting ghost, the Sample chip shapes, the graveyard ground lines, the Progress dots) SHALL be original inline SVG or CSS made for this project, using only the seven colour tokens (directly or with `color-mix()`), `aria-hidden="true"` where it is SVG, with ids from `useId`, no text inside SVG, no `<image>`, no `<foreignObject>`, no external reference and no brand shape. No service logo, Kiro logo, GitHub logo or gore SHALL be added. The preview image `og-image.svg` is excluded from this criterion; Requirement 4.2 and 4.3 are its rules.
4. Every new or restyled text SHALL have a contrast of at least 4.5:1 against the lightest colour that can be behind it (landing-polish Requirement 10.2), and every non-text part that carries meaning (button outlines, the grave rim, the toggle, the Progress dots, the focus ring) at least 3:1 (WCAG 1.4.11). `apps/web/src/contrast.test.ts` SHALL check each new pair.
5. Every new control SHALL be reachable by keyboard, SHALL show the `--moss` focus ring on `:focus-visible` with no art covering it, and SHALL be at least 44 × 44 px. Disclosures SHALL use a native `button` with `aria-expanded` and `aria-controls`.
6. THE tab order of each Non-landing view SHALL be: the Home control; the Leave question when open; the state content in its DOM order; the Statement disclosure (or the open Statement panel); "Start again" when shown, except on `error` and `no-subscriptions`, where "Start again" sits inside `ErrorView` or `NoSubscriptionsView` as part of the state content, before the Statement panel; then the four Footer tombstones in order. THE Landing tab order of landing-polish Requirement 10.1 SHALL become: the Primary action; the three Secondary samples; "Read the privacy note"; the Return notes' "Open the graveyard" when shown; the drop area; "Choose a file"; then the four Footer tombstones.
7. WHILE reduced motion is preferred, no element this spec adds or changes SHALL move, scale or rotate; motion SHALL be replaced by an opacity fade of at most 150 ms or no change (`spooky-design.md`).
8. Automatic motion added or changed by this spec, and the ambient fog on Non-landing views (Requirement 5.3), SHALL stop within 5 s (WCAG 2.2.2); motion driven by hover, focus or drag SHALL be finite.
9. AT 320×568, and at 390×844 with 200 % root font size, every Non-landing view and the Landing view SHALL have no sideways scroll (`scrollWidth <= innerWidth`) and no clipped text, and the existing 320×568 Fold check SHALL keep passing.
10. THE Live region text SHALL not change for any Page state; the new controls (Home control, Leave question, disclosures, Footer tombstones) SHALL announce nothing new, since focus moves and `aria-expanded` give the feedback.
11. Every spooky element this spec adds SHALL do work under the theme rule of `product.md`: the Footer tombstones are controls with hover and focus feedback; the open grave and its rising ghost mark the drop target and confirm drag-over; the chip shapes mark Samples; the ground lines show tombstones as buried; the Progress dots carry the answered count; the Brand mark is the way home. Any added element that does none of this SHALL be removed.

### Requirement 13: Existing behaviour, earlier specs and tests

**Phase:** A and B · **Steering:** `structure.md` (where tests live), `tech.md` (Vitest, fast-check, Playwright)

**User Story:** As the team, I want the earlier specs and tests to say what this spec changed, so that specs, tests and code agree and nothing is weakened on the way.

#### Acceptance Criteria

1. THE following notes SHALL be added to the earlier specs, in their existing style "(Changed by pro-polish: …)":
    - landing-polish, Decision "the primary action keeps the Sample's source name": replaced by this spec's Decision "Sample names change at the source".
    - landing-polish Requirement 1.2: the `h2` is "Or use your own statement".
    - landing-polish Requirement 1.6 and 5.7: the Non-landing gate is the Statement panel with Sample chips under "Try another statement", collapsed behind the Statement disclosure on `results` and the Graveyard view.
    - landing-polish Requirement 1.7: Non-landing `main` widens to 1120 px for `results` and the Graveyard view at 1024 px and more (Wide layout).
    - landing-polish Requirements 5.4, 8.2 and 8.7: the Tip is "Tip: 2 to 3 months of transactions works best."; `PRIVACY_NOTE` and `STATEMENT_TIP` joined no longer equal the graveyard-memory Requirement 1.6 sentence; the memory-text test asserts each text exactly instead.
    - landing-polish Requirement 8: the Footer is the Footer graveyard of pro-polish Requirement 2.
    - landing-polish Requirement 10.1: the tab order is that of pro-polish Requirement 12.6.
    - landing-polish Requirement 11.3 and 11.4: `og-image.svg` and `og-image.png` are added under `public`; the allowed absolute URLs in `apps/web/src` are the three Footer URLs.
    - landing-polish, Out of scope "Social preview tags": now covered by pro-polish Requirement 4.
    - landing-polish, Decision "automatic motion ends within 5 seconds": the undead-card sway now also ends within 5 s (pro-polish Requirement 10.4).
    - graveyard-ui Requirement 1.1: on Non-landing views the `h1` holds the Home control and the tagline is not shown.
    - graveyard-ui Requirement 3 (the undead card): the sway is finite and pauses on hover and focus.
    - graveyard-ui Requirement 7: tombstones stand on ground lines in a wider grid; "Not answered yet" uses Waiting chips.
    - graveyard-memory Requirement 1.1 and 1.5: the hint sits behind "What is kept?", stays in the DOM and still describes the checkbox.
    - graveyard-memory Requirement 1.6: the sentence is shown as the Privacy note plus the new Tip; the Tip's wording changed.
    - cancel-helper Requirement 7: for Cancel entries the email part is behind "Write to them instead"; on the Rising, "Next" sits inside the Helper panel.
    - vertical-slice Requirement 2.2: the Sample labels are the new plain names.
    - vertical-slice Requirement 4.11: on `results` and the Graveyard view, a window `dragenter` with Files opens the Statement disclosure so a new drop can replace the result (pro-polish Requirement 3.8).
    - landing-nits Requirement 2.3: `BrandMark` takes a `size` prop; the Landing keeps `size-14 sm:size-[4.5rem]`, the Home control uses 32 to 48 px.
    - landing-nits Requirements 7.3, 8.3 and 9.3: on Non-landing views the fixed Hills, Fence, `Ground` and `GrassTufts` are no longer drawn; the ridge band sits in the flow before the Footer (pro-polish Requirement 5.1).
    - cancel-helper Requirement 7.5: the "Or ask them in writing:" intro is removed and the email starts collapsed for Cancel entries.
    - cancel-helper Requirements 8.1 and 8.2: the tab order passes the Email disclosure button, and on the Rising "Next" sits inside the Helper panel as its last control.
    - cancel-helper Requirement 10.4: the demo-path mailto check opens "Write to them instead" before finding "Open in my email app".
    - cancel-helper Requirement 10.5: the Helper panel overflow test opens "Write to them instead" before measuring.
    - graveyard-ui Requirements 2.5, 5.5 and 14.2: in the `buried` stage "Next" sits inside the Helper panel.
    - graveyard-ui Requirement 14.2: when another statement is read from the Statement panel of `results` or the Graveyard view, the panel remounts open on `working` and focus moves to the same-named control in it. *(Amended by design review 1 #4.)*
    - share-card Requirement 4.8: the Share panel uses the Button variants of pro-polish Requirement 6.
    - landing-polish Requirement 4.5: the `working` line sits after the line "Free. No sign-up. No bank login." (pro-polish Requirement 11.1).
    - landing-polish Requirement 13.1: no Landing button is named "US bank statement" (was "US bank, signed amounts").
    - graveyard-memory Requirement 1.1: the Memory panel's content order is that of pro-polish Requirement 9.4.
2. THE design SHALL list every existing test assertion it amends, with the file, the old locator or expectation, the new one and the requirement that forces the change. An amendment SHALL only change how a control is found (name, role, place), open a disclosure before a query, or replace an expectation that this spec makes false with one that states the new truth exactly. No assertion SHALL be removed, made optional or widened (for example an exact text replaced by a regular expression that matches more).
3. Known amendments, at least: tests that click or read "US bank, signed amounts", "UK bank, debit and credit columns", "EU bank, semicolons" or "Statement with a header block" (unit tests under `apps/web/src/slice`, `apps/web/e2e/demo-path.spec.ts`, `layout.spec.ts`, `landing.spec.ts`); tests that read "Read another statement", "Or read your own statement", "Or try a sample statement", `STATEMENT_TIP` or "Built with Kiro."; the Footer tests of `landing-page.test.tsx` and `landing.spec.ts` ("footer reaper description on its own line"); the Non-landing `h1` name; "Answer now <Display name>"; `MEMORY_HINT` and the email text queries; the mailto and Copy queries in `apps/web/e2e/demo-path.spec.ts:142`, `graveyard-flow.test.tsx` and `graveyard-view.test.tsx`; the Helper panel overflow test of `layout.spec.ts`; "results view keeps the fixed fence and has no ridge band"; and the memory-text join test.
4. Component tests (Vitest, jsdom) SHALL check: the Home control's name, its place inside the only `h1`, and both paths of Requirement 1.3 to 1.5 including Escape and focus; the Footer graveyard's content, order, `href`, `target`, `rel`, descriptions and the "Privacy note" focus move on the Landing view and on a Non-landing view; the Statement panel's text, the disclosure's `aria-expanded` and `hidden` content, and that a drop-area focus request opens it (checked on the pure rule the Page uses, since no user path issues that request while the disclosure is shown; *Amended by design review 1 #22*); the Sample chips' names and order; the Email disclosure; the Waiting chips; the Memory toggle, short sentence and "What is kept?"; the muted footnote text unchanged; the Progress dots; and the tab orders of Requirement 12.6.
5. Property tests SHALL live in `.property.test.ts` files next to their source, use fast-check with its default 100 runs, and cover Requirements 1.10, 1.11, 6.7 and 10.3.
6. THE Playwright tests SHALL cover Requirements 2.10 (2 × 2 grid, no sideways scroll), 2.8 and 2.9 (lift and peek, and none under reduced motion, by computed `transform`), 3.6 (drag-over state by computed style), 4.7, 5.2, 5.3 (fog at rest on a `results` view and a Graveyard view), 5.6, 7.6, 10.7 and 12.9, waiting for `document.fonts.ready` and emulating `prefers-reduced-motion: reduce` for every box check.
7. THE root `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` SHALL pass, and the Playwright tests SHALL pass with `npm run test:e2e --workspace @zombills/web`.
8. Evidence for the record: screenshots of the built site at 1280×800 and 390×844 of the results after Summon, after one Bury with "Seal the grave", and the Graveyard view, taken by hand before release. This is a manual step; no screenshot baseline SHALL be committed.

---
## Traceability

### Brief to requirements

| Brief item | Requirements |
| --- | --- |
| R1 Site header | 1, 12.6 |
| R2 Themed footer | 2, 11.4, 12.3, 12.11 |
| R3 Statement panel | 3, Decision "Sample names change at the source" |
| R4 Share preview | 4, Decision "the share preview image is committed, not built" |
| R5 Scene on results and graveyard | 5 |
| R6 Button hierarchy | 6 |
| R7 Desktop layout | 7, 9.1 |
| R8 Seal the grave | 8 |
| R9 Graveyard view | 9 |
| R10 Small polish | 10 |
| R11 Landing copy | 11, 3.1, 3.10 |
| Constraints | What stays, 12, 13 |

### Steering to requirements

| Steering doc | Rule | Requirements |
| --- | --- | --- |
| `privacy.md` | No network call with statement data; zero third-party requests at runtime; no cookies; opt-in `localStorage` only | 2.12, 4.5, 9.6, 12.1, 12.2 |
| `product.md` | Theme rule: every spooky element carries state, gives feedback or guides attention | 2.14, 3.12, 12.11 |
| `product.md` | Must-have: drag-and-drop upload, built-in samples, Keep / Bury, cancel helper, graveyard view | 3, 8, 9 |
| `product.md` | Won't have: bank linking, accounts, auto-cancellation | 8.1, 11.1, 11.2 |
| `spooky-design.md` | Seven colour tokens, never hard-coded hex (the preview PNG's SVG source uses the tokens' hex values, as a file outside the app) | 4.2, 6.1, 12.3 |
| `spooky-design.md` | WCAG AA contrast (this spec: 4.5:1 for all text) | 2.11, 3.4, 6.4, 10.1, 12.4 |
| `spooky-design.md` | Motion through Framer Motion; reduced motion = opacity only, no position, scale or rotation | 2.8, 2.9, 3.6, 10.4, 10.5, 12.7 |
| `spooky-design.md` | Focus ring `--moss` glow, 2 px offset; keyboard reach | 1.2, 6.2, 12.5 |
| `spooky-design.md` | Cards stack to one column at ≤ 640 px | 7.4, 9.1 |
| `spooky-design.md` | Tone: short, dry, facts only, no claims of usage | Decision "the leave question tells the truth", 9.6, 11.2 |
| `spooky-design.md` | No logos, no gore | 2.12, 4.2, 12.3 |
| `spooky-design.md` | Every screen has default, processing, empty and error states | 1.7, 3.7, 6.5 |
| `money.md` | Integer cents, `Money` for display | 9.1, 9.3, What stays |
| `tech.md` | Approved stack; no new dependency; Tailwind, no component library; Vitest, fast-check, Playwright | 4.4, 6.1, 12.2, 13.5 to 13.7 |
| `structure.md` | Kebab-case files, PascalCase components, co-located tests and `.property.test.ts` | 6.1, 13.5 |

