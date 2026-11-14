import { describe, expect, it } from "vitest";
import {
  extractCurrencySymbol,
  MAX_AMOUNT_CENTS,
  negate,
  parseAmountCents,
  tryParseAmount,
} from "./amount.js";
import type { DecimalSeparator } from "./internal-types.js";
import { ParseError } from "./parse-error.js";
import { AMOUNT_RANGE_CENTS } from "./test-arbitraries.js";

function expectParseError(raw: string, separator: DecimalSeparator): ParseError {
  try {
    parseAmountCents(raw, separator);
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }
  throw new Error(`Expected ${JSON.stringify(raw)} to be rejected with separator "${separator}"`);
}

describe("parseAmountCents: accepted values with separator '.'", () => {
  const cases: Array<[string, number]> = [
    ["9.99", 999],
    ["0.00", 0],
    ["0", 0],
    ["5", 500],
    ["5.", 500],
    [".5", 50],
    [".05", 5],
    ["0.1", 10],
    ["1.5", 150],
    ["007.10", 710],
    ["1,234.56", 123_456],
    ["$1,234.56", 123_456],
    ["£9.99", 999],
    ["€9.99", 999],
    ["9.99€", 999],
    ["¥1500", 150_000],
    ["-9.99", -999],
    ["9.99-", -999],
    ["(9.99)", -999],
    ["($9.99)", -999],
    ["(9.99$)", -999],
    ["-$9.99", -999],
    ["$-9.99", -999],
    ["$9.99-", -999],
    ["-1,250.00", -125_000],
  ];
  for (const [raw, expected] of cases) {
    it(`parses ${JSON.stringify(raw)} as ${expected}`, () => {
      expect(parseAmountCents(raw, ".")).toBe(expected);
    });
  }
});

describe("parseAmountCents: accepted values with separator ','", () => {
  const cases: Array<[string, number]> = [
    ["9,99", 999],
    ["1.234,56", 123_456],
    ["€9,99", 999],
    ["-12,99", -1299],
    ["(1.234,56)", -123_456],
    ["12,5", 1250],
    ["1.234", 123_400],
  ];
  for (const [raw, expected] of cases) {
    it(`parses ${JSON.stringify(raw)} as ${expected}`, () => {
      expect(parseAmountCents(raw, ",")).toBe(expected);
    });
  }
});

describe("parseAmountCents: whitespace (Req 5.1, 5.10)", () => {
  it.each([
    ["spaces", "  9.99  "],
    ["tab and newline", "\t9.99\n"],
    ["carriage return", "\r9.99\r"],
    ["no-break space (Zs)", "\u00a09.99\u00a0"],
    ["em space (Zs)", "\u20039.99\u2003"],
    ["line and paragraph separator (Zl, Zp)", "\u20289.99\u2029"],
  ])("strips outer whitespace: %s", (_name, raw) => {
    expect(parseAmountCents(raw, ".")).toBe(999);
  });

  it.each([
    ["thousands group", "1 234.56"],
    ["after the symbol", "$ 5.00"],
    ["after the minus", "- 5"],
    ["before the decimal point", "5 .00"],
    ["inside parentheses", "( 5.00 )"],
    ["no-break space inside", "1\u00a0234.56"],
  ])("rejects whitespace between components: %s", (_name, raw) => {
    expectParseError(raw, ".");
  });
});

describe("parseAmountCents: rejected values", () => {
  it.each([
    ["empty", ""],
    ["spaces only", "   "],
    ["no-break space only", "\u00a0"],
    ["letters", "abc"],
    ["trailing letters", "12abc"],
    ["double leading minus", "--5"],
    ["parentheses around a minus", "(-5)"],
    ["opening parenthesis only", "(5"],
    ["closing parenthesis only", "5)"],
    ["empty parentheses", "()"],
    ["lone parenthesis", "("],
    ["minus at both ends", "-5-"],
    ["lone minus", "-"],
    ["plus sign", "+5"],
    ["two currency symbols", "$$5"],
    ["symbol on both sides", "$5$"],
    ["symbol with no number", "$"],
    ["scientific notation", "1e3"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["lone decimal point", "."],
    ["lone comma", ","],
    ["two decimal points", "1.00.00"],
    ["Arabic-Indic digit", "\u0663"],
    ["Unicode minus sign", "\u22125"],
    ["currency code letters", "USD5"],
  ])("rejects %s", (_name, raw) => {
    expectParseError(raw, ".");
  });

  it("rejects more than 2 decimal digits and never rounds or truncates (Req 5.7)", () => {
    expectParseError("1.050", ".");
    expectParseError("1.2345", ".");
    expectParseError("9.999", ".");
    expectParseError("1.234", ".");
  });

  it("reads '9,99' as 999 dollars with separator '.' (choosing the separator is the caller's job)", () => {
    expect(parseAmountCents("9,99", ".")).toBe(99_900);
  });

  it("rejects values that are wrong for separator ','", () => {
    expectParseError("1,234.56", ",");
    expectParseError("1,2,3", ",");
    expectParseError("1,234,56", ",");
  });

  it("raises a ParseError for the amount field", () => {
    expect(expectParseError("abc", ".").field).toBe("amount");
  });

  it("quotes the offending cell in the message, shortened when long", () => {
    expect(expectParseError("abc", ".").message).toContain('"abc"');
    const long = "x".repeat(500);
    expect(expectParseError(long, ".").message.length).toBeLessThan(120);
  });
});

describe("parseAmountCents: magnitude limit (Req 5.11)", () => {
  it("agrees with the range used by the property tests", () => {
    expect(MAX_AMOUNT_CENTS).toBe(AMOUNT_RANGE_CENTS);
    expect(MAX_AMOUNT_CENTS).toBe(999_999_9900);
  });

  it("accepts the largest value, positive and negative", () => {
    expect(parseAmountCents("99999999.00", ".")).toBe(9_999_999_900);
    expect(parseAmountCents("-99999999.00", ".")).toBe(-9_999_999_900);
    expect(parseAmountCents("99,999,999.00", ".")).toBe(9_999_999_900);
  });

  it("accepts the value just below the limit", () => {
    expect(parseAmountCents("99999998.99", ".")).toBe(9_999_999_899);
  });

  it("rejects values just above the limit", () => {
    expectParseError("99999999.01", ".");
    expectParseError("99999999.99", ".");
    expectParseError("-99999999.01", ".");
  });

  it("rejects values with more than 8 integer digits before converting them", () => {
    expectParseError("100000000", ".");
    expectParseError("123456789.00", ".");
    expectParseError("1,000,000,000.00", ".");
    expectParseError("9".repeat(400), ".");
  });

  it("ignores leading zeros when counting integer digits", () => {
    expect(parseAmountCents("000000000099.99", ".")).toBe(9999);
  });
});

describe("parseAmountCents: zero", () => {
  it("returns 0 and never -0 for negative zero spellings", () => {
    for (const raw of ["-0.00", "(0.00)", "0.00-", "-0", "$-0.00"]) {
      expect(Object.is(parseAmountCents(raw, "."), 0), raw).toBe(true);
    }
  });
});

describe("negate", () => {
  it("negates non-zero values", () => {
    expect(negate(5)).toBe(-5);
    expect(negate(-5)).toBe(5);
  });

  it("maps 0 to 0, not -0", () => {
    expect(Object.is(negate(0), 0)).toBe(true);
    expect(Object.is(negate(-0), 0)).toBe(true);
  });
});

describe("tryParseAmount", () => {
  it("returns the value on success", () => {
    expect(tryParseAmount("$1,234.56", ".")).toEqual({ ok: true, cents: 123_456 });
  });

  it("returns the failure reason on a ParseError", () => {
    const outcome = tryParseAmount("abc", ".");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("abc");
    }
  });

  it("returns a failure for an empty cell", () => {
    expect(tryParseAmount("", ".").ok).toBe(false);
  });

  it("does not swallow errors that are not ParseError", () => {
    expect(() => tryParseAmount(undefined as unknown as string, ".")).toThrow(TypeError);
  });
});

describe("extractCurrencySymbol", () => {
  it.each([
    ["£5.00", "£"],
    ["5.00£", "£"],
    ["€9,99", "€"],
    ["$1,234.56", "$"],
    ["¥1500", "¥"],
    ["-£5.00", "£"],
    ["£-5.00", "£"],
    ["(€5,00)", "€"],
    ["5,00€-", "€"],
    ["  £5.00  ", "£"],
    ["£1.050", "£"],
  ])("finds the symbol of %j", (raw, symbol) => {
    expect(extractCurrencySymbol(raw)).toBe(symbol);
  });

  it.each(["5.00", "-5.00", "(5.00)", "0", ""])("gives null for %j, which has no symbol", (raw) => {
    expect(extractCurrencySymbol(raw)).toBeNull();
  });

  it.each(["£abc", "£ 5.00", "££5", "£5.00x", "£", "£-", "(£5.00", "n/a", "USD5"])(
    "gives null for %j, which is not shaped like an amount",
    (raw) => {
      expect(extractCurrencySymbol(raw)).toBeNull();
    },
  );

  it("agrees with parseAmountCents about what an amount is", () => {
    for (const raw of ["£5.00", "5.00€", "£abc", "$$5", "1 234", "£1.050"]) {
      const shaped = extractCurrencySymbol(raw) !== null;
      let parses = true;
      try {
        parseAmountCents(raw, ".");
      } catch {
        parses = false;
      }
      // A cell that parses and has a symbol is shaped like an amount; the reverse need not hold
      // (£1.050 is shaped like an amount but has too many decimals).
      if (parses && /\p{Sc}/u.test(raw)) {
        expect(shaped, raw).toBe(true);
      }
    }
  });
});
