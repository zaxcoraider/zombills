import { describe, expect, it } from "vitest";
import { tryParseAmount } from "./amount";
import { classifyCell, combineDebitCredit } from "./debit-credit";
import type { DecimalSeparator } from "./internal-types";
import { ParseError } from "./parse-error";

function cell(raw: string, separator: DecimalSeparator = ".") {
  return { raw, outcome: tryParseAmount(raw, separator) };
}

function combine(debit: string, credit: string, separator: DecimalSeparator = "."): number {
  return combineDebitCredit(cell(debit, separator), cell(credit, separator));
}

function expectError(debit: string, credit: string): ParseError {
  try {
    combine(debit, credit);
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }
  throw new Error(
    `Expected debit ${JSON.stringify(debit)} / credit ${JSON.stringify(credit)} to fail`,
  );
}

describe("classifyCell (Req 7.6)", () => {
  it.each(["", "   ", "\t", "\u00a0", " \n "])("treats %j as empty", (raw) => {
    expect(classifyCell(raw, tryParseAmount(raw, "."))).toBe("empty");
  });

  it.each(["0", "0.00", "-0.00", "(0.00)", "$0.00", "0.0", "000.00", " 0.00 "])(
    "treats %j as zero",
    (raw) => {
      expect(classifyCell(raw, tryParseAmount(raw, "."))).toBe("zero");
    },
  );

  it.each(["12.00", "-12.00", "0.01", "(5.00)", "$1,234.56"])("treats %j as populated", (raw) => {
    expect(classifyCell(raw, tryParseAmount(raw, "."))).toBe("populated");
  });

  it.each(["abc", "1.050", "--5", "1 234.56", "99999999.99"])(
    "treats the unparseable %j as populated",
    (raw) => {
      expect(classifyCell(raw, tryParseAmount(raw, "."))).toBe("populated");
    },
  );
});

describe("combineDebitCredit: only one cell populated (Req 7.1, 7.2)", () => {
  it("stores a debit as a positive amount", () => {
    expect(combine("50.00", "")).toBe(5000);
  });

  it("stores a debit written as a negative number as the same positive amount", () => {
    expect(combine("-50.00", "")).toBe(5000);
    expect(combine("(50.00)", "")).toBe(5000);
    expect(combine("50.00-", "")).toBe(5000);
  });

  it("stores a credit as a negative amount", () => {
    expect(combine("", "50.00")).toBe(-5000);
  });

  it("stores a credit written as a negative number as the same negative amount", () => {
    expect(combine("", "-50.00")).toBe(-5000);
    expect(combine("", "(50.00)")).toBe(-5000);
  });

  it("reads currency symbols, thousands separators and whitespace", () => {
    expect(combine("£1,234.56", "  ")).toBe(123_456);
    expect(combine("\t", "$1,234.56")).toBe(-123_456);
  });

  it("uses the separator it is given", () => {
    expect(combine("1.234,56", "", ",")).toBe(123_456);
    expect(combine("", "9,99", ",")).toBe(-999);
  });

  it("ignores a zero in the other cell (Req 7.6)", () => {
    expect(combine("12.00", "0.00")).toBe(1200);
    expect(combine("0.00", "12.00")).toBe(-1200);
    expect(combine("-0.00", "12.00")).toBe(-1200);
    expect(combine("12.00", "(0.00)")).toBe(1200);
  });
});

describe("combineDebitCredit: both populated (Req 7.3)", () => {
  it("fails when both cells have a non-zero amount", () => {
    const error = expectError("12.00", "5.00");
    expect(error.field).toBe("amount");
    expect(error.message).toMatch(/both/i);
  });

  it("fails when both cells are populated with negative values too", () => {
    expectError("-12.00", "-5.00");
  });

  it("fails when one of the populated cells is not an amount", () => {
    expectError("abc", "5.00");
    expectError("12.00", "abc");
    expectError("abc", "def");
  });
});

describe("combineDebitCredit: neither populated (Req 7.4)", () => {
  it("returns 0 when one cell is a zero and the other is empty", () => {
    expect(combine("0.00", "")).toBe(0);
    expect(combine("", "0.00")).toBe(0);
    expect(combine("0", "   ")).toBe(0);
  });

  it("returns 0 when both cells are zero", () => {
    expect(combine("0.00", "0.00")).toBe(0);
    expect(combine("0.00", "-0.00")).toBe(0);
  });

  it("returns 0 and never -0", () => {
    for (const [debit, credit] of [
      ["-0.00", ""],
      ["", "-0.00"],
      ["(0.00)", "(0.00)"],
      ["0.00", "0.00"],
    ] as const) {
      expect(Object.is(combine(debit, credit), 0)).toBe(true);
    }
  });

  it("fails when both cells are empty or whitespace", () => {
    for (const [debit, credit] of [
      ["", ""],
      ["  ", ""],
      ["", "\t"],
      ["\u00a0", " "],
    ] as const) {
      const error = expectError(debit, credit);
      expect(error.field).toBe("amount");
      expect(error.message).toMatch(/empty/i);
    }
  });
});

describe("combineDebitCredit: a populated cell that is not an amount (Req 7.5)", () => {
  it("names the debit cell when the debit cell cannot be parsed", () => {
    const error = expectError("abc", "");
    expect(error.field).toBe("debit");
    expect(error.message).toContain("abc");
  });

  it("names the credit cell when the credit cell cannot be parsed", () => {
    const error = expectError("", "abc");
    expect(error.field).toBe("credit");
  });

  it("fails on a debit that is a zero next to an unparseable credit", () => {
    expect(expectError("0.00", "abc").field).toBe("credit");
  });

  it("fails on amounts with too many decimals, too large, or with inner whitespace", () => {
    expect(expectError("1.050", "").field).toBe("debit");
    expect(expectError("", "99999999.99").field).toBe("credit");
    expect(expectError("1 234.56", "").field).toBe("debit");
  });
});
