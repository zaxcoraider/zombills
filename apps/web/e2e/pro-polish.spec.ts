import { expect, test, type Locator, type Page } from "@playwright/test";
import { clippedText } from "./content-boxes";

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

test.describe("sway ends", () => {
  // Req 10.4, 10.7: the undead card sways once after rising and rests before 5 s (WCAG 2.2.2).
  // Measures motion, so no reduced motion; the mouse stays away from the card so it is not stilled.
  test("the card sways, then rests at 5.5 s and 6.0 s at 1280x800", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.mouse.move(2, 2);
    const primary = page.getByRole("button", { name: PRIMARY_NAME });
    await primary.focus();
    await page.keyboard.press("Enter");

    const heading = page.locator("[data-burial-stage] section h3").first();
    // t0: the first card heading has focus, read in the page on the frame it happens.
    const t0 = await page
      .waitForFunction(() => {
        const active = document.activeElement;
        return active?.matches("[data-burial-stage] section h3") ? performance.now() : null;
      })
      .then((handle) => handle.jsonValue() as Promise<number>);
    await expect(heading).toBeFocused();
    const layer = page.locator("[data-burial-stage] section").first().locator("xpath=..");

    const at = (ms: number) =>
      page.evaluate(async (target) => {
        while (performance.now() < target) await new Promise((r) => setTimeout(r, 16));
      }, t0 + ms);

    await at(2500);
    const swaying = await transformOf(layer);
    expect(IDENTITY.has(swaying), `t0 + 2.5 s: ${swaying}`).toBe(false);

    for (const ms of [5500, 6000]) {
      await at(ms);
      await expectIdentity(layer, `t0 + ${ms / 1000} s`);
      const running = await layer.evaluate(
        (el) =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.effect instanceof KeyframeEffect &&
                a.effect.target === el &&
                a.playState === "running",
            ).length,
      );
      expect(running, `t0 + ${ms / 1000} s: running animations on the sway layer`).toBe(0);
    }
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

test.describe("grave drag-over", () => {
  // Req 3.6: the Resting ghost rises and the rim glows while a file is over the Grave drop area.
  // Measured by computed style, so these tests do not emulate reduced motion unless they say so.
  const GHOST_REST = "matrix(1, 0, 0, 1, 0, 24)";
  const GHOST_RISEN = "matrix(1, 0, 0, 1, 0, 8)";
  const POLL = { timeout: 2000 };

  type Where = "landing" | "results";

  async function openGrave(
    page: Page,
    where: Where,
    reducedMotion: "reduce" | "no-preference",
  ): Promise<Locator> {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLanding(page, reducedMotion);
    if (where === "results") {
      await page.getByRole("button", { name: PRIMARY_NAME }).click();
      await expect(page.getByText("Recurring charges found")).toBeVisible();
      const disclosure = page.getByRole("button", { name: "Try another statement" });
      await disclosure.click();
      await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    }
    const grave = page.locator("[data-grave-drop]");
    await expect(grave).toHaveCount(1);
    await grave.scrollIntoViewIfNeeded();
    return grave;
  }

  /** Dispatches a drag event on the grave with a DataTransfer holding one CSV file. */
  async function drag(page: Page, grave: Locator, type: "dragenter" | "dragleave") {
    const dataTransfer = await page.evaluateHandle(() => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["Date,Description,Amount\n"], "statement.csv", { type: "text/csv" }),
      );
      return transfer;
    });
    await grave.dispatchEvent(type, { dataTransfer });
  }

  const opacityOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).opacity);

  for (const where of ["landing", "results"] as const) {
    test(`ghost rises and rim glows on ${where}, no reduced motion`, async ({ page }) => {
      const grave = await openGrave(page, where, "no-preference");
      const ghost = grave.locator("[data-resting-ghost]");
      const rim = grave.locator("[data-rim-glow]");
      expect(await transformOf(ghost), `${where}: ghost at rest`).toBe(GHOST_REST);
      expect(await opacityOf(rim), `${where}: rim at rest`).toBe("0");

      await drag(page, grave, "dragenter");
      await expect(grave).toHaveAttribute("data-dragging", "true");
      await page.waitForTimeout(400);
      // Framer Motion runs on rAF, so a loaded runner may still be finishing the tween (review B #8).
      await expect
        .poll(() => transformOf(ghost), { ...POLL, message: `${where}: ghost on drag-over` })
        .toBe(GHOST_RISEN);
      await expect
        .poll(() => opacityOf(rim), { ...POLL, message: `${where}: rim on drag-over` })
        .toBe("1");

      await drag(page, grave, "dragleave");
      await expect(grave).toHaveAttribute("data-dragging", "false");
      await page.waitForTimeout(400);
      await expect
        .poll(() => transformOf(ghost), { ...POLL, message: `${where}: ghost after leave` })
        .toBe(GHOST_REST);
      await expect
        .poll(() => opacityOf(rim), { ...POLL, message: `${where}: rim after leave` })
        .toBe("0");
    });

    test(`ghost stays and rim glows on ${where}, reduced motion`, async ({ page }) => {
      const grave = await openGrave(page, where, "reduce");
      const ghost = grave.locator("[data-resting-ghost]");
      const rim = grave.locator("[data-rim-glow]");

      await drag(page, grave, "dragenter");
      await expect(grave).toHaveAttribute("data-dragging", "true");
      await page.waitForTimeout(400);
      expect(await transformOf(ghost), `${where}: ghost on drag-over`).toBe(GHOST_REST);
      await expect
        .poll(() => opacityOf(rim), { ...POLL, message: `${where}: rim on drag-over` })
        .toBe("1");
    });
  }

  test("one outline and one moss rim glow, both on the rounded edge, with an even 12 px pit inset", async ({
    page,
  }) => {
    // Review B V2 and V3: the earth ring is even on every side and drag-over shows one moss ring.
    const grave = await openGrave(page, "landing", "reduce");
    const area = grave.getByRole("button", { name: "Drop area: choose or drop a CSV statement" });
    await area.focus();
    await drag(page, grave, "dragenter");
    await expect(grave).toHaveAttribute("data-dragging", "true");
    await expect.poll(() => opacityOf(grave.locator("[data-rim-glow]")), POLL).toBe("1");
    const shape = await grave.evaluate((root) => {
      const box = root.querySelector(".grave")?.getBoundingClientRect();
      const pit = root.querySelector("[data-pit]")?.getBoundingClientRect();
      const ringed = [...root.querySelectorAll<HTMLElement>("*")].filter((el) => {
        const style = getComputedStyle(el);
        const border = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none";
        const outline = parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== "none";
        const isButton = el.tagName === "BUTTON";
        return !isButton && (border || outline);
      });
      return {
        insets:
          box && pit
            ? [
                pit.left - box.left,
                pit.top - box.top,
                box.right - pit.right,
                box.bottom - pit.bottom,
              ]
            : [],
        rings: ringed.map((el) => ({
          name: Object.keys(el.dataset).join(","),
          radius: getComputedStyle(el).borderTopLeftRadius,
          outline: getComputedStyle(el).outlineStyle,
        })),
      };
    });
    expect(shape.insets).toEqual([12, 12, 12, 12]);
    expect(shape.rings).toEqual([
      { name: "graveOutline", radius: "16px", outline: "none" },
      { name: "rimGlow", radius: "16px", outline: "none" },
    ]);
  });

  test("Choose a file sits inside the grave at 390x844 with 200% text", async ({ page }) => {
    // Review B #5, Req 3.5 and 12.9.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await openLanding(page, "reduce");
    const grave = page.locator("[data-grave-drop] .grave");
    await grave.scrollIntoViewIfNeeded();
    const outer = await boxOf(grave);
    const button = await boxOf(grave.getByRole("button", { name: "Choose a file" }));
    expect(button.x, "left edge").toBeGreaterThanOrEqual(outer.x);
    expect(button.y, "top edge").toBeGreaterThanOrEqual(outer.y);
    expect(button.x + button.width, "right edge").toBeLessThanOrEqual(outer.x + outer.width);
    expect(button.y + button.height, "bottom edge").toBeLessThanOrEqual(outer.y + outer.height);
  });
});

/** Twelve monthly subscriptions, so 12 Progress dots rise (the most before the bar). */
const TWELVE_CSV = [
  "Date,Description,Amount",
  ...[
    "ALDER",
    "BIRCH",
    "CEDAR",
    "DAMSON",
    "ELDER",
    "FIR",
    "GORSE",
    "HAZEL",
    "IVY",
    "JUNIPER",
    "KALE",
    "LARCH",
  ].flatMap((word, i) =>
    ["01", "02", "03", "04"].map(
      (month) => `2026-${month}-${String(i + 2).padStart(2, "0")},${word} CLUB,-${10 + i}.00`,
    ),
  ),
].join("\n");

test.describe("batch C fixes", () => {
  test("12 Progress dots cause no sideways scroll at 390x844 with 200% text", async ({ page }) => {
    // Review C #3, Req 10.2 and 12.9.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await openLanding(page, "reduce");
    await page.locator('input[type="file"]').setInputFiles({
      name: "twelve.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(TWELVE_CSV),
    });
    await expect(page.getByText("0 of 12 answered")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const dots = page.locator("[data-progress-dots]");
    await expect(dots.locator(":scope > span")).toHaveCount(12);
    expect((await boxOf(dots)).width).toBeCloseTo(184, 0);
    const scroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.innerWidth);
  });

  test("Try another statement lines up with the summary Card at 390x844", async ({ page }) => {
    // Review C V1: the visible text starts at the Card's left edge, within 1 px.
    await page.setViewportSize({ width: 390, height: 844 });
    await openLanding(page, "reduce");
    await page.getByRole("button", { name: PRIMARY_NAME }).click();
    const heading = page.getByRole("heading", { level: 2, name: "Recurring charges found" });
    await expect(heading).toBeVisible();
    const card = await boxOf(heading.locator(".."));
    const button = page.getByRole("button", { name: "Try another statement" });
    const textLeft = await button.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (node === null) throw new Error("no text");
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().left;
    });
    expect(Math.abs(textLeft - card.x)).toBeLessThanOrEqual(1);
    const box = await boxOf(button);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    // The 5 px focus band stays inside the viewport.
    expect(box.x).toBeGreaterThanOrEqual(5);
  });
});

test.describe("wide layout", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1600, height: 900 },
  ] as const) {
    test(`the Stage sits left of the summary Card at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      // Req 7.1, 7.3: at lg the Stage takes the left column and the summary the right one.
      await page.setViewportSize(viewport);
      await openLanding(page, "reduce");
      await page.getByRole("button", { name: PRIMARY_NAME }).click();
      const heading = page.getByRole("heading", { level: 2, name: "Recurring charges found" });
      await expect(heading).toBeVisible();
      await expect(page.getByRole("region", { name: "Adobe Creative Cloud" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const summary = await boxOf(page.locator("[data-rising-summary]"));
      const stage = await boxOf(page.locator("[data-burial-stage]"));
      expect(stage.x + stage.width).toBeLessThan(summary.x);
      const overlap =
        stage.x < summary.x + summary.width &&
        summary.x < stage.x + stage.width &&
        stage.y < summary.y + summary.height &&
        summary.y < stage.y + stage.height;
      expect(overlap).toBe(false);
    });

    test(`Try another statement sits right under the summary Card at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      // Review D #1, Req 7.1, 7.3: the statement row does not share the Stage's extra height.
      await page.setViewportSize(viewport);
      await openLanding(page, "reduce");
      await page.getByRole("button", { name: PRIMARY_NAME }).click();
      await expect(page.getByRole("region", { name: "Adobe Creative Cloud" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const summary = await boxOf(page.locator("[data-rising-summary]"));
      const statement = await boxOf(page.locator("[data-rising-statement]"));
      const gap = statement.y - (summary.y + summary.height);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(32);
    });
  }
});

test.describe("graveyard grid", () => {
  const STORE_KEY = "zombills.graveyard.v1";
  /** Three Valid buried records, each a different monthly USD merchant. */
  const THREE_RECORDS = Array.from({ length: 3 }, (_, i) => ({
    id: `sub:USD:monthly:*:service-${i + 1}`,
    merchant: `Service ${i + 1}`,
    serviceId: null,
    currentAmountCents: 999 + i * 100,
    answer: "not-using",
    cadenceAssumed: false,
    carriedOver: false,
  }));
  /** Four Valid buried records, for the 1600 px row of four (Review D #6). */
  const FOUR_RECORDS = Array.from({ length: 4 }, (_, i) => ({
    id: `sub:USD:monthly:*:service-${i + 1}`,
    merchant: `Service ${i + 1}`,
    serviceId: null,
    currentAmountCents: 999 + i * 100,
    answer: "not-using",
    cadenceAssumed: false,
    carriedOver: false,
  }));

  test("four tombstones share the first row at 1600x900", async ({ page }) => {
    // Review D #6, Req 7.2: from 1600 px the tombstone grid has four columns.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.addInitScript(
      ([key, list]) => {
        localStorage.setItem(key, JSON.stringify({ version: 1, records: list }));
      },
      [STORE_KEY, FOUR_RECORDS] as const,
    );
    await openLanding(page, "reduce");
    await page.getByRole("button", { name: "Open the graveyard" }).click();
    await expect(page.getByRole("heading", { name: "Your graveyard", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const stones = page.getByRole("region", { name: /^Here lies Service \d\.$/ });
    await expect(stones).toHaveCount(4);
    const ys = await stones.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(ys[1], "second tombstone on the first row").toBe(ys[0]);
    expect(ys[2], "third tombstone on the first row").toBe(ys[0]);
    expect(ys[3], "fourth tombstone on the first row").toBe(ys[0]);
  });

  test("three tombstones share the first row at 1280x800", async ({ page }) => {
    // Req 9.1, 7.2: at lg the tombstone grid has three columns.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(
      ([key, list]) => {
        localStorage.setItem(key, JSON.stringify({ version: 1, records: list }));
      },
      [STORE_KEY, THREE_RECORDS] as const,
    );
    await openLanding(page, "reduce");
    await page.getByRole("button", { name: "Open the graveyard" }).click();
    await expect(page.getByRole("heading", { name: "Your graveyard", exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const stones = page.getByRole("region", { name: /^Here lies Service \d\.$/ });
    await expect(stones).toHaveCount(3);
    const ys = await stones.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    expect(ys[1], "second tombstone on the first row").toBe(ys[0]);
    expect(ys[2], "third tombstone on the first row").toBe(ys[0]);
  });
});

test.describe("sizes", () => {
  // Req 2.10, 12.9: no sideways scroll and no clipped text on every view, at 320x568 and at
  // 390x844 with 200% root font size.
  test.describe.configure({ mode: "parallel" });

  const STORE_KEY = "zombills.graveyard.v1";
  const NETFLIX_RECORD = {
    id: "sub:USD:monthly:*:netflix",
    merchant: "Netflix",
    serviceId: "netflix",
    currentAmountCents: 1799,
    answer: "not-using",
    cadenceAssumed: false,
    carriedOver: false,
  };
  const ONE_OFF_CSV =
    "Date,Description,Amount\n2026-01-03,CORNER BAKERY,-4.50\n2026-01-09,HARDWARE DEPOT,-23.10\n2026-01-20,BOOK NOOK,-12.00\n";
  const VIEWS = ["landing", "results", "graveyard", "error", "no-subscriptions"] as const;
  type SizedView = (typeof VIEWS)[number];

  /** Opens a view with every disclosure the size check measures open. */
  async function openSized(page: Page, view: SizedView): Promise<void> {
    if (view === "graveyard") {
      await page.addInitScript(
        ([key, record]) => {
          localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] }));
        },
        [STORE_KEY, NETFLIX_RECORD] as const,
      );
    }
    await openLanding(page, "reduce");
    const main = page.getByRole("main");
    const file = page.locator('input[type="file"]');
    switch (view) {
      case "landing":
        break;
      case "results": {
        await page.getByRole("button", { name: PRIMARY_NAME }).click();
        await expect(page.getByText("Recurring charges found")).toBeVisible();
        const disclosure = page.getByRole("button", { name: "Try another statement" });
        await disclosure.click();
        await expect(disclosure).toHaveAttribute("aria-expanded", "true");
        break;
      }
      case "graveyard": {
        await page.getByRole("button", { name: "Open the graveyard" }).click();
        await expect(
          page.getByRole("heading", { name: "Your graveyard", exact: true }),
        ).toBeVisible();
        const helper = page.getByRole("button", { name: "How to cancel Netflix" });
        await helper.click();
        await expect(helper).toHaveAttribute("aria-expanded", "true");
        const email = page.getByRole("button", { name: "Write to them instead for Netflix" });
        await email.click();
        await expect(email).toHaveAttribute("aria-expanded", "true");
        await expect(page.locator("[data-email-text]")).toBeVisible();
        break;
      }
      case "error":
        await file.setInputFiles({
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("hello"),
        });
        await expect(main.getByText("This file is not a CSV statement.")).toBeVisible();
        break;
      case "no-subscriptions":
        await file.setInputFiles({
          name: "one.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(ONE_OFF_CSV),
        });
        await expect(main.getByText("No undead here.")).toBeVisible();
        break;
    }
    await page.evaluate(() => document.fonts.ready);
    // Reduced-motion fades last at most 150 ms; let them end before measuring.
    await page.waitForTimeout(300);
  }

  for (const { width, height, zoom } of [
    { width: 320, height: 568, zoom: false },
    { width: 390, height: 844, zoom: true },
  ]) {
    for (const view of VIEWS) {
      test(`${view} has no sideways scroll or clipped text at ${width}x${height}${zoom ? " with 200% text" : ""}`, async ({
        page,
      }) => {
        const where = `${view} ${width}x${height}${zoom ? " 200%" : ""}`;
        await page.setViewportSize({ width, height });
        if (zoom) {
          await page.addInitScript(() => {
            document.documentElement.style.fontSize = "200%";
          });
        }
        await openSized(page, view);
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(metrics.scrollWidth, `${where}: sideways scroll`).toBeLessThanOrEqual(
          metrics.innerWidth,
        );
        expect(await clippedText(page), `${where}: clipped text`).toEqual([]);
        if (view === "graveyard") {
          // Review D #3: every engraved line stays inside its list tombstone's section box.
          const listStones = page
            .getByRole("main")
            .locator("li")
            .getByRole("region", { name: /^Here lies / });
          const outside = await listStones.evaluateAll((sections) =>
            sections.flatMap((section) => {
              const box = section.getBoundingClientRect();
              const out: string[] = [];
              const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
                const text = (n.textContent ?? "").trim();
                if (text === "") continue;
                const range = document.createRange();
                range.selectNodeContents(n);
                for (const r of Array.from(range.getClientRects())) {
                  if (r.width === 0) continue;
                  if (
                    r.left < box.left - 0.5 ||
                    r.right > box.right + 0.5 ||
                    r.top < box.top - 0.5 ||
                    r.bottom > box.bottom + 0.5
                  ) {
                    out.push(
                      `"${text.slice(0, 40)}" ${r.left},${r.top}–${r.right},${r.bottom} outside ${box.left},${box.top}–${box.right},${box.bottom}`,
                    );
                  }
                }
              }
              return out;
            }),
          );
          expect(await listStones.count(), `${where}: list tombstones`).toBeGreaterThan(0);
          expect(outside, `${where}: text outside its tombstone`).toEqual([]);
        }
      });
    }
  }
});

test.describe("batch D fixes", () => {
  const STORE_KEY = "zombills.graveyard.v1";
  const RECORD = {
    id: "sub:USD:monthly:*:service-1",
    merchant: "Service 1",
    serviceId: null,
    currentAmountCents: 999,
    answer: "not-using",
    cadenceAssumed: false,
    carriedOver: false,
  };

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
    { width: 1600, height: 900 },
  ] as const) {
    test(`What is kept? lines up with the Memory short sentence at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      // Review D V1: the visible text starts at MEMORY_SHORT's left edge, within 1 px.
      await page.setViewportSize(viewport);
      await page.addInitScript(
        ([key, record]) => {
          localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] }));
        },
        [STORE_KEY, RECORD] as const,
      );
      await openLanding(page, "reduce");
      await page.getByRole("button", { name: "Open the graveyard" }).click();
      await expect(
        page.getByRole("heading", { name: "Your graveyard", exact: true }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const short = page.getByText("Kept only in this browser, on this device.", { exact: true });
      const button = page.getByRole("button", { name: "What is kept?" });
      const textLeft = (el: Element) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        if (node === null) throw new Error("no text");
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().left;
      };
      const shortLeft = await short.evaluate(textLeft);
      const buttonLeft = await button.evaluate(textLeft);
      expect(Math.abs(buttonLeft - shortLeft)).toBeLessThanOrEqual(1);
      const box = await boxOf(button);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      // The 5 px focus band stays inside the Memory Card and the viewport.
      const card = await boxOf(page.getByRole("region", { name: "Memory", exact: true }));
      expect(box.x - card.x).toBeGreaterThanOrEqual(5);
      expect(box.x).toBeGreaterThanOrEqual(5);
    });
  }

  test("the Memory switch knob moves when the checkbox is checked, at 390x844", async ({
    page,
  }) => {
    // Review D #5: the knob is a sibling span, drawn in every engine.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      ([key, record]) => {
        localStorage.setItem(key, JSON.stringify({ version: 1, records: [record] }));
      },
      [STORE_KEY, RECORD] as const,
    );
    await openLanding(page, "reduce");
    await page.getByRole("button", { name: "Open the graveyard" }).click();
    const checkbox = page.getByRole("checkbox", { name: "Remember my graveyard on this device" });
    const knob = page.locator("[data-switch-knob]");
    const track = page.locator("[data-switch-track]");
    // A restored Graveyard means Memory is on; turn it off first to measure the off position.
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
    const off = await boxOf(knob);
    const trackBox = await boxOf(track);
    expect(off.width).toBeCloseTo(16, 0);
    expect(off.x - trackBox.x).toBeCloseTo(4, 0);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    const on = await boxOf(knob);
    expect(on.x - off.x).toBeCloseTo(20, 0);
  });
});
