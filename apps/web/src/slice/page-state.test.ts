import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  AnalysisOutcome,
  NoSubscriptionsOutcome,
  ResultsOutcome,
} from "./logic/analyze-statement";
import type { PageError } from "./logic/messages";
import { errorFromOutcome } from "./logic/messages";
import { classifiedSubscriptionArb } from "./logic/test-arbitraries";
import { INITIAL_PAGE_MODEL, pageReducer } from "./page-state";
import type { PageModel } from "./page-state";

const FACTS = {
  transactionCount: 12,
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

const [SUB] = fc.sample(classifiedSubscriptionArb, { seed: 1, numRuns: 1 });
if (!SUB) throw new Error("no sample");

const RESULTS: ResultsOutcome = {
  kind: "results",
  ...FACTS,
  subscriptions: [SUB],
  totals: [{ currency: "USD", totalCents: 1000 }],
};
const NO_SUBS: NoSubscriptionsOutcome = { kind: "no-subscriptions", ...FACTS };

const ERR: PageError = { kind: "not-csv" };

const IDLE: PageModel = { runId: 3, view: { kind: "idle" } };
const WORKING: PageModel = { runId: 7, view: { kind: "working", sourceName: "a.csv" } };
const RESULTS_MODEL: PageModel = {
  runId: 7,
  view: { kind: "results", sourceName: "a.csv", outcome: RESULTS },
};
const NO_SUBS_MODEL: PageModel = {
  runId: 7,
  view: { kind: "no-subscriptions", sourceName: "a.csv", outcome: NO_SUBS },
};
const ERROR_MODEL: PageModel = {
  runId: 7,
  view: { kind: "error", sourceName: "a.csv", error: ERR },
};
const NOT_WORKING = [IDLE, RESULTS_MODEL, NO_SUBS_MODEL, ERROR_MODEL];

describe("pageReducer: start", () => {
  it("starts from every view except working, taking the runId from the action", () => {
    for (const model of NOT_WORKING) {
      expect(pageReducer(model, { type: "start", runId: 9, sourceName: "b.csv" })).toEqual({
        runId: 9,
        view: { kind: "working", sourceName: "b.csv" },
      });
    }
  });

  it("is ignored while working", () => {
    const next = pageReducer(WORKING, { type: "start", runId: 9, sourceName: "b.csv" });
    expect(next).toBe(WORKING);
  });

  it("starts from the initial model", () => {
    expect(
      pageReducer(INITIAL_PAGE_MODEL, { type: "start", runId: 1, sourceName: "a.csv" }),
    ).toEqual({ runId: 1, view: { kind: "working", sourceName: "a.csv" } });
  });
});

describe("pageReducer: finish", () => {
  it("shows results for a results outcome", () => {
    expect(pageReducer(WORKING, { type: "finish", runId: 7, outcome: RESULTS })).toEqual(
      RESULTS_MODEL,
    );
  });

  it("shows no-subscriptions for a no-subscriptions outcome", () => {
    expect(pageReducer(WORKING, { type: "finish", runId: 7, outcome: NO_SUBS })).toEqual(
      NO_SUBS_MODEL,
    );
  });

  it("shows an error through errorFromOutcome for each of the four error kinds", () => {
    const outcomes: AnalysisOutcome[] = [
      { kind: "empty" },
      { kind: "parse-error", reason: "bad quote" },
      {
        kind: "columns-unreadable",
        columns: ["A", "B"],
        found: { date: false, description: true, amount: false },
      },
      { kind: "no-transactions", rowErrorCount: 4 },
    ];
    for (const outcome of outcomes) {
      if (
        outcome.kind !== "empty" &&
        outcome.kind !== "parse-error" &&
        outcome.kind !== "columns-unreadable" &&
        outcome.kind !== "no-transactions"
      ) {
        throw new Error("unexpected kind");
      }
      expect(pageReducer(WORKING, { type: "finish", runId: 7, outcome })).toEqual({
        runId: 7,
        view: { kind: "error", sourceName: "a.csv", error: errorFromOutcome(outcome) },
      });
    }
    expect(
      pageReducer(WORKING, { type: "finish", runId: 7, outcome: { kind: "empty" } }).view,
    ).toMatchObject({ error: { kind: "empty-file" } });
  });

  it("ignores a stale finish while working", () => {
    expect(pageReducer(WORKING, { type: "finish", runId: 6, outcome: RESULTS })).toBe(WORKING);
  });

  it("ignores finish outside working", () => {
    for (const model of NOT_WORKING) {
      expect(pageReducer(model, { type: "finish", runId: model.runId, outcome: RESULTS })).toBe(
        model,
      );
    }
  });

  it("keeps no reference to the previous outcome after the view is replaced", () => {
    const next = pageReducer(RESULTS_MODEL, { type: "reset" });
    expect(JSON.stringify(next)).not.toContain(SUB.id);
    const restarted = pageReducer(next, { type: "start", runId: 8, sourceName: "c.csv" });
    expect(JSON.stringify(restarted)).not.toContain(SUB.id);
  });
});

describe("pageReducer: fail", () => {
  it("shows an error when the runId matches while working", () => {
    expect(pageReducer(WORKING, { type: "fail", runId: 7, error: ERR })).toEqual(ERROR_MODEL);
  });

  it("ignores a stale fail", () => {
    expect(pageReducer(WORKING, { type: "fail", runId: 6, error: ERR })).toBe(WORKING);
  });

  it("ignores fail outside working", () => {
    for (const model of NOT_WORKING) {
      expect(pageReducer(model, { type: "fail", runId: model.runId, error: ERR })).toBe(model);
    }
  });
});

describe("pageReducer: reject", () => {
  it("shows an error from every view except working, leaving runId unchanged", () => {
    for (const model of NOT_WORKING) {
      expect(pageReducer(model, { type: "reject", sourceName: null, error: ERR })).toEqual({
        runId: model.runId,
        view: { kind: "error", sourceName: null, error: ERR },
      });
    }
  });

  it("keeps the source name when given", () => {
    expect(pageReducer(IDLE, { type: "reject", sourceName: "x.txt", error: ERR }).view).toEqual({
      kind: "error",
      sourceName: "x.txt",
      error: ERR,
    });
  });

  it("is ignored while working", () => {
    expect(pageReducer(WORKING, { type: "reject", sourceName: null, error: ERR })).toBe(WORKING);
  });
});

describe("pageReducer: reset", () => {
  it("returns to idle from results, no-subscriptions and error", () => {
    for (const model of [RESULTS_MODEL, NO_SUBS_MODEL, ERROR_MODEL]) {
      expect(pageReducer(model, { type: "reset" })).toEqual({
        runId: 7,
        view: { kind: "idle" },
      });
    }
  });

  it("leaves idle and working unchanged", () => {
    expect(pageReducer(IDLE, { type: "reset" })).toBe(IDLE);
    expect(pageReducer(WORKING, { type: "reset" })).toBe(WORKING);
  });
});
