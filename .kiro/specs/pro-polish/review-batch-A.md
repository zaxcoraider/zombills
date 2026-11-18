# Batch A review: pro-polish tasks 1 to 16
**What I ran:** `npm run typecheck`, `npm run lint` and `npm test` all pass (core: 115 files, 2358 tests; web: 83 files, 1216 tests). I could not run `npm run build` or `npm run test:e2e`, because the tool environment refused permission. So none of the new Playwright tests has been run by me: the peek, header height, scene scroll, fog, Stage box and share preview checks. Task 16's checkpoint needs those two runs before it can be ticked.
**What holds:**
- **Privacy and CSP:** `git status` shows no change to `csp-plugin.ts`, `netlify.toml`, any `package.json` or `packages/core`. `public/` holds exactly the three allowed files. The only absolute URLs in `src` are the three in `landing-text.ts`, and nothing requests `og-image.*` at runtime.
- **Motion:** the fog drift (`repeat: Infinity`) is gone. The footer peek is hover/focus only and at most 0.3 s. Under reduced motion it changes only the outline opacity, with no ghost.
- **Header and focus:** there is one `h1` per view, the Home control has the name "Zombills, back to the start", and `go-home` keeps the Graveyard and Memory.
- **Phones:** the scene's children wrapper has `overflow-clip`, so the new `w-screen` footer ground can't cause sideways scroll, even with classic scrollbars.
- **Share image:** I looked at `og-image.png`. It has no logo and no statement data, and the ghost has oval eyes and no mouth.
- **Not applicable to this batch:** EARS form, bank-data formats and money arithmetic (no amount logic changed).
## Findings
1. **Severity: should-fix**
   **Where:** `.kiro/specs/pro-polish/design.md` lines 551 and 930–931 (working-tree diff).
   **Problem:** The batch edited `design.md`. The task rules say "Do not edit `requirements.md` or `design.md` of this spec." The two changes (wordmark cap height 120 → 96 px, and two new rows in "Existing tests that change") look reasonable, but they were not approved.
   **Failing example:** `git diff .kiro/specs/pro-polish/design.md` is not empty.
   **Suggested fix:** Get your sign-off on both changes. Otherwise revert `design.md` and keep the notes only in tasks 10 and 12, where they already exist.
2. **Severity: should-fix**
   **Where:** `landing/hero.tsx:49–62`; task 15; Req 11.1.
   **Problem:** The fallback that puts `FREE_LINE` on the same row as the Secondary samples from `sm` is always on. Task 15 allows it only if a Fold check fails, and no note says one did. From 640 px, "Free. No sign-up. No bank login." and "Other samples: UK bank statement…" sit on one wrapped row and read as one run-on line.
   **Failing example:** At 1280×800 the free line and "Other samples:" share a baseline.
   **Suggested fix:** If no Fold check failed, render `FREE_LINE` as its own `p` after `PrimaryAction`, as task 15 says. If one did fail, record the size in task 15's notes and add a visible gap or line break before "Other samples:".
3. **Severity: should-fix**
   **Where:** `logic/test-arbitraries.test.ts`; Req 1.10 and 1.11 (P2).
   **Problem:** The coverage test checks view kinds and screens separately. It does not check the combinations that P2's branches need: `idle` on the Graveyard screen (`back-to-start`) and `results` on the Graveyard screen. P2 can pass without ever testing the `back-to-start` path.
   **Failing example:** An arbitrary that only reaches the Graveyard screen through `results` still passes the test.
   **Suggested fix:** Collect `${kind}:${screen}` pairs and assert they include at least `idle:graveyard`, `results:main`, `results:graveyard`, `error:main`, `no-subscriptions:main` and `working:main`.
4. **Severity: should-fix**
   **Where:** `e2e/pro-polish.spec.ts:164–187`; Req 2.8.
   **Problem:** The touch-tap test taps "Privacy note". Activating that stone moves focus to the Privacy note paragraph, so a regression where a tap leaves `whileFocus` stuck on would be hidden.
   **Failing example:** If `whileFocus` matched after a tap, focus would already have left the stone, and the test would still pass.
   **Suggested fix:** Tap a link stone (for example "Zombills on GitHub") after adding a capturing `click` listener that calls `preventDefault()`. Then assert the face and ghost are at identity while the stone still has focus.
5. **Severity: nit**
   **Where:** `chrome/chrome.test.tsx`; Req 1.4 (amended by design review 1 #6).
   **Problem:** No test checks that the Leave question stays open across a change within one state kind. The code is right: the effect is keyed on `view.kind` and `screen` only.
   **Suggested fix:** Add a case: open the question on `results`, dispatch a keep or burial step through the card, and assert the group is still shown.
6. **Severity: nit**
   **Where:** `slice-page.tsx:243–252`.
   **Problem:** The effect that closes the Leave question reads `leave.open` but lists only `[view.kind, model.screen]` as dependencies. This is intended, but nothing explains it, and the react-hooks lint rule is not active to flag it.
   **Suggested fix:** Add a comment saying the omission is deliberate: opening the question must not trigger the close.
7. **Severity: nit**
   **Where:** Task 8 cites Req 2.11; `contrast.test.ts`.
   **Problem:** The footer text pairs are not checked in this batch. That covers the Reaper description and Privacy note on `GROUND_BACKGROUND`, and the stone labels on `--fog`. The tasks schedule these rows for task 24, so the Footer ships in Batch A without its contrast proof.
   **Suggested fix:** Either add the Footer rows now, or drop 2.11 from task 8's `_Requirements_` line.
8. **Severity: nit**
   **Where:** `src/static-checks.test.ts:5`.
   **Problem:** A `src` unit test imports `../e2e/og-font-paths`, which reads a font from `node_modules`. This crosses the src/e2e line that `structure.md` draws.
   **Suggested fix:** Move the measuring helpers to a neutral place (for example `apps/web/scripts/`), or add a note in task 10.
9. **Severity: nit**
   **Where:** `e2e/landing.spec.ts` (most hunks) and `src/static-checks.test.ts` (keyframe hunks).
   **Problem:** A Prettier pass reflowed many lines that no task touched. This makes the Req 13.2 check ("no assertion widened or removed") harder to review. I read through it and found no logic change in the reflowed parts.
   **Suggested fix:** Revert the reflow on untouched lines, or keep it in a separate format-only change.
10. **Severity: nit**
    **Where:** `e2e/landing.spec.ts:736–757`.
    **Problem:** The 390×844 "touch targets are at least 44 x 44" list does not include the two new footer stones ("Privacy note", "Built with Kiro"). `pro-polish.spec.ts` covers their size, so this is a consistency gap only.
    **Suggested fix:** Add both stones to the target list.
Verdict: approve after fixes

## Resolution

All ten findings accepted with the reviewer's suggested fixes (2026-11-18).

| # | Resolution |
| --- | --- |
| 1 | Kept. Both `design.md` edits were decisions by the project owner: the wordmark cap height of 96 px (task 10; 120 px overflowed by about 80 px) and the two rows in "Existing tests that change" (task 12). They stay, with their notes in tasks 10 and 12. |
| 2 | No Fold check failed, so `FREE_LINE` is now a line of its own at every width. As a sibling `p` after `PrimaryAction` it made the Hero about 48 px taller at 1280 × 800 and two existing scene checks in `landing.spec.ts` failed by one level (ridge band blend, no ground line), so it stays the first child of the Secondary samples' wrapper with `sm:basis-full`. Recorded in task 15. New browser test: at 640, 1280 and 1920 px "Other samples:" starts below the free line. |
| 3 | `test-arbitraries.test.ts` collects `${kind}:${screen}` pairs and asserts `idle:graveyard`, `results:main`, `results:graveyard`, `error:main`, `no-subscriptions:main` and `working:main`. |
| 4 | The touch-tap test taps "Zombills on GitHub" with a capturing `click` listener that calls `preventDefault()`, asserts the stone still has focus, then asserts face and ghost are at identity. |
| 5 | `chrome.test.tsx`: opens the Leave question on `results`, answers the card ("Yes, let it rest"), and asserts the same group is still shown. |
| 6 | `slice-page.tsx`: comment on the close effect saying `leave.open` is left out of the dependencies on purpose. |
| 7 | Footer contrast rows added now in `contrast.test.ts` (Reaper description and Privacy note on `GROUND_TOP`, stone labels on the lightest stone face, moss outline at least 3:1). Noted in task 8. |
| 8 | `og-font-paths.ts` moved to `apps/web/scripts/`; the export spec and `static-checks.test.ts` import it from there. Design file table and task 10 note updated. |
| 9 | The Prettier reflow of untouched lines in `e2e/landing.spec.ts` and `src/static-checks.test.ts` is reverted; only the logic hunks remain. |
| 10 | "Privacy note" and "Built with Kiro" added to the 390 × 844 touch-target list in `landing.spec.ts`. |

Also in this fix round, from the owner's visual review of the built site: the Footer stones are redrawn as SVG headstones with the risen ghost seen whole (Req 2.7, 2.8, 2.11 and design "Signature moments: 4", amended 2026-11-18), and the dark band under the card on the Stage at 390 × 844 is removed, with a browser check that samples it (task 13 note, design "Browser tests").
