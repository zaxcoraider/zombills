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

function renderScene(fogCleared: boolean, reduceMotion = false, landing = false) {
  return render(
    <NightScene fogCleared={fogCleared} reduceMotion={reduceMotion} landing={landing}>
      <p>page content</p>
    </NightScene>,
  );
}

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

  it("draws exactly one moon disc when landing is false", () => {
    const { container } = renderScene(false, false, false);
    expect(container.querySelectorAll("[data-moon-disc]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-moon-halo]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-moon-glow]")).toHaveLength(1);
  });

  it("draws no moon when landing is true", () => {
    const { container } = renderScene(false, false, true);
    expect(container.querySelectorAll("[data-moon-disc]")).toHaveLength(0);
  });

  it("holds the fog in its still pose when landing, as reduced motion does", async () => {
    // Real animation clock here: with skipAnimations the drift jumps to its end pose at once.
    MotionGlobalConfig.skipAnimations = false;
    onTestFinished(() => {
      MotionGlobalConfig.skipAnimations = true;
    });
    const styles = (container: HTMLElement) =>
      Array.from(container.querySelectorAll<HTMLElement>("[data-backdrop-fog]")).map((band) =>
        band.querySelector<HTMLElement>("[style*='will-change']")?.getAttribute("style"),
      );
    const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

    const still = renderScene(false, true, false);
    await settle();
    const stillStyles = styles(still.container);
    expect(stillStyles).toHaveLength(3);
    still.unmount();

    // Control: with neither flag the bands drift, so their style leaves the still pose.
    const moving = renderScene(false, false, false);
    await settle();
    expect(styles(moving.container)).not.toEqual(stillStyles);
    moving.unmount();

    const landing = renderScene(false, false, true);
    await settle();
    expect(styles(landing.container)).toEqual(stillStyles);
  });
});
