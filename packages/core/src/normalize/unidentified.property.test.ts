import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "./normalize-merchant.js";
import {
  decorationArb,
  describeUnidentified,
  readsAsCardNumber,
  referenceTokenArb,
  unidentifiedArb,
} from "./test-arbitraries.js";
import type { UnidentifiedCase } from "./test-arbitraries.js";

/** The residue of a case by construction: its base, folded, with whitespace collapsed. */
function expectedResidue(c: UnidentifiedCase): string {
  return c.base.toLowerCase().replace(/\s+/gu, " ").trim();
}

function undecorated(c: UnidentifiedCase): UnidentifiedCase {
  return { base: c.base, start: [], end: [] };
}

describe("unidentified key properties", () => {
  it("P10: keys are equal exactly when processors and residues are equal (independent bases)", () => {
    fc.assert(
      fc.property(unidentifiedArb, unidentifiedArb, (a, b) => {
        const ra = normalizeMerchant(describeUnidentified(a));
        const rb = normalizeMerchant(describeUnidentified(b));
        expect(ra.source).toBe("unidentified");
        expect(rb.source).toBe("unidentified");
        const sameInputs =
          ra.processor === rb.processor && expectedResidue(a) === expectedResidue(b);
        expect(ra.key === rb.key, `${describeUnidentified(a)} | ${describeUnidentified(b)}`).toBe(
          sameInputs,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("P10: keys are equal exactly when processors and residues are equal (same or case-changed base)", () => {
    fc.assert(
      fc.property(
        unidentifiedArb,
        decorationArb,
        fc.constantFrom("same", "lower", "upper"),
        (a, decoration, change) => {
          const base =
            change === "lower"
              ? a.base.toLowerCase()
              : change === "upper"
                ? a.base.toUpperCase()
                : a.base;
          const b: UnidentifiedCase = { base, ...decoration };
          fc.pre(!readsAsCardNumber(b));
          const ra = normalizeMerchant(describeUnidentified(a));
          const rb = normalizeMerchant(describeUnidentified(b));
          expect(rb.source).toBe("unidentified");
          expect(expectedResidue(a)).toBe(expectedResidue(b));
          expect(ra.processor).toBe(rb.processor);
          expect(ra.key, `${describeUnidentified(a)} | ${describeUnidentified(b)}`).toBe(rb.key);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("P10: adding or changing prefixes, masked card numbers and dates does not change the key", () => {
    fc.assert(
      fc.property(unidentifiedArb, (c) => {
        const description = describeUnidentified(c);
        const bare = describeUnidentified(undecorated(c));
        expect(normalizeMerchant(description).key, `${description} | ${bare}`).toBe(
          normalizeMerchant(bare).key,
        );
      }),
      { numRuns: 500 },
    );
  });

  it("P10: PAYPAL *r1 and PAYPAL *r2 differ for distinct reference numbers", () => {
    fc.assert(
      fc.property(referenceTokenArb, referenceTokenArb, (r1, r2) => {
        fc.pre(r1.toLowerCase() !== r2.toLowerCase());
        const a = normalizeMerchant("PAYPAL *" + r1);
        const b = normalizeMerchant("PAYPAL *" + r2);
        expect(a.source).toBe("unidentified");
        expect(b.source).toBe("unidentified");
        expect(a.key).not.toBe(b.key);
      }),
      { numRuns: 500 },
    );
  });
});
