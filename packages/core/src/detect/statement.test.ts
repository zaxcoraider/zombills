import { describe, expect, it } from "vitest";
import { compareContent } from "./content-order.js";
import { parseIsoDate } from "./dates.js";
import type { Entry } from "./internal-types.js";
import { buildStatementInfo, resolveAsOf } from "./statement.js";
import { charge } from "./test-fixtures.js";
import { validateElement } from "./validate.js";

/** Valid entries in Content order, as step 1 produces them. */
function entries(rows: { date: string; currency?: string }[]): Entry[] {
  const valid: Omit<Entry, "rank">[] = [];
  rows.forEach((row, index) => {
    const result = validateElement(
      charge(row.date, 999, "merchant:gym", { currency: row.currency ?? "USD" }),
      index,
    );
    if (!result.ok) throw new Error(result.reason);
    valid.push(result.entry);
  });
  valid.sort(compareContent);
  return valid.map((entry, rank) => ({ ...entry, rank }));
}

const SORTED = entries([{ date: "2026-01-15" }, { date: "2026-03-10" }]);

describe("buildStatementInfo: no entries", () => {
  it("gives null dates, no currencies and no As-of date", () => {
    expect(buildStatementInfo([], undefined)).toEqual({
      firstDate: null,
      lastDate: null,
      asOf: null,
      asOfSource: null,
      currencies: [],
    });
  });

  it("still uses a valid asOf option", () => {
    const info = buildStatementInfo([], { asOf: "2026-05-01" });
    expect(info.firstDate).toBeNull();
    expect(info.asOf).toBe("2026-05-01");
    expect(info.asOfSource).toBe("option");
  });
});

describe("buildStatementInfo: range and As-of date", () => {
  it("takes the range from the first and last sorted entry", () => {
    const info = buildStatementInfo(SORTED, undefined);
    expect(info.firstDate).toBe("2026-01-15");
    expect(info.lastDate).toBe("2026-03-10");
    expect(info.asOf).toBe("2026-03-10");
    expect(info.asOfSource).toBe("statement");
  });

  it("gives a single entry the same first and last date", () => {
    const info = buildStatementInfo(entries([{ date: "2026-02-01" }]), {});
    expect(info.firstDate).toBe("2026-02-01");
    expect(info.lastDate).toBe("2026-02-01");
  });

  it.each([
    ["inside the range", "2026-02-01"],
    ["before firstDate", "2025-06-01"],
    ["after lastDate", "2027-01-01"],
  ])("uses a valid asOf %s with source option", (_label, asOf) => {
    const info = buildStatementInfo(SORTED, { asOf });
    expect(info.asOf).toBe(asOf);
    expect(info.asOfSource).toBe("option");
    expect(info.firstDate).toBe("2026-01-15");
    expect(info.lastDate).toBe("2026-03-10");
  });

  it.each([
    ["an impossible date", { asOf: "2026-02-30" }],
    ["a number", { asOf: 20260301 }],
    ["an empty string", { asOf: "" }],
    ["null options", null],
    ["a number as options", 42],
    ["an array as options", []],
    ["empty options", {}],
    ["undefined options", undefined],
  ])("falls back to lastDate for %s", (_label, options) => {
    const info = buildStatementInfo(SORTED, options);
    expect(info.asOf).toBe("2026-03-10");
    expect(info.asOfSource).toBe("statement");
  });

  it("ignores an asOf property on an array", () => {
    const options = Object.assign([], { asOf: "2026-05-01" });
    expect(buildStatementInfo(SORTED, options).asOfSource).toBe("statement");
  });

  it("reads options.asOf exactly once", () => {
    let reads = 0;
    const options = {
      get asOf(): string {
        reads += 1;
        return "2026-05-01";
      },
    };
    const info = buildStatementInfo(SORTED, options);
    expect(reads).toBe(1);
    expect(info.asOf).toBe("2026-05-01");
  });
});

describe("buildStatementInfo: currencies", () => {
  it("lists distinct currencies in code-unit order", () => {
    const sorted = entries([
      { date: "2026-01-01", currency: "USD" },
      { date: "2026-01-02", currency: "EUR" },
      { date: "2026-01-03", currency: "USD" },
      { date: "2026-01-04", currency: "GBP" },
      { date: "2026-01-05", currency: "EUR" },
    ]);
    expect(buildStatementInfo(sorted, undefined).currencies).toEqual(["EUR", "GBP", "USD"]);
  });
});

describe("resolveAsOf", () => {
  it("returns the CivilDate of an option As-of date", () => {
    const info = buildStatementInfo(SORTED, { asOf: "2026-05-01" });
    expect(resolveAsOf(info)).toEqual(parseIsoDate("2026-05-01"));
  });

  it("returns the CivilDate of lastDate when no option is given", () => {
    const info = buildStatementInfo(SORTED, undefined);
    expect(resolveAsOf(info)).toEqual(parseIsoDate("2026-03-10"));
  });

  it("returns null when there is no As-of date", () => {
    expect(resolveAsOf(buildStatementInfo([], undefined))).toBeNull();
  });
});
