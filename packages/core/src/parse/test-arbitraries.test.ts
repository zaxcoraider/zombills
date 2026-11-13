// Self-tests for the statement model in test-arbitraries.ts: the model must render to the cells it
// intends, otherwise the end-to-end properties would be testing a broken oracle.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  expectedFromModel,
  parseOptionsOf,
  renderStatement,
  statementMatrix,
  statementModelArbitrary,
  withBlankRows,
  withCanonicalHeaders,
  withFlippedSignConvention,
  type StatementModel,
} from "./test-arbitraries";
import { isBlankRow, stripBom, tokenize } from "./tokenize";

function expectSameRows(actual: string[][], intended: string[][]): void {
  expect(actual).toHaveLength(intended.length);
  intended.forEach((row, index) => {
    const tokenized = actual[index] ?? [];
    if (isBlankRow(row)) {
      expect(isBlankRow(tokenized), `row ${index} should be blank`).toBe(true);
    } else {
      expect(tokenized, `row ${index}`).toEqual(row);
    }
  });
}

const model = statementModelArbitrary();

describe("statement model: rendering", () => {
  it("serialising and then tokenizing gives the cells the model intended", () => {
    fc.assert(
      fc.property(model, (statement) => {
        const text = renderStatement(statement);
        expect(text.startsWith("\uFEFF")).toBe(statement.bom);
        const table = tokenize(stripBom(text));
        expect(table.delimiter).toBe(statement.delimiter);
        expectSameRows(table.rows, statementMatrix(statement));
      }),
      { numRuns: 500 },
    );
  });

  it("also holds when free text never contains a delimiter", () => {
    fc.assert(
      fc.property(statementModelArbitrary({ delimiterInText: false }), (statement) => {
        expect(statement.delimiterFreeText).toBe(true);
        expectSameRows(
          tokenize(stripBom(renderStatement(statement))).rows,
          statementMatrix(statement),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("holds with blank rows between, before and after the data rows", () => {
    fc.assert(
      fc.property(
        model,
        fc.array(fc.array(fc.constantFrom("empty", "delimiters", "spaces"), { maxLength: 2 }), {
          minLength: 15,
          maxLength: 15,
        }),
        (statement, blanks) => {
          const withBlanks = withBlankRows(
            statement,
            statement.blanksBefore.map((_, index) => blanks[index] ?? []),
          );
          expectSameRows(
            tokenize(stripBom(renderStatement(withBlanks))).rows,
            statementMatrix(withBlanks),
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("statement model: what it promises", () => {
  it("counts every non-blank data row exactly once", () => {
    fc.assert(
      fc.property(model, (statement) => {
        const expected = expectedFromModel(statement);
        expect(expected.dataRowCount).toBe(statement.rows.length);
        expect(expected.transactions.length + expected.rowErrorOrdinals.length).toBe(
          statement.rows.length,
        );
      }),
    );
  });

  it("never makes a data row blank, so no data row is skipped", () => {
    fc.assert(
      fc.property(model, (statement) => {
        const matrix = statementMatrix(statement);
        const header = statement.preamble.length;
        const dataRows = matrix
          .slice(header + 1)
          .filter((row, index) => !isBlankRow(row) || index < 0);
        expect(dataRows).toHaveLength(statement.rows.length);
      }),
    );
  });

  it("has a date with a day above 12 among its sound rows when the date format is a slash format", () => {
    fc.assert(
      fc.property(model, (statement) => {
        fc.pre(statement.dateFormat === "dd/mm/yyyy" || statement.dateFormat === "mm/dd/yyyy");
        fc.pre(statement.rows.length > 0);
        expect(statement.rows.some((row) => row.defect === null && row.date.day > 12)).toBe(true);
      }),
    );
  });

  it("arranges most amounts as money out in majority mode", () => {
    fc.assert(
      fc.property(
        statementModelArbitrary({ layout: "signed-amount", signMode: "majority" }),
        (statement) => {
          const counted = statement.rows.filter(
            (row) => row.cents > 0 && row.defect !== "amount-garbage",
          );
          const out = counted.filter((row) => row.direction === "out").length;
          if (counted.length > 0) {
            expect(out).toBeGreaterThan(counted.length - out);
          }
        },
      ),
    );
  });

  it("passes the sign convention as an option only in explicit mode", () => {
    fc.assert(
      fc.property(model, (statement) => {
        const options = parseOptionsOf(statement);
        expect("signConvention" in options).toBe(statement.signMode === "explicit");
        expect(options.currency).toBe(statement.optionCurrency ?? undefined);
      }),
    );
  });

  it("flipping the sign convention changes the written amounts and no expectation", () => {
    fc.assert(
      fc.property(statementModelArbitrary({ layout: "signed-amount" }), (statement) => {
        const flipped = withFlippedSignConvention(statement);
        expect(flipped.signConvention).not.toBe(statement.signConvention);
        expect(expectedFromModel(flipped)).toEqual(expectedFromModel(statement));
      }),
    );
  });

  it("canonical headers keep the same layout and the same expectation", () => {
    fc.assert(
      fc.property(model, (statement) => {
        const canonical = withCanonicalHeaders(statement);
        expect(expectedFromModel(canonical)).toEqual(expectedFromModel(statement));
        expect(canonical.columns.length).toBe(statement.columns.length);
      }),
    );
  });
});

describe("statement model: coverage of the generator", () => {
  const samples: StatementModel[] = fc.sample(model, 600);

  it("produces both layouts, every date format and every delimiter", () => {
    expect(new Set(samples.map((s) => s.layout)).size).toBe(2);
    expect(new Set(samples.map((s) => s.dateFormat)).size).toBe(5);
    expect(new Set(samples.map((s) => s.delimiter)).size).toBe(3);
    expect(new Set(samples.map((s) => s.decimal)).size).toBe(2);
  });

  it("produces defects of every kind, preamble rows, byte order marks and a currency column", () => {
    const defects = new Set(samples.flatMap((s) => s.rows.map((r) => r.defect)));
    for (const kind of [
      "date",
      "description",
      "currency",
      "amount-garbage",
      "amount-both",
      "amount-neither",
      null,
    ]) {
      expect(defects.has(kind as never), `defect ${String(kind)}`).toBe(true);
    }
    expect(samples.some((s) => s.preamble.length > 0)).toBe(true);
    expect(samples.some((s) => s.bom)).toBe(true);
    expect(samples.some((s) => s.hasCurrencyColumn)).toBe(true);
    expect(samples.some((s) => s.rows.length === 0)).toBe(true);
    expect(samples.some((s) => s.rows.some((r) => r.cents === 0))).toBe(true);
    expect(samples.some((s) => s.rows.some((r) => r.ragged))).toBe(true);
  });

  it("produces extra columns that must be ignored", () => {
    expect(samples.some((s) => s.columns.some((c) => c.kind === "noise"))).toBe(true);
  });
});
