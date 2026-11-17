# Review of the Requirement 11 design (art polish) — spec-reviewer, 2026-11-17

1. **Major.** Where: design, Testing strategy table, P5; `test-share-card-geometry.ts` signature `discRectDistance(cx, cy, box)`.
   - Problem: P5 checks "star and glow discs by `discRectDistance > 0`", but the helper takes no radius, so it measures from the centre point only. The glow centre (870, 290) is outside every Text box, so the glow check can never fail. The star check ignores `r`. R11.13 requires the property to check that no star or glow disc intersects any Text box.
   - Failing example: change `GLOW_R` to 130. The glow disc now overlaps the brand box (118.4 < 130), and P5 still passes.
   - Fix: in P5, require `discRectDistance(s.x, s.y, box) > s.r` for stars and `> GLOW_R` for the glow, as the art unit test already does. Or give the helper an `r` parameter and return the distance minus `r`.

2. **Major.** Where: design, Art polish → Tests, `share-card-renderer.test.ts` row ("A context whose `addColorStop` throws"); R11.2 last sentence.
   - Problem: the sky's `vertical-gradient` (op 0) also calls `addColorStop`. If the fake makes every `addColorStop` throw, the sky throws first, and R3.6 requires a rejection with `drawing failed`. The test as written then either fails, or pushes the implementer to wrap the linear gradient in a try too, which would break R3.6.
   - Failing example: `createLinearGradient` and `createRadialGradient` both return a gradient whose `addColorStop` throws. `renderShareCard` rejects, but the test expects an Image.
   - Fix: say that only the gradient returned by `createRadialGradient` throws from `addColorStop`, and the linear one stays normal. Add a second case where `createRadialGradient` itself throws. Add a third case where the linear `addColorStop` throws and the render still rejects with `share-card: drawing failed`.

3. **Minor.** Where: design, Stars, `buildStars` (`hypot`, `rectDistance`); the decision row "identical in every browser".
   - Problem: the spec calls `Math.hypot` "implementation-approximated", so it can differ by one ulp between engines. A comparison at an exact boundary can then flip, and the star list would differ between browsers. Example: two stars exactly 24 px apart, or a star whose distance to the glow centre is exactly 117.5.
   - Fix: compare squared values. All inputs are integers, or halves for `r`, so scaling by 4 makes the comparison exact: `dx² + dy² ≥ 24²`, and `4·(dx² + dy²) ≥ (2·(108 + r + 8))²`.

4. **Minor.** Where: `share-card.test.ts:551`, `share-card-fit.test.ts:23,31`.
   - Problem: two existing tests will break, and the design does not list them under the changed tests.
     - The recording-measure test finds a call's role with `call.font.startsWith(\`${style.weight} \`)`. The epitaph font starts with `italic `, so the lookup returns `undefined` and the test fails. `brand` and `epitaph` also share weight 400, so the lookup is ambiguous even after a fix.
     - `RoleStyle` literals in the fit tests lack the new required `style` field, so `npm run typecheck` fails.
   - Fix: list both files. Match the role by the full `fontFor(style, size)` prefix, which includes style and family. Add `style: "normal"` to the fit-test literals.

5. **Minor.** Where: design, Tests, grass row ("≥ `GROUND_TOP − 30` for vertices with x in [220, 860]").
   - Problem: R11.5 limits height over x 220–860, not at vertices. A blade can have its tall vertex just outside x 220 while its edge crosses into the range above 30 px. Today's data is safe: the nearest tufts end at x 209 and start at x 874.
   - Failing example: a tuft at x 214 with h 38 (box x 204–223). Its blade tip at x 213 is outside the range, but the edge to (216, 900) crosses x 220 at a height above 30 px. The vertex-only test passes.
   - Fix: test the tuft's bounding box: if x `b−10`..`b+9` intersects [220, 860], then require `h ≤ 30`. That is the rule the design text already argues.

6. **Minor.** Where: design, Contrast (R11.8), `compositeAt`, the `vertical-gradient` line.
   - Problem: "linear sRGB interpolation" can be read as interpolating in linear light. The canvas interpolates the gamma-encoded sRGB values, so that reading would give the wrong sky colour.
   - Fix: write "linear interpolation of the 8-bit sRGB channel values between the two stops (gamma-encoded, as the canvas does)".

7. **Minor.** Where: `tasks.md` (no R11 entries); design "Task order (R11)".
   - Problem: no task's `_Requirements_` line names R11.1–R11.13 yet, so R11 cannot be traced to tasks.
   - Fix: when you add the four tasks, map them as follows:
     - Task 1: 11.1, 11.2 (renderer), 11.3 (ESLint), 11.9.
     - Task 2: 11.6, 11.10, 11.11.
     - Task 3: 11.2–11.8, 11.13.
     - Task 4: 11.12.

8. **Minor.** Where: design, ESLint (R11.3).
   - Problem: `no-restricted-properties { object: "crypto", property: "getRandomValues" }` does not catch `globalThis.crypto.getRandomValues(...)` or `self.crypto.getRandomValues(...)`. Today's block has the same gap for `Math.random`, so this is consistent with existing practice, but weaker than "SHALL NOT call".
   - Fix: add the selector `MemberExpression[property.name='getRandomValues']` to the new `no-restricted-syntax` entry.

9. **Minor.** Where: design, Design decisions, the Opacity row.
   - Problem: the row says "Req 3.4 forbids parsing or writing colour strings", then writes a `color-mix(...)` string. Req 3.4 and R11.2 forbid hex literals and parsing, not writing a wrapper.
   - Fix: "Req 3.4 and R11.2 forbid hex literals and parsing colour strings; `color-mix` wraps the resolved value without parsing it."

## Other checks
- **Renderer fallback.** `tryRadial` wraps only the gradient's construction and its stops. A throwing `arc` or `fill` still rejects with `drawing failed` (R3.6). `globalAlpha` is reset in `finally`. A skipped glow leaves the moon disc drawn.
- **Determinism.** `STARS` is frozen at module load, with no mutable module state (R11.3). `floor(rand × n)` is exact for 32-bit values. The only caveat is finding 3.
- **R11 coverage.**
  - Every criterion from 11.1 to 11.13 has a test in the design.
  - R11.12 (unchanged CSP, no new dependency) relies on the existing CSP and static checks, which is acceptable.
  - R11.3's lint rule is enforced by `npm run lint`, not by a unit test.
- **Steering.** No network call, storage, new dependency or CSP change. Money is not touched.
- **Checklist items that don't apply.** EARS wording (requirements already reviewed), real-world CSV data and money don't apply to this art change. No code batch was implemented, so item 8 doesn't apply: the current code is still pre-R11 (8 art operations).

Verdict: approve after fixes

## Resolution

| # | Decision | Where |
| --- | --- | --- |
| 1 | Accepted. `discRectDistance` takes `r` and returns the centre-to-box distance minus `r`. P5 and the art test require `> 0` for each star (with `s.r`) and for the glow (with `GLOW_R`). | design: Testing strategy P5; Tests (R11.13), helper signature and `share-card-art.test.ts` row |
| 2 | Accepted. The renderer test has three cases: only the radial gradient's `addColorStop` throws (Image, glow skipped); `createRadialGradient` throws (Image, glow skipped); the linear gradient's `addColorStop` throws (rejects with `share-card: drawing failed`). | design: Tests (R11.13), `share-card-renderer.test.ts` row |
| 3 | Accepted. `buildStars` compares exact squared integers (`rectDistanceSq`, scaled by 4), with no `Math.hypot`. | design: Stars (R11.3) pseudocode and notes; Design decisions (R11), Stars row; ESLint (R11.3), Math list |
| 4 | Accepted. Both files are listed: the recording-measure test matches by the full `fontFor(style, size)` prefix, and the fit-test `RoleStyle` literals gain `style: "normal"`. | design: Tests (R11.13), `share-card.test.ts` and `share-card-fit.test.ts` rows |
| 5 | Accepted. The grass height rule is tested by tuft bounding box: if x `b − 10`..`b + 9` intersects [220, 860], then `h ≤ 30`. | design: Tests (R11.13), `share-card-art.test.ts` row |
| 6 | Accepted. The sky line reads "linear interpolation of the 8-bit sRGB channel values … (gamma-encoded, as the canvas does)". | design: Contrast (R11.8), `compositeAt` |
| 7 | Accepted. The task-to-requirement mapping is noted for when the R11 tasks are written; `tasks.md` is not changed now. | design: Task order (R11) |
| 8 | Accepted. The new `no-restricted-syntax` entry adds `MemberExpression[property.name='getRandomValues']`. | design: ESLint (R11.3); Module layout, purity list |
| 9 | Accepted. The Opacity row's reason now reads "Req 3.4 and R11.2 forbid hex literals and parsing colour strings; `color-mix` wraps the resolved value without parsing it." | design: Design decisions, Opacity row |
