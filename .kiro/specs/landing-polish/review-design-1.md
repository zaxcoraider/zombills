I reviewed `design.md` (including "Motion (R9)") against `requirements.md` (with the 2026-11-17 amendments), the resolution in `review-requirements-1.md`, the steering docs, and the current code in `apps/web/src` and `e2e/`. There is no `tasks.md` yet, so traceability is checked against the design's "Task order" and "Requirements coverage" only. Code-batch checks don't apply because nothing is implemented. I edited no files.

**What I checked and found correct**
- **Landing moon.** I recomputed the disc centre (`right − 0.5D`, `top + 12 + 0.5D`), P, M, the halo radius and the clearance. All four table rows match: (280, 52), (704, 76), (1152, 92), (1464, 100). The horizontal and vertical clearance of `1.25D + 4 = R + 4` holds at every size in the Viewport set, and the check is scroll-invariant by construction.
- **Non-landing moon.** The gap of `0.25W − 144 − 1.25D ≥ 6 px` holds. The current header and `main` really do end at `W/2 + 304` (`slice-page.tsx:258,271`).
- **Contrast numbers.** I recomputed every figure and they match: S = `#646567` at 4.68:1, the card colour `#1e232e`, the Footer card `#1d1f23`, moss on S 3.39, night on moss 11.30, the counter label about 6.9, the `h1` rim colour `#4e4e50` at 6.66, and the candle background `#352d29` at 7.84.
- **Keyframe timing.** Every automatic animation ends by 4.5 s, every count is finite, and the closest stops of each opacity, `text-shadow` or `box-shadow` rule are at least 360 ms apart.
- **Privacy and dependencies.** The CSP needs no change, there is no new dependency and no file under `public/`. There are no absolute URLs in non-test source today.
- **Test amendments.** Every one is equal or stricter. The rows I spot-checked are correct: graveyard-flow line 517 runs from the results gate, graveyard-memory-flow line 331 runs after "Back to the start", and demo-path line 159 runs after "Start again".

## Findings

### Blocker

**1. Phase A ships a focus ring the design itself says fails 3:1**
- **Where:** Design decision "Primary action hover", the Tailwind table row "Primary action" (`focus-visible:shadow-[…same as hover…]`), R4.4, R10.3, R10.2.
- **Problem:** The design admits that the 35 % `--moss` glow "drops the focus ring against the scene below 3:1". The fix arrives only in Phase B, but the requirements say Phase A does not depend on Phase B, so this gap can ship. The glow also reaches 4 + 32 = 36 px, which puts "Other samples:" (about 28 px below the button) under it. That breaks R10.2, and neither the contrast table nor the layout test checks it. The class string "…same as hover…" is also a placeholder an implementer has to guess at.
- **Failing example:** Focus the Primary action with Tab at 1280×720. The ring sits on S plus moss at about 15–20 %, about 2.6:1. "Other samples:" sits on S plus moss glow, about 3.6:1.
- **Fix:** Use the still candle structure in Phase A too, with moss in place of ember: the drop shadow, then `0 0 0 5px color-mix(in srgb, var(--night) 70%, transparent)`, then a glow of at most `0 0 14px 4px`. Write the full class string out. Then add the "18 px from the Primary action" text check and the ring-over-band contrast pair to Phase A (task 3 and task 4), not task 7.

### Major

**2. The global `:focus-visible` glow breaks the ring and neighbouring text on the bare scene**
- **Where:** `index.css` `@layer base :focus-visible` (`box-shadow: 0 0 1rem 0.125rem moss 45%`), the design's contrast row "Focus ring | --moss | S | 3.39", R10.2, R10.3.
- **Problem:** Until now every control sat on a fog card. On the Landing view, the Secondary samples and "Read the privacy note" sit on the bare scene. Their own glow is about 20 % moss right under the 2–4 px ring, and it reaches 18 px, so it lies over the next button's text (`gap-x-1` plus `px-2`) and over the badge text. The 3.39 figure ignores the glow.
- **Failing example:** Tab to "EU bank, semicolons". The ring against S plus about 20 % moss is about 2.6:1. The text of "UK bank, debit and credit columns", about 12 px away, sits on S plus about 15–20 % moss, about 3.6:1.
- **Fix:** For controls on the bare scene, replace the glow with a `--night` band under the ring, as in finding 1. Either add a `zb-bare` class or a `:focus-visible` override scoped to the Landing Hero. Add "ring over its own glow" pairs to `contrast.test.ts` that composite the glow alpha at the ring position.

**3. The title glow's contrast model is wrong; the glow can take the `h1` below 4.5:1**
- **Where:** Motion (R9), "Contrast of the effects", row "`h1` glyph edge … 6.66"; `TITLE_RIM_MIN_ALPHA = 0.4`; R9.7, R10.2.
- **Problem:** The figure assumes at least 40 % `--night` wherever the 16 % bone glow is. But the rim is a 2 px blur and the glow a 10 px blur. From about 3 to 10 px off a glyph, and inside letter counters ("o", "b", "e" at 72 px), there is glow and almost no rim.
- **Failing example:** S plus bone at 0.16 with no night gives `#7a7a79`, about 3.45:1. A counter with about 8 % glow gives about 4.0:1. Both are below the 4.5:1 that R10.2 requires for large text too.
- **Fix:** Check the pair against S plus the full glow alpha with no rim credit. That needs `TITLE_GLOW_ALPHA ≤ 0.02`, which barely shows. Alternatively, compute a Banner-specific S that is honest about the position: at the top of the document the sky gradient is `--night`, not `--fog`. Assert that S separately and size the glow from it. As a third option, draw the glow as an `aria-hidden` element behind the text box, not as a `text-shadow`.

**4. The empty counter card shows on every first visit**
- **Where:** Design "Savings counter on the Landing view" (`div.card → SavingsCounter`, `rounded-xl bg-fog/95 px-4 py-2`); `savings-counter.tsx` returns `null` when there are no totals and no statement.
- **Problem:** On a first visit `fallbackCurrency` is `null`, so the counter renders nothing. The wrapper card still renders as an empty fog pill, 16 px tall, on the first screen every judge sees. It is also a Card Content box with no content.
- **Fix:** Render the card only when there are lines. Either pass a `className` into `SavingsCounter`'s group `div`, or compute `lines.length > 0` in `LandingBanner`. Add a component test: on the first visit there is no `bg-fog/95` element in the `banner`.

**5. The screenshot mask covers the effects it should compare**
- **Where:** Motion (R9) Tests, "Screenshots" (`mask [data-backdrop-fog]`); R13.6.
- **Problem:** Playwright masks the bounding box of each masked element. The backdrop fog bands are full-width, viewport-fixed and 9–15 rem tall. At 1280×720 the far band spans viewport y ≈ 283–523, which covers the Hero art (y 274–538) and most of the left column. The ghost and fog comparison, and t6 ≈ reduced, then test nothing.
- **Fix:** Freeze the Framer fog instead of masking it. Run `page.clock.install()` and `pauseAt` after load: the fog drift is driven by `requestAnimationFrame` (rAF), while CSS animations keep running. Confirm Framer does not hand `x` to WAAPI. Alternatively, mask only the band areas outside the clip.

**6. The screenshot baselines are platform-specific**
- **Where:** Motion (R9) Tests, "baselines generated by `--update-snapshots`" (task 7).
- **Problem:** Playwright saves baselines per platform (`-darwin`, `-linux`), and font antialiasing differs between them. Baselines made on the author's Mac fail or are missing on a Linux CI run.
- **Fix:** Generate and compare the baselines in the pinned `mcr.microsoft.com/playwright` Docker image, matching the installed Playwright version, and document that in task 7. The t6 ≈ reduced and t0 ≠ t6 comparisons can be in-run comparisons that need no baseline.

**7. The 5 s motion rule ignores the fog that drifts for ever on the Landing view**
- **Where:** The requirements' "Decision: automatic motion ends within 5 seconds" ("After that the Landing view moves only in response to the user"), the Motion (R9) principles, `graveyard-backdrop.tsx` `FogBand` (`repeat: Infinity`, 22–40 s).
- **Problem:** The Landing view still shows the backdrop fog drifting endlessly. So the WCAG 2.2.2 claim, and your rule that all automatic motion ends within 5 s, are false on the page judges see first. The requirements carve the fog out as "outside this spec", but the design repeats the claim without that caveat.
- **Fix:** Pick one and record it as a design decision:
  - Pass `reduceMotion || landing` to the fog bands, so the fog is still on the Landing view and still drifts elsewhere. This is a one-line change in `NightScene`, and the "finite" test can then also assert that no WAAPI `Animation` is unbounded.
  - Or state the exception plainly and get the user's sign-off.

**8. Task 3 and task 6 are too big for one small Kiro run each**
- **Where:** Task order, tasks 3 and 6.
- **Problem:**
  - Task 3 has 10 new components, the layout switch, the removal of `IDLE_SENTENCE`, contrast pairs, a static check, the new `landing-page.test.tsx` (about 15 cases) and amendments to 8 test files.
  - Between tasks 3 and 4 the e2e suite is known to be broken.
  - Task 6 has the CSS, the hook, SVG restructuring, the bat, the alphas, a CSS-parsing static check (timing per declaration mapped to keyframe stops) and a jsdom test.
- **Fix:**
  - Split task 3 into 3a, 3b and 3c:
    - **3a:** `SiteFooter` on all current views, the `PRIVACY_NOTE` and `STATEMENT_TIP` split and the URL static check. These are additive, so nothing breaks.
    - **3b:** the Landing components plus the switch plus every jsdom and e2e locator amendment, including the three-line `demo-path` and `layout` locator edits, so no task boundary leaves the e2e suite red.
    - **3c:** `landing-page.test.tsx` and the contrast pairs.
  - Split task 6 into 6a and 6b:
    - **6a:** the CSS, the hook and the SVG groups.
    - **6b:** the static CSS checks, the alphas and the contrast pairs.

### Minor

**9. The ghost's start pose is not hidden behind the stone**
- **Where:** Motion (R9), "SVG structure" ("at its start pose (34 px lower) it is hidden behind the stone").
- **Problem:** The head top is at y 12, which becomes 46 after the offset, but the stone's arched top is at y 52 at the centre and lower at the sides. So a sliver of at least 6 units shows over the stone at t = 0.
- **Fix:** Use `translateY(≥ 44px)` and check that the hem stays above y 108, or clip the ghost group to the area above the stone's arch.

**10. The moon changes look in ways R2.6 and R2.3 don't allow**
- **Where:** "Night scene" (the Landing moon is no longer under the vignette), Non-landing `hidden lg:block`, R2.6, R2.3.
- **Problem:** R2.6 lets only position and size change. Removing the vignette darkening changes the look. Below 1024 px, Non-landing views lose the moon and its sky glow completely; R2.3 allows the moon to be outside the viewport, not removed.
- **Fix:** Get a requirements note added to R2.3 and R2.6 ("MAY be not drawn below 1024 px on Non-landing views; the Landing moon is not under the vignette"), or keep a fixed Non-landing glow with no disc.

**11. Long counter amounts can overflow into the moon reserve**
- **Where:** "Moon geometry" point 2 ("every glyph … at most `right − P`").
- **Problem:** The Banner is `items-start`, and the counter has `min-w-[7ch]` at 2 rem with no shrink, so a wide figure overflows the 200 px Banner text width at 320 px. The proof assumes nothing overflows.
- **Failing example:** At 320 px, "KWD 1,234.50", or three currency lines with large JPY values.
- **Fix:** Give the counter card `max-w-full` and its figure `[overflow-wrap:anywhere]`. Add a restored-state Landing moon test with a large total.

**12. Stars sit behind bare-scene text and are left out of the contrast model**
- **Where:** Colours, "Excluded … Stars … the texture they are today behind the current header".
- **Problem:** The reason given is factually wrong. Today the header is a 95 % fog card, so no star was ever behind text. Stars of up to 1.8 px at opacity up to 0.85 now sit under `h1` and Hero-line glyphs.
- **Fix:** Mask the stars' SVG under the Banner and Hero text band on the Landing view, for example a mask that fades to about 0.3 in the top 600 px, or state the exclusion as an accepted deviation from R10.2.

**13. The static and request checks miss some cases**
- **Where:** "Static checks" (scans `.ts` and `.tsx` only), the `landingRequests` row.
- **Problem:** R11.4 covers all non-test source, and `landing-motion.css` could hold a `url(https://…)`. The `landingRequests` check lists origin, method and path, but not "no query string, no body" as step 10 does.
- **Fix:** Add `.css` to the scan. Reuse step 10's exact predicate (`search === ""`, `postData === null`), plus the special case for `/`.

**14. Two e2e tests depend on wall-clock timing**
- **Where:** "Landing checks", `working` state (`clock.install(2026-01-01T00:00:00Z)` then `pauseAt(…00:10Z)`); "6 s after load".
- **Problem:** `pauseAt` throws if loading plus fonts takes longer than 10 s of fake time on a slow CI runner. The fixed 6 s wait is timing-based.
- **Fix:** Pause relative to the current fake time: `pauseAt(await page.evaluate(() => Date.now() + 500))`. For the 6 s wait, use `expect.poll(() => page.evaluate(() => document.getAnimations().every(a => a.playState === "finished" || a.effect?.getComputedTiming().endTime === Infinity)))`, with a 5.5 s timeout.

**15. The title keyframes must repeat the rim shadows**
- **Where:** Keyframes, `zb-title-glow`.
- **Problem:** If a keyframe lists only the bone glow, the browser pads the shadow lists and animates the two `--night` rims as well. Then the effect contrast pair does not describe what is painted during the fade.
- **Fix:** Every stop lists all three shadows; only the bone alpha changes.

**16. Some criteria have no planned test**
- **Where:** "Requirements coverage".
- **Problem:** These criteria have no planned test:
  - R7.3: the badge on one line at 640 px and wider. The estimate at 1024 px is 549 of 560 px, an 11 px margin.
  - R5.2: Secondary samples with no fill or border and a font size of at least 0.875 rem.
  - R5.5: the drop area at most 128 px tall.
  - R3.1: the `h1` and tagline font sizes.
  - R6.3: the steps in 3 columns at 768 px and wider, stacked below 640 px.
  - R8.5: Footer text size.
  - R10.4: no layer covers a focused control.
- **Fix:** Add computed-style and box assertions to the `empty` state of `landing.spec.ts`. For R7.3, assert the badge height is at most one line box at 640, 1024 and 1280 px.

**17. The steering docs still forbid the Phase B technique**
- **Where:** `spooky-design.md` ("All animation uses Framer Motion. No raw CSS `@keyframes` for interactive or state-driven motion"), `tech.md`.
- **Problem:** The candle and the lean are interactive CSS motion. The user decision exists only in this spec, so a later agent with the steering docs loaded will flag or undo it.
- **Fix:** Have task 6 add a one-line exception to both steering files that points to landing-polish R9.6.

**18. A test-only reset is exported from production code**
- **Where:** `use-landing-motion.ts` (`resetLandingMotionForTests`).
- **Problem:** A test helper ships in the production bundle.
- **Fix:** Keep the flag in a small module and have `landing-motion.test.tsx` call `vi.resetModules()` and re-import it, or accept this and document it.

Verdict: approve after fixes

## Resolution

All 18 findings accepted and applied to `design.md`. Requirement changes carry an "Amended by design review 1 #N" note in `requirements.md`.

| # | Decision | Change |
| --- | --- | --- |
| 1 | Accepted | Design decision "Primary action hover": Phase A uses the candle structure in `--moss` (drop shadow, 5 px `--night` band at 70 %, `0 0 14px 4px` glow at 35 %), class string written out in full. Contrast row "Focus ring on the bare scene and on the Primary action" over `#2a3330`, 7.56:1. The 18 px text clearance is check 10 of the Landing checks (task 4), the contrast pair is in task 3c. |
| 2 | Accepted | New decision "Focus on the bare scene": `BARE_FOCUS` (`landing/bare-focus.ts`) gives the Secondary samples and "Read the privacy note" a `--night` band plus a glow that reaches 8 px. Badge and Secondary-row gaps grow to `gap-x-3`, the list gets `gap-x-1`, so other text is at least 12 px away. Ring-over-own-glow pair in `contrast.test.ts` with `FOCUS_GLOW_ALPHA` and `FOCUS_BAND_ALPHA`, and the 8 px clearance in check 10. |
| 3 | Accepted: full glow alpha, no rim credit | `TITLE_GLOW_ALPHA` is 0.02 (4.51:1 against S plus the glow; 0.03 gives 4.42 and fails). `TITLE_RIM_MIN_ALPHA` removed. The rims stay as paint but get no credit. |
| 4 | Accepted | The card classes go into a new `className` prop on `SavingsCounter`'s group `div`, so no card renders when the counter returns `null`. Test in task 3c: no `bg-fog/95` element in the `banner` on a first visit. |
| 5 | Accepted, by removing the cause | The backdrop fog is still on the Landing view (#7), so nothing needs masking or freezing. The screenshot test is replaced by a computed-style comparison (#6). |
| 6 | Accepted: no pixel baselines | "End state equals still state" compares computed `transform`, `opacity`, `text-shadow` and `box-shadow` of each effect element: end state equals reduced, start pose differs. No snapshots are committed. R13.6 amended. |
| 7 | Accepted: fog rests in place on the Landing view, 5 s rule kept | `NightScene` passes `fogStill = reduceMotion \|\| landing` to the fog bands. The finite test covers every animation in `document.getAnimations()` and checks that `[data-backdrop-fog]` does not move. The 5 s decision and R13.6 amended. |
| 8 | Accepted, as suggested | Task 3 split into 3a (Footer, text split, URL check), 3b (Landing components, switch, every jsdom and e2e locator) and 3c (`landing-page.test.tsx`, contrast pairs). Task 6 split into 6b (CSS, hook, SVG) and 6c (static checks, alphas, contrast). The reviewer's 6a and 6b are 6b and 6c here, because 6a is the steering task of #17. |
| 9 | Accepted | Start offset is 44 px. The stone's top is pinned as a semicircle of radius 28 at (80, 80); the head circle at (80, 74), radius 18, lies inside it, and the hem is at y ≈ 106, above 108. |
| 10 | Accepted: requirements notes | R2.3: the Non-landing moon may be not drawn below 1024 px. R2.6: the Landing moon is not under the vignette. The design cites both. |
| 11 | Accepted | Counter card `max-w-full`, figure `[overflow-wrap:anywhere]`. New "Long counter amounts" layout test at 320 and 1280 px with a large restored total. |
| 12 | Accepted: stated as a deviation | The exclusion reason in "Colours and contrast" is corrected. R10.2 records stars and fence lines under 2 px as an accepted deviation. |
| 13 | Accepted | The URL static check scans `.css` too. `landingRequests` uses step 10's predicate (`search === ""`, `postData() === null`) plus `/`. |
| 14 | Accepted | `pauseAt(await page.evaluate(() => Date.now() + 500))` in the `working` and `working-other` setups. The 6 s wait becomes `expect.poll` on `document.getAnimations()` with a 5.5 s timeout. R13.5 amended. |
| 15 | Accepted | Every `zb-title-glow` stop lists all three shadows; only the bone alpha changes. |
| 16 | Accepted | Check 11 of the Landing checks: computed-style and box assertions for R3.1, R5.2, R5.5, R6.3, R7.3 (with a one-line test at 640, 1024 and 1280 px), R8.5 and R10.4 (`elementFromPoint` at the control and its ring). |
| 17 | Accepted: explicit task | Task 6a, first in Phase B, adds a one-line exception pointing to landing-polish R9.6 to `spooky-design.md` and `tech.md`. Steering files are not edited now. |
| 18 | Accepted | `resetLandingMotionForTests` removed. `landing-motion.test.tsx` uses `vi.resetModules()` and a dynamic import of `App`. |
