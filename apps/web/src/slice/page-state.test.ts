import { describe, expect, expectTypeOf, it } from "vitest";
import usSigned from "../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./logic/analyze-statement";
import type {
  AnalysisOutcome,
  NoSubscriptionsOutcome,
  ResultsOutcome,
} from "./logic/analyze-statement";
import { answersMap, recordAnswer } from "./logic/graveyard";
import { classifySubscriptions } from "@zombills/core";
import type { ClassifiedSubscription } from "@zombills/core";
import type { HauntInput } from "./logic/haunt-view";
import type { PageError } from "./logic/messages";
import { queueOf, risingOrder } from "./logic/queue";
import { errorFromOutcome } from "./logic/messages";
import {
  APPLE_299,
  APPLE_99,
  GUESSED_AMAZON_PRIME,
  POSSESSED_TRIAL_TRAP,
  TRIAL_TRAP,
} from "./graveyard/test-fixtures";
import {
  INITIAL_PAGE_MODEL,
  initialPageModel,
  isLandingView,
  pageReducer,
  shouldAskBeforeLeaving,
} from "./page-state";
import type { MemoryModel, PageAction, PageModel, RisingModel } from "./page-state";

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
  view: { kind: "working", sourceName: "a.csv", origin: "landing" },
};
const RESULTS_MODEL: PageModel = {
  ...INITIAL_PAGE_MODEL,
  runId: 7,
  view: {
    kind: "results",
    sourceName: "a.csv",
    outcome: RESULTS,
    rising: RISING,
    carriedOver: 0,
  },
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
      expect(next.view).toEqual({
        kind: "working",
        sourceName: "b.csv",
        origin: model === IDLE ? "landing" : "other",
      });
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
    expect(next.view).toEqual({ kind: "working", sourceName: "a.csv", origin: "landing" });
  });
});

describe("pageReducer: start from the gate", () => {
  const CHIP = { target: "sample-chip", id: "uk-debit-credit.csv" } as const;
  const DROP = { target: "drop-zone" } as const;
  const graveyardIdle: PageModel = { ...IDLE, screen: "graveyard", focus: null };

  it("hands focus to the gate control from results and from the Graveyard view", () => {
    for (const model of [RESULTS_MODEL, graveyardIdle]) {
      const seq = (model.focus?.seq ?? 0) + 1;
      const chip = pageReducer(model, { type: "start", runId: 9, sourceName: "b", from: CHIP });
      expect(chip.focus).toEqual({ target: "sample-chip", id: "uk-debit-credit.csv", seq });
      const drop = pageReducer(model, { type: "start", runId: 9, sourceName: "b", from: DROP });
      expect(drop.focus).toEqual({ target: "drop-zone", id: null, seq });
      expect(drop.view).toEqual({ kind: "working", sourceName: "b", origin: "other" });
    }
  });

  it("issues no request from the Landing view", () => {
    for (const from of [CHIP, DROP]) {
      const next = pageReducer(IDLE, { type: "start", runId: 9, sourceName: "b", from });
      expect(next.focus).toBe(IDLE.focus);
      expect(next.view).toEqual({ kind: "working", sourceName: "b", origin: "landing" });
    }
  });

  it("without from keeps the focus request as today", () => {
    const next = pageReducer(RESULTS_MODEL, { type: "start", runId: 9, sourceName: "b" });
    expect(next.focus).toBe(RESULTS_MODEL.focus);
  });
});

describe("pageReducer: start origin", () => {
  const onGraveyard = (model: PageModel): PageModel => ({ ...model, screen: "graveyard" });
  const rows: [string, PageModel, "landing" | "other"][] = [
    ["idle, main", IDLE, "landing"],
    ["INITIAL_PAGE_MODEL", INITIAL_PAGE_MODEL, "landing"],
    ["results, main", RESULTS_MODEL, "other"],
    ["no-subscriptions, main", NO_SUBS_MODEL, "other"],
    ["error, main", ERROR_MODEL, "other"],
    ["idle, graveyard", onGraveyard(IDLE), "other"],
    ["results, graveyard", onGraveyard(RESULTS_MODEL), "other"],
    ["error, graveyard", onGraveyard(ERROR_MODEL), "other"],
  ];

  it.each(rows)("%s gives origin %s", (_name, model, origin) => {
    const next = pageReducer(model, { type: "start", runId: 9, sourceName: "b.csv" });
    expect(next.view).toEqual({ kind: "working", sourceName: "b.csv", origin });
    expect(next.screen).toBe("main");
  });
});

describe("isLandingView", () => {
  const views: PageModel["view"][] = [
    { kind: "idle" },
    { kind: "working", sourceName: "a.csv", origin: "landing" },
    { kind: "working", sourceName: "a.csv", origin: "other" },
    RESULTS_MODEL.view,
    NO_SUBS_MODEL.view,
    ERROR_MODEL.view,
  ];

  it("is true only on the main screen, for idle and for working from the Landing view", () => {
    for (const view of views) {
      for (const screen of ["main", "graveyard"] as const) {
        const expected =
          screen === "main" &&
          (view.kind === "idle" || (view.kind === "working" && view.origin === "landing"));
        expect(isLandingView({ view, screen })).toBe(expected);
      }
    }
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
    view: { kind: "working", sourceName: "a.csv", origin: "landing" },
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
    const working: PageModel = {
      ...base,
      view: { kind: "working", sourceName: "a.csv", origin: "landing" },
    };
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

  describe("Earlier records", () => {
    const REST = recordAnswer(
      recordAnswer([], GUESSED_AMAZON_PRIME, "still-using"),
      APPLE_99,
      "not-using",
    );
    const OTHER = recordAnswer(REST, APPLE_299, "still-using");
    const ALL_VIEWS: readonly [string, PageModel][] = [
      ["idle", IDLE],
      ["error", ERROR_MODEL],
      ["no-subscriptions", NO_SUBS_MODEL],
      ["results", { ...RESULTS_MODEL }],
    ];

    function openWith(model: PageModel, graveyard: PageModel["graveyard"]): PageModel {
      return onGraveyard({ ...model, graveyard });
    }

    it.each(ALL_VIEWS)(
      "unbury on an Earlier record in %s keeps its place and fields",
      (_, base) => {
        const open = openWith(base, OTHER);
        const id = APPLE_99.id;
        const next = pageReducer(open, { type: "unbury", id });
        const was = open.graveyard.find((record) => record.id === id);
        expect(next.graveyard.map((record) => record.id)).toEqual(open.graveyard.map((r) => r.id));
        expect(next.graveyard.find((record) => record.id === id)).toEqual({
          ...was,
          answer: "still-using",
          carriedOver: false,
        });
        expect(next.event).toEqual({ kind: "unburied", id });
        expect(next.focus).toEqual({ target: "resting-item", id, seq: open.focus!.seq + 1 });
        expect(next.view).toBe(open.view);
      },
    );

    it.each(ALL_VIEWS)("bury-after-all on an Earlier record in %s", (_, base) => {
      const open = openWith(base, OTHER);
      const id = APPLE_299.id;
      const next = pageReducer(open, { type: "bury-after-all", id });
      const was = open.graveyard.find((record) => record.id === id);
      expect(next.graveyard.map((record) => record.id)).toEqual(open.graveyard.map((r) => r.id));
      expect(next.graveyard.find((record) => record.id === id)).toEqual({
        ...was,
        answer: "not-using",
        carriedOver: false,
      });
      expect(next.event).toEqual({ kind: "buried", id });
      expect(next.focus).toEqual({ target: "tombstone", id, seq: open.focus!.seq + 1 });
    });

    it("keeps the cadenceAssumed flag and gives a guessed record no saving after all", () => {
      const open = openWith(IDLE, REST);
      const id = GUESSED_AMAZON_PRIME.id;
      const next = pageReducer(open, { type: "bury-after-all", id });
      const record = next.graveyard.find((candidate) => candidate.id === id);
      expect(record).toEqual(
        expect.objectContaining({
          answer: "not-using",
          cadenceAssumed: true,
          yearlySavingCents: null,
        }),
      );
    });

    it("an Earlier change leaves the Answers map and every other record unchanged (Req 7.5)", () => {
      const open = openWith(RESULTS_MODEL, OTHER);
      const next = pageReducer(open, { type: "unbury", id: APPLE_99.id });
      for (const record of open.graveyard) {
        if (record.id === APPLE_99.id) continue;
        expect(next.graveyard.find((candidate) => candidate.id === record.id)).toBe(record);
      }
      const currentIds = new Set(RESULTS.subscriptions.map((subscription) => subscription.id));
      const answers = (model: PageModel) =>
        model.graveyard.filter((record) => currentIds.has(record.id));
      expect(answers(next)).toEqual(answers(open));
    });

    it("returns the same model for the wrong answer, an unknown id or the main screen", () => {
      const open = openWith(IDLE, OTHER);
      expect(pageReducer(open, { type: "bury-after-all", id: APPLE_99.id })).toBe(open);
      expect(pageReducer(open, { type: "unbury", id: APPLE_299.id })).toBe(open);
      expect(pageReducer(open, { type: "unbury", id: "missing" })).toBe(open);
      const main: PageModel = { ...open, screen: "main" };
      expect(pageReducer(main, { type: "unbury", id: APPLE_99.id })).toBe(main);
      expect(pageReducer(main, { type: "bury-after-all", id: APPLE_299.id })).toBe(main);
    });
  });
});

const MEMORY_OFF: MemoryModel = {
  on: false,
  removal: null,
  loadNote: null,
  storageNote: null,
  leftOut: 0,
  restored: false,
};
const MEMORY_ON: MemoryModel = { ...MEMORY_OFF, on: true };

function withMemory(model: PageModel, memory: Partial<MemoryModel>): PageModel {
  return { ...model, memory: { ...model.memory, ...memory } };
}

describe("initialPageModel", () => {
  const RECORD = recordAnswer(INITIAL_PAGE_MODEL.graveyard, SUB, "not-using");

  it("empty: no Graveyard, Memory off, no removal, no notes", () => {
    const model = initialPageModel({ kind: "empty" });
    expect(model).toEqual({
      runId: 0,
      view: { kind: "idle" },
      graveyard: [],
      memory: MEMORY_OFF,
      screen: "main",
      event: null,
      focus: null,
    });
    expect(INITIAL_PAGE_MODEL).toEqual(model);
  });

  it("ok: the read Graveyard, Memory on, restored when it has records", () => {
    const model = initialPageModel({ kind: "ok", graveyard: RECORD, dropped: 0 });
    expect(model.graveyard).toBe(RECORD);
    expect(model.memory).toEqual({ ...MEMORY_ON, restored: true });
  });

  it("ok with an empty Graveyard is not restored", () => {
    const model = initialPageModel({ kind: "ok", graveyard: [], dropped: 0 });
    expect(model.memory).toEqual(MEMORY_ON);
  });

  it("ok with dropped records adds the dropped note", () => {
    const model = initialPageModel({ kind: "ok", graveyard: RECORD, dropped: 2 });
    expect(model.memory).toEqual({
      ...MEMORY_ON,
      restored: true,
      loadNote: { kind: "dropped", count: 2 },
    });
    const empty = initialPageModel({ kind: "ok", graveyard: [], dropped: 1 });
    expect(empty.memory).toEqual({ ...MEMORY_ON, loadNote: { kind: "dropped", count: 1 } });
  });

  it("unreadable: Memory off, a removal request and the unreadable note", () => {
    const model = initialPageModel({ kind: "unreadable" });
    expect(model.graveyard).toEqual([]);
    expect(model.memory).toEqual({
      ...MEMORY_OFF,
      removal: { seq: 1, reason: "unreadable" },
      loadNote: { kind: "unreadable" },
    });
  });

  it("newer: Memory off, no removal, the newer note", () => {
    const model = initialPageModel({ kind: "newer" });
    expect(model.graveyard).toEqual([]);
    expect(model.memory).toEqual({ ...MEMORY_OFF, loadNote: { kind: "newer" } });
  });
});

describe("pageReducer: set-memory", () => {
  it("on: turns Memory on, clears notes and leftOut, no event; waits for store-written", () => {
    const model = withMemory(RESULTS_MODEL, {
      loadNote: { kind: "newer" },
      storageNote: "write-failed",
      leftOut: 3,
      removal: { seq: 4, reason: "untick" },
    });
    const next = pageReducer(model, { type: "set-memory", on: true });
    expect(next.memory).toEqual({ ...MEMORY_ON, removal: { seq: 4, reason: "untick" } });
    expect(next.event).toBeNull();
    expect(next.graveyard).toBe(model.graveyard);
    expect(next.focus).toBe(model.focus);
  });

  it("on: is ignored when Memory is already on", () => {
    const model = withMemory(IDLE, MEMORY_ON);
    expect(pageReducer(model, { type: "set-memory", on: true })).toBe(model);
  });

  it("off: bumps the removal, keeps the Graveyard, announces not-kept", () => {
    const graveyard = recordAnswer(INITIAL_PAGE_MODEL.graveyard, SUB, "not-using");
    const model = withMemory(
      { ...RESULTS_MODEL, graveyard },
      {
        on: true,
        leftOut: 2,
        storageNote: "remove-failed",
        removal: { seq: 3, reason: "forget" },
      },
    );
    const next = pageReducer(model, { type: "set-memory", on: false });
    expect(next.memory).toEqual({
      ...MEMORY_OFF,
      removal: { seq: 4, reason: "untick" },
    });
    expect(next.event).toEqual({ kind: "memory", what: "not-kept" });
    expect(next.graveyard).toBe(graveyard);
  });

  it("off: the first removal is seq 1; a dropped note is cleared, other notes stay", () => {
    const dropped = withMemory(IDLE, { on: true, loadNote: { kind: "dropped", count: 2 } });
    expect(pageReducer(dropped, { type: "set-memory", on: false }).memory).toEqual({
      ...MEMORY_OFF,
      removal: { seq: 1, reason: "untick" },
    });
    const newer = withMemory(IDLE, { on: true, loadNote: { kind: "newer" } });
    expect(pageReducer(newer, { type: "set-memory", on: false }).memory.loadNote).toEqual({
      kind: "newer",
    });
  });

  it("off: is ignored when Memory is already off", () => {
    expect(pageReducer(IDLE, { type: "set-memory", on: false })).toBe(IDLE);
  });
});

describe("pageReducer: store-written", () => {
  const ON = withMemory(RESULTS_MODEL, { on: true, leftOut: 1 });

  it("turn-on gives the kept event and the new count, even with the same count", () => {
    const next = pageReducer(ON, { type: "store-written", leftOut: 1, reason: "turn-on" });
    expect(next).not.toBe(ON);
    expect(next.event).toEqual({ kind: "memory", what: "kept" });
    expect(next.memory.leftOut).toBe(1);
    const other = pageReducer(ON, { type: "store-written", leftOut: 4, reason: "turn-on" });
    expect(other.memory.leftOut).toBe(4);
    expect(other.event).toEqual({ kind: "memory", what: "kept" });
  });

  it("change with a rising count gives the left-out event", () => {
    const next = pageReducer(ON, { type: "store-written", leftOut: 2, reason: "change" });
    expect(next.memory.leftOut).toBe(2);
    expect(next.event).toEqual({ kind: "memory", what: "left-out" });
  });

  it("change with a falling count updates the count and keeps the event", () => {
    const next = pageReducer(ON, { type: "store-written", leftOut: 0, reason: "change" });
    expect(next.memory.leftOut).toBe(0);
    expect(next.event).toBe(ON.event);
  });

  it("load updates the count and gives no event", () => {
    const next = pageReducer(ON, { type: "store-written", leftOut: 3, reason: "load" });
    expect(next.memory.leftOut).toBe(3);
    expect(next.event).toBe(ON.event);
  });

  it("is ignored when the count is unchanged (change, load) or Memory is off", () => {
    expect(pageReducer(ON, { type: "store-written", leftOut: 1, reason: "change" })).toBe(ON);
    expect(pageReducer(ON, { type: "store-written", leftOut: 1, reason: "load" })).toBe(ON);
    const off = withMemory(ON, { on: false });
    expect(pageReducer(off, { type: "store-written", leftOut: 2, reason: "turn-on" })).toBe(off);
  });
});

describe("pageReducer: store-write-failed", () => {
  it("turns Memory off with a removal, a note and the write-failed event; focus stays", () => {
    const graveyard = recordAnswer(INITIAL_PAGE_MODEL.graveyard, SUB, "still-using");
    const model = withMemory({ ...RESULTS_MODEL, graveyard }, { on: true, leftOut: 2 });
    const next = pageReducer(model, { type: "store-write-failed" });
    expect(next.memory).toEqual({
      ...MEMORY_OFF,
      removal: { seq: 1, reason: "write-failed" },
      storageNote: "write-failed",
    });
    expect(next.event).toEqual({ kind: "memory", what: "write-failed" });
    expect(next.graveyard).toBe(graveyard);
    expect(next.focus).toBe(model.focus);
  });

  it("is ignored when Memory is off", () => {
    expect(pageReducer(IDLE, { type: "store-write-failed" })).toBe(IDLE);
  });
});

describe("pageReducer: store-remove-failed", () => {
  it("untick and forget give a new combined event object", () => {
    const base = withMemory(RESULTS_MODEL, { removal: { seq: 2, reason: "untick" } });
    const untick = pageReducer(
      { ...base, event: { kind: "memory", what: "not-kept" } },
      { type: "store-remove-failed", reason: "untick" },
    );
    expect(untick.memory.storageNote).toBe("remove-failed");
    expect(untick.event).toEqual({ kind: "memory", what: "not-kept", removeFailed: true });
    const before: PageModel = { ...base, event: { kind: "memory", what: "forgotten" } };
    const forget = pageReducer(before, { type: "store-remove-failed", reason: "forget" });
    expect(forget.event).toEqual({ kind: "memory", what: "forgotten", removeFailed: true });
    expect(forget.event).not.toBe(before.event);
  });

  it("unreadable keeps the event and sets the note", () => {
    const next = pageReducer(RESULTS_MODEL, { type: "store-remove-failed", reason: "unreadable" });
    expect(next.event).toBe(RESULTS_MODEL.event);
    expect(next.memory.storageNote).toBe("remove-failed");
  });

  it("write-failed is ignored", () => {
    expect(pageReducer(IDLE, { type: "store-remove-failed", reason: "write-failed" })).toBe(IDLE);
  });
});

describe("pageReducer: store-removed-elsewhere", () => {
  it("turns Memory off without a removal, keeps the Graveyard, gives no event", () => {
    const graveyard = recordAnswer(INITIAL_PAGE_MODEL.graveyard, SUB, "not-using");
    const model = withMemory(
      { ...RESULTS_MODEL, graveyard },
      {
        on: true,
        leftOut: 2,
        removal: { seq: 5, reason: "untick" },
      },
    );
    const next = pageReducer(model, { type: "store-removed-elsewhere" });
    expect(next.memory).toEqual({ ...MEMORY_OFF, removal: { seq: 5, reason: "untick" } });
    expect(next.graveyard).toBe(graveyard);
    expect(next.event).toBe(model.event);
  });

  it("is ignored when Memory is off", () => {
    expect(pageReducer(IDLE, { type: "store-removed-elsewhere" })).toBe(IDLE);
  });
});

describe("pageReducer: open-memory-settings", () => {
  it("opens the Graveyard from results on the main screen and focuses the checkbox", () => {
    const next = pageReducer(RESULTS_MODEL, { type: "open-memory-settings" });
    expect(next.screen).toBe("graveyard");
    expect(next.event).toBeNull();
    expect(next.focus).toEqual({
      target: "memory-checkbox",
      id: null,
      seq: RESULTS_MODEL.focus!.seq + 1,
    });
    expect(resultsOf(next).rising.stage).toEqual({ kind: "ask" });
  });

  it("is ignored off results, or when the Graveyard is already open", () => {
    for (const model of [IDLE, WORKING, NO_SUBS_MODEL, ERROR_MODEL]) {
      expect(pageReducer(model, { type: "open-memory-settings" })).toBe(model);
    }
    const open = onGraveyard(risingModel());
    expect(pageReducer(open, { type: "open-memory-settings" })).toBe(open);
  });
});

describe("pageReducer: Memory and the other actions", () => {
  const NOTED = withMemory(WORKING, {
    on: true,
    leftOut: 1,
    loadNote: { kind: "dropped", count: 1 },
    restored: true,
  });

  it("finish clears loadNote and restored for every outcome", () => {
    const outcomes: AnalysisOutcome[] = [RESULTS, NO_SUBS, { kind: "empty" }];
    for (const outcome of outcomes) {
      const next = pageReducer(NOTED, { type: "finish", runId: NOTED.runId, outcome });
      expect(next.memory).toEqual({ ...NOTED.memory, loadNote: null, restored: false });
    }
  });

  it("start, fail, reject, reset and the Rising actions leave Memory unchanged", () => {
    const noted = withMemory(RESULTS_MODEL, {
      on: true,
      loadNote: { kind: "newer" },
      restored: true,
    });
    const id = SUB.id;
    const actions: PageAction[] = [
      { type: "start", runId: 8, sourceName: "b.csv" },
      { type: "reject", sourceName: null, error: ERR },
      { type: "reset" },
      { type: "keep", id },
      { type: "bury", id, reducedMotion: true },
      { type: "skip", id },
      { type: "next" },
      { type: "open-graveyard" },
      { type: "back-to-rising" },
      { type: "back-to-start" },
      { type: "answer-now", id },
    ];
    for (const action of actions) {
      expect(pageReducer(noted, action).memory).toBe(noted.memory);
    }
    const working = withMemory(WORKING, { on: true, loadNote: { kind: "newer" } });
    const failed = pageReducer(working, { type: "fail", runId: working.runId, error: ERR });
    expect(failed.memory).toBe(working.memory);
  });
});

describe("pageReducer: forget", () => {
  const RECORDS = recordAnswer(recordAnswer([], APPLE_99, "not-using"), SUB, "still-using");
  const NOTES: Partial<MemoryModel> = {
    loadNote: { kind: "dropped", count: 2 },
    storageNote: "write-failed",
    leftOut: 3,
    restored: true,
  };

  it("in results empties the Graveyard, rebuilds the Queue and keeps the outcome", () => {
    const answered = onGraveyard({
      ...RESULTS_MODEL,
      graveyard: RECORDS,
      view: {
        ...RESULTS_MODEL.view,
        rising: { order: [SUB.id], stage: { kind: "rested", id: SUB.id } },
      } as PageModel["view"],
    });
    const open = withMemory(answered, { ...NOTES, on: true });
    const next = pageReducer(open, { type: "forget" });
    expect(next.graveyard).toEqual([]);
    expect(next.view).toEqual({
      ...open.view,
      rising: {
        order: risingOrder(RESULTS.subscriptions, RESULTS.statement),
        stage: { kind: "ask" },
      },
    });
    expect(queueOf(resultsOf(next).rising.order, next.graveyard)).toEqual([SUB.id]);
    expect(resultsOf(next).outcome).toBe(RESULTS);
    expect(next.screen).toBe("graveyard");
    expect(next.event).toEqual({ kind: "memory", what: "forgotten" });
    expect(next.focus).toEqual({
      target: "graveyard-heading",
      id: null,
      seq: open.focus!.seq + 1,
    });
    expect(next.memory).toEqual({
      on: false,
      removal: { seq: 1, reason: "forget" },
      loadNote: null,
      storageNote: null,
      leftOut: 0,
      restored: false,
    });
  });

  it("bumps removal whether Memory was on or off", () => {
    const off = withMemory(onGraveyard({ ...RESULTS_MODEL, graveyard: RECORDS }), {
      removal: { seq: 4, reason: "untick" },
    });
    expect(pageReducer(off, { type: "forget" }).memory.removal).toEqual({
      seq: 5,
      reason: "forget",
    });
    const on = withMemory(off, { on: true, removal: null });
    expect(pageReducer(on, { type: "forget" }).memory.removal).toEqual({
      seq: 1,
      reason: "forget",
    });
  });

  it("in idle with a restored Graveyard", () => {
    const open = withMemory(onGraveyard({ ...IDLE, graveyard: RECORDS }), {
      ...NOTES,
      on: true,
    });
    const next = pageReducer(open, { type: "forget" });
    expect(next.graveyard).toEqual([]);
    expect(next.view).toBe(open.view);
    expect(next.memory.on).toBe(false);
    expect(next.memory.restored).toBe(false);
    expect(next.event).toEqual({ kind: "memory", what: "forgotten" });
  });

  it("in no-subscriptions keeps the view", () => {
    const open = onGraveyard({ ...NO_SUBS_MODEL, graveyard: RECORDS });
    const next = pageReducer(open, { type: "forget" });
    expect(next.view).toBe(open.view);
    expect(next.graveyard).toEqual([]);
  });

  it("returns the same model off the Graveyard screen", () => {
    expect(pageReducer(RESULTS_MODEL, { type: "forget" })).toBe(RESULTS_MODEL);
    expect(pageReducer(IDLE, { type: "forget" })).toBe(IDLE);
  });
});

describe("pageReducer: re-attach (Req 6.9 row 1)", () => {
  const MUSIC_1099: ClassifiedSubscription = {
    ...APPLE_99,
    merchantKey: "apple",
    id: "sub:USD:monthly:1099:apple",
    currentAmountCents: 1099,
    yearlyCostCents: 13188,
  };
  const MUSIC_1199: ClassifiedSubscription = {
    ...APPLE_99,
    merchantKey: "apple",
    id: "sub:USD:monthly:*:apple",
    currentAmountCents: 1199,
    yearlyCostCents: 14388,
    priceHistory: [
      { date: "2026-01-02", amountCents: 1099 },
      { date: "2026-02-02", amountCents: 1199 },
      { date: "2026-03-02", amountCents: 1199 },
    ],
  };
  const OUTCOME: ResultsOutcome = {
    kind: "results",
    ...FACTS,
    subscriptions: [MUSIC_1199, GUESSED_AMAZON_PRIME],
    totals: [{ currency: "USD", totalCents: 1000 }],
  };
  const STORED = recordAnswer([], MUSIC_1099, "not-using");

  it("finish moves the record onto the new subscription and counts it", () => {
    const model = risingModel(OUTCOME, STORED);
    expect(model.graveyard).toEqual([
      expect.objectContaining({
        id: MUSIC_1199.id,
        answer: "not-using",
        carriedOver: true,
        currentAmountCents: 1199,
        yearlySavingCents: 14388,
      }),
    ]);
    expect(resultsOf(model).carriedOver).toBe(1);
  });

  it("labels the re-attached record zombie through answersMap, and it does not rise", () => {
    const model = risingModel(OUTCOME, STORED);
    const answers = answersMap(model.graveyard, OUTCOME.subscriptions);
    expect(answers.get(MUSIC_1199.id)).toBe("not-using");
    const classified = classifySubscriptions(OUTCOME.subscriptions, answers);
    expect(classified.find((s) => s.id === MUSIC_1199.id)?.labels).toContain("zombie");
    expect(queueOf(resultsOf(model).rising.order, model.graveyard)).toEqual([
      GUESSED_AMAZON_PRIME.id,
    ]);
  });

  it("sets carriedOver 0 when nothing moves", () => {
    expect(resultsOf(risingModel()).carriedOver).toBe(0);
  });

  it("forget resets carriedOver to 0", () => {
    const open = onGraveyard(risingModel(OUTCOME, STORED));
    expect(resultsOf(open).carriedOver).toBe(1);
    expect(resultsOf(pageReducer(open, { type: "forget" })).carriedOver).toBe(0);
  });

  it("unbury on a carried-over record gives carriedOver false", () => {
    const open = onGraveyard(risingModel(OUTCOME, STORED));
    const next = pageReducer(open, { type: "unbury", id: MUSIC_1199.id });
    expect(next.graveyard).toEqual([
      expect.objectContaining({ id: MUSIC_1199.id, answer: "still-using", carriedOver: false }),
    ]);
  });
});

describe("pageReducer: go-home (pro-polish Req 1.3, 1.11)", () => {
  const GO_HOME: PageAction = { type: "go-home" };
  const KEPT = pageReducer(risingModel(), { type: "keep", id: headOf(risingModel()) });
  const KEPT_GRAVEYARD = KEPT.graveyard;
  const MEMORY = { ...MEMORY_ON, leftOut: 2 };
  function filled(model: PageModel): PageModel {
    return { ...model, graveyard: KEPT_GRAVEYARD, memory: MEMORY };
  }

  it("leaves the Landing view unchanged", () => {
    expect(pageReducer(IDLE, GO_HOME)).toBe(IDLE);
  });

  it("leaves working unchanged in both origins", () => {
    const other: PageModel = {
      ...WORKING,
      view: { kind: "working", sourceName: "a.csv", origin: "other" },
    };
    expect(pageReducer(WORKING, GO_HOME)).toBe(WORKING);
    expect(pageReducer(other, GO_HOME)).toBe(other);
  });

  const leaving: [string, PageModel][] = [
    ["idle on graveyard", onGraveyard(filled(IDLE))],
    ["results on main", { ...KEPT, memory: MEMORY }],
    ["results on graveyard", onGraveyard({ ...KEPT, memory: MEMORY })],
    ["error on main", filled(ERROR_MODEL)],
    ["error on graveyard", onGraveyard(filled(ERROR_MODEL))],
    ["no-subscriptions on main", filled(NO_SUBS_MODEL)],
    ["no-subscriptions on graveyard", onGraveyard(filled(NO_SUBS_MODEL))],
  ];
  for (const [name, model] of leaving) {
    it(`goes home from ${name} and keeps the Graveyard and Memory`, () => {
      const next = pageReducer(model, GO_HOME);
      expect(next.view).toEqual({ kind: "idle" });
      expect(next.screen).toBe("main");
      expect(next.event).toBeNull();
      expect(next.focus).toEqual({
        target: "primary-action",
        id: null,
        seq: (model.focus?.seq ?? 0) + 1,
      });
      expect(next.graveyard).toEqual(model.graveyard);
      expect(next.graveyard.length).toBeGreaterThan(0);
      expect(next.memory).toEqual(model.memory);
      expect(isLandingView(next)).toBe(true);
    });
  }
});

describe("shouldAskBeforeLeaving (pro-polish Req 1.10)", () => {
  const OTHER_WORKING: PageModel = {
    ...WORKING,
    view: { kind: "working", sourceName: "a.csv", origin: "other" },
  };
  const views: [string, PageModel, boolean][] = [
    ["idle", IDLE, false],
    ["working", WORKING, false],
    ["working (other)", OTHER_WORKING, false],
    ["results", RESULTS_MODEL, true],
    ["error", ERROR_MODEL, false],
    ["no-subscriptions", NO_SUBS_MODEL, false],
  ];
  for (const [name, model, ask] of views) {
    for (const screen of ["main", "graveyard"] as const) {
      it(`is ${String(ask)} for ${name} on ${screen}`, () => {
        const onScreen: PageModel = { ...model, screen };
        expect(shouldAskBeforeLeaving(onScreen)).toBe(ask);
      });
    }
  }
});
