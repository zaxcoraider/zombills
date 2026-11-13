import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { negate } from "./amount";
import { applySignConvention, detectSignConvention } from "./sign-convention";
import { centsArbitrary, withPermutation } from "./test-arbitraries";

// Component half of P8 and P18. The full-parse halves (through parseStatement) are added in task 14.4.

const rawValues: fc.Arbitrary<number[]> = fc.array(centsArbitrary, { maxLength: 40 });

function counts(values: readonly number[]): { positive: number; negative: number } {
  return {
    positive: values.filter((value) => value > 0).length,
    negative: values.filter((value) => value < 0).length,
  };
}

describe("sign convention properties", () => {
  it("P18 (detector): negating every value flips the convention, unless the counts are tied", () => {
    fc.assert(
      fc.property(rawValues, (values) => {
        const original = detectSignConvention(values);
        const flipped = detectSignConvention(values.map(negate));
        if (original.assumed) {
          // Equal counts stay equal after negating, so the tie default applies again.
          expect(flipped).toEqual(original);
        } else {
          expect(flipped.assumed).toBe(false);
          expect(flipped.convention).not.toBe(original.convention);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("P18 (detector): negating every raw value leaves the stored amounts unchanged", () => {
    fc.assert(
      fc.property(rawValues, (values) => {
        const original = detectSignConvention(values);
        const flipped = detectSignConvention(values.map(negate));
        fc.pre(!original.assumed);
        const stored = values.map((value) => applySignConvention(value, original.convention));
        const storedAfterFlip = values
          .map(negate)
          .map((value) => applySignConvention(value, flipped.convention));
        expect(storedAfterFlip).toEqual(stored);
      }),
    );
  });

  it("P8 (detector): the detected convention stores most values as money out", () => {
    fc.assert(
      fc.property(rawValues, (values) => {
        const info = detectSignConvention(values);
        const stored = values.map((value) => applySignConvention(value, info.convention));
        const { positive, negative } = counts(stored);
        if (info.assumed) {
          expect(positive).toBe(negative);
        } else {
          expect(positive).toBeGreaterThan(negative);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("detection depends only on the values, not their order", () => {
    fc.assert(
      fc.property(withPermutation(centsArbitrary), ([values, shuffled]) => {
        expect(detectSignConvention(shuffled)).toEqual(detectSignConvention(values));
      }),
    );
  });

  it("zeros never change the detection", () => {
    fc.assert(
      fc.property(rawValues, fc.nat({ max: 10 }), (values, zeros) => {
        expect(
          detectSignConvention([...values, ...Array.from({ length: zeros }, () => 0)]),
        ).toEqual(detectSignConvention(values));
      }),
    );
  });

  it("applySignConvention: negative-out is the negation of positive-out and never gives -0", () => {
    fc.assert(
      fc.property(centsArbitrary, (cents) => {
        const positiveOut = applySignConvention(cents, "positive-out");
        const negativeOut = applySignConvention(cents, "negative-out");
        expect(negativeOut).toBe(negate(positiveOut));
        expect(Object.is(positiveOut, -0)).toBe(false);
        expect(Object.is(negativeOut, -0)).toBe(false);
        expect(Number.isInteger(negativeOut)).toBe(true);
      }),
    );
  });
});
