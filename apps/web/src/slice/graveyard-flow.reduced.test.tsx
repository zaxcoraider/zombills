// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
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
});
