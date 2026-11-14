import { describe, expect, it } from "vitest";
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

/** Runs the matcher and returns the matched input positions. */
function match(rows: NormalizedTransaction[]): { refunded: number[]; refunds: number[] } {
  const result = matchRefunds(sortedEntries(rows));
  const positions = (set: Set<Entry>): number[] =>
    [...set].map((e) => e.index).sort((a, b) => a - b);
  return { refunded: positions(result.refunded), refunds: positions(result.refunds) };
}

describe("matchRefunds: the 45-day window", () => {
  it("matches a Credit on the day of the Charge", () => {
    expect(match([charge("2026-01-10", 999, KEY), credit("2026-01-10", 999, KEY)])).toEqual({
      refunded: [0],
      refunds: [1],
    });
  });

  it("matches a Credit 45 days after the Charge", () => {
    // 2026-01-10 + 45 days = 2026-02-24
    expect(match([charge("2026-01-10", 999, KEY), credit("2026-02-24", 999, KEY)])).toEqual({
      refunded: [0],
      refunds: [1],
    });
  });

  it("does not match a Credit 46 days after the Charge", () => {
    expect(match([charge("2026-01-10", 999, KEY), credit("2026-02-25", 999, KEY)])).toEqual({
      refunded: [],
      refunds: [],
    });
  });

  it("does not match a Credit dated before the Charge", () => {
    expect(match([charge("2026-01-10", 999, KEY), credit("2026-01-09", 999, KEY)])).toEqual({
      refunded: [],
      refunds: [],
    });
  });
});

describe("matchRefunds: which Charge is matched", () => {
  it("matches the latest of two qualifying Charges", () => {
    const rows = [
      charge("2026-01-10", 999, KEY),
      charge("2026-01-20", 999, KEY),
      credit("2026-01-25", 999, KEY),
    ];
    expect(match(rows)).toEqual({ refunded: [1], refunds: [2] });
  });

  it("skips a later Charge that is outside the window of an earlier Credit", () => {
    const rows = [
      charge("2026-01-10", 999, KEY),
      credit("2026-01-12", 999, KEY),
      charge("2026-01-20", 999, KEY),
    ];
    expect(match(rows)).toEqual({ refunded: [0], refunds: [1] });
  });

  it("takes the first unmatched Charge in Content order on the latest date", () => {
    // Same date and amount; the descriptions decide the Content order, not the input position.
    const rows = [
      charge("2026-01-20", 999, KEY, { description: "c" }),
      charge("2026-01-20", 999, KEY, { description: "a" }),
      charge("2026-01-20", 999, KEY, { description: "b" }),
      charge("2026-01-05", 999, KEY),
      credit("2026-01-25", 999, KEY),
    ];
    expect(match(rows)).toEqual({ refunded: [1], refunds: [4] });
  });

  it("takes the next unmatched Charge in Content order for a second Credit", () => {
    const rows = [
      charge("2026-01-20", 999, KEY, { description: "c" }),
      charge("2026-01-20", 999, KEY, { description: "a" }),
      charge("2026-01-20", 999, KEY, { description: "b" }),
      credit("2026-01-25", 999, KEY, { description: "x" }),
      credit("2026-01-26", 999, KEY, { description: "y" }),
    ];
    expect(match(rows)).toEqual({ refunded: [1, 2], refunds: [3, 4] });
  });

  it("falls back to an earlier date when the latest dates are already matched", () => {
    const rows = [
      charge("2026-01-10", 999, KEY),
      charge("2026-01-20", 999, KEY),
      credit("2026-01-25", 999, KEY),
      credit("2026-01-26", 999, KEY),
    ];
    expect(match(rows)).toEqual({ refunded: [0, 1], refunds: [2, 3] });
  });
});

describe("matchRefunds: one to one", () => {
  it("pairs many identical same-day Charges and Credits one to one", () => {
    const rows: NormalizedTransaction[] = [];
    for (let i = 0; i < 50; i += 1) rows.push(charge("2026-01-10", 999, KEY));
    for (let i = 0; i < 50; i += 1) rows.push(credit("2026-01-12", 999, KEY));
    const result = match(rows);
    expect(result.refunded).toHaveLength(50);
    expect(result.refunds).toHaveLength(50);
    expect(new Set(result.refunded).size).toBe(50);
    expect(new Set(result.refunds).size).toBe(50);
  });

  it("matches 3 Credits to 2 Charges only twice", () => {
    const rows = [
      charge("2026-01-10", 999, KEY),
      charge("2026-01-10", 999, KEY),
      credit("2026-01-11", 999, KEY),
      credit("2026-01-12", 999, KEY),
      credit("2026-01-13", 999, KEY),
    ];
    const result = match(rows);
    expect(result.refunded).toEqual([0, 1]);
    expect(result.refunds).toEqual([2, 3]);
  });

  it("matches a Charge at most once: two Credits, one Charge give one money-in", () => {
    const rows = [
      charge("2026-01-10", 999, KEY),
      credit("2026-01-11", 999, KEY),
      credit("2026-01-12", 999, KEY),
    ];
    expect(match(rows)).toEqual({ refunded: [0], refunds: [1] });
  });
});

describe("matchRefunds: what never matches", () => {
  it("does not match a partial refund", () => {
    const rows = [charge("2026-01-10", 999, KEY), credit("2026-01-11", 500, KEY)];
    expect(match(rows)).toEqual({ refunded: [], refunds: [] });
  });

  it("does not match a Credit in another currency", () => {
    const rows = [
      charge("2026-01-10", 999, KEY),
      credit("2026-01-11", 999, KEY, { currency: "EUR" }),
    ];
    expect(match(rows)).toEqual({ refunded: [], refunds: [] });
  });

  it("does not match a Credit under another key", () => {
    const rows = [charge("2026-01-10", 999, KEY), credit("2026-01-11", 999, "merchant:spa")];
    expect(match(rows)).toEqual({ refunded: [], refunds: [] });
  });

  it("does not match the order and refund keys of Req 2.7", () => {
    const rows = [
      charge("2026-02-14", 2347, "merchant:online-marketplace-order"),
      credit("2026-02-17", 2347, "merchant:online-marketplace-refund"),
    ];
    expect(match(rows)).toEqual({ refunded: [], refunds: [] });
  });

  it("ignores zero-amount rows", () => {
    const rows = [
      zero("2026-01-10", KEY),
      charge("2026-01-10", 999, KEY),
      credit("2026-01-11", 999, KEY),
    ];
    expect(match(rows)).toEqual({ refunded: [1], refunds: [2] });
  });

  it("returns empty sets for no entries", () => {
    expect(match([])).toEqual({ refunded: [], refunds: [] });
  });
});
