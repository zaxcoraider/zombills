import { expect, test, type Locator, type Page } from "@playwright/test";

// pro-polish browser tests (design "Browser tests"). Boxes and computed styles are real, so this
// runs in Chromium. Box checks wait for `document.fonts.ready` and emulate reduced motion, except
// the tests that measure motion (Req 13.6).

const PRIMARY_NAME = "Summon the undead with a sample US bank statement";
const UK_SAMPLE = "UK bank statement";
const STONE_NAMES = [
  "Zombills on GitHub",
  "The Reaper",
  "Privacy note",
  "Built with Kiro",
] as const;
const IDENTITY = new Set(["none", "matrix(1, 0, 0, 1, 0, 0)"]);
const FACE_PEEK = "matrix(1, 0, 0, 1, 0, -4)";
const GHOST_PEEK = "matrix(1, 0, 0, 1, 0, -48)";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function openLanding(page: Page, reducedMotion: "reduce" | "no-preference"): Promise<void> {
  await page.emulateMedia({ reducedMotion });
  await page.goto("/");
  await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

function siteLinks(page: Page): Locator {
  return page.getByRole("contentinfo").getByRole("list", { name: "Site links" });
}

/** The four stone controls (`a` or `button`) in DOM order. */
function stones(page: Page): Locator {
  return siteLinks(page).locator(':scope > li > [data-exempt="footer-tombstone"]');
}

function stone(page: Page, name: (typeof STONE_NAMES)[number]): Locator {
  return stones(page).filter({ hasText: name });
}

async function transformOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).transform);
}

/** Asserts the computed transform is `none` or the identity matrix, naming the value on failure. */
async function expectIdentity(locator: Locator, label: string): Promise<void> {
  const transform = await transformOf(locator);
  expect(IDENTITY.has(transform), `${label}: ${transform}`).toBe(true);
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("no bounding box");
  return box;
}

/** Puts keyboard focus on a stone with Tab, so `:focus-visible` matches as for a keyboard user. */
async function tabTo(page: Page, index: number): Promise<void> {
  const all = stones(page);
  if (index === 0) {
    await all.nth(0).focus();
    await page.keyboard.press("Shift+Tab");
  } else {
    await all.nth(index - 1).focus();
  }
  await page.keyboard.press("Tab");
  await expect(all.nth(index)).toBeFocused();
}

/** Answers the current card with Enter on its focused button (the card sways, see demo-path). */
async function answer(page: Page, name: string): Promise<void> {
  const button = page.getByRole("button", { name });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
}

test.describe("footer graveyard", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height, rows } of [
    { width: 390, height: 844, rows: 2 },
    { width: 320, height: 568, rows: 2 },
    { width: 1280, height: 800, rows: 1 },
  ]) {
    test(`footer grid ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "reduce");
      const where = `${width}x${height}`;
      await siteLinks(page).scrollIntoViewIfNeeded();
      const all = stones(page);
      await expect(all).toHaveCount(4);
      const boxes: (Box & { name: string })[] = [];
      for (let i = 0; i < 4; i += 1) {
        const box = await boxOf(all.nth(i));
        boxes.push({ ...box, name: (await all.nth(i).innerText()).trim() });
      }
      expect(
        boxes.map((box) => box.name),
        `${where}: DOM order`,
      ).toEqual([...STONE_NAMES]);
      // Read row by row: stones of one row share their bottom edge (the ground line), not their top.
      const sorted = [...boxes].sort(
        (a, b) => Math.round(a.y + a.height) - Math.round(b.y + b.height) || a.x - b.x,
      );
      expect(
        sorted.map((box) => box.name),
        `${where}: visual order`,
      ).toEqual([...STONE_NAMES]);
      const perRow = 4 / rows;
      // Stones differ in height (amended 2026-11-18) and stand on one ground line per row, so a
      // row shares its bottom edge, and every label sits at the same engraved height.
      const labelCentres: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const label = await boxOf(all.nth(i).locator("[data-stone-label]"));
        labelCentres.push(label.y + label.height / 2);
      }
      sorted.forEach((box, i) => {
        const rowStart = sorted[Math.floor(i / perRow) * perRow] ?? box;
        expect(
          Math.abs(box.y + box.height - (rowStart.y + rowStart.height)),
          `${where}: ${box.name} row`,
        ).toBeLessThanOrEqual(0.5);
        const centre = labelCentres[boxes.indexOf(box)] ?? 0;
        const rowCentre = labelCentres[boxes.indexOf(rowStart)] ?? 0;
        expect(
          Math.abs(centre - rowCentre),
          `${where}: ${box.name} label height`,
        ).toBeLessThanOrEqual(0.5);
      });
      const heights = new Set(boxes.map((box) => Math.round(box.height)));
      expect(heights.size, `${where}: stone heights vary`).toBeGreaterThan(1);
      const [first, , third] = sorted;
      if (rows === 2 && first !== undefined && third !== undefined) {
        expect(third.y, `${where}: second row below the first`).toBeGreaterThanOrEqual(
          first.y + first.height,
        );
      }
      for (const box of boxes) {
        expect(box.width, `${where}: ${box.name} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${where}: ${box.name} height`).toBeGreaterThanOrEqual(44);
        if (width === 390) {
          expect(box.width, `${where}: ${box.name} width at 390`).toBeGreaterThanOrEqual(96);
        }
      }
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(metrics.scrollWidth, `${where}: sideways scroll`).toBeLessThanOrEqual(
        metrics.innerWidth,
      );
    });
  }

  test("peek on hover and keyboard focus, no reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLanding(page, "no-preference");
    const reaper = stone(page, "The Reaper");
    await reaper.scrollIntoViewIfNeeded();
    const face = reaper.locator("[data-stone-face]");
    const ghost = reaper.locator("[data-peek-ghost]");

    await reaper.hover();
    await page.waitForTimeout(400);
    expect(await transformOf(face), "hover: face").toBe(FACE_PEEK);
    expect(await transformOf(ghost), "hover: ghost").toBe(GHOST_PEEK);

    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    await expectIdentity(face, "away: face");
    await expectIdentity(ghost, "away: ghost");

    await tabTo(page, 1);
    await page.waitForTimeout(400);
    expect(await transformOf(face), "focus: face").toBe(FACE_PEEK);
    expect(await transformOf(ghost), "focus: ghost").toBe(GHOST_PEEK);
  });

  test("each stone is an arched SVG headstone with an engraved serif label", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLanding(page, "reduce");
    const all = stones(page);
    for (const [i, name] of STONE_NAMES.entries()) {
      const control = all.nth(i);
      const silhouette = control.locator("[data-stone-face] svg path").first();
      expect(await silhouette.getAttribute("d"), `${name}: arched path`).toMatch(/C/);
      const label = control.locator("[data-stone-label]");
      await expect(label, `${name}: label`).toHaveText(name);
      const style = await label.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { font: cs.fontFamily, shadow: cs.textShadow };
      });
      expect(style.font, `${name}: serif display font`).toContain("IM Fell English");
      expect(style.shadow, `${name}: engraved`).not.toBe("none");
      const face = await boxOf(control.locator("[data-stone-face]"));
      const text = await boxOf(label);
      expect(text.y, `${name}: label inside the stone`).toBeGreaterThanOrEqual(face.y);
      expect(text.y + text.height, `${name}: label inside the stone`).toBeLessThanOrEqual(
        face.y + face.height,
      );
    }
  });

  for (const how of ["hover", "focus"] as const) {
    test(`the risen ghost is whole and above the stone top on ${how}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await openLanding(page, "no-preference");
      const all = stones(page);
      for (let i = 0; i < 4; i += 1) {
        const name = STONE_NAMES[i];
        const control = all.nth(i);
        await control.scrollIntoViewIfNeeded();
        if (how === "hover") await control.hover();
        else await tabTo(page, i);
        await page.waitForTimeout(400);
        const ghost = control.locator("[data-peek-ghost]");
        const g = await boxOf(ghost);
        const face = await boxOf(control.locator("[data-stone-face]"));
        expect(g.height, `${name}: ghost size`).toBeGreaterThanOrEqual(30);
        expect(g.y + g.height, `${name}: ghost above the stone top`).toBeLessThanOrEqual(
          face.y + 0.5,
        );
        // Nothing paints over the ghost: its centre and four inner points hit the ghost itself.
        const hidden = await ghost.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const points: [number, number][] = [
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + r.width / 2, r.top + 3],
            [r.left + 3, r.bottom - 6],
            [r.right - 3, r.bottom - 6],
            [r.left + r.width / 2, r.bottom - 2],
          ];
          return points
            .filter(([x, y]) => {
              const hit = document.elementsFromPoint(x, y)[0];
              return !(hit !== undefined && el.contains(hit));
            })
            .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`);
        });
        expect(hidden, `${name}: points of the ghost covered by something else`).toEqual([]);
        // Not clipped by any ancestor's overflow.
        const clipped = await ghost.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const found: string[] = [];
          for (let p = el.parentElement; p !== null; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
            const b = p.getBoundingClientRect();
            if (r.top < b.top || r.bottom > b.bottom || r.left < b.left || r.right > b.right)
              found.push(p.tagName);
          }
          return found;
        });
        expect(clipped, `${name}: clipping ancestors`).toEqual([]);
        await page.mouse.move(5, 5);
      }
    });
  }

  test("a touch tap does not peek", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 390, height: 844 },
      reducedMotion: "no-preference",
    });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // A link stone, with navigation blocked, so focus stays on the tapped stone: a stuck
      // `whileFocus` would show here (the Privacy note stone moves focus away).
      const repo = stone(page, "Zombills on GitHub");
      await repo.evaluate((el) =>
        el.addEventListener("click", (event) => event.preventDefault(), { capture: true }),
      );
      await repo.scrollIntoViewIfNeeded();
      const box = await boxOf(repo);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 40);
      await page.waitForTimeout(400);
      await expect(repo, "tap: the stone keeps focus").toBeFocused();
      const face = repo.locator("[data-stone-face]");
      const ghost = repo.locator("[data-peek-ghost]");
      await expectIdentity(face, "tap: face");
      await expectIdentity(ghost, "tap: ghost");
    } finally {
      await context.close();
    }
  });

  test("peek under reduced motion: no movement, outline shows", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLanding(page, "reduce");
    await expect(siteLinks(page).locator("[data-peek-ghost]")).toHaveCount(0);
    const reaper = stone(page, "The Reaper");
    await reaper.scrollIntoViewIfNeeded();
    const face = reaper.locator("[data-stone-face]");
    const outline = reaper.locator("[data-stone-outline]");

    await reaper.hover();
    await page.waitForTimeout(200);
    await expectIdentity(face, "hover: face");
    expect(await outline.evaluate((el) => getComputedStyle(el).opacity), "hover: outline").toBe(
      "1",
    );

    await page.mouse.move(5, 5);
    await tabTo(page, 1);
    await page.waitForTimeout(200);
    await expectIdentity(face, "focus: face");
    expect(await outline.evaluate((el) => getComputedStyle(el).opacity), "focus: outline").toBe(
      "1",
    );
    await expect(siteLinks(page).locator("[data-peek-ghost]")).toHaveCount(0);
  });

  test("nothing covers a focused stone's ring, no reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLanding(page, "no-preference");
    await page.mouse.move(5, 5);
    const all = stones(page);
    for (let i = 0; i < 4; i += 1) {
      const control = all.nth(i);
      await control.scrollIntoViewIfNeeded();
      await tabTo(page, i);
      await page.waitForTimeout(400);
      const name = STONE_NAMES[i];
      const border = await boxOf(control);
      for (const part of ["[data-peek-ghost]", "[data-stone-face]"]) {
        const inner = await boxOf(control.locator(part));
        expect(inner.x, `${name} ${part} left`).toBeGreaterThanOrEqual(border.x - 0.5);
        expect(inner.y, `${name} ${part} top`).toBeGreaterThanOrEqual(border.y - 0.5);
        expect(inner.x + inner.width, `${name} ${part} right`).toBeLessThanOrEqual(
          border.x + border.width + 0.5,
        );
        expect(inner.y + inner.height, `${name} ${part} bottom`).toBeLessThanOrEqual(
          border.y + border.height + 0.5,
        );
      }
      const covered = await control.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const midY = rect.top + rect.height / 2;
        const points: [number, number][] = [
          [midX, rect.top - 2],
          [rect.right + 2, midY],
          [midX, rect.bottom + 2],
          [rect.left - 2, midY],
        ];
        const hits: string[] = [];
        for (const [x, y] of points) {
          const hit = document.elementFromPoint(x, y);
          const other = hit?.closest('[data-exempt="footer-tombstone"]');
          if (other && other !== el) hits.push(`${x},${y}`);
        }
        return hits;
      });
      expect(covered, `${name}: points outside the ring inside another stone`).toEqual([]);
    }
  });
});

test.describe("compact header", () => {
  /** Buries the first card of the US Sample, goes home, then buries the first card of the UK Sample. */
  async function saveTwoCurrencies(page: Page): Promise<void> {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: PRIMARY_NAME }).click();
    await expect(page.getByText("Recurring charges found")).toBeVisible();
    await answer(page, "No, bury it");
    await expect(page.getByRole("region", { name: /^Here lies / })).toBeVisible();
    await page.getByRole("button", { name: "Zombills, back to the start" }).click();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await page.getByRole("button", { name: UK_SAMPLE }).click();
    await expect(page.getByText("Recurring charges found")).toBeVisible();
    await answer(page, "No, bury it");
    await expect(page.getByRole("region", { name: /^Here lies / })).toBeVisible();
    const counter = page.getByRole("banner").getByRole("group", { name: "Saved per year" });
    await expect(counter).toContainText("$");
    await expect(counter).toContainText("£");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  test("header with two currencies is at most 88 px tall at 640x800", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await saveTwoCurrencies(page);
    const header = await boxOf(page.getByRole("banner"));
    expect(header.height, "header height").toBeLessThanOrEqual(88);
  });

  test("Home control and counter share one row at 360x740", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await saveTwoCurrencies(page);
    const home = await boxOf(page.getByRole("button", { name: "Zombills, back to the start" }));
    const counter = await boxOf(
      page.getByRole("banner").getByRole("group", { name: "Saved per year" }),
    );
    const taller = home.height >= counter.height ? home : counter;
    const homeCentre = home.y + home.height / 2;
    const counterCentre = counter.y + counter.height / 2;
    for (const [label, centre] of [
      ["Home control", homeCentre],
      ["counter", counterCentre],
    ] as const) {
      expect(centre, `${label} centre below the taller box's top`).toBeGreaterThanOrEqual(taller.y);
      expect(centre, `${label} centre above the taller box's bottom`).toBeLessThanOrEqual(
        taller.y + taller.height,
      );
    }
  });
});

test.describe("night scene", () => {
  const STORE_KEY = "zombills.graveyard.v1";
  /** Twelve Valid buried records, each a different monthly USD merchant. */
  const TWELVE_RECORDS = Array.from({ length: 12 }, (_, i) => ({
    id: `sub:USD:monthly:*:service-${i + 1}`,
    merchant: `Service ${i + 1}`,
    serviceId: null,
    currentAmountCents: 999 + i * 100,
    answer: "not-using",
    cadenceAssumed: false,
    carriedOver: false,
  }));

  type View = "results" | "graveyard";

  /** Opens `results` (US Sample) or the Graveyard view restored from twelve records. */
  async function openView(page: Page, view: View): Promise<void> {
    if (view === "graveyard") {
      await page.addInitScript(
        ([key, list]) => {
          localStorage.setItem(key, JSON.stringify({ version: 1, records: list }));
        },
        [STORE_KEY, TWELVE_RECORDS] as const,
      );
    }
    await page.goto("/");
    await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
    if (view === "graveyard") {
      await page.getByRole("button", { name: "Open the graveyard" }).click();
      await expect(
        page.getByRole("heading", { name: "Your graveyard", exact: true }),
      ).toBeVisible();
    } else {
      await page.getByRole("button", { name: PRIMARY_NAME }).click();
      await expect(page.getByText("Recurring charges found")).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  /** Counts fixed-position elements that contain the ridge band, the Hills, the Fence or a Ground. */
  async function fixedScenery(page: Page): Promise<number> {
    return page.evaluate(
      () =>
        Array.from(document.querySelectorAll<HTMLElement>("body *")).filter(
          (el) =>
            getComputedStyle(el).position === "fixed" &&
            (el.querySelector("[data-ridge-band]") !== null ||
              el.querySelector('svg[viewBox="0 0 1600 200"]') !== null ||
              el.querySelector("svg path[d^='M16 6l']") !== null ||
              Array.from(el.querySelectorAll<HTMLElement>("div")).some(
                (div) => div.style.height === "var(--ground-h)",
              )),
        ).length,
    );
  }

  for (const view of ["results", "graveyard"] as const) {
    for (const { width, height } of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      test(`scene scrolls with the page on ${view} ${width}x${height}`, async ({ page }) => {
        const where = `${view} ${width}x${height}`;
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await openView(page, view);
        const band = page.locator("[data-ridge-band]");
        await expect(band, `${where}: one ridge band`).toHaveCount(1);
        expect(await fixedScenery(page), `${where}: fixed elements with scenery`).toBe(0);

        const distance = await page.evaluate(() =>
          Math.min(400, document.documentElement.scrollHeight - window.innerHeight),
        );
        expect(distance, `${where}: scroll distance`).toBeGreaterThanOrEqual(100);
        const before = await band.evaluate((el) => el.getBoundingClientRect().top);
        await page.evaluate((d) => window.scrollTo(0, d), distance);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(distance);
        const after = await band.evaluate((el) => el.getBoundingClientRect().top);
        expect(
          Math.abs(before - after - distance),
          `${where}: band moved ${before - after} for a scroll of ${distance}`,
        ).toBeLessThanOrEqual(1);
      });
    }

    test(`fog rests on ${view}, no reduced motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.clock.install();
      await openView(page, view);
      const poses = () =>
        page
          .locator("[data-backdrop-fog]")
          .evaluateAll((bands) =>
            bands.map((band) => [
              getComputedStyle(band).transform,
              getComputedStyle(band.querySelector("[data-fog-tiles]") ?? band).transform,
            ]),
          );
      const first = await poses();
      expect(first, `${view}: three fog bands`).toHaveLength(3);
      await page.clock.runFor(10_000);
      expect(await poses(), `${view}: fog pose after 10 s`).toEqual(first);
    });
  }
});

test.describe("stage box", () => {
  /** Reads the Stage's own box and the Stage `Ground` (the earth band holding the gradient). */
  async function stageStyles(page: Page) {
    // The Stage's own box is the first child; in `buried` the Helper panel's wrapper follows it.
    return page
      .locator("[data-burial-stage] > div")
      .first()
      .evaluate((box) => {
        const style = getComputedStyle(box);
        const ground = Array.from(box.children).find(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && el.style.height.includes("var(--ground-h)"),
        );
        if (ground === undefined) throw new Error("no Stage Ground");
        const groundStyle = getComputedStyle(ground);
        return {
          backgroundColor: style.backgroundColor,
          borderWidths: [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ],
          boxShadow: style.boxShadow,
          groundShadow: groundStyle.boxShadow,
          groundBackground: groundStyle.backgroundImage,
        };
      });
  }

  /** Splits a CSS value at its top-level commas. */
  function splitTop(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if (ch === "," && depth === 0) {
        parts.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    parts.push(value.slice(start).trim());
    return parts;
  }

  /** The stops of the last `linear-gradient` layer, as `[colour, position]` pairs. */
  function lastGradientStops(background: string): string[] {
    const layers = splitTop(background).filter((layer) => layer.startsWith("linear-gradient("));
    const last = layers.at(-1);
    if (last === undefined) throw new Error(`no linear-gradient in ${background}`);
    const args = splitTop(last.slice("linear-gradient(".length, -1));
    // The computed value omits the default direction (`to bottom`); drop it only when present.
    return /^(to\s|-?[\d.]+(deg|grad|rad|turn)$)/.test(args[0] ?? "") ? args.slice(1) : args;
  }

  /** The px offset of a stop given as `<colour> <length>`, where the length is px or `0`. */
  function stopPx(stop: string): number {
    const match = /\s(-?[\d.]+)(px)?$/.exec(stop);
    if (match === null) throw new Error(`stop without a px position: ${stop}`);
    return Number(match[1]);
  }

  for (const { width, height } of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`stage has no box and its ground fades in at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await page.getByRole("button", { name: PRIMARY_NAME }).click();
      await expect(page.locator("[data-burial-stage] section h3")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      for (const stage of ["ask", "buried"] as const) {
        if (stage === "buried") {
          const name = (await page.locator("[data-burial-stage] section h3").innerText()).trim();
          await answer(page, "No, bury it");
          await expect(page.getByRole("region", { name: `Here lies ${name}.` })).toBeVisible();
        }
        const where = `${stage} ${width}x${height}`;
        const styles = await stageStyles(page);
        expect(styles.backgroundColor, `${where}: stage background`).toBe("rgba(0, 0, 0, 0)");
        expect(styles.borderWidths, `${where}: stage border`).toEqual(["0px", "0px", "0px", "0px"]);
        expect(styles.boxShadow, `${where}: stage shadow`).toBe("none");
        expect(styles.groundShadow, `${where}: ground shadow`).toBe("none");

        const [firstStop = "", nextStop = ""] = lastGradientStops(styles.groundBackground);
        expect(nextStop, `${where}: ground has two stops`).not.toBe("");
        // Computed colours serialise `transparent` as rgba(0, 0, 0, 0).
        expect(firstStop, `${where}: first ground stop`).toMatch(
          /^(transparent|rgba\(0, 0, 0, 0\))(\s|$)/,
        );
        const first = /\s-?[\d.]+(px)?$/.test(firstStop) ? stopPx(firstStop) : 0;
        expect(
          stopPx(nextStop) - first,
          `${where}: fade from transparent to the next stop`,
        ).toBeGreaterThanOrEqual(24);
      }
    });
  }
});

test.describe("stage ground", () => {
  // Visual review 2026-11-18: a dark band showed under the card at 390x844. The earth under the
  // ground line must not read as a box: no 16 x 8 block of it, across the Stage's width, is darker
  // than the sky just under the Stage by more than 6 levels of luma (0 to 255).
  test("no dark smudge under the card at 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: PRIMARY_NAME }).click();
    await expect(page.locator("[data-burial-stage] section h3")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const stageBox = page.locator("[data-burial-stage] > div").first();
    await stageBox.scrollIntoViewIfNeeded();
    const stageRect = await boxOf(stageBox);
    // The sky box above the ground line is the Stage box's first child; its bottom is the line.
    const sky = await boxOf(stageBox.locator(":scope > div").first());
    const groundLine = sky.y + sky.height;
    const top = groundLine + 8; // under the grass tufts
    const bottom = stageRect.y + stageRect.height + 12; // past the Stage's bottom edge
    const reference = { top: stageRect.y + stageRect.height + 4, height: 12 };
    const clip = { x: 0, y: top, width: 390, height: reference.top + reference.height - top };
    const png = await page.screenshot({ clip });
    const result = await page.evaluate(
      async ({ base64, groundRows, refStart, refRows, left, right }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("no 2d context");
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const scale = bitmap.width / 390;
        const luma = (x: number, y: number) => {
          const i = (y * bitmap.width + x) * 4;
          return (
            0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)
          );
        };
        const mean = (x0: number, y0: number, w: number, h: number) => {
          let sum = 0;
          let n = 0;
          for (let y = Math.round(y0 * scale); y < Math.round((y0 + h) * scale); y += 1) {
            for (let x = Math.round(x0 * scale); x < Math.round((x0 + w) * scale); x += 1) {
              sum += luma(x, y);
              n += 1;
            }
          }
          return n === 0 ? 0 : sum / n;
        };
        // Each block is compared with the sky straight below the Stage in the same 16 px column,
        // so the fog's own texture across the page does not count as a smudge.
        let worst = { drop: -255, value: 0, ref: 0, x: 0, y: 0 };
        for (let x = left; x + 16 <= right; x += 16) {
          const ref = mean(x, refStart, 16, refRows);
          for (let y = 0; y + 8 <= groundRows; y += 8) {
            const value = mean(x, y, 16, 8);
            if (ref - value > worst.drop) worst = { drop: ref - value, value, ref, x, y };
          }
        }
        return worst;
      },
      {
        base64: png.toString("base64"),
        groundRows: Math.floor(bottom - top),
        refStart: reference.top - top,
        refRows: reference.height,
        left: Math.ceil(stageRect.x),
        right: Math.floor(stageRect.x + stageRect.width),
      },
    );
    expect(
      result.drop,
      `block at x ${result.x}, ${result.y} px under the grass: ${result.value.toFixed(1)} vs sky ${result.ref.toFixed(1)}`,
    ).toBeLessThanOrEqual(6);
  });
});

test.describe("free line", () => {
  // Batch A review #2: from sm the free line and "Other samples:" shared one wrapped row and
  // read as one run-on line. The free line is now a line of its own at every width.
  for (const { width, height } of [
    { width: 640, height: 800 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ]) {
    test(`the free line has its own line at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "reduce");
      const free = await boxOf(page.getByText("Free. No sign-up. No bank login.", { exact: true }));
      const other = await boxOf(page.getByText("Other samples:", { exact: false }).first());
      expect(
        other.y,
        `${width}x${height}: "Other samples:" below the free line`,
      ).toBeGreaterThanOrEqual(free.y + free.height);
    });
  }
});
