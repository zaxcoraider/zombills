// P4 of the subscription classifier (design "Correctness properties"): price-rise arithmetic.
// Runs on both sources of Req 11.1: (a) detector output and (b) hand-built Subscriptions.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PricePoint, Subscription } from "../detect/types.js";
import { classifySubscriptions } from "./classify-subscriptions.js";
import { classifierSubscriptionsArb, detectorOutputArb } from "./test-arbitraries.js";
import { oracle } from "./test-oracle.js";

const SOURCES: readonly (readonly [string, fc.Arbitrary<Subscription[]>])[] = [
  ["detector output", detectorOutputArb],
  ["classifier subscriptions", classifierSubscriptionsArb],
];

/** Literal Cadence factors, written here so the test shares nothing with `src/classify`. */
function factorOf(cadence: Subscription["cadence"]): bigint {
  if (cadence === "weekly") return 52n;
  if (cadence === "monthly") return 12n;
  return 1n;
}

/** Glossary "Band rise" in BigInt: `(to − from) × 20 > from`. */
function bandRise(from: number, to: number): boolean {
  return (BigInt(to) - BigInt(from)) * 20n > BigInt(from);
}

/** Glossary "Paid price history", from the oracle's Inferred intro. */
function paidOf(s: Subscription): readonly PricePoint[] {
  const inferred = oracle(s, undefined).inferredIntro;
  const intro = s.evidence.introCharge;
  const p0 = s.priceHistory[0];
  const dropFirst =
    inferred !== null ||
    (intro !== null &&
      p0 !== undefined &&
      p0.date === intro.date &&
      p0.amountCents === intro.amountCents);
  return dropFirst ? s.priceHistory.slice(1) : s.priceHistory;
}

describe.each(SOURCES)("possessed properties on %s", (_name, source) => {
  it("P4: price-rise arithmetic", () => {
    fc.assert(
      fc.property(source, (subs) => {
        const result = classifySubscriptions(subs);
        result.forEach((r, i) => {
          const s = subs[i] as Subscription;
          const rise = r.priceRise;
          if (rise === null) return;

          const paid = paidOf(s);
          const first = paid[0] as PricePoint;
          expect(first).toBeDefined();

          for (const n of [
            rise.currentAmountCents,
            rise.firstSeen.amountCents,
            rise.increasePerChargeCents,
            rise.increasePerYearCents,
          ]) {
            expect(Number.isSafeInteger(n)).toBe(true);
          }

          expect(rise.currentAmountCents).toBe(s.currentAmountCents);
          expect(rise.firstSeen).toStrictEqual(first);
          expect(rise.increasePerChargeCents).toBe(s.currentAmountCents - first.amountCents);
          expect(BigInt(rise.increasePerChargeCents) * 20n > BigInt(first.amountCents)).toBe(true);

          const factor = factorOf(s.cadence);
          expect(BigInt(rise.increasePerYearCents)).toBe(
            BigInt(rise.increasePerChargeCents) * factor,
          );
          expect(BigInt(rise.increasePerYearCents)).toBe(
            BigInt(s.yearlyCostCents) - BigInt(first.amountCents) * factor,
          );

          // The last consecutive Paid price history pair that is a Band rise.
          let expected: { from: number; to: number; date: string } | null = null;
          for (let k = paid.length - 1; k >= 1; k -= 1) {
            const from = paid[k - 1] as PricePoint;
            const to = paid[k] as PricePoint;
            if (bandRise(from.amountCents, to.amountCents)) {
              expected = { from: from.amountCents, to: to.amountCents, date: to.date };
              break;
            }
          }
          if (expected === null) {
            expect(rise.latestRise).toBeNull();
          } else {
            expect(rise.latestRise).toStrictEqual({
              fromAmountCents: expected.from,
              toAmountCents: expected.to,
              date: expected.date,
            });
          }
        });
      }),
    );
  });
});
