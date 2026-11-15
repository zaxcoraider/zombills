import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  EMPTY_CSV_REASON,
  NO_CONTENT_ROWS_REASON,
  classifySubscriptions,
  detectSubscriptions,
  normalizeTransactions,
  parseStatement,
} from "@zombills/core";
import { analyzeStatement } from "./analyze-statement";
import { csvLikeArb } from "./test-arbitraries";

const KINDS = [
  "empty",
  "parse-error",
  "columns-unreadable",
  "no-transactions",
  "no-subscriptions",
  "results",
];

describe("analyzeStatement", () => {
  it("P1: never throws and returns one of the six kinds", () => {
    const sources: fc.Arbitrary<string>[] = [
      fc.string(),
      fc.string({ unit: "binary" }),
      // U+0000 and lone surrogates, which the `binary` unit never produces
      fc.string({ unit: fc.constantFrom("\uD800", "\uDFFF", "\u0000", "a", ",") }),
      csvLikeArb,
    ];
    for (const source of sources) {
      fc.assert(
        fc.property(source, (csv) => {
          expect(KINDS).toContain(analyzeStatement(csv).kind);
        }),
        { numRuns: 300 },
      );
    }
  });

  it("P2: is deterministic", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), csvLikeArb), (csv) => {
        expect(analyzeStatement(csv)).toEqual(analyzeStatement(csv));
      }),
    );
  });

  it("P3: returns the classified detector subscriptions, with every detector field unchanged", () => {
    let results = 0;
    fc.assert(
      fc.property(csvLikeArb, (csv) => {
        const outcome = analyzeStatement(csv);
        if (outcome.kind !== "results") return;
        results += 1;
        const parsed = parseStatement(csv);
        if (parsed.status !== "mapped") throw new Error("results outcome needs a mapped parse");
        const detected = detectSubscriptions(
          normalizeTransactions(parsed.transactions),
        ).subscriptions;
        expect(outcome.subscriptions).toEqual(classifySubscriptions(detected));
        // The classifier owns priceRise, trial and labels; nothing else may change, order included.
        const without = (s: object, keys: string[]) =>
          Object.fromEntries(Object.entries(s).filter(([key]) => !keys.includes(key)));
        const stripped = outcome.subscriptions.map((s) =>
          without(s, ["priceRise", "trial", "labels"]),
        );
        const original = detected.map((s) => without(s, ["labels"]));
        expect(stripped).toEqual(original);
      }),
    );
    // csvLikeArb has to reach "results" for P3 to test anything
    expect(results).toBeGreaterThan(0);
  });

  it("P4: kind matches the parser", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), csvLikeArb), (csv) => {
        const parsed = parseStatement(csv);
        const outcome = analyzeStatement(csv);
        const emptyReason =
          parsed.status === "error" &&
          (parsed.reason === EMPTY_CSV_REASON || parsed.reason === NO_CONTENT_ROWS_REASON);
        expect(outcome.kind === "empty").toBe(emptyReason);
        expect(outcome.kind === "columns-unreadable").toBe(parsed.status === "mapping-required");
        if (outcome.kind === "columns-unreadable" && parsed.status === "mapping-required") {
          expect(outcome.columns).toEqual(parsed.columns);
        }
      }),
    );
  });
});
