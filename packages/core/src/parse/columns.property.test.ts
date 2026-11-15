import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { autoDetectColumns, resolveColumnMap } from "./columns.js";
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  CURRENCY_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
} from "./header-names.js";
import type { ResolvedColumns } from "./internal-types.js";
import { parseStatement } from "./parse-statement.js";
import {
  expectedFromModel,
  headerSpellingArbitrary,
  parseOptionsOf,
  renderStatement,
  statementModelArbitrary,
  unrecognisedHeaderCellArbitrary,
  withCanonicalHeaders,
} from "./test-arbitraries.js";
import type { ColumnMap, ColumnMapValidationError } from "./types.js";

type DetectedRole = "date" | "description" | "amount" | "debit" | "credit" | "currency";

const NAMES: Record<DetectedRole, readonly string[]> = {
  date: DATE_HEADERS,
  description: DESCRIPTION_HEADERS,
  amount: AMOUNT_HEADERS,
  debit: DEBIT_HEADERS,
  credit: CREDIT_HEADERS,
  currency: CURRENCY_HEADERS,
};

interface Entry {
  role: DetectedRole | null;
  cell: string;
}

interface HeaderModel {
  header: string[];
  expected: ResolvedColumns;
}

/** Index of the description entry whose name is earliest in the list; leftmost among equals. */
function firstDescriptionByListOrder(entries: readonly Entry[]): number {
  let best = -1;
  let bestRank = Number.POSITIVE_INFINITY;
  entries.forEach((entry, index) => {
    if (entry.role !== "description") {
      return;
    }
    const rank = DESCRIPTION_HEADERS.indexOf(entry.cell.trim().toLowerCase());
    if (rank < bestRank) {
      best = index;
      bestRank = rank;
    }
  });
  return best;
}

function spelled(role: DetectedRole): fc.Arbitrary<Entry> {
  return headerSpellingArbitrary(NAMES[role]).map((cell) => ({ role, cell }));
}

/**
 * A header written with random case and whitespace, plus the columns it must resolve to. It has
 * unrecognised columns mixed in, later duplicates of recognised columns (the leftmost must win),
 * and the extras that exercise the layout rules: an amount column next to debit and credit, or a
 * lone debit or credit column next to an amount.
 */
const headerModelArbitrary: fc.Arbitrary<HeaderModel> = fc
  .record({
    layout: fc.constantFrom<"signed-amount" | "debit-credit">("signed-amount", "debit-credit"),
    withCurrency: fc.boolean(),
    extra: fc.constantFrom("none", "amount", "debit", "credit"),
    noise: fc.array(unrecognisedHeaderCellArbitrary, { maxLength: 4 }),
    duplicateChoices: fc.array(fc.nat(), { maxLength: 4 }),
  })
  .chain(({ layout, withCurrency, extra, noise, duplicateChoices }) => {
    const roles: DetectedRole[] =
      layout === "debit-credit"
        ? ["date", "description", "debit", "credit"]
        : ["date", "description", "amount"];
    if (withCurrency) {
      roles.push("currency");
    }
    // Extras that must not change the layout: amount beside debit+credit, a lone debit/credit beside amount.
    if (layout === "debit-credit" && extra === "amount") {
      roles.push("amount");
    }
    if (layout === "signed-amount" && (extra === "debit" || extra === "credit")) {
      roles.push(extra);
    }
    return fc
      .tuple(...roles.map(spelled))
      .chain((entries) => {
        const all: Entry[] = [...entries, ...noise.map((cell) => ({ role: null, cell }))];
        return fc.shuffledSubarray(all, { minLength: all.length, maxLength: all.length });
      })
      .chain((shuffled) =>
        fc
          .tuple(
            ...duplicateChoices.map((choice) => spelled(roles[choice % roles.length] ?? "date")),
          )
          .map((duplicates): HeaderModel => {
            const entries = [...shuffled, ...duplicates];
            const header = entries.map((entry) => entry.cell);
            const first = (role: DetectedRole): number => entries.findIndex((e) => e.role === role);
            // The description is the exception: the name earliest in the list wins (Req 11.7).
            const descriptionAt = firstDescriptionByListOrder(entries);
            const currency = withCurrency ? first("currency") : null;
            const expected: ResolvedColumns =
              layout === "debit-credit"
                ? {
                    layout,
                    date: first("date"),
                    description: descriptionAt,
                    debit: first("debit"),
                    credit: first("credit"),
                    currency,
                  }
                : {
                    layout,
                    date: first("date"),
                    description: descriptionAt,
                    amount: first("amount"),
                    currency,
                  };
            return { header, expected };
          }),
      );
  });

describe("column resolution properties", () => {
  it("P14: random case and surrounding whitespace on recognised header names do not change auto-detection (Req 2.10)", () => {
    fc.assert(
      fc.property(headerModelArbitrary, ({ header, expected }) => {
        expect(autoDetectColumns(header)).toEqual(expected);
      }),
      { numRuns: 500 },
    );
  });

  it("P14: the decorated header resolves exactly like its canonical lower-case, trimmed form", () => {
    fc.assert(
      fc.property(headerModelArbitrary, ({ header }) => {
        const canonical = header.map((cell) => cell.trim().toLowerCase());
        expect(autoDetectColumns(header)).toEqual(autoDetectColumns(canonical));
      }),
    );
  });

  it("P14: random case and whitespace on header names leave the parseStatement result unchanged (Req 2.10)", () => {
    fc.assert(
      fc.property(statementModelArbitrary(), (model) => {
        const options = parseOptionsOf(model);
        const decorated = parseStatement(renderStatement(model), options);
        const canonical = parseStatement(renderStatement(withCanonicalHeaders(model)), options);
        expect(decorated).toStrictEqual(canonical);

        // And it is the statement the model describes, so the header never went wrong silently.
        expect(decorated.status).toBe("mapped");
        if (decorated.status === "mapped") {
          expect(decorated.transactions).toEqual(expectedFromModel(model).transactions);
        }
      }),
      { numRuns: 400 },
    );
  });

  it("resolveColumnMap resolves existing names to their leftmost column and reports each other role once", () => {
    // Each of the three signed-layout roles is mapped to a header cell, a name that is not in
    // the header, or nothing at all.
    const header = fc.array(fc.constantFrom("A", "B", "C", "", " A", "Date", "Amount"), {
      minLength: 1,
      maxLength: 8,
    });
    const choice = fc.oneof(
      fc.record({ kind: fc.constant("cell" as const), at: fc.nat() }),
      fc.record({ kind: fc.constant("unknown" as const) }),
      fc.record({ kind: fc.constant("missing" as const) }),
    );
    fc.assert(
      fc.property(
        header,
        choice,
        choice,
        choice,
        (cells, dateChoice, descriptionChoice, amountChoice) => {
          const map: ColumnMap = {};
          const expectedErrors: ColumnMapValidationError[] = [];
          const expectedIndices: Partial<Record<"date" | "description" | "amount", number>> = {};
          const roles = [
            ["date", dateChoice],
            ["description", descriptionChoice],
            ["amount", amountChoice],
          ] as const;
          for (const [role, pick] of roles) {
            if (pick.kind === "cell") {
              const name = cells[pick.at % cells.length] ?? "";
              map[role] = name;
              expectedIndices[role] = cells.indexOf(name);
            } else if (pick.kind === "unknown") {
              map[role] = "Not in the header";
              expectedErrors.push({ role, column: "Not in the header", problem: "unknown-column" });
            } else {
              expectedErrors.push({ role, column: null, problem: "missing-mapping" });
            }
          }

          const result = resolveColumnMap(cells, map);
          if (expectedErrors.length > 0) {
            expect(result).toEqual({ ok: false, errors: expectedErrors });
          } else {
            expect(result).toEqual({
              ok: true,
              columns: {
                layout: "signed-amount",
                date: expectedIndices.date,
                description: expectedIndices.description,
                amount: expectedIndices.amount,
                currency: null,
              },
            });
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
