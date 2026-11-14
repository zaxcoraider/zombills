import { describe, expect, it } from "vitest";
import { groupCharges, splitIntoBands } from "./bands.js";
import { compareContent } from "./content-order.js";
import type { Entry } from "./internal-types.js";
import { matchRefunds } from "./refunds.js";
import { charge, credit, zero } from "./test-fixtures.js";
import type { NormalizedTransaction } from "../normalize/types.js";
import { validateElement } from "./validate.js";

const KEY = "merchant:gym";

/** Valid entries in Content order, as step 1 produces them; `index` is the input position. */
function sortedEntries(rows: NormalizedTransaction[]): Entry[] {
  const valid: Omit<Entry, "rank">[] = [];
  rows.forEach((row, index) => {
    const result = validateElement(row, index);
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  return valid.map((entry, rank) => ({ ...entry, rank }));
}

/** Charges of one key at the given amounts, one per day from 2026-01-01. */
function chargesAt(amounts: number[]): Entry[] {
  return sortedEntries(
    amounts.map((a, i) => charge(`2026-01-${String(i + 1).padStart(2, "0")}`, a, KEY)),
  );
}

/** [low, high] of every band for the given amounts. */
function bandRanges(amounts: number[]): [number, number][] {
  return splitIntoBands(chargesAt(amounts)).map((b) => [b.low, b.high]);
}

describe("splitIntoBands: Req 3.2 examples", () => {
  it("puts 999 and 1029 in one band", () => {
    expect(bandRanges([999, 1029])).toEqual([[999, 1029]]);
  });

  it("puts 999 and 1049 in two bands", () => {
    expect(bandRanges([999, 1049])).toEqual([
      [999, 999],
      [1049, 1049],
    ]);
  });

  it("puts 1549 and 1799 in two bands", () => {
    expect(bandRanges([1549, 1799])).toEqual([
      [1549, 1549],
      [1799, 1799],
    ]);
  });

  it("puts 99 and 1099 in two bands", () => {
    expect(bandRanges([99, 1099])).toEqual([
      [99, 99],
      [1099, 1099],
    ]);
  });

  it("puts 1000 and 1050 in one band, and 1000 and 1051 in two (the 5 % edge)", () => {
    expect(bandRanges([1000, 1050])).toEqual([[1000, 1050]]);
    expect(bandRanges([1000, 1051])).toEqual([
      [1000, 1000],
      [1051, 1051],
    ]);
  });

  it("gives the supermarket amounts 5430, 6118 and 4782 three bands (Req 5.3 note)", () => {
    expect(bandRanges([5430, 6118, 4782])).toEqual([
      [4782, 4782],
      [5430, 5430],
      [6118, 6118],
    ]);
  });

  it("measures the band from its lowest amount, not from the previous amount", () => {
    // 1000 starts a band that reaches 1050; 1090 is 40 above 1050 but 90 above 1000.
    expect(bandRanges([1000, 1030, 1050, 1090])).toEqual([
      [1000, 1050],
      [1090, 1090],
    ]);
  });

  it("gives an empty list for no Charges", () => {
    expect(splitIntoBands([])).toEqual([]);
  });
});

describe("splitIntoBands: ids and members", () => {
  it("numbers bands 0, 1, … in ascending low, whatever the date order", () => {
    const bands = splitIntoBands(chargesAt([2000, 1000, 1010, 3000]));
    expect(bands.map((b) => [b.id, b.low, b.high])).toEqual([
      [0, 1000, 1010],
      [1, 2000, 2000],
      [2, 3000, 3000],
    ]);
  });

  it("holds every Charge of the amounts in a band, in the order given", () => {
    const entries = chargesAt([1000, 2000, 1010, 1000]);
    const bands = splitIntoBands(entries);
    expect(bands[0]?.charges.map((c) => c.index)).toEqual(
      entries.filter((c) => c.amountCents <= 1010).map((c) => c.index),
    );
    expect(bands[0]?.charges.map((c) => c.rank)).toEqual([0, 2, 3]);
    expect(bands[1]?.charges.map((c) => c.amountCents)).toEqual([2000]);
  });
});

describe("splitIntoBands: large amounts", () => {
  const MAX = Number.MAX_SAFE_INTEGER;

  it("bands amounts near MAX_SAFE_INTEGER without overflow", () => {
    // limit = (m − m % 20) / 20 is about 4.5e14, far above 10, so these share a band.
    expect(bandRanges([MAX - 10, MAX])).toEqual([[MAX - 10, MAX]]);
    // 5 % of 4e15 is 2e14: an amount 2e14 above joins, one more does not.
    const m = 4_000_000_000_000_000;
    const edge = m + m / 20;
    expect(bandRanges([m, edge])).toEqual([[m, edge]]);
    expect(bandRanges([m, edge + 1])).toEqual([
      [m, m],
      [edge + 1, edge + 1],
    ]);
  });

  it("splits MAX_SAFE_INTEGER from half its size", () => {
    const half = (MAX - 1) / 2;
    expect(bandRanges([half, MAX])).toEqual([
      [half, half],
      [MAX, MAX],
    ]);
  });
});

describe("groupCharges", () => {
  it("makes one Group per key and currency, so two currencies give two Groups", () => {
    const entries = sortedEntries([
      charge("2026-01-01", 999, KEY),
      charge("2026-01-01", 999, KEY, { currency: "EUR" }),
      charge("2026-02-01", 999, KEY),
      charge("2026-02-01", 999, "merchant:other"),
    ]);
    const groups = groupCharges(entries, new Set(), new Set());
    expect(groups.map((g) => [g.key, g.currency, g.charges.length])).toEqual([
      [KEY, "EUR", 1],
      [KEY, "USD", 2],
      ["merchant:other", "USD", 1],
    ]);
  });

  it("orders Groups by the Content order of their first entry", () => {
    const entries = sortedEntries([
      charge("2026-03-01", 500, "merchant:late"),
      charge("2026-01-01", 500, "merchant:early"),
      charge("2026-02-01", 500, "merchant:middle"),
    ]);
    const groups = groupCharges(entries, new Set(), new Set());
    expect(groups.map((g) => g.key)).toEqual([
      "merchant:early",
      "merchant:middle",
      "merchant:late",
    ]);
  });

  it("takes source from the entries and keeps Content order inside a Group", () => {
    const entries = sortedEntries([
      charge("2026-02-01", 1549, "netflix"),
      charge("2026-01-01", 1549, "netflix"),
    ]);
    const [group] = groupCharges(entries, new Set(), new Set());
    expect(group?.source).toBe("known");
    expect(group?.charges.map((c) => c.date.iso)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("leaves a refunded Charge out of every band, and its Credit out of the Group", () => {
    const entries = sortedEntries([
      charge("2026-01-01", 999, KEY),
      charge("2026-01-10", 999, KEY),
      credit("2026-01-12", 999, KEY),
      charge("2026-02-01", 999, KEY),
    ]);
    const { refunded, refunds } = matchRefunds(entries);
    const [group] = groupCharges(entries, refunded, refunds);
    expect(group?.charges.map((c) => c.date.iso)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(group?.moneyIn).toEqual([]);
    const inBands = group?.bands.flatMap((b) => b.charges) ?? [];
    expect(inBands.map((c) => c.date.iso)).toEqual(["2026-01-01", "2026-02-01"]);
    for (const c of refunded) expect(inBands).not.toContain(c);
  });

  it("does not create a Group that would hold only a refunded Charge and its Credit", () => {
    const entries = sortedEntries([
      charge("2026-01-01", 999, "merchant:shop"),
      credit("2026-01-02", 999, "merchant:shop"),
      charge("2026-01-05", 500, KEY),
    ]);
    const { refunded, refunds } = matchRefunds(entries);
    expect(refunded.size).toBe(1);
    expect(groupCharges(entries, refunded, refunds).map((g) => g.key)).toEqual([KEY]);
  });

  it("puts Zero-amount rows and money-in Credits in the Group but in no band", () => {
    const entries = sortedEntries([
      zero("2026-01-01", KEY),
      charge("2026-01-02", 999, KEY),
      credit("2026-01-20", 300, KEY),
      charge("2026-02-02", 999, KEY),
    ]);
    const { refunded, refunds } = matchRefunds(entries);
    const [group] = groupCharges(entries, refunded, refunds);
    expect(group?.zeroRows.map((e) => e.date.iso)).toEqual(["2026-01-01"]);
    expect(group?.moneyIn.map((e) => e.amountCents)).toEqual([-300]);
    expect(group?.charges).toHaveLength(2);
    expect(group?.bands).toHaveLength(1);
    expect(group?.bands[0]?.charges.every((c) => c.amountCents > 0)).toBe(true);
    expect(group?.bands[0]?.charges).toHaveLength(2);
  });

  it("splits a Group into bands: the supermarket Group has three", () => {
    const entries = sortedEntries([
      charge("2026-01-03", 5430, "merchant:supermarket"),
      charge("2026-01-10", 6118, "merchant:supermarket"),
      charge("2026-01-17", 4782, "merchant:supermarket"),
    ]);
    const [group] = groupCharges(entries, new Set(), new Set());
    expect(group?.bands.map((b) => b.id)).toEqual([0, 1, 2]);
    expect(group?.bands.map((b) => b.low)).toEqual([4782, 5430, 6118]);
  });

  it("gives an empty list for no entries", () => {
    expect(groupCharges([], new Set(), new Set())).toEqual([]);
  });
});
