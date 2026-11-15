import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as root from "../index.js";
import { EMPTY_CSV_REASON, NO_CONTENT_ROWS_REASON, parseStatement } from "./index.js";
import type { MappedResult, MappingRequiredResult, ParseResult } from "./types.js";

const US_SIGNED = [
  "Date,Description,Amount",
  "01/02/2026,NETFLIX.COM,-15.49",
  '01/15/2026,PAYROLL ACME,"1,250.00"',
  "02/02/2026,NETFLIX.COM,-15.49",
].join("\n");

function mapped(result: ParseResult): MappedResult {
  if (result.status !== "mapped") {
    throw new Error(`Expected a mapped result but got ${JSON.stringify(result)}`);
  }
  return result;
}

function mappingRequired(result: ParseResult): MappingRequiredResult {
  if (result.status !== "mapping-required") {
    throw new Error(`Expected mapping-required but got ${JSON.stringify(result)}`);
  }
  return result;
}

describe("parseStatement: a clean statement", () => {
  it("maps a signed statement into transactions with no row errors", () => {
    const result = mapped(parseStatement(US_SIGNED));
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions).toEqual([
      { date: "2026-01-02", description: "NETFLIX.COM", amountCents: 1549, currency: "USD" },
      { date: "2026-01-15", description: "PAYROLL ACME", amountCents: -125_000, currency: "USD" },
      { date: "2026-02-02", description: "NETFLIX.COM", amountCents: 1549, currency: "USD" },
    ]);
    expect(result.detectedDateFormat).toEqual({ format: "mm/dd/yyyy", assumed: false });
    expect(result.detectedSignConvention).toEqual({ convention: "negative-out", assumed: false });
  });

  it("accepts the options argument being left out, undefined or empty", () => {
    const expected = parseStatement(US_SIGNED, {});
    expect(parseStatement(US_SIGNED)).toEqual(expected);
    expect(parseStatement(US_SIGNED, undefined)).toEqual(expected);
  });

  it("reads LF, CRLF and a trailing newline the same way", () => {
    const expected = parseStatement(US_SIGNED);
    expect(parseStatement(US_SIGNED.replaceAll("\n", "\r\n") + "\r\n")).toEqual(expected);
    expect(parseStatement(`${US_SIGNED}\n`)).toEqual(expected);
  });
});

describe("parseStatement: the only throw (Req 8.2)", () => {
  it.each([undefined, null, 42, {}, [], ["a,b"], true, Symbol("csv")])(
    "throws a TypeError when csv is %s",
    (value) => {
      expect(() => parseStatement(value as unknown as string)).toThrow(TypeError);
    },
  );
});

describe("parseStatement: empty input (Req 1.4)", () => {
  it.each([
    ["an empty string", ""],
    ["spaces", "   "],
    ["whitespace and newlines", "   \n \r\n\t "],
    ["only a byte order mark", "\uFEFF"],
    ["a byte order mark and whitespace", "\uFEFF  \n"],
  ])("returns an error for %s", (_name, csv) => {
    const result = parseStatement(csv);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.reason).toMatch(/empty/i);
    }
  });
});

describe("parseStatement: empty-input reasons (vertical-slice Req 11.4)", () => {
  it("returns EMPTY_CSV_REASON for an empty string", () => {
    const result = parseStatement("");
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.reason).toBe(EMPTY_CSV_REASON);
    }
  });

  it("returns NO_CONTENT_ROWS_REASON when every row is blank", () => {
    const result = parseStatement("\n,\n");
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.reason).toBe(NO_CONTENT_ROWS_REASON);
    }
  });
});

describe("package root exports (vertical-slice Req 11.5)", () => {
  it("exports the empty-input constants, the header lists and normalizeHeader", () => {
    expect(root.EMPTY_CSV_REASON).toBeDefined();
    expect(root.NO_CONTENT_ROWS_REASON).toBeDefined();
    expect(root.AMOUNT_HEADERS).toBeDefined();
    expect(root.CREDIT_HEADERS).toBeDefined();
    expect(root.DATE_HEADERS).toBeDefined();
    expect(root.DEBIT_HEADERS).toBeDefined();
    expect(root.DESCRIPTION_HEADERS).toBeDefined();
    expect(root.normalizeHeader).toBeDefined();
    expect(root.DATE_HEADERS).toContain("posting date");
  });
});

describe("parseStatement: options (Req 10.1-10.3)", () => {
  it("uses USD when no currency is given", () => {
    const result = mapped(parseStatement(US_SIGNED));
    expect(new Set(result.transactions.map((t) => t.currency))).toEqual(new Set(["USD"]));
  });

  it("normalises options.currency to upper case, so 'usd' gives 'USD' on every transaction", () => {
    const result = mapped(parseStatement(US_SIGNED, { currency: "usd" }));
    expect(result.transactions.length).toBeGreaterThan(0);
    expect(result.transactions.every((t) => t.currency === "USD")).toBe(true);
    expect(mapped(parseStatement(US_SIGNED, { currency: "gBp" })).transactions[0]?.currency).toBe(
      "GBP",
    );
  });

  it.each(["US", "EURO", "", "U$D", " USD", "123"])(
    "returns an error for options.currency %j",
    (currency) => {
      const result = parseStatement(US_SIGNED, { currency });
      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.reason).toMatch(/currency/i);
      }
    },
  );

  it("does not process any rows when the currency is invalid", () => {
    expect(parseStatement("not,a,statement\n1,2,3", { currency: "US" }).status).toBe("error");
  });

  it("returns an error for an invalid signConvention option", () => {
    const result = parseStatement(US_SIGNED, { signConvention: "sideways" as never });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.reason).toMatch(/signConvention/);
    }
  });

  it("checks the options before the CSV contents", () => {
    expect(parseStatement("", { currency: "US" })).toEqual(parseStatement("", {}));
  });
});

describe("parseStatement: sign convention (Req 6.1, 6.2, 6.8)", () => {
  it("overrides auto-detection with options.signConvention and reports it as not assumed", () => {
    const result = mapped(parseStatement(US_SIGNED, { signConvention: "positive-out" }));
    expect(result.detectedSignConvention).toEqual({ convention: "positive-out", assumed: false });
    expect(result.transactions.map((t) => t.amountCents)).toEqual([-1549, 125_000, -1549]);
  });

  it("assumes positive-out and says so on a tie", () => {
    const csv = ["Date,Description,Amount", "2026-01-02,A,5.00", "2026-01-03,B,-5.00"].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedSignConvention).toEqual({ convention: "positive-out", assumed: true });
  });

  it("assumes positive-out when every amount is zero", () => {
    const csv = ["Date,Description,Amount", "2026-01-02,A,0.00", "2026-01-03,B,0.00"].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedSignConvention).toEqual({ convention: "positive-out", assumed: true });
    expect(result.transactions.map((t) => t.amountCents)).toEqual([0, 0]);
  });

  it("counts rows that fail for other reasons when detecting the convention", () => {
    // Two negative amounts on rows with a bad date still count as evidence for negative-out.
    const csv = ["Date,Description,Amount", "2026-01-02,A,5.00", "bad,B,-5.00", "bad,C,-6.00"].join(
      "\n",
    );
    expect(mapped(parseStatement(csv)).detectedSignConvention?.convention).toBe("negative-out");
  });

  it("returns a null sign convention for a debit/credit statement, ignoring options.signConvention", () => {
    const csv = [
      "Date,Details,Debit,Credit",
      "2026-01-02,TESCO,38.64,",
      "2026-01-03,SALARY,,2100.00",
    ].join("\n");
    for (const options of [{}, { signConvention: "negative-out" as const }]) {
      const result = mapped(parseStatement(csv, options));
      expect(result.detectedSignConvention).toBeNull();
      expect(result.transactions.map((t) => t.amountCents)).toEqual([3864, -210_000]);
    }
  });
});

describe("parseStatement: mapping required (Req 1.5, 2.7, 9.1)", () => {
  it("asks for a mapping when the headers are not recognised, listing every header", () => {
    const csv = ["Booked,Text,Sum", "2026-01-02,ACME,-5.00"].join("\n");
    // "Booked", "Text" and "Sum" are not on the recognition lists, and no row contains a known name.
    const result = mappingRequired(parseStatement(csv));
    expect(result.columns).toEqual(["Booked", "Text", "Sum"]);
    expect(result.rowErrors).toEqual([]);
    expect(result.validationErrors).toBeUndefined();
  });

  it("asks for a mapping when a recognised header leaves a required column unresolved", () => {
    const csv = ["Date,Reference,Balance", "2026-01-02,X,100.00"].join("\n");
    const result = mappingRequired(parseStatement(csv));
    expect(result.columns).toEqual(["Date", "Reference", "Balance"]);
  });

  it("keeps blank and duplicate header cells, in order, untrimmed", () => {
    const csv = ["Date, Ref ,,Ref,Ref", "2026-01-02,a,b,c,d"].join("\n");
    const result = mappingRequired(parseStatement(csv));
    expect(result.columns).toEqual(["Date", " Ref ", "", "Ref", "Ref"]);
  });

  it("never reads data rows before mapping is resolved", () => {
    const csv = ["Date,Reference", "garbage,garbage", "more,garbage"].join("\n");
    expect(mappingRequired(parseStatement(csv)).rowErrors).toEqual([]);
  });
});

describe("parseStatement: column map (Req 2.8, 2.9, 9.2-9.5)", () => {
  const csv = ["Booked,Text,Sum,Out,In", "01/02/2026,ACME,-5.00,,", "01/15/2026,BETA,-6.00,,"].join(
    "\n",
  );

  it("returns mapping-required with validation errors for a map naming a missing column (Req 2.9, 9.4)", () => {
    const result = mappingRequired(
      parseStatement(csv, { columnMap: { date: "Booked", description: "Memo", amount: "Sum" } }),
    );
    expect(result.columns).toEqual(["Booked", "Text", "Sum", "Out", "In"]);
    expect(result.validationErrors).toEqual([
      { role: "description", column: "Memo", problem: "unknown-column" },
    ]);
  });

  it("returns mapping-required for a map that leaves out a required role", () => {
    const result = mappingRequired(parseStatement(csv, { columnMap: { date: "Booked" } }));
    expect(result.validationErrors?.map((e) => [e.role, e.problem])).toEqual([
      ["description", "missing-mapping"],
      ["amount", "missing-mapping"],
    ]);
  });

  it("never returns status error for a bad column map", () => {
    expect(parseStatement(csv, { columnMap: {} }).status).toBe("mapping-required");
  });

  it("maps the same CSV once the map is corrected (Req 9.2)", () => {
    const bad = parseStatement(csv, {
      columnMap: { date: "Booked", description: "Memo", amount: "Sum" },
    });
    expect(bad.status).toBe("mapping-required");
    const good = mapped(
      parseStatement(csv, { columnMap: { date: "Booked", description: "Text", amount: "Sum" } }),
    );
    expect(good.rowErrors).toEqual([]);
    expect(good.transactions.map((t) => t.description)).toEqual(["ACME", "BETA"]);
  });

  it("maps a debit/credit layout from the map", () => {
    const dc = ["Booked,Text,Out,In", "2026-01-02,ACME,5.00,", "2026-01-03,PAY,,9.00"].join("\n");
    const result = mapped(
      parseStatement(dc, {
        columnMap: { date: "Booked", description: "Text", debit: "Out", credit: "In" },
      }),
    );
    expect(result.transactions.map((t) => t.amountCents)).toEqual([500, -900]);
    expect(result.detectedSignConvention).toBeNull();
  });

  it("uses the map in place of auto-detection", () => {
    const swapped = ["Date,Description,Amount", "2026-01-02,5.00,ACME"].join("\n");
    const result = mapped(
      parseStatement(swapped, {
        columnMap: { date: "Date", description: "Amount", amount: "Description" },
      }),
    );
    expect(result.rowErrors).toEqual([]);
    // "Amount" is the description column here, and "Description" holds the amount.
    expect(result.transactions[0]).toMatchObject({ description: "ACME", amountCents: 500 });
  });

  it("is a pure function of its arguments: a rejected map changes nothing for the next call (Req 9.5)", () => {
    const first = parseStatement(csv, { columnMap: { date: "Nope" } });
    const second = parseStatement(csv, { columnMap: { date: "Nope" } });
    expect(first).toEqual(second);
    expect(
      parseStatement(csv, { columnMap: { date: "Booked", description: "Text", amount: "Sum" } })
        .status,
    ).toBe("mapped");
  });
});

describe("parseStatement: header row and preamble (Req 11)", () => {
  it("ignores preamble rows and does not count them as data", () => {
    const csv = [
      "Account Name,SAMPLE",
      "Statement Period,2026-01-01 to 2026-03-31",
      "Date,Description,Amount",
      "2026-01-03,A,-5.00",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.transactions).toHaveLength(1);
    expect(result.rowErrors).toEqual([]);
  });

  it("returns mapping-required with the first row's cells when no header is recognised (Req 11.3)", () => {
    const csv = ["Booked,Text,Sum", "2026-01-02,ACME,-5.00"].join("\n");
    expect(mappingRequired(parseStatement(csv)).columns).toEqual(["Booked", "Text", "Sum"]);
  });

  it("skips leading blank rows when it takes the first non-blank row", () => {
    const csv = ["", "  ", "Booked,Text,Sum", "2026-01-02,ACME,-5.00"].join("\n");
    expect(mappingRequired(parseStatement(csv)).columns).toEqual(["Booked", "Text", "Sum"]);
  });

  it("treats the first non-blank row as the header when a column map is given and none is recognised", () => {
    const csv = ["", "Booked,Text,Sum", "2026-01-02,ACME,-5.00", "2026-01-03,BETA,-6.00"].join(
      "\n",
    );
    const result = mapped(
      parseStatement(csv, { columnMap: { date: "Booked", description: "Text", amount: "Sum" } }),
    );
    expect(result.transactions.map((t) => t.description)).toEqual(["ACME", "BETA"]);
    expect(result.rowErrors).toEqual([]);
  });

  it("finds a header after as many as 19 non-blank preamble rows", () => {
    const preamble = Array.from({ length: 19 }, (_, i) => `Note ${i},x`);
    const csv = [...preamble, "Date,Description,Amount", "2026-01-03,A,-5.00"].join("\n");
    expect(mapped(parseStatement(csv)).transactions).toHaveLength(1);
  });

  it("does not find a header after 20 non-blank preamble rows", () => {
    const preamble = Array.from({ length: 20 }, (_, i) => `Note ${i},x`);
    const csv = [...preamble, "Date,Description,Amount", "2026-01-03,A,-5.00"].join("\n");
    expect(parseStatement(csv).status).toBe("mapping-required");
  });
});

describe("parseStatement: row errors never abort the parse (Req 8)", () => {
  it("returns mapped with every row as an error when every row fails (Req 8.5)", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-01-02,A,abc",
      "2026-01-03,B,def",
      "2026-01-04,C,",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.transactions).toEqual([]);
    expect(result.rowErrors.map((e) => e.rowIndex)).toEqual([1, 2, 3]);
  });

  it("returns an empty rowErrors array when nothing fails (Req 8.4)", () => {
    expect(mapped(parseStatement(US_SIGNED)).rowErrors).toEqual([]);
  });

  it("returns every error with its row number, raw row and reason (Req 8.1, 8.3)", () => {
    const csv = ["Date,Description,Amount", "01/02/2026,OK,-1.00", 'bad,"A, B",x'].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.transactions).toHaveLength(1);
    expect(result.rowErrors).toHaveLength(1);
    const [error] = result.rowErrors;
    expect(error?.rowIndex).toBe(2);
    expect(error?.rawRow).toBe('bad,"A, B",x');
    expect(error?.reason).toMatch(/^date: .*; amount: /);
  });

  it("skips fully blank rows anywhere after the header and does not count them (glossary Data row)", () => {
    const csv = [
      "Date,Description,Amount",
      "",
      "2026-01-02,A,-1.00",
      "  ,  ,  ",
      ",,",
      "2026-01-03,B,x",
      "",
      "2026-01-04,C,-3.00",
      "",
      "",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.transactions.map((t) => t.description)).toEqual(["A", "C"]);
    expect(result.rowErrors.map((e) => e.rowIndex)).toEqual([2]);
    expect(result.transactions.length + result.rowErrors.length).toBe(3);
  });

  it("returns mapped with nothing in it for a header and no rows", () => {
    expect(parseStatement("Date,Description,Amount")).toEqual({
      status: "mapped",
      transactions: [],
      rowErrors: [],
      detectedDateFormat: null,
      detectedSignConvention: { convention: "positive-out", assumed: true },
      detectedCurrency: { code: "USD", source: "default" },
    });
  });

  it("reports every row when no date has a recognisable format, and keeps checking other fields (Req 3.9)", () => {
    const csv = ["Date,Description,Amount", "yesterday,A,-1.00", "today,,-2.00"].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedDateFormat).toBeNull();
    expect(result.rowErrors).toHaveLength(2);
    expect(result.rowErrors[0]?.reason).toBe("date: no recognisable date format in the statement");
    expect(result.rowErrors[1]?.reason).toContain("description: missing required cell");
  });
});

describe("parseStatement: statement-level conflicts become errors, never throws", () => {
  it("returns an error for a date conflict (Req 3.10)", () => {
    const csv = ["Date,Description,Amount", "13/05/2026,A,-1.00", "05/13/2026,B,-2.00"].join("\n");
    const result = parseStatement(csv);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.reason).toMatch(/conflicting date formats/i);
    }
  });

  it("returns an error for a decimal separator conflict (Req 4.5)", () => {
    const csv = ["Date,Description,Amount", '2026-01-02,A,"1,234.56"', '2026-01-03,B,"9,99"'].join(
      "\n",
    );
    const result = parseStatement(csv);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.reason).toMatch(/conflicting decimal separator/i);
    }
  });

  it("reports the date conflict before the decimal conflict", () => {
    const csv = ["Date,Description,Amount", '13/05/2026,A,"1,234.56"', '05/13/2026,B,"9,99"'].join(
      "\n",
    );
    const result = parseStatement(csv);
    expect(result.status === "error" && result.reason).toMatch(/date/i);
  });
});

describe("parseStatement: dates and separators (Req 3.6, 4.7)", () => {
  it("settles a dd/mm statement from a deciding row that comes after ten ambiguous rows (Req 3.1)", () => {
    const rows = Array.from(
      { length: 10 },
      (_, i) => `${String(i + 1).padStart(2, "0")}/01/2026,R${i},-1.00`,
    );
    const csv = ["Date,Description,Amount", ...rows, "13/01/2026,LAST,-1.00"].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedDateFormat).toEqual({ format: "dd/mm/yyyy", assumed: false });
    expect(result.transactions[0]?.date).toBe("2026-01-01");
    expect(result.transactions.at(-1)?.date).toBe("2026-01-13");
  });

  it("reports an assumed date format when nothing decides it", () => {
    const csv = ["Date,Description,Amount", "01/02/2026,A,-1.00"].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedDateFormat).toEqual({ format: "mm/dd/yyyy", assumed: true });
    expect(result.transactions[0]?.date).toBe("2026-01-02");
  });

  it("reads comma decimals once one amount shows them, in every row", () => {
    const csv = [
      "Date,Description,Amount",
      '2026-01-02,A,"1.234"',
      '2026-01-03,B,"9,99"',
      "2026-01-04,C,-2",
    ].join("\n");
    const result = mapped(parseStatement(csv, { signConvention: "positive-out" }));
    expect(result.transactions.map((t) => t.amountCents)).toEqual([123_400, 999, -200]);
  });

  it("reads a minority date shape as a row error (Req 3.12)", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-01-02,A,-1.00",
      "2026-01-03,B,-1.00",
      "13/01/2026,C,-1.00",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.transactions.map((t) => t.description)).toEqual(["A", "B"]);
    expect(result.rowErrors.map((e) => e.rowIndex)).toEqual([3]);
  });
});

describe("parseStatement: delimiters and byte order mark (Req 1.6)", () => {
  const rows = [
    ["Date", "Description", "Amount"],
    ["2026-01-02", "NETFLIX", "-15.49"],
    ["2026-01-03", "PAYROLL", "1250.00"],
  ];
  const expected = parseStatement(rows.map((r) => r.join(",")).join("\n"));

  it.each([",", ";", "\t"])("reads %j-separated text", (delimiter) => {
    expect(parseStatement(rows.map((r) => r.join(delimiter)).join("\n"))).toEqual(expected);
  });

  it("strips a leading byte order mark", () => {
    expect(parseStatement(`\uFEFF${rows.map((r) => r.join(",")).join("\n")}`)).toEqual(expected);
  });

  it("reads a semicolon file with comma decimals", () => {
    const csv = [
      "Value Date;Narrative;Amount",
      "02.01.2026;GEHALT;1.234,56",
      "03.01.2026;STREAMING;-12,99",
      "04.01.2026;MUSIK;-9,99",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.transactions.map((t) => t.amountCents)).toEqual([-123_456, 1299, 999]);
    expect(result.detectedDateFormat).toEqual({ format: "dd.mm.yyyy", assumed: false });
    expect(result.detectedSignConvention).toEqual({ convention: "negative-out", assumed: false });
  });
});

describe("parseStatement: currency column (Req 10.4-10.6)", () => {
  it("takes the per-row currency, upper-cased, and falls back for empty cells", () => {
    const csv = [
      "Date,Description,Amount,Currency",
      "2026-01-02,A,-1.00,eur",
      "2026-01-03,B,-2.00,",
      "2026-01-04,C,-3.00,GBP",
    ].join("\n");
    const result = mapped(parseStatement(csv, { currency: "usd" }));
    expect(result.transactions.map((t) => t.currency)).toEqual(["EUR", "USD", "GBP"]);
  });

  it("reports an invalid per-row currency as a row error", () => {
    const csv = [
      "Date,Description,Amount,Ccy",
      "2026-01-02,A,-1.00,EURO",
      "2026-01-03,B,-2.00,EUR",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.transactions).toHaveLength(1);
    expect(result.rowErrors[0]?.reason).toMatch(/^currency: /);
  });
});

describe("parseStatement: determinism (Req 1.7)", () => {
  it("returns equal results for equal arguments", () => {
    for (const options of [
      undefined,
      { currency: "eur" },
      { signConvention: "positive-out" as const },
    ]) {
      expect(parseStatement(US_SIGNED, options)).toEqual(parseStatement(US_SIGNED, options));
    }
  });
});

describe("parseStatement: statement currency (Req 10.7-10.10)", () => {
  const UK_DEBIT_CREDIT = [
    "Transaction Date,Details,Debit,Credit",
    "02/01/2026,HIGHFIELD STORES,£38.64,",
    '06/01/2026,SALARY,,"£2,100.00"',
    "12/01/2026,MARKET SQUARE FOODS,52.10,",
    "15/01/2026,DISNEYPLUS,£7.99,",
  ].join("\n");

  it("reads a statement whose amounts carry only pound signs as GBP, and says it did", () => {
    const result = mapped(parseStatement(UK_DEBIT_CREDIT));
    expect(result.detectedCurrency).toEqual({ code: "GBP", source: "symbol" });
    expect(result.transactions.map((t) => t.currency)).toEqual(["GBP", "GBP", "GBP", "GBP"]);
    expect(result.transactions.map((t) => t.amountCents)).toEqual([3864, -210_000, 5210, 799]);
  });

  it("reads a signed statement with only euro signs as EUR", () => {
    const csv = ["Date,Description,Amount", "2026-01-02,A,-€9.99", "2026-01-03,B,€1.00"].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedCurrency).toEqual({ code: "EUR", source: "symbol" });
    expect(result.transactions.every((t) => t.currency === "EUR")).toBe(true);
  });

  it("keeps USD, as a default, for no symbol, a dollar sign, another symbol or mixed symbols", () => {
    const body = (amounts: string[]) =>
      ["Date,Description,Amount", ...amounts.map((a, i) => `2026-01-0${i + 1},X${i},"${a}"`)].join(
        "\n",
      );
    for (const amounts of [
      ["-5.00"],
      ["$5.00", "-$6.00"],
      ["¥500", "¥600"],
      ["£5.00", "€6.00"],
      ["£5.00", "$6.00"],
    ]) {
      const result = mapped(parseStatement(body(amounts)));
      expect(result.detectedCurrency, amounts.join(" ")).toEqual({
        code: "USD",
        source: "default",
      });
      expect(result.transactions.every((t) => t.currency === "USD")).toBe(true);
    }
  });

  it("lets an explicit option beat the symbols and reports it as the source", () => {
    const result = mapped(parseStatement(UK_DEBIT_CREDIT, { currency: "usd" }));
    expect(result.detectedCurrency).toEqual({ code: "USD", source: "option" });
    expect(result.transactions.every((t) => t.currency === "USD")).toBe(true);
    expect(mapped(parseStatement(UK_DEBIT_CREDIT, { currency: "eur" })).detectedCurrency).toEqual({
      code: "EUR",
      source: "option",
    });
  });

  it("lets a currency column beat the symbols, and does not infer when there is one", () => {
    const csv = [
      "Date,Description,Amount,Currency",
      "2026-01-02,A,£5.00,EUR",
      "2026-01-03,B,£6.00,",
      "2026-01-04,C,£7.00,eur",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedCurrency).toEqual({ code: "EUR", source: "column" });
    // The row with an empty cell takes the column's currency, not the pound sign's.
    expect(result.transactions.map((t) => t.currency)).toEqual(["EUR", "EUR", "EUR"]);
  });

  it("gives USD with source column when the column is empty or holds several currencies", () => {
    const empty = [
      "Date,Description,Amount,Currency",
      "2026-01-02,A,£5.00,",
      "2026-01-03,B,£6.00,",
    ].join("\n");
    const mixed = [
      "Date,Description,Amount,Currency",
      "2026-01-02,A,5.00,EUR",
      "2026-01-03,B,6.00,GBP",
    ].join("\n");
    expect(mapped(parseStatement(empty)).detectedCurrency).toEqual({
      code: "USD",
      source: "column",
    });
    expect(mapped(parseStatement(empty)).transactions.map((t) => t.currency)).toEqual([
      "USD",
      "USD",
    ]);
    const mixedResult = mapped(parseStatement(mixed));
    expect(mixedResult.detectedCurrency).toEqual({ code: "USD", source: "column" });
    expect(mixedResult.transactions.map((t) => t.currency)).toEqual(["EUR", "GBP"]);
  });

  it("lets a mapped currency column count as a currency column", () => {
    const csv = ["Booked,Text,Sum,Money", "2026-01-02,A,£5.00,CHF", "2026-01-03,B,£6.00,CHF"].join(
      "\n",
    );
    const result = mapped(
      parseStatement(csv, {
        columnMap: { date: "Booked", description: "Text", amount: "Sum", currency: "Money" },
      }),
    );
    expect(result.detectedCurrency).toEqual({ code: "CHF", source: "column" });
  });

  it("counts a symbol on a row that fails for another reason", () => {
    const csv = ["Date,Description,Amount", "not a date,A,£5.00", "also bad,B,£6.00"].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedCurrency).toEqual({ code: "GBP", source: "symbol" });
    expect(result.rowErrors).toHaveLength(2);
  });

  it("ignores symbols in cells that are not amounts", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-01-02,A,£5.00",
      "2026-01-03,B,€ 6.00",
      "2026-01-04,C,$$",
    ].join("\n");
    const result = mapped(parseStatement(csv));
    expect(result.detectedCurrency).toEqual({ code: "GBP", source: "symbol" });
    expect(result.rowErrors.map((e) => e.rowIndex)).toEqual([2, 3]);
  });

  it("only reads the amount columns, not description text with a symbol in it", () => {
    const csv = ["Date,Description,Amount", "2026-01-02,PAID IN €,-5.00"].join("\n");
    expect(mapped(parseStatement(csv)).detectedCurrency).toEqual({
      code: "USD",
      source: "default",
    });
  });

  it("reports a default currency for a statement with no rows", () => {
    expect(mapped(parseStatement("Date,Description,Amount")).detectedCurrency).toEqual({
      code: "USD",
      source: "default",
    });
  });
});

const SAMPLES = fileURLToPath(new URL("../../../../samples/", import.meta.url));

function sample(name: string): string {
  return readFileSync(`${SAMPLES}${name}`, "utf8");
}

function sum(result: MappedResult): number {
  return result.transactions.reduce((total, t) => total + t.amountCents, 0);
}

describe("parseStatement: the sample statements end to end", () => {
  it("us-signed.csv: a signed amount column, mm/dd/yyyy, dollars", () => {
    const result = mapped(parseStatement(sample("us-signed.csv")));
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions).toHaveLength(26);
    expect(result.detectedDateFormat).toEqual({ format: "mm/dd/yyyy", assumed: false });
    expect(result.detectedSignConvention).toEqual({ convention: "negative-out", assumed: false });
    expect(result.detectedCurrency).toEqual({ code: "USD", source: "default" });
    expect(result.transactions[0]).toEqual({
      date: "2026-01-02",
      description: "NETFLIX.COM 866-579-7172 CA",
      amountCents: 1549,
      currency: "USD",
    });
    // Pay is money in (negative), with a thousands separator in the file.
    expect(result.transactions[3]).toMatchObject({
      description: "PAYROLL ACME CORP DIRECT DEP",
      amountCents: -125_000,
    });
    // A refund after its order nets to nothing.
    const marketplace = result.transactions.filter((t) =>
      t.description.startsWith("ONLINE MARKETPLACE"),
    );
    expect(marketplace.map((t) => t.amountCents)).toEqual([2347, -2347]);
    expect(result).toMatchSnapshot();
  });

  it("uk-debit-credit.csv: separate debit and credit columns, dd/mm/yyyy decided by a later row, pounds", () => {
    const result = mapped(parseStatement(sample("uk-debit-credit.csv")));
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions).toHaveLength(25);
    // The first rows are all ambiguous (day 12 or less); the 15th settles the format for all of them.
    expect(result.detectedDateFormat).toEqual({ format: "dd/mm/yyyy", assumed: false });
    expect(result.transactions[0]?.date).toBe("2026-01-02");
    expect(result.transactions[1]?.date).toBe("2026-01-02");
    expect(result.transactions.find((t) => t.description.startsWith("DISNEYPLUS"))?.date).toBe(
      "2026-01-15",
    );
    expect(result.detectedSignConvention).toBeNull();
    // Every amount carries a pound sign, or none, so the statement is in sterling.
    expect(result.detectedCurrency).toEqual({ code: "GBP", source: "symbol" });
    expect(new Set(result.transactions.map((t) => t.currency))).toEqual(new Set(["GBP"]));
    expect(result.transactions[0]).toEqual({
      date: "2026-01-02",
      description: "HIGHFIELD STORES 3214 LONDON",
      amountCents: 3864,
      currency: "GBP",
    });
    // Salary and a refund come from the credit column and are money in (negative).
    expect(result.transactions.find((t) => t.description.startsWith("SALARY"))?.amountCents).toBe(
      -210_000,
    );
    expect(
      result.transactions.find((t) => t.description.startsWith("ONLINE SHOP REFUND"))?.amountCents,
    ).toBe(-1950);
    // An amount written without a pound sign is read like the others.
    expect(
      result.transactions.find((t) => t.description.startsWith("MARKET SQUARE FOODS"))?.amountCents,
    ).toBe(5210);
    expect(result).toMatchSnapshot();
  });

  it("eu-semicolon.csv: semicolons, a byte order mark, dd.mm.yyyy, comma decimals, a currency column", () => {
    const csv = sample("eu-semicolon.csv");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const result = mapped(parseStatement(csv));
    expect(result.rowErrors).toEqual([]);
    expect(result.transactions).toHaveLength(19);
    expect(result.detectedDateFormat).toEqual({ format: "dd.mm.yyyy", assumed: false });
    expect(result.detectedSignConvention).toEqual({ convention: "negative-out", assumed: false });
    // The column holds EUR in every filled cell, one of them written in lower case.
    expect(result.detectedCurrency).toEqual({ code: "EUR", source: "column" });
    expect(new Set(result.transactions.map((t) => t.currency))).toEqual(new Set(["EUR"]));
    // "1.234,56" is a thousand and a bit, not 1.23.
    expect(result.transactions[0]).toEqual({
      date: "2026-01-02",
      description: "GEHALT BEISPIEL GMBH",
      amountCents: -123_456,
      currency: "EUR",
    });
    expect(result.transactions[1]).toMatchObject({
      description: "STREAMING DIENST MONATSBEITRAG",
      amountCents: 1299,
    });
    expect(
      result.transactions.find((t) => t.description.startsWith("ONLINE SHOP"))?.amountCents,
    ).toBe(-1950);
    expect(result).toMatchSnapshot();
  });

  it("with-preamble.csv: account lines above the header and blank rows inside and after the data", () => {
    const result = mapped(parseStatement(sample("with-preamble.csv")));
    expect(result.rowErrors).toEqual([]);
    // 15 data rows: the four preamble lines, the header and the blank rows are not counted.
    expect(result.transactions).toHaveLength(15);
    expect(result.detectedDateFormat).toEqual({ format: "yyyy-mm-dd", assumed: false });
    expect(result.detectedSignConvention).toEqual({ convention: "negative-out", assumed: false });
    expect(result.detectedCurrency).toEqual({ code: "USD", source: "default" });
    expect(result.transactions[0]).toEqual({
      date: "2026-01-03",
      description: "STREAMLY VIDEO MONTHLY",
      amountCents: 1199,
      currency: "USD",
    });
    // The data after the blank row in the middle is read like the data before it.
    expect(result.transactions.map((t) => t.date).slice(4, 7)).toEqual([
      "2026-01-20",
      "2026-02-03",
      "2026-02-06",
    ]);
    expect(result).toMatchSnapshot();
  });

  it("reads every sample the same way with a different line ending or without the byte order mark", () => {
    for (const name of [
      "us-signed.csv",
      "uk-debit-credit.csv",
      "eu-semicolon.csv",
      "with-preamble.csv",
    ]) {
      const csv = sample(name);
      const expected = parseStatement(csv);
      expect(parseStatement(csv.replaceAll("\n", "\r\n")), name).toEqual(expected);
      expect(parseStatement(csv.replace(/^\uFEFF/, "")), name).toEqual(expected);
    }
  });

  it("adds up: the sample totals do not change when a currency option is given", () => {
    for (const name of [
      "us-signed.csv",
      "uk-debit-credit.csv",
      "eu-semicolon.csv",
      "with-preamble.csv",
    ]) {
      const plain = mapped(parseStatement(sample(name)));
      const withOption = mapped(parseStatement(sample(name), { currency: "CHF" }));
      expect(sum(withOption), name).toBe(sum(plain));
      expect(withOption.detectedCurrency).toEqual({ code: "CHF", source: "option" });
    }
  });
});
