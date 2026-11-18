# Bugfix: landing-nits

Five small layout and art bugs on the Landing view of the live site, found in Playwright screenshots at 390 × 844 (phone) and 1280 × 720 (desktop). Each bug has a number; its criteria are numbered `N.1` (current behaviour), `N.2` (expected behaviour) and `N.3` onwards (behaviour that must not change), so tasks can cite them.

Every path is in `apps/web/` unless it starts with `.kiro/` or `packages/`. `landing/` means `apps/web/src/slice/landing/`, `graveyard/` means `apps/web/src/slice/graveyard/`, `e2e/` means `apps/web/e2e/`.

Scope: Landing view only. The Non-landing views, the landing-polish requirements not named here, `packages/core`, the CSP, `netlify.toml`, `index.css`, every `package.json` and `apps/web/public` do not change.

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
- **2.3 Unchanged.** The favicon `public/z-favicon.svg` is byte-for-byte unchanged, and so is `index.html`'s favicon link. The mark stays decorative (`aria-hidden="true"`, `focusable="false"`, `data-brand-mark`, no text, no external reference), `size-14 sm:size-[4.5rem]`, the h1's previous sibling, with unique ids per instance. The tile's rounded clip and its `#0B0D12` ground stay (the mark's own colours, as before).

## Bug 3: Hero art is small and left-aligned below lg

Source: `landing/hero-art.tsx`. Below `lg` the SVG is `h-24 w-32 self-start` (128 × 96 px) on phones and `sm:h-32 sm:w-[10.5rem]` (168 × 128 px) from `sm`, left-aligned in the Hero's flex column.

- **3.1 Current.** At 390 px the Hero art is 128 × 96 px at the left edge of the column.
- **3.2 Expected.** Below 1024 px the Hero art is horizontally centred in the Hero column (box centre within 1 px of the column centre) and about twice today's size: 256 × 192 px (`w-64 h-48`) below `sm`, and 336 × 252 px (`sm:w-[21rem] sm:h-[15.75rem]`) from `sm` to `lg`. Its size comes from its classes alone, so its box is the same before and after fonts load and does not move other content (no layout shift).
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
