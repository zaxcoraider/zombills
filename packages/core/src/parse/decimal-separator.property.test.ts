import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectDecimalSeparator } from "./decimal-separator.js";
import {
  amountFormatArbitrary,
  anyAmountStringArbitrary,
  centsArbitrary,
  decimalSeparatorArbitrary,
  formatAmount,
  withPermutation,
} from "./test-arbitraries.js";

/** A cell written in a given style, formatted with the generator from the amount tests. */
function styledAmountCell(decimal: "." | ","): fc.Arbitrary<string> {
  return fc
    .tuple(centsArbitrary, amountFormatArbitrary(decimal))
    .map(([cents, format]) => formatAmount(cents, format));
}

/** Cells that say nothing about the separator on their own. */
const undecidedCell: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.nat({ max: 99_999 }).map(String),
  fc.nat({ max: 999 }).map((n) => `1,${String(n).padStart(3, "0")}`),
  fc.nat({ max: 999 }).map((n) => `1.${String(n).padStart(3, "0")}`),
);

/** Any mix of styled, undecided and arbitrary cells. Mixed styles produce conflicts. */
const anyCell: fc.Arbitrary<string> = fc.oneof(
  styledAmountCell("."),
  styledAmountCell(","),
  undecidedCell,
  anyAmountStringArbitrary,
);

describe("decimal separator properties", () => {
  it("P10: shuffling the amount cells never changes the detection (Req 4.7)", () => {
    fc.assert(
      fc.property(withPermutation(anyCell), ([cells, shuffled]) => {
        expect(shuffled).toHaveLength(cells.length);
        expect(detectDecimalSeparator(shuffled)).toEqual(detectDecimalSeparator(cells));
      }),
      { numRuns: 500 },
    );
  });

  it("P10: a conflict does not depend on where the contradicting cells sit", () => {
    fc.assert(
      fc.property(
        withPermutation(fc.oneof(styledAmountCell("."), undecidedCell)),
        withPermutation(fc.oneof(styledAmountCell(","), undecidedCell)),
        ([periodCells, periodShuffled], [commaCells, commaShuffled]) => {
          const mixed = [...periodCells, ...commaCells];
          const reordered = [...commaShuffled, ...periodShuffled];
          expect(detectDecimalSeparator(reordered)).toEqual(detectDecimalSeparator(mixed));
        },
      ),
    );
  });

  it("P10: appending an undecided cell never changes the detection", () => {
    fc.assert(
      fc.property(fc.array(anyCell, { maxLength: 30 }), undecidedCell, (cells, extra) => {
        expect(detectDecimalSeparator([...cells, extra])).toEqual(detectDecimalSeparator(cells));
      }),
    );
  });

  it("Req 4.2/4.4: a statement written with '.' decimals is detected as '.', wherever the cells sit", () => {
    fc.assert(
      fc.property(withPermutation(fc.oneof(styledAmountCell("."), undecidedCell)), ([, cells]) => {
        expect(detectDecimalSeparator(cells)).toEqual({ kind: "detected", separator: "." });
      }),
    );
  });

  it("Req 4.3/4.4: a statement written with ',' decimals is detected as ',' once one cell shows it", () => {
    fc.assert(
      fc.property(
        withPermutation(fc.oneof(styledAmountCell(","), undecidedCell)),
        styledAmountCell(","),
        ([, cells], deciding) => {
          expect(detectDecimalSeparator([...cells, deciding])).toEqual({
            kind: "detected",
            separator: ",",
          });
        },
      ),
    );
  });

  it("Req 4.5: cells written both ways are a conflict", () => {
    fc.assert(
      fc.property(
        fc.array(styledAmountCell("."), { minLength: 1, maxLength: 10 }),
        fc.array(styledAmountCell(","), { minLength: 1, maxLength: 10 }),
        decimalSeparatorArbitrary,
        (periodCells, commaCells, first) => {
          const cells =
            first === "." ? [...periodCells, ...commaCells] : [...commaCells, ...periodCells];
          expect(detectDecimalSeparator(cells).kind).toBe("conflict");
        },
      ),
    );
  });
});
