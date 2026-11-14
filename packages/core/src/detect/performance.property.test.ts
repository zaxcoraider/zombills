// Comparison counter property P20 (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { dayNumber, fromDayNumber } from "./dates.js";
import { detectSubscriptionsCounted } from "./detect-subscriptions.js";
import type { ComparisonCounter } from "./internal-types.js";
import {
  driftingLateBandArb,
  merchantArb,
  monthlySeriesArb,
  rowsOnDates,
} from "./test-arbitraries.js";

const COMPARISON_FACTOR = 24;

function comparisonsOf(transactions: readonly NormalizedTransaction[]): number {
  const counter: ComparisonCounter = { comparisons: 0 };
  detectSubscriptionsCounted(transactions, undefined, counter);
  return counter.comparisons;
}

/** One key, one currency and one amount, on 2 to 80 random dates within a window of 400 days. */
const randomDatesBandArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .record({
    source: fc.constantFrom<"known" | "generic">("known", "generic"),
    startDay: fc.integer({ min: dayNumber(2020, 1, 1), max: dayNumber(2030, 1, 1) }),
    offsets: fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 2, maxLength: 80 }),
    amountCents: fc.integer({ min: 100, max: 5000 }),
  })
  .chain(({ source, startDay, offsets, amountCents }) =>
    merchantArb(source).map((merchant) => {
      const dates = offsets.map((offset) => fromDayNumber(startDay + offset).iso);
      return rowsOnDates(dates, merchant, "USD", amountCents);
    }),
  );

describe("P20 comparison counter", () => {
  it("P20 drifting late bands: comparisons ≤ 24 × b²", () => {
    fc.assert(
      fc.property(driftingLateBandArb, ({ transactions }) => {
        const b = transactions.length;
        expect(comparisonsOf(transactions)).toBeLessThanOrEqual(COMPARISON_FACTOR * b * b);
      }),
    );
  });

  it("P20 monthly series at one amount: comparisons ≤ 24 × b²", () => {
    fc.assert(
      fc.property(monthlySeriesArb(), ({ transactions }) => {
        const b = transactions.length;
        expect(comparisonsOf(transactions)).toBeLessThanOrEqual(COMPARISON_FACTOR * b * b);
      }),
    );
  });

  it("P20 random dates at one amount: comparisons ≤ 24 × b²", () => {
    fc.assert(
      fc.property(randomDatesBandArb, (transactions) => {
        const b = transactions.length;
        expect(comparisonsOf(transactions)).toBeLessThanOrEqual(COMPARISON_FACTOR * b * b);
      }),
    );
  });
});
