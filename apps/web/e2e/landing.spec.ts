import { expect, test, type Page } from "@playwright/test";
import {
  circleHitsRect,
  collectContentBoxes,
  distanceToRect,
  inViewport,
  moonGeometry,
} from "./content-boxes";

// Moon layout test, Non-landing part (landing-polish design, "Non-landing checks"). The Landing
// checks join this file when the Landing view exists. Boxes are real, so this runs in Chromium.

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
      await page.getByRole("button", { name: "UK bank, debit and credit columns" }).click();
      await expect(
        page.getByRole("main").getByText("Reading UK bank, debit and credit columns…"),
      ).toBeVisible();
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
