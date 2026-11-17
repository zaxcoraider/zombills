import { expect, test, type Page } from "@playwright/test";

// Motion browser tests (landing-polish design, "Tests (Req 13.5, 13.6)"). jsdom does not apply
// imported CSS, so timing, reduced motion and end states are read here, from computed style, in
// Chromium. No screenshot baseline is committed.

const PRIMARY_NAME = "Summon the undead with a sample US bank statement";
const MAX_END_MS = 5000;

test.use({ viewport: { width: 1280, height: 720 } });

/** Fails on `infinite` or delay + duration × count above 5 s, for every element's CSS animations. */
async function cssAnimationProblems(page: Page): Promise<string[]> {
  return page.evaluate((maxEndMs) => {
    const toMs = (value: string): number => {
      const v = value.trim();
      return v.endsWith("ms") ? Number.parseFloat(v) : Number.parseFloat(v) * 1000;
    };
    const split = (value: string): string[] => value.split(",").map((part) => part.trim());
    const problems: string[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const style = getComputedStyle(el);
      const names = split(style.animationName);
      if (names.length === 1 && names[0] === "none") continue;
      const durations = split(style.animationDuration);
      const delays = split(style.animationDelay);
      const counts = split(style.animationIterationCount);
      names.forEach((name, i) => {
        if (name === "none") return;
        const duration = toMs(durations[i % durations.length] ?? "0s");
        const delay = toMs(delays[i % delays.length] ?? "0s");
        const countText = counts[i % counts.length] ?? "1";
        const where = `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""} ${name}`;
        if (countText === "infinite") {
          problems.push(`${where}: infinite`);
          return;
        }
        const end = delay + duration * Number.parseFloat(countText);
        if (!(end <= maxEndMs)) problems.push(`${where}: ends at ${end} ms`);
      });
    }
    return problems;
  }, MAX_END_MS);
}

/** Every running animation (CSS or Web Animations API) has a finite end time within 5 s. */
async function animationProblems(page: Page): Promise<string[]> {
  return page.evaluate((maxEndMs) => {
    return document.getAnimations().flatMap((animation) => {
      const end = animation.effect?.getComputedTiming().endTime;
      const name = animation instanceof CSSAnimation ? animation.animationName : animation.id;
      if (typeof end !== "number" || !Number.isFinite(end)) return [`${name}: endTime ${String(end)}`];
      return end <= maxEndMs ? [] : [`${name}: ends at ${end} ms`];
    });
  }, MAX_END_MS);
}

function fogTransforms(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-backdrop-fog]")).map(
      (el) => getComputedStyle(el).transform,
    ),
  );
}

/** Moves focus to the Primary action with the keyboard, so `:focus-visible` matches. */
async function tabToPrimary(page: Page): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press("Tab");
    const onPrimary = await page.evaluate(() =>
      document.activeElement?.classList.contains("zb-primary"),
    );
    if (onPrimary === true) return;
  }
  throw new Error("Tab never reached the Primary action");
}

async function checkFiniteAndWithin5s(page: Page, when: string): Promise<void> {
  expect(await cssAnimationProblems(page), `${when}: computed animation lists`).toEqual([]);
  expect(await animationProblems(page), `${when}: document.getAnimations()`).toEqual([]);
  const first = await fogTransforms(page);
  expect(first.length, `${when}: backdrop fog bands`).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  expect(await fogTransforms(page), `${when}: backdrop fog does not drift`).toEqual(first);
}

test("finite and within 5 s", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await checkFiniteAndWithin5s(page, "at load");
  const animating = await page.evaluate(() => document.getAnimations().length);
  expect(animating, "Phase B animations exist at load").toBeGreaterThan(0);

  const primary = page.getByRole("button", { name: PRIMARY_NAME });
  await primary.hover();
  await checkFiniteAndWithin5s(page, "hovered");
});

test("finite and within 5 s with the Primary action focused", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
  await tabToPrimary(page);
  await checkFiniteAndWithin5s(page, "focused");
});

test("reduced motion shows the still state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const primary = page.getByRole("button", { name: PRIMARY_NAME });
  await expect(primary).toBeVisible();

  const cssAnimations = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation || a instanceof CSSTransition)
        .map((a) => (a instanceof CSSAnimation ? a.animationName : (a as CSSTransition).transitionProperty)),
    );
  const style = (selector: string, property: string) =>
    page.evaluate(
      ([sel, prop]) => {
        const el = document.querySelector(sel as string);
        if (el === null) throw new Error(`no element ${String(sel)}`);
        return getComputedStyle(el).getPropertyValue(prop as string);
      },
      [selector, property] as const,
    );

  expect(await cssAnimations(), "at load").toEqual([]);
  expect(await style(".zb-ghost-rise", "transform")).toBe("none");
  expect(await style(".zb-ghost-lean", "transform")).toBe("none");
  expect(await style(".zb-bat", "opacity")).toBe("0");
  const restShadow = await style(".zb-primary", "box-shadow");

  await primary.hover();
  expect(await cssAnimations(), "on hover").toEqual([]);
  expect(await style(".zb-ghost-lean", "transform"), "no lean on hover").toBe("none");
  const hoverShadow = await style(".zb-primary", "box-shadow");
  expect(hoverShadow, "the candle glow is present on hover").not.toBe("none");
  expect(hoverShadow).not.toBe(restShadow);
  expect(hoverShadow).toContain("14px 4px");

  await page.mouse.move(0, 0);
  await tabToPrimary(page);
  expect(await cssAnimations(), "on focus").toEqual([]);
  expect(await style(".zb-ghost-lean", "transform"), "no lean on focus").toBe("none");
  expect(await style(".zb-primary", "box-shadow"), "the candle glow is present on focus").toContain(
    "14px 4px",
  );
});

const EFFECT_SELECTORS = [
  ".zb-ghost-rise",
  ".zb-ghost-lean",
  ".zb-hero-glow",
  ".zb-fog-a",
  ".zb-fog-b",
  "h1.zb-title",
  ".zb-bat",
  ".zb-bat-wings",
  ".zb-primary",
] as const;

type EffectStyles = Record<string, Record<string, string>>;

/** Reads computed transform, opacity, text-shadow and box-shadow of every effect element. */
function readEffects(page: Page, prepare: "none" | "start"): Promise<EffectStyles> {
  return page.evaluate(
    ([selectors, mode]) => {
      if (mode === "start") {
        for (const animation of document.getAnimations()) {
          if (animation instanceof CSSAnimation) {
            animation.pause();
            animation.currentTime = 0;
          }
        }
      }
      const out: Record<string, Record<string, string>> = {};
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el === null) throw new Error(`no element ${selector}`);
        const style = getComputedStyle(el);
        out[selector] = {
          transform: style.transform,
          opacity: style.opacity,
          textShadow: style.textShadow,
          boxShadow: style.boxShadow,
        };
      }
      return out;
    },
    [EFFECT_SELECTORS, prepare] as const,
  );
}

test("end state equals still state", async ({ page, browser }) => {
  // Still: a load with reduced motion.
  const stillContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  });
  const stillPage = await stillContext.newPage();
  await stillPage.goto("/");
  await expect(stillPage.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
  await stillPage.evaluate(() => document.fonts.ready);
  const still = await readEffects(stillPage, "none");
  await stillContext.close();

  // End: a load without it, after every animation has finished.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().every((a) => a.playState === "finished")), {
      timeout: 5500,
    })
    .toBe(true);
  expect(await readEffects(page, "none"), "end state equals still state").toEqual(still);

  // Start: a load without reduced motion, every CSSAnimation paused at time 0.
  await page.goto("/");
  await expect(page.getByRole("button", { name: PRIMARY_NAME })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const start = await readEffects(page, "start");
  expect(start[".zb-ghost-rise"]?.transform).toBe("matrix(1, 0, 0, 1, 0, 44)");
  expect(start[".zb-bat"]?.opacity).toBe("1");
  expect(start[".zb-hero-glow"]?.opacity).toBe("0");
  expect(start[".zb-ghost-rise"]?.transform).not.toBe(still[".zb-ghost-rise"]?.transform);
  expect(start[".zb-bat"]?.opacity).not.toBe(still[".zb-bat"]?.opacity);
  expect(start[".zb-hero-glow"]?.opacity).not.toBe(still[".zb-hero-glow"]?.opacity);
});
