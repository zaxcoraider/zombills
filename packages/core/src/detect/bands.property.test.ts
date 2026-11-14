import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { splitIntoBands } from "./bands.js";
import type { Entry } from "./internal-types.js";
import { charge } from "./test-fixtures.js";
import { validateElement } from "./validate.js";

/** One Entry per amount, all on the same day; the order of the array is the order given. */
function entriesOf(amounts: readonly number[]): Entry[] {
  return amounts.map((amount, rank) => {
    const result = validateElement(charge("2026-01-01", amount, "merchant:shop"), rank);
    if (!result.ok) throw new Error(result.reason);
    return { ...result.entry, rank };
  });
}

/** `(a − m) × 20 ≤ m`, the Req 3.2 test, in exact arithmetic. */
function joins(low: number, a: number): boolean {
  return (BigInt(a) - BigInt(low)) * 20n <= BigInt(low);
}

const amountArb = fc.oneof(
  fc.integer({ min: 1, max: 2000 }),
  fc.integer({ min: 1, max: 1_000_000 }),
  fc.integer({ min: Number.MAX_SAFE_INTEGER - 1000, max: Number.MAX_SAFE_INTEGER }),
  fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
);

describe("bands", () => {
  it("P16: bands partition the distinct amounts and obey the 5 % rule", () => {
    fc.assert(
      fc.property(fc.array(amountArb, { maxLength: 40 }), (amounts) => {
        const bands = splitIntoBands(entriesOf(amounts));
        const distinct = [...new Set(amounts)].sort((a, b) => a - b);

        // Ids are 0, 1, … and `low` ascends.
        expect(bands.map((b) => b.id)).toEqual(bands.map((_, i) => i));
        for (let i = 1; i < bands.length; i++) {
          expect((bands[i]?.low ?? 0) > (bands[i - 1]?.low ?? 0)).toBe(true);
        }

        // Every Charge is in exactly one band, and the bands' amounts are the distinct amounts.
        const seen = new Map<number, number>();
        for (const band of bands) {
          for (const c of band.charges) seen.set(c.rank, (seen.get(c.rank) ?? 0) + 1);
        }
        expect(seen.size).toBe(amounts.length);
        for (const count of seen.values()) expect(count).toBe(1);
        const bandAmounts = [...new Set(bands.flatMap((b) => b.charges.map((c) => c.amountCents)))];
        expect(bandAmounts.sort((a, b) => a - b)).toEqual(distinct);

        for (const band of bands) {
          // low and high are held amounts, and 20 × (high − low) ≤ low.
          const held = band.charges.map((c) => c.amountCents);
          expect(Math.min(...held)).toBe(band.low);
          expect(Math.max(...held)).toBe(band.high);
          expect((BigInt(band.high) - BigInt(band.low)) * 20n <= BigInt(band.low)).toBe(true);
          // Charges keep the order given.
          const ranks = band.charges.map((c) => c.rank);
          expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        }

        // The next band's low fails the test against the previous band's low.
        for (let i = 1; i < bands.length; i++) {
          const previous = bands[i - 1];
          const next = bands[i];
          if (previous === undefined || next === undefined) continue;
          expect(joins(previous.low, next.low)).toBe(false);
        }
      }),
    );
  });
});
