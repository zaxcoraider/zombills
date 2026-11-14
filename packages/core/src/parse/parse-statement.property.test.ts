import fc from "fast-check";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { isBlankRow } from "./blank-row.js";
import { detectHeaderRow } from "./header-detect.js";
import { parseStatement } from "./parse-statement.js";
import {
  currencyCodeArbitrary,
  expectedFromModel,
  parseOptionsOf,
  renderStatement,
  statementCurrencyOf,
  statementModelArbitrary,
  withBlankRows,
  withBom,
  withDelimiter,
  statementMatrix,
  type BlankKind,
  type ModelDelimiter,
  type StatementModel,
} from "./test-arbitraries.js";
import { stripBom, tokenize } from "./tokenize.js";
import type { ColumnMap, MappedResult, ParseOptions, ParseResult } from "./types.js";

// ---------------------------------------------------------------------------
// Generators for arbitrary input
// ---------------------------------------------------------------------------

const MUTATION_CHARACTERS = [
  '"',
  ",",
  ";",
  "\t",
  "\n",
  "\r",
  "(",
  ")",
  "-",
  "$",
  "0",
  "9",
  " ",
  "a",
  "\u00a0",
  "\uFEFF",
  ".",
  "/",
];

interface Mutation {
  kind: "delete" | "insert" | "replace" | "truncate";
  at: number;
  character: string;
}

const mutationsArbitrary: fc.Arbitrary<Mutation[]> = fc.array(
  fc.record({
    kind: fc.constantFrom<Mutation["kind"]>("delete", "insert", "replace", "truncate"),
    at: fc.nat(),
    character: fc.constantFrom(...MUTATION_CHARACTERS),
  }),
  { maxLength: 4 },
);

function mutate(text: string, mutations: readonly Mutation[]): string {
  let result = text;
  for (const { kind, at, character } of mutations) {
    const index = result.length === 0 ? 0 : at % (result.length + 1);
    switch (kind) {
      case "delete":
        result = result.slice(0, index) + result.slice(index + 1);
        break;
      case "insert":
        result = result.slice(0, index) + character + result.slice(index);
        break;
      case "replace":
        result = result.slice(0, index) + character + result.slice(index + 1);
        break;
      case "truncate":
        result = result.slice(0, index);
        break;
    }
  }
  return result;
}

/** Rendered statements with a few random character-level edits, which keep most of their structure. */
const mutatedStatement: fc.Arbitrary<string> = fc
  .tuple(statementModelArbitrary(), mutationsArbitrary)
  .map(([model, mutations]) => mutate(renderStatement(model), mutations));

const COLUMN_NAMES = ["Date", "Description", "Amount", "Debit", "Credit", "Currency", "x", ""];

const columnMapArbitrary: fc.Arbitrary<ColumnMap> = fc
  .array(
    fc.tuple(
      fc.constantFrom<keyof ColumnMap>(
        "date",
        "description",
        "amount",
        "debit",
        "credit",
        "currency",
      ),
      fc.constantFrom(...COLUMN_NAMES),
    ),
    { maxLength: 6 },
  )
  .map((entries) => {
    const map: ColumnMap = {};
    for (const [role, name] of entries) {
      map[role] = name;
    }
    return map;
  });

/** Any text, from near-valid statements to noise. */
const anyText: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: mutatedStatement },
  { weight: 1, arbitrary: fc.string({ maxLength: 120 }) },
  {
    weight: 1,
    arbitrary: fc.string({
      unit: fc.constantFrom(...'Date,Amount;\t\n\r"0123456789.-() $/'),
      maxLength: 160,
    }),
  },
  { weight: 1, arbitrary: fc.string({ unit: "binary", maxLength: 60 }) },
);

/** Any options a caller might pass, including invalid currency strings and column maps. */
const anyOptions: fc.Arbitrary<ParseOptions | undefined> = fc.oneof(
  fc.constant(undefined),
  fc
    .tuple(
      fc.option(fc.oneof(currencyCodeArbitrary, fc.string({ maxLength: 6 })), { nil: undefined }),
      fc.option(fc.constantFrom<"positive-out" | "negative-out">("positive-out", "negative-out"), {
        nil: undefined,
      }),
      fc.option(columnMapArbitrary, { nil: undefined }),
    )
    .map(([currency, signConvention, columnMap]) => {
      const options: ParseOptions = {};
      if (currency !== undefined) {
        options.currency = currency;
      }
      if (signConvention !== undefined) {
        options.signConvention = signConvention;
      }
      if (columnMap !== undefined) {
        options.columnMap = columnMap;
      }
      return options;
    }),
);

// ---------------------------------------------------------------------------
// Oracles
// ---------------------------------------------------------------------------

function mapped(result: ParseResult): MappedResult {
  if (result.status !== "mapped") {
    throw new Error(`Expected a mapped result but got ${JSON.stringify(result).slice(0, 300)}`);
  }
  return result;
}

/**
 * N for an arbitrary text, from the glossary: the non-blank rows after the header row. Uses the
 * tokenizer and header detection, which have their own tests, so the count is not the parser's.
 */
function dataRowCountOf(text: string, options: ParseOptions | undefined): number | null {
  const { rows } = tokenize(stripBom(text));
  let headerIndex = detectHeaderRow(rows);
  if (headerIndex === null && options?.columnMap !== undefined) {
    const first = rows.findIndex((row) => !isBlankRow(row));
    headerIndex = first >= 0 ? first : null;
  }
  if (headerIndex === null) {
    return null;
  }
  return rows.slice(headerIndex + 1).filter((row) => !isBlankRow(row)).length;
}

function ordinals(result: MappedResult): number[] {
  return result.rowErrors.map((error) => error.rowIndex);
}

describe("parseStatement properties: row counts (P1)", () => {
  it("P1: transactions + rowErrors = N, and the rows are the ones the model says (Req 8.5, 13.1)", () => {
    fc.assert(
      fc.property(statementModelArbitrary(), (model) => {
        const result = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
        const expected = expectedFromModel(model);
        expect(result.transactions.length + result.rowErrors.length).toBe(expected.dataRowCount);
        expect(result.transactions).toEqual(expected.transactions);
        expect(ordinals(result)).toEqual(expected.rowErrorOrdinals);
        expect(result.detectedCurrency).toEqual(statementCurrencyOf(model));
      }),
      { numRuns: 400 },
    );
  });

  it("P1: transactions + rowErrors = N for any text that is not rejected (Req 13.1)", () => {
    fc.assert(
      fc.property(anyText, anyOptions, (text, options) => {
        const result = parseStatement(text, options);
        if (result.status !== "mapped") {
          return;
        }
        const count = dataRowCountOf(text, options);
        expect(count).not.toBeNull();
        expect(result.transactions.length + result.rowErrors.length).toBe(count);
      }),
      { numRuns: 500 },
    );
  });

  it("P1: row errors are numbered 1..N in increasing order, without repeats", () => {
    fc.assert(
      fc.property(anyText, anyOptions, (text, options) => {
        const result = parseStatement(text, options);
        if (result.status !== "mapped") {
          return;
        }
        const numbers = ordinals(result);
        expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
        expect(new Set(numbers).size).toBe(numbers.length);
        const total = result.transactions.length + result.rowErrors.length;
        for (const number of numbers) {
          expect(number).toBeGreaterThanOrEqual(1);
          expect(number).toBeLessThanOrEqual(total);
        }
      }),
    );
  });
});

describe("parseStatement properties: dates settled by a late row (Req 3.1)", () => {
  it("P1: a dd/mm or mm/dd statement whose only day above 12 is the last row, after ten or more ambiguous rows, is read correctly", () => {
    fc.assert(
      fc.property(
        fc
          .constantFrom<"dd/mm/yyyy" | "mm/dd/yyyy">("dd/mm/yyyy", "mm/dd/yyyy")
          .chain((dateFormat) =>
            statementModelArbitrary({
              dateFormat,
              minRows: 11,
              maxRows: 25,
              deciderAtEnd: true,
              defects: false,
            }),
          ),
        (model) => {
          const result = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
          expect(result.detectedDateFormat).toEqual({ format: model.dateFormat, assumed: false });
          expect(result.transactions).toEqual(expectedFromModel(model).transactions);
          expect(result.rowErrors).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("parseStatement properties: amounts (P6)", () => {
  it("P6: debits are positive, credits are negative, zeros are 0, and every amount is an integer (Req 13.6)", () => {
    fc.assert(
      fc.property(statementModelArbitrary(), (model) => {
        const result = mapped(parseStatement(renderStatement(model), parseOptionsOf(model)));
        const sound = model.rows.filter((row) => row.defect === null);
        expect(result.transactions).toHaveLength(sound.length);
        result.transactions.forEach((transaction, index) => {
          const row = sound[index];
          expect(Number.isInteger(transaction.amountCents)).toBe(true);
          if (row === undefined || row.cents === 0) {
            expect(Object.is(transaction.amountCents, 0)).toBe(true);
          } else if (row.direction === "out") {
            expect(transaction.amountCents).toBe(row.cents);
          } else {
            expect(transaction.amountCents).toBe(-row.cents);
          }
        });
      }),
      { numRuns: 400 },
    );
  });

  it("P6: every amount in any mapped result is a safe integer that is not -0", () => {
    fc.assert(
      fc.property(anyText, anyOptions, (text, options) => {
        const result = parseStatement(text, options);
        if (result.status !== "mapped") {
          return;
        }
        for (const { amountCents } of result.transactions) {
          expect(Number.isSafeInteger(amountCents)).toBe(true);
          expect(Object.is(amountCents, -0)).toBe(false);
          expect(Math.abs(amountCents)).toBeLessThanOrEqual(9_999_999_900);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe("parseStatement properties: determinism (P7) and robustness (P9)", () => {
  it("P7: two calls with equal arguments give deeply equal results (Req 13.7, 1.7)", () => {
    fc.assert(
      fc.property(anyText, anyOptions, (text, options) => {
        const first = parseStatement(text, options);
        const second = parseStatement(text, options);
        expect(second).toStrictEqual(first);
      }),
      { numRuns: 500 },
    );
  });

  it("P7: the same holds for model statements, which reach every part of the pipeline", () => {
    fc.assert(
      fc.property(statementModelArbitrary(), (model) => {
        const text = renderStatement(model);
        const options = parseOptionsOf(model);
        expect(parseStatement(text, options)).toStrictEqual(parseStatement(text, options));
      }),
      { numRuns: 300 },
    );
  });

  it("P7: the result does not depend on earlier calls", () => {
    fc.assert(
      fc.property(anyText, anyText, anyOptions, (text, other, options) => {
        const before = parseStatement(text, options);
        parseStatement(other, options);
        expect(parseStatement(text, options)).toStrictEqual(before);
      }),
    );
  });

  it("P9: parseStatement never throws for a string and well-typed options (Req 8.2)", () => {
    fc.assert(
      fc.property(anyText, anyOptions, (text, options) => {
        const result = parseStatement(text, options);
        expect(["mapped", "mapping-required", "error"]).toContain(result.status);
      }),
      { numRuns: 1000 },
    );
  });

  it("P9: nor for text made only of delimiters, quotes and line breaks", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'",;\t\n\r '), maxLength: 80 }),
        anyOptions,
        (text, options) => {
          expect(() => parseStatement(text, options)).not.toThrow();
        },
      ),
      { numRuns: 500 },
    );
  });

  it("P9: nor for very long input", () => {
    expect(() => parseStatement("a,".repeat(50_000))).not.toThrow();
    expect(() =>
      parseStatement(`Date,Description,Amount\n${"2026-01-02,x,1.00\n".repeat(20_000)}`),
    ).not.toThrow();
    expect(() => parseStatement(`"${"x".repeat(200_000)}`)).not.toThrow();
  });

  it("P9: mapping-required and error results keep their documented shape", () => {
    fc.assert(
      fc.property(anyText, anyOptions, (text, options) => {
        const result = parseStatement(text, options);
        if (result.status === "mapping-required") {
          expect(Array.isArray(result.columns)).toBe(true);
          expect(result.rowErrors).toEqual([]);
        } else if (result.status === "error") {
          expect(typeof result.reason).toBe("string");
          expect(result.reason.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 500 },
    );
  });
});

/** Blank rows to put before each of 15 possible positions. */
const blankRowKinds: fc.Arbitrary<BlankKind[][]> = fc.array(
  fc.array(fc.constantFrom<BlankKind>("empty", "delimiters", "spaces"), { maxLength: 3 }),
  { minLength: 15, maxLength: 15 },
);

function withBlanksFrom(model: StatementModel, kinds: BlankKind[][]): StatementModel {
  return withBlankRows(
    model,
    model.blanksBefore.map((_, index) => kinds[index] ?? []),
  );
}

describe("parseStatement properties: blank rows (P15)", () => {
  it("P15: fully blank rows anywhere after the header change nothing (Req 8.5, 13.1, glossary Data row)", () => {
    fc.assert(
      fc.property(statementModelArbitrary(), blankRowKinds, (model, kinds) => {
        const options = parseOptionsOf(model);
        const plain = parseStatement(renderStatement(model), options);
        const withBlanks = parseStatement(renderStatement(withBlanksFrom(model, kinds)), options);
        expect(withBlanks).toStrictEqual(plain);
      }),
      { numRuns: 400 },
    );
  });

  it("P15: blank rows are not counted, so rowIndex stays the data-row ordinal", () => {
    fc.assert(
      fc.property(statementModelArbitrary(), blankRowKinds, (model, kinds) => {
        const result = mapped(
          parseStatement(renderStatement(withBlanksFrom(model, kinds)), parseOptionsOf(model)),
        );
        expect(ordinals(result)).toEqual(expectedFromModel(model).rowErrorOrdinals);
        expect(result.transactions.length + result.rowErrors.length).toBe(model.rows.length);
      }),
    );
  });
});

describe("parseStatement properties: delimiter and byte order mark (P16)", () => {
  /** The parts of a result that do not depend on the delimiter: rawRow is written with it. */
  function withoutRawRow(result: ParseResult): unknown {
    if (result.status !== "mapped") {
      return result;
    }
    return {
      ...result,
      rowErrors: result.rowErrors.map(({ rowIndex, reason }) => ({ rowIndex, reason })),
    };
  }

  const portableModel = statementModelArbitrary({ delimiterInText: false, noTabs: true });

  it("P16: the same statement gives the same transactions with , ; or tab, with or without a byte order mark (Req 1.6)", () => {
    fc.assert(
      fc.property(portableModel, (model) => {
        const options = parseOptionsOf(model);
        const reference = withoutRawRow(
          parseStatement(renderStatement(withBom(withDelimiter(model, ","), false)), options),
        );
        for (const delimiter of [",", ";", "\t"] as const) {
          for (const bom of [false, true]) {
            const text = renderStatement(withBom(withDelimiter(model, delimiter), bom));
            expect(
              withoutRawRow(parseStatement(text, options)),
              `${JSON.stringify(delimiter)} bom=${bom}`,
            ).toStrictEqual(reference);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("P16: and those transactions are the ones the model says", () => {
    fc.assert(
      fc.property(
        portableModel,
        fc.constantFrom<ModelDelimiter>(",", ";", "\t"),
        fc.boolean(),
        (model, delimiter, bom) => {
          const text = renderStatement(withBom(withDelimiter(model, delimiter), bom));
          const result = mapped(parseStatement(text, parseOptionsOf(model)));
          expect(result.transactions).toEqual(expectedFromModel(model).transactions);
        },
      ),
    );
  });

  it("P16: rawRow of a row error splits back into the cells of the row it came from", () => {
    fc.assert(
      fc.property(
        portableModel,
        fc.constantFrom<ModelDelimiter>(",", ";", "\t"),
        (model, delimiter) => {
          const delimited = withDelimiter(model, delimiter);
          const result = mapped(parseStatement(renderStatement(delimited), parseOptionsOf(model)));
          // The intended data rows are the non-blank rows after the header row.
          const matrix = statementMatrix(delimited);
          const dataRows = matrix
            .slice(delimited.preamble.length + 1)
            .filter((row) => !isBlankRow(row));
          for (const error of result.rowErrors) {
            const intended = dataRows[error.rowIndex - 1] ?? [];
            // Split with the file's own delimiter: a single row gives no basis for guessing it.
            expect(Papa.parse<string[]>(error.rawRow, { delimiter }).data).toEqual([intended]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("parseStatement properties: concurrency of options", () => {
  it("the currency option only affects rows without a currency of their own (Req 10.1, 10.4, 10.5)", () => {
    fc.assert(
      fc.property(
        statementModelArbitrary({ defects: false }),
        currencyCodeArbitrary,
        (model, code) => {
          const result = mapped(
            parseStatement(renderStatement(model), { ...parseOptionsOf(model), currency: code }),
          );
          const expected = expectedFromModel({ ...model, optionCurrency: code });
          expect(result.transactions).toEqual(expected.transactions);
        },
      ),
    );
  });
});
