I reviewed `landing-polish/requirements.md` against the steering docs, the earlier specs and the current code in `slice-page.tsx`, `night-scene.tsx`, `graveyard-backdrop.tsx`, `index.css`, `csp-plugin.ts`, `static-checks.test.ts`, `memory-text.ts`, both e2e specs and `slice-page.test.tsx`. This spec has no `design.md` or `tasks.md` yet, so checklist item 7 (traceability) and item 8 (code batch) don't apply. The privacy and CSP rules (R11) hold up. I found nothing in them that breaks `privacy.md` or `CSP_POLICY`. Most of the findings are about the moon test, contrast and test coverage.

## Findings

### Blocker

**1. The moon rule cannot be tested as written, and a fixed moon cannot pass it at narrow widths**
- **Where:** R2.1, R2.2, R2.7, Glossary "Content box"; `night-scene.tsx` (backdrop is `fixed inset-0`), `graveyard-backdrop.tsx` (`Moon` at `left-[70%] top-[17%]`).
- **Problem:**
  - "Content box" means the border box of "any visible text". A `<p>` or `<h1>` border box spans the full width of its column, not the width of its text. At 320 px every text block is 288 px wide, so the moon can only sit in a vertical gap between blocks, and the spec doesn't say whether text boxes are element boxes or glyph rects (`Range.getClientRects()`).
  - "Visible" is not defined. The `sr-only` live region has a 1×1 box and would count.
  - R2.2 says "any scroll position", but R2.7 only samples 5 positions. A fixed disc that clears 0/25/50/75/100 % can still cross a card at 37 %.
  - The Landing view at 320 px is taller than the viewport and its content fills the full width. A fixed moon must then pass behind something while scrolling. So the R2.2 "MAY move with the page" is really a MUST at narrow widths, and nothing says so.
- **Failing example:** 320×568, moon fixed at top-right. Scrolling 40 % moves the "How it works" `h3` block under the disc. None of the 5 samples catches it if the block is short.
- **Suggested fix:**
  - Define text Content boxes as the union of `Range.getClientRects()` of each non-empty text node. Exclude elements that are `aria-hidden`, `sr-only` (clip rect), or have zero area.
  - Require the moon on the Landing view to be anchored to the document (it scrolls with the page). Then R2.2 becomes scroll-invariant and is checked once, in document coordinates, against every Content box in the document, not just the visible ones.
  - If a fixed moon is kept, replace the 5-position sampling with an exact sweep: a box collides when its x-range overlaps the disc's x-range and its document y-range overlaps `[disc.top, disc.bottom + maxScroll]`.

### Major

**2. R2.8 refers to an area that is never defined, and one function cannot serve both kinds of view**
- **Where:** R2.8, R2.3, R1.7.
- **Problem:** "the area the Landing layout keeps free of content" is not defined anywhere, so the property has nothing to check against. A moon placed by a pure function of viewport size must also clear the 640 px non-landing column (R2.3). The Landing view allows up to 1120 px of content, so the free areas differ between the two kinds of view.
- **Failing example:** At 1280×720 a spot right of the 640 px column (x ≥ 960) is still inside the 1120 px Landing column (x 80–1200).
- **Suggested fix:**
  - Either drop R2.8, or define the free area numerically, for example "the band from y = 0 to y = H(w) and x ≥ 1200 when w ≥ 1280".
  - Make the function take `(width, height, view: "landing" | "other")`.
  - State that the moon may jump between views.

**3. The sky glow is already off-centre from the moon, and R2.5 gives no way to measure it**
- **Where:** R2.5; `night-scene.tsx` `SCENE_STYLE.background = SKY_BACKGROUND`; `graveyard-backdrop.tsx` (glow `at 70% 17%`).
- **Problem:** The glow is a background on the scrolling scene root (`min-h-svh`), so it is centred at 17 % of the document height. The moon sits at 17 % of the viewport height. They already drift apart on any page taller than the viewport. The spec asks for "within 1 px" but doesn't say how a test reads a gradient's centre.
- **Failing example:** At 390×844 with a 2000 px Landing view, the glow centre is near y = 340 while the moon is near y = 143.
- **Suggested fix:** Require the glow and halo to be drawn in the moon's own positioned element, or from the same CSS custom properties. The test then compares the glow element's box centre, or the computed custom properties, with the `[data-moon-disc]` centre.

**4. Contrast for text on the night scene is tight, and the Hero art glow has no cap**
- **Where:** R10.2, R3.4, R3.5, R9.3; layers in `graveyard-backdrop.tsx`.
- **Problem:** `--bone` text stays at 4.5:1 only while the bone-tinted layers behind it add up to about 40 % coverage over `--night`. That threshold is a background luminance of about 0.137, worked out roughly in sRGB (the code mixes in oklab). The layers that already exist come to about 38 %:
  - sky glow, 9 %
  - moon halo, about 22 % just outside the disc
  - fog bands, up to 13 %

  Composited, that is 1 − 0.91 × 0.78 × 0.87 ≈ 0.38. The spec puts no limit on the Hero art glow's alpha or on where it sits, and R9.3 lets hover add another 0.3. If R10.2 is read as "every layer at its highest opacity, composited", it fails as soon as the Hero glow is visible.
- **Failing example:** Hero glow at rest alpha 0.25 behind the Hero line plus the moon halo gives about 54 % bone coverage. That is about 3.3:1.
- **Suggested fix:**
  - Add to R3: the Hero art's bounding box, including its glow, SHALL NOT intersect any text Content box.
  - Add to R2: no text Content box may lie within the halo radius (2.5 × disc radius).
  - R10.2 can then state exactly which layers can be under text (sky gradient, sky glow, fog at its highest density) and the test composites only those.

**5. Earlier specs that describe the "`idle` panel" are not amended**
- **Where:** R12.2, against graveyard-memory R1.7, R4.3, R4.5, R4.10, R9.2 and R9.6; vertical-slice R4.1; graveyard-ui R1.4.
- **Problem:**
  - R1.4 removes the `idle` panel. Graveyard-memory still places the restored line and the load notes "in the `idle` panel" six times, and R9.2 says load notes are not announced because "they are in the `idle` panel, which is read in order".
  - Vertical-slice R4.1 still says `idle` shows four Sample buttons and one sentence.
  - Graveyard-ui R1.4 requires `working` content on a `--fog` surface. R4.5 places "Reading…" directly after the Primary action and doesn't say whether it is on a surface.
- **Suggested fix:** Add "(Changed by landing-polish: …)" notes to each of these criteria. For the Landing view, say whether the `working` line sits on a `--fog` surface.

**6. Some test amendments are missing and could drop assertions in practice**
- **Where:** R12.3, R13.2, R13.3; `slice-page.test.tsx:62` and `:68-71`; `graveyard-memory-flow.test.tsx:238` and `:447`.
- **Problem:**
  - The idle test loops `for (const sample of SAMPLES) getByRole("button", { name: sample.label })` and asserts `SAMPLES` has length 4. Under R13.1 that loop must fail for the US Sample, and R13.2 doesn't say what replaces it, so the easiest move is to delete it.
  - `IDLE_SENTENCE` is also asserted twice in `graveyard-memory-flow.test.tsx`, and R13.2 doesn't list those.
  - R13.2 moves the `max-w-[640px]` check to the Rising and Graveyard views only. R1.6 keeps error and no-subscriptions "as today", but R1.7 doesn't fix their width, so their width coverage disappears.
- **Suggested fix:**
  - Spell out the replacement for the loop: the Primary action by its exact name, plus the three Secondary samples by exact name and order, plus `SAMPLES.length === 4`.
  - List both `graveyard-memory-flow` lines and what replaces them (`PRIVACY_NOTE` and `STATEMENT_TIP`, each exactly once).
  - Extend R1.7 and the width check to every Non-landing view.

**7. Nothing in the page model tracks where a `working` run started**
- **Where:** Glossary "Landing view"; R4.5; `page-state.ts:403-411`. The `start` action sets `view: { kind: "working", sourceName }` and `screen: "main"`, with no origin.
- **Problem:** The Landing view depends on where the run started, but the model has no field for it, so the reducer and its property tests must change. The case "Graveyard view while `idle`" (restored graveyard, no statement, user picks a Sample from the gate) is not covered: the definition lists only `results`, `error` and `no-subscriptions` as non-landing origins.
- **Failing example:** Restore a graveyard, open the Graveyard view, choose "EU bank, semicolons". The spec doesn't say whether `working` shows the Hero or the gate layout.
- **Suggested fix:**
  - Add `origin: "landing" | "other"` to the `working` view, set by `start` from `view.kind === "idle" && screen === "main"`.
  - State that a run started from the Graveyard view is non-landing.
  - Add the field to the page-state property tests.

**8. The two-column Hero spans two landmarks**
- **Where:** R1.1, R1.3, R3.6, Glossary "Hero".
- **Problem:** The `h1` and tagline are in `header`, while the Hero line, Primary action and Hero art are in `main`. "Text and Primary action on one side, Hero art on the other" then needs one grid across both landmarks, which pushes toward `display: contents` on `main` or `header`. That can drop the landmark from the accessibility tree in some engines.
- **Suggested fix:** Allow the `h1` and tagline to run full width above the two columns, with only the `main` part of the Hero split into two columns. Or forbid `display: contents` on landmark elements.

**9. The scope does not fit 1 to 2 hours of one-task-per-run work**
- **Where:** "Scope budget", R2.7, R13.5, Phase B.
- **Problem:** The spec itself plans 8 to 12 tasks. Some single pieces are each about one run:
  - The moon test covers 34 viewports × 5 scroll positions on the Landing view, plus non-landing views at every size. Results, the Graveyard view and error each need a full analysis per viewport, and no-subscriptions needs a hand-made file, because no Sample produces it.
  - The reducer change of finding 7.
  - The footer focus change of finding 10.
  - Test amendments across about 9 files and notes in 4 specs.
- **Suggested fix:** Cut to about 5 tasks:
  - Use the document-anchored moon with the exact check of finding 1.
  - Use the 14 fixed sizes only; drop the 20 random ones, or keep 6.
  - Check non-landing views only at 320, 1280 and 1920.
  - Drop R2.8.
  - Defer Phase B (R9, R13.6) as the cut line already allows.

### Minor

**10. The footer is outside the area the focus mechanism searches**
- **Where:** R7.2; `slice-page.tsx` focus effect, which only queries `mainRef.current` for `[data-focus]`.
- **Problem:** The Privacy note is in the footer, outside `main`, so a focus request cannot find it.
- **Suggested fix:** Have "Read the privacy note" call `focusAndReveal` directly on a ref (it already honours reduced motion). Or widen the effect's root.

**11. The Primary action's name may lose its space in jsdom**
- **Where:** R4.1, R13.1.
- **Problem:** The two lines are likely two block `<span>`s. jsdom doesn't apply Tailwind's `display: block`, so `dom-accessibility-api` joins them as "Summon the undeadwith a sample…" and `getByRole({ name })` fails.
- **Suggested fix:** Require a literal space text node between the two lines.

**12. The glow fade conflicts with the flash cap**
- **Where:** R9.1, R9.2.
- **Problem:** A fade from 0 to the rest value in at most 1.2 s breaks "at most 0.4 per 1 s" whenever the rest value is above about 0.48, and earlier for any eased fade. jsdom can't measure this either.
- **Suggested fix:** Say the entrance glow is one fade in one direction with rest alpha ≤ 0.3. Drop the per-second rate cap but keep "no more than 3 direction reversals per second".

**13. Step 3 of How it works claims too much**
- **Where:** R6.1, step 3, against cancel-helper R7.6.
- **Problem:** "get the steps to cancel them" isn't true for email-only, generic and unidentified merchants, which get an email and no steps. `spooky-design.md` says copy makes no claim the app can't back.
- **Suggested fix:** "Bury the ones you no longer use, and get help to cancel them."

**14. Two e2e checks rely on timing or start recording too late**
- **Where:** R13.5 ("sampled after 5 s") and R13.8; `demo-path.spec.ts` starts recording requests only after `waitForLoadState("load")`.
- **Problem:** A fixed 5 s wait is timing-based. R13.8 asks about requests made by the landing itself, but the current recorder misses everything before load.
- **Suggested fix:** Wait on a `data-hero-settled` attribute set by the `onAnimationComplete` callbacks, with a 5 s timeout. Attach the request listener before `goto` for the R13.8 check, and allow only `dist` files.

**15. The moon test doesn't say which Landing states to cover**
- **Where:** R2.1, R2.7.
- **Problem:** The Return notes, a load note and the `working` line all add height and move the content below them. A moon placed in a gap can collide only in those states.
- **Suggested fix:** Run the Landing check for: empty graveyard; restored graveyard with the restored line, a dropped-records note and "Open the graveyard"; and `working`. Emulate reduced motion so the swaying card on non-landing views doesn't move its boxes.

**16. The Reaper link is not verified**
- **Where:** R8.1.
- **Problem:** `git remote` confirms `zaxcoraider/zombills`. I couldn't check `zaxcoraider/zombills-reaper` offline. A dead link on the judges' first screen is costly.
- **Suggested fix:** Add a manual step: confirm the repo is public before release.

**17. The 24 px spacing alternative does not match WCAG 2.5.8**
- **Where:** R5.2, R7.3, R10.5.
- **Problem:** "24 px tall with 24 px of spacing to its neighbours" is not how WCAG 2.5.8 defines spacing. WCAG uses a 24 px circle centred on each target that must not intersect another target or its circle.
- **Suggested fix:** Use the WCAG wording, or require 44 × 44 px hit areas through padding, which the current buttons already allow.

Verdict: approve after fixes

## Resolution

All 17 findings accepted and applied to `requirements.md`.

| # | Decision | Change in `requirements.md` |
| --- | --- | --- |
| 1 | Accepted: document-anchored moon on the Landing view, exact check | Glossary "Content box" is now the union of `Range.getClientRects()` of non-empty text nodes plus Card, control and Hero art border boxes, in document coordinates, excluding `aria-hidden`, `sr-only` and zero-area rects. R2.2 anchors the moon to the document and checks once against every Content box. R2.7 drops scroll sampling. |
| 2 | Accepted: R2.8 dropped | R2.8 marked dropped. R2.3 says the moon may change place and size (jump) between Landing and Non-landing views. |
| 3 | Accepted | R2.5: glow and halo drawn inside the moon's positioned element. The test compares the `data-moon-glow` and halo box centres with the `[data-moon-disc]` centre within 1 px. |
| 4 | Accepted | New R2.9 (no text within 2.5 × disc radius) and R3.10 (Hero art box including glow clear of text). R10.2 composites only sky gradient, sky glow and fog at their highest density. |
| 5 | Accepted | R12.2 adds notes for graveyard-ui 1.4, vertical-slice 4.1, graveyard-memory 1.7, 4.3, 4.5, 4.10, 9.2 and 9.6. R4.5 puts the Landing `working` line on a `--fog` surface. |
| 6 | Accepted | R13.2 spells out the replacement for the `SAMPLES` loop and the two `graveyard-memory-flow` `IDLE_SENTENCE` lines. R1.7 and the width check cover every Non-landing view. |
| 7 | Accepted | Glossary "Landing view" adds `origin: "landing" \| "other"` on `working`, set by `start`. A run from the Graveyard view (including while `idle`) is non-landing. New R13.10 covers it in the page-state tests. |
| 8 | Accepted | R1.1 and R3.6: `h1` and tagline run full width, only the `main` part splits into two columns. R1.3 forbids `display: contents` on landmarks. |
| 9 | Accepted: about 5 tasks | Scope budget rewritten. Viewport set has only the 14 fixed sizes. New "Non-landing viewport set" (320, 1280, 1920). R2.8 dropped. Phase B (hero motion decision, R9, R13.6, the motion part of R13.5) marked Deferred, text kept. |
| 10 | Accepted | R7.2 calls `focusAndReveal` directly on a ref to the Privacy note. |
| 11 | Accepted | R4.1 requires a literal space text node between the two lines. |
| 12 | Accepted | R9.1: one fade in one direction, rest alpha ≤ 0.3. R9.2: the per-second rate cap is dropped and the 3-reversals limit kept. (R9 is deferred.) |
| 13 | Accepted | R6.1 step 3: "Bury the ones you no longer use, and get help to cancel them." |
| 14 | Accepted | R13.5 (deferred part) waits on `data-hero-settled` with a 5 s timeout. R13.8 attaches the request listener before `page.goto`. |
| 15 | Accepted | R2.7 runs the Landing check for an empty Graveyard, a restored Graveyard with a dropped-records note and "Open the graveyard", and `working`, with reduced motion emulated. |
| 16 | Accepted | New R8.8: a manual pre-release step confirms the Reaper repo is public. |
| 17 | Accepted | R5.2 requires 44 × 44 px hit areas through padding. R10.5 uses the WCAG 2.5.8 wording. |
