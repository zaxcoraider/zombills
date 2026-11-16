# Review of share-card/design.md

Verdict: approve after fixes. I found no blockers. The design covers every criterion of the approved requirements, it applies all 18 review-1 resolutions, and its references to existing code are correct. Those references include `CurrencyTotal`, `haunt.tombstones` and `haunt.savings`, `useAnnounce`, `helperPanelMotion`, `expectUniqueButtonNames`, the font tokens in `index.css`, the ESLint blocks, `buryNetflix` and the demo-path steps.

I checked the layout numbers by hand and they hold:
- The largest content puts its top at 412 and its last line box ends at 857, inside the band 410–860.
- The arch is 336 px half-wide at y 412, wider than the 320 px a full-width line needs.
- The Req 2.9 examples come out at 32 px and 25 px.
- The stone face composites to about `#333740`, which gives bone text about 9.6:1 and moss about 7:1.

The fit loop always ends, and `Array.from` never splits a surrogate pair. The CSP reasoning is right.

## Findings

1. **should-fix · Testing strategy, component tests (`test-share.ts`)**
   - **Problem:** `test-share.ts` holds both `renderControl` and `openGraveyardWithNetflix()`, which renders `<App />`. Loading it imports `App`, which imports `use-share-image`, which imports the mocked `./share-card-renderer`. That mock's factory then runs `await import("./test-share")` while `test-share` is still loading. The factory gets a half-loaded module where `renderControl` is undefined, or the import hangs.
   - **Failing example:** Task 7's first `share-panel.test.tsx` run fails with `Cannot read properties of undefined (reading 'render')` from the mock factory, or it times out.
   - **Fix:** Put `renderControl` in its own file with no app imports, for example `graveyard/test-share-render.ts`. Alternatively, make the factory look the mock up at call time: `renderShareCard: (...a) => import("./test-share-render").then(m => m.renderControl.render(...a))`. Say this in the design.

2. **should-fix · Share and save flow, `downloadFile` default**
   - **Problem:** In the timer `if liveUrl === url: URL.revokeObjectURL(url); liveUrl = null`, the scope of `liveUrl = null` is ambiguous. If an implementer puts it outside the `if`, the first call's timer clears `liveUrl` after a second call has set it. The second call's timer then sees `liveUrl !== url` and never revokes its URL.
   - **Failing example:** Two `Save image` clicks 300 ms apart leave the second object URL alive for good. The one-click unit test still passes.
   - **Fix:** Write `setTimeout(() => { URL.revokeObjectURL(url); if (liveUrl === url) liveUrl = null; }, REVOKE_AFTER_MS)`. Revoking a URL twice does no harm. Add a two-calls-then-advance-timers case that expects both URLs revoked.

3. **should-fix · Render runs (`use-share-image.ts`), latest-content rule**
   - **Problem:** `latest.current = content` is set in a `useEffect`. React can run that effect after paint when the update did not come from a click, for example the burial's animation-complete or 2 s fallback timer settling `savings`. A render that settles in that gap compares against old content and is accepted. No stale share can happen, because `current` uses the prop and keeps the main button `aria-disabled`. The user still hears `Image ready. <old alt>` followed by `Image updated.`
   - **Fix:** Set `latest.current = content` during render (a ref write the hook owns, no setState), or use `useLayoutEffect`. Keep the `useEffect` only for starting the `update` run.

4. **should-fix · Notes for the requirements (missing note): stale first render announcement**
   - **Problem:** The design restarts a stale first render with trigger `"make"` and announces `Image ready. …`. R4.6 says "A re-render caused by a content change SHALL announce only `Image updated.`". R4.4 says a render started by the button announces `Image ready`. A stale first render fits both rules.
   - **Failing example:** In the R9.3 scenario (click Make, Unbury Spotify, resolve), one reading expects `Image updated.` and the other expects `Image ready. …`.
   - **Fix:** Amend R4.6: "…except that a run started by the R4.4 button that is redone for newer content still announces `Image ready. <alt text>`". Also add that announcement to R9.3.

5. **nit · Types and public API vs Module layout**
   - **Problem:** The module table gives `useShareImage(content, render)`, but the API gives `useShareImage(content, onBeforeFail?)`.
   - **Fix:** Use `useShareImage(content, onBeforeFail?)` in both places.

6. **nit · Renderer**
   - **Problem:** `canvas.getContext("2d")` and the `width`/`height` setters run outside any `try`. If they throw, the raw browser error message comes through, which R3.6 does not allow.
   - **Fix:** Wrap them so the rejection reads `share-card: no 2d context`.

7. **nit · Art**
   - **Problem:** The design says the halo "does not reach the stone". The halo is centred (870, 290) with r 100, the arch is centred (540, 610) with r 390, and the centres are 459.7 apart. So the halo overlaps the stone by about 30 px. The disc clears it by about 18 px.
   - **Failing example:** A `share-card-art.test.ts` "moon lies outside the stone" check that includes the halo fails.
   - **Fix:** Correct the sentence. The test should check the disc only (centre distance − 390 ≥ 52).

8. **nit · Generators (R10.1)**
   - **Problem:** The design sets `answer` with `.map` and also forces `cadenceAssumed === (yearlySavingCents === null)`. R10.1 says "filtered to `answer: "not-using"`" and says nothing about the second change. The change is sound, because graveyard-ui R9.8 guarantees that rule for real records, but the design departs from the requirement text without saying so.
   - **Fix:** Add a sentence to R10.1, or add a fifth note.

9. **nit · Renderer fonts vs R9.2**
   - **Problem:** `facesToLoad` adds `…` to the texts, so it loads more than the "source texts" R3.2 and R9.2 name. A test that checks the exact text will not match the design.
   - **Fix:** Say in R9.2's test that the loaded text contains every source text of that face, or drop the extra `…`.

## Which notes need a requirements amendment

- **Note 1 (`Could not save the image in this browser.`): amend.** Add a criterion to R5.6 for `downloadFile` throwing. Add the message to R7.5's list and to the R9.4 cases. Without that, the design adds a user-facing string that no requirement covers.
- **Note 2 (focus rescue on a failing update): amend.** R7.1 says "Focus SHALL NOT move by itself when a render … settles", and the design moves focus. Add the exception to R7.1: if the main button has focus when R4.7 removes it, focus moves to the R4.4 button.
- **Note 3 (`vi.mock("./download-file")`): small wording change only.** It meets the purpose of R5.6, which is that jsdom navigation never runs. Change R9.4 to "pass a fake `downloadFile`, as a prop or by mocking `download-file.ts`" so a literal reading does not fail.
- **Note 4 (extra layout cases): no amendment needed.** R7.6 already requires the 200 % text case and the 44 × 44 targets. Adding them to R9.7 would only help traceability.
- **Not in the notes but needs an amendment:** finding 4 (R4.4 vs R4.6), and finding 8 (R10.1) if you keep the `.map`.

## Checks with no findings

- **Coverage:** every criterion in R1–R7, R9 and R10 maps to a design section, and the tasks are ordered with the panel states (task 7) separate from share and save (task 8).
- **Fit loop:** it goes from the start size to the floor, tries code-point prefixes from longest to shortest, and falls back to `…`. A measure that returns `NaN` ends at the last fallback.
- **jsdom renderer tests:** everything is injected, so the tests never reach jsdom's missing `getContext`. Jsdom does have `FileReader`, `Blob` and `File`.
- **Chromium:** the canvas is set to exactly 1080 × 1080, so the PNG is 1080 wide and high whatever the `devicePixelRatio`, and the `@fontsource` families are already imported in `main.tsx`.
- **Races:** a sequence number guards every run, the main button is gated on `current`, only one run happens at a time, and late results after unmount are dropped.
- **CSP:** the policy is unchanged. The Preview uses a `data:` image, which `img-src` allows, and the `blob:` URL is used only for the `<a download>` navigation.
- **Live region and focus:** the panel writes through the `SlicePage` notice, which an Unbury clears before `Image updated.` is written. The R4.4 button stays mounted, and the panel uses `aria-disabled` instead of `disabled`.
- **Lint and privacy:** the existing lint covers the new files, there are no new dependencies, and nothing is stored or logged.
- **Existing tests:** `graveyard-view.test.tsx:123`'s `ul > li > div > section` count stays at 2, because the panel's section is outside the list.

Verdict: approve after fixes

## Resolution

All 9 findings accepted with the reviewer's fixes. Notes 1–3 and findings 4 and 8 amended `requirements.md` as the "Which notes need a requirements amendment" section says; note 4 needed no change. The design's "Notes for the requirements" section is marked resolved, and each amendment has a row in the Resolution table of `review-requirements-1.md`.

| Finding | Decision | Where changed |
| --- | --- | --- |
| 1 | Accepted. `renderControl` moved to its own file, `graveyard/test-share-render.ts`, which imports nothing from the app. The mock factory imports that file; `test-share.ts` re-exports it. | design: Testing strategy, Component tests; Task order, task 7 |
| 2 | Accepted. The timer always revokes its own URL and clears `liveUrl` only when it still matches. Added a two-calls-then-advance-timers case expecting both URLs revoked. | design: Share and save flow (`downloadFile` default); Testing strategy, `download-file.test.ts` |
| 3 | Accepted. `latest.current = content` is written during render; the `useEffect` only starts `update` runs. A bullet explains why. | design: Render runs (`use-share-image.ts`) |
| 4 | Accepted. R4.6 gains the exception for a redone R4.4 run, and R9.3 expects `Image ready. <alt text>` in the stale-first-render case. The design cites the exception. | requirements: R4.6, R9.3; design: Render runs |
| 5 | Accepted. The module table now reads `useShareImage(content, onBeforeFail?)`. | design: Module layout |
| 6 | Accepted. The size setters and `getContext("2d")` are wrapped, so a throw rejects with `share-card: no 2d context`. The renderer test and the error table cover it. | design: Renderer; Error handling summary; Testing strategy, `share-card-renderer.test.ts` |
| 7 | Accepted. The Art note now says the halo overlaps the stone by about 30 px and is covered by it; the test checks the disc only (centre distance − 390 ≥ 52). | design: Art; Testing strategy, `share-card-art.test.ts` |
| 8 | Accepted. Added the sentence to R10.1 allowing `.map` with `cadenceAssumed` set exactly when `yearlySavingCents` is `null`. | requirements: R10.1; design: Generators |
| 9 | Accepted. The renderer test checks that each `load` text contains every source text of its face, and may contain more. | design: Testing strategy, `share-card-renderer.test.ts` |
| Note 1 | Amended. New R5.6 criterion for a throwing `downloadFile`; message added to R7.5 and to R9.4. | requirements: R5.6, R7.5, R9.4; design: Notes (resolved) |
| Note 2 | Amended. R7.1 names the focus exception. | requirements: R7.1; design: Live region and focus, Notes (resolved) |
| Note 3 | Amended. R9.4 allows a prop or a mock of `download-file.ts`. | requirements: R9.4; design: Notes (resolved) |
| Note 4 | No change. R7.6 already requires the cases. | design: Notes (resolved) |
