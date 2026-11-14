import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addMonths, parseIsoDate } from "./dates.js";
import {
  driftingLateBandArb,
  habitArb,
  isoDateArb,
  junkElementArb,
  merchantArb,
  monthlySeriesArb,
  unrelatedChargesArb,
  validTxArb,
  weeklySeriesArb,
  yearlyPairArb,
} from "./test-arbitraries.js";
import { validateElement } from "./validate.js";

describe("detector generators", () => {
  it("isoDateArb gives real dates", () => {
    fc.assert(fc.property(isoDateArb, (date) => parseIsoDate(date) !== null));
  });

  it("merchantArb gives identities that pass Req 2.1 for their source", () => {
    for (const source of ["known", "generic", "unidentified"] as const) {
      fc.assert(
        fc.property(merchantArb(source), (merchant) => {
          expect(merchant.source).toBe(source);
          const tx = { date: "2026-01-01", description: "", amountCents: 1, currency: "USD", merchant };
          expect(validateElement(tx, 0).ok).toBe(true);
        }),
      );
    }
  });

  it("every validTxArb value passes validateElement", () => {
    fc.assert(
      fc.property(validTxArb, (tx) => {
        const result = validateElement(tx, 0);
        expect(result.ok).toBe(true);
      }),
    );
  });

  it("validTxArb covers zero, negative and positive amounts and all currencies", () => {
    const rows = fc.sample(validTxArb, { numRuns: 500, seed: 1 });
    expect(rows.some((tx) => tx.amountCents === 0)).toBe(true);
    expect(rows.some((tx) => tx.amountCents < 0)).toBe(true);
    expect(rows.some((tx) => tx.amountCents > 0)).toBe(true);
    expect(new Set(rows.map((tx) => tx.currency))).toEqual(new Set(["USD", "EUR", "GBP"]));
  });

  it("every junkElementArb value fails validateElement", () => {
    fc.assert(
      fc.property(junkElementArb, (value) => {
        const result = validateElement(value, 0);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).not.toBe("");
      }),
      { numRuns: 500 },
    );
  });

  it("monthlySeriesArb gives 4 to 24 charges at one amount, each 0 to 2 days after its month", () => {
    fc.assert(
      fc.property(monthlySeriesArb(), (series) => {
        const rows = series.transactions;
        expect(rows.length).toBeGreaterThanOrEqual(4);
        expect(rows.length).toBeLessThanOrEqual(24);
        expect(series.shifts).toHaveLength(rows.length);
        const start = parseIsoDate(series.start);
        expect(start).not.toBeNull();
        expect(start?.d ?? 99).toBeLessThanOrEqual(28);
        rows.forEach((tx, i) => {
          expect(tx.amountCents).toBe(series.amountCents);
          expect(tx.currency).toBe(series.currency);
          expect(tx.merchant.key).toBe(series.merchant.key);
          expect(["known", "generic"]).toContain(tx.merchant.source);
          expect(validateElement(tx, i).ok).toBe(true);
          const shift = (parseIsoDate(tx.date)?.day ?? 0) - (start === null ? 0 : addMonths(start, i).day);
          expect(shift).toBe(series.shifts[i]);
          expect(shift).toBeGreaterThanOrEqual(0);
          expect(shift).toBeLessThanOrEqual(2);
        });
      }),
    );
  });

  it("monthlySeriesArb honours its options and reaches both sources and late anchor days", () => {
    const rows = fc.sample(monthlySeriesArb({ maxAnchorDay: 31, minCharges: 3, maxShift: 0 }), {
      numRuns: 300,
      seed: 7,
    });
    expect(rows.every((s) => s.transactions.length >= 3 && s.shifts.every((x) => x === 0))).toBe(true);
    expect(rows.some((s) => s.transactions.length === 3)).toBe(true);
    expect(rows.some((s) => (parseIsoDate(s.start)?.d ?? 0) > 28)).toBe(true);
    expect(new Set(rows.map((s) => s.merchant.source))).toEqual(new Set(["known", "generic"]));
  });

  it("weeklySeriesArb gives 3 to 52 known charges 7 days apart plus a shift of 0 to 2", () => {
    fc.assert(
      fc.property(weeklySeriesArb, (series) => {
        const rows = series.transactions;
        expect(rows.length).toBeGreaterThanOrEqual(3);
        expect(rows.length).toBeLessThanOrEqual(52);
        const start = parseIsoDate(series.start)?.day ?? 0;
        rows.forEach((tx, i) => {
          expect(tx.merchant.source).toBe("known");
          expect(tx.amountCents).toBe(series.amountCents);
          const shift = (parseIsoDate(tx.date)?.day ?? 0) - (start + 7 * i);
          expect(shift).toBe(series.shifts[i]);
          expect(shift).toBeGreaterThanOrEqual(0);
          expect(shift).toBeLessThanOrEqual(2);
        });
      }),
    );
  });

  it("yearlyPairArb gives two known charges 12 months plus 0 to 7 days apart, shifting only b", () => {
    fc.assert(
      fc.property(yearlyPairArb, (pair) => {
        expect(pair.transactions).toHaveLength(2);
        expect(pair.transactions[0]?.date).toBe(pair.a);
        expect(pair.transactions[1]?.date).toBe(pair.b);
        expect(pair.transactions[0]?.merchant.source).toBe("known");
        expect(pair.transactions[0]?.amountCents).toBe(pair.transactions[1]?.amountCents);
        const a = parseIsoDate(pair.a);
        const b = parseIsoDate(pair.b);
        expect(a).not.toBeNull();
        expect(b).not.toBeNull();
        if (a === null || b === null) return;
        const shift = b.day - addMonths(a, 12).day;
        expect(shift).toBe(pair.shift);
        expect(shift).toBeGreaterThanOrEqual(0);
        expect(shift).toBeLessThanOrEqual(7);
      }),
    );
  });

  it("driftingLateBandArb gives one key and amount in 2 to 10 chains starting on consecutive days", () => {
    const seen = { known: 0, generic: 0, chains2: 0, chains10: 0 };
    fc.assert(
      fc.property(driftingLateBandArb, (band) => {
        const rows = band.transactions;
        expect(rows.length).toBe(band.chains * band.steps);
        expect(band.chains).toBeGreaterThanOrEqual(2);
        expect(band.chains).toBeLessThanOrEqual(10);
        expect(new Set(rows.map((tx) => tx.merchant.key)).size).toBe(1);
        expect(new Set(rows.map((tx) => tx.amountCents)).size).toBe(1);
        expect(new Set(rows.map((tx) => tx.currency)).size).toBe(1);
        rows.forEach((tx, i) => expect(validateElement(tx, i).ok).toBe(true));
        const starts = rows.filter((_, i) => i % band.steps === 0).map((tx) => parseIsoDate(tx.date)?.day ?? 0);
        starts.forEach((day, i) => expect(day - (starts[0] as number)).toBe(i));
        if (band.merchant.source === "known") seen.known += 1;
        if (band.merchant.source === "generic") seen.generic += 1;
        if (band.chains === 2) seen.chains2 += 1;
        if (band.chains === 10) seen.chains10 += 1;
      }),
      { numRuns: 300 },
    );
    expect(seen.known).toBeGreaterThan(0);
    expect(seen.generic).toBeGreaterThan(0);
    expect(seen.chains2).toBeGreaterThan(0);
    expect(seen.chains10).toBeGreaterThan(0);
  });

  it("habitArb gives a generic habit every 7 or 14 days; the 7-day habit has no gap above 16 days", () => {
    const seen = { seven: 0, fourteen: 0, skipped: 0 };
    fc.assert(
      fc.property(habitArb, (habit) => {
        const rows = habit.transactions;
        expect(rows.length).toBeGreaterThanOrEqual(1);
        rows.forEach((tx, i) => {
          expect(tx.merchant.source).toBe("generic");
          expect(tx.merchant.key).toBe(habit.merchant.key);
          expect(tx.amountCents).toBe(habit.amountCents);
          expect(validateElement(tx, i).ok).toBe(true);
        });
        const days = rows.map((tx) => parseIsoDate(tx.date)?.day ?? 0);
        const gaps = days.slice(1).map((day, i) => day - (days[i] as number));
        for (const gap of gaps) expect(gap).toBeGreaterThan(0);
        if (habit.periodDays === 7) {
          seen.seven += 1;
          if (habit.skippedWeeks.length > 0) seen.skipped += 1;
          for (const gap of gaps) expect(gap).toBeLessThanOrEqual(16);
          habit.skippedWeeks.forEach((week, i) => {
            if (i > 0) expect(week - (habit.skippedWeeks[i - 1] as number)).toBeGreaterThan(1);
          });
        } else {
          seen.fourteen += 1;
          expect(habit.skippedWeeks).toEqual([]);
          for (const gap of gaps) expect(gap).toBeLessThanOrEqual(16);
        }
        for (const shift of habit.shifts) expect(shift).toBeLessThanOrEqual(2);
      }),
    );
    expect(seen.seven).toBeGreaterThan(0);
    expect(seen.fourteen).toBeGreaterThan(0);
    expect(seen.skipped).toBeGreaterThan(0);
  });

  it("unrelatedChargesArb gives fresh generic keys, input currencies and dates inside the input's range", () => {
    let added = 0;
    fc.assert(
      fc.property(
        fc
          .array(fc.oneof(validTxArb, junkElementArb), { maxLength: 10 })
          .chain((input) => fc.tuple(fc.constant(input), unrelatedChargesArb(input))),
        ([input, extra]) => {
          const valid = input.flatMap((element, i) => {
            const checked = validateElement(element, i);
            return checked.ok ? [checked.entry] : [];
          });
          if (valid.length === 0) {
            expect(extra).toEqual([]);
            return;
          }
          const keys = new Set(valid.map((tx) => tx.merchant.key));
          const currencies = new Set(valid.map((tx) => tx.currency));
          const days = valid.map((tx) => tx.date.day);
          const low = Math.min(...days);
          const high = Math.max(...days);
          const addedKeys = new Set<string>();
          extra.forEach((tx, i) => {
            added += 1;
            expect(validateElement(tx, i).ok).toBe(true);
            expect(tx.merchant.source).toBe("generic");
            expect(tx.merchant.key.startsWith("merchant:")).toBe(true);
            expect(keys.has(tx.merchant.key)).toBe(false);
            expect(addedKeys.has(tx.merchant.key)).toBe(false);
            addedKeys.add(tx.merchant.key);
            expect(currencies.has(tx.currency)).toBe(true);
            expect(tx.amountCents).toBeGreaterThan(0);
            const day = parseIsoDate(tx.date)?.day ?? Number.NaN;
            expect(day).toBeGreaterThanOrEqual(low);
            expect(day).toBeLessThanOrEqual(high);
          });
        },
      ),
    );
    expect(added).toBeGreaterThan(0);
  });

  it("unrelatedChargesArb never reuses a key already in the input", () => {
    const input = [1, 2, 3].map((i) => ({
      date: "2026-01-0" + String(i),
      description: "x",
      amountCents: 100,
      currency: "USD",
      merchant: {
        key: `merchant:unrelated-${i - 1}`,
        displayName: "x",
        source: "generic" as const,
        serviceId: null,
        processor: null,
      },
    }));
    for (const extra of fc.sample(unrelatedChargesArb(input), { numRuns: 50, seed: 3 })) {
      for (const tx of extra) expect(input.some((row) => row.merchant.key === tx.merchant.key)).toBe(false);
    }
  });
});
