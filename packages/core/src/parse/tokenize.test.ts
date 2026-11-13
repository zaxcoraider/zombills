import { describe, expect, it } from "vitest";
import type { Delimiter } from "./internal-types";
import { isBlankRow, serializeRow, stripBom, tokenize } from "./tokenize";

describe("stripBom", () => {
  it("removes a leading byte order mark", () => {
    expect(stripBom("\uFEFFDate,Amount")).toBe("Date,Amount");
  });

  it("removes only one byte order mark", () => {
    expect(stripBom("\uFEFF\uFEFFDate")).toBe("\uFEFFDate");
  });

  it("leaves text without a byte order mark unchanged", () => {
    expect(stripBom("Date,Amount")).toBe("Date,Amount");
  });

  it("does not remove a byte order mark that is not at the start", () => {
    expect(stripBom("Date,\uFEFFAmount")).toBe("Date,\uFEFFAmount");
  });

  it("turns a file that holds only a byte order mark into an empty string", () => {
    expect(stripBom("\uFEFF")).toBe("");
  });
});

describe("tokenize: delimiter detection", () => {
  it("detects a comma", () => {
    const table = tokenize("Date,Description,Amount\n01/02/2026,ACME,-5.00\n01/03/2026,BETA,-6.00");
    expect(table.delimiter).toBe(",");
    expect(table.rows[1]).toEqual(["01/02/2026", "ACME", "-5.00"]);
  });

  it("detects a semicolon, even when the cells hold comma decimals", () => {
    const table = tokenize(
      "Value Date;Narrative;Amount;Currency\n02.01.2026;GEHALT;1.234,56;EUR\n03.01.2026;STREAMING;-12,99;EUR",
    );
    expect(table.delimiter).toBe(";");
    expect(table.rows[1]).toEqual(["02.01.2026", "GEHALT", "1.234,56", "EUR"]);
    expect(table.rows[2]).toEqual(["03.01.2026", "STREAMING", "-12,99", "EUR"]);
  });

  it("detects a tab", () => {
    const table = tokenize(
      "Date\tDescription\tAmount\n2026-01-02\tACME\t-5.00\n2026-01-03\tBETA\t-6.00",
    );
    expect(table.delimiter).toBe("\t");
    expect(table.rows[2]).toEqual(["2026-01-03", "BETA", "-6.00"]);
  });

  it("falls back to a comma when the delimiter cannot be guessed", () => {
    const table = tokenize("just one column\nstill one column");
    expect(table.delimiter).toBe(",");
    expect(table.rows).toEqual([["just one column"], ["still one column"]]);
  });

  it("still detects the comma when preamble rows have fewer cells than the header", () => {
    const table = tokenize(
      [
        "Account Name,SAMPLE CHECKING",
        "IBAN,GB00FAKE00000000000000",
        "Date,Description,Amount",
        "2026-01-03,STREAMLY,-11.99",
        "2026-01-05,GROCERY,-34.60",
      ].join("\n"),
    );
    expect(table.delimiter).toBe(",");
    expect(table.rows[2]).toEqual(["Date", "Description", "Amount"]);
  });
});

describe("tokenize: cells and rows", () => {
  it("keeps delimiters, doubled quotes and newlines inside quoted cells", () => {
    const table = tokenize(
      'Date,Description,Amount\n01/02/2026,"ACME, INC ""HQ""\nSecond line",-5.00\n01/03/2026,BETA,-6.00',
    );
    expect(table.rows).toHaveLength(3);
    expect(table.rows[1]).toEqual(["01/02/2026", 'ACME, INC "HQ"\nSecond line', "-5.00"]);
  });

  it("keeps every cell as an untrimmed string", () => {
    const table = tokenize("a,b\n 007 , 1e3 ");
    expect(table.rows[1]).toEqual([" 007 ", " 1e3 "]);
  });

  it("keeps blank rows in place", () => {
    const table = tokenize("a,b\n1,2\n\n3,4");
    expect(table.rows).toHaveLength(4);
    expect(isBlankRow(table.rows[2] ?? ["x"])).toBe(true);
  });

  it("produces a blank last row for a trailing newline", () => {
    const table = tokenize("a,b\n1,2\n");
    expect(table.rows).toHaveLength(3);
    expect(isBlankRow(table.rows[2] ?? ["x"])).toBe(true);
  });

  it("handles CRLF line endings", () => {
    const table = tokenize("a,b\r\n1,2\r\n3,4");
    expect(table.rows).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("returns no rows for an empty string", () => {
    expect(tokenize("").rows).toEqual([]);
  });

  it("does not throw on unbalanced quotes", () => {
    expect(() => tokenize('a,b\n1,"unterminated\n2,3')).not.toThrow();
  });
});

describe("isBlankRow", () => {
  it("is true when every cell is empty", () => {
    expect(isBlankRow(["", "", ""])).toBe(true);
  });

  it("is true when every cell is only whitespace", () => {
    expect(isBlankRow(["  ", "\t", "\u00a0", "\u2003"])).toBe(true);
  });

  it("is false when any cell has content", () => {
    expect(isBlankRow(["", " x "])).toBe(false);
  });

  it("is true for a row with the single empty cell Papa Parse gives a trailing newline", () => {
    expect(isBlankRow([""])).toBe(true);
  });

  it("treats whitespace-only rows from tokenize as blank", () => {
    const table = tokenize("a,b\n  ,  \n1,2");
    expect(isBlankRow(table.rows[1] ?? ["x"])).toBe(true);
    expect(isBlankRow(table.rows[2] ?? [])).toBe(false);
  });
});

describe("serializeRow", () => {
  const cellsFor: Record<Delimiter, string[]> = {
    ",": ["2026-01-02", 'ACME, INC "HQ"', "", " padded ", "two\nlines", "-12.50"],
    ";": ["2026-01-02", 'ACME; INC "HQ"', "", " padded ", "two\nlines", "-12,50"],
    "\t": ["2026-01-02", 'ACME\tINC "HQ"', "", " padded ", "two\nlines", "-12.50"],
  };

  for (const delimiter of [",", ";", "\t"] as const) {
    it(`round-trips through tokenize with delimiter ${JSON.stringify(delimiter)}`, () => {
      const cells = cellsFor[delimiter];
      const table = tokenize(serializeRow(cells, delimiter));
      expect(table.delimiter).toBe(delimiter);
      expect(table.rows).toEqual([cells]);
    });
  }

  it("does not add a trailing newline", () => {
    expect(serializeRow(["a", "b"], ",")).toBe("a,b");
  });

  it("quotes only the cells that need it", () => {
    expect(serializeRow(["a", "b,c", "d"], ",")).toBe('a,"b,c",d');
  });
});
