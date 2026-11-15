import { describe, expect, it } from "vitest";
import type { DateFormat } from "@zombills/core";
import type { StatementFacts } from "./analyze-statement";
import { assumedValueNotes } from "./assumed-values";

function facts(overrides: Partial<StatementFacts> = {}): StatementFacts {
  return {
    transactionCount: 10,
    rowErrorCount: 0,
    statement: {
      firstDate: "2026-01-02",
      lastDate: "2026-03-25",
      asOf: "2026-03-25",
      asOfSource: "statement",
      currencies: ["USD"],
    },
    detectedCurrency: { code: "USD", source: "symbol" },
    detectedDateFormat: { format: "yyyy-mm-dd", assumed: false },
    detectedSignConvention: { convention: "negative-out", assumed: false },
    ...overrides,
  };
}

describe("assumedValueNotes", () => {
  it("returns no notes when nothing is assumed", () => {
    expect(assumedValueNotes(facts())).toEqual([]);
  });

  it("returns no notes when date format and sign convention are null", () => {
    expect(
      assumedValueNotes(facts({ detectedDateFormat: null, detectedSignConvention: null })),
    ).toEqual([]);
  });

  it("notes an assumed currency", () => {
    expect(
      assumedValueNotes(facts({ detectedCurrency: { code: "EUR", source: "default" } })),
    ).toEqual(["No currency was found in the statement, so amounts are shown in EUR."]);
  });

  it("does not note a currency found in the statement", () => {
    expect(assumedValueNotes(facts({ detectedCurrency: { code: "GBP", source: "column" } }))).toEqual(
      [],
    );
  });

  it("notes an assumed date format", () => {
    expect(
      assumedValueNotes(facts({ detectedDateFormat: { format: "dd/mm/yyyy", assumed: true } })),
    ).toEqual(["Dates were read as day/month/year."]);
  });

  it("uses the label of every date format", () => {
    const labels: Record<DateFormat, string> = {
      "yyyy-mm-dd": "year-month-day",
      "dd/mm/yyyy": "day/month/year",
      "mm/dd/yyyy": "month/day/year",
      "dd.mm.yyyy": "day.month.year",
      "dd-mm-yyyy": "day-month-year",
    };
    for (const [format, label] of Object.entries(labels)) {
      expect(
        assumedValueNotes(
          facts({ detectedDateFormat: { format: format as DateFormat, assumed: true } }),
        ),
      ).toEqual([`Dates were read as ${label}.`]);
    }
  });

  it("notes both sign-convention sentences", () => {
    expect(
      assumedValueNotes(
        facts({ detectedSignConvention: { convention: "negative-out", assumed: true } }),
      ),
    ).toEqual(["Negative amounts were read as money out."]);
    expect(
      assumedValueNotes(
        facts({ detectedSignConvention: { convention: "positive-out", assumed: true } }),
      ),
    ).toEqual(["Positive amounts were read as money out."]);
  });

  it("lists all three in the order currency, date format, sign", () => {
    expect(
      assumedValueNotes(
        facts({
          detectedCurrency: { code: "USD", source: "default" },
          detectedDateFormat: { format: "mm/dd/yyyy", assumed: true },
          detectedSignConvention: { convention: "positive-out", assumed: true },
        }),
      ),
    ).toEqual([
      "No currency was found in the statement, so amounts are shown in USD.",
      "Dates were read as month/day/year.",
      "Positive amounts were read as money out.",
    ]);
  });
});
