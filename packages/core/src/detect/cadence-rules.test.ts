import { describe, expect, it } from "vitest";
import {
  ENDED_GRACE_DAYS,
  LATE_MAX_DAYS,
  LATE_MIN_DAYS,
  MAX_K,
  MIN_GAP_DAYS,
  TOLERANCE_DAYS,
  WINDOW_DAYS,
  addPeriods,
} from "./cadence-rules.js";
import { addMonths, parseIsoDate } from "./dates.js";
import type { CivilDate } from "./internal-types.js";

function date(iso: string): CivilDate {
  const parsed = parseIsoDate(iso);
  if (parsed === null) throw new Error(`bad test date ${iso}`);
  return parsed;
}

describe("cadence tables equal the design table", () => {
  it("TOLERANCE_DAYS", () => {
    expect(TOLERANCE_DAYS).toEqual({ weekly: 2, monthly: 3, yearly: 7 });
  });
  it("MAX_K", () => {
    expect(MAX_K).toEqual({ weekly: 2, monthly: 2, yearly: 1 });
  });
  it("MIN_GAP_DAYS", () => {
    expect(MIN_GAP_DAYS).toEqual({ weekly: 5, monthly: 25, yearly: 358 });
  });
  it("WINDOW_DAYS from / to", () => {
    expect(WINDOW_DAYS.from).toEqual({ weekly: 5, monthly: 25, yearly: 358 });
    expect(WINDOW_DAYS.to).toEqual({ weekly: 16, monthly: 65, yearly: 373 });
  });
  it("LATE_MIN_DAYS and LATE_MAX_DAYS (monthly only)", () => {
    expect(LATE_MIN_DAYS.monthly).toBe(4);
    expect(LATE_MAX_DAYS.monthly).toBe(10);
  });
  it("ENDED_GRACE_DAYS", () => {
    expect(ENDED_GRACE_DAYS).toEqual({ weekly: 2, monthly: 10, yearly: 7 });
  });
});

describe("cadence tables are frozen", () => {
  const tables = {
    TOLERANCE_DAYS,
    MAX_K,
    MIN_GAP_DAYS,
    "WINDOW_DAYS.from": WINDOW_DAYS.from,
    "WINDOW_DAYS.to": WINDOW_DAYS.to,
    WINDOW_DAYS,
    LATE_MIN_DAYS,
    LATE_MAX_DAYS,
    ENDED_GRACE_DAYS,
  };
  for (const [name, table] of Object.entries(tables)) {
    it(name, () => {
      expect(Object.isFrozen(table)).toBe(true);
    });
  }
});

describe("addPeriods", () => {
  const starts = ["2026-01-31", "2024-02-29", "2026-03-27", "2025-12-31"];
  const ks = [-3, -2, -1, 0, 1, 2, 5];

  it("weekly adds 7k days", () => {
    for (const iso of starts) {
      const d = date(iso);
      for (const k of ks) expect(addPeriods(d, "weekly", k).day).toBe(d.day + 7 * k);
    }
    expect(addPeriods(date("2026-01-30"), "weekly", 1).iso).toBe("2026-02-06");
  });

  it("monthly equals addMonths(d, k)", () => {
    for (const iso of starts) {
      const d = date(iso);
      for (const k of ks) expect(addPeriods(d, "monthly", k)).toEqual(addMonths(d, k));
    }
    expect(addPeriods(date("2026-01-31"), "monthly", 1).iso).toBe("2026-02-28");
    expect(addPeriods(date("2026-03-27"), "monthly", -1).iso).toBe("2026-02-27");
  });

  it("yearly equals addMonths(d, 12k)", () => {
    for (const iso of starts) {
      const d = date(iso);
      for (const k of ks) expect(addPeriods(d, "yearly", k)).toEqual(addMonths(d, 12 * k));
    }
    expect(addPeriods(date("2024-02-29"), "yearly", 1).iso).toBe("2025-02-28");
  });
});
