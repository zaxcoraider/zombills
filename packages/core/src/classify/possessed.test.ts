import { describe, expect, it } from "vitest";
import { classifySubscriptions } from "./classify-subscriptions.js";
import { findPriceRise } from "./possessed.js";
import { makeSubscription } from "./test-fixtures.js";
import type { PriceRise } from "./types.js";
import type { Subscription } from "../detect/types.js";

function rise(s: Subscription): PriceRise | null {
  return classifySubscriptions([s])[0]?.priceRise ?? null;
}

describe("findPriceRise: Req 2.5 rows", () => {
  it("1549 then 1799: possessed with the full priceRise", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-02", 1549],
        ["2026-02-02", 1549],
        ["2026-03-02", 1799],
      ],
    });
    expect(rise(s)).toEqual({
      firstSeen: { date: "2026-01-02", amountCents: 1549 },
      currentAmountCents: 1799,
      latestRise: { fromAmountCents: 1549, toAmountCents: 1799, date: "2026-03-02" },
      increasePerChargeCents: 250,
      increasePerYearCents: 3000,
    });
  });

  it("a single price: not possessed", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-12", 5499],
        ["2026-02-12", 5499],
      ],
    });
    expect(rise(s)).toBeNull();
  });

  it("a price drop: not possessed", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-02", 1799],
        ["2026-02-02", 1799],
        ["2026-03-02", 1549],
      ],
    });
    expect(rise(s)).toBeNull();
  });

  it("rise then fall, still above the first price: possessed", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-02", 1000],
        ["2026-02-02", 1500],
        ["2026-03-02", 1200],
      ],
    });
    expect(rise(s)).toEqual({
      firstSeen: { date: "2026-01-02", amountCents: 1000 },
      currentAmountCents: 1200,
      latestRise: { fromAmountCents: 1000, toAmountCents: 1500, date: "2026-02-02" },
      increasePerChargeCents: 200,
      increasePerYearCents: 2400,
    });
  });

  it("two rises: latestRise is the last one, firstSeen the first price", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-02", 1000],
        ["2026-02-02", 1200],
        ["2026-03-02", 1400],
      ],
    });
    expect(rise(s)).toEqual({
      firstSeen: { date: "2026-01-02", amountCents: 1000 },
      currentAmountCents: 1400,
      latestRise: { fromAmountCents: 1200, toAmountCents: 1400, date: "2026-03-02" },
      increasePerChargeCents: 400,
      increasePerYearCents: 4800,
    });
  });

  it("fall then rise ending below the first price: not possessed", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-02", 1500],
        ["2026-02-02", 1000],
        ["2026-03-02", 1200],
      ],
    });
    expect(rise(s)).toBeNull();
  });

  it("small in-band steps that together cross the band: possessed with latestRise null", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-02", 1000],
        ["2026-02-02", 1040],
        ["2026-03-02", 1080],
      ],
    });
    expect(rise(s)).toEqual({
      firstSeen: { date: "2026-01-02", amountCents: 1000 },
      currentAmountCents: 1080,
      latestRise: null,
      increasePerChargeCents: 80,
      increasePerYearCents: 960,
    });
  });

  it("GBP FX drift within one band: not possessed", () => {
    const s = makeSubscription({
      currency: "GBP",
      charges: [
        ["2026-01-10", 775],
        ["2026-02-10", 798],
        ["2026-03-10", 790],
        ["2026-04-10", 812],
      ],
    });
    expect(rise(s)).toBeNull();
  });

  it("intro charge 100 then 1499: not possessed (that is the trial trap)", () => {
    const s = makeSubscription({
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    expect(rise(s)).toBeNull();
  });

  it("inferred intro 750 then 1499: not possessed", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
      startedInStatement: true,
    });
    expect(rise(s)).toBeNull();
  });

  it("intro charge 100, then 1499, then 1699: possessed from the first full price", () => {
    const s = makeSubscription({
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
        ["2026-04-10", 1699],
      ],
    });
    expect(rise(s)).toEqual({
      firstSeen: { date: "2026-02-10", amountCents: 1499 },
      currentAmountCents: 1699,
      latestRise: { fromAmountCents: 1499, toAmountCents: 1699, date: "2026-04-10" },
      increasePerChargeCents: 200,
      increasePerYearCents: 2400,
    });
  });

  it("weekly 500 then 600: +100 per charge, +5200 a year", () => {
    const s = makeSubscription({
      cadence: "weekly",
      charges: [
        ["2026-01-05", 500],
        ["2026-02-02", 600],
      ],
    });
    expect(rise(s)).toEqual({
      firstSeen: { date: "2026-01-05", amountCents: 500 },
      currentAmountCents: 600,
      latestRise: { fromAmountCents: 500, toAmountCents: 600, date: "2026-02-02" },
      increasePerChargeCents: 100,
      increasePerYearCents: 5200,
    });
  });

  it("yearly 13900 then 14900: +1000 per charge, +1000 a year", () => {
    const s = makeSubscription({
      cadence: "yearly",
      charges: [
        ["2025-01-15", 13900],
        ["2026-01-15", 14900],
      ],
    });
    expect(rise(s)).toEqual({
      firstSeen: { date: "2025-01-15", amountCents: 13900 },
      currentAmountCents: 14900,
      latestRise: { fromAmountCents: 13900, toAmountCents: 14900, date: "2026-01-15" },
      increasePerChargeCents: 1000,
      increasePerYearCents: 1000,
    });
  });
});

describe("findPriceRise: other cases", () => {
  it("firstSeen is a new object, not the priceHistory entry", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-02", 1000],
        ["2026-02-02", 1500],
      ],
    });
    const result = rise(s);
    expect(result?.firstSeen).toEqual(s.priceHistory[0]);
    expect(result?.firstSeen).not.toBe(s.priceHistory[0]);
  });

  it("fewer than 2 paid entries: null", () => {
    const s = makeSubscription({ charges: [["2026-01-02", 1000]] });
    expect(findPriceRise(s, s.priceHistory)).toBeNull();
    expect(findPriceRise(s, [])).toBeNull();
  });
});

describe("findPriceRise: yearly increase beyond the safe-integer range (Req 2.4)", () => {
  const WEEKLY_OVERFLOW_CURRENT = Math.floor(Number.MAX_SAFE_INTEGER / 52) + 2;
  const weekly = (current: number): Subscription =>
    makeSubscription({
      cadence: "weekly",
      charges: [
        ["2026-01-05", 1],
        ["2026-01-12", 1],
        ["2026-01-19", current],
      ],
    });

  it("first 1, current floor(MAX_SAFE / 52) + 2: null", () => {
    const s = weekly(WEEKLY_OVERFLOW_CURRENT);
    expect(WEEKLY_OVERFLOW_CURRENT - 1).toBe(173215370283481);
    expect((WEEKLY_OVERFLOW_CURRENT - 1) * 52).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(rise(s)).toBeNull();
  });

  it("one cent less still gives a priceRise", () => {
    const result = rise(weekly(WEEKLY_OVERFLOW_CURRENT - 1));
    expect(result).not.toBeNull();
    expect(result?.increasePerChargeCents).toBe(173215370283480);
    expect(result?.increasePerYearCents).toBe(9007199254740960);
    expect(Number.isSafeInteger(result?.increasePerYearCents)).toBe(true);
  });
});
