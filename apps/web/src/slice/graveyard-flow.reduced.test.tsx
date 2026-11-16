// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { COPY_LABEL_FADE, helperPanelMotion, helperPanelVariants } from "./graveyard/motion";
import { formatMoney } from "./logic/money";

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => true };
});

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  window.location.hash = "";
});

afterEach(cleanup);

describe("graveyard flow: reduced motion", () => {
  it("buries without the condemned step and lands focus on the tombstone", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "US bank, signed amounts" }));
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    screen.getByRole("heading", { level: 3, name: "Netflix" });

    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));

    // No sink crumbs and no condemned wait: the burial runs straight on to the tombstone.
    const tombstone = await screen.findByRole("region", { name: "Here lies Netflix." });
    expect(tombstone.textContent).toContain("Fed on you every month.");
    expect(tombstone.textContent).toContain(`Saves${formatMoney(21588, "USD")}/year.`);
    await waitFor(() => expect(document.activeElement).toBe(tombstone));
    expect(screen.getByRole("status").textContent).toBe(
      `Netflix is buried. Saves ${formatMoney(21588, "USD")} a year. ` +
        `Saved per year: ${formatMoney(21588, "USD")}. ` +
        `Still draining ${formatMoney(113976, "USD")} a year.`,
    );
  });

  it("uses only a short opacity fade for the Helper panel and the disclosure", () => {
    const entrance = helperPanelMotion(true);
    expect(entrance.initial).toEqual({ opacity: 0 });
    expect(entrance.animate).toEqual({ opacity: 1 });
    expect(entrance.transition?.duration).toBeLessThanOrEqual(0.15);

    const variants = helperPanelVariants(true);
    for (const key of ["collapsed", "shown"]) {
      const variant = variants[key];
      if (variant === undefined || typeof variant === "function") throw new Error(key);
      const { transition, ...values } = variant;
      expect(Object.keys(values)).toEqual(["opacity"]);
      if (transition !== undefined) {
        expect((transition as { duration: number }).duration).toBeLessThanOrEqual(0.15);
      }
    }
    expect(COPY_LABEL_FADE.duration).toBeLessThanOrEqual(0.15);
  });
});
