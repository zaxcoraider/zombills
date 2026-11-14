// Amount properties P5, P6 and P17 (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import {
  type GeneratedSeries,
  monthlySeriesArb,
  validTxArb,
  weeklySeriesArb,
  yearlyPairArb,
} from "./test-arbitraries.js";
import type { Cadence, DetectionResult, Subscription } from "./types.js";

const FACTOR: Record<Cadence, number> = { weekly: 52, monthly: 12, yearly: 1 };

/**
 * A monthly series whose price changes at one to two points by 6 % to 100 %, so the band split
 * and the price-change join (Req 3.6) both run and `priceHistory` gets several entries.
 */
const pricedMonthlyArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .tuple(
    monthlySeriesArb({ minCharges: 6 }),
    fc.array(fc.tuple(fc.nat({ max: 100 }), fc.integer({ min: 6, max: 100 })), { minLength: 1, maxLength: 2 }),
  )
  .map(([series, changes]) => {
    const rows = series.transactions.map((tx) => ({ ...tx, merchant: { ...tx.merchant } }));
    let amount = series.amountCents;
    let from = 2;
    for (const [at, percent] of changes) {
      const split = Math.min(rows.length - 2, from + (at % Math.max(1, rows.length - 3 - from)));
      amount = amount + Math.floor((amount * percent) / 100);
      for (let i = split; i < rows.length; i += 1) (rows[i] as NormalizedTransaction).amountCents = amount;
      from = split + 2;
      if (from > rows.length - 2) break;
    }
    return rows;
  });

/** A known charge alone, so the single-charge report (Req 5.4) is in the results too. */
const singleKnownArb: fc.Arbitrary<NormalizedTransaction[]> = yearlyPairArb.map((pair) =>
  pair.transactions.slice(0, 1),
);

const anyStatementArb: fc.Arbitrary<NormalizedTransaction[]> = fc
  .array(
    fc.oneof(
      monthlySeriesArb().map((s) => s.transactions),
      weeklySeriesArb.map((s) => s.transactions),
      yearlyPairArb.map((s) => s.transactions),
      pricedMonthlyArb,
      singleKnownArb,
      fc.array(validTxArb, { maxLength: 6 }),
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((parts) => parts.flat());

function subscriptionsOf(rows: readonly NormalizedTransaction[]): Subscription[] {
  return detectSubscriptions(rows).subscriptions;
}

/** Counts how often a property saw a Subscription, so a vacuous pass cannot go unnoticed. */
function expectSeen(seen: { subscriptions: number; priceChanges: number }): void {
  expect(seen.subscriptions).toBeGreaterThan(0);
}

describe("amount properties", () => {
  it("P5: yearlyCostCents is currentAmountCents times 52, 12 or 1, and currentAmountCents is the last Regular charge", () => {
    const seen = { subscriptions: 0, priceChanges: 0 };
    fc.assert(
      fc.property(anyStatementArb, (rows) => {
        for (const sub of subscriptionsOf(rows)) {
          seen.subscriptions += 1;
          expect(sub.yearlyCostCents).toBe(sub.currentAmountCents * FACTOR[sub.cadence]);
          const last = sub.charges[sub.charges.length - 1];
          expect(sub.currentAmountCents).toBe(last?.amountCents);
          expect(sub.currentAmountCents).toBe(sub.priceHistory[sub.priceHistory.length - 1]?.amountCents);
          expect(sub.evidence.lastChargeDate).toBe(last?.date);
        }
      }),
    );
    expectSeen(seen);
  });

  it("P5: the Req 6.2 examples hold exactly", () => {
    const monthly = fc.sample(monthlySeriesArb(), { numRuns: 1, seed: 1 })[0] as GeneratedSeries;
    const [sub] = subscriptionsOf(monthly.transactions);
    expect(sub?.cadence).toBe("monthly");
    expect(sub?.yearlyCostCents).toBe(monthly.amountCents * 12);
  });

  it("P6: every money field is a safe integer and the counts are non-negative integers", () => {
    const seen = { subscriptions: 0, priceChanges: 0 };
    fc.assert(
      fc.property(anyStatementArb, (rows) => {
        for (const sub of subscriptionsOf(rows)) {
          seen.subscriptions += 1;
          const money = [
            sub.currentAmountCents,
            sub.yearlyCostCents,
            ...sub.priceHistory.map((p) => p.amountCents),
            ...sub.evidence.partialRefunds.map((p) => p.amountCents),
            ...(sub.evidence.introCharge === null ? [] : [sub.evidence.introCharge.amountCents]),
          ];
          for (const value of money) expect(Number.isSafeInteger(value)).toBe(true);
          for (const count of [sub.evidence.regularChargeCount, sub.evidence.missedPeriods]) {
            expect(Number.isInteger(count)).toBe(true);
            expect(count).toBeGreaterThanOrEqual(0);
          }
        }
      }),
    );
    expectSeen(seen);
  });

  describe("P6: amounts near MAX_SAFE_INTEGER / 12", () => {
    const nearArb = (divisor: number): fc.Arbitrary<number> => {
      const centre = Math.floor(Number.MAX_SAFE_INTEGER / divisor);
      return fc.integer({ min: centre - 50, max: centre + 50 });
    };

    /** Runs a series and checks that the result is reported exactly when the product is safe. */
    function check(series: GeneratedSeries, factor: number, result: DetectionResult): void {
      const product = BigInt(series.amountCents) * BigInt(factor);
      const safe = product <= BigInt(Number.MAX_SAFE_INTEGER);
      for (const sub of result.subscriptions) {
        expect(Number.isSafeInteger(sub.yearlyCostCents)).toBe(true);
        expect(BigInt(sub.yearlyCostCents)).toBe(BigInt(sub.currentAmountCents) * BigInt(FACTOR[sub.cadence]));
      }
      if (safe) {
        expect(result.subscriptions).toHaveLength(1);
      } else {
        // Req 6.5: the Series is left unreported and its charges are not recurring.
        expect(result.subscriptions).toHaveLength(0);
        for (const entry of result.usage) expect(entry.role).toBe("not-recurring");
      }
    }

    it("monthly series report a safe product and drop an unsafe one", () => {
      fc.assert(
        fc.property(monthlySeriesArb({ amountCents: nearArb(12) }), (series) => {
          check(series, 12, detectSubscriptions(series.transactions));
        }),
      );
    });

    it("weekly series near MAX_SAFE_INTEGER / 52 do the same", () => {
      fc.assert(
        fc.property(
          weeklySeriesArb.chain((series) =>
            nearArb(52).map((amountCents) => ({
              ...series,
              amountCents,
              transactions: series.transactions.map((tx) => ({ ...tx, amountCents })),
            })),
          ),
          (series) => {
            check(series, 52, detectSubscriptions(series.transactions));
          },
        ),
      );
    });

    it("yearly pairs at the largest safe amount are reported, since the factor is 1", () => {
      fc.assert(
        fc.property(yearlyPairArb, fc.integer({ min: 0, max: 50 }), (pair, back) => {
          const amountCents = Number.MAX_SAFE_INTEGER - back;
          const rows = pair.transactions.map((tx) => ({ ...tx, amountCents }));
          const [sub] = detectSubscriptions(rows).subscriptions;
          expect(sub?.cadence).toBe("yearly");
          expect(sub?.yearlyCostCents).toBe(amountCents);
        }),
      );
    });
  });

  it("P17: priceHistory is never empty, starts at the first charge, changes at every entry and lists only Series charges", () => {
    const seen = { subscriptions: 0, priceChanges: 0 };
    fc.assert(
      fc.property(fc.oneof(anyStatementArb, pricedMonthlyArb), (rows) => {
        for (const sub of subscriptionsOf(rows)) {
          seen.subscriptions += 1;
          const history = sub.priceHistory;
          expect(history.length).toBeGreaterThan(0);
          const first = sub.charges[0];
          expect(history[0]).toEqual({ date: first?.date, amountCents: first?.amountCents });
          for (let i = 1; i < history.length; i += 1) {
            expect(history[i]?.amountCents).not.toBe(history[i - 1]?.amountCents);
          }
          for (const entry of history) {
            const charge = sub.charges.find((c) => c.date === entry.date);
            expect(charge?.amountCents).toBe(entry.amountCents);
          }
          // The history is exactly the charges that differ from their predecessor.
          const expected = sub.charges
            .filter((c, i) => i === 0 || c.amountCents !== sub.charges[i - 1]?.amountCents)
            .map((c) => ({ date: c.date, amountCents: c.amountCents }));
          expect(history).toEqual(expected);
          if (sub.charges.every((c) => c.amountCents === first?.amountCents)) expect(history).toHaveLength(1);
          if (history.length > 1) seen.priceChanges += 1;
        }
      }),
    );
    expectSeen(seen);
    expect(seen.priceChanges).toBeGreaterThan(0);
  });
});
