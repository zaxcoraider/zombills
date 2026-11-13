import { describe, expect, it } from "vitest";
import { daysInMonth, detectDateFormat, isLeapYear, parseDate } from "./date-format";
import { ParseError } from "./parse-error";
import type { DateFormat } from "./types";

function expectDateError(raw: string, format: DateFormat): ParseError {
  try {
    parseDate(raw, format);
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }
  throw new Error(`Expected ${JSON.stringify(raw)} to be rejected as ${format}`);
}

describe("parseDate: each format", () => {
  it.each<[string, DateFormat, string]>([
    ["2026-05-01", "yyyy-mm-dd", "2026-05-01"],
    ["01/05/2026", "dd/mm/yyyy", "2026-05-01"],
    ["01/05/2026", "mm/dd/yyyy", "2026-01-05"],
    ["01.05.2026", "dd.mm.yyyy", "2026-05-01"],
    ["01-05-2026", "dd-mm-yyyy", "2026-05-01"],
    ["31/12/1999", "dd/mm/yyyy", "1999-12-31"],
    ["12/31/1999", "mm/dd/yyyy", "1999-12-31"],
  ])("reads %s as %s -> %s", (raw, format, expected) => {
    expect(parseDate(raw, format)).toBe(expected);
  });
});

describe("parseDate: zero padding (Req 3.11)", () => {
  it.each<[string, DateFormat, string]>([
    ["1/5/2026", "dd/mm/yyyy", "2026-05-01"],
    ["1/5/2026", "mm/dd/yyyy", "2026-01-05"],
    ["2026-5-1", "yyyy-mm-dd", "2026-05-01"],
    ["2026-05-1", "yyyy-mm-dd", "2026-05-01"],
    ["2026-5-01", "yyyy-mm-dd", "2026-05-01"],
    ["1.5.2026", "dd.mm.yyyy", "2026-05-01"],
    ["1-5-2026", "dd-mm-yyyy", "2026-05-01"],
    ["01/5/2026", "dd/mm/yyyy", "2026-05-01"],
    ["1/05/2026", "dd/mm/yyyy", "2026-05-01"],
  ])("reads %s as %s -> %s", (raw, format, expected) => {
    expect(parseDate(raw, format)).toBe(expected);
  });
});

describe("parseDate: two-digit years (Req 3.11)", () => {
  it.each<[string, DateFormat, string]>([
    ["01.05.26", "dd.mm.yyyy", "2026-05-01"],
    ["01/05/26", "dd/mm/yyyy", "2026-05-01"],
    ["05/01/26", "mm/dd/yyyy", "2026-05-01"],
    ["1-5-26", "dd-mm-yyyy", "2026-05-01"],
    ["01/01/00", "dd/mm/yyyy", "2000-01-01"],
    ["31/12/99", "dd/mm/yyyy", "2099-12-31"],
  ])("reads %s as %s -> %s", (raw, format, expected) => {
    expect(parseDate(raw, format)).toBe(expected);
  });

  it("does not accept a two-digit year in yyyy-mm-dd", () => {
    expectDateError("26-05-01", "yyyy-mm-dd");
  });

  it("reads a four-digit year as written, with no 20yy expansion", () => {
    expect(parseDate("01/05/1926", "dd/mm/yyyy")).toBe("1926-05-01");
    expect(parseDate("01/05/0026", "dd/mm/yyyy")).toBe("0026-05-01");
  });
});

describe("parseDate: calendar rules", () => {
  it("rejects 31 February", () => {
    expectDateError("31/02/2024", "dd/mm/yyyy");
    expectDateError("02/31/2024", "mm/dd/yyyy");
    expectDateError("2024-02-31", "yyyy-mm-dd");
  });

  it("accepts 29 February in 2024 and rejects it in 2023", () => {
    expect(parseDate("29/02/2024", "dd/mm/yyyy")).toBe("2024-02-29");
    expectDateError("29/02/2023", "dd/mm/yyyy");
  });

  it("applies the century rules for leap years", () => {
    expect(parseDate("29/02/2000", "dd/mm/yyyy")).toBe("2000-02-29");
    expectDateError("29/02/1900", "dd/mm/yyyy");
    expect(parseDate("29/02/00", "dd/mm/yyyy")).toBe("2000-02-29");
  });

  it("rejects day 0, month 0 and month 13", () => {
    expectDateError("00/05/2026", "dd/mm/yyyy");
    expectDateError("01/00/2026", "dd/mm/yyyy");
    expectDateError("01/13/2026", "dd/mm/yyyy");
    expectDateError("13/13/2026", "mm/dd/yyyy");
    expectDateError("2026-00-10", "yyyy-mm-dd");
  });

  it("rejects year 0", () => {
    expectDateError("2026-05-01".replace("2026", "0000"), "yyyy-mm-dd");
    expectDateError("01/05/0000", "dd/mm/yyyy");
  });

  it("rejects day 31 in 30-day months", () => {
    for (const month of ["04", "06", "09", "11"]) {
      expectDateError(`31/${month}/2026`, "dd/mm/yyyy");
      expect(parseDate(`30/${month}/2026`, "dd/mm/yyyy")).toBe(`2026-${month}-30`);
    }
  });
});

describe("parseDate: a cell in the wrong format for the requested format", () => {
  it.each<[string, DateFormat]>([
    ["01/05/2026", "yyyy-mm-dd"],
    ["01/05/2026", "dd.mm.yyyy"],
    ["01/05/2026", "dd-mm-yyyy"],
    ["01.05.2026", "dd/mm/yyyy"],
    ["01-05-2026", "dd/mm/yyyy"],
    ["2026-05-01", "dd-mm-yyyy"],
    ["2026-05-01", "dd/mm/yyyy"],
    ["01-05-2026", "yyyy-mm-dd"],
    ["01.05.2026", "dd-mm-yyyy"],
  ])("%s is not read as %s", (raw, format) => {
    expectDateError(raw, format);
  });

  it.each<[string]>([
    [""],
    ["   "],
    ["not a date"],
    ["1/5"],
    ["1/5/202"],
    ["1/5/20266"],
    ["111/5/2026"],
    ["2026/05/01"],
    ["01/05/2026 10:30"],
    ["May 1, 2026"],
    ["1/5/2026/1"],
    ["+1/5/2026"],
  ])("rejects %j in every format", (raw) => {
    for (const format of [
      "yyyy-mm-dd",
      "dd/mm/yyyy",
      "mm/dd/yyyy",
      "dd.mm.yyyy",
      "dd-mm-yyyy",
    ] as const) {
      expectDateError(raw, format);
    }
  });

  it("names the expected format and quotes the cell in the message", () => {
    const wrongShape = expectDateError("2026-05-01", "dd/mm/yyyy");
    expect(wrongShape.message).toContain("dd/mm/yyyy");
    expect(wrongShape.message).toContain("2026-05-01");
    expect(wrongShape.field).toBe("date");

    const impossible = expectDateError("31/02/2024", "dd/mm/yyyy");
    expect(impossible.message).toContain("dd/mm/yyyy");
    expect(impossible.message).toContain("31/02/2024");
  });

  it("shortens a very long cell in the message", () => {
    expect(expectDateError("9".repeat(500), "dd/mm/yyyy").message.length).toBeLessThan(120);
  });
});

describe("parseDate: whitespace", () => {
  it("trims the cell", () => {
    expect(parseDate("  01/05/2026\t", "dd/mm/yyyy")).toBe("2026-05-01");
    expect(parseDate("\u00a02026-05-01\u00a0", "yyyy-mm-dd")).toBe("2026-05-01");
  });

  it("rejects whitespace inside the date", () => {
    expectDateError("01 / 05 / 2026", "dd/mm/yyyy");
    expectDateError("01/05/ 2026", "dd/mm/yyyy");
  });
});

describe("leap-year helpers", () => {
  it("isLeapYear follows the Gregorian rule", () => {
    expect([1900, 2000, 2023, 2024, 2100, 2400].map(isLeapYear)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
  });

  it("daysInMonth gives 28 or 29 for February and 30 or 31 otherwise", () => {
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect([1, 3, 5, 7, 8, 10, 12].map((month) => daysInMonth(2026, month))).toEqual(
      Array.from({ length: 7 }, () => 31),
    );
    expect([4, 6, 9, 11].map((month) => daysInMonth(2026, month))).toEqual([30, 30, 30, 30]);
  });
});

function detected(format: DateFormat, assumed: boolean) {
  return { kind: "detected", info: { format, assumed } } as const;
}

describe("detectDateFormat: ISO, dot and dash settle the format (Req 3.2, 3.11)", () => {
  it("detects yyyy-mm-dd, padded or not, as not assumed", () => {
    expect(detectDateFormat(["2026-05-01", "2026-5-2", "2026-12-31"])).toEqual(
      detected("yyyy-mm-dd", false),
    );
  });

  it("detects dd.mm.yyyy as not assumed even when every day is 12 or less", () => {
    expect(detectDateFormat(["01.05.2026", "02.06.2026"])).toEqual(detected("dd.mm.yyyy", false));
  });

  it("detects dd-mm-yyyy as not assumed even when every day is 12 or less", () => {
    expect(detectDateFormat(["01-05-2026", "2-6-2026"])).toEqual(detected("dd-mm-yyyy", false));
  });

  it("detects two-digit years in dot and dash dates", () => {
    expect(detectDateFormat(["01.05.26"])).toEqual(detected("dd.mm.yyyy", false));
    expect(detectDateFormat(["01-05-26"])).toEqual(detected("dd-mm-yyyy", false));
  });

  it("does not read a dash date with a four-digit leftmost part as dd-mm-yyyy", () => {
    expect(detectDateFormat(["2026-05-01"])).toEqual(detected("yyyy-mm-dd", false));
  });
});

describe("detectDateFormat: slash dates (Req 3.3, 3.4, 3.5, 3.10)", () => {
  it("reads a leftmost part above 12 as dd/mm/yyyy, not assumed", () => {
    expect(detectDateFormat(["13/05/2026"])).toEqual(detected("dd/mm/yyyy", false));
    expect(detectDateFormat(["01/05/2026", "13/05/2026", "02/06/2026"])).toEqual(
      detected("dd/mm/yyyy", false),
    );
  });

  it("reads a middle part above 12 as mm/dd/yyyy, not assumed", () => {
    expect(detectDateFormat(["05/13/2026"])).toEqual(detected("mm/dd/yyyy", false));
    expect(detectDateFormat(["01/05/2026", "05/13/2026", "02/06/2026"])).toEqual(
      detected("mm/dd/yyyy", false),
    );
  });

  it("defaults to mm/dd/yyyy, assumed, when no part exceeds 12", () => {
    expect(detectDateFormat(["01/05/2026", "02/06/2026", "12/12/2026"])).toEqual(
      detected("mm/dd/yyyy", true),
    );
  });

  it("works with unpadded parts and two-digit years", () => {
    expect(detectDateFormat(["1/5/26", "20/5/26"])).toEqual(detected("dd/mm/yyyy", false));
    expect(detectDateFormat(["1/5/26", "5/20/26"])).toEqual(detected("mm/dd/yyyy", false));
  });

  it("returns a conflict when one cell has a leftmost part above 12 and another a middle part above 12", () => {
    const result = detectDateFormat(["13/05/2026", "05/13/2026"]);
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.reason).toMatch(/conflicting date formats/i);
    }
  });

  it("returns the conflict wherever the two cells sit", () => {
    const filler = Array.from({ length: 30 }, () => "01/02/2026");
    expect(detectDateFormat(["13/05/2026", ...filler, "05/13/2026"]).kind).toBe("conflict");
    expect(detectDateFormat(["05/13/2026", ...filler, "13/05/2026"]).kind).toBe("conflict");
  });

  it("trims whitespace around cells", () => {
    expect(detectDateFormat(["  13/05/2026\t"])).toEqual(detected("dd/mm/yyyy", false));
  });
});

describe("detectDateFormat: looks at every cell (Req 3.1)", () => {
  it("finds a day above 12 placed after ten cells whose day is 12 or less", () => {
    const early = Array.from({ length: 10 }, (_, i) => `${String(i + 1).padStart(2, "0")}/02/2026`);
    expect(detectDateFormat([...early, "15/02/2026"])).toEqual(detected("dd/mm/yyyy", false));
  });

  it("finds a month-first marker placed after many ambiguous cells", () => {
    const early = Array.from({ length: 200 }, () => "03/04/2026");
    expect(detectDateFormat([...early, "03/25/2026"])).toEqual(detected("mm/dd/yyyy", false));
  });

  it("returns the same answer for a dd/mm statement that starts on the 1st", () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 20];
    const cells = days.map((day) => `${String(day).padStart(2, "0")}/01/2026`);
    expect(detectDateFormat(cells)).toEqual(detected("dd/mm/yyyy", false));
    expect(detectDateFormat([...cells].reverse())).toEqual(detected("dd/mm/yyyy", false));
  });
});

describe("detectDateFormat: which cells are candidates (Req 3.1)", () => {
  it("returns none for an empty list", () => {
    expect(detectDateFormat([])).toEqual({ kind: "none" });
  });

  it("returns none when no cell is a date", () => {
    expect(
      detectDateFormat(["", "   ", "abc", "May 1, 2026", "2026/05/01", "1/5", "12345"]),
    ).toEqual({ kind: "none" });
  });

  it("ignores cells that look like dates but are not real dates in any format", () => {
    expect(detectDateFormat(["13/13/2026", "31/02/2026", "00/05/2026", "2026-02-30"])).toEqual({
      kind: "none",
    });
  });

  it("does not let an impossible slash cell create a false conflict", () => {
    // 13/13/2026 would otherwise count as both "leftmost above 12" and "middle above 12".
    expect(detectDateFormat(["13/13/2026", "05/06/2026"])).toEqual(detected("mm/dd/yyyy", true));
    expect(detectDateFormat(["13/13/2026", "14/05/2026"])).toEqual(detected("dd/mm/yyyy", false));
  });

  it("ignores non-date strings among real dates", () => {
    expect(detectDateFormat(["Date", "", "n/a", "14/05/2026"])).toEqual(
      detected("dd/mm/yyyy", false),
    );
  });

  it("uses a date that is real in only one reading", () => {
    // 02/29/2024 is a real mm/dd date and not a real dd/mm date (there is no month 29).
    expect(detectDateFormat(["02/29/2024"])).toEqual(detected("mm/dd/yyyy", false));
    expect(detectDateFormat(["29/02/2024"])).toEqual(detected("dd/mm/yyyy", false));
  });

  it("rejects a leap day in a non-leap year as a candidate", () => {
    expect(detectDateFormat(["29/02/2023", "02/29/2023"])).toEqual({ kind: "none" });
  });
});

describe("detectDateFormat: mixed shapes (Req 3.12)", () => {
  it("lets the most frequent shape win", () => {
    const iso = ["2026-01-02", "2026-01-03", "2026-01-04"];
    expect(detectDateFormat([...iso, "13/01/2026", "14/01/2026"])).toEqual(
      detected("yyyy-mm-dd", false),
    );
    expect(detectDateFormat(["2026-01-02", "13/01/2026", "14/01/2026", "15/01/2026"])).toEqual(
      detected("dd/mm/yyyy", false),
    );
    expect(detectDateFormat(["01.02.2026", "02.02.2026", "13/01/2026"])).toEqual(
      detected("dd.mm.yyyy", false),
    );
    expect(detectDateFormat(["01-02-2026", "02-02-2026", "13.01.2026"])).toEqual(
      detected("dd-mm-yyyy", false),
    );
  });

  it("breaks ties as ISO, then slash, then dot, then dash", () => {
    expect(detectDateFormat(["2026-01-02", "13/01/2026"])).toEqual(detected("yyyy-mm-dd", false));
    expect(detectDateFormat(["13/01/2026", "2026-01-02"])).toEqual(detected("yyyy-mm-dd", false));
    expect(detectDateFormat(["13/01/2026", "01.02.2026"])).toEqual(detected("dd/mm/yyyy", false));
    expect(detectDateFormat(["01.02.2026", "13/01/2026"])).toEqual(detected("dd/mm/yyyy", false));
    expect(detectDateFormat(["01.02.2026", "01-02-2026"])).toEqual(detected("dd.mm.yyyy", false));
    expect(detectDateFormat(["01-02-2026", "01.02.2026"])).toEqual(detected("dd.mm.yyyy", false));
    expect(detectDateFormat(["01-02-2026", "01.02.2026", "13/01/2026", "2026-01-02"])).toEqual(
      detected("yyyy-mm-dd", false),
    );
  });

  it("makes the cells of the other shapes fail parseDate against the chosen format", () => {
    const cells = ["2026-01-02", "2026-01-03", "2026-01-04", "13/01/2026"];
    const result = detectDateFormat(cells);
    expect(result).toEqual(detected("yyyy-mm-dd", false));
    const format = result.kind === "detected" ? result.info.format : "yyyy-mm-dd";
    expect(parseDate("2026-01-03", format)).toBe("2026-01-03");
    expectDateError("13/01/2026", format);
  });

  it("decides the slash reading only from the winning slash cells", () => {
    // The ISO cell does not take part in the slash decision.
    expect(detectDateFormat(["13/01/2026", "2026-01-02"])).toEqual(detected("yyyy-mm-dd", false));
    expect(detectDateFormat(["13/01/2026", "14/01/2026", "2026-01-02"])).toEqual(
      detected("dd/mm/yyyy", false),
    );
  });

  it("only reports a slash conflict when slash is the winning shape", () => {
    // Slash cells that contradict each other, but ISO has more cells: the slash cells become
    // row errors instead of failing the whole statement.
    const iso = ["2026-01-02", "2026-01-03", "2026-01-04"];
    expect(detectDateFormat([...iso, "13/01/2026", "01/13/2026"])).toEqual(
      detected("yyyy-mm-dd", false),
    );
    // With the slash cells in the majority the conflict is reported.
    expect(detectDateFormat(["2026-01-02", "13/01/2026", "01/13/2026", "14/01/2026"]).kind).toBe(
      "conflict",
    );
  });
});
