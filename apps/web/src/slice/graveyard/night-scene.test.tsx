// @vitest-environment jsdom
import { MotionGlobalConfig } from "framer-motion";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NightScene } from "./night-scene";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(cleanup);

function renderScene(fogCleared: boolean, reduceMotion = false) {
  return render(
    <NightScene fogCleared={fogCleared} reduceMotion={reduceMotion}>
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
});
