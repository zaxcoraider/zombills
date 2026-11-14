// Cadence properties P8, P9 and P10 (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { addMonths, fromDayNumber, parseIsoDate } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import {
  type GeneratedSeries,
  habitArb,
  merchantArb,
  monthlySeriesArb,
  unrelatedChargesArb,
  validTxArb,
  weeklySeriesArb,
  yearlyPairArb,
} from "./test-arbitraries.js";
import type { Subscription } from "./types.js";

function ofKey(rows: readonly NormalizedTransaction[], key: string): Subscription[] {
  return detectSubscriptions(rows).subscriptions.filter((sub) => sub.merchantKey === key);
}

function datesOf(rows: readonly NormalizedTransaction[]): string[] {
  return rows.map((tx) => tx.date);
}

/** A series with random transactions of other keys and unrelated purchases around it. */
function withNoiseArb(series: GeneratedSeries): fc.Arbitrary<NormalizedTransaction[]> {
  const key = series.merchant.key;
  return fc
    .tuple(
      fc.array(
        validTxArb.filter((tx) => tx.merchant.key !== key),
        { maxLength: 8 },
      ),
      unrelatedChargesArb(series.transactions),
    )
    .map(([noise, unrelated]) => [...series.transactions, ...noise, ...unrelated]);
}

/** P8 for one series: detected whole, then again with each middle charge removed. */
function expectMissedMonthBehaviour(series: GeneratedSeries, noise: readonly NormalizedTransaction[]): void {
  const key = series.merchant.key;
  const rows = series.transactions;
  const whole = ofKey(noise, key);
  expect(whole).toHaveLength(1);
  const sub = whole[0] as Subscription;
  expect(sub.cadence).toBe("monthly");
  expect(datesOf(sub.charges)).toEqual(datesOf(rows));
  expect(sub.evidence.missedPeriods).toBe(0);

  for (let removed = 1; removed < rows.length - 1; removed += 1) {
    const kept = rows.filter((_, i) => i !== removed);
    const input = noise.filter((tx) => !rows.includes(tx) || kept.includes(tx));
    const found = ofKey(input, key);
    expect(found, `charge ${removed} removed`).toHaveLength(1);
    const reduced = found[0] as Subscription;
    expect(reduced.cadence).toBe("monthly");
    expect(reduced.id).toBe(sub.id);
    expect(datesOf(reduced.charges)).toEqual(datesOf(kept));
    expect(reduced.evidence.missedPeriods).toBe(1);
  }
}

describe("cadence properties", () => {
  it("P8: a monthly series among unrelated transactions is one Subscription and survives a missed month", () => {
    fc.assert(
      fc.property(
        monthlySeriesArb().chain((series) => fc.tuple(fc.constant(series), withNoiseArb(series))),
        ([series, input]) => {
          expectMissedMonthBehaviour(series, input);
        },
      ),
    );
  });

  it("P8: anchor days 27 and 28 with a shift of 2 stay one Series (review finding 1)", () => {
    const lateAnchorArb = fc
      .record({
        year: fc.integer({ min: 2020, max: 2028 }),
        month: fc.integer({ min: 1, max: 12 }),
        anchor: fc.constantFrom(27, 28),
        shifts: fc.array(fc.constantFrom(0, 1, 2, 2, 2), { minLength: 4, maxLength: 14 }),
        source: fc.constantFrom<"known" | "generic">("known", "generic"),
      })
      .chain(({ year, month, anchor, shifts, source }) =>
        merchantArb(source).map((merchant): GeneratedSeries => {
          const start = parseIsoDate(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${anchor}`);
          if (start === null) throw new Error("invalid start");
          const transactions = shifts.map((shift, i) => ({
            date: fromDayNumber(addMonths(start, i).day + shift).iso,
            description: merchant.displayName,
            amountCents: 999,
            currency: "USD",
            merchant: { ...merchant },
          }));
          return { transactions, merchant, currency: "USD", amountCents: 999, start: start.iso, shifts };
        }),
      );
    fc.assert(
      fc.property(lateAnchorArb, (series) => {
        expectMissedMonthBehaviour(series, series.transactions);
      }),
    );
  });

  it("P9: exact addMonths series on every anchor day 1 to 31 are one monthly Subscription", () => {
    const seen = new Set<number>();
    fc.assert(
      fc.property(monthlySeriesArb({ maxAnchorDay: 31, minCharges: 3, maxShift: 0 }), (series) => {
        seen.add(parseIsoDate(series.start)?.d ?? 0);
        const found = ofKey(series.transactions, series.merchant.key);
        expect(found).toHaveLength(1);
        expect(found[0]?.cadence).toBe("monthly");
        expect(datesOf(found[0]?.charges ?? [])).toEqual(datesOf(series.transactions));
        expect(found[0]?.evidence.missedPeriods).toBe(0);
      }),
    );
    expect(seen.size).toBeGreaterThan(10);
  });

  it("P9: a series starting on day 29, 30 or 31 is one monthly Subscription", () => {
    const monthEndArb = fc
      .record({
        year: fc.integer({ min: 2020, max: 2028 }),
        month: fc.constantFrom(1, 3, 5, 7, 8, 10, 12),
        count: fc.integer({ min: 3, max: 24 }),
        source: fc.constantFrom<"known" | "generic">("known", "generic"),
      })
      .chain(({ year, month, count, source }) => merchantArb(source).map((merchant) => ({ year, month, count, merchant })));
    fc.assert(
      fc.property(monthEndArb, fc.constantFrom(29, 30, 31), ({ year, month, count, merchant }, wanted) => {
        // the months drawn above all have 31 days, so every wanted day is a real date
        const start = parseIsoDate(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${wanted}`);
        if (start === null) throw new Error("invalid start");
        const rows = Array.from({ length: count }, (_, i) => ({
          date: addMonths(start, i).iso,
          description: merchant.displayName,
          amountCents: 1299,
          currency: "USD",
          merchant: { ...merchant },
        }));
        const found = ofKey(rows, merchant.key);
        expect(found).toHaveLength(1);
        expect(found[0]?.cadence).toBe("monthly");
        expect(found[0]?.charges).toHaveLength(count);
      }),
    );
  });

  it("P9: known weekly charges 7 days apart with a shift of 0 to 2 are one weekly Subscription", () => {
    fc.assert(
      fc.property(weeklySeriesArb, (series) => {
        const found = ofKey(series.transactions, series.merchant.key);
        expect(found).toHaveLength(1);
        expect(found[0]?.cadence).toBe("weekly");
        expect(datesOf(found[0]?.charges ?? [])).toEqual(datesOf(series.transactions));
      }),
    );
  });

  it("P9: a known pair 12 months plus 0 to 7 days apart is one yearly Subscription", () => {
    fc.assert(
      fc.property(yearlyPairArb, (pair) => {
        const found = ofKey(pair.transactions, pair.merchant.key);
        expect(found).toHaveLength(1);
        expect(found[0]?.cadence).toBe("yearly");
        expect(datesOf(found[0]?.charges ?? [])).toEqual([pair.a, pair.b]);
      }),
    );
  });

  it("P10: a 7 or 14 day habit of a generic merchant is no Subscription", () => {
    const seen = { seven: 0, fourteen: 0 };
    fc.assert(
      fc.property(habitArb, (habit) => {
        if (habit.periodDays === 7) seen.seven += 1;
        else seen.fourteen += 1;
        expect(ofKey(habit.transactions, habit.merchant.key)).toEqual([]);
      }),
    );
    expect(seen.seven).toBeGreaterThan(0);
    expect(seen.fourteen).toBeGreaterThan(0);
  });
});
