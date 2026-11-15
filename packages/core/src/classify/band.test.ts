import { describe, expect, it } from "vitest";
import { detectSubscriptions } from "../detect/detect-subscriptions.js";
import { charge } from "../detect/test-fixtures.js";
import type { Cadence } from "../detect/types.js";
import { CADENCE_FACTOR, isBandRise } from "./band.js";
import { makeSubscription } from "./test-fixtures.js";

/** The glossary rule, with no rounding and no overflow: (to − from) × 20 > from. */
function bandRiseBigInt(from: number, to: number): boolean {
  return (BigInt(to) - BigInt(from)) * 20n > BigInt(from);
}

describe("isBandRise: design examples", () => {
  it.each([
    [1549, 1799, true],
    [1000, 1050, false],
    [1000, 1051, true],
    [775, 812, false],
    [1000, 1080, true],
    [999, 1049, true],
    [999, 1029, false],
  ])("%i → %i is %s", (from, to, expected) => {
    expect(isBandRise(from, to)).toBe(expected);
  });

  it("is false for an equal amount and for falling amounts", () => {
    expect(isBandRise(1000, 1000)).toBe(false);
    expect(isBandRise(1000, 999)).toBe(false);
    expect(isBandRise(1000, 1)).toBe(false);
    expect(isBandRise(1, 1)).toBe(false);
  });

  it("is true for 0 → 1", () => {
    expect(isBandRise(0, 1)).toBe(true);
  });
});

describe("isBandRise: amounts near Number.MAX_SAFE_INTEGER", () => {
  const MAX = Number.MAX_SAFE_INTEGER;
  const from = MAX - 1000;
  const band = Math.floor(from / 20);

  it("agrees with the BigInt rule around the band edge", () => {
    for (const to of [from + band - 1, from + band, from + band + 1, MAX]) {
      if (!Number.isSafeInteger(to)) continue;
      expect(isBandRise(from, to)).toBe(bandRiseBigInt(from, to));
    }
  });

  it("agrees with the BigInt rule for large pairs", () => {
    const pairs: [number, number][] = [
      [MAX - 1, MAX],
      [MAX, MAX],
      [1, MAX],
      [Math.floor(MAX / 2), MAX],
      [Math.floor(MAX / 21), MAX],
      [Math.floor(MAX / 21) + 1, MAX],
      [MAX - 20, MAX],
      [0, MAX],
    ];
    for (const [a, b] of pairs) {
      expect(isBandRise(a, b)).toBe(bandRiseBigInt(a, b));
    }
  });

  it("decides the exact edge (20 × to − 20 × from = from + 1 is a rise, = from is not)", () => {
    const f = 20 * 1_000_000_000_000; // band is exactly 1e12
    expect(isBandRise(f, f + 1_000_000_000_000)).toBe(false);
    expect(isBandRise(f, f + 1_000_000_000_001)).toBe(true);
  });
});

describe("CADENCE_FACTOR", () => {
  it("has the three factors and is frozen", () => {
    expect(CADENCE_FACTOR).toEqual({ weekly: 52, monthly: 12, yearly: 1 });
    expect(Object.isFrozen(CADENCE_FACTOR)).toBe(true);
  });

  const FIXTURES: [Cadence, string[]][] = [
    ["weekly", ["2026-01-05", "2026-01-12", "2026-01-19"]],
    ["monthly", ["2026-01-10", "2026-02-10"]],
    ["yearly", ["2025-03-15", "2026-03-15"]],
  ];

  it.each(FIXTURES)("agrees with the detector for %s", (cadence, dates) => {
    const rows = dates.map((date) => charge(date, 1299, "netflix"));
    const result = detectSubscriptions(rows);
    expect(result.subscriptions).toHaveLength(1);
    const found = result.subscriptions[0];
    expect(found?.cadence).toBe(cadence);
    expect(found?.yearlyCostCents).toBe((found?.currentAmountCents ?? 0) * CADENCE_FACTOR[cadence]);
    expect(found?.currentAmountCents).toBe(1299);
  });
});

describe("makeSubscription", () => {
  it("derives every field of a 3-charge monthly fixture", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 999],
        ["2026-02-10", 999],
        ["2026-03-10", 1299],
      ],
    });
    expect(s.priceHistory).toEqual([
      { date: "2026-01-10", amountCents: 999 },
      { date: "2026-03-10", amountCents: 1299 },
    ]);
    expect(s.currentAmountCents).toBe(1299);
    expect(s.yearlyCostCents).toBe(1299 * 12);
    expect(s.evidence.regularChargeCount).toBe(3);
    expect(s.evidence.firstChargeDate).toBe("2026-01-10");
    expect(s.evidence.lastChargeDate).toBe("2026-03-10");
    expect(s.evidence.nextExpectedDate).toBe("2026-04-10");
    expect(s.evidence.startedInStatement).toBe(false);
    expect(s.evidence.introCharge).toBeNull();
    expect(s.labels).toEqual([]);
    expect(s.charges.map((c) => c.date)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });

  it("puts an intro first, outside the regular charge count", () => {
    const s = makeSubscription({
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    expect(s.charges).toHaveLength(3);
    expect(s.evidence.introCharge).toEqual({ date: "2026-01-10", amountCents: 100 });
    expect(s.evidence.regularChargeCount).toBe(2);
    expect(s.evidence.firstChargeDate).toBe("2026-02-10");
    expect(s.priceHistory[0]).toEqual({ date: "2026-01-10", amountCents: 100 });
  });

  it("uses the literal cadence factors", () => {
    expect(
      makeSubscription({ cadence: "weekly", charges: [["2026-01-05", 100]] }).yearlyCostCents,
    ).toBe(5200);
    expect(
      makeSubscription({ cadence: "yearly", charges: [["2026-01-05", 100]] }).yearlyCostCents,
    ).toBe(100);
  });
});
