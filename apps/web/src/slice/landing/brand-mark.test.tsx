// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../App";
import { BrandMark } from "./brand-mark";

afterEach(cleanup);

describe("BrandMark", () => {
  it("is decorative: aria-hidden, not focusable, no text, no external reference", () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.hasAttribute("data-brand-mark")).toBe(true);
    expect(container.querySelector("text, title, script, image, a")).toBeNull();
    expect(svg?.textContent).toBe("");
    expect(container.innerHTML).not.toMatch(/https?:/);
  });

  it("is 56 px on phones and 72 px from sm up", () => {
    const { container } = render(<BrandMark />);
    const cls = container.querySelector("svg")?.getAttribute("class") ?? "";
    expect(cls).toContain("size-14");
    expect(cls).toContain("sm:size-[4.5rem]");
  });

  it("keeps ids unique when two marks render", () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("BrandMark ground", () => {
  it("draws no ground band", () => {
    const { container } = render(<BrandMark />);
    const all = [...container.querySelectorAll("*")];
    expect(all.filter((el) => (el.getAttribute("d") ?? "").startsWith("M0 432"))).toHaveLength(0);
    expect(
      all.filter((el) => (el.getAttribute("fill") ?? "").toLowerCase() === "#1a1f2b"),
    ).toHaveLength(0);
    expect(
      all.filter(
        (el) => el.tagName === "path" && el.getAttribute("fill")?.toLowerCase() === "#8fd694",
      ),
    ).toHaveLength(2);
  });

  it("leaves the favicon alone", () => {
    const svg = readFileSync(join(import.meta.dirname, "../../../public/favicon.svg"), "utf8");
    expect(svg).not.toContain("M0 432");
    expect(svg.toLowerCase()).not.toContain("#1a1f2b");
  });
});

describe("Landing title with the mark", () => {
  it("keeps the h1 name 'Zombills' and shows the mark beside it", () => {
    window.location.hash = "";
    const { container } = render(<App />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Zombills" });
    expect(h1.textContent).toBe("Zombills");
    const mark = container.querySelector("[data-brand-mark]");
    expect(mark).not.toBeNull();
    expect(h1.contains(mark)).toBe(false);
    expect(mark?.nextElementSibling).toBe(h1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
