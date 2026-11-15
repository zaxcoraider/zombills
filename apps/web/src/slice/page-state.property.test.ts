import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AnalysisOutcome } from "./logic/analyze-statement";
import type { PageError } from "./logic/messages";
import { GUESSED_AMAZON_PRIME, POSSESSED_TRIAL_TRAP, TRIAL_TRAP } from "./graveyard/test-fixtures";
import { queueOf } from "./logic/queue";
import { INITIAL_PAGE_MODEL, pageReducer } from "./page-state";
import type { BurialPhase, PageAction, PageModel } from "./page-state";

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
  {
    kind: "results",
    ...FACTS,
    subscriptions: [TRIAL_TRAP, POSSESSED_TRIAL_TRAP, GUESSED_AMAZON_PRIME],
    totals: [{ currency: "USD", totalCents: 1000 }],
  },
);

const idArb = fc.constantFrom(
  TRIAL_TRAP.id,
  POSSESSED_TRIAL_TRAP.id,
  GUESSED_AMAZON_PRIME.id,
  "missing",
);
const phaseArb = fc.constantFrom<BurialPhase>("condemned", "sinking", "closing");

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
  fc.record({ type: fc.constant("keep" as const), id: idArb }),
  fc.record({ type: fc.constant("bury" as const), id: idArb, reducedMotion: fc.boolean() }),
  fc.record({ type: fc.constant("burial-step" as const), id: idArb, from: phaseArb }),
  fc.record({ type: fc.constant("burial-finish" as const), id: idArb }),
  fc.record({ type: fc.constant("skip" as const), id: idArb }),
  fc.constant({ type: "next" as const }),
  fc.constant({ type: "open-graveyard" as const }),
  fc.constant({ type: "back-to-rising" as const }),
  fc.constant({ type: "back-to-start" as const }),
  fc.record({ type: fc.constant("answer-now" as const), id: idArb }),
  fc.record({ type: fc.constant("unbury" as const), id: idArb }),
  fc.record({ type: fc.constant("bury-after-all" as const), id: idArb }),
);

const GRAVEYARD_KEEPING: readonly PageAction["type"][] = [
  "start",
  "fail",
  "reject",
  "reset",
  "open-graveyard",
  "back-to-rising",
  "back-to-start",
];

/**
 * An independent statement of each id-guard in the design's transition table: true when the
 * action must be accepted, false when it must return the same model object, null for other actions.
 */
function guardHolds(model: PageModel, action: PageAction): boolean | null {
  const { view } = model;
  const results = view.kind === "results" ? view : null;
  const queue = results === null ? [] : queueOf(results.rising.order, model.graveyard);
  const stage = results?.rising.stage;
  const inAsk = results !== null && model.screen === "main" && stage?.kind === "ask";
  const subscriptions = results?.outcome.subscriptions ?? [];
  const current = (id: string) => subscriptions.some((subscription) => subscription.id === id);
  const answerOf = (id: string) => model.graveyard.find((record) => record.id === id)?.answer;
  switch (action.type) {
    case "keep":
    case "bury":
      return inAsk && queue[0] === action.id;
    case "skip":
      return inAsk && queue[0] === action.id && queue.length > 1;
    case "burial-step":
      return stage?.kind === "burying" && stage.id === action.id && stage.phase === action.from;
    case "burial-finish":
      return stage?.kind === "burying" && stage.id === action.id;
    case "answer-now":
      return results !== null && model.screen === "graveyard" && queue.includes(action.id);
    case "unbury":
      return (
        results !== null &&
        model.screen === "graveyard" &&
        current(action.id) &&
        answerOf(action.id) === "not-using"
      );
    case "bury-after-all":
      return (
        results !== null &&
        model.screen === "graveyard" &&
        current(action.id) &&
        answerOf(action.id) === "still-using"
      );
    default:
      return null;
  }
}

const VIEW_KINDS = ["idle", "working", "results", "no-subscriptions", "error"];

describe("page reducer properties", () => {
  it("P7: one view at a time; ignored actions change nothing; reset gives idle", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 40 }), (actions) => {
        let model = INITIAL_PAGE_MODEL;
        for (const action of actions) {
          const before = model;
          model = pageReducer(before, action);

          expect(VIEW_KINDS).toContain(model.view.kind);
          expect("rising" in model.view).toBe(model.view.kind === "results");
          if (GRAVEYARD_KEEPING.includes(action.type)) {
            expect(model.graveyard).toBe(before.graveyard);
          }
          const guard = guardHolds(before, action);
          if (guard === false) expect(model).toBe(before);
          if (guard === true) expect(model).not.toBe(before);
          expect(Object.keys(model).sort()).toEqual([
            "event",
            "focus",
            "graveyard",
            "runId",
            "screen",
            "view",
          ]);

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
