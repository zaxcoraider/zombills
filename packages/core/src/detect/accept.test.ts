import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { acceptSeries, densityCount, meetsMinimum } from "./accept.js";
import { groupCharges } from "./bands.js";
import { compareContent } from "./content-order.js";
import type { Entry, Group, Series } from "./internal-types.js";
import { matchRefunds } from "./refunds.js";
import { chooseBandCover } from "./segments.js";
import { joinSegments } from "./series.js";
import { charge, credit } from "./test-fixtures.js";
import type { Cadence } from "./types.js";
import { validateElement } from "./validate.js";

const KNOWN = "netflix";
const GENERIC = "merchant:gym";
const UNIDENTIFIED = "unidentified:apple:apple.com/bill 866-712-7753 ca";

/** The single Group of `rows`, built the way the detector does, with refunds matched. */
function groupOf(rows: NormalizedTransaction[]): Group {
  const valid: Omit<Entry, "rank">[] = [];
  rows.forEach((row, index) => {
    const result = validateElement(row, index);
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  const entries = valid.map((entry, rank) => ({ ...entry, rank }));
  const { refunded, refunds } = matchRefunds(entries);
  const groups = groupCharges(entries, refunded, refunds);
  if (groups.length !== 1) throw new Error(`expected one group, got ${groups.length}`);
  return groups[0] as Group;
}

/** A Series whose Regular charges are the given `[date, amount]` pairs of the Group's charges. */
function seriesOf(
  group: Group,
  cadence: Cadence,
  regular: ReadonlyArray<readonly [string, number]>,
): Series {
  const entries = regular.map(([date, amount]) => {
    const found = group.charges.find((c) => c.date.iso === date && c.amountCents === amount);
    if (found === undefined) throw new Error(`no charge ${date} ${amount}`);
    return found;
  });
  const bandIds = group.bands
    .filter((band) => entries.some((e) => band.charges.includes(e)))
    .map((band) => band.id);
  return {
    group,
    cadence,
    regular: entries,
    intervals: [],
    bandIds,
    intro: null,
    cadenceAssumed: false,
    confidence: "low",
  };
}

/** A Series of `amount` charges on `dates`, plus `extra` rows at the same amount in the Group. */
function simple(
  key: string,
  cadence: Cadence,
  dates: string[],
  amounts: number | number[] = 1000,
  extra: string[] = [],
): Series {
  const amountAt = (i: number): number => (typeof amounts === "number" ? amounts : (amounts[i] as number));
  const base = typeof amounts === "number" ? amounts : (amounts[0] as number);
  const rows = [
    ...dates.map((d, i) => charge(d, amountAt(i), key)),
    ...extra.map((d) => charge(d, base, key)),
  ];
  return seriesOf(
    groupOf(rows),
    cadence,
    dates.map((d, i) => [d, amountAt(i)] as const),
  );
}

const MONTHLY = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"];
const WEEKLY = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"];
const YEARLY = ["2024-03-10", "2025-03-10", "2026-03-10"];

describe("meetsMinimum (Req 5.1)", () => {
  describe("known source", () => {
    it("monthly: n = 2 is high, n = 1 is rejected", () => {
      expect(meetsMinimum(simple(KNOWN, "monthly", MONTHLY.slice(0, 2)))).toBe("high");
      expect(meetsMinimum(simple(KNOWN, "monthly", MONTHLY.slice(0, 1)))).toBeNull();
    });

    it("yearly: n = 2 is high, n = 1 is rejected", () => {
      expect(meetsMinimum(simple(KNOWN, "yearly", YEARLY.slice(0, 2)))).toBe("high");
      expect(meetsMinimum(simple(KNOWN, "yearly", YEARLY.slice(0, 1)))).toBeNull();
    });

    it("weekly: n = 3 is high, n = 2 is rejected", () => {
      expect(meetsMinimum(simple(KNOWN, "weekly", WEEKLY.slice(0, 3)))).toBe("high");
      expect(meetsMinimum(simple(KNOWN, "weekly", WEEKLY.slice(0, 2)))).toBeNull();
    });
  });

  describe.each([
    ["generic", GENERIC],
    ["unidentified", UNIDENTIFIED],
  ])("%s source", (_name, key) => {
    it("monthly: n = 3 is high", () => {
      expect(meetsMinimum(simple(key, "monthly", MONTHLY.slice(0, 3)))).toBe("high");
      expect(meetsMinimum(simple(key, "monthly", MONTHLY))).toBe("high");
    });

    it("monthly: n = 2 with equal amounts is medium", () => {
      expect(meetsMinimum(simple(key, "monthly", MONTHLY.slice(0, 2)))).toBe("medium");
    });

    it("monthly: n = 2 with unequal amounts is rejected", () => {
      expect(meetsMinimum(simple(key, "monthly", MONTHLY.slice(0, 2), [1000, 1020]))).toBeNull();
      expect(meetsMinimum(simple(key, "monthly", MONTHLY.slice(0, 2), [1000, 1001]))).toBeNull();
    });

    it("monthly: n = 1 is rejected", () => {
      expect(meetsMinimum(simple(key, "monthly", MONTHLY.slice(0, 1)))).toBeNull();
    });

    it("yearly: n = 2 is medium, n = 3 is high, n = 1 is rejected", () => {
      expect(meetsMinimum(simple(key, "yearly", YEARLY.slice(0, 2)))).toBe("medium");
      expect(meetsMinimum(simple(key, "yearly", YEARLY))).toBe("high");
      expect(meetsMinimum(simple(key, "yearly", YEARLY.slice(0, 1)))).toBeNull();
    });

    it("yearly: n = 2 with unequal amounts is still medium", () => {
      expect(meetsMinimum(simple(key, "yearly", YEARLY.slice(0, 2), [1000, 1020]))).toBe("medium");
    });

    it("weekly is always rejected", () => {
      for (const n of [1, 2, 3, 5]) {
        expect(meetsMinimum(simple(key, "weekly", WEEKLY.slice(0, n)))).toBeNull();
      }
    });
  });
});

describe("densityCount and acceptSeries (Req 5.6)", () => {
  it("counts only the Regular charges when nothing else is in the span", () => {
    expect(densityCount(simple(GENERIC, "monthly", MONTHLY))).toBe(4);
  });

  it("m = 2n − 2 is kept and m = 2n − 1 is rejected", () => {
    // n = 3: kept at m = 4, rejected at m = 5.
    const three = MONTHLY.slice(0, 3);
    const kept = simple(GENERIC, "monthly", three, 1000, ["2026-02-20"]);
    expect(densityCount(kept)).toBe(4);
    expect(acceptSeries(kept)).toBe("high");

    const rejected = simple(GENERIC, "monthly", three, 1000, ["2026-02-20", "2026-02-25"]);
    expect(densityCount(rejected)).toBe(5);
    expect(acceptSeries(rejected)).toBeNull();
  });

  it("applies to known sources: n = 2 is kept at m = 2 and rejected at m = 3", () => {
    const two = MONTHLY.slice(0, 2);
    expect(acceptSeries(simple(KNOWN, "monthly", two))).toBe("high");
    const rejected = simple(KNOWN, "monthly", two, 1000, ["2026-01-20"]);
    expect(densityCount(rejected)).toBe(3);
    expect(acceptSeries(rejected)).toBeNull();
  });

  it("returns null for a Series below its minimum whatever its density", () => {
    expect(acceptSeries(simple(GENERIC, "monthly", MONTHLY.slice(0, 2), [1000, 1020]))).toBeNull();
    expect(acceptSeries(simple(GENERIC, "weekly", WEEKLY))).toBeNull();
  });

  it("returns the medium confidence of a generic n = 2 Series", () => {
    expect(acceptSeries(simple(GENERIC, "monthly", MONTHLY.slice(0, 2)))).toBe("medium");
  });

  it("does not count the Introductory charge's band", () => {
    // Netflix 100 intro on 01-10, 1499 on 02-10 and 03-10. Two more 100 charges lie inside the
    // span; they are not in a band of the Regular charges, so m = 2 < 3 and the Series is kept.
    const group = groupOf([
      charge("2026-01-10", 100, KNOWN),
      charge("2026-02-10", 1499, KNOWN),
      charge("2026-02-15", 100, KNOWN),
      charge("2026-02-20", 100, KNOWN),
      charge("2026-03-10", 1499, KNOWN),
    ]);
    const series = seriesOf(group, "monthly", [
      ["2026-02-10", 1499],
      ["2026-03-10", 1499],
    ]);
    series.intro = group.charges.find((c) => c.date.iso === "2026-01-10") ?? null;
    expect(series.bandIds).toHaveLength(1);
    expect(densityCount(series)).toBe(2);
    expect(acceptSeries(series)).toBe("high");
  });

  it("counts every band of the Regular charges", () => {
    // 1549, 1549 and 1799: n = 3; the 1549 band holds one extra charge and the 1799 band none.
    const group = groupOf([
      charge("2026-01-02", 1549, KNOWN),
      charge("2026-02-02", 1549, KNOWN),
      charge("2026-02-10", 1549, KNOWN),
      charge("2026-03-02", 1799, KNOWN),
    ]);
    const series = seriesOf(group, "monthly", [
      ["2026-01-02", 1549],
      ["2026-02-02", 1549],
      ["2026-03-02", 1799],
    ]);
    expect(series.bandIds).toEqual([0, 1]);
    expect(densityCount(series)).toBe(4);
    expect(acceptSeries(series)).toBe("high");
  });

  it("does not count refunded charges", () => {
    const rows = [
      ...["2026-01-05", "2026-02-05", "2026-03-05"].map((d) => charge(d, 1000, GENERIC)),
      charge("2026-02-10", 1000, GENERIC),
      credit("2026-02-12", 1000, GENERIC),
      charge("2026-02-20", 1000, GENERIC),
      credit("2026-02-21", 1000, GENERIC),
    ];
    const group = groupOf(rows);
    expect(group.charges).toHaveLength(3);
    const series = seriesOf(
      group,
      "monthly",
      ["2026-01-05", "2026-02-05", "2026-03-05"].map((d) => [d, 1000] as const),
    );
    expect(densityCount(series)).toBe(3);
    expect(acceptSeries(series)).toBe("high");
  });

  it("does not count charges just outside the span", () => {
    const three = MONTHLY.slice(0, 3);
    const outside = simple(GENERIC, "monthly", three, 1000, ["2026-01-04", "2026-03-06", "2025-12-01"]);
    expect(densityCount(outside)).toBe(3);
    expect(acceptSeries(outside)).toBe("high");
  });

  it("counts charges on the first and last day of the span", () => {
    const three = MONTHLY.slice(0, 3);
    const edge = simple(GENERIC, "monthly", three, 1000, ["2026-01-05", "2026-03-05"]);
    expect(densityCount(edge)).toBe(5);
    expect(acceptSeries(edge)).toBeNull();
  });

  describe("Req 3.11 examples through the pipeline", () => {
    function accepted(rows: NormalizedTransaction[]): Array<[number, number, string | null]> {
      const group = groupOf(rows);
      const segments = group.bands.flatMap((band) => chooseBandCover(band, group.source));
      return joinSegments(group, segments).map((s) => [
        s.regular.length,
        densityCount(s),
        acceptSeries(s),
      ]);
    }

    it("iCloud+ 99 × 3 with one app purchase: n = 3, m = 4, kept", () => {
      const result = accepted([
        charge("2026-01-12", 99, UNIDENTIFIED),
        charge("2026-02-12", 99, UNIDENTIFIED),
        charge("2026-03-12", 99, UNIDENTIFIED),
        charge("2026-01-20", 99, UNIDENTIFIED),
      ]);
      expect(result).toEqual([[3, 4, "high"]]);
    });

    it("iCloud+ with two app purchases: m = 5, rejected", () => {
      const result = accepted([
        charge("2026-01-12", 99, UNIDENTIFIED),
        charge("2026-02-12", 99, UNIDENTIFIED),
        charge("2026-03-12", 99, UNIDENTIFIED),
        charge("2026-01-20", 99, UNIDENTIFIED),
        charge("2026-02-25", 99, UNIDENTIFIED),
      ]);
      expect(result.length).toBeGreaterThan(0);
      for (const [, , confidence] of result) expect(confidence).toBeNull();
    });

    it("coffee n = 3, m = 6 is rejected", () => {
      const series = simple(GENERIC, "monthly", MONTHLY.slice(0, 3), 450, [
        "2026-01-20",
        "2026-02-20",
        "2026-03-01",
      ]);
      expect(series.regular).toHaveLength(3);
      expect(densityCount(series)).toBe(6);
      expect(acceptSeries(series)).toBeNull();
    });

    it("generic 999 n = 4, m = 6 is kept", () => {
      const series = simple(GENERIC, "monthly", MONTHLY, 999, ["2026-02-20", "2026-03-20"]);
      expect(series.regular).toHaveLength(4);
      expect(densityCount(series)).toBe(6);
      expect(acceptSeries(series)).toBe("high");
    });
  });
});
