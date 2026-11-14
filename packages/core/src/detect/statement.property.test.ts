// P13: statement range and As-of date (design "Correctness properties").

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { NormalizedTransaction } from "../normalize/types.js";
import { daysInMonth } from "./dates.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import { isoDateArb, junkElementArb, validTxArb } from "./test-arbitraries.js";
import { validateElement } from "./validate.js";

const rowsArb: fc.Arbitrary<unknown[]> = fc.array(fc.oneof(validTxArb, junkElementArb), {
  maxLength: 25,
});

// Options: absent, a valid or invalid asOf, other shapes, and any plain value.
const optionsArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.record({ asOf: isoDateArb }),
  fc.record({ asOf: fc.string() }),
  fc.record({
    asOf: fc.constantFrom("2026-02-29", "2026-13-01", "26-01-01", " 2026-01-01", "2026-1-1"),
  }),
  fc.record({ asOf: fc.anything() }),
  fc.constantFrom<unknown>(null, [], 5, "2026-01-01", true),
  fc.anything(),
);

/** An independent check of "yyyy-mm-dd naming a real date" (no use of `parseIsoDate`). */
function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

describe("statement properties", () => {
  it("P13: range, currencies and asOf follow the valid rows and the options", () => {
    fc.assert(
      fc.property(rowsArb, optionsArb, (rows, options) => {
        const result = detectSubscriptions(
          rows as readonly NormalizedTransaction[],
          options as undefined,
        );
        const valid: NormalizedTransaction[] = [];
        rows.forEach((row, i) => {
          const checked = validateElement(row, i);
          if (checked.ok) valid.push(row as NormalizedTransaction);
        });

        // All valid dates have four-digit years, so string order is date order.
        const dates = valid.map((tx) => tx.date).sort();
        const firstDate = dates.length === 0 ? null : (dates[0] as string);
        const lastDate = dates.length === 0 ? null : (dates[dates.length - 1] as string);
        const { statement } = result;
        expect(statement.firstDate).toBe(firstDate);
        expect(statement.lastDate).toBe(lastDate);
        expect(statement.currencies).toEqual([...new Set(valid.map((tx) => tx.currency))].sort());

        const requested =
          typeof options === "object" && options !== null && !Array.isArray(options)
            ? (options as { asOf?: unknown }).asOf
            : undefined;
        if (isRealIsoDate(requested)) {
          expect(statement.asOf).toBe(requested);
          expect(statement.asOfSource).toBe("option");
        } else if (lastDate !== null) {
          expect(statement.asOf).toBe(lastDate);
          expect(statement.asOfSource).toBe("statement");
        } else {
          expect(statement.asOf).toBeNull();
          expect(statement.asOfSource).toBeNull();
        }
      }),
    );
  });
});
