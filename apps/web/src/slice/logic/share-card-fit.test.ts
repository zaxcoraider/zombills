/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DISPLAY_FAMILY,
  ELLIPSIS,
  SANS_FAMILY,
  fitLine,
  fontFor,
  shortenToFit,
  type RoleStyle,
} from "./share-card-fit";

const CSS = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

function cssFont(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS);
  const value = match?.[1];
  if (value === undefined) throw new Error(`--${name} not found in index.css`);
  return value.trim();
}

const SANS_STYLE: RoleStyle = {
  family: "sans",
  weight: 600,
  startPx: 72,
  floorPx: 1,
  shorten: false,
  maxWidth: 888,
};
const DISPLAY_STYLE: RoleStyle = {
  family: "display",
  weight: 400,
  startPx: 40,
  floorPx: 20,
  shorten: true,
  maxWidth: 300,
};

/** One unit of width per UTF-16 unit, scaled by the size in the font. */
const widthPerChar = (text: string, font: string): number => {
  const size = Number(/(\d+)px/.exec(font)?.[1]);
  return text.length * size;
};

describe("fontFor", () => {
  it("builds the sans shorthand", () => {
    expect(fontFor(SANS_STYLE, 72)).toBe('600 72px "Inter", ui-sans-serif, system-ui, sans-serif');
  });

  it("builds the display shorthand", () => {
    expect(fontFor(DISPLAY_STYLE, 40)).toBe('400 40px "IM Fell English", Georgia, serif');
  });

  it("uses the weight given", () => {
    expect(fontFor({ ...SANS_STYLE, weight: 500 }, 30)).toBe(
      '500 30px "Inter", ui-sans-serif, system-ui, sans-serif',
    );
  });
});

describe("font families", () => {
  it("DISPLAY_FAMILY equals --font-display in index.css", () => {
    expect(DISPLAY_FAMILY).toBe(cssFont("font-display"));
  });

  it("SANS_FAMILY equals --font-sans in index.css", () => {
    expect(SANS_FAMILY).toBe(cssFont("font-sans"));
  });
});

describe("fitLine", () => {
  it("keeps the source at the start size when it fits", () => {
    const fitted = fitLine("ab", DISPLAY_STYLE, () => 0);
    expect(fitted).toEqual({ text: "ab", sizePx: 40, font: fontFor(DISPLAY_STYLE, 40) });
  });

  it("shrinks one pixel at a time until the source fits", () => {
    const style = { ...DISPLAY_STYLE, maxWidth: 100 };
    const fitted = fitLine("abc", style, widthPerChar);
    expect(fitted.sizePx).toBe(33);
    expect(fitted.text).toBe("abc");
    expect(fitted.font).toBe(fontFor(style, 33));
  });

  it("stops at the floor and shortens when shortening is allowed", () => {
    const style = { ...DISPLAY_STYLE, maxWidth: 100 };
    const fitted = fitLine("abcdefghij", style, widthPerChar);
    expect(fitted.sizePx).toBe(20);
    expect(fitted.text).toBe("abcd…");
  });

  it("goes down to 1 px and is never shortened when shorten is false", () => {
    const style: RoleStyle = { ...SANS_STYLE, floorPx: 1, shorten: false, maxWidth: 5 };
    const fitted = fitLine("abcdefghij", style, widthPerChar);
    expect(fitted.sizePx).toBe(1);
    expect(fitted.text).toBe("abcdefghij");
    expect(fitted.font).toBe(fontFor(style, 1));
  });

  it("draws the whole source at the floor when nothing fits and shorten is false", () => {
    const fitted = fitLine("x", SANS_STYLE, () => Number.POSITIVE_INFINITY);
    expect(fitted).toEqual({ text: "x", sizePx: 1, font: fontFor(SANS_STYLE, 1) });
  });

  it("does not throw on a NaN measure and falls back to the ellipsis", () => {
    expect(() => fitLine("abc", DISPLAY_STYLE, () => Number.NaN)).not.toThrow();
    expect(fitLine("abc", DISPLAY_STYLE, () => Number.NaN)).toEqual({
      text: ELLIPSIS,
      sizePx: 20,
      font: fontFor(DISPLAY_STYLE, 20),
    });
    expect(fitLine("abc", SANS_STYLE, () => Number.NaN).text).toBe("abc");
  });

  it("calls measure only with the source at sizes start..floor and candidates at the floor", () => {
    const style = { ...DISPLAY_STYLE, maxWidth: 100 };
    const source = "abcdefghij";
    const calls: { text: string; font: string }[] = [];
    fitLine(source, style, (text, font) => {
      calls.push({ text, font });
      return widthPerChar(text, font);
    });
    const floorFont = fontFor(style, style.floorPx);
    const sizes = new Set<string>();
    for (let size = style.startPx; size >= style.floorPx; size -= 1) sizes.add(fontFor(style, size));
    for (const call of calls) {
      if (call.text === source) {
        expect(sizes.has(call.font)).toBe(true);
      } else {
        expect(call.font).toBe(floorFont);
        expect(call.text.endsWith(ELLIPSIS)).toBe(true);
        expect(source.startsWith(call.text.slice(0, -1))).toBe(true);
      }
    }
    expect(calls.filter((c) => c.text === source)).toHaveLength(
      style.startPx - style.floorPx + 1,
    );
  });
});

describe("shortenToFit", () => {
  const font = "f";
  const oneEach = (text: string): number => Array.from(text).length;

  it("keeps the longest prefix that fits", () => {
    expect(shortenToFit("abcdef", font, 4, oneEach)).toBe("abc…");
  });

  it("keeps whole surrogate pairs", () => {
    expect(shortenToFit("ab😀cd", font, 4, oneEach)).toBe("ab😀…");
    expect(shortenToFit("ab😀cd", font, 3, oneEach)).toBe("ab…");
    const result = shortenToFit("ab😀cd", font, 3.5, oneEach);
    expect(result).not.toMatch(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/u);
  });

  it("drops trailing spaces before the ellipsis", () => {
    expect(shortenToFit("ab   cd", font, 4, oneEach)).toBe("ab…");
  });

  it("skips an empty prefix and falls back to the ellipsis", () => {
    expect(shortenToFit("   abc", font, 1, oneEach)).toBe(ELLIPSIS);
    expect(shortenToFit("abc", font, 0, oneEach)).toBe(ELLIPSIS);
  });

  it("does not measure the ellipsis alone", () => {
    const seen: string[] = [];
    shortenToFit("abc", font, 0, (text) => {
      seen.push(text);
      return 99;
    });
    expect(seen).toEqual(["ab…", "a…"]);
  });

  it("does not throw on NaN", () => {
    expect(shortenToFit("abc", font, 10, () => Number.NaN)).toBe(ELLIPSIS);
  });
});
