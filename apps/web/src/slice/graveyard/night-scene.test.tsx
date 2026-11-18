// @vitest-environment jsdom
import { MotionGlobalConfig } from "framer-motion";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { NightScene } from "./night-scene";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

function renderScene(
  fogCleared: boolean,
  reduceMotion = false,
  landing = false,
  skyMoon = !landing,
) {
  return render(
    <NightScene
      fogCleared={fogCleared}
      reduceMotion={reduceMotion}
      landing={landing}
      skyMoon={skyMoon}
    >
      <p>page content</p>
    </NightScene>,
  );
}

/** The tile row of each fog band, in order: back band, low band, foreground band. */
function fogTileStyles(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-backdrop-fog]")).map(
    (band) => band.querySelector<HTMLElement>("[data-fog-tiles]")?.getAttribute("style") ?? null,
  );
}

const STILL_POSE = [
  "fill: var(--bone); transform: translateX(0%);",
  "fill: var(--bone); transform: translateX(-50%);",
  "fill: var(--bone); transform: translateX(0%);",
];

/** Elements whose inline opacity is exactly the given fog target. */
function withOpacity(container: HTMLElement, value: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("div")).filter(
    (el) => el.style.opacity === value,
  );
}

describe("NightScene", () => {
  it("renders its children", () => {
    const { getByText } = renderScene(false);
    expect(getByText("page content")).toBeTruthy();
  });

  it("hides every svg and decorative layer from assistive technology", () => {
    const { container } = renderScene(false);
    const svgs = Array.from(container.querySelectorAll("svg"));
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    const layers = Array.from(container.querySelectorAll<HTMLElement>(".fixed"));
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.getAttribute("aria-hidden")).toBe("true");
      expect(layer.className).toContain("pointer-events-none");
    }
  });

  it("has no img element", () => {
    const { container } = renderScene(true);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("switches the fog opacity target with fogCleared", async () => {
    const thick = renderScene(false);
    await waitFor(() => expect(withOpacity(thick.container, "1").length).toBeGreaterThan(0));
    expect(withOpacity(thick.container, "0.45")).toHaveLength(0);
    thick.unmount();

    const thin = renderScene(true);
    await waitFor(() => expect(withOpacity(thin.container, "0.45").length).toBeGreaterThan(0));
    expect(withOpacity(thin.container, "1")).toHaveLength(0);
  });

  it("draws exactly one moon disc when skyMoon is true", () => {
    const { container } = renderScene(false, false, false, true);
    expect(container.querySelectorAll("[data-moon-disc]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-moon-halo]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-moon-glow]")).toHaveLength(1);
  });

  it("draws no moon when skyMoon is false", () => {
    const { container } = renderScene(false, false, true, false);
    expect(container.querySelectorAll("[data-moon-disc]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-moon-halo]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-moon-glow]")).toHaveLength(0);
  });

  it.each([true, false])(
    "holds the fog in its still pose on every view (landing %s)",
    async (landing) => {
      // Real animation clock here, so a drift would show as a changed style after the wait. Every
      // view and both motion settings must give the one STILL_POSE (it replaces the drift control).
      MotionGlobalConfig.skipAnimations = false;
      onTestFinished(() => {
        MotionGlobalConfig.skipAnimations = true;
      });
      const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

      const reduced = renderScene(false, true, landing, !landing);
      await settle();
      const reducedStyles = fogTileStyles(reduced.container);
      expect(reducedStyles).toEqual(STILL_POSE);
      reduced.unmount();

      const full = renderScene(false, false, landing, !landing);
      expect(fogTileStyles(full.container)).toEqual(STILL_POSE);
      await settle();
      expect(fogTileStyles(full.container)).toEqual(STILL_POSE);
    },
  );

  it("draws no fixed fence, ridge or Ground with landing false", () => {
    const { container } = renderScene(false, false, false, true);
    const fixed = Array.from(container.querySelectorAll<HTMLElement>(".fixed"));
    expect(fixed).toHaveLength(3);
    for (const layer of fixed) {
      // Hills draw on a 1600 × 200 view box; the Fence and the grass tufts fill with patterns.
      expect(layer.querySelector('svg[viewBox="0 0 1600 200"]')).toBeNull();
      expect(layer.querySelector("pattern")).toBeNull();
      const heights = Array.from(layer.querySelectorAll<HTMLElement>("div")).map(
        (el) => el.style.height,
      );
      expect(heights).not.toContain("var(--ground-h)");
    }
    // Stars, the sky moon, and three fog bands of one filter svg and two tiles each.
    const count = fixed.reduce((n, layer) => n + layer.querySelectorAll("svg").length, 0);
    expect(count).toBe(11);
    expect(container.querySelector("[data-ridge-band]")).toBeNull();
  });
});
