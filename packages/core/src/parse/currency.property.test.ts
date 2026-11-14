import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isCurrencyCode, normalizeCurrency, resolveRowCurrency } from "./currency.js";
import { ParseError } from "./parse-error.js";
import { parseStatement } from "./parse-statement.js";
import {
  expectedFromModel,
  parseOptionsOf,
  renderStatement,
  statementAmountSymbols,
  statementModelArbitrary,
  type StatementModel,
} from "./test-arbitraries.js";
import type { MappedResult } from "./types.js";

const asciiLetter = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz");

/** Three ASCII letters in any mix of case. */
const anyCaseCode: fc.Arbitrary<string> = fc
  .tuple(asciiLetter, asciiLetter, asciiLetter)
  .map((letters) => letters.join(""));

const padding = fc.constantFrom("", " ", "\t", "\u00a0", "\n");

function parsed(model: StatementModel): MappedResult {
  const result = parseStatement(renderStatement(model), parseOptionsOf(model));
  if (result.status !== "mapped") {
    throw new Error(`Expected a mapped result but got ${JSON.stringify(result).slice(0, 300)}`);
  }
  return result;
}

describe("currency properties", () => {
  it("any three ASCII letters, in any case, are a currency code that normalises to upper case (Req 10.1, 10.4)", () => {
    fc.assert(
      fc.property(
        anyCaseCode,
        padding,
        padding,
        fallbackCode(),
        (code, before, after, fallback) => {
          expect(isCurrencyCode(code)).toBe(true);
          expect(normalizeCurrency(code)).toBe(code.toUpperCase());
          expect(resolveRowCurrency(`${before}${code}${after}`, fallback)).toBe(code.toUpperCase());
        },
      ),
    );
  });

  it("normalising is idempotent and leaves exactly three capital letters", () => {
    fc.assert(
      fc.property(anyCaseCode, (code) => {
        const once = normalizeCurrency(code);
        expect(normalizeCurrency(once)).toBe(once);
        expect(once).toMatch(/^[A-Z]{3}$/);
      }),
    );
  });

  it("a cell is either a valid code or rejected, never altered otherwise (Req 10.5, 10.6)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fallbackCode(), (cell, fallback) => {
        const trimmed = cell.trim();
        if (trimmed === "") {
          expect(resolveRowCurrency(cell, fallback)).toBe(fallback);
        } else if (isCurrencyCode(trimmed)) {
          expect(resolveRowCurrency(cell, fallback)).toBe(trimmed.toUpperCase());
        } else {
          expect(() => resolveRowCurrency(cell, fallback)).toThrow(ParseError);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("a statement without a currency column always gets the fallback", () => {
    fc.assert(
      fc.property(fallbackCode(), (fallback) => {
        expect(resolveRowCurrency(undefined, fallback)).toBe(fallback);
      }),
    );
  });
});

function fallbackCode(): fc.Arbitrary<string> {
  return anyCaseCode.map((code) => code.toUpperCase());
}

describe("statement currency through parseStatement", () => {
  const optionOrNot = statementModelArbitrary({ currencyOption: "set" });

  it("P19: an explicit option decides detectedCurrency and every row without a valid currency cell, whatever the symbols (Req 10.1, 10.10, 13.9a)", () => {
    fc.assert(
      fc.property(optionOrNot, (model) => {
        const result = parsed(model);
        const option = (model.optionCurrency ?? "").toUpperCase();
        expect(result.detectedCurrency).toEqual({ code: option, source: "option" });
        const expected = expectedFromModel(model).transactions;
        expect(result.transactions).toEqual(expected);
        model.rows
          .filter((row) => row.defect === null)
          .forEach((row, index) => {
            const own = row.currencyCell.trim();
            const currency = result.transactions[index]?.currency;
            expect(currency).toBe(
              model.hasCurrencyColumn && own !== "" ? own.toUpperCase() : option,
            );
          });
      }),
      { numRuns: 400 },
    );
  });

  it("P19: a valid per-row currency cell always wins, whatever the symbols and the option (Req 10.4, 10.10, 13.9b)", () => {
    fc.assert(
      fc.property(statementModelArbitrary({ currencyColumn: true, defects: false }), (model) => {
        const result = parsed(model);
        expect(result.transactions).toHaveLength(model.rows.length);
        result.transactions.forEach((transaction, index) => {
          const own = model.rows[index]?.currencyCell.trim() ?? "";
          if (own !== "") {
            expect(transaction.currency).toBe(own.toUpperCase());
          }
        });
      }),
      { numRuns: 400 },
    );
  });

  it("P19: with no option and no currency column, detectedCurrency follows the symbols (Req 10.9, 13.9c)", () => {
    fc.assert(
      fc.property(
        statementModelArbitrary({ currencyOption: "none", currencyColumn: false }),
        (model) => {
          const result = parsed(model);
          const symbols = statementAmountSymbols(model);
          const only = [...symbols][0];
          const expected =
            symbols.size === 1 && only === "£"
              ? { code: "GBP", source: "symbol" }
              : symbols.size === 1 && only === "€"
                ? { code: "EUR", source: "symbol" }
                : { code: "USD", source: "default" };
          expect(result.detectedCurrency).toEqual(expected);
          for (const transaction of result.transactions) {
            expect(transaction.currency).toBe(expected.code);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it("P19: pound-only and euro-only statements are read as GBP and EUR when nothing else says otherwise (Req 10.9)", () => {
    const symbolStatements = fc
      .constantFrom<"pound" | "euro">("pound", "euro")
      .chain((symbolStyle) =>
        statementModelArbitrary({
          currencyOption: "none",
          currencyColumn: false,
          symbolStyle,
          defects: false,
          minRows: 1,
        }),
      );
    fc.assert(
      fc.property(symbolStatements, (model) => {
        const result = parsed(model);
        // Only a statement that really carries the symbol is read as GBP or EUR.
        const carriesSymbol = statementAmountSymbols(model).size === 1;
        expect(result.detectedCurrency.source).toBe(carriesSymbol ? "symbol" : "default");
        if (carriesSymbol) {
          expect(result.detectedCurrency.code).toBe(model.symbolStyle === "pound" ? "GBP" : "EUR");
        }
      }),
    );
  });

  it("the symbols never change which rows are errors or how amounts are read", () => {
    fc.assert(
      fc.property(statementModelArbitrary(), (model) => {
        const result = parsed(model);
        const withOption = parseStatement(renderStatement(model), {
          ...parseOptionsOf(model),
          currency: "JPY",
        });
        expect(withOption.status).toBe("mapped");
        if (withOption.status === "mapped") {
          expect(withOption.rowErrors.map((e) => e.reason)).toEqual(
            result.rowErrors.map((e) => e.reason),
          );
          expect(withOption.transactions.map((t) => t.amountCents)).toEqual(
            result.transactions.map((t) => t.amountCents),
          );
        }
      }),
    );
  });
});
