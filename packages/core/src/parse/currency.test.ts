import { describe, expect, it } from "vitest";
import {
  decideStatementCurrency,
  inferCurrencyFromSymbols,
  isCurrencyCode,
  normalizeCurrency,
  resolveRowCurrency,
} from "./currency.js";
import { ParseError } from "./parse-error.js";

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

describe("inferCurrencyFromSymbols (Req 10.9)", () => {
  it("reads only pound signs as GBP", () => {
    expect(inferCurrencyFromSymbols(["£38.64", "£10.99", "£2,100.00"])).toBe("GBP");
  });

  it("reads only euro signs as EUR", () => {
    expect(inferCurrencyFromSymbols(["€9,99", "€1.234,56"])).toBe("EUR");
  });

  it("lets cells without a symbol sit next to cells with one", () => {
    expect(inferCurrencyFromSymbols(["£38.64", "52.10", "", "£7.99", "41.27"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["12,99", "€9,99"])).toBe("EUR");
  });

  it("finds the symbol before, after, and next to a sign", () => {
    expect(inferCurrencyFromSymbols(["£5.00"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["5.00£"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["-£5.00"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["£-5.00"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["(£5.00)"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["5,00€-"])).toBe("EUR");
    expect(inferCurrencyFromSymbols(["  £5.00\t"])).toBe("GBP");
  });

  it.each([
    ["no cells", []],
    ["no symbol", ["5.00", "12.50"]],
    ["only blanks", ["", "  "]],
    ["a dollar sign", ["$5.00", "$7.00"]],
    ["a yen sign", ["¥500", "¥1,200"]],
    ["another symbol", ["₹500.00", "₩1000"]],
    ["pounds and euros", ["£5.00", "€5,00"]],
    ["pounds and dollars", ["£5.00", "$5.00"]],
    ["euros and a plain cell and a dollar", ["€5,00", "7,00", "$1,00"]],
    ["a full-width pound sign, which is a different character", ["\uFFE15.00"]],
  ] as Array<[string, string[]]>)("gives null for %s", (_name, cells) => {
    expect(inferCurrencyFromSymbols(cells)).toBeNull();
  });

  it("ignores cells that are not shaped like amounts, even when they hold a symbol", () => {
    expect(inferCurrencyFromSymbols(["£abc", "£ 5.00", "££5", "£5.00x", "n/a €"])).toBeNull();
    expect(inferCurrencyFromSymbols(["£5.00", "€abc", "€ 5,00", "$$5"])).toBe("GBP");
  });

  it("counts a symbol on an amount that is rejected later for another reason", () => {
    // Three decimals are a row error, but the cell is shaped like an amount.
    expect(inferCurrencyFromSymbols(["£1.050"])).toBe("GBP");
  });

  it("does not depend on the order of the cells", () => {
    expect(inferCurrencyFromSymbols(["5.00", "£1.00", "£2.00"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["£2.00", "£1.00", "5.00"])).toBe("GBP");
    expect(inferCurrencyFromSymbols(["£2.00", "5.00", "€1,00"])).toBeNull();
    expect(inferCurrencyFromSymbols(["€1,00", "5.00", "£2.00"])).toBeNull();
  });
});

describe("decideStatementCurrency (Req 10.1, 10.2, 10.7-10.10)", () => {
  const poundCells = ["£5.00", "£6.00"];

  it("uses the option and says so, whatever the symbols and the column hold", () => {
    expect(
      decideStatementCurrency({ option: "CAD", currencyCells: null, amountCells: poundCells }),
    ).toEqual({ code: "CAD", source: "option" });
    expect(
      decideStatementCurrency({
        option: "CAD",
        currencyCells: ["EUR", "EUR"],
        amountCells: poundCells,
      }),
    ).toEqual({ code: "CAD", source: "option" });
  });

  it("uses the column's single code, upper-cased and trimmed, and says so", () => {
    expect(
      decideStatementCurrency({
        option: null,
        currencyCells: ["EUR", "eur", " Eur ", ""],
        amountCells: poundCells,
      }),
    ).toEqual({ code: "EUR", source: "column" });
  });

  it("falls back to USD, still from the column, when the column is empty, invalid or mixed", () => {
    for (const currencyCells of [
      [],
      ["", "  "],
      ["EURO", "12A"],
      ["EUR", "GBP"],
      ["eur", "EUR", "usd"],
    ]) {
      expect(
        decideStatementCurrency({ option: null, currencyCells, amountCells: poundCells }),
      ).toEqual({ code: "USD", source: "column" });
    }
  });

  it("does not look at the symbols when there is a currency column", () => {
    expect(
      decideStatementCurrency({ option: null, currencyCells: [""], amountCells: poundCells }).code,
    ).toBe("USD");
  });

  it("infers GBP or EUR from the symbols when there is no option and no column", () => {
    expect(
      decideStatementCurrency({ option: null, currencyCells: null, amountCells: poundCells }),
    ).toEqual({
      code: "GBP",
      source: "symbol",
    });
    expect(
      decideStatementCurrency({ option: null, currencyCells: null, amountCells: ["€1,00"] }),
    ).toEqual({ code: "EUR", source: "symbol" });
  });

  it("defaults to USD, saying so, when the symbols name no currency", () => {
    for (const amountCells of [[], ["5.00"], ["$5.00"], ["¥500"], ["£5.00", "€5,00"]]) {
      expect(decideStatementCurrency({ option: null, currencyCells: null, amountCells })).toEqual({
        code: "USD",
        source: "default",
      });
    }
  });
});
