import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { groupCharges } from "./bands.js";
import { compareContent } from "./content-order.js";
import type { Entry, Group, Segment, Series } from "./internal-types.js";
import { addIntroCharges, joinSegments } from "./series.js";
import { chooseBandCover } from "./segments.js";
import { charge } from "./test-fixtures.js";
import { validateElement } from "./validate.js";

const GENERIC = "merchant:gym";
const KNOWN = "netflix";
const APPLE = "unidentified:apple:apple.com/bill 866-712-7753 ca";

/** The single Group of `rows`, built the way the detector does (Content order, ranks, bands). */
function groupOf(rows: NormalizedTransaction[]): Group {
  const valid: Omit<Entry, "rank">[] = [];
  rows.forEach((row, index) => {
    const result = validateElement(row, index);
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  const entries = valid.map((entry, rank) => ({ ...entry, rank }));
  const groups = groupCharges(entries, new Set(), new Set());
  if (groups.length !== 1) throw new Error(`expected one group, got ${groups.length}`);
  return groups[0] as Group;
}

function segmentsOf(group: Group): Segment[] {
  return group.bands.flatMap((band) => chooseBandCover(band, group.source));
}

function join(rows: NormalizedTransaction[]): Series[] {
  const group = groupOf(rows);
  return joinSegments(group, segmentsOf(group));
}

function dates(series: Series): string[] {
  return series.regular.map((c) => c.date.iso);
}

function rows(key: string, amount: number, days: string[]): NormalizedTransaction[] {
  return days.map((d) => charge(d, amount, key));
}

describe("joinSegments", () => {
  describe("price changes", () => {
    it("Netflix 1549 on 01-02, 02-02 and 1799 on 03-02 is one Series of 3", () => {
      const result = join([
        ...rows(KNOWN, 1549, ["2026-01-02", "2026-02-02"]),
        ...rows(KNOWN, 1799, ["2026-03-02"]),
      ]);
      expect(result).toHaveLength(1);
      const series = result[0] as Series;
      expect(dates(series)).toEqual(["2026-01-02", "2026-02-02", "2026-03-02"]);
      expect(series.cadence).toBe("monthly");
      expect(series.bandIds).toEqual([0, 1]);
      expect(series.intro).toBeNull();
      expect(series.cadenceAssumed).toBe(false);
    });

    it("Streaming Dienst shape: a generic source and a 2-charge A joins", () => {
      const result = join([
        ...rows("merchant:streaming dienst", 1299, ["2026-01-03", "2026-02-02"]),
        ...rows("merchant:streaming dienst", 1499, ["2026-03-02"]),
      ]);
      expect(result).toHaveLength(1);
      expect(dates(result[0] as Series)).toEqual(["2026-01-03", "2026-02-02", "2026-03-02"]);
    });

    it("a Series can hold several price changes", () => {
      const result = join([
        ...rows(KNOWN, 1000, ["2026-01-02", "2026-02-02"]),
        ...rows(KNOWN, 1200, ["2026-03-02", "2026-04-02"]),
        ...rows(KNOWN, 1500, ["2026-05-02"]),
      ]);
      expect(result).toHaveLength(1);
      expect((result[0] as Series).regular).toHaveLength(5);
      expect((result[0] as Series).bandIds).toEqual([0, 1, 2]);
    });

    it("a known one-charge A joins a later multi-charge B of the cadence of B", () => {
      const result = join([
        ...rows(KNOWN, 1549, ["2026-01-02"]),
        ...rows(KNOWN, 1799, ["2026-02-02", "2026-03-02"]),
      ]);
      expect(result).toHaveLength(1);
      expect(dates(result[0] as Series)).toEqual(["2026-01-02", "2026-02-02", "2026-03-02"]);
      expect((result[0] as Series).cadence).toBe("monthly");
    });
  });

  describe("one-charge pieces", () => {
    it("known pieces 1 month apart join as monthly", () => {
      const result = join([
        ...rows(KNOWN, 1549, ["2026-01-02"]),
        ...rows(KNOWN, 1799, ["2026-02-02"]),
      ]);
      expect(result).toHaveLength(1);
      expect((result[0] as Series).cadence).toBe("monthly");
      expect((result[0] as Series).intervals).toEqual([
        { k: 1, kind: "on-schedule", deviation: 0 },
      ]);
    });

    it("known pieces 12 months apart join as yearly", () => {
      const result = join([
        ...rows(KNOWN, 1549, ["2026-01-02"]),
        ...rows(KNOWN, 1799, ["2027-01-02"]),
      ]);
      expect(result).toHaveLength(1);
      expect((result[0] as Series).cadence).toBe("yearly");
    });

    it("known pieces 2 months apart do not join", () => {
      expect(
        join([...rows(KNOWN, 1549, ["2026-01-02"]), ...rows(KNOWN, 1799, ["2026-03-02"])]),
      ).toEqual([]);
    });

    it("known pieces on the same date do not join", () => {
      expect(
        join([...rows(KNOWN, 1549, ["2026-01-02"]), ...rows(KNOWN, 1799, ["2026-01-02"])]),
      ).toEqual([]);
    });

    it("known pieces a late month apart do not join (late is not tried)", () => {
      expect(
        join([...rows(KNOWN, 1549, ["2026-01-02"]), ...rows(KNOWN, 1799, ["2026-02-08"])]),
      ).toEqual([]);
    });

    it("generic one-charge pieces never join", () => {
      const result = join([
        ...rows("merchant:shop", 1549, ["2026-01-02"]),
        ...rows("merchant:shop", 1799, ["2026-02-02"]),
      ]);
      expect(result).toEqual([]);
    });

    it("a generic one-charge A (supermarket 5430, 6118) does not join", () => {
      const result = join([
        ...rows("merchant:supermarkt", 5430, ["2026-01-05"]),
        ...rows("merchant:supermarkt", 6118, ["2026-02-05"]),
      ]);
      expect(result).toEqual([]);
    });
  });

  describe("amount ratio", () => {
    it("ratio exactly 2 joins", () => {
      const result = join([
        ...rows(GENERIC, 1000, ["2026-01-15", "2026-02-15"]),
        ...rows(GENERIC, 2000, ["2026-03-15"]),
      ]);
      expect(result).toHaveLength(1);
      expect((result[0] as Series).regular).toHaveLength(3);
    });

    it("2 × min + 1 does not join", () => {
      const result = join([
        ...rows(GENERIC, 1000, ["2026-01-15", "2026-02-15"]),
        ...rows(GENERIC, 2001, ["2026-03-15"]),
      ]);
      expect(result).toHaveLength(1);
      expect(dates(result[0] as Series)).toEqual(["2026-01-15", "2026-02-15"]);
    });

    it("a price drop to exactly half joins, below half does not", () => {
      const half = join([
        ...rows(GENERIC, 2000, ["2026-01-15", "2026-02-15"]),
        ...rows(GENERIC, 1000, ["2026-03-15"]),
      ]);
      expect((half[0] as Series).regular).toHaveLength(3);
      const below = join([
        ...rows(GENERIC, 2000, ["2026-01-15", "2026-02-15"]),
        ...rows(GENERIC, 999, ["2026-03-15"]),
      ]);
      expect((below[0] as Series).regular).toHaveLength(2);
    });
  });

  describe("late joins", () => {
    const base = rows(GENERIC, 1000, ["2026-01-15", "2026-02-15"]);

    it("joins 4 and 10 days after addMonths(l, 1), not 11", () => {
      for (const [day, joins] of [
        ["2026-03-19", true],
        ["2026-03-25", true],
        ["2026-03-26", false],
      ] as const) {
        const result = join([...base, ...rows(GENERIC, 2000, [day])]);
        expect(result).toHaveLength(1);
        expect((result[0] as Series).regular).toHaveLength(joins ? 3 : 2);
      }
    });

    it("the late join interval is k = 1 and late", () => {
      const result = join([...base, ...rows(GENERIC, 2000, ["2026-03-22"])]);
      const series = result[0] as Series;
      expect(series.intervals.map((i) => [i.k, i.kind])).toEqual([
        [1, "on-schedule"],
        [1, "late"],
      ]);
      expect(series.intervals[1]?.deviation).toBe(7);
    });

    it("is refused after a late l, but an on-schedule join after a late l is made", () => {
      const lateEnd = rows(GENERIC, 1000, ["2026-01-15", "2026-02-22"]);
      const refused = join([...lateEnd, ...rows(GENERIC, 2000, ["2026-03-30"])]);
      expect(refused).toHaveLength(1);
      expect(dates(refused[0] as Series)).toEqual(["2026-01-15", "2026-02-22"]);
      const joined = join([...lateEnd, ...rows(GENERIC, 2000, ["2026-03-22"])]);
      expect(dates(joined[0] as Series)).toEqual(["2026-01-15", "2026-02-22", "2026-03-22"]);
    });

    it("is refused when the second charge of B fits neither continuation", () => {
      const refused = join([
        ...base,
        ...rows(GENERIC, 2000, ["2026-03-22", "2026-05-22", "2026-06-22"]),
      ]);
      // B stays a Series of its own: 03-22, then 05-22 with k = 2, then 06-22.
      expect(refused.map(dates)).toEqual([
        ["2026-01-15", "2026-02-15"],
        ["2026-03-22", "2026-05-22", "2026-06-22"],
      ]);
    });

    it("is made when the second charge of B is on schedule after g with k = 1", () => {
      const result = join([...base, ...rows(GENERIC, 2000, ["2026-03-22", "2026-04-22"])]);
      expect(result).toHaveLength(1);
      expect(dates(result[0] as Series)).toEqual([
        "2026-01-15",
        "2026-02-15",
        "2026-03-22",
        "2026-04-22",
      ]);
      expect((result[0] as Series).intervals.map((i) => i.k)).toEqual([1, 1, 1]);
    });
  });

  describe("minimum evidence of the joined Series", () => {
    it("a join that would leave more k = 2 than k = 1 intervals is refused and B stays free", () => {
      const a = rows(GENERIC, 1000, ["2026-01-15", "2026-03-15", "2026-04-15"]);
      const refused = join([...a, ...rows(GENERIC, 1500, ["2026-06-15"])]);
      expect(refused).toHaveLength(1);
      expect(dates(refused[0] as Series)).toEqual(["2026-01-15", "2026-03-15", "2026-04-15"]);
      const ok = join([...a, ...rows(GENERIC, 1500, ["2026-05-15"])]);
      expect(dates(ok[0] as Series)).toEqual([
        "2026-01-15",
        "2026-03-15",
        "2026-04-15",
        "2026-05-15",
      ]);
    });

    it("a refused B is free to join another Series", () => {
      // S1 (1000) cannot take B at 06-18 (k = 2 would exceed k = 1); S2 (1300) can.
      const result = join([
        ...rows(GENERIC, 1000, ["2026-01-15", "2026-03-15", "2026-04-15"]),
        ...rows(GENERIC, 1300, ["2026-03-20", "2026-04-20", "2026-05-20"]),
        ...rows(GENERIC, 1600, ["2026-06-18"]),
      ]);
      expect(result.map(dates)).toEqual([
        ["2026-01-15", "2026-03-15", "2026-04-15"],
        ["2026-03-20", "2026-04-20", "2026-05-20", "2026-06-18"],
      ]);
    });
  });

  describe("overlap", () => {
    it("overlapping Segments (iCloud+ 99 and Apple Music 1099) stay two Series", () => {
      const result = join([
        ...rows(APPLE, 99, ["2026-01-12", "2026-02-12", "2026-03-12"]),
        ...rows(APPLE, 1099, ["2026-01-12", "2026-02-12", "2026-03-12"]),
      ]);
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.regular.map((c) => c.amountCents))).toEqual([
        [99, 99, 99],
        [1099, 1099, 1099],
      ]);
      expect(result.map((s) => s.bandIds)).toEqual([[0], [1]]);
    });

    it("a later Segment wholly after the first joins even when it is a different service", () => {
      const result = join([
        ...rows(APPLE, 999, ["2026-01-12", "2026-02-12"]),
        ...rows(APPLE, 1099, ["2026-03-12", "2026-04-12"]),
      ]);
      expect(result).toHaveLength(1);
      expect((result[0] as Series).regular).toHaveLength(4);
    });
  });

  describe("candidate tie-breaks", () => {
    const base = rows(GENERIC, 1000, ["2026-01-15", "2026-02-15"]);

    it("earliest first charge wins", () => {
      const result = join([
        ...base,
        ...rows(GENERIC, 1500, ["2026-03-14"]),
        ...rows(GENERIC, 1200, ["2026-03-16"]),
      ]);
      expect(dates(result[0] as Series)).toEqual(["2026-01-15", "2026-02-15", "2026-03-14"]);
    });

    it("then the smaller |q − p|", () => {
      const result = join([
        ...base,
        ...rows(GENERIC, 1500, ["2026-03-15"]),
        ...rows(GENERIC, 1200, ["2026-03-15"]),
      ]);
      expect((result[0] as Series).regular.map((c) => c.amountCents)).toEqual([1000, 1000, 1200]);
    });

    it("then Content order", () => {
      const result = join([
        ...base,
        ...rows(GENERIC, 1200, ["2026-03-15"]),
        ...rows(GENERIC, 800, ["2026-03-15"]),
      ]);
      expect((result[0] as Series).regular.map((c) => c.amountCents)).toEqual([1000, 1000, 800]);
    });

    it("the Series whose first piece is first in Content order takes a contested piece", () => {
      const result = join([
        ...rows(GENERIC, 1000, ["2026-01-15", "2026-02-15"]),
        ...rows(GENERIC, 1100, ["2026-01-20", "2026-02-20"]),
        ...rows(GENERIC, 1300, ["2026-03-18"]),
      ]);
      expect(result.map(dates)).toEqual([
        ["2026-01-15", "2026-02-15", "2026-03-18"],
        ["2026-01-20", "2026-02-20"],
      ]);
    });
  });

  describe("interval records", () => {
    it("a k = 2 join gap is a k = 2 on-schedule interval", () => {
      const result = join([
        ...rows(GENERIC, 1000, ["2026-01-15", "2026-02-15"]),
        ...rows(GENERIC, 1500, ["2026-04-15"]),
      ]);
      expect((result[0] as Series).intervals).toEqual([
        { k: 1, kind: "on-schedule", deviation: 0 },
        { k: 2, kind: "on-schedule", deviation: 0 },
      ]);
    });

    it("intervals has one entry per gap between Regular charges", () => {
      const series = join([
        ...rows(KNOWN, 1549, ["2026-01-02", "2026-02-02"]),
        ...rows(KNOWN, 1799, ["2026-03-02"]),
      ])[0] as Series;
      expect(series.intervals).toHaveLength(series.regular.length - 1);
    });
  });

  describe("inputs", () => {
    it("does not change the Segments it is given", () => {
      const group = groupOf([
        ...rows(KNOWN, 1549, ["2026-01-02", "2026-02-02"]),
        ...rows(KNOWN, 1799, ["2026-03-07", "2026-04-07"]),
      ]);
      const segments = segmentsOf(group);
      const before = JSON.stringify(segments);
      joinSegments(group, segments);
      expect(JSON.stringify(segments)).toBe(before);
    });

    it("gives the same Series whatever the order of the Segments", () => {
      const group = groupOf([
        ...rows(KNOWN, 1549, ["2026-01-02", "2026-02-02"]),
        ...rows(KNOWN, 1799, ["2026-03-02"]),
      ]);
      const segments = segmentsOf(group);
      const forward = joinSegments(group, segments).map(dates);
      const backward = joinSegments(group, [...segments].reverse()).map(dates);
      expect(backward).toEqual(forward);
    });
  });
});

/** Groups `rows`, joins its Segments, and returns the Series with the charges left over (step 5). */
function seriesAndLeftovers(rows: NormalizedTransaction[]): {
  group: Group;
  series: Series[];
  leftovers: Entry[];
} {
  const group = groupOf(rows);
  const series = joinSegments(group, segmentsOf(group));
  const inSeries = new Set(series.flatMap((s) => s.regular));
  return { group, series, leftovers: group.charges.filter((c) => !inSeries.has(c)) };
}

/** Joins, then adds Introductory charges; returns the Series. */
function withIntros(rows: NormalizedTransaction[]): Series[] {
  const { group, series, leftovers } = seriesAndLeftovers(rows);
  addIntroCharges(group, series, leftovers);
  return series;
}

function introOf(series: Series): string | null {
  return series.intro === null ? null : `${series.intro.date.iso}:${series.intro.amountCents}`;
}

describe("addIntroCharges", () => {
  it("Netflix 100 on 01-10, 1499 on 02-10 and 03-10: intro 100, 2 Regular charges, no new interval", () => {
    const result = withIntros([
      ...rows(KNOWN, 100, ["2026-01-10"]),
      ...rows(KNOWN, 1499, ["2026-02-10", "2026-03-10"]),
    ]);
    expect(result).toHaveLength(1);
    const series = result[0] as Series;
    expect(introOf(series)).toBe("2026-01-10:100");
    expect(dates(series)).toEqual(["2026-02-10", "2026-03-10"]);
    expect(series.intervals).toHaveLength(1);
  });

  it("an unidentified Apple key gets no intro", () => {
    const result = withIntros([
      ...rows(APPLE, 199, ["2026-01-10"]),
      ...rows(APPLE, 1099, ["2026-02-10", "2026-03-10"]),
    ]);
    expect(result).toHaveLength(1);
    expect((result[0] as Series).intro).toBeNull();
  });

  it("a generic Group gets no intro", () => {
    const result = withIntros([
      ...rows(GENERIC, 100, ["2026-01-10"]),
      ...rows(GENERIC, 1499, ["2026-02-10", "2026-03-10"]),
    ]);
    expect(result).toHaveLength(1);
    expect((result[0] as Series).intro).toBeNull();
  });

  it("a Series with 1 Regular charge gets no intro", () => {
    const { group, series, leftovers } = seriesAndLeftovers([
      ...rows(KNOWN, 100, ["2026-01-10"]),
      ...rows(KNOWN, 1499, ["2026-02-10", "2026-03-10"]),
    ]);
    const one: Series = {
      ...(series[0] as Series),
      regular: [(series[0] as Series).regular[0] as Entry],
    };
    addIntroCharges(group, [one], leftovers);
    expect(one.intro).toBeNull();
  });

  it("a leftover at a higher amount is not an intro", () => {
    const result = withIntros([
      ...rows(KNOWN, 4000, ["2026-01-10"]),
      ...rows(KNOWN, 1499, ["2026-02-10", "2026-03-10"]),
    ]);
    expect(result).toHaveLength(1);
    expect((result[0] as Series).intro).toBeNull();
  });

  it("a leftover two months before the first Regular charge is not an intro", () => {
    const result = withIntros([
      ...rows(KNOWN, 100, ["2026-01-10"]),
      ...rows(KNOWN, 1499, ["2026-03-10", "2026-04-10"]),
    ]);
    expect(result).toHaveLength(1);
    expect((result[0] as Series).intro).toBeNull();
  });

  it("a leftover dated after the first Regular charge is not an intro", () => {
    const result = withIntros([
      ...rows(KNOWN, 1499, ["2026-01-10", "2026-02-10"]),
      ...rows(KNOWN, 100, ["2026-03-10"]),
    ]);
    expect(result).toHaveLength(1);
    expect((result[0] as Series).intro).toBeNull();
  });

  describe("tie-breaks", () => {
    it("of two candidates, the later one wins", () => {
      const result = withIntros([
        ...rows(KNOWN, 100, ["2026-02-08"]),
        ...rows(KNOWN, 120, ["2026-02-10"]),
        ...rows(KNOWN, 1499, ["2026-03-10", "2026-04-10"]),
      ]);
      expect(result).toHaveLength(1);
      expect(introOf(result[0] as Series)).toBe("2026-02-10:120");
    });

    it("on the same date, the lower amount wins", () => {
      const result = withIntros([
        ...rows(KNOWN, 120, ["2026-02-10"]),
        ...rows(KNOWN, 100, ["2026-02-10"]),
        ...rows(KNOWN, 1499, ["2026-03-10", "2026-04-10"]),
      ]);
      expect(result).toHaveLength(1);
      expect(introOf(result[0] as Series)).toBe("2026-02-10:100");
    });

    it("on the same date and amount, Content order decides", () => {
      const result = withIntros([
        charge("2026-02-10", 100, KNOWN, { description: "Netflix trial B" }),
        charge("2026-02-10", 100, KNOWN, { description: "Netflix trial A" }),
        ...rows(KNOWN, 1499, ["2026-03-10", "2026-04-10"]),
      ]);
      expect(result).toHaveLength(1);
      expect((result[0] as Series).intro?.description).toBe("Netflix trial A");
    });

    it("two Series of one Group compete for a leftover: the first in Content order takes it", () => {
      const { group, series, leftovers } = seriesAndLeftovers([
        ...rows(KNOWN, 100, ["2026-01-10"]),
        ...rows(KNOWN, 1499, ["2026-02-10", "2026-03-10"]),
        ...rows(KNOWN, 1999, ["2026-02-11", "2026-03-11"]),
      ]);
      expect(series).toHaveLength(2);
      // Offer the Series in reverse Content order; the result must not depend on it.
      addIntroCharges(group, [...series].reverse(), leftovers);
      const first = series.find((s) => (s.regular[0] as Entry).date.iso === "2026-02-10") as Series;
      const second = series.find(
        (s) => (s.regular[0] as Entry).date.iso === "2026-02-11",
      ) as Series;
      expect(introOf(first)).toBe("2026-01-10:100");
      expect(second.intro).toBeNull();
    });

    it("each Series gets at most one, and a leftover is used at most once", () => {
      const { group, series, leftovers } = seriesAndLeftovers([
        ...rows(KNOWN, 100, ["2026-01-10"]),
        ...rows(KNOWN, 150, ["2026-01-11"]),
        ...rows(KNOWN, 1499, ["2026-02-10", "2026-03-10"]),
        ...rows(KNOWN, 1999, ["2026-02-11", "2026-03-11"]),
      ]);
      addIntroCharges(group, series, leftovers);
      const intros = series.map(introOf);
      expect(intros.every((i) => i !== null)).toBe(true);
      expect(new Set(intros).size).toBe(2);
    });
  });

  it("does not change `regular`, `intervals` or the leftovers it is given", () => {
    const { group, series, leftovers } = seriesAndLeftovers([
      ...rows(KNOWN, 100, ["2026-01-10"]),
      ...rows(KNOWN, 1499, ["2026-02-10", "2026-03-10"]),
    ]);
    const before = JSON.stringify([series.map((s) => [s.regular, s.intervals]), leftovers]);
    addIntroCharges(group, series, leftovers);
    expect(JSON.stringify([series.map((s) => [s.regular, s.intervals]), leftovers])).toBe(before);
  });
});
