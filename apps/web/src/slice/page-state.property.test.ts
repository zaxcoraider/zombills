import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AnalysisOutcome } from "./logic/analyze-statement";
import type { PageError } from "./logic/messages";
import { INITIAL_PAGE_MODEL, pageReducer } from "./page-state";
import type { PageAction } from "./page-state";

const FACTS = {
  transactionCount: 3,
  rowErrorCount: 0,
  statement: {
    firstDate: "2026-01-02",
    lastDate: "2026-03-25",
    asOf: "2026-03-25",
    asOfSource: "statement" as const,
    currencies: ["USD"],
  },
  detectedCurrency: { code: "USD", source: "symbol" as const },
  detectedDateFormat: null,
  detectedSignConvention: null,
};

const outcomeArb: fc.Arbitrary<AnalysisOutcome> = fc.constantFrom<AnalysisOutcome>(
  { kind: "empty" },
  { kind: "parse-error", reason: "bad" },
  {
    kind: "columns-unreadable",
    columns: ["A"],
    found: { date: false, description: false, amount: false },
  },
  { kind: "no-transactions", rowErrorCount: 2 },
  { kind: "no-subscriptions", ...FACTS },
  { kind: "results", ...FACTS, subscriptions: [], totals: [] },
);

const errorArb: fc.Arbitrary<PageError> = fc.constantFrom<PageError>(
  { kind: "too-many-files" },
  { kind: "too-large" },
  { kind: "not-csv" },
  { kind: "unreadable-file" },
);

const runIdArb = fc.integer({ min: 0, max: 4 });

const actionArb: fc.Arbitrary<PageAction> = fc.oneof(
  fc.record({
    type: fc.constant("start" as const),
    runId: runIdArb,
    sourceName: fc.constantFrom("a.csv", "b.csv"),
  }),
  fc.record({ type: fc.constant("finish" as const), runId: runIdArb, outcome: outcomeArb }),
  fc.record({ type: fc.constant("fail" as const), runId: runIdArb, error: errorArb }),
  fc.record({
    type: fc.constant("reject" as const),
    sourceName: fc.constantFrom("a.csv", null),
    error: errorArb,
  }),
  fc.constant({ type: "reset" as const }),
);

const VIEW_KINDS = ["idle", "working", "results", "no-subscriptions", "error"];

describe("page reducer properties", () => {
  it("P15: one view at a time; ignored actions change nothing; reset gives idle", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 40 }), (actions) => {
        let model = INITIAL_PAGE_MODEL;
        for (const action of actions) {
          const before = model;
          model = pageReducer(before, action);

          expect(VIEW_KINDS).toContain(model.view.kind);
          expect(Object.keys(model).sort()).toEqual(["runId", "view"]);

          const working = before.view.kind === "working";
          if ((action.type === "start" || action.type === "reject") && working) {
            expect(model).toBe(before);
          }
          if (action.type === "finish" || action.type === "fail") {
            const applies = working && action.runId === before.runId;
            if (applies) expect(model.view.kind).not.toBe("working");
            else expect(model).toBe(before);
          }
          if (
            action.type === "reset" &&
            ["results", "no-subscriptions", "error"].includes(before.view.kind)
          ) {
            expect(model.view).toEqual({ kind: "idle" });
          }
        }
      }),
    );
  });
});
