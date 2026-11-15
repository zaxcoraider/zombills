import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { errorMessage, isAmountShaped, isDateShaped, visibleColumnNames } from "./messages";
import { amountCellArb, dateCellArb } from "./test-arbitraries";

const headerNameArb = fc.constantFrom(
  "Date",
  "Description",
  "Amount",
  "Balance",
  "Reference",
  "Notes",
);
const longNameArb = fc
  .string({ minLength: 41, maxLength: 80 })
  .filter((s) => !isDateShaped(s) && !isAmountShaped(s));
const columnsArb = fc.array(fc.oneof(dateCellArb, amountCellArb, headerNameArb, longNameArb), {
  maxLength: 30,
});

const PREFIX = "Columns found: ";

/** Cuts a name the way the module does: 39 code points plus an ellipsis when over 40. */
function cut(name: string): string {
  const points = Array.from(name);
  return points.length > 40 ? `${points.slice(0, 39).join("")}…` : name;
}

describe("messages properties", () => {
  it("P13: error text leaks no cells", () => {
    fc.assert(
      fc.property(columnsArb, (columns) => {
        const shown = visibleColumnNames(columns);
        expect(shown.length).toBeLessThanOrEqual(10);
        for (const name of shown) {
          expect(isDateShaped(name)).toBe(false);
          expect(isAmountShaped(name)).toBe(false);
          expect(Array.from(name).length).toBeLessThanOrEqual(40);
        }

        const message = errorMessage({
          kind: "columns-unreadable",
          columns,
          found: { date: true, description: true, amount: true },
        });
        const leaked = new Set(
          columns.filter((c) => isDateShaped(c) || isAmountShaped(c)).flatMap((c) => [c, cut(c)]),
        );
        if (shown.length > 0) {
          const detail = message.detail ?? "";
          expect(detail.startsWith(PREFIX)).toBe(true);
          expect(detail.endsWith(".")).toBe(true);
          const items = detail.slice(PREFIX.length, -1).split(", ");
          for (const item of items) expect(leaked.has(item)).toBe(false);
        } else {
          expect(message.detail).toBe("No header row was found.");
        }
      }),
    );
  });

  it("P14: cell shapes", () => {
    fc.assert(
      fc.property(dateCellArb, (cell) => {
        expect(isDateShaped(cell)).toBe(true);
      }),
    );
    fc.assert(
      fc.property(amountCellArb, (cell) => {
        expect(isAmountShaped(cell)).toBe(true);
      }),
    );
    fc.assert(
      fc.property(
        fc.string({ unit: "grapheme" }).filter((s) => /\p{L}/u.test(s)),
        (text) => {
          expect(isDateShaped(text)).toBe(false);
          expect(isAmountShaped(text)).toBe(false);
        },
      ),
    );
  });
});
