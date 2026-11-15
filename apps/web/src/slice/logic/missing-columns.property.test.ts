import fc from "fast-check";
import { describe, it } from "vitest";
import { expect } from "vitest";
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
  normalizeHeader,
  parseStatement,
} from "@zombills/core";
import { findColumns } from "./missing-columns";
import { headerRowArb } from "./test-arbitraries";

function inList(cell: string, list: readonly string[]): boolean {
  return list.includes(normalizeHeader(cell));
}

/** One valid data row for the header: a date, a merchant or an amount in each column. */
function dataRow(header: readonly string[]): string[] {
  return header.map((cell) =>
    inList(cell, DATE_HEADERS)
      ? "2026-01-02"
      : inList(cell, DESCRIPTION_HEADERS)
        ? "NETFLIX"
        : "15.49",
  );
}

describe("findColumns", () => {
  it("P5: found columns agree with the parser", () => {
    fc.assert(
      fc.property(headerRowArb, (header) => {
        const found = findColumns(header);

        const hasDate = header.some((c) => inList(c, DATE_HEADERS));
        const hasDescription = header.some((c) => inList(c, DESCRIPTION_HEADERS));
        const hasAmount = header.some((c) => inList(c, AMOUNT_HEADERS));
        const hasDebit = header.some((c) => inList(c, DEBIT_HEADERS));
        const hasCredit = header.some((c) => inList(c, CREDIT_HEADERS));

        if (!hasDate) expect(found.date).toBe(false);
        if (!hasDescription) expect(found.description).toBe(false);
        if (!hasAmount && !(hasDebit && hasCredit)) expect(found.amount).toBe(false);

        const csv = `${header.join(",")}\n${dataRow(header).join(",")}\n`;
        const result = parseStatement(csv);
        if (result.status === "mapped") {
          expect(found).toEqual({ date: true, description: true, amount: true });
        }
      }),
    );
  });
});
