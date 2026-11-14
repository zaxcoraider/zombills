import { describe, expect, it } from "vitest";
import { detectHeaderRow, firstNonBlankRow, HEADER_SEARCH_LIMIT } from "./header-detect.js";
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  CURRENCY_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
  normalizeHeader,
} from "./header-names.js";
import { parseStatement } from "./parse-statement.js";

/** A non-blank row that no recognition list matches. */
function preambleRow(n: number): string[] {
  return [`Note ${n}`, "info"];
}

describe("recognition lists (Req 2.1-2.4, 10.4)", () => {
  it("hold exactly the names the requirements list", () => {
    expect(DATE_HEADERS).toEqual([
      "date",
      "transaction date",
      "posted date",
      "value date",
      "trans. date",
    ]);
    expect(DESCRIPTION_HEADERS).toEqual([
      "description",
      "memo",
      "narrative",
      "details",
      "merchant",
      "payee",
      "transaction description",
    ]);
    expect(AMOUNT_HEADERS).toEqual(["amount", "transaction amount", "net amount", "value"]);
    expect(DEBIT_HEADERS).toEqual(["debit", "debit amount", "withdrawal", "withdrawals"]);
    expect(CREDIT_HEADERS).toEqual(["credit", "credit amount", "deposit", "deposits"]);
    expect(CURRENCY_HEADERS).toEqual(["currency", "ccy"]);
  });

  it("are written in normalized form", () => {
    for (const list of [
      DATE_HEADERS,
      DESCRIPTION_HEADERS,
      AMOUNT_HEADERS,
      DEBIT_HEADERS,
      CREDIT_HEADERS,
      CURRENCY_HEADERS,
    ]) {
      for (const name of list) {
        expect(normalizeHeader(name)).toBe(name);
      }
    }
  });

  it("do not share a name between roles", () => {
    const all = [
      ...DATE_HEADERS,
      ...DESCRIPTION_HEADERS,
      ...AMOUNT_HEADERS,
      ...DEBIT_HEADERS,
      ...CREDIT_HEADERS,
      ...CURRENCY_HEADERS,
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("normalizeHeader (Req 2.10)", () => {
  it("trims surrounding whitespace and lower-cases", () => {
    expect(normalizeHeader("  Posted Date ")).toBe("posted date");
    expect(normalizeHeader("\tDATE\n")).toBe("date");
    expect(normalizeHeader("\u00a0Amount\u00a0")).toBe("amount");
  });

  it("keeps whitespace inside the name", () => {
    expect(normalizeHeader("Transaction  Date")).toBe("transaction  date");
  });

  it("does not depend on the locale", () => {
    expect(normalizeHeader("TITLE")).toBe("title");
    expect(normalizeHeader("I")).toBe("i");
  });
});

describe("detectHeaderRow", () => {
  it("finds the header on the first row", () => {
    expect(
      detectHeaderRow([
        ["Date", "Description", "Amount"],
        ["01/02/2026", "ACME", "-5.00"],
      ]),
    ).toBe(0);
  });

  it("finds the header after preamble rows", () => {
    const rows = [
      ["Account Name", "SAMPLE"],
      ["IBAN", "GB00FAKE00000000000000"],
      ["Statement Period", "2026-01-01 to 2026-03-31"],
      ["Date", "Description", "Amount"],
      ["2026-01-03", "ACME", "-5.00"],
    ];
    expect(detectHeaderRow(rows)).toBe(3);
  });

  it.each([
    ...DATE_HEADERS,
    ...DESCRIPTION_HEADERS,
    ...AMOUNT_HEADERS,
    ...DEBIT_HEADERS,
    ...CREDIT_HEADERS,
  ])("recognises a row holding the name %j", (name) => {
    expect(detectHeaderRow([["Account", name]])).toBe(0);
  });

  it("matches when only one cell of the row is a known name", () => {
    expect(detectHeaderRow([["Booked", "Text", "Sum", "Value"]])).toBe(0);
  });

  it("matches ignoring case and surrounding whitespace", () => {
    expect(detectHeaderRow([["  DATE ", "x"]])).toBe(0);
    expect(detectHeaderRow([["x", "\tPosted Date\n"]])).toBe(0);
    expect(detectHeaderRow([["\u00a0Description\u00a0"]])).toBe(0);
  });

  it("does not match names that only contain a known name", () => {
    expect(detectHeaderRow([["Statement date: 01/05/2026", "x"]])).toBeNull();
    expect(detectHeaderRow([["Date posted"], ["Dates"], ["Amounts"], ["Total value"]])).toBeNull();
  });

  it("does not treat currency columns alone as a header", () => {
    expect(detectHeaderRow([["Currency", "CCY"]])).toBeNull();
  });

  it("returns the first matching row, not a later one", () => {
    expect(
      detectHeaderRow([
        ["Date", "x"],
        ["Amount", "y"],
      ]),
    ).toBe(0);
  });

  it("returns null for no rows and for rows without any known name", () => {
    expect(detectHeaderRow([])).toBeNull();
    expect(
      detectHeaderRow([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBeNull();
  });
});

describe("detectHeaderRow: the 20-row search window (Req 11.1)", () => {
  const header = ["Date", "Description", "Amount"];

  it("finds a header that is the 20th non-blank row", () => {
    const rows = [...Array.from({ length: 19 }, (_, i) => preambleRow(i)), header];
    expect(HEADER_SEARCH_LIMIT).toBe(20);
    expect(detectHeaderRow(rows)).toBe(19);
  });

  it("does not find a header that is the 21st non-blank row", () => {
    const rows = [...Array.from({ length: 20 }, (_, i) => preambleRow(i)), header];
    expect(detectHeaderRow(rows)).toBeNull();
  });

  it("does not count blank rows towards the 20", () => {
    const blanks = Array.from({ length: 30 }, () => [""]);
    expect(detectHeaderRow([...blanks, header])).toBe(30);
  });

  it("skips blank rows mixed into the preamble when counting", () => {
    const rows: string[][] = [];
    for (let i = 0; i < 19; i += 1) {
      rows.push(preambleRow(i), [""], ["  ", "\t"]);
    }
    rows.push(header);
    expect(detectHeaderRow(rows)).toBe(rows.length - 1);
  });

  it("treats whitespace-only rows as blank", () => {
    expect(detectHeaderRow([["  ", "\t"], ["\u00a0"], header])).toBe(2);
  });
});

describe("firstNonBlankRow", () => {
  it("returns the first row with content", () => {
    expect(firstNonBlankRow([[""], ["  "], ["Booked", "Text"], ["a", "b"]])).toEqual([
      "Booked",
      "Text",
    ]);
  });

  it("returns the cells untrimmed", () => {
    expect(firstNonBlankRow([[" Booked ", ""]])).toEqual([" Booked ", ""]);
  });

  it("returns null when every row is blank or there are no rows", () => {
    expect(firstNonBlankRow([])).toBeNull();
    expect(firstNonBlankRow([[""], ["  ", ""]])).toBeNull();
  });

  it("returns a copy, not the original row", () => {
    const row = ["a", "b"];
    const result = firstNonBlankRow([row]);
    expect(result).toEqual(row);
    expect(result).not.toBe(row);
  });
});

describe("header row end to end (Req 11.2, 11.3, 11.4)", () => {
  const csv = [
    "Booked,Text,Sum",
    "2026-01-02,ACME,-5.00",
    "2026-01-03,BETA,-6.00",
    "2026-01-04,GAMMA,7.00",
  ].join("\n");

  it("asks for a mapping, giving the first row's cells, when no header is recognised", () => {
    expect(parseStatement(csv)).toEqual({
      status: "mapping-required",
      columns: ["Booked", "Text", "Sum"],
      rowErrors: [],
    });
  });

  it("maps the same file when a column map names the first row's cells", () => {
    const result = parseStatement(csv, {
      columnMap: { date: "Booked", description: "Text", amount: "Sum" },
    });
    expect(result.status).toBe("mapped");
    if (result.status === "mapped") {
      expect(result.transactions.map((t) => t.description)).toEqual(["ACME", "BETA", "GAMMA"]);
      expect(result.rowErrors).toEqual([]);
    }
  });

  it("does not count the first row as data (Req 11.4)", () => {
    const result = parseStatement(csv, {
      columnMap: { date: "Booked", description: "Text", amount: "Sum" },
    });
    expect(result.status === "mapped" && result.transactions.length + result.rowErrors.length).toBe(
      3,
    );
  });

  it("does not count preamble rows above a recognised header as data (Req 11.2, 11.4)", () => {
    const withPreamble = [
      "Account,SAMPLE",
      "",
      "Period,2026-Q1",
      "Date,Description,Amount",
      "2026-01-02,A,-1.00",
    ];
    const result = parseStatement(withPreamble.join("\n"));
    expect(result.status === "mapped" && result.transactions.length + result.rowErrors.length).toBe(
      1,
    );
  });
});
