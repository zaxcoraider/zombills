import { describe, expect, it } from "vitest";
import { compareContent } from "./content-order.js";
import type { Entry } from "./internal-types.js";
import { parseIsoDate } from "./dates.js";

type Comparable = Omit<Entry, "rank">;

function entry(overrides: {
  date?: string;
  amountCents?: number;
  description?: string;
  displayName?: string;
  source?: Entry["merchant"]["source"];
  serviceId?: string | null;
  processor?: string | null;
  currency?: string;
  key?: string;
  index?: number;
}): Comparable {
  const date = parseIsoDate(overrides.date ?? "2026-01-15");
  if (date === null) throw new Error("bad test date");
  return {
    index: overrides.index ?? 0,
    date,
    description: overrides.description ?? "d",
    amountCents: overrides.amountCents ?? 999,
    currency: overrides.currency ?? "USD",
    merchant: {
      key: overrides.key ?? "k",
      displayName: overrides.displayName ?? "n",
      source: overrides.source ?? "generic",
      serviceId: overrides.serviceId ?? null,
      processor: overrides.processor ?? null,
    },
  };
}

describe("compareContent: each level decides when all earlier levels are equal", () => {
  const levels: [string, Comparable, Comparable][] = [
    ["date", entry({ date: "2026-01-14" }), entry({ date: "2026-01-15" })],
    ["amountCents", entry({ amountCents: 500 }), entry({ amountCents: 1000 })],
    ["description", entry({ description: "a" }), entry({ description: "b" })],
    ["displayName", entry({ displayName: "a" }), entry({ displayName: "b" })],
    ["source", entry({ source: "generic" }), entry({ source: "known" })],
    ["serviceId", entry({ serviceId: "a" }), entry({ serviceId: "b" })],
    ["processor", entry({ processor: "a" }), entry({ processor: "b" })],
    ["currency", entry({ currency: "EUR" }), entry({ currency: "USD" })],
    ["merchant.key", entry({ key: "a" }), entry({ key: "b" })],
    ["index", entry({ index: 1 }), entry({ index: 2 })],
  ];

  for (const [name, low, high] of levels) {
    it(`${name}`, () => {
      expect(compareContent(low, high)).toBeLessThan(0);
      expect(compareContent(high, low)).toBeGreaterThan(0);
    });
  }

  it("an earlier level wins over every later level", () => {
    const a = entry({ date: "2026-01-14", amountCents: 9999, currency: "USD", index: 9 });
    const b = entry({ date: "2026-01-15", amountCents: 1, currency: "EUR", index: 0 });
    expect(compareContent(a, b)).toBeLessThan(0);
  });

  it("amountCents is numeric, not textual", () => {
    expect(compareContent(entry({ amountCents: 999 }), entry({ amountCents: 1000 }))).toBeLessThan(
      0,
    );
  });

  it("currency and merchant.key decide before index", () => {
    const byCurrency = compareContent(
      entry({ currency: "EUR", index: 5 }),
      entry({ currency: "USD", index: 1 }),
    );
    const byKey = compareContent(entry({ key: "a", index: 5 }), entry({ key: "b", index: 1 }));
    expect(byCurrency).toBeLessThan(0);
    expect(byKey).toBeLessThan(0);
  });

  it("two entries differing only in index compare by index", () => {
    expect(compareContent(entry({ index: 3 }), entry({ index: 7 }))).toBe(-1);
    expect(compareContent(entry({ index: 7 }), entry({ index: 3 }))).toBe(1);
    expect(compareContent(entry({ index: 3 }), entry({ index: 3 }))).toBe(0);
  });
});

describe("compareContent: strings and nulls", () => {
  it("null sorts before any string, for serviceId and processor", () => {
    expect(
      compareContent(entry({ serviceId: null }), entry({ serviceId: "" })),
    ).toBeLessThan(0);
    expect(
      compareContent(entry({ serviceId: "a" }), entry({ serviceId: null })),
    ).toBeGreaterThan(0);
    expect(compareContent(entry({ processor: null }), entry({ processor: "" }))).toBeLessThan(0);
    expect(
      compareContent(entry({ processor: "a" }), entry({ processor: null })),
    ).toBeGreaterThan(0);
  });

  it('compares by code units: "Z" < "a"', () => {
    expect(compareContent(entry({ description: "Z" }), entry({ description: "a" }))).toBeLessThan(
      0,
    );
    expect(
      compareContent(entry({ displayName: "a" }), entry({ displayName: "Z" })),
    ).toBeGreaterThan(0);
  });
});

describe("compareContent: sorting", () => {
  it("gives the same order for every shuffle", () => {
    const entries: Comparable[] = [
      entry({ date: "2026-01-15", amountCents: 999, index: 0 }),
      entry({ date: "2026-01-15", amountCents: 999, index: 1 }),
      entry({ date: "2026-01-15", amountCents: 1549, index: 2 }),
      entry({ date: "2026-01-14", amountCents: 5000, index: 3 }),
      entry({ date: "2026-01-15", amountCents: 999, description: "Z", index: 4 }),
      entry({ date: "2026-01-15", amountCents: 999, description: "a", index: 5 }),
      entry({ date: "2026-01-15", amountCents: 999, processor: "paypal", index: 6 }),
      entry({ date: "2026-01-15", amountCents: 999, currency: "EUR", index: 7 }),
      entry({ date: "2026-01-15", amountCents: 999, key: "a", index: 8 }),
    ];
    const expected = [...entries].sort(compareContent).map((e) => e.index);

    // Deterministic shuffles: rotations and a reversal.
    const shuffles: Comparable[][] = [[...entries].reverse()];
    for (let shift = 1; shift < entries.length; shift++) {
      shuffles.push([...entries.slice(shift), ...entries.slice(0, shift)]);
    }
    for (const shuffled of shuffles) {
      expect([...shuffled].sort(compareContent).map((e) => e.index)).toEqual(expected);
    }
    expect(expected).toHaveLength(entries.length);
  });
});
