# Requirements Document

## Introduction

The Graveyard view (`apps/web/src/slice/graveyard/graveyard-view.tsx`) shows one line per currency, "You buried <total> a year.", and a tombstone per buried subscription. This spec adds the should-have from `product.md` and `prd.md` ("Shareable graveyard image"): from the Graveyard view the user can make a square image of their graveyard, look at a preview, and share it or save it.

The share card has three parts:

- **Share content and layout** (`apps/web/src/slice/logic/share-card.ts`). Pure functions. One turns the Graveyard view's data (the Tombstones and the Savings totals that `deriveHaunt` already computes) into the short list of facts the image may show. A second turns those facts into a list of draw operations for a 1080 × 1080 image, measuring text through a function passed in, so the layout is tested without a canvas. A third writes the preview's alt text from the same facts.
- **Renderer** (`apps/web/src/slice/graveyard/share-card-renderer.ts`). A thin layer that waits for the page's self-hosted fonts, executes the draw operations on a Canvas 2D context and returns the PNG.
- **Share panel** (`apps/web/src/slice/graveyard/share-panel.tsx`). A section in the Graveyard view with a `Make an image` button, the preview, and a `Share image` or `Save image` button.

The image shows only what the Graveyard view already shows, and less of it: the yearly total per currency, the number of subscriptions buried, the Zombills name and the site address `zombills.netlify.app`. It never shows a service name, an amount per service, a date, a cadence, the statement's file name or anything from the statement that is not on the Graveyard view. `zombills.netlify.app` is the project's live Netlify site, owned by the team and deployed since 2026-11-15 (`memory.md`), so the address printed on shared images stays valid.

Privacy (`privacy.md`): the image is drawn in the browser and leaves it only when the user picks a share target in the operating system's share sheet or saves the file. The app makes no request, uploads nothing, stores nothing and logs nothing. The build-time CSP (`apps/web/csp-plugin.ts`, `img-src 'self' data:`) stays unchanged: the preview uses a `data:` URL, and the `blob:` URL used for the download goes only into the `href` of an `<a download>` element, which no CSP fetch directive governs (Requirement 6.3).

This spec also amends the Playwright demo path and layout tests (Requirement 9).

Deferred:

- Service names on the image: deferred (privacy: generic merchant text can hold places or people's names; review 1 #8, #9). Requirement 8 is kept as a removed placeholder so that requirement numbers stay stable.

Out of scope for this spec:

- Server-side image generation, link previews, Open Graph or Twitter card tags. The site has no backend (`privacy.md`).
- Social-network SDKs, share buttons for named networks, or share URLs such as `twitter.com/intent`. The operating system's share sheet (Web Share API) or a file download are the only ways out.
- Copying the image to the clipboard.
- Storing the image or anything else. Persistence belongs to the future `graveyard-memory` spec.
- Choosing a size, theme or layout for the image. There is one design at 1080 × 1080.
- Translating the image text. All text is English; money follows the Page locale as everywhere else (`formatMoney`).

---
## Glossary

- **Page**, **Answer record**, **Tombstone**, **Savings totals**, **Display name**, **Current record**, **Earlier record**: As defined in the graveyard-ui spec Glossary.
- **Graveyard view**: The view rendered by `apps/web/src/slice/graveyard/graveyard-view.tsx` (graveyard-ui Requirement 7). It reads `haunt.tombstones` and `haunt.savings` from `deriveHaunt` (`apps/web/src/slice/logic/haunt-view.ts`).
- **Guessed tombstone**: A Tombstone with `yearlySavingCents: null` (`cadenceAssumed: true`). Its tombstone reads "Saving unknown: guessed from one charge". It counts in the Buried count but adds nothing to the Savings totals.
- **Buried count**: `haunt.tombstones.length`, the number of Tombstones on the Graveyard view, Current and Earlier records alike, Guessed tombstones included.
- **Share content**: The value returned by `shareCardContent` (Requirement 1): every fact the image and its alt text may state.
- **Draw operation**: One element of the list returned by `shareCardLayout` (Requirement 2): a shape or a line of text with its position, size, font and colour token.
- **Measure function**: `(text: string, font: string) => number`, returning the advance width in canvas pixels of `text` drawn in the CSS font shorthand `font`. In the browser it wraps `CanvasRenderingContext2D.measureText`; in tests it is a fake.
- **Text box**: The rectangle a text Draw operation must fit in: the image width minus 96 px of margin on each side (so 888 px wide), unless Requirement 2 gives a narrower one.
- **Image**: The 1080 × 1080 PNG made by the Renderer from the Draw operations.
- **Preview**: The `<img>` in the Share panel that shows the Image through a `data:image/png;base64,` URL.
- **Share panel**: The section added to the Graveyard view by this spec (Requirement 4).
- **Share path**: The Share panel's main button when the browser can share the Image as a file: `navigator.share` exists, `navigator.canShare` exists, and `navigator.canShare({ files: [file] })` returns `true` for the Image file. Otherwise the panel uses the **Save path**.
- **Image file**: `new File([png], "zombills-graveyard.png", { type: "image/png" })`, where `png` is the Image as a `Blob`.
- **Colour token**: One of the `spooky-design.md` colour token names without the `--` prefix (`night`, `fog`, `bone`, `moss`), with an opacity from 0 to 1. The Renderer resolves a token to its value through `RenderDeps.resolveToken` (Requirement 3.4) and applies the opacity with `ctx.globalAlpha`, so no hex value is written or parsed in the share card code.
- **Live region**: The Page's `role="status"` region in `apps/web/src/slice/slice-page.tsx`, written through `useAnnounce()` (`apps/web/src/slice/graveyard/use-announce.ts`), which clears the region and writes the text in a later frame (cancel-helper Requirement 8.3).

---

## Requirements

### Requirement 1: Share content

**User Story:** As a user proud of what I buried, I want the image to say how much I save and how many subscriptions I buried, and nothing else, so that I can share it without giving away my statement.

#### Acceptance Criteria

1. THE module `apps/web/src/slice/logic/share-card.ts` SHALL export the constants `SHARE_IMAGE_SIZE = 1080`, `MAX_TOTAL_LINES = 3`, `SHARE_SITE_NAME = "Zombills"`, `SHARE_SITE_ADDRESS = "zombills.netlify.app"` and `SHARE_FILE_NAME = "zombills-graveyard.png"`, and a function:

   ```ts
   type ShareCardContent = {
     totalLines: readonly string[];  // "I buried $215.88 a year.", at most MAX_TOTAL_LINES
     moreCurrencies: number;         // currencies not shown in totalLines, >= 0
     countLine: string;              // Criterion 4
   };

   function shareCardContent(
     tombstones: readonly AnswerRecord[],   // haunt.tombstones, Graveyard order
     savings: readonly CurrencyTotal[],     // haunt.savings, code-unit order of currency
     locale?: string,
   ): ShareCardContent;
   ```

2. `totalLines` SHALL hold, for the first `MAX_TOTAL_LINES` entries of `savings` in the given order, the line `I buried <amount> a year.` with `<amount>` = `formatMoney(totalCents, currency, locale)` (`apps/web/src/slice/logic/money.ts`), so each line states the same figure as the Graveyard view's `You buried <amount> a year.` line for that currency. `moreCurrencies` SHALL be `savings.length - totalLines.length`.
3. THE function SHALL NOT recompute, round, convert or add up amounts across currencies. It SHALL use `savings` as given; `savingsTotals` (`apps/web/src/slice/logic/graveyard.ts`) stays the only place that sums savings.
4. `countLine` SHALL be built from the Buried count `n` and the number `g` of Guessed tombstones in `tombstones`:

   | Case | `countLine` |
   | --- | --- |
   | `savings` not empty, `g = 0` | `<n> subscription buried.` when `n = 1`, else `<n> subscriptions buried.` |
   | `savings` not empty, `g > 0` | as above without the full stop, then `, <g> with saving unknown.` |
   | `savings` empty (every Tombstone is guessed) | `I buried <n> subscription.` or `I buried <n> subscriptions.`, then ` Saving unknown.` |

   Numbers SHALL be written with ASCII digits and no grouping, so the line does not depend on the locale.
5. THE function SHALL read from each Answer record only `yearlySavingCents`, and from each Currency total only `currency` and `totalCents`. It SHALL NOT read `merchant`, `serviceId`, `currentAmountCents`, `cadence`, `id`, `answer`, any Subscription, the statement, its file name, any date or any evidence. The image therefore holds no service name, no amount per service, no cadence and no date.
6. THE function SHALL be pure: no DOM, clock, randomness, storage or `console`, no mutation of its arguments, and deeply equal arguments SHALL give deeply equal results. It SHALL NOT throw for any Graveyard the Page can hold; a `RangeError` from `formatMoney` cannot happen, because every `totalCents` from `savingsTotals` is a safe integer.
7. THE Share panel SHALL be shown only WHEN `haunt.tombstones.length > 0`. With no Tombstone the Graveyard view keeps showing only "Nothing buried yet." (graveyard-ui Requirement 7.6).
8. Examples the implementation SHALL satisfy (locale `en-US`):

   | Tombstones | `savings` | Result |
   | --- | --- | --- |
   | Netflix (`netflix`, saving 21588) | `[{ USD, 21588 }]` | `totalLines: ["I buried $215.88 a year."]`, `moreCurrencies: 0`, `countLine: "1 subscription buried."` |
   | Netflix, Riverside Gym Membership (`null` serviceId), The Economist (guessed) | `[{ USD, 56388 }]` | `totalLines: ["I buried $563.88 a year."]`, `countLine: "3 subscriptions buried, 1 with saving unknown."` |
   | One guessed Tombstone | `[]` | `totalLines: []`, `countLine: "I buried 1 subscription. Saving unknown."` |
   | Tombstones in EUR, GBP, JPY, USD | four totals | three `totalLines` (EUR, GBP, JPY), `moreCurrencies: 1` |

---

### Requirement 2: Deterministic layout

**User Story:** As the team, I want the image layout to be a pure function from the Share content to draw operations, so that we can prove in plain unit tests that every line fits and nothing extra is drawn.

#### Acceptance Criteria

1. THE module `apps/web/src/slice/logic/share-card.ts` SHALL export `shareCardLayout(content: ShareCardContent, measure: MeasureFn): readonly DrawOp[]` with:

   ```ts
   type MeasureFn = (text: string, font: string) => number; // Glossary "Measure function"
   type ColourToken = "night" | "fog" | "bone" | "moss";
   type Paint = { token: ColourToken; alpha: number };      // alpha in [0, 1]

   type TextOp = {
     kind: "text";
     role: "brand" | "total" | "more-currencies" | "count" | "address";
     text: string;
     x: number;                 // anchor; align "center" means x is the centre
     y: number;                 // alphabetic baseline
     align: "center";
     font: string;              // CSS font shorthand, e.g. `600 72px "Inter", ui-sans-serif, system-ui, sans-serif`
     sizePx: number;            // the px size inside `font`
     maxWidth: number;          // width of the Text box
     fill: Paint;
   };

   type ShapeOp =
     | { kind: "rect"; x: number; y: number; w: number; h: number; fill: Paint }
     | { kind: "vertical-gradient"; x: number; y: number; w: number; h: number; stops: readonly { offset: number; paint: Paint }[] }
     | { kind: "circle"; cx: number; cy: number; r: number; fill: Paint }
     | { kind: "path"; commands: readonly PathCommand[]; fill: Paint };  // straight lines only

   type PathCommand =
     | { op: "move" | "line"; x: number; y: number }
     | { op: "close" };

   type DrawOp = TextOp | ShapeOp;
   ```

   The design SHALL NOT add a shape kind, a path command (no curves, no radial gradient or glow), a text kind or a `TextOp` field that carries other text.
2. THE layout SHALL draw, in this order: the art (Criterion 3), then every `TextOp`. No shape SHALL come after the first `TextOp`, so no shape covers text.
3. *Art.* THE art SHALL echo the Page's night scene and tombstone (`night-scene.tsx`, `graveyard-backdrop.tsx`, `tombstone.tsx`) using only Colour tokens: a sky from `night` to `fog` (`vertical-gradient`), a moon (`bone`, `circle`), a ground band along the bottom (`rect`), and one tombstone shape standing on the ground in the centre, behind the total and count lines. The tombstone SHALL be built from a `rect` with a `circle` for its rounded top, or from one straight-line `path`. The art SHALL contain no service logo, no blood, no gore and no imagery beyond the graveyard metaphor (`spooky-design.md`). The tombstone carries meaning: the facts written on it are what was buried.
4. *Text.* THE layout SHALL emit text operations, top to bottom, with these roles, texts and starting sizes:

   | Role | Text | Font | Start size | Shrink floor | Text box width |
   | --- | --- | --- | --- | --- | --- |
   | `brand` | `SHARE_SITE_NAME` | IM Fell English 400 | 72 px | 40 px | 888 |
   | `total` | each of `totalLines` | Inter 600, `moss` | 72 px | none | 640 |
   | `more-currencies` | `+<moreCurrencies> more` (only when > 0) | Inter 500 | 36 px | 24 px | 640 |
   | `count` | `countLine` | Inter 500 | 40 px | none | 640 |
   | `address` | `SHARE_SITE_ADDRESS` | Inter 500 | 36 px | 24 px | 888 |

   Every text operation is centred on `x = 540`; `bone` is the fill unless the table says otherwise. Font families SHALL name the self-hosted face first and the same fallbacks as `--font-display` and `--font-sans` in `apps/web/src/index.css`.
5. *Fit, never clip.* THE layout SHALL size and shorten each text operation as follows:
   - start at the start size; WHILE the text is wider than `maxWidth` and the size is above the floor, lower the size by 1 px;
   - a `total` or `count` line has no floor and SHALL NOT be shortened: its size goes down until it fits, but not below 1 px, so a money figure or a count is always drawn whole;
   - any other line still too wide at its floor SHALL be shortened to the longest prefix of whole code points (never splitting a surrogate pair), with trailing whitespace removed, followed by `…` (U+2026), that fits; WHEN no such prefix fits, the text SHALL be `…`.
   For every Measure function where each `total` and `count` text fits at 1 px and `…` fits at each other role's floor, every text operation SHALL satisfy `measure(text, font) ≤ maxWidth`. For any other Measure function the last fallback (the whole line at 1 px, or `…` at the floor) SHALL be drawn anyway, so the layout stays total.
6. *No overlap.* For two text operations `a` and `b`, the line boxes `[y − sizePx, y + 0.3 × sizePx]` SHALL NOT intersect, and every line box and its horizontal extent `[x − maxWidth / 2, x + maxWidth / 2]` SHALL lie inside the image with at least 48 px to spare on every side. The `total`, `more-currencies` and `count` lines SHALL lie inside the tombstone shape's bounding box. Line positions SHALL be chosen so the largest content (`MAX_TOTAL_LINES` total lines, a `more-currencies` line and a count line, all at start size) fits; because sizes only go down from there, every smaller content fits too.
7. THE layout SHALL be pure and total: for any Share content and any Measure function that returns a finite non-negative number, it SHALL NOT throw; it SHALL call `measure` only with a source text, or a candidate prefix of it followed by `…` (or `…` alone), and a font of that role's family and weight at a size from the role's start size down to its floor (or 1 px for `total` and `count`); and deeply equal content with the same Measure function SHALL give deeply equal operations.
8. THE module SHALL export `shareCardAlt(content: ShareCardContent): string`, the Preview's alt text. It SHALL state the facts of the image in reading order, joined with single spaces: `Image of your Zombills graveyard.`, each of `totalLines`, `And <moreCurrencies> more currencies.` when it is above 1 or `And 1 more currency.` when it is 1, `countLine`, and `zombills.netlify.app.` The alt text SHALL NOT describe the art.
9. Examples the implementation SHALL satisfy, with the fake Measure function `width = sizePx × 0.5 × code points` (reading `sizePx` from the font string):
   - The first example of Requirement 1.8 gives `brand`, one `total` (`I buried $215.88 a year.`, 72 px), `count`, `address`, and no `more-currencies` operation.
   - The total line `I buried $90,071,992,547,409.91 a year.` (39 code points, `formatMoney(9007199254740991, "USD", "en-US")`) is drawn whole at `floor(640 / (0.5 × 39)) = 32` px.
   - The count line `1000 subscriptions buried, 999 with saving unknown.` (51 code points) is drawn whole at `floor(640 / (0.5 × 51)) = 25` px, below the 40 px start size, and is not shortened.
   - The alt text of the second example of Requirement 1.8 is `Image of your Zombills graveyard. I buried $563.88 a year. 3 subscriptions buried, 1 with saving unknown. zombills.netlify.app.`

---

### Requirement 3: Renderer and fonts

**User Story:** As a user, I want the image to use the same lettering as the page, drawn on my own device, so that it looks like Zombills and is made without sending anything anywhere.

#### Acceptance Criteria

1. THE module `apps/web/src/slice/graveyard/share-card-renderer.ts` SHALL export `renderShareCard(content: ShareCardContent, deps?: RenderDeps): Promise<RenderedShareCard>` where `RenderedShareCard = { dataUrl: string; file: File }` and `RenderDeps` lets tests pass a canvas factory, a font loader and `resolveToken(token: ColourToken) => string` instead of `document.createElement("canvas")`, `document.fonts` and the browser default `getComputedStyle(document.documentElement).getPropertyValue("--" + token).trim()`.
2. Before measuring any text, THE Renderer SHALL wait for `document.fonts.ready` and then call `document.fonts.load(font, text)` for each face the Text operations use (IM Fell English 400, Inter 500 and Inter 600), with `font` at that face's start size and `text` the source texts drawn in that face joined together, so every `unicode-range` subset those texts need is loaded from the bundled files, not only the subset holding U+0020. These are same-origin requests for files in `dist`, already allowed by `font-src 'self'`. IF `document.fonts` is missing or a load rejects, THEN THE Renderer SHALL draw with the fallback families of Requirement 2.4 and SHALL NOT fail.
3. THE Renderer SHALL create a canvas of exactly `SHARE_IMAGE_SIZE` × `SHARE_IMAGE_SIZE` pixels, independent of `devicePixelRatio`, get its `"2d"` context, build the Measure function from `context.measureText(text).width` after setting `context.font = font`, call `shareCardLayout(content, measure)`, and execute every operation in order. For each Text operation it SHALL set `font`, `textAlign`, `textBaseline = "alphabetic"` and `fillStyle`, and call `fillText(text, x, y)` with no `maxWidth` argument, so the browser never squeezes text the layout already fitted.
4. THE Renderer SHALL resolve every Paint with `resolveToken(paint.token)` and apply `paint.alpha` through `ctx.globalAlpha` (reset to 1 after each operation). Every stop of a `vertical-gradient` SHALL have `alpha: 1`, so each stop's colour is the resolved token as is and no colour string is parsed. It SHALL contain no hex colour literal. A test SHALL parse `apps/web/src/index.css`, set those four custom properties on the jsdom document, and check that the default `resolveToken` returns the `index.css` value for each token.
5. THE Renderer SHALL encode the canvas once, with `canvas.toBlob(callback, "image/png")`, make `file` as the Image file (Glossary) from that Blob, and make `dataUrl` from the same Blob with `FileReader.readAsDataURL`, so the Preview shows exactly the bytes that are shared or saved. It SHALL NOT call `toDataURL`.
6. IF `getContext("2d")` returns `null`, `toBlob` yields `null`, the `FileReader` reports an error, or any canvas call throws, THEN `renderShareCard` SHALL reject with an `Error` whose message says only which step failed (for example `"share-card: no 2d context"`), containing no content text. It SHALL NOT log.
7. THE Renderer SHALL keep no reference to the canvas, the context or the content after it settles. It SHALL NOT add the canvas to the document.

---

### Requirement 4: Share panel and preview

**User Story:** As a user on the Graveyard view, I want to see the image before it goes anywhere, so that I share only what I meant to.

#### Acceptance Criteria

1. THE Graveyard view SHALL render the Share panel after the tombstone list and before the `Resting` section, only WHEN at least one Tombstone exists (Requirement 1.7). It SHALL be a `section` labelled by its `h3` heading `Share your graveyard`, matching the view's other `h3` sections.
2. THE Share panel SHALL show, in this order:
   - the line `Make an image of your graveyard to share or save. It is made on this device and is not uploaded.`;
   - a button `Make an image` (Criterion 4 gives its other texts);
   - once an Image is ready, the Preview and the main button of Requirement 5.
3. THE Share panel SHALL compute the Share content with `shareCardContent(haunt.tombstones, haunt.savings)` and pass nothing else to the Renderer. The panel SHALL NOT receive the Subscription list, the statement or the Page model.
4. WHEN the user activates `Make an image`, THE Share panel SHALL call `renderShareCard` for the current Share content. The button SHALL stay mounted in place and focusable at all times. WHILE any render runs (the first one, one started by this button, or a re-render of Criterion 6) it SHALL read `Making the image…` and have `aria-disabled="true"`, and activating it SHALL do nothing. After the first Image is ready it SHALL read `Make the image again`; activating it then renders the current Share content again. WHEN a render started by this button is used (Criterion 6), THE panel SHALL show the Preview and the main button, and announce `Image ready. <alt text>` in the Live region.
5. THE Preview SHALL be an `<img>` with `src` = the `dataUrl`, `alt` = `shareCardAlt(content)` for the same content, `width` and `height` attributes of 1080, and CSS that scales it to `width: 100%` with `max-width: 27rem` and `height: auto`, so it keeps its square shape at every width.
6. *Latest content only.* For every render, including the first: WHEN a render settles and the Share content it was started with is not deeply equal to the current `shareCardContent(haunt.tombstones, haunt.savings)`, THE Share panel SHALL discard the result and render again for the current content. The content can change through any Graveyard action, for example Unbury or `Bury after all` (graveyard-ui Requirement 8.3); the panel SHALL compare by deep equality and not by listing actions. WHILE a Preview is shown and the content has changed, the old Preview SHALL stay visible with `aria-busy="true"` on its container until the new Image is ready. The main button SHALL have `aria-disabled="true"` and do nothing WHENEVER the shown Image was not made from Share content deeply equal to the current Share content, so the user can never share an Image that differs from what the Graveyard view now shows. A re-render caused by a content change SHALL announce only `Image updated.`.
7. IF `renderShareCard` rejects, THEN THE Share panel SHALL show and announce `Could not make the image in this browser.`, keep the Criterion 4 button usable for another try (reading `Make an image`, or `Make the image again` if an Image was made before), show no Preview and no main button, and SHALL NOT throw or log.
8. All visible text in the panel SHALL be plain words (`spooky-design.md` tone rules: short sentences, no exclamation marks). The heading `Share your graveyard` is the only themed wording. The panel SHALL use the design tokens, the existing button class of the Graveyard view, and Framer Motion for the Preview's appearance (a short fade and rise, or an opacity fade of at most 150 ms under reduced motion).
9. Leaving the Graveyard view, `Start again`, or the Share panel unmounting for any reason SHALL drop the Preview, the `dataUrl` and the Image file from React state.

---

### Requirement 5: Share or save

**User Story:** As a user with the preview in front of me, I want one button that shares the image through my device's share sheet, or saves it when my browser cannot share files, so that it works on my phone and on my laptop.

#### Acceptance Criteria

1. WHEN an Image is ready, THE Share panel SHALL decide the path once for that Image file: the Share path (Glossary) when `typeof navigator.share === "function"`, `typeof navigator.canShare === "function"` and `navigator.canShare({ files: [file] })` returns `true` without throwing; otherwise the Save path. The main button's visible text SHALL be `Share image` on the Share path and `Save image` on the Save path.
2. WHEN the user activates `Share image`, THE Share panel SHALL call `navigator.share({ files: [file], title: "My Zombills graveyard" })` synchronously in the click handler, with no `await` before it, so the call keeps the click's user activation (browsers that require it, such as Safari, reject a share made after other async work). The data SHALL hold only the Image file and that title: no `text`, no `url` and no other field.
3. WHEN `navigator.share` resolves, THE Page SHALL announce `Image shared.`.
4. WHEN `navigator.share` rejects with an error whose `name` is `"AbortError"` (the user closed the share sheet), THE Share panel SHALL do nothing: no message, no announcement, no download, and focus stays on the button.
5. WHEN `navigator.share` rejects with any other error, or throws synchronously, THE Share panel SHALL save the Image as in Criterion 6 and show and announce `Could not share the image. Download started instead.`, which does not claim the file was saved (the fallback runs after the share sheet, without user activation, and a browser may block it). It SHALL NOT throw or log.
6. WHEN the user activates `Save image`, or Criterion 5 applies, THE Share panel SHALL call an injectable dependency `downloadFile(file: File, name: string): void` with the Image file and `SHARE_FILE_NAME`. The Share panel SHALL take `downloadFile` as an optional prop whose default is the browser implementation exported from `apps/web/src/slice/graveyard/download-file.ts`, so component tests pass a fake and never reach jsdom's unimplemented navigation. The browser implementation SHALL create an object URL for the file with `URL.createObjectURL`, set it as the `href` of a temporary `<a>` element with `download` = `name`, call `click()` on it, remove the anchor from the document if it was added, and revoke the URL with `URL.revokeObjectURL` in a later task (`setTimeout(…, 1000)`, since some browsers start reading the blob after the click returns). On the Save path THE Page SHALL announce `Download started: zombills-graveyard.png.`, which states what the app did without claiming the file was saved.
7. THE browser `downloadFile` SHALL hold at most one live object URL at a time: a new call SHALL revoke the previous URL first. Its unit test SHALL spy on `HTMLAnchorElement.prototype.click` with an implementation that does nothing, so jsdom reports no navigation and the console stays silent.
8. Activating the main button again SHALL work the same way each time; each announcement SHALL be written through `useAnnounce()`, so a repeated message is read again (cancel-helper Requirement 8.3).
9. Examples:

   | Browser state | Button | Activation result |
   | --- | --- | --- |
   | `navigator.share` and `canShare` present, `canShare({ files })` → `true`, share resolves | `Share image` | `Image shared.` |
   | same, share rejects `DOMException("…", "AbortError")` | `Share image` | nothing |
   | same, share rejects `DOMException("…", "NotAllowedError")` | `Share image` | download, `Could not share the image. Download started instead.` |
   | `navigator.share` present, `canShare` missing | `Save image` | download, `Download started: zombills-graveyard.png.` |
   | `canShare({ files })` → `false`, or `canShare` throws | `Save image` | download |
   | neither present (Playwright, which deletes both with `addInitScript`, Requirement 9.6) | `Save image` | download |

---

### Requirement 6: Privacy

**User Story:** As a privacy-minded user, I want making the image to send nothing anywhere and leave nothing behind, so that only the people I choose ever see it.

#### Acceptance Criteria

1. THE share card code SHALL make no network request: no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, `<link rel="prefetch|preconnect|dns-prefetch">`, remote `<img>` or remote font. The only requests it may cause are the same-origin font files of Requirement 3.2. The existing ESLint rules for `apps/web/src/**` and for `apps/web/src/slice/logic/**` SHALL cover the new files unchanged, so `share-card.ts` is checked as pure logic (no `document`, `window`, `navigator`, storage, clock or randomness).
2. THE share card code SHALL NOT write the Share content, the alt text, the `dataUrl` or the Image file to `localStorage`, `sessionStorage`, IndexedDB, the Cache API, cookies, the Page URL or the history state, and SHALL NOT log any of them (`no-console` stays an error). Vertical-slice Requirement 7 and graveyard-ui Requirement 15 keep holding unchanged.
3. THE build-time CSP in `apps/web/csp-plugin.ts` (`CSP_POLICY`) SHALL stay exactly as it is, and `apps/web/csp-plugin.test.ts` and the CSP check in `apps/web/e2e/demo-path.spec.ts` SHALL keep passing unchanged. This works because:
   - the Preview loads a `data:` URL into an `<img>`, which `img-src 'self' data:` allows;
   - the download uses a `blob:` URL only as the `href` of an `<a download>` element. Following that link is a navigation that the browser turns into a download, and navigations are not governed by `img-src`, `connect-src` or `default-src`, so no `blob:` source needs to be allowed. A `blob:` URL is used there because the Image file already exists as a `Blob` for sharing; it is revoked after use (Requirement 5.6);
   - drawing on a canvas, `toBlob`, `FileReader.readAsDataURL` and `navigator.share` make no request.
   IF a task finds that a target browser blocks the download or the Preview under the current CSP, THEN that task SHALL stop and record the finding instead of changing `CSP_POLICY`.
4. THE Image SHALL leave the browser only through the operating system's share sheet after the user picks a target, or as a file the browser downloads. THE app SHALL NOT pass the Image or any text to a third-party script or SDK, and SHALL add no dependency for sharing, drawing or image encoding.
5. THE `privacy-guard` hook (`.kiro/hooks/privacy-guard.json`), the `no-network` scans in `packages/core` and the Playwright request check SHALL keep passing with no new exception. IF Playwright reports the Preview's `data:image/png;base64,` URL or the download's `blob:` URL as a request (neither reaches the network), THEN the demo path's request check MAY skip exactly the requests whose URL starts with `data:image/png;base64,` or with `blob:` + the Page origin + `/`; it SHALL keep failing on every other request that is not a same-origin GET of a file in `dist`.

---

### Requirement 7: Keyboard, screen readers and small screens

**User Story:** As a keyboard, screen-reader or phone user, I want to make, check and share the image the same way as everyone else, so that the feature is not only for mouse users on wide screens.

#### Acceptance Criteria

1. THE Requirement 4.4 button and the main button SHALL be reachable with Tab in that order, operable with Enter or Space, and SHALL show the `--moss` focus ring of `spooky-design.md`. No element in the Share panel SHALL have a positive `tabindex`. Focus SHALL NOT move by itself when a render starts or settles, or when the Image is shared or saved; because the Requirement 4.4 button stays mounted, focus is never dropped to `<body>`.
2. A "disabled" control in the Share panel SHALL use `aria-disabled="true"` with a handler that does nothing, not the HTML `disabled` attribute, so focus is kept (graveyard-ui Requirement 14.2).
3. Every accessible name in the Share panel SHALL equal its visible text (`Make an image`, `Making the image…`, `Make the image again`, `Share image`, `Save image`), and every accessible name on the Page SHALL stay unique (graveyard-ui `expectUniqueButtonNames`, as extended by cancel-helper Requirement 8.5).
4. THE Preview's alt text (Requirement 2.8) SHALL state every fact the Image states. Money stays in text on the Graveyard view itself (`spooky-design.md`: "Money figures are always rendered in text, never as images"); the Image is an export of those figures, not a replacement for them.
5. Messages of Requirements 4.4, 4.6, 4.7, 5.3, 5.5 and 5.6 SHALL be written to the Live region. The failure messages of Requirements 4.7 and 5.5 SHALL also be shown as text in the panel until the next action in it.
6. At 320 × 568, 390 × 844 and 1000 × 900 CSS px, and at 390 px with 200 % text zoom, THE Share panel with a Preview SHALL fit the viewport with no horizontal scrolling (`document.documentElement.scrollWidth` not greater than the viewport width), the Preview SHALL be fully inside the panel, and every button SHALL have a target of at least 44 × 44 CSS px.
7. With `prefers-reduced-motion: reduce`, the Preview SHALL appear and update with only an opacity fade of at most 150 ms, with no position, scale or rotation change (`spooky-design.md`, through the Page's existing `reduceMotion` prop).
8. Colour SHALL never be the only signal: busy and failed states SHALL be stated in words.

---

### Requirement 8: Removed (cancel-helper amendment)

This requirement exported the cancel module's `cleanField` as `cleanServiceName` so that service names on the image were cleaned like the name in the cancellation email. Service names on the image are deferred (Introduction; review 1 #8), so nothing in this spec needs it: `@zombills/core` and the cancel-helper spec stay unchanged. The number is kept so the other requirement numbers stay stable.

---

### Requirement 9: Tests and amendments to existing tests

**User Story:** As the team, I want the share card covered by unit, component and browser tests, so that the demo proves the image works and leaks nothing.

#### Acceptance Criteria

1. Unit tests next to `apps/web/src/slice/logic/share-card.ts` SHALL cover every example of Requirements 1.8 and 2.9, each row of the count line table of Requirement 1.4, the `+N more` line for currencies, the order of operations of Requirement 2.2, that only the shape kinds and path commands of Requirement 2.1 are used, and that no operation uses a colour other than the four Colour tokens. They SHALL also check, on fixed Graveyards (none, one Tombstone, all guessed, mixed, 40 Tombstones): that the number in `countLine` equals the Buried count and the line mentions `saving unknown` exactly when a Guessed tombstone exists; and that `shareCardContent`, `shareCardLayout` and `shareCardAlt` do not throw on deep-frozen arguments, do not mutate them, and return deeply equal results for deeply equal arguments.
2. Unit tests next to the Renderer SHALL use a fake canvas factory, font loader and `resolveToken` (`RenderDeps`) and SHALL check: the canvas is 1080 × 1080; `document.fonts.ready` is awaited and `load(font, text)` is called for each face of Requirement 3.2 with the source texts of that face before the first `measureText`; every `fillText` call has exactly three arguments and receives the texts of the layout's Text operations in order; each Paint's `alpha` is set through `globalAlpha`; `toBlob` is called once with `"image/png"` and `toDataURL` is never called; `dataUrl` is the `FileReader.readAsDataURL` result of the same Blob; the file is named `zombills-graveyard.png` with type `image/png`; a `null` context and a `null` blob reject as in Requirement 3.6; a rejecting font load still draws; nothing is logged; and the default `resolveToken` returns the `apps/web/src/index.css` values (Requirement 3.4).
3. *Panel states.* Component tests (Vitest, jsdom, Testing Library, `userEvent`) SHALL render the Page with the `us-signed.csv` Sample, bury Netflix, open the Graveyard view, mock `renderShareCard`, and cover: the panel and its texts of Requirement 4.2; no panel with no Tombstone; `Make an image` stays mounted and focused, shows `Making the image…` with `aria-disabled="true"`, then the Preview with the alt text of Requirement 2.8, `Image ready. …` in the Live region, and the text `Make the image again`; a content change during the first render (unburying one of two Tombstones while `Making the image…` shows) discards the stale result, renders again for the new content and never enables the main button for the stale Image; a content change while a Preview is shown keeps the old Preview with `aria-busy="true"`, keeps the main button `aria-disabled` until the new Image matches the current Share content, and announces `Image updated.`; `Bury after all` also triggers a re-render; a rejecting render gives the message of Requirement 4.7 with no console output; and every accessible name in the panel equals its visible text and is unique on the Page.
4. *Share and save.* Component tests with the same setup SHALL pass a fake `downloadFile` and cover each row of the table of Requirement 5.9 with mocked `navigator.share` and `navigator.canShare`, including that `share` is called in the same task as the click with only `files` and `title`, and that `downloadFile` is called with the Image file and `zombills-graveyard.png`. A unit test of the browser `downloadFile` (Requirement 5.6, 5.7) SHALL mock `URL.createObjectURL` and `URL.revokeObjectURL`, spy on `HTMLAnchorElement.prototype.click` with an implementation that does nothing, and check the `download` name, that no anchor stays in the document, that the URL is revoked after the timer, that at most one URL is live, and that the console stays silent.
5. A component test SHALL check that the Share panel receives no prop that holds a Subscription, the statement or the Page model, and that `renderShareCard` is called with exactly `shareCardContent(haunt.tombstones, haunt.savings)`.
6. THE Playwright test `apps/web/e2e/demo-path.spec.ts` SHALL keep all its existing steps and checks. Before `goto` it SHALL call `page.addInitScript(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; })`, so the Save path is taken on every platform, including Chromium on macOS. In Step 7, after `You buried $215.88 a year.` is visible and before the storage check, it SHALL: check the `Share your graveyard` section is shown; click `Make an image`; check the Preview's alt is `Image of your Zombills graveyard. I buried $215.88 a year. 1 subscription buried. zombills.netlify.app.`; check the button reads `Save image`; click it and wait for the `download` event; and check `suggestedFilename()` is `zombills-graveyard.png` and that the saved file starts with the PNG signature and has an `IHDR` width and height of 1080. The test SHALL NOT use `document.fonts.check` (font loading is covered by Requirement 9.2). The existing storage, cookie and URL check SHALL then still find nothing stored and the URL unchanged, and Step 10's request check SHALL keep failing on any request that is not a same-origin GET of a file in `dist` (with only the exception of Requirement 6.5).
7. `apps/web/e2e/layout.spec.ts` SHALL check, with the Netflix Tombstone buried and a Preview shown, that at 320 × 568, 390 × 844 and 1000 × 900 `document.documentElement.scrollWidth` is not greater than the viewport width and the Preview's bounding box lies inside the viewport's width.
8. THE `privacy-guard` hook, the `no-network` scans, ESLint, `npm run typecheck`, the CSP tests and the build SHALL keep passing with no new exception (Requirement 6.3, 6.5).

---

### Requirement 10: Correctness properties

**User Story:** As the team, I want the share card's guarantees checked on generated graveyards and generated text widths, so that no merchant name, currency mix or font metric can make the image leak a detail, misstate a total or cut off text.

#### Acceptance Criteria

1. Property tests SHALL live in `apps/web/src/slice/logic/share-card.property.test.ts`, use fast-check with its default 100 runs, and build inputs with `deepFreeze` from `apps/web/src/slice/logic/test-arbitraries.ts`. A Tombstone SHALL be built from `answerRecordArb` filtered to `answer: "not-using"`, with `merchant` overridden by `fc.oneof(fc.string({ unit: "binary" }), fc.string({ maxLength: 500 }), fc.constantFrom("Zombills", "zombills.netlify.app", "I buried $1.00 a year."))`. Graveyards SHALL hold 0 to 40 such Tombstones over at least the four `CURRENCIES`, with Guessed tombstones and `serviceId` both Known and `null`, and `savings` = `savingsTotals` of those Tombstones. Measure functions SHALL be generated as `width = Σ w(c) × sizePx` over the code points `c` of the text, with a per-code-point factor `w(c)` drawn from `[0, 2]` and fixed for the run. The count and determinism checks are unit tests (Requirement 9.1), not properties.
2. *(PBT: totals as on the Graveyard view)* FOR ALL Graveyards and locales `en-US`, `en-GB` and `de-DE`, `totalLines` SHALL equal the first `MAX_TOTAL_LINES` elements of `savings.map(t => "I buried " + formatMoney(t.totalCents, t.currency, locale) + " a year.")`, and `totalLines.length + moreCurrencies` SHALL equal `savings.length`.
3. *(PBT: nothing but the content)* FOR ALL Graveyards and all generated Measure functions, the list of Text operations SHALL equal, role by role and in order, the list built by the test from the content alone (brand, each total line, the `+N more` line, the count line, the address), where each text equals its source text or, for roles other than `total` and `count`, is a shortened form `p + "…"` with `p` a code-point prefix of the source text, or `…`. Replacing every Tombstone's `merchant` and `serviceId` SHALL leave the Share content deeply equal. So the Image holds no text beyond the Share content and the fixed strings, and no service name, amount per service, cadence or date can appear.
4. *(PBT: fits and never clips)* FOR ALL Share contents and generated Measure functions, every Text operation SHALL satisfy `measure(text, font) ≤ maxWidth`, every `total` and `count` operation SHALL hold its source line unshortened, no two line boxes SHALL intersect, every line box SHALL lie inside the image with 48 px to spare (Requirement 2.6), and every `sizePx` SHALL be a positive integer no larger than the role's start size. (The generated Measure functions meet the condition of Requirement 2.5.)
5. *(PBT: alt states the facts)* FOR ALL Share contents, `shareCardAlt` SHALL contain each of `totalLines` and `countLine` and SHALL end with `zombills.netlify.app.`. The test SHALL build the expected alt text from the content by position, as in Requirement 2.8, and compare it whole.
