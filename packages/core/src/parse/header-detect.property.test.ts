import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectHeaderRow, firstNonBlankRow, HEADER_SEARCH_LIMIT } from "./header-detect";
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
} from "./header-names";
import { headerSpellingArbitrary, unrecognisedHeaderCellArbitrary } from "./test-arbitraries";

const RECOGNISED_NAMES = [
  ...DATE_HEADERS,
  ...DESCRIPTION_HEADERS,
  ...AMOUNT_HEADERS,
  ...DEBIT_HEADERS,
  ...CREDIT_HEADERS,
];

/** A header row: at least one recognised name (any case, any padding) among other cells. */
const headerRow: fc.Arbitrary<string[]> = fc
  .tuple(
    fc.array(unrecognisedHeaderCellArbitrary, { maxLength: 4 }),
    headerSpellingArbitrary(RECOGNISED_NAMES),
    fc.array(unrecognisedHeaderCellArbitrary, { maxLength: 4 }),
  )
  .map(([before, name, after]) => [...before, name, ...after]);

/** A row that holds no recognised name: either blank or made of unrecognised cells. */
const preambleRow: fc.Arbitrary<string[]> = fc.oneof(
  fc.array(fc.constantFrom("", " ", "\t"), { maxLength: 3 }),
  fc.array(unrecognisedHeaderCellArbitrary, { minLength: 1, maxLength: 5 }),
);

/** A preamble row with at least one cell that is not blank. */
const nonBlankPreambleRow: fc.Arbitrary<string[]> = fc
  .array(unrecognisedHeaderCellArbitrary, { minLength: 1, maxLength: 4 })
  .filter((row) => row.some((cell) => cell.trim() !== ""));

const dataRows: fc.Arbitrary<string[][]> = fc.array(
  fc.array(fc.string({ maxLength: 10 }), { maxLength: 5 }),
  { maxLength: 10 },
);

describe("header detection properties", () => {
  it("P17: prepending preamble rows leaves the header cells that detection finds unchanged (Req 11.1, 11.2)", () => {
    fc.assert(
      fc.property(
        headerRow,
        dataRows,
        // At most 19 preamble rows, so the header is within the first 20 non-blank rows.
        fc.array(preambleRow, { maxLength: HEADER_SEARCH_LIMIT - 1 }),
        (header, data, preamble) => {
          const baseIndex = detectHeaderRow([header, ...data]);
          expect(baseIndex).toBe(0);

          const rows = [...preamble, header, ...data];
          const index = detectHeaderRow(rows);
          expect(index).toBe(preamble.length);
          expect(rows[index ?? -1]).toEqual(header);
        },
      ),
      { numRuns: 500 },
    );
  });

  it("P17: preamble rows with no recognised name are never mistaken for the header", () => {
    fc.assert(
      fc.property(fc.array(preambleRow, { maxLength: 40 }), (rows) => {
        expect(detectHeaderRow(rows)).toBeNull();
      }),
    );
  });

  it("P17: a header after 20 or more non-blank preamble rows is not found (Req 11.1, 11.3)", () => {
    fc.assert(
      fc.property(
        headerRow,
        fc.array(nonBlankPreambleRow, { minLength: HEADER_SEARCH_LIMIT, maxLength: 30 }),
        fc.array(fc.constantFrom([""], ["  ", ""]), { maxLength: 5 }),
        (header, preamble, blanks) => {
          expect(detectHeaderRow([...preamble, ...blanks, header])).toBeNull();
        },
      ),
    );
  });

  it("P17: blank rows anywhere before the header do not change which row is found", () => {
    fc.assert(
      fc.property(
        headerRow,
        fc.array(nonBlankPreambleRow, { maxLength: 10 }),
        fc.array(fc.nat({ max: 12 }), { maxLength: 30 }),
        (header, preamble, blankPositions) => {
          const withBlanks: string[][] = [...preamble];
          for (const position of blankPositions) {
            withBlanks.splice(position % (withBlanks.length + 1), 0, [""]);
          }
          const rows = [...withBlanks, header];
          expect(detectHeaderRow(rows)).toBe(rows.length - 1);
        },
      ),
    );
  });

  it("firstNonBlankRow returns the first row with content, whatever precedes it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom([""], ["  "], ["\t", " "]), { maxLength: 10 }),
        nonBlankPreambleRow,
        (blanks, row) => {
          expect(firstNonBlankRow([...blanks, row, ["other", "row"]])).toEqual(row);
        },
      ),
    );
  });
});
