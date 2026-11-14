import { describe, expect, it } from "vitest";
import {
  addMonths,
  dayNumber,
  daysInMonth,
  formatDate,
  fromDayNumber,
  isLastDayOfMonth,
  isLeap,
  parseIsoDate,
} from "./dates.js";
import type { CivilDate } from "./internal-types.js";

function parse(iso: string): CivilDate {
  const date = parseIsoDate(iso);
  if (date === null) throw new Error(`test date ${iso} does not parse`);
  return date;
}

describe("isLeap and daysInMonth", () => {
  it.each([
    [1900, false],
    [2000, true],
    [2024, true],
    [2026, false],
    [0, true],
  ])("isLeap(%i) is %s", (year, expected) => {
    expect(isLeap(year)).toBe(expected);
  });

  it("gives February 29 days only in leap years", () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("addMonths", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2026-03-27", -1, "2026-02-27"],
    ["2026-01-15", 12, "2027-01-15"],
    ["2026-01-15", 0, "2026-01-15"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-01-15", -13, "2024-12-15"],
  ])("addMonths(%s, %i) is %s", (start, k, expected) => {
    expect(addMonths(parse(start), k).iso).toBe(expected);
  });

  it("returns a date whose day number matches its fields", () => {
    const result = addMonths(parse("2026-01-31"), 1);
    expect(result).toEqual({
      y: 2026,
      m: 2,
      d: 28,
      day: dayNumber(2026, 2, 28),
      iso: "2026-02-28",
    });
  });
});

describe("parseIsoDate", () => {
  it("accepts year 0000 as a leap year", () => {
    expect(parseIsoDate("0000-02-29")?.iso).toBe("0000-02-29");
    expect(parseIsoDate("0000-01-01")?.y).toBe(0);
  });

  it("returns the fields and the Day number", () => {
    expect(parseIsoDate("1970-01-01")).toEqual({
      y: 1970,
      m: 1,
      d: 1,
      day: 0,
      iso: "1970-01-01",
    });
  });

  it.each([
    "2026-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-01-32",
    "2026-01-00",
    "26-01-01",
    "2026-1-1",
    " 2026-01-01",
    "2026-01-01 ",
    "2026-01-01\n",
    "2026/01/01",
    "",
  ])("rejects %j", (value) => {
    expect(parseIsoDate(value)).toBeNull();
  });

  it.each([null, undefined, 20260101, {}, [], true, Symbol("d")])(
    "rejects the non-string %s",
    (value) => {
      expect(parseIsoDate(value)).toBeNull();
    },
  );
});

describe("dayNumber, fromDayNumber and formatDate", () => {
  it("knows the epoch and a leap-century date", () => {
    expect(dayNumber(1970, 1, 1)).toBe(0);
    expect(dayNumber(2000, 3, 1)).toBe(11017);
  });

  it("handles negative Day numbers", () => {
    expect(fromDayNumber(-1).iso).toBe("1969-12-31");
    expect(dayNumber(0, 1, 1)).toBeLessThan(0);
    expect(fromDayNumber(dayNumber(0, 1, 1)).iso).toBe("0000-01-01");
  });

  it("formats 4-digit years, and 5 digits only for year 10000", () => {
    expect(formatDate(10000, 1, 15)).toBe("10000-01-15");
    expect(formatDate(7, 3, 9)).toBe("0007-03-09");
    expect(fromDayNumber(dayNumber(9999, 12, 31) + 1).iso).toBe("10000-01-01");
  });

  it("detects the last day of a month", () => {
    expect(isLastDayOfMonth(parse("2024-02-29"))).toBe(true);
    expect(isLastDayOfMonth(parse("2026-02-28"))).toBe(true);
    expect(isLastDayOfMonth(parse("2026-02-27"))).toBe(false);
    expect(isLastDayOfMonth(parse("2026-12-31"))).toBe(true);
  });
});
