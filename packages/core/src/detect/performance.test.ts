// Comparison bound and timing (Req 11.14, 12.5). The bound is counted, not timed, so it does
// not depend on CI speed; only the two 10,000-transaction inputs are timed, with
// `performance.now()` here in the test file (the detector never reads the clock, Req 12.3).

import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { dayNumber, fromDayNumber } from "./dates.js";
import { detectSubscriptions, detectSubscriptionsCounted } from "./detect-subscriptions.js";
import type { ComparisonCounter } from "./internal-types.js";
import { driftingLateDates } from "./test-arbitraries.js";
import { charge } from "./test-fixtures.js";

const COMPARISON_FACTOR = 24;
const TIME_LIMIT_MS = 2000;
const KEYS = { known: "netflix", generic: "merchant:gym" } as const;
type Source = keyof typeof KEYS;
const SOURCES: readonly Source[] = ["known", "generic"];
const START_DAY = dayNumber(2026, 1, 1);

function count(transactions: readonly NormalizedTransaction[]): number {
  const counter: ComparisonCounter = { comparisons: 0 };
  detectSubscriptionsCounted(transactions, undefined, counter);
  return counter.comparisons;
}

/** `b` equal charges on consecutive days. */
function consecutiveDays(b: number, key: string): NormalizedTransaction[] {
  return Array.from({ length: b }, (_, i) => charge(fromDayNumber(START_DAY + i).iso, 999, key));
}

/** 10 interleaved monthly chains of `b / 10` charges, every fourth step 7 days late. */
function driftingChains(b: number, key: string): NormalizedTransaction[] {
  const dates = driftingLateDates({
    chains: 10,
    steps: b / 10,
    start: fromDayNumber(START_DAY),
    lateDays: [7],
    continuations: ["from-late", "from-previous"],
  });
  return dates.map((date) => charge(date, 999, key));
}

/** Charges of 500 other merchants, one amount each and spread over two years. */
function filler(n: number): NormalizedTransaction[] {
  return Array.from({ length: n }, (_, i) =>
    charge(fromDayNumber(START_DAY + ((i * 7) % 700)).iso, 100 + ((i * 37) % 9000), `merchant:filler-${i % 500}`),
  );
}

function isWeekday(day: number): boolean {
  // 2026-01-01 is a Thursday; day numbers count from the same civil epoch for every date.
  const offset = (day - START_DAY + 3) % 7; // 0 = Monday
  return offset < 5;
}

function weekdayLunches(): NormalizedTransaction[] {
  const rows: NormalizedTransaction[] = [];
  for (let day = START_DAY; day < START_DAY + 365; day += 1) {
    if (isWeekday(day)) rows.push(charge(fromDayNumber(day).iso, 1050, "merchant:lunch"));
  }
  return rows;
}

function timed(transactions: readonly NormalizedTransaction[]): number {
  detectSubscriptions(transactions); // warm-up
  const before = performance.now();
  detectSubscriptions(transactions);
  return performance.now() - before;
}

describe("comparison bound (Req 11.14)", () => {
  for (const b of [100, 1000]) {
    for (const source of SOURCES) {
      it(`${b} equal charges on consecutive days (${source}): comparisons ≤ 24 × b²`, () => {
        const comparisons = count(consecutiveDays(b, KEYS[source]));
        expect(comparisons).toBeGreaterThan(0);
        expect(comparisons).toBeLessThanOrEqual(COMPARISON_FACTOR * b * b);
      });

      it(`${b} charges in 10 drifting chains with late steps (${source}): comparisons ≤ 24 × b²`, () => {
        const rows = driftingChains(b, KEYS[source]);
        expect(rows).toHaveLength(b);
        const comparisons = count(rows);
        expect(comparisons).toBeGreaterThan(0);
        expect(comparisons).toBeLessThanOrEqual(COMPARISON_FACTOR * b * b);
      });
    }
  }

  it("two calls with separate counters give equal counts", () => {
    const rows = driftingChains(100, KEYS.known);
    const first = count(rows);
    const second = count(rows);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
  });
});

describe("timing of 10,000 transactions (Req 11.14)", () => {
  it("a band of 1,000 equal charges plus filler takes under 2 s", () => {
    const rows = [...consecutiveDays(1000, KEYS.generic), ...filler(9000)];
    expect(rows).toHaveLength(10_000);
    expect(timed(rows)).toBeLessThan(TIME_LIMIT_MS);
  });

  it("a year of weekday lunches at 1050 plus filler takes under 2 s", () => {
    const lunches = weekdayLunches();
    expect(lunches.length).toBeGreaterThanOrEqual(260);
    const rows = [...lunches, ...filler(10_000 - lunches.length)];
    expect(rows).toHaveLength(10_000);
    expect(timed(rows)).toBeLessThan(TIME_LIMIT_MS);
  });
});
