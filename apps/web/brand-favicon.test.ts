import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CSP_POLICY } from "./csp-plugin";

const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(HERE, "index.html"), "utf8");
const svg = readFileSync(resolve(HERE, "public/favicon.svg"), "utf8");

describe("favicon", () => {
  it("is the only icon link in index.html and points at /favicon.svg", () => {
    const links = html.match(/<link\b[^>]*\brel=["']icon["'][^>]*>/gi) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('type="image/svg+xml"');
    expect(links[0]).toContain('href="/favicon.svg"');
    expect(html).not.toContain("data:,");
  });

  it("is an SVG with no script, no <text> and no external reference", () => {
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/<text/i);
    expect(svg).not.toMatch(/<foreignObject/i);
    expect(svg).not.toMatch(/\bon[a-z]+\s*=/i);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/i);
    expect(svg).not.toMatch(/(?:href|src)\s*=/i);
    expect(svg).not.toMatch(/url\(\s*["']?(?!#)/i);
  });

  it("is allowed by the CSP: img-src covers the same origin", () => {
    expect(CSP_POLICY).toMatch(/img-src[^;]*'self'/);
  });
});
