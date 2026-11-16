import { expect, test, type Locator, type Page } from "@playwright/test";

// Layout checks that jsdom cannot make: they need real boxes, so they run in Chromium.

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1000, height: 900 },
] as const;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("element has no box");
  return box;
}

/** Whole of `inner` lies inside `outer` (a sub-pixel of rounding is allowed). */
function inside(inner: Box, outer: Box): boolean {
  const tolerance = 0.5;
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// An undead card sways for ever, so Playwright's "stable" check never passes on its buttons.
// Answer buttons are focused and pressed with Enter, as a keyboard user would.
async function answer(page: Page, name: string): Promise<void> {
  const button = page.getByRole("button", { name });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
}

async function viewportBox(page: Page): Promise<Box> {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return { x: 0, y: 0, width: size.width, height: size.height };
}

/**
 * Waits for the card to finish rising and the page to finish scrolling to it, then samples
 * the card over a few sway cycles: the whole card stays inside the stage and the viewport.
 */
async function expectCardWhole(page: Page, name: string): Promise<void> {
  const card = page.getByRole("region", { name });
  const stage = page.locator("[data-burial-stage]");
  const viewport = await viewportBox(page);
  await expect
    .poll(
      async () => {
        const cardBox = await boxOf(card);
        return inside(cardBox, await boxOf(stage)) && inside(cardBox, viewport);
      },
      { timeout: 10_000, message: `${name}: card inside the stage and the viewport` },
    )
    .toBe(true);
  for (let sample = 0; sample < 8; sample += 1) {
    await page.waitForTimeout(350);
    const cardBox = await boxOf(card);
    expect(inside(cardBox, await boxOf(stage)), `${name}: inside the stage`).toBe(true);
    expect(inside(cardBox, viewport), `${name}: inside the viewport`).toBe(true);
  }
  // The top row (label chip and cadence) and the heading are not clipped either.
  await expect(card.getByRole("heading", { name })).toBeInViewport({ ratio: 1 });
  await expect(card.getByText(/^(Monthly|Yearly|Weekly)$/i)).toBeInViewport({ ratio: 1 });
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("each card is whole inside the stage and the viewport, also after Next and Skip", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "US bank, signed amounts" }).click();

      // The first card, then Skip for now: the next card in the queue rises whole too.
      await expectCardWhole(page, "Adobe Creative Cloud");
      await answer(page, "Skip for now");
      await expectCardWhole(page, "Riverside Gym Membership");

      // Keep it, then Next brings the card after it.
      await answer(page, "Yes, let it rest");
      await page.getByRole("button", { name: "Next" }).click();
      await expectCardWhole(page, "Netflix");

      // Netflix is the tallest card: its price-rise line is fully visible.
      const netflix = page.getByRole("region", { name: "Netflix" });
      const priceLine = netflix.getByText(/Price went up/);
      await expect(priceLine).toBeVisible();
      await expect(priceLine).toBeInViewport({ ratio: 1 });
      expect(inside(await boxOf(priceLine), await boxOf(netflix))).toBe(true);
      expect(inside(await boxOf(priceLine), await boxOf(page.locator("[data-burial-stage]")))).toBe(
        true,
      );
    });

    test("small tombstones hold their text and leave Unbury clear", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "US bank, signed amounts" }).click();

      // Bury all four cards, whatever order they come in.
      for (let card = 0; card < 4; card += 1) {
        const heading = page.locator("[data-burial-stage] section h3");
        await expect(heading).toBeVisible();
        const name = (await heading.innerText()).trim();
        await answer(page, "No, bury it");
        await expect(page.getByRole("region", { name: `Here lies ${name}.` })).toBeVisible();
        const next = page.getByRole("button", { name: /^(Next|Visit the graveyard)$/ });
        await expect(next).toBeVisible();
        await next.click();
      }

      await expect(page.getByRole("heading", { name: "Your graveyard" })).toBeVisible();
      const stones = page
        .locator("main ul > li")
        .filter({ has: page.getByRole("button", { name: /^Unbury / }) });
      await expect(stones).toHaveCount(4);

      for (let index = 0; index < 4; index += 1) {
        const item = stones.nth(index);
        const stone = item.getByRole("region", { name: /^Here lies / });
        await stone.scrollIntoViewIfNeeded();
        const stoneBox = await boxOf(stone);
        const unbury = await boxOf(item.getByRole("button", { name: /^Unbury / }));
        // Unbury sits below the stone, with its own spacing.
        expect(unbury.y).toBeGreaterThanOrEqual(stoneBox.y + stoneBox.height + 8);

        const texts = stone.locator("p, span");
        const count = await texts.count();
        expect(count).toBeGreaterThan(0);
        for (let t = 0; t < count; t += 1) {
          const text = texts.nth(t);
          const label = (await text.innerText()).trim().replace(/\s+/g, " ");
          if (label === "") continue;
          const box = await boxOf(text);
          expect(inside(box, stoneBox), `"${label}" inside the stone`).toBe(true);
          expect(overlaps(box, unbury), `"${label}" clear of Unbury`).toBe(false);
        }
      }
    });
  });
}

// The cancel Helper panel (cancel-helper Req 7.2, 8.6, 10.5). Neither test clicks a cancel link,
// an App-store link or the mailto link.

const PANEL_NAME = "Seal the grave: Netflix";
const MIN_TARGET = 44;

/** Keeps the cards that come before Netflix, then buries Netflix and leaves its tombstone shown. */
async function buryNetflix(page: Page, fontSize: string | null = null): Promise<void> {
  await page.goto("/");
  if (fontSize !== null) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, fontSize);
  }
  await page.getByRole("button", { name: "US bank, signed amounts" }).click();
  for (let card = 0; card < 4; card += 1) {
    const heading = page.locator("[data-burial-stage] section h3");
    await expect(heading).toBeVisible();
    const name = (await heading.innerText()).trim();
    if (name === "Netflix") {
      await answer(page, "No, bury it");
      return;
    }
    await answer(page, "Yes, let it rest");
    await page.getByRole("button", { name: "Next" }).click();
  }
  throw new Error("Netflix did not come up in the queue");
}

const PANEL_CASES = [
  { label: "320x568", width: 320, height: 568, fontSize: null },
  { label: "390x844", width: 390, height: 844, fontSize: null },
  { label: "390x844 with 200% text", width: 390, height: 844, fontSize: "200%" },
] as const;

for (const panelCase of PANEL_CASES) {
  test(`Helper panel fits and clears the stone and mound at ${panelCase.label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: panelCase.width, height: panelCase.height });
    await buryNetflix(page, panelCase.fontSize);

    const panel = page.getByRole("region", { name: PANEL_NAME });
    await expect(panel).toBeVisible();

    // Let the tombstone and the panel finish their entrance before measuring.
    const stone = page.getByRole("region", { name: "Here lies Netflix." });
    await expect(stone).toBeVisible();
    await page.waitForTimeout(1500);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

    const controls = panel.locator("a[href], button");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const label = (await control.innerText()).trim().replace(/\s+/g, " ");
      const box = await boxOf(control);
      expect(box.width, `"${label}" is at least ${MIN_TARGET} px wide`).toBeGreaterThanOrEqual(
        MIN_TARGET,
      );
      expect(box.height, `"${label}" is at least ${MIN_TARGET} px high`).toBeGreaterThanOrEqual(
        MIN_TARGET,
      );
    }

    // The mound lives in the stage's clipped box with the ground, so that box covers it.
    const stageArt = page.locator("[data-burial-stage] > div").first();
    const panelBox = await boxOf(panel);
    expect(overlaps(panelBox, await boxOf(stone)), "panel clear of the stone").toBe(false);
    expect(overlaps(panelBox, await boxOf(stageArt)), "panel clear of the ground and mound").toBe(
      false,
    );
  });
}

test("the Graveyard view's open Helper panel is wide and inside the viewport at 1000x900", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await buryNetflix(page);
  await expect(page.getByRole("region", { name: PANEL_NAME })).toBeVisible();
  await page.getByRole("button", { name: "Open the graveyard" }).click();
  await expect(page.getByRole("heading", { name: "Your graveyard" })).toBeVisible();

  const toggle = page.getByRole("button", { name: "How to cancel Netflix" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: PANEL_NAME });
  await expect(panel).toBeVisible();
  await page.waitForTimeout(500);

  const box = await boxOf(panel);
  expect(box.width).toBeGreaterThanOrEqual(480);
  expect(box.x).toBeGreaterThanOrEqual(0);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  expect(box.x + box.width).toBeLessThanOrEqual(innerWidth);
});
