import { describe, expect, it } from "vitest";
import { tryParseAmount } from "./amount.js";
import { buildRows, type BuildRowsInput } from "./build-rows.js";
import type { DataRow, DecimalSeparator, ResolvedColumns } from "./internal-types.js";
import type { DateFormat, SignConvention } from "./types.js";

const SIGNED: ResolvedColumns = {
  layout: "signed-amount",
  date: 0,
  description: 1,
  amount: 2,
  currency: null,
};

const SIGNED_WITH_CURRENCY: ResolvedColumns = { ...SIGNED, currency: 3 };

const DEBIT_CREDIT: ResolvedColumns = {
  layout: "debit-credit",
  date: 0,
  description: 1,
  debit: 2,
  credit: 3,
  currency: null,
};

function rows(...cellRows: string[][]): DataRow[] {
  return cellRows.map((cells, index) => ({ ordinal: index + 1, cells }));
}

/** Builds the input the way the pipeline does: amount outcomes cached per column. */
function input(
  dataRows: DataRow[],
  columns: ResolvedColumns,
  overrides: Partial<BuildRowsInput> & {
    separator?: DecimalSeparator;
    dateFormat?: DateFormat | null;
    signConvention?: SignConvention | null;
  } = {},
): BuildRowsInput {
  const separator = overrides.separator ?? ".";
  const amountColumns =
    columns.layout === "signed-amount" ? [columns.amount] : [columns.debit, columns.credit];
  const amounts = new Map(
    amountColumns.map((column) => [
      column,
      dataRows.map((row) => tryParseAmount(row.cells[column] ?? "", separator)),
    ]),
  );
  return {
    dataRows,
    columns,
    dateFormat: overrides.dateFormat === undefined ? "yyyy-mm-dd" : overrides.dateFormat,
    amounts,
    signConvention:
      overrides.signConvention === undefined
        ? columns.layout === "signed-amount"
          ? "negative-out"
          : null
        : overrides.signConvention,
    currencyFallback: overrides.currencyFallback ?? "USD",
    delimiter: overrides.delimiter ?? ",",
  };
}

describe("buildRows: signed layout", () => {
  it("builds transactions with trimmed descriptions, ISO dates and the fallback currency", () => {
    const result = buildRows(
      input(
        rows(["2026-01-02", "  NETFLIX ", "-15.49"], ["2026-01-03", "PAYROLL", "1,250.00"]),
        SIGNED,
      ),
    );
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions).toEqual([
      { date: "2026-01-02", description: "NETFLIX", amountCents: 1549, currency: "USD" },
      { date: "2026-01-03", description: "PAYROLL", amountCents: -125_000, currency: "USD" },
    ]);
  });

  it("applies the sign convention: positive-out keeps signs, negative-out flips them", () => {
    const data = rows(["2026-01-02", "A", "10.00"], ["2026-01-03", "B", "-10.00"]);
    expect(
      buildRows(input(data, SIGNED, { signConvention: "positive-out" })).transactions.map(
        (t) => t.amountCents,
      ),
    ).toEqual([1000, -1000]);
    expect(
      buildRows(input(data, SIGNED, { signConvention: "negative-out" })).transactions.map(
        (t) => t.amountCents,
      ),
    ).toEqual([-1000, 1000]);
  });

  it("keeps a zero amount as a valid transaction under both conventions (Req 6.7)", () => {
    for (const signConvention of ["positive-out", "negative-out"] as const) {
      const result = buildRows(
        input(rows(["2026-01-02", "FEE WAIVED", "0.00"]), SIGNED, { signConvention }),
      );
      expect(result.rowErrors).toEqual([]);
      expect(Object.is(result.transactions[0]?.amountCents, 0)).toBe(true);
    }
  });

  it("reads amounts with the statement's decimal separator", () => {
    const result = buildRows(
      input(rows(["2026-01-02", "GEHALT", "1.234,56"]), SIGNED, {
        separator: ",",
        signConvention: "positive-out",
      }),
    );
    expect(result.transactions[0]?.amountCents).toBe(123_456);
  });

  it("reports an unparseable amount (Req 6.9, 6.10)", () => {
    const result = buildRows(
      input(
        rows(["2026-01-02", "A", "abc"], ["2026-01-03", "B", ""], ["2026-01-04", "C", "1.050"]),
        SIGNED,
      ),
    );
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors.map((e) => e.reason.startsWith("amount: "))).toEqual([
      true,
      true,
      true,
    ]);
    expect(result.rowErrors[2]?.reason).toContain("decimal");
  });

  it("needs a sign convention for the signed layout", () => {
    expect(() =>
      buildRows(input(rows(["2026-01-02", "A", "1.00"]), SIGNED, { signConvention: null })),
    ).toThrow();
  });
});

describe("buildRows: debit/credit layout", () => {
  it("combines the debit and credit cells (Req 7.1, 7.2)", () => {
    const result = buildRows(
      input(
        rows(
          ["2026-01-02", "TESCO", "38.64", ""],
          ["2026-01-03", "SALARY", "", "2,100.00"],
          ["2026-01-04", "NEGATIVE DEBIT", "-5.00", ""],
          ["2026-01-05", "NEGATIVE CREDIT", "", "-6.00"],
        ),
        DEBIT_CREDIT,
      ),
    );
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions.map((t) => t.amountCents)).toEqual([3864, -210_000, 500, -600]);
  });

  it("accepts a literal zero as a 0 transaction (Req 7.4)", () => {
    const result = buildRows(input(rows(["2026-01-02", "FEE", "0.00", ""]), DEBIT_CREDIT));
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions[0]?.amountCents).toBe(0);
  });

  it("reports rows with both cells populated, both empty, or an unparseable cell (Req 7.3-7.5)", () => {
    const result = buildRows(
      input(
        rows(
          ["2026-01-02", "BOTH", "1.00", "2.00"],
          ["2026-01-03", "NEITHER", "", ""],
          ["2026-01-04", "BAD DEBIT", "abc", ""],
          ["2026-01-05", "BAD CREDIT", "", "abc"],
        ),
        DEBIT_CREDIT,
      ),
    );
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors.map((e) => e.reason.split(": ")[0])).toEqual([
      "amount",
      "amount",
      "debit",
      "credit",
    ]);
  });

  it("does not need a sign convention", () => {
    expect(() =>
      buildRows(
        input(rows(["2026-01-02", "A", "1.00", ""]), DEBIT_CREDIT, { signConvention: null }),
      ),
    ).not.toThrow();
  });
});

describe("buildRows: one RowError per failing row (Req 8.1)", () => {
  it("names both fields when a row has a bad date and a bad amount", () => {
    const result = buildRows(input(rows(["31/02/2026", "ACME", "abc"]), SIGNED));
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors).toHaveLength(1);
    const reason = result.rowErrors[0]?.reason ?? "";
    expect(reason).toMatch(/^date: /);
    expect(reason).toContain("; amount: ");
  });

  it("joins the failures in the order date, description, amount, currency", () => {
    const result = buildRows(input(rows(["nope", " ", "abc", "EURO"]), SIGNED_WITH_CURRENCY));
    const fields = (result.rowErrors[0]?.reason ?? "")
      .split("; ")
      .map((part) => part.split(":")[0]);
    expect(fields).toEqual(["date", "description", "amount", "currency"]);
  });

  it("uses the data-row ordinal as rowIndex, not the position in the list", () => {
    const data: DataRow[] = [
      { ordinal: 1, cells: ["2026-01-02", "A", "1.00"] },
      { ordinal: 4, cells: ["bad", "B", "2.00"] },
      { ordinal: 7, cells: ["2026-01-05", "C", "bad"] },
    ];
    const result = buildRows(input(data, SIGNED));
    expect(result.transactions).toHaveLength(1);
    expect(result.rowErrors.map((e) => e.rowIndex)).toEqual([4, 7]);
  });

  it("builds rawRow from the row's cells with the detected delimiter", () => {
    const result = buildRows(input(rows(["bad", "ACME; INC", "1.00"]), SIGNED, { delimiter: ";" }));
    expect(result.rowErrors[0]?.rawRow).toBe('bad;"ACME; INC";1.00');
  });

  it("keeps input order, interleaving transactions and errors correctly", () => {
    const data = rows(
      ["2026-01-02", "A", "1.00"],
      ["bad", "B", "2.00"],
      ["2026-01-04", "C", "3.00"],
    );
    const result = buildRows(input(data, SIGNED, { signConvention: "positive-out" }));
    expect(result.transactions.map((t) => t.description)).toEqual(["A", "C"]);
    expect(result.rowErrors.map((e) => e.rowIndex)).toEqual([2]);
    expect(result.transactions.length + result.rowErrors.length).toBe(data.length);
  });

  it("returns empty arrays for no rows", () => {
    expect(buildRows(input([], SIGNED))).toEqual({ transactions: [], rowErrors: [] });
  });
});

describe("buildRows: ragged and short rows", () => {
  it("treats missing trailing cells as empty", () => {
    const result = buildRows(input(rows(["2026-01-02", "ACME"]), SIGNED));
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0]?.reason).toMatch(/^amount: /);
  });

  it("reports every missing cell of a very short row", () => {
    const result = buildRows(input(rows(["2026-01-02"]), SIGNED));
    const fields = (result.rowErrors[0]?.reason ?? "")
      .split("; ")
      .map((part) => part.split(":")[0]);
    expect(fields).toEqual(["description", "amount"]);
  });

  it("ignores extra cells beyond the mapped columns", () => {
    const result = buildRows(
      input(rows(["2026-01-02", "ACME", "-5.00", "extra", "more extra"]), SIGNED),
    );
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions).toHaveLength(1);
  });

  it("falls back to the statement currency when the currency cell is missing from a short row", () => {
    const result = buildRows(
      input(rows(["2026-01-02", "ACME", "-5.00"]), SIGNED_WITH_CURRENCY, {
        currencyFallback: "GBP",
      }),
    );
    expect(result.transactions[0]?.currency).toBe("GBP");
  });
});

describe("buildRows: description (Req 8.1)", () => {
  it("gives a row error for an empty description", () => {
    const result = buildRows(input(rows(["2026-01-02", "", "-5.00"]), SIGNED));
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors[0]?.reason).toBe("description: missing required cell");
  });

  it("gives a row error for a whitespace-only description", () => {
    const result = buildRows(input(rows(["2026-01-02", " \t\u00a0 ", "-5.00"]), SIGNED));
    expect(result.rowErrors[0]?.reason).toMatch(/^description: /);
  });

  it("keeps the inner spacing of a description", () => {
    const result = buildRows(input(rows(["2026-01-02", "  A  B  ", "-5.00"]), SIGNED));
    expect(result.transactions[0]?.description).toBe("A  B");
  });
});

describe("buildRows: no date format detected (Req 3.9)", () => {
  it("gives every row the same date reason and still checks the other fields", () => {
    const data = rows(
      ["2026-01-02", "OK", "-5.00"],
      ["whatever", "", "abc"],
      ["", "FINE", "-1.00"],
    );
    const result = buildRows(input(data, SIGNED, { dateFormat: null }));
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors).toHaveLength(3);
    for (const error of result.rowErrors) {
      expect(error.reason).toMatch(/^date: no recognisable date format/);
    }
    expect(result.rowErrors[0]?.reason).toBe("date: no recognisable date format in the statement");
    expect(result.rowErrors[1]?.reason).toContain("description: missing required cell");
    expect(result.rowErrors[1]?.reason).toContain("amount: ");
  });
});

describe("buildRows: dates (Req 3.8)", () => {
  it("parses every row's date with the single detected format", () => {
    const result = buildRows(
      input(rows(["1/5/2026", "A", "-1.00"], ["13/5/26", "B", "-2.00"]), SIGNED, {
        dateFormat: "dd/mm/yyyy",
      }),
    );
    expect(result.transactions.map((t) => t.date)).toEqual(["2026-05-01", "2026-05-13"]);
  });

  it("reports a date that does not fit the format and keeps going", () => {
    const result = buildRows(
      input(
        rows(
          ["2026-01-02", "A", "-1.00"],
          ["02/01/2026", "B", "-2.00"],
          ["2026-01-04", "C", "-3.00"],
        ),
        SIGNED,
      ),
    );
    expect(result.transactions.map((t) => t.description)).toEqual(["A", "C"]);
    expect(result.rowErrors.map((e) => e.rowIndex)).toEqual([2]);
    expect(result.rowErrors[0]?.reason).toContain("yyyy-mm-dd");
  });
});

describe("buildRows: currency (Req 10.4-10.6)", () => {
  it("lets a valid per-row currency override the fallback, upper-cased", () => {
    const result = buildRows(
      input(
        rows(
          ["2026-01-02", "A", "-1.00", "eur"],
          ["2026-01-03", "B", "-2.00", " GBP "],
          ["2026-01-04", "C", "-3.00", ""],
        ),
        SIGNED_WITH_CURRENCY,
        { currencyFallback: "USD" },
      ),
    );
    expect(result.transactions.map((t) => t.currency)).toEqual(["EUR", "GBP", "USD"]);
  });

  it("uses the fallback for every row when the statement has no currency column", () => {
    const result = buildRows(
      input(rows(["2026-01-02", "A", "-1.00"]), SIGNED, { currencyFallback: "CAD" }),
    );
    expect(result.transactions[0]?.currency).toBe("CAD");
  });

  it("reports an invalid per-row currency and produces no transaction for the row", () => {
    const result = buildRows(
      input(rows(["2026-01-02", "A", "-1.00", "EURO"]), SIGNED_WITH_CURRENCY),
    );
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors[0]?.reason).toMatch(/^currency: /);
    expect(result.rowErrors[0]?.reason).toContain("EURO");
  });
});

describe("buildRows: inputs it refuses", () => {
  it("throws when the amount outcomes do not line up with the rows", () => {
    const data = rows(["2026-01-02", "A", "-1.00"]);
    const good = input(data, SIGNED);
    expect(() => buildRows({ ...good, amounts: new Map([[2, []]]) })).toThrow();
    expect(() => buildRows({ ...good, amounts: new Map() })).toThrow();
  });
});
