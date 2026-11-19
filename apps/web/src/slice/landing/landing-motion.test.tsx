// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIMARY_ACTION_NAME } from "../logic/landing-text";

const US_LABEL = "US bank statement";

type AppComponent = typeof import("../../App").App;

/** A fresh `App` with a fresh once-per-load flag in `use-landing-motion.ts`. */
async function freshApp(): Promise<AppComponent> {
  vi.resetModules();
  const module = await import("../../App");
  return module.App;
}

function motionOf(container: HTMLElement) {
  const disc = container.querySelector("[data-moon-disc]");
  return {
    title: screen.getByRole("heading", { level: 1, name: "Zombills" }).getAttribute("data-motion"),
    art: container.querySelector("[data-hero-art]")?.getAttribute("data-motion"),
    moon: disc?.closest("div[data-motion]")?.getAttribute("data-motion"),
  };
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Landing effects: once per load", () => {
  it("plays on the first Landing view and stays still after Start again", async () => {
    const App = await freshApp();
    const { container } = render(<App />);

    expect(motionOf(container)).toEqual({ title: "play", art: "play", moon: "play" });

    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    expect(screen.getByText(`Reading ${US_LABEL}…`, { selector: "main p" })).toBeTruthy();
    // The Landing view stays mounted during the run, so nothing replays.
    expect(motionOf(container)).toEqual({ title: "play", art: "play", moon: "play" });

    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    expect(container.querySelector("[data-hero-art]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(motionOf(container)).toEqual({ title: "still", art: "still", moon: "still" });
  });

  it("starts the US Sample at once from the Primary action", async () => {
    const App = await freshApp();
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    expect(screen.getByText(`Reading ${US_LABEL}…`, { selector: "main p" })).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
  });
});
