import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Subscription } from "@zombills/core";
import { currencyTotals, groupForDisplay, isCounted } from "./totals";
import { CURRENCIES, subscriptionArb, subscriptionListArb } from "./test-arbitraries";

const currencyOrderArb = fc.shuffledSubarray([...CURRENCIES, "CAD"]);

function referenceTotals(subs: readonly Subscription[]): Map<string, bigint> {
  const sums = new Map<string, bigint>();
  for (const s of subs) {
    if (!isCounted(s)) continue;
    sums.set(s.currency, (sums.get(s.currency) ?? 0n) + BigInt(s.yearlyCostCents));
  }
  return sums;
}

function checkTotals(subs: Subscription[]): void {
  const totals = currencyTotals(subs, CURRENCIES);
  const reference = referenceTotals(subs);
  expect(totals.map((t) => t.currency).sort()).toEqual([...reference.keys()].sort());
  for (const t of totals) {
    expect(Number.isSafeInteger(t.totalCents)).toBe(true);
    expect(BigInt(t.totalCents)).toBe(reference.get(t.currency));
  }
}

describe("totals properties", () => {
  it("P6: totals equal an exact BigInt sum per currency", () => {
    fc.assert(fc.property(fc.array(subscriptionArb, { maxLength: 200 }), checkTotals));
  });

  it("P6: totals stay exact for 10,000 subscriptions over three or more currencies", () => {
    const bigArb = fc
      .array(subscriptionArb, { minLength: 10_000, maxLength: 10_000 })
      .map((subs) =>
        subs.map((s, i): Subscription => ({ ...s, currency: CURRENCIES[i % 3] ?? "USD" })),
      );
    fc.assert(fc.property(bigArb, checkTotals), { numRuns: 50 });
  });

  it("P7: grouping contains every input exactly once, in its own currency's group", () => {
    fc.assert(
      fc.property(subscriptionListArb(40), currencyOrderArb, (subs, order) => {
        const groups = groupForDisplay(subs, currencyTotals(subs, order), order);
        const currencies = groups.map((g) => g.currency);
        expect(new Set(currencies).size).toBe(currencies.length);
        const listed = groups.flatMap((g) => g.subscriptions);
        expect(listed).toHaveLength(subs.length);
        for (const s of subs) {
          expect(listed.filter((x) => x === s)).toHaveLength(1);
        }
        for (const g of groups) {
          expect(g.subscriptions.every((s) => s.currency === g.currency)).toBe(true);
        }
      }),
    );
  });

  it("P8: display order, totals and hasExcluded follow the rules", () => {
    fc.assert(
      fc.property(subscriptionListArb(40), currencyOrderArb, (subs, order) => {
        const groups = groupForDisplay(subs, currencyTotals(subs, order), order);

        const listedOrder = groups.map((g) => g.currency).filter((c) => order.includes(c));
        expect(listedOrder).toEqual(order.filter((c) => listedOrder.includes(c)));

        for (const g of groups) {
          const counted = g.subscriptions.filter(isCounted);
          const rest = g.subscriptions.filter((s) => !isCounted(s));
          expect(g.subscriptions).toEqual([...counted, ...rest]);
          for (const part of [counted, rest]) {
            for (let i = 1; i < part.length; i++) {
              const a = part[i - 1] as Subscription;
              const b = part[i] as Subscription;
              const ordered =
                a.yearlyCostCents > b.yearlyCostCents ||
                (a.yearlyCostCents === b.yearlyCostCents &&
                  (a.merchant < b.merchant || (a.merchant === b.merchant && a.id < b.id)));
              expect(ordered).toBe(true);
            }
          }
          expect(g.total !== null).toBe(counted.length > 0);
          expect(g.hasExcluded).toBe(rest.length > 0);
        }
      }),
    );
  });
});
