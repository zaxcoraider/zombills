// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(cleanup);

describe("App routing", () => {
  it("shows the Spike with its back link at #spike and the Page when the hash clears, without a reload", () => {
    const windowBefore = window;
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Zombills" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back to Zombills" })).toBeNull();

    goTo("#spike");
    const back = screen.getByRole("link", { name: "Back to Zombills" });
    expect(back.getAttribute("href")).toBe("#");
    expect(screen.queryByRole("button", { name: "Choose a file" })).toBeNull();

    goTo("");
    expect(screen.getByRole("heading", { level: 1, name: "Zombills" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back to Zombills" })).toBeNull();
    expect(window).toBe(windowBefore);
  });

  it("opens the Spike when the page loads at #spike", () => {
    window.location.hash = "#spike";
    render(<App />);
    expect(screen.getByRole("link", { name: "Back to Zombills" })).toBeTruthy();
  });
});
