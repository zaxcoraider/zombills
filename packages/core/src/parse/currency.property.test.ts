import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isCurrencyCode, normalizeCurrency, resolveRowCurrency } from "./currency";
import { ParseError } from "./parse-error";

const asciiLetter = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz");

/** Three ASCII letters in any mix of case. */
const anyCaseCode: fc.Arbitrary<string> = fc
  .tuple(asciiLetter, asciiLetter, asciiLetter)
  .map((letters) => letters.join(""));

const padding = fc.constantFrom("", " ", "\t", "\u00a0", "\n");

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
