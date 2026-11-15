import { describe, expect, expectTypeOf, it } from "vitest";
import usSigned from "../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./logic/analyze-statement";
import type {
  AnalysisOutcome,
  NoSubscriptionsOutcome,
  ResultsOutcome,
} from "./logic/analyze-statement";
import { recordAnswer } from "./logic/graveyard";
import type { HauntInput } from "./logic/haunt-view";
import type { PageError } from "./logic/messages";
import { queueOf } from "./logic/queue";
import { errorFromOutcome } from "./logic/messages";
import {
  APPLE_299,
  APPLE_99,
  GUESSED_AMAZON_PRIME,
  POSSESSED_TRIAL_TRAP,
  TRIAL_TRAP,
} from "./graveyard/test-fixtures";
import { INITIAL_PAGE_MODEL, pageReducer } from "./page-state";
import type { PageModel, RisingModel } from "./page-state";

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

const SUB = TRIAL_TRAP;

const RESULTS: ResultsOutcome = {
  kind: "results",
  ...FACTS,
  subscriptions: [SUB],
  totals: [{ currency: "USD", totalCents: 1000 }],
};
const NO_SUBS: NoSubscriptionsOutcome = { kind: "no-subscriptions", ...FACTS };

const ERR: PageError = { kind: "not-csv" };

const RISING: RisingModel = { order: [SUB.id], stage: { kind: "ask" } };

const IDLE: PageModel = { ...INITIAL_PAGE_MODEL, runId: 3 };
const WORKING: PageModel = {
  ...INITIAL_PAGE_MODEL,
  runId: 7,
  view: { kind: "working", sourceName: "a.csv" },
};
const RESULTS_MODEL: PageModel = {
  ...INITIAL_PAGE_MODEL,
  runId: 7,
  view: { kind: "results", sourceName: "a.csv", outcome: RESULTS, rising: RISING },
  event: { kind: "card", id: SUB.id, first: true },
  focus: { target: "card-heading", id: SUB.id, seq: 1 },
};
const NO_SUBS_MODEL: PageModel = {
  ...INITIAL_PAGE_MODEL,
  runId: 7,
  view: { kind: "no-subscriptions", sourceName: "a.csv", outcome: NO_SUBS },
  focus: { target: "state-heading", id: null, seq: 1 },
};
const ERROR_MODEL: PageModel = {
  ...INITIAL_PAGE_MODEL,
  runId: 7,
  view: { kind: "error", sourceName: "a.csv", error: ERR },
  focus: { target: "state-heading", id: null, seq: 1 },
};
const NOT_WORKING = [IDLE, RESULTS_MODEL, NO_SUBS_MODEL, ERROR_MODEL];

describe("pageReducer: start", () => {
  it("starts from every view except working, taking the runId from the action", () => {
    for (const model of NOT_WORKING) {
      const next = pageReducer(model, { type: "start", runId: 9, sourceName: "b.csv" });
      expect(next.runId).toBe(9);
      expect(next.view).toEqual({ kind: "working", sourceName: "b.csv" });
      expect(next.screen).toBe("main");
      expect(next.event).toBeNull();
      expect(next.focus).toBe(model.focus);
    }
  });

  it("is ignored while working", () => {
    const next = pageReducer(WORKING, { type: "start", runId: 9, sourceName: "b.csv" });
    expect(next).toBe(WORKING);
  });

  it("starts from the initial model", () => {
    const next = pageReducer(INITIAL_PAGE_MODEL, { type: "start", runId: 1, sourceName: "a.csv" });
    expect(next.runId).toBe(1);
    expect(next.view).toEqual({ kind: "working", sourceName: "a.csv" });
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
      const next = pageReducer(WORKING, { type: "finish", runId: 7, outcome });
      expect(next.runId).toBe(7);
      expect(next.view).toEqual({
        kind: "error",
        sourceName: "a.csv",
        error: errorFromOutcome(outcome),
      });
      expect(next.event).toBeNull();
      expect(next.focus).toEqual({ target: "state-heading", id: null, seq: 1 });
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
      const next = pageReducer(model, { type: "reject", sourceName: null, error: ERR });
      expect(next.runId).toBe(model.runId);
      expect(next.view).toEqual({ kind: "error", sourceName: null, error: ERR });
      expect(next.event).toBeNull();
      expect(next.focus).toEqual({
        target: "state-heading",
        id: null,
        seq: (model.focus?.seq ?? 0) + 1,
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
      const next = pageReducer(model, { type: "reset" });
      expect(next.runId).toBe(7);
      expect(next.view).toEqual({ kind: "idle" });
      expect(next.screen).toBe("main");
      expect(next.event).toBeNull();
      expect(next.focus).toEqual({ target: "drop-zone", id: null, seq: 2 });
    }
  });

  it("leaves idle and working unchanged", () => {
    expect(pageReducer(IDLE, { type: "reset" })).toBe(IDLE);
    expect(pageReducer(WORKING, { type: "reset" })).toBe(WORKING);
  });
});

// Several subscriptions for the Rising actions; every fixture is active.
const MANY: ResultsOutcome = {
  kind: "results",
  ...FACTS,
  subscriptions: [TRIAL_TRAP, POSSESSED_TRIAL_TRAP, GUESSED_AMAZON_PRIME],
  totals: [{ currency: "USD", totalCents: 1000 }],
};

function risingModel(outcome: ResultsOutcome = MANY, graveyard = INITIAL_PAGE_MODEL.graveyard) {
  const working: PageModel = {
    ...INITIAL_PAGE_MODEL,
    graveyard,
    runId: 1,
    view: { kind: "working", sourceName: "a.csv" },
  };
  return pageReducer(working, { type: "finish", runId: 1, outcome });
}

function resultsOf(model: PageModel) {
  if (model.view.kind !== "results") throw new Error("expected results");
  return model.view;
}

function headOf(model: PageModel): string {
  const view = resultsOf(model);
  const head = queueOf(view.rising.order, model.graveyard)[0];
  if (head === undefined) throw new Error("empty Queue");
  return head;
}

describe("PageModel and the derived view", () => {
  it("PageModel is assignable to HauntInput", () => {
    expectTypeOf<PageModel>().toExtend<HauntInput>();
  });
});

describe("pageReducer: finish with results", () => {
  it("sets the Rising order, stage ask, the head card event and the focus", () => {
    const model = risingModel();
    const view = resultsOf(model);
    expect([...view.rising.order].sort()).toEqual(MANY.subscriptions.map((s) => s.id).sort());
    expect(view.rising.stage).toEqual({ kind: "ask" });
    const head = headOf(model);
    expect(model.event).toEqual({ kind: "card", id: head, first: true });
    expect(model.focus).toEqual({ target: "card-heading", id: head, seq: 1 });
    expect(model.screen).toBe("main");
  });

  it("gives every focus request a seq one higher than the last", () => {
    const first = risingModel();
    const reset = pageReducer(first, { type: "reset" });
    expect(reset.focus).toEqual({ target: "drop-zone", id: null, seq: 2 });
    const started = pageReducer(reset, { type: "start", runId: 2, sourceName: "b.csv" });
    expect(started.focus).toBe(reset.focus);
    const second = pageReducer(started, { type: "finish", runId: 2, outcome: MANY });
    expect(second.focus?.seq).toBe(3);
  });

  it("focuses state-heading and gives no event when there are no Risen", () => {
    const model = risingModel({ ...MANY, subscriptions: [] });
    expect(model.event).toBeNull();
    expect(model.focus).toMatchObject({ target: "state-heading", id: null });
    expect(resultsOf(model).rising.order).toEqual([]);
  });

  it("gives event and focus all-answered when all 4 US subscriptions are answered, never card(undefined)", () => {
    const outcome = analyzeStatement(usSigned);
    if (outcome.kind !== "results") throw new Error("us-signed.csv should give results");
    const risen = outcome.subscriptions.filter((s) => s.status === "active");
    expect(risen).toHaveLength(4);
    const graveyard = risen.reduce(
      (acc, sub) => recordAnswer(acc, sub, "still-using"),
      INITIAL_PAGE_MODEL.graveyard,
    );
    const model = risingModel(outcome, graveyard);
    expect(model.event).toEqual({ kind: "all-answered" });
    expect(model.focus).toMatchObject({ target: "all-answered", id: null });
    expect(JSON.stringify(model.focus)).not.toContain("undefined");
  });

  it("refreshes the Graveyard from the new outcome", () => {
    const stale = recordAnswer(INITIAL_PAGE_MODEL.graveyard, TRIAL_TRAP, "not-using");
    const refreshed = risingModel(
      {
        ...MANY,
        subscriptions: [{ ...TRIAL_TRAP, currentAmountCents: 1599, yearlyCostCents: 19188 }],
      },
      stale,
    );
    expect(refreshed.graveyard[0]).toMatchObject({ id: TRIAL_TRAP.id, currentAmountCents: 1599 });
  });

  it("keeps the Graveyard through reset and a second finish", () => {
    const first = risingModel();
    const kept = pageReducer(first, { type: "keep", id: headOf(first) });
    expect(kept.graveyard).toHaveLength(1);
    const reset = pageReducer(kept, { type: "reset" });
    expect(reset.graveyard).toBe(kept.graveyard);
    const started = pageReducer(reset, { type: "start", runId: 2, sourceName: "b.csv" });
    expect(started.graveyard).toBe(kept.graveyard);
    const second = pageReducer(started, { type: "finish", runId: 2, outcome: MANY });
    expect(second.graveyard).toEqual(kept.graveyard);
    expect(headOf(second)).not.toBe(kept.graveyard[0]?.id);
  });
});

describe("pageReducer: other outcomes, fail, reject, start, reset", () => {
  it("finish with a non-results outcome, fail and reject set screen main, event null, focus state-heading", () => {
    const base = { ...risingModel(), screen: "graveyard" as const };
    const working: PageModel = { ...base, view: { kind: "working", sourceName: "a.csv" } };
    for (const next of [
      pageReducer(working, { type: "finish", runId: 1, outcome: NO_SUBS }),
      pageReducer(working, { type: "fail", runId: 1, error: ERR }),
      pageReducer(base, { type: "reject", sourceName: null, error: ERR }),
    ]) {
      expect(next.screen).toBe("main");
      expect(next.event).toBeNull();
      expect(next.focus).toEqual({ target: "state-heading", id: null, seq: 2 });
      expect(next.graveyard).toBe(base.graveyard);
    }
  });

  it("start resets screen and event and leaves focus and Graveyard alone", () => {
    const model = { ...risingModel(), screen: "graveyard" as const };
    const next = pageReducer(model, { type: "start", runId: 5, sourceName: "c.csv" });
    expect(next.screen).toBe("main");
    expect(next.event).toBeNull();
    expect(next.focus).toBe(model.focus);
    expect(next.graveyard).toBe(model.graveyard);
  });
});

describe("pageReducer: keep", () => {
  it("records still-using and shows rested with the kept event and outcome focus", () => {
    const model = risingModel();
    const id = headOf(model);
    const next = pageReducer(model, { type: "keep", id });
    expect(next.graveyard).toEqual([expect.objectContaining({ id, answer: "still-using" })]);
    expect(resultsOf(next).rising.stage).toEqual({ kind: "rested", id });
    expect(next.event).toEqual({ kind: "kept", id });
    expect(next.focus).toEqual({ target: "outcome", id, seq: 2 });
  });

  it("is ignored for a non-head id, outside ask, off the main screen and outside results", () => {
    const model = risingModel();
    const head = headOf(model);
    const other = resultsOf(model).rising.order.find((id) => id !== head) ?? "";
    expect(pageReducer(model, { type: "keep", id: other })).toBe(model);
    expect(pageReducer(model, { type: "keep", id: "missing" })).toBe(model);
    const rested = pageReducer(model, { type: "keep", id: head });
    expect(pageReducer(rested, { type: "keep", id: head })).toBe(rested);
    const away: PageModel = { ...model, screen: "graveyard" };
    expect(pageReducer(away, { type: "keep", id: head })).toBe(away);
    expect(pageReducer(IDLE, { type: "keep", id: head })).toBe(IDLE);
  });
});

describe("pageReducer: bury and the burial steps", () => {
  it("records not-using and starts at condemned with stage focus", () => {
    const model = risingModel();
    const id = headOf(model);
    const next = pageReducer(model, { type: "bury", id, reducedMotion: false });
    expect(next.graveyard).toEqual([expect.objectContaining({ id, answer: "not-using" })]);
    expect(resultsOf(next).rising.stage).toEqual({ kind: "burying", id, phase: "condemned" });
    expect(next.event).toBe(model.event);
    expect(next.focus).toEqual({ target: "stage", id, seq: 2 });
  });

  it("starts at sinking with reducedMotion: true", () => {
    const model = risingModel();
    const id = headOf(model);
    const next = pageReducer(model, { type: "bury", id, reducedMotion: true });
    expect(resultsOf(next).rising.stage).toEqual({ kind: "burying", id, phase: "sinking" });
  });

  it("is ignored for a non-head id, outside ask and off the main screen", () => {
    const model = risingModel();
    const head = headOf(model);
    const other = resultsOf(model).rising.order.find((id) => id !== head) ?? "";
    expect(pageReducer(model, { type: "bury", id: other, reducedMotion: false })).toBe(model);
    const burying = pageReducer(model, { type: "bury", id: head, reducedMotion: false });
    expect(pageReducer(burying, { type: "bury", id: head, reducedMotion: false })).toBe(burying);
    const away: PageModel = { ...model, screen: "graveyard" };
    expect(pageReducer(away, { type: "bury", id: head, reducedMotion: false })).toBe(away);
  });

  it("steps condemned, sinking, closing, buried and then focuses the tombstone", () => {
    let model = risingModel();
    const id = headOf(model);
    model = pageReducer(model, { type: "bury", id, reducedMotion: false });
    const phases = ["condemned", "sinking", "closing"] as const;
    const expected = [
      { kind: "burying", id, phase: "sinking" },
      { kind: "burying", id, phase: "closing" },
      { kind: "buried", id },
    ];
    phases.forEach((from, index) => {
      const before = model;
      model = pageReducer(model, { type: "burial-step", id, from });
      expect(resultsOf(model).rising.stage).toEqual(expected[index]);
      if (index < 2) {
        expect(model.event).toBe(before.event);
        expect(model.focus).toBe(before.focus);
      }
    });
    expect(model.event).toEqual({ kind: "buried", id });
    expect(model.focus).toMatchObject({ target: "tombstone", id });
  });

  it("ignores burial-step with the wrong phase or id", () => {
    let model = risingModel();
    const id = headOf(model);
    model = pageReducer(model, { type: "bury", id, reducedMotion: false });
    expect(pageReducer(model, { type: "burial-step", id, from: "sinking" })).toBe(model);
    expect(pageReducer(model, { type: "burial-step", id: "other", from: "condemned" })).toBe(model);
    expect(pageReducer(INITIAL_PAGE_MODEL, { type: "burial-step", id, from: "condemned" })).toBe(
      INITIAL_PAGE_MODEL,
    );
  });

  it("burial-finish jumps to buried from every phase and is ignored after buried", () => {
    for (const reducedMotion of [false, true]) {
      const started = risingModel();
      const id = headOf(started);
      const burying = pageReducer(started, { type: "bury", id, reducedMotion });
      const done = pageReducer(burying, { type: "burial-finish", id });
      expect(resultsOf(done).rising.stage).toEqual({ kind: "buried", id });
      expect(done.event).toEqual({ kind: "buried", id });
      expect(done.focus).toMatchObject({ target: "tombstone", id });
      expect(pageReducer(done, { type: "burial-finish", id })).toBe(done);
    }
    const model = risingModel();
    expect(pageReducer(model, { type: "burial-finish", id: headOf(model) })).toBe(model);
  });

  it("ignores burial-finish for another id", () => {
    const started = risingModel();
    const id = headOf(started);
    const burying = pageReducer(started, { type: "bury", id, reducedMotion: false });
    expect(pageReducer(burying, { type: "burial-finish", id: "other" })).toBe(burying);
  });

  it("puts two Apple subscriptions of one merchant in the Rising under distinct ids", () => {
    const outcome: ResultsOutcome = { ...MANY, subscriptions: [APPLE_99, APPLE_299] };
    const model = risingModel(outcome);
    expect(resultsOf(model).rising.order).toHaveLength(2);
  });
});

function onGraveyard(model: PageModel): PageModel {
  return pageReducer(model, { type: "open-graveyard" });
}

describe("pageReducer: skip", () => {
  it("moves the head to the end and shows the new head", () => {
    const model = risingModel();
    const order = resultsOf(model).rising.order;
    const next = pageReducer(model, { type: "skip", id: order[0] ?? "" });
    expect(resultsOf(next).rising.order).toEqual([...order.slice(1), order[0]]);
    expect(resultsOf(next).rising.stage).toEqual({ kind: "ask" });
    expect(next.event).toEqual({ kind: "card", id: order[1], first: false });
    expect(next.focus).toEqual({ target: "card-heading", id: order[1], seq: 2 });
    expect(next.graveyard).toBe(model.graveyard);
  });

  it("is ignored for a non-head id, outside ask, off the main screen and outside results", () => {
    const model = risingModel();
    const order = resultsOf(model).rising.order;
    expect(pageReducer(model, { type: "skip", id: order[1] ?? "" })).toBe(model);
    expect(pageReducer(model, { type: "skip", id: "missing" })).toBe(model);
    const rested = pageReducer(model, { type: "keep", id: order[0] ?? "" });
    expect(pageReducer(rested, { type: "skip", id: order[1] ?? "" })).toBe(rested);
    const away: PageModel = { ...model, screen: "graveyard" };
    expect(pageReducer(away, { type: "skip", id: order[0] ?? "" })).toBe(away);
    expect(pageReducer(IDLE, { type: "skip", id: order[0] ?? "" })).toBe(IDLE);
  });

  it("is ignored on the last Queue member", () => {
    const model = risingModel(RESULTS);
    expect(pageReducer(model, { type: "skip", id: SUB.id })).toBe(model);
    const many = risingModel();
    const [first, second, third] = resultsOf(many).rising.order;
    const answered = pageReducer(pageReducer(many, { type: "keep", id: first ?? "" }), {
      type: "next",
    });
    const oneLeft = pageReducer(pageReducer(answered, { type: "keep", id: second ?? "" }), {
      type: "next",
    });
    expect(queueOf(resultsOf(oneLeft).rising.order, oneLeft.graveyard)).toEqual([third]);
    expect(pageReducer(oneLeft, { type: "skip", id: third ?? "" })).toBe(oneLeft);
  });
});

describe("pageReducer: next", () => {
  it("goes from rested to the next card", () => {
    const model = risingModel();
    const id = headOf(model);
    const rested = pageReducer(model, { type: "keep", id });
    const next = pageReducer(rested, { type: "next" });
    const head = headOf(next);
    expect(head).not.toBe(id);
    expect(resultsOf(next).rising.stage).toEqual({ kind: "ask" });
    expect(next.event).toEqual({ kind: "card", id: head, first: false });
    expect(next.focus).toEqual({ target: "card-heading", id: head, seq: rested.focus!.seq + 1 });
  });

  it("goes from buried to the next card", () => {
    const model = risingModel();
    const id = headOf(model);
    const burying = pageReducer(model, { type: "bury", id, reducedMotion: true });
    const buried = pageReducer(burying, { type: "burial-finish", id });
    const next = pageReducer(buried, { type: "next" });
    expect(resultsOf(next).rising.stage).toEqual({ kind: "ask" });
    expect(next.event).toMatchObject({ kind: "card", id: headOf(next) });
  });

  it("is ignored in ask, burying, with an empty Queue, off main and outside results", () => {
    const model = risingModel();
    expect(pageReducer(model, { type: "next" })).toBe(model);
    const id = headOf(model);
    const burying = pageReducer(model, { type: "bury", id, reducedMotion: false });
    expect(pageReducer(burying, { type: "next" })).toBe(burying);
    const single = risingModel(RESULTS);
    const rested = pageReducer(single, { type: "keep", id: SUB.id });
    expect(pageReducer(rested, { type: "next" })).toBe(rested);
    const away: PageModel = { ...rested, screen: "graveyard" };
    expect(pageReducer(away, { type: "next" })).toBe(away);
    expect(pageReducer(IDLE, { type: "next" })).toBe(IDLE);
  });
});

describe("pageReducer: open-graveyard", () => {
  it("opens the Graveyard screen from every view and focuses its heading", () => {
    for (const model of [IDLE, WORKING, RESULTS_MODEL, NO_SUBS_MODEL, ERROR_MODEL]) {
      const next = pageReducer(model, { type: "open-graveyard" });
      expect(next.screen).toBe("graveyard");
      expect(next.view.kind).toBe(model.view.kind);
      expect(next.event).toBeNull();
      expect(next.focus).toEqual({
        target: "graveyard-heading",
        id: null,
        seq: (model.focus?.seq ?? 0) + 1,
      });
      expect(next.graveyard).toBe(model.graveyard);
    }
  });

  it("keeps the record and sets stage ask in the middle of a burial", () => {
    const model = risingModel();
    const id = headOf(model);
    const burying = pageReducer(model, { type: "bury", id, reducedMotion: false });
    const next = pageReducer(burying, { type: "open-graveyard" });
    expect(next.graveyard).toEqual([expect.objectContaining({ id, answer: "not-using" })]);
    expect(resultsOf(next).rising.stage).toEqual({ kind: "ask" });
    expect(next.screen).toBe("graveyard");
  });

  it("sets stage ask from rested and buried", () => {
    const model = risingModel();
    const id = headOf(model);
    const rested = pageReducer(model, { type: "keep", id });
    expect(resultsOf(pageReducer(rested, { type: "open-graveyard" })).rising.stage).toEqual({
      kind: "ask",
    });
  });

  it("is ignored when the Graveyard screen is already open", () => {
    const open = onGraveyard(risingModel());
    expect(pageReducer(open, { type: "open-graveyard" })).toBe(open);
  });
});

describe("pageReducer: back-to-rising", () => {
  it("shows the Queue head again", () => {
    const open = onGraveyard(risingModel());
    const head = headOf(open);
    const next = pageReducer(open, { type: "back-to-rising" });
    expect(next.screen).toBe("main");
    expect(resultsOf(next).rising.stage).toEqual({ kind: "ask" });
    expect(next.event).toEqual({ kind: "card", id: head, first: false });
    expect(next.focus).toEqual({ target: "card-heading", id: head, seq: open.focus!.seq + 1 });
  });

  it("shows all-answered when the Queue is empty", () => {
    const answered = recordAnswer(INITIAL_PAGE_MODEL.graveyard, SUB, "still-using");
    const open = onGraveyard(risingModel(RESULTS, answered));
    const next = pageReducer(open, { type: "back-to-rising" });
    expect(next.event).toEqual({ kind: "all-answered" });
    expect(next.focus).toMatchObject({ target: "all-answered", id: null });
  });

  it("focuses state-heading with no Risen", () => {
    const empty: ResultsOutcome = { ...RESULTS, subscriptions: [] };
    const open = onGraveyard(risingModel(empty));
    const next = pageReducer(open, { type: "back-to-rising" });
    expect(next.event).toBeNull();
    expect(next.focus).toMatchObject({ target: "state-heading", id: null });
  });

  it("is ignored on the main screen and outside results", () => {
    const model = risingModel();
    expect(pageReducer(model, { type: "back-to-rising" })).toBe(model);
    const idleOpen = onGraveyard(IDLE);
    expect(pageReducer(idleOpen, { type: "back-to-rising" })).toBe(idleOpen);
  });
});

describe("pageReducer: back-to-start", () => {
  it("focuses drop-zone in idle", () => {
    const next = pageReducer(onGraveyard(IDLE), { type: "back-to-start" });
    expect(next.screen).toBe("main");
    expect(next.event).toBeNull();
    expect(next.focus).toMatchObject({ target: "drop-zone", id: null });
  });

  it("focuses state-heading in error and no-subscriptions", () => {
    for (const model of [ERROR_MODEL, NO_SUBS_MODEL]) {
      const next = pageReducer(onGraveyard(model), { type: "back-to-start" });
      expect(next.screen).toBe("main");
      expect(next.view).toBe(model.view);
      expect(next.focus).toMatchObject({ target: "state-heading", id: null });
    }
  });

  it("is ignored on the main screen and in results", () => {
    expect(pageReducer(IDLE, { type: "back-to-start" })).toBe(IDLE);
    const open = onGraveyard(risingModel());
    expect(pageReducer(open, { type: "back-to-start" })).toBe(open);
  });
});

describe("pageReducer: answer-now", () => {
  it("moves a Queue member to the front and shows its card", () => {
    const open = onGraveyard(risingModel());
    const order = resultsOf(open).rising.order;
    const id = order[2] ?? "";
    const next = pageReducer(open, { type: "answer-now", id });
    expect(next.screen).toBe("main");
    expect(resultsOf(next).rising.order).toEqual([id, order[0], order[1]]);
    expect(resultsOf(next).rising.stage).toEqual({ kind: "ask" });
    expect(next.event).toEqual({ kind: "card", id, first: false });
    expect(next.focus).toEqual({ target: "card-heading", id, seq: open.focus!.seq + 1 });
  });

  it("is ignored for an answered or unknown id, on main and outside results", () => {
    const base = risingModel();
    const answeredId = headOf(base);
    const open = onGraveyard(pageReducer(base, { type: "keep", id: answeredId }));
    expect(pageReducer(open, { type: "answer-now", id: answeredId })).toBe(open);
    expect(pageReducer(open, { type: "answer-now", id: "missing" })).toBe(open);
    const queued = headOf(open);
    expect(pageReducer(base, { type: "answer-now", id: queued })).toBe(base);
    const idleOpen = onGraveyard(IDLE);
    expect(pageReducer(idleOpen, { type: "answer-now", id: queued })).toBe(idleOpen);
  });
});

describe("pageReducer: unbury and bury-after-all", () => {
  function buriedOnGraveyard() {
    const model = risingModel();
    const id = headOf(model);
    const burying = pageReducer(model, { type: "bury", id, reducedMotion: true });
    const buried = pageReducer(burying, { type: "burial-finish", id });
    return { id, open: onGraveyard(buried) };
  }

  it("unbury records still-using with the unburied event and resting-item focus", () => {
    const { id, open } = buriedOnGraveyard();
    const next = pageReducer(open, { type: "unbury", id });
    expect(next.graveyard).toEqual([expect.objectContaining({ id, answer: "still-using" })]);
    expect(next.event).toEqual({ kind: "unburied", id });
    expect(next.focus).toEqual({ target: "resting-item", id, seq: open.focus!.seq + 1 });
    expect(next.screen).toBe("graveyard");
    expect(next.view).toBe(open.view);
  });

  it("bury-after-all records not-using with the buried event and tombstone focus", () => {
    const { id, open } = buriedOnGraveyard();
    const resting = pageReducer(open, { type: "unbury", id });
    const next = pageReducer(resting, { type: "bury-after-all", id });
    expect(next.graveyard).toEqual([expect.objectContaining({ id, answer: "not-using" })]);
    expect(next.event).toEqual({ kind: "buried", id });
    expect(next.focus).toEqual({ target: "tombstone", id, seq: resting.focus!.seq + 1 });
  });

  it("unbury then bury-after-all restores a deeply equal Graveyard", () => {
    const { id, open } = buriedOnGraveyard();
    const back = pageReducer(pageReducer(open, { type: "unbury", id }), {
      type: "bury-after-all",
      id,
    });
    expect(back.graveyard).toEqual(open.graveyard);
  });

  it("are ignored with the wrong answer, an unknown id, on main and outside results", () => {
    const { id, open } = buriedOnGraveyard();
    expect(pageReducer(open, { type: "bury-after-all", id })).toBe(open);
    expect(pageReducer(open, { type: "unbury", id: "missing" })).toBe(open);
    const resting = pageReducer(open, { type: "unbury", id });
    expect(pageReducer(resting, { type: "unbury", id })).toBe(resting);
    const main: PageModel = { ...open, screen: "main" };
    expect(pageReducer(main, { type: "unbury", id })).toBe(main);
    const idleOpen = onGraveyard(IDLE);
    expect(pageReducer(idleOpen, { type: "unbury", id })).toBe(idleOpen);
    expect(pageReducer(idleOpen, { type: "bury-after-all", id })).toBe(idleOpen);
  });

  it("ignores an Earlier record whose subscription is not in the current statement", () => {
    const earlier = recordAnswer(INITIAL_PAGE_MODEL.graveyard, APPLE_99, "not-using");
    const open = onGraveyard(risingModel(RESULTS, earlier));
    expect(pageReducer(open, { type: "unbury", id: APPLE_99.id })).toBe(open);
  });
});
