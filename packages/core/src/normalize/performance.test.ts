import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cleanDescription } from "./clean.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { KNOWN_SERVICE_FIXTURES } from "./test-known-service-fixtures.js";
import { CORPUS_LENGTH, adversarialCorpus } from "./test-arbitraries.js";

const LIMIT_MS = 250;
const SEED = 13_013;

function timeOf(text: string): number {
  const start = performance.now();
  normalizeMerchant(text);
  return performance.now() - start;
}

function randomStrings(unit: "grapheme-ascii" | "binary"): string[] {
  return fc.sample(fc.string({ unit, minLength: CORPUS_LENGTH, maxLength: CORPUS_LENGTH }), {
    numRuns: 100,
    seed: SEED,
  });
}

describe("performance", () => {
  it("the adversarial corpus has exact lengths and a nested multi-pass entry", () => {
    expect(adversarialCorpus.length).toBeGreaterThanOrEqual(2 * 11);
    for (const input of adversarialCorpus) {
      expect(input.text.length, input.label).toBe(CORPUS_LENGTH);
    }
    const nested = adversarialCorpus.find((input) => input.label === "date around phone, nested");
    expect(nested).toBeDefined();
    expect(cleanDescription((nested as { text: string }).text).passes).toBeGreaterThan(2);
  });

  it("P13: bounded time, every corpus entry and 100 random strings under 250 ms", () => {
    normalizeMerchant("NETFLIX.COM 866-579-7172 CA"); // warm-up
    const inputs = [
      ...adversarialCorpus,
      ...randomStrings("grapheme-ascii").map((text, i) => ({ label: `fc.string #${i}`, text })),
      ...randomStrings("binary").map((text, i) => ({ label: `fc.string binary #${i}`, text })),
    ];
    let slowest = { label: "", ms: -1 };
    for (const input of inputs) {
      const ms = timeOf(input.text);
      if (ms > slowest.ms) slowest = { label: input.label, ms };
    }
    expect(
      slowest.ms,
      `slowest input: ${slowest.label} took ${slowest.ms.toFixed(1)} ms (limit ${LIMIT_MS} ms)`,
    ).toBeLessThan(LIMIT_MS);
  });

  it("realistic fixtures finish in at most 3 passes", () => {
    for (const fixture of KNOWN_SERVICE_FIXTURES) {
      for (const description of fixture.descriptions) {
        expect(cleanDescription(description).passes, description).toBeLessThanOrEqual(3);
      }
    }
  });
});
