/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
