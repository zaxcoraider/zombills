import { describe, expect, it } from "vitest";
import { compareContent } from "./content-order.js";
import type { Band, ComparisonCounter, Entry } from "./internal-types.js";
import { chooseBandCover, coverBand, growChain, longestValidPrefix } from "./segments.js";
import { charge } from "./test-fixtures.js";
import type { Cadence } from "./types.js";
import { validateElement } from "./validate.js";

const KEY = "merchant:gym";

/** One band holding a charge at `amount` for each date, in Content order. */
function bandOf(dates: string[], amount = 999, key = KEY): Band {
  const valid: Omit<Entry, "rank">[] = [];
  dates.forEach((date, index) => {
    const result = validateElement(charge(date, amount, key), index);
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  const charges = valid.map((entry, rank) => ({ ...entry, rank }));
  return { id: 0, low: amount, high: amount, charges };
}

/** The chain grown from the first charge of the band. */
function grow(
  dates: string[],
  cadence: Cadence = "monthly",
  counter?: ComparisonCounter,
  used: ReadonlySet<Entry> = new Set(),
) {
  const band = bandOf(dates);
  return growChain(band, used, band.charges[0] as Entry, cadence, counter);
}

function isoDates(chain: { charges: Entry[] }): string[] {
  return chain.charges.map((c) => c.date.iso);
}

describe("growChain", () => {
  it("Req 3.4: Jan 10, Feb 9, Feb 11, Mar 10 gives Jan 10, Feb 9, Mar 10", () => {
    const chain = grow(["2026-01-10", "2026-02-09", "2026-02-11", "2026-03-10"]);
    expect(isoDates(chain)).toEqual(["2026-01-10", "2026-02-09", "2026-03-10"]);
  });

  it("gym: all five charges, k = 1 throughout", () => {
    const chain = grow(["2026-01-02", "2026-02-02", "2026-02-27", "2026-04-01", "2026-05-01"]);
    expect(isoDates(chain)).toEqual([
      "2026-01-02",
      "2026-02-02",
      "2026-02-27",
      "2026-04-01",
      "2026-05-01",
    ]);
    expect(chain.intervals.map((i) => i.k)).toEqual([1, 1, 1, 1]);
  });

  it("review finding 1: 03-01, 03-27, 04-27, 05-27 are one chain", () => {
    const chain = grow(["2026-03-01", "2026-03-27", "2026-04-27", "2026-05-27"]);
    expect(isoDates(chain)).toEqual(["2026-03-01", "2026-03-27", "2026-04-27", "2026-05-27"]);
  });

  it("retry: Jan 15, Feb 22, Mar 22 keeps Feb 22 late and both intervals k = 1", () => {
    const chain = grow(["2026-01-15", "2026-02-22", "2026-03-22"]);
    expect(isoDates(chain)).toEqual(["2026-01-15", "2026-02-22", "2026-03-22"]);
    expect(chain.intervals.map((i) => i.k)).toEqual([1, 1]);
    expect(chain.intervals[0]?.kind).toBe("late");
    expect(chain.intervals[1]?.kind).toBe("on-schedule");
  });

  it("retry: Jan 15, Feb 22, Mar 15 keeps Feb 22 late and both intervals k = 1", () => {
    const chain = grow(["2026-01-15", "2026-02-22", "2026-03-15"]);
    expect(isoDates(chain)).toEqual(["2026-01-15", "2026-02-22", "2026-03-15"]);
    expect(chain.intervals.map((i) => i.k)).toEqual([1, 1]);
    expect(chain.intervals[0]?.kind).toBe("late");
  });

  it("11 days late: Jan 15, Feb 26, Mar 26 gives [Jan 15] and no valid prefix", () => {
    const chain = grow(["2026-01-15", "2026-02-26", "2026-03-26"]);
    expect(isoDates(chain)).toEqual(["2026-01-15"]);
    expect(longestValidPrefix(chain)).toBeNull();
  });

  it("never puts two same-date charges in one chain", () => {
    const chain = grow(["2026-01-10", "2026-02-10", "2026-02-10", "2026-03-10"]);
    expect(isoDates(chain)).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
    const dates = isoDates(chain);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("never takes two late charges in a row", () => {
    // Feb 22 is late after Jan 15; Mar 30 would be late after Feb 22 but is not a continuation.
    const chain = grow(["2026-01-15", "2026-02-22", "2026-03-30"]);
    expect(isoDates(chain)).toEqual(["2026-01-15", "2026-02-22"]);
  });

  it("skips charges already used", () => {
    const band = bandOf(["2026-01-10", "2026-02-10", "2026-03-10"]);
    const used = new Set<Entry>([band.charges[1] as Entry]);
    const chain = growChain(band, used, band.charges[0] as Entry, "monthly");
    // Feb 10 is used, so Mar 10 is reached as a k = 2 step.
    expect(isoDates(chain)).toEqual(["2026-01-10", "2026-03-10"]);
    expect(chain.intervals.map((i) => i.k)).toEqual([2]);
  });

  it("takes a k = 2 step only when no k = 1 or late step exists", () => {
    const chain = grow(["2026-01-15", "2026-02-15", "2026-04-15"]);
    expect(chain.intervals.map((i) => i.k)).toEqual([1, 2]);
  });

  it("weekly accepts k = 2 and yearly refuses it", () => {
    expect(grow(["2026-01-05", "2026-01-19"], "weekly").intervals.map((i) => i.k)).toEqual([2]);
    expect(isoDates(grow(["2024-01-10", "2026-01-10"], "yearly"))).toEqual(["2024-01-10"]);
    expect(isoDates(grow(["2025-01-10", "2026-01-10"], "yearly"))).toEqual([
      "2025-01-10",
      "2026-01-10",
    ]);
  });

  it("counts comparisons when a counter is given and gives the same result without one", () => {
    const dates = ["2026-01-10", "2026-02-09", "2026-02-11", "2026-03-10", "2026-04-10"];
    const counter: ComparisonCounter = { comparisons: 0 };
    const counted = grow(dates, "monthly", counter);
    const plain = grow(dates, "monthly");
    expect(counter.comparisons).toBeGreaterThan(0);
    expect(isoDates(counted)).toEqual(isoDates(plain));
    expect(counted.intervals).toEqual(plain.intervals);
  });

  it("does not count charges outside every window", () => {
    const counter: ComparisonCounter = { comparisons: 0 };
    grow(["2026-01-10", "2026-01-12", "2026-01-14"], "monthly", counter);
    expect(counter.comparisons).toBe(0);
  });
});

describe("longestValidPrefix", () => {
  it("cuts a trailing run of k = 2 steps", () => {
    // k pattern 1, 2, 2: the whole chain has more k = 2 than k = 1; the prefix of 2 intervals ties.
    const chain = grow(["2026-01-15", "2026-02-15", "2026-04-15", "2026-06-15"]);
    expect(chain.intervals.map((i) => i.k)).toEqual([1, 2, 2]);
    const prefix = longestValidPrefix(chain);
    expect(prefix === null ? null : isoDates(prefix)).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-04-15",
    ]);
    expect(prefix?.intervals).toHaveLength(2);
  });

  it("Jan 15, Mar 15 has no valid prefix", () => {
    expect(longestValidPrefix(grow(["2026-01-15", "2026-03-15"]))).toBeNull();
  });

  it("a single charge has no valid prefix", () => {
    expect(longestValidPrefix(grow(["2026-01-15"]))).toBeNull();
  });

  it("a prefix may end on a late charge", () => {
    const prefix = longestValidPrefix(grow(["2026-01-15", "2026-02-22"]));
    expect(prefix === null ? null : isoDates(prefix)).toEqual(["2026-01-15", "2026-02-22"]);
  });

  it("returns the whole chain when it is valid", () => {
    const chain = grow(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(longestValidPrefix(chain)).toEqual(chain);
  });
});

/** The Segments as lists of ISO dates, with the cadence of each. */
function summary(segments: { cadence: Cadence | null; charges: Entry[] }[]) {
  return segments.map((s) => ({ cadence: s.cadence, dates: s.charges.map((c) => c.date.iso) }));
}

describe("coverBand", () => {
  it("Req 3.4: Jan 10, Feb 9, Feb 11, Mar 10 gives one Segment and Feb 11 as a leftover", () => {
    const cover = coverBand(
      bandOf(["2026-01-10", "2026-02-09", "2026-02-11", "2026-03-10"]),
      "monthly",
    );
    expect(summary(cover)).toEqual([
      { cadence: "monthly", dates: ["2026-01-10", "2026-02-09", "2026-03-10"] },
      { cadence: null, dates: ["2026-02-11"] },
    ]);
  });

  it("Req 3.4: 01-01, 02-01, 02-03, 03-03 gives 01-01, 02-01, 03-03 and leftover 02-03", () => {
    const cover = chooseBandCover(
      bandOf(["2026-01-01", "2026-02-01", "2026-02-03", "2026-03-03"]),
      "generic",
    );
    expect(summary(cover)).toEqual([
      { cadence: "monthly", dates: ["2026-01-01", "2026-02-01", "2026-03-03"] },
      { cadence: null, dates: ["2026-02-03"] },
    ]);
  });

  it("Req 3.11 coffee: cover is Jan 5, Feb 2, Mar 2 and the other six Mondays are leftovers", () => {
    const dates = [
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
      "2026-02-02",
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
      "2026-03-23",
    ];
    const cover = chooseBandCover(bandOf(dates, 450), "generic");
    expect(summary(cover)).toEqual([
      { cadence: "monthly", dates: ["2026-01-05", "2026-02-02", "2026-03-02"] },
      { cadence: null, dates: ["2026-01-12"] },
      { cadence: null, dates: ["2026-01-19"] },
      { cadence: null, dates: ["2026-01-26"] },
      { cadence: null, dates: ["2026-03-09"] },
      { cadence: null, dates: ["2026-03-16"] },
      { cadence: null, dates: ["2026-03-23"] },
    ]);
  });

  it("Req 3.11 generic 999 on Jan 1, 8, 15, Feb 1, Mar 1, Apr 1: monthly Segment, no weekly cover", () => {
    const dates = [
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ];
    const cover = chooseBandCover(bandOf(dates), "generic");
    expect(summary(cover)).toEqual([
      { cadence: "monthly", dates: ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"] },
      { cadence: null, dates: ["2026-01-08"] },
      { cadence: null, dates: ["2026-01-15"] },
    ]);
    expect(cover.some((s) => s.cadence === "weekly")).toBe(false);
  });

  it("known weekly charges over 6 weeks give a weekly cover", () => {
    const dates = [
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
      "2026-02-02",
      "2026-02-09",
    ];
    const cover = chooseBandCover(bandOf(dates, 999, "netflix"), "known");
    expect(summary(cover)).toEqual([{ cadence: "weekly", dates }]);
  });

  it("a known band covered equally by weekly and monthly takes weekly (shorter Period)", () => {
    // Weekly covers Jan 5 and Jan 12; monthly covers Jan 5 and Feb 5. Two charges each.
    const band = bandOf(["2026-01-05", "2026-01-12", "2026-02-05"], 999, "netflix");
    expect(summary(coverBand(band, "weekly"))[0]).toEqual({
      cadence: "weekly",
      dates: ["2026-01-05", "2026-01-12"],
    });
    expect(summary(coverBand(band, "monthly"))[0]).toEqual({
      cadence: "monthly",
      dates: ["2026-01-05", "2026-02-05"],
    });
    expect(summary(chooseBandCover(band, "known"))).toEqual([
      { cadence: "weekly", dates: ["2026-01-05", "2026-01-12"] },
      { cadence: null, dates: ["2026-02-05"] },
    ]);
  });

  it("a known band where monthly covers more than weekly takes monthly", () => {
    const band = bandOf(["2026-01-05", "2026-02-02"], 999, "netflix");
    expect(coverBand(band, "weekly").every((s) => s.cadence === null)).toBe(true);
    expect(summary(chooseBandCover(band, "known"))).toEqual([
      { cadence: "monthly", dates: ["2026-01-05", "2026-02-02"] },
    ]);
  });

  it("yearly is chosen only when it covers more", () => {
    const band = bandOf(["2025-03-07", "2026-03-07"], 999, "netflix");
    expect(summary(chooseBandCover(band, "known"))).toEqual([
      { cadence: "yearly", dates: ["2025-03-07", "2026-03-07"] },
    ]);
    const monthly = bandOf(["2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(summary(chooseBandCover(monthly, "generic"))).toEqual([
      { cadence: "monthly", dates: ["2026-01-10", "2026-02-10", "2026-03-10"] },
    ]);
  });

  it("a band no cadence covers gives leftovers only", () => {
    const cover = chooseBandCover(bandOf(["2026-01-10", "2026-01-20", "2026-05-01"]), "generic");
    expect(summary(cover)).toEqual([
      { cadence: null, dates: ["2026-01-10"] },
      { cadence: null, dates: ["2026-01-20"] },
      { cadence: null, dates: ["2026-05-01"] },
    ]);
  });

  it("every Segment in one band has the same cadence", () => {
    const dates = [
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-02-02",
      "2026-03-02",
      "2026-04-06",
    ];
    const cover = chooseBandCover(bandOf(dates), "generic");
    const cadences = new Set(cover.filter((s) => s.cadence !== null).map((s) => s.cadence));
    expect(cadences.size).toBeLessThanOrEqual(1);
  });

  it("shuffling the input order before sorting gives the same Segments", () => {
    const dates = [
      "2026-01-10",
      "2026-02-09",
      "2026-02-11",
      "2026-03-10",
      "2026-04-09",
      "2026-04-11",
    ];
    const shuffled = [dates[4], dates[1], dates[5], dates[0], dates[3], dates[2]] as string[];
    expect(summary(chooseBandCover(bandOf(shuffled), "generic"))).toEqual(
      summary(chooseBandCover(bandOf(dates), "generic")),
    );
  });

  it("counts comparisons across every cadence tried", () => {
    const counter: ComparisonCounter = { comparisons: 0 };
    const band = bandOf(["2026-01-10", "2026-02-10", "2026-03-10"]);
    const counted = chooseBandCover(band, "known", counter);
    expect(counter.comparisons).toBeGreaterThan(0);
    expect(summary(counted)).toEqual(summary(chooseBandCover(band, "known")));
  });
});
