// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("App", () => {
  it("shows the Page and no link to #spike when the page loads at #spike", () => {
    window.location.hash = "#spike";
    const { container } = render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Zombills" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Drop area/ })).toBeTruthy();
    expect(container.querySelector('a[href*="spike"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /back to zombills/i })).toBeNull();
  });
});
