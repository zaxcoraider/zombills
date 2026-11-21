# Bugfix: landing-nits

Small layout and art bugs on the Landing view of the live site. Bugs 1–5 were found in Playwright screenshots at 390 × 844 (phone) and 1280 × 720 (desktop); bugs 6–7 (round 2) in the user's screenshots of the live site; bugs 8–10 (round 3) in screenshots of the built site at 390 × 844 and 1280 × 800, taken 6.5 s after load. Each bug has a number; its criteria are numbered `N.1` (current behaviour), `N.2` (expected behaviour) and `N.3` onwards (behaviour that must not change), so tasks can cite them.

Every path is in `apps/web/` unless it starts with `.kiro/` or `packages/`. `landing/` means `apps/web/src/slice/landing/`, `graveyard/` means `apps/web/src/slice/graveyard/`, `e2e/` means `apps/web/e2e/`.

Scope: Landing view only. Bugs 7–10 change the shared `graveyard/night-scene.tsx` (and, if needed, `graveyard/graveyard-backdrop.tsx`), but only what it draws on the Landing view; the Non-landing views look and behave as before or better. The Non-landing views, the landing-polish requirements not named here, `packages/core`, the CSP, `netlify.toml`, `index.css`, every `package.json` and `apps/web/public` do not change.

---

## Bug 1: Footer, the Reaper link runs into its description

Source: `src/slice/site-footer.tsx`. The second `li` holds the inline-flex link, a `" "` text node and an inline `<span>{REAPER_DESCRIPTION}</span>`, so the description continues on the link's line.

- **1.1 Current.** At 390 px and 1280 px the Footer shows "The Reaper on GitHub The Reaper is a Kiro Crew app…" as one run of text; the link and the sentence are only told apart by the underline.
- **1.2 Expected.** The description starts on its own line directly under the link "The Reaper on GitHub", at every viewport width: the top of its first line box is at or below the bottom of the link box. The link stays on a line by itself, as "Zombills on GitHub" does.
- **1.3 Unchanged.** The Footer text order (Privacy note, "Built with Kiro.", the two links, then the description), the link texts, `href`s, `target="_blank"`, `rel="noopener noreferrer"`, `aria-describedby` and accessible names, the 44 px link height (`min-h-11`), the tab order and the card classes. The description is not inside the link and is not part of its accessible name.

## Bug 2: Brand mark, a dark strip under the mark beside the h1

Source: `landing/brand-mark.tsx`. The mark draws a ground band, `<path d="M0 432 C140 410 372 410 512 432 V512 H0 Z" fill="#1A1F2B" />`, across the bottom of its dark tile. At 56 px and 72 px that band reads as a dark strip under the tombstone.

- **2.1 Current.** Beside the h1 at 390 px (56 px mark) and 1280 px (72 px mark), a `#1A1F2B` band sits across the bottom of the mark.
- **2.2 Expected.** The Hero-size mark (`BrandMark`) draws no ground band: no element in it has the path `M0 432 …` or the fill `#1A1F2B`. The tombstone, Z, glow bar, moon and the two grass tufts stay, with the tufts resting at the tombstone's base.
- **2.3 Unchanged.** The favicon `public/favicon.svg` is byte-for-byte unchanged, and so is `index.html`'s favicon link. The mark stays decorative (`aria-hidden="true"`, `focusable="false"`, `data-brand-mark`, no text, no external reference), `size-14 sm:size-[4.5rem]`, the h1's previous sibling, with unique ids per instance. The tile's rounded clip and its `#0B0D12` ground stay (the mark's own colours, as before).
  (Changed by pro-polish: `BrandMark` takes a `size` prop; the Landing keeps `size-14 sm:size-[4.5rem]`; the Home control uses 40 px.)

## Bug 3: Hero art is small and left-aligned below lg

Source: `landing/hero-art.tsx`. Below `lg` the SVG is `h-24 w-32 self-start` (128 × 96 px) on phones and `sm:h-32 sm:w-[10.5rem]` (168 × 128 px) from `sm`, left-aligned in the Hero's flex column.

- **3.1 Current.** At 390 px the Hero art is 128 × 96 px at the left edge of the column.
- **3.2 Expected.** Below 1024 px the Hero art is horizontally centred in the Hero column (box centre within 1 px of the column centre). When the viewport is at least 700 px tall, it is also about twice today's size: 256 × 192 px (`h-48 w-64`) below `sm`, and 336 × 252 px (`sm:h-[15.75rem] sm:w-[21rem]`) from `sm` to `lg`. When the viewport is shorter than 700 px, it keeps today's size (128 × 96 px below `sm`, 168 × 128 px from `sm` to `lg`), so the Fold check still passes at 320 × 568. Its size comes from its classes and media queries alone, so its box is the same before and after fonts load and does not move other content (no layout shift).
- **3.3 Unchanged.** From `lg` up the art keeps its grid place and size: column 2, rows 1–2, `self-start`, 352 × 264 px (`lg:h-[16.5rem] lg:w-[22rem]`), 416 × 312 px from `2xl`. The motion rules (`zb-art`, `data-motion`, every rule in `landing/landing-motion.css`) and the art's content, ids and decorative attributes do not change. The landing-polish Fold check (check 8 of `e2e/landing.spec.ts`) still passes: h1, tagline and Primary action above the Fold at every size, and the Hero line, badge and art above the Fold at the `FOLD_SIZES`.

## Bug 4: The fence and hills cross the Other samples links and the badge on phones

Source: `graveyard/graveyard-backdrop.tsx` draws the Hills and Fence fixed to the viewport, above the ground band (`--ground-h`). At 390 × 844 that band sits behind the Hero's lower controls. `landing/secondary-samples.tsx` (row) and `landing/privacy-badge.tsx` (`p` with a moss border) have no background, so pickets, rails and hill edges run through their text.

- **4.1 Current.** At 390 × 844 the fence pickets and the hill edge pass behind "Other samples:", the three sample links and the badge text, which makes them hard to read.
- **4.2 Expected.** The Other samples row and the Privacy badge each sit on their own solid backdrop, `bg-night/80` (the Footer card's ground, already used on the Landing), so no scene layer shows through their text at any viewport size. Bone text on `--night` at 80 % over the lightest bare scene is at least 4.5:1, and the underlined links and the badge button keep that ratio.
- **4.3 Unchanged.** The scene layers themselves (Hills, Fence, fog, Ground, their positions and the `--ground-h` value) and every Non-landing view. The badge text, its moss border, its one-line layout at the sizes of the "privacy badge is one line" test, the 44 × 44 touch targets, `BARE_FOCUS` and its clearances, the disabled pattern, the list name `Other sample statements` and the tab order.

## Bug 5: Desktop, a large gap between the tagline and the Hero line

Source: `landing/landing-banner.tsx` and the Landing `main` in `src/slice/slice-page.tsx`. The header has `min-h-[calc(var(--moon-d)*1.75+16px)]`, which is 184 px at `lg` (`--moon-d: 96px`) and 212 px at `2xl`, taller than its content when the savings counter is empty; the Landing `main` then adds `sm:pt-8` (32 px).

- **5.1 Current.** At 1280 × 720 on the empty Landing view, about 90 px of empty space separates the bottom of the tagline "Your bank statement is haunted." from the top of the Hero line.
- **5.2 Expected.** From `lg` up, on the empty Landing view (no savings counter), the gap between the bottom of the tagline and the top of the Hero line is between 16 px and 24 px. The fix drops the header's minimum height from `lg` up (`lg:min-h-0`) and sets the Landing `main` top padding to `lg:pt-4`; nothing else moves.
- **5.3 Unchanged.** Below `lg`, the header minimum height and the `main` padding stay as they are. From `lg` up, the Hero grid (columns, rows, gaps, placement of the Hero line, art and actions) stays as it is. The landing moon checks of `e2e/landing.spec.ts` (disc size, no Content box hit, text at least 2.5 r from the disc centre, halo and glow centred) and the title-glow clearance test pass unchanged at every size, with and without a savings counter.

## Bug 6: Hero art, a hard-edged dark box under the tombstone

Source: `landing/hero-art.tsx`. The ground path `M0 120 L0 112 Q40 102 80 106 Q120 102 160 112 L160 120 Z` fills `GROUND` (`--fog` 58 % over `--night`, opaque) from edge to edge of the `viewBox`, so its flat left, right and bottom sides end exactly at the SVG box. With the clipped fog ellipses (`zb-fog-a`, `zb-fog-b`) on top, it reads as a dark rectangle under the tombstone.

- **6.1 Current.** At every viewport width, a dark shape with straight left, right and bottom edges is visible under the tombstone and its grass and fog ellipses; the edges line up with the art's box.
- **6.2 Expected.** No visible box edge: the ground fades to transparent before it reaches the left, right and bottom sides of the SVG box (for example a mask or gradient over the ground and the fog group, with alpha 0 at `x` 0 and 160 and at `y` 120), so the ground blends into the night behind it. Every pixel within 2 px of the art box's left, right and bottom sides is fully transparent in the art's own drawing (excluding the `zb-hero-glow` ellipse, which already fades to 0).
- **6.3 Unchanged.** The `viewBox`, the art's size classes and placement (bug 3), the tombstone, ghost, eyes, grooves and glow, the class names `zb-art`, `zb-hero-glow`, `zb-fog-a`, `zb-fog-b`, `zb-ghost-lean`, `zb-ghost-rise`, `data-hero-art`, `data-motion`, the decorative attributes and per-instance unique ids (any new mask or gradient id derives from `useId()`). Colours stay `color-mix()` over the tokens; no hex value. `landing/landing-motion.css` does not change.

## Bug 7: The hills and fence stay pinned to the viewport bottom while scrolling

Source: `graveyard/night-scene.tsx` puts `BackdropLayers` (stars, Hills, far fog, Fence, low fog) in a `position: fixed` layer, so the Hills and Fence, drawn at `bottom: var(--ground-h)`, stay at the bottom of the viewport while the page scrolls.

- **7.1 Current.** On the Landing view the hills + fence band is always at the bottom of the viewport and cuts through whatever scrolls behind it: the Other samples links and the Privacy badge on phones, the "How it works" heading on desktop, and the Footer and "Or read your own statement" cards when scrolled.
- **7.2 Expected.** On the Landing view the hills + fence band is drawn once, in the document flow just below the Hero and above the "How it works" section, and scrolls with the page: its box moves by the scroll distance, and at no scroll position does it intersect the Other samples row, the Privacy badge, the "How it works" heading, the "Or read your own statement" card or the Footer. The sky (stars, moon, fog) may stay fixed. The band stays decorative (`aria-hidden="true"`, `pointer-events: none`), adds no text and no focusable element, and takes the full content width without causing horizontal scroll.
- **7.3 Unchanged.** On every Non-landing view (results, graveyard) the scene looks and behaves as before or better, never worse: Hills, Fence, Ground, fog, moon, `--ground-h` and the undead rising from the ground line keep their positions. Motion and reduced-motion rules do not change: fog drift is still paused on the Landing view and under reduced motion, no new animation or transition, `landing/landing-motion.css` and every Framer Motion config stay as they are. The Landing view's Hero, Fold check, moon checks and the bug 1–6 fixes stay as they are.
  (Changed by pro-polish: On Non-landing views the fixed Hills, Fence, `Ground` and `GrassTufts` are no longer drawn; the ridge band sits in the flow before the Footer.)

## Bug 8: A 1 px light line across the Landing view, pinned to the viewport

Source: `graveyard/night-scene.tsx` still renders `Ground` (from `graveyard/graveyard-backdrop.tsx`) in a `position: fixed` layer on the Landing view. `Ground`'s box is `var(--ground-h)` tall (`clamp(7rem, 24svh, 15rem)`) at the viewport bottom and has `boxShadow: inset 0 1px 0` bone at 14 %, plus a `GROUND_TOP` gradient start that differs from the sky above it. Its top edge sits at `innerHeight - ground-h`: 800 − 192 = 608 at 1280 × 800 and 844 − 203 ≈ 641 at 390 × 844. This is the line found in the task 8 note.

- **8.1 Current.** On the empty Landing view a thin light horizontal line spans the full width at y ≈ 608 (1280 × 800) and y ≈ 640 (390 × 844, through the "EU bank, semicolons" link), and stays at that viewport position while scrolling.
- **8.2 Expected.** On the Landing view there is no hard horizontal line anywhere: no fixed layer renders `Ground` or `GrassTufts`, and no element in a fixed layer has a visible top or bottom edge (border, inset shadow or an opaque gradient start) inside the viewport. In a screenshot at either size, at the top of the page and after scrolling 300 px, the per-channel median colour of each pixel row from `innerHeight − ground-h − 4` to `innerHeight − ground-h + 4` (the old line position) differs from that of the next row by at most 3 (median over the full width, so text crossing the rows does not count).
- **8.3 Unchanged.** On every Non-landing view `Ground`, `GrassTufts`, `--ground-h` and the undead rising from the ground line render exactly as before. `ForegroundFog`, the vignette, the `RidgeBand` and the bug 7 fix stay. No motion change.
  (Changed by pro-polish: On Non-landing views the fixed Hills, Fence, `Ground` and `GrassTufts` are no longer drawn; the ridge band sits in the flow before the Footer.)

## Bug 9: A hard colour edge where the first viewport ends

Source: `graveyard/night-scene.tsx`. The root `div` paints `SKY_BACKGROUND` (night → fog) over the whole page height, while the fixed layers (the Ground, ending in `--night`, and the vignette) cover only the viewport. Where the fixed layers end, at y = `innerHeight` in a full-page view, `--night` meets the stretched sky gradient at a different colour.

- **9.1 Current.** At 1280 × 800 a hard horizontal colour edge shows at y = 800 of the page: above it the fixed sky and ground, below it the page background in a different colour.
- **9.2 Expected.** On the Landing view the sky blends into the page background with no visible edge at any scroll position and in a full-page capture: the sky is drawn on a fixed, viewport-sized layer whose last colour stop is `var(--night)` (the fade the Ground used to give, over about its lowest `var(--ground-h)`), and the root background on the Landing view is `var(--night)`, so the colours on both sides of any fixed-layer edge match. In a full-page screenshot at 390 × 844 and 1280 × 800, the mean colour of the 4 rows above `innerHeight` and the 4 rows below it differ by at most 4 per channel (median per row over the full width, as in 8.2).
- **9.2 Amended.** Amended 2026-11-18 (finding 9.2): fade fog 88% -> night 100%. The last stops of the fixed sky are `var(--fog) 88%` then `var(--night) 100%`, with no `calc(100% - var(--ground-h))` stop (CSS clamped it up to 88 % and left a hard edge there). Also, in a viewport screenshot at scroll 0 and 300, rows across 80–100 % of `innerHeight` at x = 20 have no step above 4 per channel between adjacent rows.
- **9.3 Unchanged.** `SKY_BACKGROUND` and the root background on every Non-landing view, the stars, the Landing moon, the fog bands and the `RidgeBand`, except its bottom fade (see the amendment below). Colours stay `color-mix()` over the tokens or `var(--…)`; no hex. `index.css` does not change.
  (Changed by pro-polish: On Non-landing views the fixed Hills, Fence, `Ground` and `GrassTufts` are no longer drawn; the ridge band sits in the flow before the Footer.)
- **9.3 Amended.** Amended 2026-11-18: RidgeBand bottom fades to transparent. Only the `RidgeBand` bottom fade may change: it fades to transparent (an alpha mask over the lowest 64 px of the band) instead of to `var(--night)`, so the band blends into whatever sky is behind it. Hills, Fence, height and position stay. In a full-page screenshot at scroll 0, at 390 × 844 and 1280 × 800, rows from the band's bottom − 40 px to its bottom + 40 px at x = 20 (with `main` and `footer` hidden, the band visible) have no step above 4 per channel between adjacent rows.

## Bug 10: Phone, about 120 px of empty space above the fence band

Source: `graveyard/graveyard-backdrop.tsx`, `RidgeBand`. Its height is `clamp(5rem, 17vh, 11rem) + FENCE_H − 2px`, but `Hills` (that same `clamp` tall) and `Fence` (`FENCE_H`, 72 px) both sit at its bottom, so the top `FENCE_H − 2` = 70 px of the box are empty. Above the hill crest the `Hills` SVG is transparent too, and `slice/slice-page.tsx` adds the `main` `gap-12` less the wrapper's `-my-6` (24 px).

- **10.1 Current.** At 390 × 844 about 120 px of empty dark space separate the bottom of the Privacy badge from the first drawn pixel of the hills + fence band.
- **10.2 Expected.** At 390 × 844 and 1280 × 800 the space between the bottom of the Privacy badge (or the lowest Hero element) and the band's first drawn pixel (the highest hill crest or picket top, whichever is higher) is between 24 px and 48 px. The band's box has no empty rows at its top beyond what the hill crest leaves (its height is the taller of the Hills and the Fence, not their sum).
- **10.3 Unchanged.** The bug 7 criteria (7.2): the band scrolls with the page, does not intersect any Content box, the Other samples row, the Privacy badge, the Primary action or the "How it works" heading, spans the viewport width without horizontal scroll and stays decorative. `Hills` and `Fence` themselves, and every Non-landing view.

Amended 2026-11-18 (round 2): bug 4 is superseded by bug 7; with the band out of the Hero, the Other samples row and the badge need no backdrop. Task 4 was not built.

Amended 2026-11-18: favicon path corrected (`public/z-favicon.svg` does not exist; the favicon is `public/favicon.svg`, and it never had the ground band).

Amended 2026-11-18: 2x only at min-height 700px to keep the Fold check (bug 3: 3.2 and the 3.1 current size at short viewports).
