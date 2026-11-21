import { expect, test, type Page } from "@playwright/test";
import {
  circleHitsRect,
  collectContentBoxes,
  type DocRect,
  distanceToRect,
  inViewport,
  moonGeometry,
} from "./content-boxes";

// Moon layout tests (landing-polish design, "The moon layout test"): the Non-landing part and the
// Landing part. Boxes are real, so this runs in Chromium.

const NON_LANDING_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

const STATES = ["results", "graveyard", "error", "no-subscriptions", "working-other"] as const;
type State = (typeof STATES)[number];

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

/** Starts the US Sample with the Primary action. */
async function startUsSample(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Summon the undead with a sample US bank statement" }).click();
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function openRestoredGraveyard(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, records: [record, { id: "bad" }] }));
    },
    [STORE_KEY, NETFLIX_RECORD] as const,
  );
  await page.goto("/");
  await expect(
    page.getByText("Your graveyard from this device is back: 1 buried, 0 resting."),
  ).toBeVisible();
  await expect(page.getByText("1 saved answer could not be read and was left out.")).toBeVisible();
  await page.getByRole("button", { name: "Open the graveyard" }).click();
  await expect(page.getByRole("heading", { name: "Your graveyard", exact: true })).toBeVisible();
}

async function setUpState(page: Page, state: State): Promise<void> {
  switch (state) {
    case "results":
      await page.goto("/");
      await startUsSample(page);
      await expect(page.getByText("Recurring charges found")).toBeVisible();
      return;
    case "graveyard":
      await openRestoredGraveyard(page);
      return;
    case "error":
      await page.goto("/");
      await page
        .locator('input[type="file"]')
        .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
      await expect(
        page.getByRole("main").getByText("This file is not a CSV statement."),
      ).toBeVisible();
      return;
    case "no-subscriptions":
      await page.goto("/");
      await page.locator('input[type="file"]').setInputFiles({
        name: "one.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(ONE_OFF_CSV),
      });
      await expect(page.getByRole("main").getByText("No undead here.")).toBeVisible();
      return;
    case "working-other":
      await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
      await page.goto("/");
      await startUsSample(page);
      await expect(page.getByText("Recurring charges found")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // Relative to the current fake time, so a slow load cannot leave the pause in the past.
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
      await page.getByRole("button", { name: "Try another statement" }).click();
      await page
        .getByRole("list", { name: "Sample statements" })
        .getByRole("button", { name: "UK bank statement" })
        .click();
      await expect(page.getByRole("main").getByText("Reading UK bank statement…")).toBeVisible();
      return;
  }
}

test.describe("non-landing moon", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of NON_LANDING_VIEWPORTS) {
    for (const state of STATES) {
      test(`non-landing moon ${width}x${height} ${state}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await setUpState(page, state);
        await settle(page);

        const moon = await moonGeometry(page);
        const where = `${width}x${height} ${state}`;
        // Wide-layout views draw no sky moon at any width (pro-polish decision Option A).
        if (state === "results" || state === "graveyard") {
          expect(moon.count, `${where}: no sky moon on a Wide-layout view`).toBe(0);
          return;
        }
        expect(moon.count, `${where}: exactly one moon`).toBe(1);

        if (width < 1024) {
          expect(moon.shown, `${where}: the sky moon is not drawn below 1024 px`).toBe(false);
          return;
        }

        expect(moon.shown, `${where}: moon drawn`).toBe(true);
        expect(2 * moon.r, `${where}: disc diameter`).toBeGreaterThanOrEqual(48 - 0.5);
        expect(
          Math.hypot(moon.halo.cx - moon.cx, moon.halo.cy - moon.cy),
          `${where}: halo`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.hypot(moon.glow.cx - moon.cx, moon.glow.cy - moon.cy),
          `${where}: glow`,
        ).toBeLessThanOrEqual(1);

        // The moon is fixed to the viewport, so a box counts only where it is on screen.
        const scrollY = await page.evaluate(() => window.scrollY);
        const viewportCx = moon.cx - (await page.evaluate(() => window.scrollX));
        const viewportCy = moon.cy - scrollY;
        for (const box of await collectContentBoxes(page)) {
          const shifted = {
            ...box,
            y0: box.y0 - scrollY,
            y1: box.y1 - scrollY,
            x0: box.x0,
            x1: box.x1,
          };
          if (!inViewport(box, scrollY, width, height)) continue;
          const at = `x ${box.x0}–${box.x1}, y ${box.y0}–${box.y1}`;
          expect(
            circleHitsRect(viewportCx, viewportCy, moon.r, shifted),
            `${where}: disc hits ${box.kind} "${box.label}" at ${at}`,
          ).toBe(false);
          if (box.kind === "text") {
            expect(
              distanceToRect(viewportCx, viewportCy, shifted),
              `${where}: halo hits text "${box.label}" at ${at}`,
            ).toBeGreaterThanOrEqual(2.5 * moon.r - 0.5);
          }
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Landing part: 14 viewports x 3 states (design "Landing checks").
// ---------------------------------------------------------------------------------------------

const LANDING_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 414, height: 896 },
  { width: 640, height: 800 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const LANDING_STATES = ["empty", "restored", "working"] as const;
type LandingState = (typeof LANDING_STATES)[number];

/** The eight sizes of Req 3.7, where the whole Hero must sit above the Fold. */
const FOLD_SIZES = new Set([
  "1280x720",
  "1280x800",
  "1366x768",
  "1440x900",
  "1600x900",
  "1920x1080",
  "390x844",
  "414x896",
]);

const PRIMARY_NAME = "Summon the undead with a sample US bank statement";
const OTHER_SAMPLES = [
  "UK bank statement",
  "European bank statement",
  "Statement with extra top lines",
] as const;

async function seedStore(page: Page, records: readonly unknown[]): Promise<void> {
  await page.addInitScript(
    ([key, list]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, records: list }));
    },
    [STORE_KEY, [...records, { id: "bad" }]] as const,
  );
}

/** Opens the Landing view in one of the three states, with fonts loaded and scroll at 0. */
async function openLanding(page: Page, state: LandingState): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (state === "restored") {
    await seedStore(page, [NETFLIX_RECORD]);
    await page.goto("/");
    await expect(
      page.getByText("Your graveyard from this device is back: 1 buried, 0 resting."),
    ).toBeVisible();
    await expect(
      page.getByText("1 saved answer could not be read and was left out."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Open the graveyard" })).toBeVisible();
    await settle(page);
    return;
  }
  if (state === "empty") {
    await page.goto("/");
    await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
    await settle(page);
    return;
  }
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  // Relative to the current fake time, so a slow load cannot leave the pause in the past. The
  // paused clock holds requestAnimationFrame, so the run waits and the page stays `working`.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  await page.getByRole("button", { name: PRIMARY_NAME }).click();
  await expect(page.getByRole("main").getByText("Reading US bank statement…")).toBeVisible();
  await settle(page);
}

const at = (box: DocRect) =>
  `at x ${box.x0}–${box.x1}, y ${box.y0}–${box.y1}`;

/** Checks 1 to 7: one moon, its size, position, clearance, halo and glow, and the Hero art. */
async function checkLandingMoon(page: Page, width: number, height: number, state: string) {
  const where = `${width}x${height} ${state}`;
  const moon = await moonGeometry(page);
  expect(moon.count, `${where}: exactly one moon`).toBe(1);
  expect(moon.shown, `${where}: moon drawn`).toBe(true);
  expect(2 * moon.r, `${where}: disc diameter`).toBeGreaterThanOrEqual(48 - 0.5);
  const { scrollX, scrollY, innerWidth, innerHeight } = await page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  expect(scrollY, `${where}: scroll position`).toBe(0);
  expect(moon.cx - moon.r - scrollX, `${where}: disc left edge`).toBeGreaterThanOrEqual(0);
  expect(moon.cx + moon.r - scrollX, `${where}: disc right edge`).toBeLessThanOrEqual(innerWidth);
  expect(moon.cy - moon.r - scrollY, `${where}: disc top edge`).toBeGreaterThanOrEqual(0);
  expect(moon.cy + moon.r - scrollY, `${where}: disc bottom edge`).toBeLessThanOrEqual(innerHeight);
  expect(
    Math.hypot(moon.halo.cx - moon.cx, moon.halo.cy - moon.cy),
    `${where}: halo centre`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.hypot(moon.glow.cx - moon.cx, moon.glow.cy - moon.cy),
    `${where}: glow centre`,
  ).toBeLessThanOrEqual(1);

  const boxes = await collectContentBoxes(page);
  for (const box of boxes) {
    expect(
      circleHitsRect(moon.cx, moon.cy, moon.r, box),
      `${where}: disc hits ${box.kind} "${box.label}" ${at(box)}`,
    ).toBe(false);
    if (box.kind === "text") {
      expect(
        distanceToRect(moon.cx, moon.cy, box),
        `${where}: halo hits text "${box.label}" ${at(box)}`,
      ).toBeGreaterThanOrEqual(2.5 * moon.r - 0.5);
    }
  }
  const art = boxes.filter((box) => box.kind === "art");
  expect(art.filter((box) => box.label === "hero art").length, `${where}: one Hero art box`).toBe(1);
  expect(art.filter((box) => box.label === "brand mark").length, `${where}: one brand mark`).toBe(1);
  for (const a of art) {
    for (const t of boxes.filter((box) => box.kind === "text")) {
      const overlap = a.x0 < t.x1 && t.x0 < a.x1 && a.y0 < t.y1 && t.y0 < a.y1;
      expect(overlap, `${where}: Hero art overlaps text "${t.label}" ${at(t)}`).toBe(false);
    }
  }
  return boxes;
}

/** Distance between two rectangles; 0 when they touch or overlap. */
function rectGap(a: DocRect, b: DocRect): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
  return Math.hypot(dx, dy);
}

const inside = (inner: DocRect, outer: DocRect) =>
  inner.x0 >= outer.x0 - 0.5 &&
  inner.x1 <= outer.x1 + 0.5 &&
  inner.y0 >= outer.y0 - 0.5 &&
  inner.y1 <= outer.y1 + 0.5;

async function docBox(page: Page, name: string | RegExp, kind: DocRect["kind"] = "control") {
  const box = await page.getByRole("button", { name }).first().boundingBox();
  if (box === null) throw new Error(`no box for ${String(name)}`);
  const sx = await page.evaluate(() => window.scrollX);
  const sy = await page.evaluate(() => window.scrollY);
  const rect: DocRect = {
    x0: box.x + sx,
    y0: box.y + sy,
    x1: box.x + box.width + sx,
    y1: box.y + box.height + sy,
    kind,
    label: String(name),
  };
  return rect;
}

async function bottomOf(locator: ReturnType<Page["locator"]>): Promise<number> {
  const box = await locator.first().boundingBox();
  if (box === null) throw new Error("element has no box");
  return box.y + box.height;
}

/** Check 8: the Fold (Req 3.7, 3.8). */
async function checkFold(page: Page, width: number, height: number): Promise<void> {
  const where = `${width}x${height} empty`;
  const art = page.locator("[data-hero-art]");
  expect(await bottomOf(page.getByRole("heading", { level: 1 })), `${where}: h1 above the Fold`).toBeLessThanOrEqual(height);
  expect(
    await bottomOf(page.getByText("Your bank statement is haunted.", { exact: true })),
    `${where}: tagline above the Fold`,
  ).toBeLessThanOrEqual(height);
  expect(
    await bottomOf(page.getByRole("button", { name: PRIMARY_NAME })),
    `${where}: Primary action above the Fold`,
  ).toBeLessThanOrEqual(height);
  const artBox = await art.boundingBox();
  expect(artBox?.height ?? 0, `${where}: Hero art height`).toBeGreaterThanOrEqual(96);
  if (!FOLD_SIZES.has(`${width}x${height}`)) return;
  expect(
    await bottomOf(page.getByText("We find the subscriptions still feeding on you.", { exact: false })),
    `${where}: Hero line above the Fold`,
  ).toBeLessThanOrEqual(height);
  expect(
    await bottomOf(page.getByRole("main").getByText("Your statement never leaves your device.")),
    `${where}: Privacy badge above the Fold`,
  ).toBeLessThanOrEqual(height);
  expect(await bottomOf(art), `${where}: Hero art above the Fold`).toBeLessThanOrEqual(height);
}

/** Checks 9 and 10: the moss fill and the glow clearances. */
async function checkFillAndGlow(page: Page, width: number, height: number, boxes: DocRect[]) {
  const where = `${width}x${height} empty`;
  const fills = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--moss")
      .trim();
    document.body.append(probe);
    const moss = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const controls = Array.from(
      document.querySelectorAll(
        'button, a[href], input:not([type="file"]), select, textarea, [role="button"], [tabindex="0"]',
      ),
    ).filter((el) => getComputedStyle(el).backgroundColor === moss);
    return { moss, names: controls.map((el) => (el as HTMLElement).innerText.slice(0, 40)) };
  });
  expect(fills.names.length, `${where}: controls filled with ${fills.moss}`).toBe(1);
  expect(fills.names[0], `${where}: the moss control`).toContain("Summon the undead");

  const texts = boxes.filter((box) => box.kind === "text");
  const primary = await docBox(page, PRIMARY_NAME);
  for (const t of texts) {
    if (inside(t, primary)) continue;
    expect(
      rectGap(primary, t),
      `${where}: text "${t.label}" ${at(t)} is within 18 px of the Primary action`,
    ).toBeGreaterThanOrEqual(18);
  }
  const small = [
    ...(await Promise.all(OTHER_SAMPLES.map((name) => docBox(page, name)))),
    await docBox(page, "Read the privacy note"),
  ];
  for (const control of small) {
    for (const t of texts) {
      if (inside(t, control)) continue;
      expect(
        rectGap(control, t),
        `${where}: text "${t.label}" ${at(t)} is within 8 px of "${control.label}"`,
      ).toBeGreaterThanOrEqual(8);
    }
  }
}

/** Check 11: computed styles and boxes (R3.1, R5.2, R5.5, R6.3, R7.3, R8.5, R10.4). */
async function checkStylesAndBoxes(page: Page, width: number, height: number): Promise<void> {
  const where = `${width}x${height} empty`;

  // R3.1
  const titles = await page.evaluate(() => {
    const read = (el: Element | null) => {
      const style = el === null ? null : getComputedStyle(el);
      return { size: parseFloat(style?.fontSize ?? "0"), family: style?.fontFamily ?? "" };
    };
    const tagline = Array.from(document.querySelectorAll("header p")).find(
      (p) => p.textContent === "Your bank statement is haunted.",
    );
    return { h1: read(document.querySelector("h1")), tagline: read(tagline ?? null) };
  });
  if (width < 640) expect(titles.h1.size, `${where}: h1 font size`).toBeGreaterThanOrEqual(48);
  if (width >= 1024) expect(titles.h1.size, `${where}: h1 font size`).toBeGreaterThanOrEqual(72);
  expect(titles.tagline.size, `${where}: tagline font size`).toBeGreaterThanOrEqual(24);
  expect(titles.h1.family, `${where}: h1 font`).toContain("IM Fell English");
  expect(titles.tagline.family, `${where}: tagline font`).toContain("IM Fell English");

  // R5.2
  for (const name of OTHER_SAMPLES) {
    const style = await page.getByRole("button", { name }).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        border: s.borderTopWidth + s.borderRightWidth + s.borderBottomWidth + s.borderLeftWidth,
        decoration: s.textDecorationLine,
        size: parseFloat(s.fontSize),
      };
    });
    expect(style.background, `${where}: "${name}" background`).toBe("rgba(0, 0, 0, 0)");
    expect(style.border, `${where}: "${name}" border`).toBe("0px0px0px0px");
    expect(style.decoration, `${where}: "${name}" decoration`).toContain("underline");
    expect(style.size, `${where}: "${name}" font size`).toBeGreaterThanOrEqual(14);
  }

  // R5.5
  const drop = await page.locator('[data-focus="drop-zone"]').boundingBox();
  expect(drop?.height ?? Number.POSITIVE_INFINITY, `${where}: drop area height`).toBeLessThanOrEqual(128);

  // R6.3
  const steps = await page.locator("ol[role='list'] > li").evaluateAll((items) =>
    items.map((li) => {
      const r = li.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, bottom: r.bottom };
    }),
  );
  expect(steps.length, `${where}: three steps`).toBe(3);
  if (width >= 768) {
    for (const step of steps) {
      expect(Math.abs(step.y - (steps[0]?.y ?? 0)), `${where}: steps share a top`).toBeLessThanOrEqual(1);
      expect(Math.abs(step.w - (steps[0]?.w ?? 0)), `${where}: steps share a width`).toBeLessThanOrEqual(1);
    }
  } else if (width < 640) {
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]?.y ?? 0, `${where}: step ${i + 1} below step ${i}`).toBeGreaterThanOrEqual(
        steps[i - 1]?.bottom ?? Number.POSITIVE_INFINITY,
      );
    }
  }

  // R7.3
  const badge = await page
    .getByRole("main")
    .locator("p", { hasText: "Your statement never leaves your device." })
    .boundingBox();
  if (width >= 640) {
    expect(badge?.height ?? 0, `${where}: badge height`).toBeLessThanOrEqual(46);
  } else {
    expect(badge?.height ?? 0, `${where}: badge height`).toBeLessThanOrEqual(90);
  }

  // R8.5
  const footerSizes = await page.evaluate(() => {
    const out: { text: string; size: number }[] = [];
    for (const footer of Array.from(document.querySelectorAll("footer"))) {
      const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        const text = (n.textContent ?? "").trim();
        if (text === "" || n.parentElement === null) continue;
        out.push({ text: text.slice(0, 40), size: parseFloat(getComputedStyle(n.parentElement).fontSize) });
      }
    }
    return out;
  });
  expect(footerSizes.length, `${where}: Footer has text`).toBeGreaterThan(0);
  for (const { text, size } of footerSizes) {
    expect(size, `${where}: Footer text "${text}" font size`).toBeGreaterThanOrEqual(14);
  }

  // R10.4: Tab through the page; no Card, art or backdrop layer covers a focused control or ring.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null || el === document.body || !el.matches(":focus-visible")) return null;
      const r = el.getBoundingClientRect();
      const label = ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.tagName).slice(0, 40);
      const pad = 3;
      const points: [number, number][] = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left - pad, r.top - pad],
        [r.right + pad, r.top - pad],
        [r.left - pad, r.bottom + pad],
        [r.right + pad, r.bottom + pad],
      ];
      const alpha = (c: string) => {
        if (c === "rgba(0, 0, 0, 0)" || c === "transparent") return 0;
        const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
        if (slash?.[1] !== undefined) return slash[2] === "%" ? Number(slash[1]) / 100 : Number(slash[1]);
        const rgba = /^rgba\(\s*[^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(c);
        return rgba?.[1] !== undefined ? Number(rgba[1]) : 1;
      };
      const bad: string[] = [];
      for (const [x, y] of points) {
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
        const top = document.elementFromPoint(x, y);
        if (top === null || el.contains(top) || top.contains(el)) continue;
        const hidden = top.closest('[aria-hidden="true"]') !== null;
        const art = top.closest("[data-hero-art]") !== null;
        const card = alpha(getComputedStyle(top).backgroundColor) >= 0.5;
        if (hidden || art || card) bad.push(`${top.tagName.toLowerCase()} at ${Math.round(x)},${Math.round(y)}`);
      }
      return { label, bad };
    });
    if (result === null) continue;
    seen.add(result.label);
    expect(result.bad, `${where}: "${result.label}" is covered`).toEqual([]);
  }
  expect(seen.size, `${where}: Tab reached the controls`).toBeGreaterThanOrEqual(8);
}

test.describe("landing moon", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of LANDING_VIEWPORTS) {
    for (const state of LANDING_STATES) {
      test(`landing moon ${width}x${height} ${state}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await openLanding(page, state);
        const boxes = await checkLandingMoon(page, width, height, state);
        if (state === "working") {
          await page.clock.resume();
          await expect(page.getByText("Recurring charges found")).toBeVisible();
        }
        if (state !== "empty") return;
        await checkFold(page, width, height);
        await checkFillAndGlow(page, width, height, boxes);
        await checkStylesAndBoxes(page, width, height);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Other layout tests (design "Other layout tests in landing.spec.ts").
// ---------------------------------------------------------------------------------------------

test.describe("landing layout", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of [
    { width: 640, height: 800 },
    { width: 1024, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    test(`privacy badge is one line at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const badge = page
        .getByRole("main")
        .locator("p", { hasText: "Your statement never leaves your device." });
      const box = await badge.boundingBox();
      expect(box?.height ?? Number.POSITIVE_INFINITY, "badge height").toBeLessThanOrEqual(46);
      const text = await badge.locator("span").boundingBox();
      const button = await badge.getByRole("button").boundingBox();
      expect(text !== null && button !== null && button.y < text.y + text.height, "one row").toBe(true);
    });
  }

  for (const { width, height, zoom } of [
    { width: 320, height: 568, zoom: false },
    { width: 390, height: 844, zoom: true },
  ]) {
    test(`no sideways scroll or clipped text at ${width}x${height}${zoom ? " with 200% text" : ""}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      if (zoom) {
        await page.addInitScript(() => {
          document.documentElement.style.fontSize = "200%";
        });
      }
      await openLanding(page, "empty");
      const where = `${width}x${height}${zoom ? " 200%" : ""}`;
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(metrics.scrollWidth, `${where}: sideways scroll`).toBeLessThanOrEqual(metrics.innerWidth);

      const clipped = await page.evaluate(() => {
        const hidden = (start: Element | null): boolean => {
          for (let el = start; el !== null; el = el.parentElement) {
            if (el.getAttribute("aria-hidden") === "true") return true;
            const s = getComputedStyle(el);
            if (s.clipPath === "inset(50%)" || s.clip === "rect(0px, 0px, 0px, 0px)") return true;
          }
          return false;
        };
        const bad: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
          const text = (n.textContent ?? "").trim();
          const parent = n.parentElement;
          if (text === "" || parent === null || hidden(parent)) continue;
          if (["SCRIPT", "STYLE"].includes(parent.tagName)) continue;
          // The nearest ancestor that clips, or the viewport width when there is none.
          let bounds = { left: 0, right: window.innerWidth };
          for (let el: Element | null = parent; el !== null; el = el.parentElement) {
            const s = getComputedStyle(el);
            if (s.overflowX !== "visible") {
              const r = el.getBoundingClientRect();
              bounds = { left: r.left, right: r.right };
              break;
            }
          }
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width === 0) continue;
            if (r.left < bounds.left - 0.5 || r.right > bounds.right + 0.5) {
              bad.push(`"${text.slice(0, 40)}" x ${r.left}–${r.right} outside ${bounds.left}–${bounds.right}`);
            }
          }
        }
        return bad;
      });
      expect(clipped, `${where}: clipped text`).toEqual([]);

      const primary = page.getByRole("button", { name: PRIMARY_NAME });
      await primary.scrollIntoViewIfNeeded();
      const box = await primary.boundingBox();
      expect(box, `${where}: Primary action box`).not.toBeNull();
      if (box === null) return;
      expect(box.x, `${where}: Primary action left`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${where}: Primary action right`).toBeLessThanOrEqual(width);
      expect(box.y, `${where}: Primary action top`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${where}: Primary action bottom`).toBeLessThanOrEqual(height);
    });
  }

  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 1280, height: 720 },
  ]) {
    test(`long counter amounts at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      // Yearly records with cents (JPY has none, so its amount is in hundredths of a yen).
      const record = (currency: string, key: string, cents: number) => ({
        id: `sub:${currency}:yearly:*:${key}`,
        merchant: key,
        serviceId: null,
        currentAmountCents: cents,
        answer: "not-using",
        cadenceAssumed: false,
        carriedOver: false,
      });
      await seedStore(page, [
        record("KWD", "alpha", 123_450),
        record("USD", "beta", 999_999),
        record("JPY", "gamma", 123_456_700),
      ]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Open the graveyard" })).toBeVisible();
      await settle(page);
      await checkLandingMoon(page, width, height, "long-counter");
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(metrics.scrollWidth, "sideways scroll").toBeLessThanOrEqual(metrics.innerWidth);
    });
  }

  test("touch targets are at least 44 x 44 at 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLanding(page, "empty");
    const targets: [string, ReturnType<Page["locator"]>][] = [
      ...OTHER_SAMPLES.map((name): [string, ReturnType<Page["locator"]>] => [
        name,
        page.getByRole("button", { name }),
      ]),
      ["Read the privacy note", page.getByRole("button", { name: "Read the privacy note" })],
      ["Zombills on GitHub", page.getByRole("link", { name: "Zombills on GitHub" })],
      ["The Reaper", page.getByRole("link", { name: "The Reaper", exact: true })],
      [
        "Privacy note",
        page.getByRole("contentinfo").getByRole("button", { name: "Privacy note", exact: true }),
      ],
      ["Built with Kiro", page.getByRole("link", { name: "Built with Kiro", exact: true })],
      ["Primary action", page.getByRole("button", { name: PRIMARY_NAME })],
      ["drop area", page.locator('[data-focus="drop-zone"]')],
      ["Choose a file", page.getByRole("button", { name: "Choose a file" })],
    ];
    for (const [label, locator] of targets) {
      const box = await locator.boundingBox();
      expect(box, `${label}: box`).not.toBeNull();
      expect(box?.width ?? 0, `${label}: width`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `${label}: height`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("footer layout", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    test(`footer reaper description spans the row under the stones ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const where = `${width}x${height}`;
      const footer = page.getByRole("contentinfo");
      await footer.scrollIntoViewIfNeeded();
      const list = footer.getByRole("list", { name: "Site links" });
      await expect(footer.getByRole("link", { name: "The Reaper", exact: true })).toBeVisible();
      const listBox = await list.boundingBox();
      expect(listBox, `${where}: list box`).not.toBeNull();
      if (listBox === null) return;
      const stoneBottoms = await list
        .locator(':scope > li > [data-exempt="footer-tombstone"]')
        .evaluateAll((stones) => stones.map((stone) => stone.getBoundingClientRect().bottom));
      expect(stoneBottoms, `${where}: four stones`).toHaveLength(4);
      const description = footer.locator("p", {
        hasText: "A Kiro Crew app that watches for new statements each month",
      });
      const descBox = await description.boundingBox();
      expect(descBox, `${where}: description box`).not.toBeNull();
      if (descBox === null) return;
      for (const bottom of stoneBottoms) {
        expect(
          descBox.y,
          `${where}: description top ${descBox.y} vs stone bottom ${bottom}`,
        ).toBeGreaterThanOrEqual(bottom);
      }
      expect(
        Math.abs(descBox.width - listBox.width),
        `${where}: description width ${descBox.width} vs list width ${listBox.width}`,
      ).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("hero art layout", () => {
  test.describe.configure({ mode: "parallel" });

  const artBox = async (page: Page) => {
    const box = await page.locator("[data-hero-art]").boundingBox();
    if (box === null) throw new Error("no box for the Hero art");
    return box;
  };

  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    test(`hero art centred below lg ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const where = `${width}x${height}`;
      const art = await artBox(page);
      const column = await page
        .locator("[data-hero-art]")
        .evaluate((el) => el.parentElement?.getBoundingClientRect().toJSON() ?? null);
      expect(column, `${where}: Hero column box`).not.toBeNull();
      if (column === null) return;
      const artCentre = art.x + art.width / 2;
      const columnCentre = column.x + column.width / 2;
      expect(
        Math.abs(artCentre - columnCentre),
        `${where}: art centre x ${artCentre} vs column centre x ${columnCentre}`,
      ).toBeLessThanOrEqual(1);
      const line = await page.getByText("We find the subscriptions still feeding on you.").boundingBox();
      const primary = await page.getByRole("button", { name: PRIMARY_NAME }).boundingBox();
      for (const [name, other] of [["Hero line", line], ["Primary action", primary]] as const) {
        expect(other, `${where}: ${name} box`).not.toBeNull();
        if (other === null) continue;
        const overlaps =
          art.x < other.x + other.width &&
          other.x < art.x + art.width &&
          art.y < other.y + other.height &&
          other.y < art.y + art.height;
        expect(overlaps, `${where}: art box intersects the ${name} box`).toBe(false);
      }
    });
  }

  for (const { width, height, w, h } of [
    { width: 390, height: 844, w: 256, h: 192 },
    { width: 768, height: 1024, w: 336, h: 252 },
    { width: 320, height: 568, w: 128, h: 96 },
    { width: 768, height: 600, w: 168, h: 128 },
  ]) {
    test(`hero art size below lg ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const art = await artBox(page);
      expect(
        Math.abs(art.width - w),
        `${width}x${height}: art width ${art.width}, expected ${w}`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(art.height - h),
        `${width}x${height}: art height ${art.height}, expected ${h}`,
      ).toBeLessThanOrEqual(1);
    });
  }

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    test(`hero art does not shift ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const where = `${width}x${height}`;
      const measure = async () => {
        await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
        const art = await artBox(page);
        const primary = await page.getByRole("button", { name: PRIMARY_NAME }).boundingBox();
        const line = await page.getByText("We find the subscriptions still feeding on you.").boundingBox();
        if (primary === null || line === null) throw new Error(`${where}: missing box`);
        return { art, primaryTop: primary.y, lineTop: line.y };
      };
      const before = await measure();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(
        () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
      );
      const after = await measure();
      expect(
        Math.abs(after.art.width - before.art.width),
        `${where}: art width ${before.art.width} -> ${after.art.width}`,
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(after.art.height - before.art.height),
        `${where}: art height ${before.art.height} -> ${after.art.height}`,
      ).toBeLessThanOrEqual(0.5);
      const lineMoved = after.lineTop - before.lineTop;
      expect(
        Math.abs(after.primaryTop - before.primaryTop - lineMoved),
        `${where}: Primary action top ${before.primaryTop} -> ${after.primaryTop}, Hero line moved ${lineMoved}`,
      ).toBeLessThanOrEqual(0.5);
    });
  }

  for (const { width, height, w, h } of [
    { width: 1280, height: 720, w: 352, h: 264 },
    { width: 1920, height: 1080, w: 416, h: 312 },
  ]) {
    test(`hero art unchanged at lg ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const where = `${width}x${height}`;
      const art = await artBox(page);
      const line = await page.getByText("We find the subscriptions still feeding on you.").boundingBox();
      expect(line, `${where}: Hero line box`).not.toBeNull();
      if (line === null) return;
      expect(Math.abs(art.width - w), `${where}: art width ${art.width}, expected ${w}`).toBeLessThanOrEqual(1);
      expect(Math.abs(art.height - h), `${where}: art height ${art.height}, expected ${h}`).toBeLessThanOrEqual(1);
      expect(art.x, `${where}: art left ${art.x} vs Hero line right ${line.x + line.width}`).toBeGreaterThanOrEqual(
        line.x + line.width,
      );
      expect(Math.abs(art.y - line.y), `${where}: art top ${art.y} vs Hero line top ${line.y}`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("hero art edges", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    test(`hero art has no hard edge ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const where = `${width}x${height}`;
      const art = page.locator("[data-hero-art]");
      // Hide every other layer of the page and make the backgrounds transparent for the shot.
      const style = await page.addStyleTag({
        content: `
          html, body, body * { background: transparent !important; background-image: none !important; }
          body *:not([data-hero-art]):not([data-hero-art] *) { visibility: hidden !important; }
          [data-hero-art], [data-hero-art] * { visibility: visible !important; }
        `,
      });
      const png = await art.screenshot({ omitBackground: true });
      await style.evaluate((el) => el.parentNode?.removeChild(el));
      // Decode in the page with createImageBitmap on a Blob: no network, no URL.
      const edges = await page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("no 2d context");
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const worst = { left: 0, right: 0, bottom: 0 };
        for (let y = 0; y < bitmap.height; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            const alpha = data[(y * bitmap.width + x) * 4 + 3] ?? 0;
            if (x < 2) worst.left = Math.max(worst.left, alpha);
            if (x >= bitmap.width - 2) worst.right = Math.max(worst.right, alpha);
            if (y >= bitmap.height - 2) worst.bottom = Math.max(worst.bottom, alpha);
          }
        }
        return { width: bitmap.width, height: bitmap.height, ...worst };
      }, png.toString("base64"));
      expect(edges.width, `${where}: screenshot width`).toBeGreaterThan(8);
      for (const side of ["left", "right", "bottom"] as const) {
        expect(
          edges[side],
          `${where}: highest alpha in the outer 2 px of the art's ${side} side is ${edges[side]}, expected 0`,
        ).toBe(0);
      }
    });
  }
});

test.describe("desktop banner gap", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    test(`tagline to Hero line gap ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const tagline = await page.getByText("Your bank statement is haunted.").boundingBox();
      const line = await page.getByText("We find the subscriptions still feeding on you.").boundingBox();
      expect(tagline, `${width}x${height}: tagline box`).not.toBeNull();
      expect(line, `${width}x${height}: Hero line box`).not.toBeNull();
      if (tagline === null || line === null) return;
      const gap = line.y - (tagline.y + tagline.height);
      expect(gap, `${width}x${height}: tagline bottom to Hero line top is ${gap}px`).toBeGreaterThanOrEqual(16);
      expect(gap, `${width}x${height}: tagline bottom to Hero line top is ${gap}px`).toBeLessThanOrEqual(24);
    });
  }

  for (const { width, height } of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    test(`hero grid unchanged at lg ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const where = `${width}x${height}`;
      const line = await page.getByText("We find the subscriptions still feeding on you.").boundingBox();
      const primary = page.getByRole("button", { name: PRIMARY_NAME });
      const wrapper = await primary.evaluate((el) => el.parentElement?.getBoundingClientRect().toJSON() ?? null);
      const primaryBox = await primary.boundingBox();
      const art = await page.locator("[data-hero-art]").boundingBox();
      expect(line, `${where}: Hero line box`).not.toBeNull();
      expect(wrapper, `${where}: action wrapper box`).not.toBeNull();
      expect(primaryBox, `${where}: Primary action box`).not.toBeNull();
      expect(art, `${where}: art box`).not.toBeNull();
      if (line === null || wrapper === null || primaryBox === null || art === null) return;
      expect(
        Math.abs(line.x - wrapper.x),
        `${where}: Hero line left ${line.x} vs action wrapper left ${wrapper.x}`,
      ).toBeLessThanOrEqual(1);
      expect(art.x, `${where}: art left ${art.x} vs Hero line right ${line.x + line.width}`).toBeGreaterThanOrEqual(
        line.x + line.width,
      );
      expect(Math.abs(art.y - line.y), `${where}: art top ${art.y} vs Hero line top ${line.y}`).toBeLessThanOrEqual(1);
      expect(
        primaryBox.y,
        `${where}: Primary action top ${primaryBox.y} vs Hero line bottom ${line.y + line.height}`,
      ).toBeGreaterThanOrEqual(line.y + line.height);
    });
  }
});

test.describe("ridge band", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    test(`ridge band scrolls with the page ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const where = `${width}x${height}`;
      const band = page.locator("[data-ridge-band]");
      await expect(band, `${where}: one ridge band`).toHaveCount(1);
      const top = () => band.evaluate((el) => el.getBoundingClientRect().top);
      const positions = await band.evaluate((el) => {
        const out: string[] = [];
        for (let node: Element | null = el; node !== null; node = node.parentElement) {
          out.push(getComputedStyle(node).position);
          if (node === document.body) break;
        }
        return out;
      });
      expect(positions, `${where}: band and ancestors up to body are not fixed`).not.toContain("fixed");
      const before = await top();
      const maxScroll = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      const distance = Math.min(300, maxScroll);
      expect(distance, `${where}: the page can scroll`).toBeGreaterThan(0);
      await page.evaluate((d) => window.scrollBy(0, d), distance);
      const scrolled = await page.evaluate(() => window.scrollY);
      const after = await top();
      expect(
        Math.abs(before - after - scrolled),
        `${where}: band top moved ${before - after}px, page scrolled ${scrolled}px`,
      ).toBeLessThanOrEqual(1);
    });
  }

  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    test(`ridge band clears the content ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const where = `${width}x${height}`;
      const pageBox = async (loc: ReturnType<Page["locator"]>, what: string) => {
        const box = await loc.first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x0: r.left + scrollX, y0: r.top + scrollY, x1: r.right + scrollX, y1: r.bottom + scrollY };
        });
        expect(box.y1 - box.y0, `${where}: ${what} has a box`).toBeGreaterThan(0);
        return box;
      };
      const band = await pageBox(page.locator("[data-ridge-band]"), "ridge band");
      const samples = await pageBox(
        page.getByRole("list", { name: "Other sample statements" }).locator(".."),
        "Other samples row",
      );
      const badge = await pageBox(
        page.getByRole("main").locator("p", { hasText: "Your statement never leaves your device." }),
        "Privacy badge",
      );
      const primary = await pageBox(page.getByRole("button", { name: PRIMARY_NAME }), "Primary action");
      const how = await pageBox(page.getByRole("heading", { name: "How it works" }), "How it works heading");
      for (const [name, box] of [
        ["Other samples row", samples],
        ["Privacy badge", badge],
        ["Primary action", primary],
      ] as const) {
        expect(
          band.y0,
          `${where}: band top ${band.y0} is below the ${name} bottom ${box.y1}`,
        ).toBeGreaterThanOrEqual(box.y1);
      }
      expect(band.y1, `${where}: band bottom ${band.y1} is above the heading top ${how.y0}`).toBeLessThanOrEqual(how.y0);
      for (const box of await collectContentBoxes(page)) {
        const hit = band.x0 < box.x1 && box.x0 < band.x1 && band.y0 < box.y1 && box.y0 < band.y1;
        expect(hit, `${where}: band hits ${box.kind} "${box.label}" ${at(box)}`).toBe(false);
      }
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      expect(widths.scroll, `${where}: scrollWidth ${widths.scroll} vs innerWidth ${widths.inner}`).toBeLessThanOrEqual(
        widths.inner,
      );
    });
  }

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`ridge band spacing ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openLanding(page, "empty");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const where = `${width}x${height}`;
      const band = page.locator("[data-ridge-band]");
      const above = await page.evaluate(() => {
        const bottomOf = (el: Element | null) => (el === null ? 0 : el.getBoundingClientRect().bottom + scrollY);
        const badge = Array.from(document.querySelectorAll("main p")).find((p) =>
          (p.textContent ?? "").includes("Your statement never leaves your device."),
        );
        const hero = document.querySelector("[data-hero-art]");
        const bandEl = document.querySelector("[data-ridge-band]");
        return {
          lowest: Math.max(bottomOf(badge ?? null), bottomOf(hero)),
          bandTop: bandEl === null ? 0 : bandEl.getBoundingClientRect().top + scrollY,
        };
      });
      await band.scrollIntoViewIfNeeded();
      // Hide every other layer and make the backgrounds transparent for the shot.
      const style = await page.addStyleTag({
        content: `
          html, body, body * { background: transparent !important; background-image: none !important; }
          body *:not([data-ridge-band]):not([data-ridge-band] *) { visibility: hidden !important; }
          [data-ridge-band], [data-ridge-band] * { visibility: visible !important; }
        `,
      });
      const png = await band.screenshot({ omitBackground: true });
      await style.evaluate((el) => el.parentNode?.removeChild(el));
      // Decode in the page with createImageBitmap on a Blob: no network, no URL.
      const firstRow = await page.evaluate(async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("no 2d context");
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        for (let y = 0; y < bitmap.height; y += 1) {
          for (let x = 0; x < bitmap.width; x += 1) {
            if ((data[(y * bitmap.width + x) * 4 + 3] ?? 0) > 0) return y;
          }
        }
        return -1;
      }, png.toString("base64"));
      expect(firstRow, `${where}: the ridge band draws something`).toBeGreaterThanOrEqual(0);
      const space = above.bandTop + firstRow - above.lowest;
      expect(
        space,
        `${where}: space from the Privacy badge / lowest Hero element (bottom ${above.lowest}) to the band's first drawn pixel (${above.bandTop + firstRow}) is ${space}px, expected 24 to 48`,
      ).toBeGreaterThanOrEqual(24);
      expect(space, `${where}: space above the ridge band is ${space}px, expected 24 to 48`).toBeLessThanOrEqual(48);
    });
  }

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    // Finding (task 13): the band's bottom fade ended in near-night, a hard edge against the
    // lighter sky behind the next section. Amended bug 9.3: it fades to transparent.
    test(`ridge band bottom blends into the sky ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openLanding(page, "empty");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const where = `${width}x${height}`;
      // Main and footer hidden so only the sky and the band are sampled (the band sits inside
      // main, so it is made visible again).
      await page.addStyleTag({
        content:
          "main, footer { visibility: hidden !important; } [data-ridge-band], [data-ridge-band] * { visibility: visible !important; }",
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      const bottom = await page.evaluate(() => {
        const el = document.querySelector("[data-ridge-band]");
        return el === null ? 0 : Math.round(el.getBoundingClientRect().bottom + scrollY);
      });
      expect(bottom, `${where}: the band must be on the page`).toBeGreaterThan(40);
      const shot = await page.screenshot({ fullPage: true });
      const first = bottom - 40;
      const rows = await columnPixels(page, shot, 20, first, bottom + 40);
      for (let i = 1; i < rows.length; i += 1) {
        for (let c = 0; c < 3; c += 1) {
          const step = Math.abs((rows[i]?.[c] ?? 0) - (rows[i - 1]?.[c] ?? 0));
          expect(
            step,
            `${where}: channel ${c} steps by ${step} between y ${first + i - 1} and ${first + i} at x 20 (band bottom ${bottom}), expected at most 4`,
          ).toBeLessThanOrEqual(4);
        }
      }
    });
  }

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    test(`results view has the ridge band in the flow and no fixed fence ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      await startUsSample(page);
      await expect(
        page.getByRole("heading", { level: 2, name: "Try another statement" }),
      ).toBeVisible();
      await settle(page);
      const where = `${width}x${height}`;
      await expect(page.locator("[data-ridge-band]"), `${where}: one ridge band`).toHaveCount(1);
      const m = await page.evaluate(() => {
        const band = document.querySelector<HTMLElement>("[data-ridge-band]");
        const footer = document.querySelector("footer");
        const fixed = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter(
          (el) => getComputedStyle(el).position === "fixed",
        );
        return {
          position: band === null ? null : getComputedStyle(band).position,
          beforeFooter:
            band !== null &&
            footer !== null &&
            (band.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          fixedFences: fixed.filter((el) => el.querySelector("svg path[d^='M16 6l']") !== null)
            .length,
        };
      });
      expect(m.position, `${where}: ridge band position`).not.toBeNull();
      expect(m.position, `${where}: ridge band is not fixed`).not.toBe("fixed");
      expect(m.beforeFooter, `${where}: ridge band before the footer`).toBe(true);
      expect(m.fixedFences, `${where}: fixed elements containing the fence`).toBe(0);
    });
  }
});

test.describe("no ground line on the landing", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`no ground line on the landing ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      await page.evaluate(() => document.fonts.ready);
      const where = `${width}x${height}`;
      // Resolve --ground-h on the NightScene root through a probe element.
      const geometry = await page.evaluate(() => {
        const root = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
          (el) => el.style.getPropertyValue("--ground-h") !== "",
        );
        if (root === undefined) throw new Error("NightScene root not found");
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:absolute;visibility:hidden;width:1px;height:var(--ground-h)";
        root.appendChild(probe);
        const groundHeight = probe.getBoundingClientRect().height;
        probe.remove();
        return { groundHeight, inner: window.innerHeight };
      });
      const lineY = Math.round(geometry.inner - geometry.groundHeight);
      for (const scrollY of [0, 300]) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await page.evaluate(
          () =>
            new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            ),
        );
        const png = await page.screenshot();
        // Decode in the page with createImageBitmap on a Blob: no network, no URL.
        const rows = await page.evaluate(
          async ({ base64, from, to }) => {
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d");
            if (context === null) throw new Error("no 2d context");
            context.drawImage(bitmap, 0, 0);
            const median = (values: number[]) => {
              const sorted = [...values].sort((a, b) => a - b);
              return sorted[Math.floor(sorted.length / 2)] ?? 0;
            };
            const scale = bitmap.height / window.innerHeight;
            const out: number[][] = [];
            for (let y = from; y <= to; y += 1) {
              const row = Math.min(bitmap.height - 1, Math.round(y * scale));
              const { data } = context.getImageData(0, row, bitmap.width, 1);
              const channels: number[][] = [[], [], []];
              for (let x = 0; x < bitmap.width; x += 1) {
                for (let c = 0; c < 3; c += 1) channels[c]?.push(data[x * 4 + c] ?? 0);
              }
              out.push(channels.map(median));
            }
            return out;
          },
          { base64: png.toString("base64"), from: lineY - 4, to: lineY + 5 },
        );
        for (let i = 0; i < rows.length - 1; i += 1) {
          const a = rows[i] ?? [];
          const b = rows[i + 1] ?? [];
          for (let c = 0; c < 3; c += 1) {
            const diff = Math.abs((a[c] ?? 0) - (b[c] ?? 0));
            expect(
              diff,
              `${where} scrolled ${scrollY}: median channel ${c} of row ${lineY - 4 + i} vs the next differs by ${diff}, expected at most 3 (old Ground line at y ${lineY})`,
            ).toBeLessThanOrEqual(3);
          }
        }
      }
    });
  }
});

/** Median RGB per row for rows `from`..`to` (CSS px) of a PNG, decoded in the page with no network. */
async function rowMedians(page: Page, png: Buffer, from: number, to: number): Promise<number[][]> {
  return page.evaluate(
    async ({ base64, first, last }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no 2d context");
      context.drawImage(bitmap, 0, 0);
      const median = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
      };
      const scale = bitmap.width / window.innerWidth;
      const out: number[][] = [];
      for (let y = first; y <= last; y += 1) {
        const row = Math.min(bitmap.height - 1, Math.round(y * scale));
        const { data } = context.getImageData(0, row, bitmap.width, 1);
        const channels: number[][] = [[], [], []];
        for (let x = 0; x < bitmap.width; x += 1) {
          for (let c = 0; c < 3; c += 1) channels[c]?.push(data[x * 4 + c] ?? 0);
        }
        out.push(channels.map(median));
      }
      return out;
    },
    { base64: png.toString("base64"), first: from, last: to },
  );
}

function meanRows(rows: number[][]): number[] {
  return [0, 1, 2].map((c) => rows.reduce((sum, row) => sum + (row[c] ?? 0), 0) / rows.length);
}

/** One pixel per row at CSS x, for CSS rows `from` to `to` of a viewport screenshot. */
async function columnPixels(
  page: Page,
  png: Buffer,
  x: number,
  from: number,
  to: number,
): Promise<number[][]> {
  return page.evaluate(
    async ({ base64, col, first, last }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no 2d context");
      context.drawImage(bitmap, 0, 0);
      const scale = bitmap.width / window.innerWidth;
      const out: number[][] = [];
      for (let y = first; y <= last; y += 1) {
        const row = Math.min(bitmap.height - 1, Math.round(y * scale));
        const { data } = context.getImageData(Math.round(col * scale), row, 1, 1);
        out.push([data[0] ?? 0, data[1] ?? 0, data[2] ?? 0]);
      }
      return out;
    },
    { base64: png.toString("base64"), col: x, first: from, last: to },
  );
}

test.describe("sky blends into the page", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    test(`sky blends into the page ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      await page.evaluate(() => document.fonts.ready);
      const where = `${width}x${height}`;
      const metrics = await page.evaluate(() => ({
        inner: window.innerHeight,
        total: document.documentElement.scrollHeight,
      }));
      expect(metrics.total, `${where}: the page must be taller than the viewport`).toBeGreaterThan(
        metrics.inner + 8,
      );
      const full = await page.screenshot({ fullPage: true });
      const above = meanRows(await rowMedians(page, full, metrics.inner - 4, metrics.inner - 1));
      const below = meanRows(await rowMedians(page, full, metrics.inner, metrics.inner + 3));
      for (let c = 0; c < 3; c += 1) {
        const diff = Math.abs((above[c] ?? 0) - (below[c] ?? 0));
        expect(
          diff,
          `${where} full page: mean channel ${c} of the 4 rows above y ${metrics.inner} vs the 4 rows below differs by ${diff.toFixed(1)}, expected at most 4`,
        ).toBeLessThanOrEqual(4);
      }
      // Scrolled to half the page, the viewport bottom must not show an edge either.
      await page.evaluate(() =>
        window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) / 2),
      );
      await page.evaluate(
        () =>
          new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          ),
      );
      const half = await page.screenshot();
      const bottom = await rowMedians(page, half, metrics.inner - 4, metrics.inner - 1);
      const inside = await rowMedians(page, half, metrics.inner - 8, metrics.inner - 5);
      const median = (rows: number[][], c: number) => {
        const sorted = rows.map((row) => row[c] ?? 0).sort((a, b) => a - b);
        return ((sorted[1] ?? 0) + (sorted[2] ?? 0)) / 2;
      };
      for (let c = 0; c < 3; c += 1) {
        const diff = Math.abs(median(bottom, c) - median(inside, c));
        expect(
          diff,
          `${where} scrolled to 50 %: median channel ${c} of the bottom 4 rows vs rows ${metrics.inner - 8} to ${metrics.inner - 5} differs by ${diff}, expected at most 4`,
        ).toBeLessThanOrEqual(4);
      }
      // No step between adjacent rows across the lowest fifth of the viewport (finding 9.2: a
      // clamped gradient stop made a hard edge at 88 % that the rows at innerHeight never showed).
      // The page content (the Privacy badge sits at x 20 on phones) and the RidgeBand (hills and
      // fence, scenery that bug 9 leaves alone) are hidden for this check, so that only the
      // fixed sky is sampled.
      await page.addStyleTag({
        content: "main, footer, [data-ridge-band] { visibility: hidden !important; }",
      });
      const first = Math.round(metrics.inner * 0.8);
      for (const scrollY of [0, 300]) {
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await page.evaluate(
          () =>
            new Promise<void>((done) =>
              requestAnimationFrame(() => requestAnimationFrame(() => done())),
            ),
        );
        const shot = await page.screenshot();
        const rows = await columnPixels(page, shot, 20, first, metrics.inner - 1);
        for (let i = 1; i < rows.length; i += 1) {
          for (let c = 0; c < 3; c += 1) {
            const step = Math.abs((rows[i]?.[c] ?? 0) - (rows[i - 1]?.[c] ?? 0));
            expect(
              step,
              `${where} scrolled ${scrollY}: channel ${c} steps by ${step} between y ${first + i - 1} and ${first + i} at x 20, expected at most 4`,
            ).toBeLessThanOrEqual(4);
          }
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Motion-related layout tests (design "Tests (Req 13.5, 13.6)").
// ---------------------------------------------------------------------------------------------

test("moon at rest without reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
  expect(
    await page.evaluate(() => document.getAnimations().length),
    "automatic motion is running at load",
  ).toBeGreaterThan(0);
  // No fixed wait: every animation on the Landing view is finite, so `finished` is the end state.
  await expect
    .poll(
      () => page.evaluate(() => document.getAnimations().every((a) => a.playState === "finished")),
      { timeout: 5500 },
    )
    .toBe(true);
  await settle(page);
  await checkLandingMoon(page, 1280, 720, "at rest");
});

/** The line fragments of every text node inside the `h1`, in document coordinates. */
async function h1GlyphRects(page: Page): Promise<DocRect[]> {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (h1 === null) throw new Error("no h1");
    const out: DocRect[] = [];
    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if ((node.textContent ?? "").trim() === "") continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width <= 0 || r.height <= 0) continue;
        out.push({
          x0: r.left + window.scrollX,
          y0: r.top + window.scrollY,
          x1: r.right + window.scrollX,
          y1: r.bottom + window.scrollY,
          kind: "text",
          label: "h1",
        });
      }
    }
    return out;
  });
}

test.describe("title glow clearance", () => {
  test.describe.configure({ mode: "parallel" });

  for (const { width, height } of LANDING_VIEWPORTS) {
    test(`text stays 10 px from the h1 glyphs at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openLanding(page, "empty");
      const glyphs = await h1GlyphRects(page);
      expect(glyphs.length, "h1 has text").toBeGreaterThan(0);
      const sameRect = (a: DocRect, b: DocRect) =>
        Math.abs(a.x0 - b.x0) < 0.5 &&
        Math.abs(a.x1 - b.x1) < 0.5 &&
        Math.abs(a.y0 - b.y0) < 0.5 &&
        Math.abs(a.y1 - b.y1) < 0.5;
      // The h1's own line fragments are the glyph rectangles; every other text box is checked.
      const others = (await collectContentBoxes(page)).filter(
        (box) => box.kind === "text" && !glyphs.some((glyph) => sameRect(box, glyph)),
      );
      expect(others.length, "text outside the h1").toBeGreaterThan(0);
      for (const text of others) {
        for (const glyph of glyphs) {
          expect(
            rectGap(text, glyph),
            `${width}x${height}: text "${text.label}" ${at(text)} is within 10 px of an h1 glyph`,
          ).toBeGreaterThanOrEqual(10);
        }
      }
    });
  }
});
