import { describe, expect, it } from "vitest";
import { isCurrencyCode, normalizeCurrency, resolveRowCurrency } from "./currency";
import { ParseError } from "./parse-error";

function expectCurrencyError(cell: string): ParseError {
  try {
    resolveRowCurrency(cell, "USD");
  } catch (error) {
    expect(error).toBeInstanceOf(ParseError);
    return error as ParseError;
  }
  throw new Error(`Expected ${JSON.stringify(cell)} to be rejected`);
}

describe("isCurrencyCode (Req 10.1, 10.3)", () => {
  it.each(["USD", "usd", "Usd", "uSD", "eur", "GBP", "XXX", "abc"])("accepts %j", (value) => {
    expect(isCurrencyCode(value)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["US", "two letters"],
    ["EURO", "four letters"],
    ["U$D", "a symbol"],
    ["12A", "digits"],
    ["123", "only digits"],
    [" USD", "leading space"],
    ["USD ", "trailing space"],
    ["USD\n", "trailing newline"],
    ["U D", "inner space"],
    ["ÜSD", "a non-ASCII letter"],
    ["ＵＳＤ", "full-width letters"],
    ["US-", "a hyphen"],
  ])("rejects %j (%s)", (value) => {
    expect(isCurrencyCode(value)).toBe(false);
  });
});

describe("normalizeCurrency (Req 10.1, 10.4)", () => {
  it("upper-cases every spelling of a code", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("Usd")).toBe("USD");
    expect(normalizeCurrency("USD")).toBe("USD");
    expect(normalizeCurrency("eUr")).toBe("EUR");
  });
});

describe("resolveRowCurrency: a valid code in the cell (Req 10.4)", () => {
  it("normalises usd, Usd and USD to USD", () => {
    for (const cell of ["usd", "Usd", "USD"]) {
      expect(resolveRowCurrency(cell, "EUR")).toBe("USD");
    }
  });

  it("trims the cell first", () => {
    expect(resolveRowCurrency(" eur ", "USD")).toBe("EUR");
    expect(resolveRowCurrency("\tGbp\n", "USD")).toBe("GBP");
    expect(resolveRowCurrency("\u00a0jpy\u00a0", "USD")).toBe("JPY");
  });

  it("overrides the fallback", () => {
    expect(resolveRowCurrency("EUR", "USD")).toBe("EUR");
    expect(resolveRowCurrency("eur", "GBP")).toBe("EUR");
  });
});

describe("resolveRowCurrency: no value to use (Req 10.2, 10.5)", () => {
  it("returns the fallback for an empty cell", () => {
    expect(resolveRowCurrency("", "USD")).toBe("USD");
    expect(resolveRowCurrency("", "EUR")).toBe("EUR");
  });

  it("returns the fallback for a whitespace-only cell", () => {
    expect(resolveRowCurrency("   ", "USD")).toBe("USD");
    expect(resolveRowCurrency("\t\u00a0\n", "GBP")).toBe("GBP");
  });

  it("returns the fallback when the statement has no currency column", () => {
    expect(resolveRowCurrency(undefined, "USD")).toBe("USD");
    expect(resolveRowCurrency(undefined, "CHF")).toBe("CHF");
  });
});

describe("resolveRowCurrency: invalid cells (Req 10.6)", () => {
  it.each(["US", "EURO", "U$D", "12A", "$", "USD EUR", "dollars", "ÜSD"])(
    "throws ParseError for %j",
    (cell) => {
      expect(expectCurrencyError(cell).field).toBe("currency");
    },
  );

  it("quotes the offending value in the message", () => {
    expect(expectCurrencyError("EURO").message).toContain('"EURO"');
  });

  it("shortens a very long value in the message", () => {
    expect(expectCurrencyError("x".repeat(500)).message.length).toBeLessThan(120);
  });
});
