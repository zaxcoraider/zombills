import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tryParseAmount } from "./amount.js";
import { combineDebitCredit } from "./debit-credit.js";
import { ParseError } from "./parse-error.js";
import {
  AMOUNT_RANGE_CENTS,
  amountFormatArbitrary,
  decimalSeparatorArbitrary,
  formatAmount,
} from "./test-arbitraries.js";

/** Any non-zero amount in the supported range. */
const nonZeroCents: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 1, max: AMOUNT_RANGE_CENTS }),
  fc.constantFrom(1, 99, 100, 5000, AMOUNT_RANGE_CENTS),
);

/** Cells that are not populated: empty, whitespace, or a literal zero written in any style. */
function notPopulated(decimal: "." | ","): fc.Arbitrary<string> {
  const zero = (digits: string) => `0${decimal}${digits}`;
  return fc.constantFrom(
    "",
    "   ",
    "\t",
    "\u00a0",
    "0",
    zero("0"),
    zero("00"),
    `-${zero("00")}`,
    `(${zero("00")})`,
    `$${zero("00")}`,
  );
}

/** An amount cell holding `cents` (positive or negative spelling, random decoration). */
function amountCell(decimal: "." | ","): fc.Arbitrary<{ cents: number; raw: string }> {
  return fc
    .tuple(nonZeroCents, fc.boolean(), amountFormatArbitrary(decimal))
    .map(([magnitude, writeNegative, format]) => ({
      cents: magnitude,
      raw: formatAmount(writeNegative ? -magnitude : magnitude, format),
    }));
}

function cell(raw: string, decimal: "." | ",") {
  return { raw, outcome: tryParseAmount(raw, decimal) };
}

/** A decimal style, an amount cell written in it, and a cell that is not populated, in the same style. */
const casePerStyle = decimalSeparatorArbitrary.chain((decimal) =>
  fc.tuple(fc.constant(decimal), amountCell(decimal), notPopulated(decimal)),
);

describe("debit/credit properties", () => {
  it("P13: a debit cell holding fmt(c) or fmt(-c) gives abs(c), whatever the credit cell's emptiness", () => {
    fc.assert(
      fc.property(casePerStyle, ([decimal, { cents, raw }, other]) => {
        const result = combineDebitCredit(cell(raw, decimal), cell(other, decimal));
        expect(result).toBe(cents);
        expect(result).toBeGreaterThan(0);
      }),
      { numRuns: 500 },
    );
  });

  it("P13: a credit cell holding fmt(c) or fmt(-c) gives -abs(c), whatever the debit cell's emptiness", () => {
    fc.assert(
      fc.property(casePerStyle, ([decimal, { cents, raw }, other]) => {
        const result = combineDebitCredit(cell(other, decimal), cell(raw, decimal));
        expect(result).toBe(-cents);
        expect(result).toBeLessThan(0);
      }),
      { numRuns: 500 },
    );
  });

  it("P13: writing the same amount with either sign gives the same stored value", () => {
    fc.assert(
      fc.property(
        nonZeroCents,
        decimalSeparatorArbitrary,
        amountFormatArbitrary("."),
        (cents, decimal, format) => {
          const positive = formatAmount(cents, { ...format, decimal });
          const negative = formatAmount(-cents, { ...format, decimal });
          expect(combineDebitCredit(cell(positive, decimal), cell("", decimal))).toBe(
            combineDebitCredit(cell(negative, decimal), cell("", decimal)),
          );
          expect(combineDebitCredit(cell("", decimal), cell(positive, decimal))).toBe(
            combineDebitCredit(cell("", decimal), cell(negative, decimal)),
          );
        },
      ),
    );
  });

  it("Req 7.3: two populated cells are always an error on the amount", () => {
    fc.assert(
      fc.property(amountCell("."), amountCell("."), (debit, credit) => {
        try {
          combineDebitCredit(cell(debit.raw, "."), cell(credit.raw, "."));
        } catch (error) {
          expect(error).toBeInstanceOf(ParseError);
          expect((error as ParseError).field).toBe("amount");
          return;
        }
        throw new Error("expected an error");
      }),
    );
  });

  it("Req 7.4: two cells that are not populated give 0 only when one is a literal zero", () => {
    fc.assert(
      fc.property(notPopulated("."), notPopulated("."), (debit, credit) => {
        const isBlank = (raw: string) => raw.trim() === "";
        if (isBlank(debit) && isBlank(credit)) {
          expect(() => combineDebitCredit(cell(debit, "."), cell(credit, "."))).toThrow(ParseError);
        } else {
          const result = combineDebitCredit(cell(debit, "."), cell(credit, "."));
          expect(Object.is(result, 0)).toBe(true);
        }
      }),
    );
  });
});
