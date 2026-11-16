/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GROUND_ALPHA, STONE_WASH_ALPHA } from "./slice/logic/share-card-art";

const CSS = readFileSync(new URL("./index.css", import.meta.url), "utf8");

function tokenHex(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(CSS);
  const hex = match?.[1];
  if (hex === undefined) throw new Error(`Token --${name} not found in index.css`);
  return hex;
}

function channel(hex: string, start: number): number {
  const c = parseInt(hex.slice(start, start + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function srgbToLinear(hex: string, start: number): number {
  return channel(hex, start);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

type Triple = readonly [number, number, number];

function hexToOklab(hex: string): Triple {
  const r = srgbToLinear(hex, 1);
  const g = srgbToLinear(hex, 3);
  const b = srgbToLinear(hex, 5);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToHex([L, a, b]: Triple): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((c) =>
      Math.round(linearToSrgb(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `color-mix(in oklab, b t%, a)`: the colour `b` laid over `a` at fraction `t`. */
function mixOklab(a: string, b: string, t: number): string {
  const la = hexToOklab(a);
  const lb = hexToOklab(b);
  return oklabToHex([
    la[0] * (1 - t) + lb[0] * t,
    la[1] * (1 - t) + lb[1] * t,
    la[2] * (1 - t) + lb[2] * t,
  ]);
}

/** `colour` laid over `background` at `alpha`, mixed per sRGB channel as canvas `globalAlpha` does. */
function over(background: string, colour: string, alpha: number): string {
  const channelAt = (hex: string, start: number): number => parseInt(hex.slice(start, start + 2), 16);
  return `#${[1, 3, 5]
    .map((start) =>
      Math.round(channelAt(background, start) * (1 - alpha) + channelAt(colour, start) * alpha)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Body of the first CSS rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  const body = match?.[1];
  if (body === undefined) throw new Error(`Rule ${selector} not found in index.css`);
  return body;
}

describe("text colour contrast", () => {
  it("bone on night is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("night"))).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on fog is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("fog"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("graveyard text and chip contrast", () => {
  const fog = () => tokenHex("fog");

  it.each(["moss", "ember", "spectre"])("%s on fog is at least 4.5:1", (name) => {
    expect(contrast(tokenHex(name), fog())).toBeGreaterThanOrEqual(4.5);
  });

  it("blood on fog is at least 3:1 (large text only)", () => {
    expect(contrast(tokenHex("blood"), fog())).toBeGreaterThanOrEqual(3);
  });

  it("night on moss is at least 4.5:1", () => {
    expect(contrast(tokenHex("night"), tokenHex("moss"))).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on night is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("night"))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["moss", "ember", "spectre", "bone"])(
    "%s chip text on its 10% tint over fog is at least 4.5:1",
    (name) => {
      const colour = tokenHex(name);
      expect(contrast(colour, mixOklab(fog(), colour, 0.1))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([0.7, 0.9])("text-bone/%s on fog is at least 4.5:1", (alpha) => {
    const text = mixOklab(fog(), tokenHex("bone"), alpha);
    expect(contrast(text, fog())).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["bone", "moss"])("%s on the stone face is at least 4.5:1", (name) => {
    const face = mixOklab(fog(), tokenHex("bone"), 0.2);
    expect(face).toBe("#3e424a");
    expect(contrast(tokenHex(name), face)).toBeGreaterThanOrEqual(4.5);
  });

  it("mixOklab returns its endpoints at 0 and 1", () => {
    expect(mixOklab(tokenHex("fog"), tokenHex("bone"), 0)).toBe(tokenHex("fog").toLowerCase());
    expect(mixOklab(tokenHex("fog"), tokenHex("bone"), 1)).toBe(tokenHex("bone").toLowerCase());
  });
});

describe("share card contrast (sRGB compositing, as the canvas does)", () => {
  const stoneFace = () => over(tokenHex("fog"), tokenHex("bone"), STONE_WASH_ALPHA);
  const ground = () => over(tokenHex("fog"), tokenHex("night"), GROUND_ALPHA);

  it.each(["bone", "moss"])("%s on the stone face is at least 4.5:1", (name) => {
    expect(contrast(tokenHex(name), stoneFace())).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on the ground is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), ground())).toBeGreaterThanOrEqual(4.5);
  });

  it("bone on night is at least 4.5:1", () => {
    expect(contrast(tokenHex("bone"), tokenHex("night"))).toBeGreaterThanOrEqual(4.5);
  });

  it("over returns the background at alpha 0 and the colour at alpha 1", () => {
    expect(over(tokenHex("fog"), tokenHex("bone"), 0)).toBe(tokenHex("fog").toLowerCase());
    expect(over(tokenHex("fog"), tokenHex("bone"), 1)).toBe(tokenHex("bone").toLowerCase());
  });
});

describe("index.css rules", () => {
  it(":focus-visible draws a 2px moss outline with a 2px offset", () => {
    const body = ruleBody(":focus-visible");
    expect(body).toMatch(/outline:\s*2px solid var\(--moss\)\s*;/);
    expect(body).toMatch(/outline-offset:\s*2px\s*;/);
  });

  it(".money uses Inter with tabular figures", () => {
    const body = ruleBody(".money");
    expect(body).toMatch(/font-family:\s*var\(--font-sans\)\s*;/);
    expect(body).toMatch(/font-variant-numeric:\s*tabular-nums\s*;/);
  });
});
