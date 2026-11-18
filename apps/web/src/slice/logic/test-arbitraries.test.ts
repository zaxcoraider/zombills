import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PageView, Screen } from "../page-state";
import { pageModelArb } from "./test-arbitraries";

const VIEW_KINDS: readonly PageView["kind"][] = [
  "idle",
  "working",
  "results",
  "no-subscriptions",
  "error",
];
const SCREENS: readonly Screen[] = ["main", "graveyard"];

describe("pageModelArb", () => {
  it("reaches every view kind and both screens (Req 1.10)", () => {
    const models = fc.sample(pageModelArb, { numRuns: 2000, seed: 42 });
    const kinds = new Set(models.map((m) => m.view.kind));
    const screens = new Set(models.map((m) => m.screen));
    expect([...kinds].sort()).toEqual([...VIEW_KINDS].sort());
    expect([...screens].sort()).toEqual([...SCREENS].sort());
  });

  it("reaches the view and screen pairs that P2's branches need (Req 1.10, 1.11)", () => {
    const models = fc.sample(pageModelArb, { numRuns: 2000, seed: 42 });
    const pairs = new Set(models.map((m) => `${m.view.kind}:${m.screen}`));
    for (const pair of [
      "idle:graveyard",
      "results:main",
      "results:graveyard",
      "error:main",
      "no-subscriptions:main",
      "working:main",
    ]) {
      expect(pairs.has(pair), pair).toBe(true);
    }
  });
});
