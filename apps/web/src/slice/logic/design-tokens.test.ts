import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RADIUS_SCALE, SPACE_SCALE, TYPE_SCALE } from "./design-tokens";

const CSS = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

/** Every value declared for `--<name>` in index.css. */
function declared(name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const pattern = new RegExp(`--${escaped}\\s*:\\s*([^;]+);`, "g");
  return [...CSS.matchAll(pattern)].map((match) => (match[1] ?? "").trim());
}

function rem(value: string): number {
  const match = /^(\d+(?:\.\d+)?)rem$/.exec(value);
  if (!match) throw new Error(`not a rem value: ${value}`);
  return Number(match[1]);
}

describe("design tokens match index.css", () => {
  it.each(SPACE_SCALE)("--$name is $value", ({ name, value }) => {
    expect(declared(name)).toEqual([value]);
  });

  it.each(TYPE_SCALE)("--$name is $size / $lineHeight", ({ name, size, lineHeight }) => {
    expect(declared(name)).toEqual([size]);
    expect(declared(`${name}--line-height`)).toEqual([lineHeight]);
  });

  it.each(RADIUS_SCALE)("--$name is $value", ({ name, value }) => {
    expect(declared(name)).toEqual([value]);
  });

  it("no type size is below 0.8125rem", () => {
    for (const { size } of TYPE_SCALE) {
      expect(rem(size)).toBeGreaterThanOrEqual(0.8125);
    }
  });

  it("names every scale entry once", () => {
    const names = [...SPACE_SCALE, ...TYPE_SCALE, ...RADIUS_SCALE].map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
