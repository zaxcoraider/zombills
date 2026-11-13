import { describe, expect, it } from "vitest";
import type { ColumnMap, ParseOptions, ParseResult } from "./types";

// These tests mostly check at compile time (`npm run typecheck`) that the public types
// have the shapes the design specifies. The runtime assertions confirm the narrowing works.

function describeResult(result: ParseResult): string {
  switch (result.status) {
    case "mapped":
      return `mapped:${result.transactions.length}:${result.detectedDateFormat?.format ?? "none"}`;
    case "mapping-required":
      return `mapping-required:${result.columns.join("|")}:${result.validationErrors?.length ?? 0}`;
    case "error":
      return `error:${result.reason}`;
  }
}

describe("public types", () => {
  it("ParseResult narrows on status", () => {
    const mapped: ParseResult = {
      status: "mapped",
      transactions: [
        { date: "2026-01-02", description: "ACME", amountCents: 1500, currency: "USD" },
      ],
      rowErrors: [],
      detectedDateFormat: { format: "dd/mm/yyyy", assumed: false },
      detectedSignConvention: null,
    };
    const mappingRequired: ParseResult = {
      status: "mapping-required",
      columns: ["Booked", "Text"],
      validationErrors: [{ role: "date", column: null, problem: "missing-mapping" }],
      rowErrors: [],
    };
    const error: ParseResult = { status: "error", reason: "empty input" };

    expect(describeResult(mapped)).toBe("mapped:1:dd/mm/yyyy");
    expect(describeResult(mappingRequired)).toBe("mapping-required:Booked|Text:1");
    expect(describeResult(error)).toBe("error:empty input");
  });

  it("ColumnMap and ParseOptions accept partial values", () => {
    const columnMap: ColumnMap = { date: "Booked" };
    const options: ParseOptions = { columnMap, currency: "eur", signConvention: "negative-out" };
    expect(options.columnMap?.date).toBe("Booked");
  });
});
