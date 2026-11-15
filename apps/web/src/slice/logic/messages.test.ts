import { describe, expect, it } from "vitest";
import { analyzeStatement } from "./analyze-statement";
import {
  errorFromOutcome,
  errorMessage,
  isAmountShaped,
  isDateShaped,
  visibleColumnNames,
  type PageError,
} from "./messages";
import type { ColumnPresence } from "./missing-columns";

/** True when the text has a high or low surrogate that is not part of a pair. */
function hasLoneSurrogate(text: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

const ALL_FOUND: ColumnPresence = { date: true, description: true, amount: true };

function columnsError(columns: string[], found: Partial<ColumnPresence> = {}): PageError {
  return { kind: "columns-unreadable", columns, found: { ...ALL_FOUND, ...found } };
}

describe("errorMessage: message table", () => {
  it("too-many-files", () => {
    expect(errorMessage({ kind: "too-many-files" })).toEqual({
      summary: "Only one statement can be read at a time. Drop a single CSV file.",
      detail: null,
    });
  });

  it("too-large", () => {
    expect(errorMessage({ kind: "too-large" })).toEqual({
      summary: "This file is larger than 1 MB, so it was not read.",
      detail: null,
    });
  });

  it("not-csv", () => {
    expect(errorMessage({ kind: "not-csv" })).toEqual({
      summary: "This file is not a CSV statement.",
      detail: null,
    });
  });

  it("empty-file", () => {
    expect(errorMessage({ kind: "empty-file" })).toEqual({
      summary: "The file is empty.",
      detail: null,
    });
  });

  it("unreadable-file", () => {
    expect(errorMessage({ kind: "unreadable-file" })).toEqual({
      summary: "The file could not be opened.",
      detail: null,
    });
  });

  it("parse-error puts the parser's reason in the detail", () => {
    expect(errorMessage({ kind: "parse-error", reason: "Bad quote on line 3" })).toEqual({
      summary: "The statement could not be read.",
      detail: "Bad quote on line 3",
    });
  });

  it("columns-unreadable with nothing missing lists the columns found", () => {
    expect(errorMessage(columnsError(["Foo", "Bar", "Baz"]))).toEqual({
      summary: "The columns could not be recognised.",
      detail: "Columns found: Foo, Bar, Baz.",
    });
  });

  it("no-transactions with failed rows", () => {
    expect(errorMessage({ kind: "no-transactions", rowErrorCount: 4 })).toEqual({
      summary: "No rows could be read: 4 rows failed.",
      detail: null,
    });
  });

  it("no-transactions with no failed rows", () => {
    expect(errorMessage({ kind: "no-transactions", rowErrorCount: 0 })).toEqual({
      summary: "The statement has no transaction rows.",
      detail: null,
    });
  });
});

describe("errorMessage: missing-column wording", () => {
  it("one missing role", () => {
    expect(errorMessage(columnsError(["A"], { date: false })).summary).toBe(
      "The columns could not be recognised. No date column was found.",
    );
    expect(errorMessage(columnsError(["A"], { description: false })).summary).toBe(
      "The columns could not be recognised. No description column was found.",
    );
    expect(errorMessage(columnsError(["A"], { amount: false })).summary).toBe(
      "The columns could not be recognised. No amount column was found.",
    );
  });

  it("two missing roles", () => {
    expect(errorMessage(columnsError(["A"], { date: false, amount: false })).summary).toBe(
      "The columns could not be recognised. No date or amount column was found.",
    );
  });

  it("three missing roles", () => {
    const found = { date: false, description: false, amount: false };
    expect(errorMessage(columnsError(["A"], found)).summary).toBe(
      "The columns could not be recognised. No date, description or amount column was found.",
    );
  });
});

describe("errorMessage: header-less rows", () => {
  it.each(["01/02/2026,NETFLIX.COM,-15.49", "01/02/26,NETFLIX.COM,-15.49"])(
    "lists only NETFLIX.COM for %s",
    (row) => {
      const message = errorMessage(columnsError(row.split(",")));
      expect(message.detail).toBe("Columns found: NETFLIX.COM.");
    },
  );

  it("says no header row was found when only dates and amounts remain", () => {
    const message = errorMessage(columnsError(["01/02/2026", "-15.49", "2026-01-02", "(3.00)"]));
    expect(message.detail).toBe("No header row was found.");
  });

  it("comes from a real headerless statement", () => {
    const outcome = analyzeStatement("01/02/2026,NETFLIX.COM,-15.49\n");
    expect(outcome.kind).toBe("columns-unreadable");
    if (outcome.kind !== "columns-unreadable") return;
    expect(errorMessage(errorFromOutcome(outcome))).toEqual({
      summary:
        "The columns could not be recognised. No date, description or amount column was found.",
      detail: "Columns found: NETFLIX.COM.",
    });
  });
});

describe("visibleColumnNames", () => {
  it("keeps 10 of 11 names", () => {
    const names = Array.from({ length: 11 }, (_, i) => `Col${i + 1}`);
    const shown = visibleColumnNames(names);
    expect(shown).toHaveLength(10);
    expect(shown).toEqual(names.slice(0, 10));
  });

  it("cuts a 60-character name to 39 characters plus an ellipsis", () => {
    const [shown] = visibleColumnNames(["x".repeat(60)]);
    expect(shown).toBe(`${"x".repeat(39)}…`);
    expect(Array.from(shown!)).toHaveLength(40);
  });

  it("keeps a 40-character name whole", () => {
    const name = "y".repeat(40);
    expect(visibleColumnNames([name])).toEqual([name]);
  });

  it("cuts an emoji across code units 39 and 40 without a lone surrogate", () => {
    // 38 letters, then an emoji at code units 38–39, then more text.
    const name = `${"a".repeat(38)}😀${"b".repeat(10)}`;
    const [shown] = visibleColumnNames([name]);
    expect(shown).toBe(`${"a".repeat(38)}😀…`);
    expect(hasLoneSurrogate(shown!)).toBe(false);
  });

  it("does not split an emoji that straddles the 39-point boundary", () => {
    const name = `${"a".repeat(39)}😀${"b".repeat(10)}`;
    const [shown] = visibleColumnNames([name]);
    expect(shown).toBe(`${"a".repeat(39)}…`);
    expect(hasLoneSurrogate(shown!)).toBe(false);
  });

  it("drops date- and amount-shaped names before counting", () => {
    expect(visibleColumnNames(["Date", "2026-01-02", "-15.49", "Amount"])).toEqual([
      "Date",
      "Amount",
    ]);
  });
});

describe("cell shapes", () => {
  it.each(["2026-01-02", "01/02/2026", "01/02/26", "1.2.26", " 01-02-2026 "])(
    "%s is date-shaped",
    (text) => expect(isDateShaped(text)).toBe(true),
  );

  it.each(["Date", "2026", "2026-01", "01/02", ""])("%s is not date-shaped", (text) =>
    expect(isDateShaped(text)).toBe(false),
  );

  it.each(["-15.49", "(15.49)", "15.49-", "$1,234.50", "1'234.50", "£ 12", "7"])(
    "%s is amount-shaped",
    (text) => expect(isAmountShaped(text)).toBe(true),
  );

  it.each(["Amount", "", "-", "$", "--5", "(5", "5 USD", "Debit 5"])(
    "%s is not amount-shaped",
    (text) => expect(isAmountShaped(text)).toBe(false),
  );
});

describe("errorFromOutcome", () => {
  it("maps empty to empty-file", () => {
    expect(errorFromOutcome({ kind: "empty" })).toEqual({ kind: "empty-file" });
  });

  it("keeps the data of the other three kinds", () => {
    expect(errorFromOutcome({ kind: "parse-error", reason: "r" })).toEqual({
      kind: "parse-error",
      reason: "r",
    });
    expect(
      errorFromOutcome({ kind: "columns-unreadable", columns: ["a"], found: ALL_FOUND }),
    ).toEqual({ kind: "columns-unreadable", columns: ["a"], found: ALL_FOUND });
    expect(errorFromOutcome({ kind: "no-transactions", rowErrorCount: 2 })).toEqual({
      kind: "no-transactions",
      rowErrorCount: 2,
    });
  });
});
