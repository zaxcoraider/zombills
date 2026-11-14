import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fold } from "./fold.js";
import { KNOWN_SERVICES } from "./known-services.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { applyNoise, genericNameArb, noiseArb } from "./test-arbitraries.js";

const MERCHANT_SOURCES = ["known", "generic", "unidentified"];

/** Arbitrary strings of several kinds: ASCII, any UTF-16 code unit (lone surrogates), full Unicode. */
const stringArbs = {
  ascii: fc.string({ maxLength: 80 }),
  binary: fc.string({ unit: "binary", maxLength: 80 }),
  unicode: fc.string({ unit: "grapheme", maxLength: 80 }),
  controlAndEmoji: fc
    .array(
      fc.constantFrom("\u0000", "\u0007", "\n", "\t", "😀", "\ud800", "\udfff", " ", "*", "a"),
      {
        maxLength: 40,
      },
    )
    .map((parts) => parts.join("")),
};

const anyStringArb = fc.oneof(...Object.values(stringArbs));

/** One to four words of 3-12 Latin letters; used where the name should come out generic. */
const wordsArb = fc
  .array(fc.stringMatching(/^[a-zA-ZÀ-ÖØ-öø-ÿ]{3,12}$/u), { minLength: 1, maxLength: 4 })
  .map((words) => words.join(" "));

/** The folded letters and digits of a text, as one sequence. */
function alnum(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}]+/gu, "");
}

describe("normalizeMerchant properties", () => {
  it("P1: never throws, for any string", () => {
    fc.assert(fc.property(anyStringArb, (s) => typeof normalizeMerchant(s) === "object"));
  });

  it("P1: never throws, for strings up to 10,000 characters", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 10_000 }), (s) => {
        normalizeMerchant(s);
      }),
      { numRuns: 20 },
    );
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 10_000 }), (s) => {
        normalizeMerchant(s);
      }),
      { numRuns: 20 },
    );
  });

  it("P2: output shape", () => {
    fc.assert(
      fc.property(anyStringArb, (s) => {
        const r = normalizeMerchant(s);
        expect(r.key).not.toBe("");
        expect(r.displayName).not.toBe("");
        expect(MERCHANT_SOURCES).toContain(r.source);
        expect(r.serviceId !== null).toBe(r.source === "known");
        if (r.source === "known") {
          expect(r.key).toBe(r.serviceId);
          expect(r.key.includes(":")).toBe(false);
        } else if (r.source === "generic") {
          expect(r.key.startsWith("merchant:")).toBe(true);
        } else {
          expect(r.key.startsWith("unidentified:")).toBe(true);
        }
      }),
    );
  });

  it("P3: deterministic", () => {
    fc.assert(
      fc.property(anyStringArb, (s) => {
        expect(normalizeMerchant(s)).toEqual(normalizeMerchant(s));
      }),
    );
  });

  it("P4: case-insensitive", () => {
    fc.assert(
      fc.property(anyStringArb, (s) => {
        const pick = (r: ReturnType<typeof normalizeMerchant>): unknown[] => [
          r.key,
          r.source,
          r.serviceId,
          r.processor,
        ];
        const base = pick(normalizeMerchant(s));
        expect(pick(normalizeMerchant(s.toUpperCase()))).toEqual(base);
        expect(pick(normalizeMerchant(s.toLowerCase()))).toEqual(base);
      }),
      // Known counterexamples (see task 12 report): fold() strips marks before the case round trip,
      // so characters whose case mapping creates a new letter fold differently by case.
      // "ᾀ".toUpperCase() is "ἈΙ" (iota subscript becomes a letter); "ẞ" lower-cases to "ß".
      { examples: [["ᾀ"], ["ẞ"], ["\u0345"]] },
    );
  });

  it("P5: idempotent on its own display name, arbitrary strings", () => {
    fc.assert(
      fc.property(anyStringArb, (s) => {
        const r = normalizeMerchant(s);
        if (r.source === "unidentified") return;
        const again = normalizeMerchant(r.displayName);
        expect(again.key).toBe(r.key);
        expect(again.source).toBe(r.source);
        expect(again.serviceId).toBe(r.serviceId);
        expect(again.displayName).toBe(r.displayName);
      }),
      { numRuns: 1000 },
    );
  });

  it("P5: idempotent on its own display name, noise x variants", () => {
    for (const service of KNOWN_SERVICES) {
      for (const variant of service.variants) {
        fc.assert(
          fc.property(noiseArb, (noise) => {
            const description = applyNoise(noise, variant.text);
            const r = normalizeMerchant(description);
            expect(r.source, description).toBe("known");
            const again = normalizeMerchant(r.displayName);
            expect(again.key).toBe(r.key);
            expect(again.source).toBe(r.source);
            expect(again.serviceId).toBe(r.serviceId);
            expect(again.displayName).toBe(r.displayName);
          }),
          { numRuns: 10 },
        );
      }
    }
  });

  it("P5: idempotent on its own display name, noise x generic names", () => {
    fc.assert(
      fc.property(genericNameArb, noiseArb, (name, noise) => {
        const description = applyNoise(noise, name);
        const r = normalizeMerchant(description);
        expect(r.source, description).toBe("generic");
        const again = normalizeMerchant(r.displayName);
        expect(again.key).toBe(r.key);
        expect(again.source).toBe(r.source);
        expect(again.serviceId).toBe(r.serviceId);
        expect(again.displayName).toBe(r.displayName);
      }),
      { numRuns: 500 },
    );
  });

  it("P9: generic noise-insensitivity", () => {
    fc.assert(
      fc.property(genericNameArb, noiseArb, (name, noise) => {
        const bare = normalizeMerchant(name);
        const description = applyNoise(noise, name);
        const noisy = normalizeMerchant(description);
        expect(noisy.source, JSON.stringify(description)).toBe("generic");
        expect(noisy.key, JSON.stringify(description)).toBe(bare.key);
      }),
      { numRuns: 1000 },
    );
  });

  it("P12: generic keys never merge different names", () => {
    fc.assert(
      fc.property(wordsArb, wordsArb, (a, b) => {
        const ra = normalizeMerchant(a);
        const rb = normalizeMerchant(b);
        if (ra.source !== "generic" || rb.source !== "generic") return;
        if (alnum(ra.displayName) !== alnum(rb.displayName)) {
          expect(ra.key).not.toBe(rb.key);
        }
      }),
      { numRuns: 500 },
    );
  });
});
