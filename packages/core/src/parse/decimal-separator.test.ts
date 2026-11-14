import { describe, expect, it } from "vitest";
import { detectDecimalSeparator } from "./decimal-separator.js";

const PERIOD = { kind: "detected", separator: "." } as const;
const COMMA = { kind: "detected", separator: "," } as const;

describe("detectDecimalSeparator: single cells", () => {
  it.each([
    ["1,234.56", PERIOD],
    ["1,234,567.89", PERIOD],
    ["9.9", PERIOD],
    ["9.99", PERIOD],
    ["1.234,56", COMMA],
    ["1.234.567,89", COMMA],
    ["9,99", COMMA],
    ["9,9", COMMA],
    ["0,50", COMMA],
    [",50", COMMA],
    [".50", PERIOD],
  ])("%s", (cell, expected) => {
    expect(detectDecimalSeparator([cell])).toEqual(expected);
  });
});

describe("detectDecimalSeparator: ambiguous cells fall back to '.' (Req 4.4, 4.6)", () => {
  it.each([
    ["1,234", "a comma followed by exactly 3 digits"],
    ["1.234", "a period followed by exactly 3 digits"],
    ["1,234,567", "repeated commas followed by exactly 3 digits"],
    ["1234", "digits only"],
    ["0", "a single zero"],
    ["5.", "a trailing period"],
    ["5,", "a trailing comma"],
    ["1.2345", "more than 3 trailing digits"],
  ])("%s (%s)", (cell) => {
    expect(detectDecimalSeparator([cell])).toEqual(PERIOD);
  });

  it("defaults to '.' for an empty list", () => {
    expect(detectDecimalSeparator([])).toEqual(PERIOD);
  });

  it("ignores empty and whitespace-only cells", () => {
    expect(detectDecimalSeparator(["", "   ", "\t"])).toEqual(PERIOD);
    expect(detectDecimalSeparator(["", "9,99", "  "])).toEqual(COMMA);
  });

  it("lets a deciding cell settle cells that are ambiguous on their own", () => {
    expect(detectDecimalSeparator(["1,234", "9,99"])).toEqual(COMMA);
    expect(detectDecimalSeparator(["1.234", "9.99"])).toEqual(PERIOD);
    expect(detectDecimalSeparator(["1.234", "5,50"])).toEqual(COMMA);
    expect(detectDecimalSeparator(["1,234", "5.50"])).toEqual(PERIOD);
  });
});

describe("detectDecimalSeparator: sign and currency decorations", () => {
  it.each([
    ["-9,99", COMMA],
    ["9,99-", COMMA],
    ["(9,99)", COMMA],
    ["€9,99", COMMA],
    ["9,99€", COMMA],
    ["-€1.234,56", COMMA],
    ["  9,99  ", COMMA],
    ["\u00a09,99\u00a0", COMMA],
    ["-$1,234.56", PERIOD],
    ["($1,234.56)", PERIOD],
    ["£9.99", PERIOD],
    ["$-9.9", PERIOD],
  ])("%s", (cell, expected) => {
    expect(detectDecimalSeparator([cell])).toEqual(expected);
  });
});

describe("detectDecimalSeparator: several cells", () => {
  it("agrees when every deciding cell points the same way", () => {
    expect(detectDecimalSeparator(["-12,99", "1.234,56", "-9,99", "100"])).toEqual(COMMA);
    expect(detectDecimalSeparator(["-12.99", "1,234.56", "-9.99", "100"])).toEqual(PERIOD);
  });

  it("reports a conflict when one cell says '.' and another says ','", () => {
    const result = detectDecimalSeparator(["1,234.56", "9,99"]);
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.reason).toMatch(/conflicting decimal separator/i);
    }
  });

  it("reports a conflict for '.' and ',' evidence in different cells in either order", () => {
    expect(detectDecimalSeparator(["9.99", "1.234,56"]).kind).toBe("conflict");
    expect(detectDecimalSeparator(["1.234,56", "9.99"]).kind).toBe("conflict");
  });

  it("does not let an ambiguous cell create a conflict", () => {
    expect(detectDecimalSeparator(["1,234", "1.234", "9,99"])).toEqual(COMMA);
  });

  it("ignores cells that are not shaped like amounts", () => {
    expect(detectDecimalSeparator(["abc", "9,99", "12/05/2026", "1.5.5.5x"])).toEqual(COMMA);
    expect(detectDecimalSeparator(["9.99", "n/a", "1 234,56"])).toEqual(PERIOD);
  });
});

describe("detectDecimalSeparator: looks at every cell (Req 4.1)", () => {
  it("finds a deciding cell placed after ten cells that do not decide", () => {
    const undecided = Array.from({ length: 10 }, (_, i) => String(100 + i));
    expect(detectDecimalSeparator([...undecided, "9,99"])).toEqual(COMMA);
  });

  it("finds a deciding cell placed after many ambiguous cells", () => {
    const ambiguous = Array.from({ length: 500 }, () => "1,234");
    expect(detectDecimalSeparator([...ambiguous, "1.234,56"])).toEqual(COMMA);
  });

  it("finds a contradicting cell placed after ten agreeing cells", () => {
    const agreeing = Array.from({ length: 10 }, () => "9,99");
    expect(detectDecimalSeparator([...agreeing, "1,234.56"]).kind).toBe("conflict");
  });
});
