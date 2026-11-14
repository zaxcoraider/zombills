import { describe, expect, it } from "vitest";
import { addMonths, parseIsoDate } from "./dates.js";
import type { CivilDate } from "./internal-types.js";
import { classifyStep, deviation, expectedDays } from "./schedule.js";
import type { Cadence } from "./types.js";

function date(iso: string): CivilDate {
  const parsed = parseIsoDate(iso);
  if (parsed === null) throw new Error(`bad test date ${iso}`);
  return parsed;
}

/** Deviation of `b` after `a` with the anchor equal to `a` (index 0). */
function dev(a: string, b: string, cadence: Cadence, k: 1 | 2 = 1): number {
  const prev = date(a);
  return deviation(prev, date(b), expectedDays(prev, prev, 0, cadence, k), cadence, k);
}

/** Classification of `b` after `a` with the anchor equal to `a` (index 0). */
function classify(a: string, b: string, cadence: Cadence) {
  const prev = date(a);
  return classifyStep(prev, date(b), prev, 0, cadence);
}

describe("month-end alternative", () => {
  it("2026-02-28 → 2026-03-31 has deviation 0", () => {
    expect(dev("2026-02-28", "2026-03-31", "monthly")).toBe(0);
  });
  it("2026-01-31 → 2026-02-28 has deviation 0", () => {
    expect(dev("2026-01-31", "2026-02-28", "monthly")).toBe(0);
  });
  it("lists the month-end alternative after the forward date", () => {
    const prev = date("2026-02-28");
    expect(expectedDays(prev, prev, 0, "monthly", 1)).toContain(date("2026-03-31").day);
  });
  it("only monthly has the alternative", () => {
    const prev = date("2026-02-28");
    expect(expectedDays(prev, prev, 0, "weekly", 1)).toHaveLength(2);
    expect(expectedDays(prev, prev, 0, "monthly", 1)).toHaveLength(4);
  });
});

describe("backward check", () => {
  it("2026-03-01 → 2026-03-27 is on schedule (2 days)", () => {
    expect(dev("2026-03-01", "2026-03-27", "monthly")).toBe(2);
    expect(classify("2026-03-01", "2026-03-27", "monthly").k1).toBe(2);
  });
  it("yearly 2023-03-07 → 2024-02-28 is on schedule (7 days)", () => {
    expect(dev("2023-03-07", "2024-02-28", "yearly")).toBe(7);
    expect(classify("2023-03-07", "2024-02-28", "yearly").k1).toBe(7);
  });
  it("2026-01-15 → 2026-02-26 is still off", () => {
    expect(classify("2026-01-15", "2026-02-26", "monthly").k1).toBeNull();
  });
  it("Greenleaf 2026-01-05 → 2026-03-09 with k = 2 is still off", () => {
    expect(dev("2026-01-05", "2026-03-09", "monthly", 2)).toBe(4);
    expect(classify("2026-01-05", "2026-03-09", "monthly").k2).toBeNull();
  });
});

describe("anchor rule", () => {
  const anchor = date("2026-01-01");

  it("refuses 04-28 after 04-10 although it is 3 days from addMonths(anchor, 4)", () => {
    // Charges 02-04, 03-07, 04-10 are each 3 days late; 04-10 has period index 3.
    const prev = date("2026-04-10");
    const candidate = date("2026-04-28");
    const expected = expectedDays(prev, anchor, 3, "monthly", 1);
    expect(expected).toContain(addMonths(anchor, 4).day);
    expect(deviation(prev, candidate, expected, "monthly", 1)).toBeGreaterThan(3);
    expect(classifyStep(prev, candidate, anchor, 3, "monthly").k1).toBeNull();
  });

  it("accepts the drifting charges 02-04, 03-07 and 04-10", () => {
    expect(classifyStep(date("2026-01-01"), date("2026-02-04"), anchor, 0, "monthly").k1).toBe(3);
    expect(classifyStep(date("2026-02-04"), date("2026-03-07"), anchor, 1, "monthly").k1).toBe(3);
    expect(classifyStep(date("2026-03-07"), date("2026-04-10"), anchor, 2, "monthly").k1).toBe(3);
  });

  it("uses the anchor date at exactly 25 days after the previous charge, not at 24", () => {
    const first = date("2025-12-01");
    const prev = date("2026-01-08");
    const expected = expectedDays(prev, first, 1, "monthly", 1);
    const at25 = date("2026-02-02");
    const at24 = date("2026-02-01");
    expect(at25.day - prev.day).toBe(25);
    expect(at24.day - prev.day).toBe(24);
    expect(deviation(prev, at25, expected, "monthly", 1)).toBe(1);
    expect(deviation(prev, at24, expected, "monthly", 1)).toBeGreaterThan(3);
  });

  it("applies the month-end alternative to the anchor", () => {
    const first = date("2026-01-31");
    const prev = date("2026-03-04");
    const expected = expectedDays(prev, first, 2, "monthly", 1);
    expect(expected).toContain(date("2026-04-30").day);
    expect(deviation(prev, date("2026-04-30"), expected, "monthly", 1)).toBe(0);
  });

  it("weekly anchor date is f + 7(j + k)", () => {
    const first = date("2026-01-05");
    const prev = date("2026-01-20");
    const expected = expectedDays(prev, first, 2, "weekly", 1);
    expect(expected).toContain(date("2026-01-26").day);
  });
});

describe("late window", () => {
  it.each([
    ["2026-02-14", 4],
    ["2026-02-20", 10],
  ])("%s is %i days after addMonths(a, 1), so late", (iso, lateness) => {
    expect(addMonths(date("2026-01-10"), 1).day + lateness).toBe(date(iso).day);
    const result = classify("2026-01-10", iso, "monthly");
    expect(result.late).toBe(lateness);
    expect(result.k1).toBeNull();
  });

  it("3 days late is on schedule, not late", () => {
    const result = classify("2026-01-10", "2026-02-13", "monthly");
    expect(result.k1).toBe(3);
    expect(result.late).toBeNull();
  });

  it("11 days late is neither", () => {
    const result = classify("2026-01-10", "2026-02-21", "monthly");
    expect(result).toEqual({ k1: null, k2: null, late: null });
  });

  it("weekly and yearly never give late", () => {
    expect(classify("2026-01-05", "2026-01-19", "weekly").late).toBeNull();
    expect(classify("2026-01-05", "2026-01-16", "weekly").late).toBeNull();
    expect(classify("2026-01-05", "2027-01-20", "yearly").late).toBeNull();
    expect(classify("2026-01-05", "2027-01-17", "yearly").late).toBeNull();
  });
});

describe("allowed k", () => {
  it("weekly k = 2 is accepted", () => {
    expect(classify("2026-01-05", "2026-01-19", "weekly")).toEqual({ k1: null, k2: 0, late: null });
  });
  it("monthly k = 2 is accepted", () => {
    expect(classify("2026-01-10", "2026-03-10", "monthly").k2).toBe(0);
  });
  it("yearly k = 2 is refused", () => {
    expect(classify("2024-03-10", "2026-03-10", "yearly")).toEqual({
      k1: null,
      k2: null,
      late: null,
    });
  });
});

describe("tolerance edges", () => {
  it.each([
    ["weekly", "2026-01-05", "2026-01-10", "2026-01-14", "2026-01-09", "2026-01-15"],
    ["monthly", "2026-01-10", "2026-02-07", "2026-02-13", "2026-02-06", "2026-02-14"],
    ["yearly", "2026-01-10", "2027-01-03", "2027-01-17", "2027-01-02", "2027-01-18"],
  ] as const)(
    "%s accepts the edge and refuses one day more",
    (cadence, from, earlyEdge, lateEdge, earlyOut, lateOut) => {
      expect(classify(from, earlyEdge, cadence).k1).not.toBeNull();
      expect(classify(from, lateEdge, cadence).k1).not.toBeNull();
      expect(classify(from, earlyOut, cadence).k1).toBeNull();
      expect(classify(from, lateOut, cadence).k1).toBeNull();
    },
  );

  it("tolerances are ±2, ±3 and ±7 days", () => {
    expect(dev("2026-01-05", "2026-01-14", "weekly")).toBe(2);
    expect(dev("2026-01-05", "2026-01-15", "weekly")).toBe(3);
    expect(dev("2026-01-10", "2026-02-13", "monthly")).toBe(3);
    expect(dev("2026-01-10", "2026-02-14", "monthly")).toBe(4);
    expect(dev("2026-01-10", "2027-01-17", "yearly")).toBe(7);
    expect(dev("2026-01-10", "2027-01-18", "yearly")).toBe(8);
  });
});
