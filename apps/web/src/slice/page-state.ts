// Page state: one view at a time, replaced as a whole. Pure: no React, DOM or clock.
import type { UsageAnswer } from "@zombills/core";
import type {
  AnalysisOutcome,
  NoSubscriptionsOutcome,
  ResultsOutcome,
} from "./logic/analyze-statement";
import { EMPTY_GRAVEYARD, recordAnswer, refreshGraveyard } from "./logic/graveyard";
import type { Graveyard } from "./logic/graveyard";
import { errorFromOutcome } from "./logic/messages";
import type { PageError } from "./logic/messages";
import { answerNowInOrder, queueOf, risingOrder, skipInOrder } from "./logic/queue";

export type BurialPhase = "condemned" | "sinking" | "closing";

export type RisingStage =
  /** The Queue head's card asks "Still using this?"; "Every undead has an answer." when the Queue is empty */
  | { kind: "ask" }
  /** "Kept. It rests." on the card, "Next" shown */
  | { kind: "rested"; id: string }
  /** Burial sequence running; buttons aria-disabled */
  | { kind: "burying"; id: string; phase: BurialPhase }
  /** Tombstone risen, "Next" shown */
  | { kind: "buried"; id: string };

export interface RisingModel {
  /** Every Risen id, in Rising order as changed by skip and answer-now */
  order: readonly string[];
  stage: RisingStage;
}

export type PageView =
  | { kind: "idle" }
  | { kind: "working"; sourceName: string }
  | { kind: "results"; sourceName: string; outcome: ResultsOutcome; rising: RisingModel }
  | { kind: "no-subscriptions"; sourceName: string; outcome: NoSubscriptionsOutcome }
  | { kind: "error"; sourceName: string | null; error: PageError };

export type Screen = "main" | "graveyard";

/** The last haunt event, for the live region (Req 14.3). */
export type HauntEvent =
  /** `first` is true when entering results */
  | { kind: "card"; id: string; first: boolean }
  | { kind: "all-answered" }
  | { kind: "kept"; id: string }
  | { kind: "buried"; id: string }
  | { kind: "unburied"; id: string };

export type FocusTarget =
  /** Error and no-subscriptions heading, "No undead here." in the Rising */
  | "state-heading"
  | "drop-zone"
  | "card-heading"
  /** "Kept. It rests." */
  | "outcome"
  /** "Burying <name>" */
  | "stage"
  /** On the stage or in the Graveyard list */
  | "tombstone"
  /** "Every undead has an answer." */
  | "all-answered"
  | "graveyard-heading"
  | "resting-item";

export interface FocusRequest {
  target: FocusTarget;
  /** Subscription or record id for card-heading, outcome, stage, tombstone, resting-item */
  id: string | null;
  /** Increases on every request, so the same target can be focused again */
  seq: number;
}

export interface PageModel {
  /** The id of the latest accepted `start`; a `finish` or `fail` with another id is ignored */
  runId: number;
  view: PageView;
  /** Survives start, finish, reset; lost on reload (Req 9.7) */
  graveyard: Graveyard;
  screen: Screen;
  event: HauntEvent | null;
  focus: FocusRequest | null;
}

export type PageAction =
  | { type: "start"; runId: number; sourceName: string }
  | { type: "finish"; runId: number; outcome: AnalysisOutcome }
  | { type: "fail"; runId: number; error: PageError }
  | { type: "reject"; sourceName: string | null; error: PageError }
  | { type: "reset" }
  | { type: "keep"; id: string }
  | { type: "bury"; id: string; reducedMotion: boolean }
  | { type: "burial-step"; id: string; from: BurialPhase }
  | { type: "burial-finish"; id: string }
  | { type: "skip"; id: string }
  | { type: "next" }
  | { type: "open-graveyard" }
  | { type: "back-to-rising" }
  | { type: "back-to-start" }
  | { type: "answer-now"; id: string }
  | { type: "unbury"; id: string }
  | { type: "bury-after-all"; id: string };

export const INITIAL_PAGE_MODEL: PageModel = {
  runId: 0,
  view: { kind: "idle" },
  graveyard: EMPTY_GRAVEYARD,
  screen: "main",
  event: null,
  focus: null,
};

function viewFromOutcome(
  sourceName: string,
  outcome: Exclude<AnalysisOutcome, ResultsOutcome>,
): Exclude<PageView, { kind: "idle" | "working" | "results" }> {
  switch (outcome.kind) {
    case "no-subscriptions":
      return { kind: "no-subscriptions", sourceName, outcome };
    case "empty":
    case "parse-error":
    case "columns-unreadable":
    case "no-transactions":
      return { kind: "error", sourceName, error: errorFromOutcome(outcome) };
  }
}

/** A focus request with a `seq` one higher than the last one. */
function focusRequest(
  model: PageModel,
  target: FocusTarget,
  id: string | null = null,
): FocusRequest {
  return { target, id, seq: (model.focus?.seq ?? 0) + 1 };
}

/** Event and focus for showing the Queue head, the "all answered" state or the empty Rising. */
function headState(
  model: PageModel,
  rising: RisingModel,
  graveyard: Graveyard,
  first = true,
): Pick<PageModel, "event" | "focus"> {
  const head = queueOf(rising.order, graveyard)[0];
  if (head !== undefined) {
    return {
      event: { kind: "card", id: head, first },
      focus: focusRequest(model, "card-heading", head),
    };
  }
  if (rising.order.length > 0) {
    return { event: { kind: "all-answered" }, focus: focusRequest(model, "all-answered") };
  }
  return { event: null, focus: focusRequest(model, "state-heading") };
}

/** The page after a `finish`, `fail` or `reject` that shows a non-results view. */
function replaceView(model: PageModel, view: PageView): PageModel {
  return {
    runId: model.runId,
    view,
    graveyard: model.graveyard,
    screen: "main",
    event: null,
    focus: focusRequest(model, "state-heading"),
  };
}

function finishedModel(model: PageModel, sourceName: string, outcome: AnalysisOutcome): PageModel {
  if (outcome.kind !== "results") {
    return replaceView(model, viewFromOutcome(sourceName, outcome));
  }
  const graveyard = refreshGraveyard(model.graveyard, outcome.subscriptions);
  const rising: RisingModel = {
    order: risingOrder(outcome.subscriptions, outcome.statement),
    stage: { kind: "ask" },
  };
  return {
    runId: model.runId,
    view: { kind: "results", sourceName, outcome, rising },
    graveyard,
    screen: "main",
    ...headState(model, rising, graveyard),
  };
}

/** The Queue head's subscription when the Rising is on the main screen at `stage`, else null. */
function headSubscription(model: PageModel, id: string, stage: RisingStage["kind"]) {
  const { view } = model;
  if (view.kind !== "results" || model.screen !== "main") return null;
  const { rising, outcome } = view;
  if (rising.stage.kind !== stage) return null;
  if (queueOf(rising.order, model.graveyard)[0] !== id) return null;
  return outcome.subscriptions.find((candidate) => candidate.id === id) ?? null;
}

function withStage(model: PageModel, stage: RisingStage, rest: Partial<PageModel>): PageModel {
  const { view } = model;
  if (view.kind !== "results") return model;
  return { ...model, ...rest, view: { ...view, rising: { ...view.rising, stage } } };
}

function reachBuried(model: PageModel, id: string): PageModel {
  return withStage(
    model,
    { kind: "buried", id },
    { event: { kind: "buried", id }, focus: focusRequest(model, "tombstone", id) },
  );
}

/** The results view when the Rising is on the main screen, else null. */
function risingOf(model: PageModel) {
  const { view } = model;
  if (view.kind !== "results" || model.screen !== "main") return null;
  return view;
}

/** The results view when the Graveyard screen is open, else null. */
function graveyardResultsOf(model: PageModel) {
  const { view } = model;
  if (view.kind !== "results" || model.screen !== "graveyard") return null;
  return view;
}

/** The subscription of a Current record with `answer` on the Graveyard screen, else null. */
function currentRecordSubscription(model: PageModel, id: string, answer: UsageAnswer) {
  const view = graveyardResultsOf(model);
  if (view === null) return null;
  const record = model.graveyard.find((candidate) => candidate.id === id);
  if (record === undefined || record.answer !== answer) return null;
  return view.outcome.subscriptions.find((candidate) => candidate.id === id) ?? null;
}

const NEXT_PHASE: Record<BurialPhase, BurialPhase | null> = {
  condemned: "sinking",
  sinking: "closing",
  closing: null,
};

/** The running burial stage for `id` (in phase `from`, when given), else null. */
function burialOf(model: PageModel, id: string, from: BurialPhase | null) {
  const { view } = model;
  if (view.kind !== "results") return null;
  const { stage } = view.rising;
  if (stage.kind !== "burying" || stage.id !== id) return null;
  if (from !== null && stage.phase !== from) return null;
  return stage;
}

export function pageReducer(model: PageModel, action: PageAction): PageModel {
  const { view } = model;
  switch (action.type) {
    case "start":
      if (view.kind === "working") return model;
      return {
        ...model,
        runId: action.runId,
        view: { kind: "working", sourceName: action.sourceName },
        screen: "main",
        event: null,
      };
    case "finish":
      if (view.kind !== "working" || action.runId !== model.runId) return model;
      return finishedModel(model, view.sourceName, action.outcome);
    case "fail":
      if (view.kind !== "working" || action.runId !== model.runId) return model;
      return replaceView(model, {
        kind: "error",
        sourceName: view.sourceName,
        error: action.error,
      });
    case "reject":
      if (view.kind === "working") return model;
      return replaceView(model, {
        kind: "error",
        sourceName: action.sourceName,
        error: action.error,
      });
    case "reset":
      if (view.kind === "idle" || view.kind === "working") return model;
      return {
        ...model,
        view: { kind: "idle" },
        screen: "main",
        event: null,
        focus: focusRequest(model, "drop-zone"),
      };
    case "keep": {
      const subscription = headSubscription(model, action.id, "ask");
      if (subscription === null) return model;
      return withStage(
        {
          ...model,
          graveyard: recordAnswer(model.graveyard, subscription, "still-using"),
        },
        { kind: "rested", id: action.id },
        {
          event: { kind: "kept", id: action.id },
          focus: focusRequest(model, "outcome", action.id),
        },
      );
    }
    case "bury": {
      const subscription = headSubscription(model, action.id, "ask");
      if (subscription === null) return model;
      return withStage(
        {
          ...model,
          graveyard: recordAnswer(model.graveyard, subscription, "not-using"),
        },
        {
          kind: "burying",
          id: action.id,
          phase: action.reducedMotion ? "sinking" : "condemned",
        },
        { focus: focusRequest(model, "stage", action.id) },
      );
    }
    case "burial-step": {
      const stage = burialOf(model, action.id, action.from);
      if (stage === null) return model;
      const phase = NEXT_PHASE[stage.phase];
      if (phase === null) return reachBuried(model, action.id);
      return withStage(model, { kind: "burying", id: action.id, phase }, {});
    }
    case "burial-finish":
      if (burialOf(model, action.id, null) === null) return model;
      return reachBuried(model, action.id);
    case "skip": {
      const view = risingOf(model);
      if (view === null || view.rising.stage.kind !== "ask") return model;
      const queue = queueOf(view.rising.order, model.graveyard);
      if (queue.length < 2 || queue[0] !== action.id) return model;
      const rising: RisingModel = {
        ...view.rising,
        order: skipInOrder(view.rising.order, action.id),
      };
      const head = queueOf(rising.order, model.graveyard)[0] ?? action.id;
      return {
        ...model,
        view: { ...view, rising },
        event: { kind: "card", id: head, first: false },
        focus: focusRequest(model, "card-heading", head),
      };
    }
    case "next": {
      const view = risingOf(model);
      if (view === null) return model;
      const { kind } = view.rising.stage;
      if (kind !== "rested" && kind !== "buried") return model;
      const head = queueOf(view.rising.order, model.graveyard)[0];
      if (head === undefined) return model;
      return withStage(
        model,
        { kind: "ask" },
        {
          event: { kind: "card", id: head, first: false },
          focus: focusRequest(model, "card-heading", head),
        },
      );
    }
    case "open-graveyard": {
      if (model.screen !== "main") return model;
      const rest = { screen: "graveyard" as const, event: null };
      const opened = { ...model, ...rest, focus: focusRequest(model, "graveyard-heading") };
      return view.kind === "results" ? withStage(opened, { kind: "ask" }, {}) : opened;
    }
    case "back-to-rising": {
      const results = graveyardResultsOf(model);
      if (results === null) return model;
      const back = withStage({ ...model, screen: "main" }, { kind: "ask" }, {});
      return { ...back, ...headState(model, results.rising, model.graveyard, false) };
    }
    case "back-to-start":
      if (model.screen !== "graveyard" || view.kind === "results") return model;
      return {
        ...model,
        screen: "main",
        event: null,
        focus: focusRequest(model, view.kind === "idle" ? "drop-zone" : "state-heading"),
      };
    case "answer-now": {
      const results = graveyardResultsOf(model);
      if (results === null) return model;
      if (!queueOf(results.rising.order, model.graveyard).includes(action.id)) return model;
      const order = answerNowInOrder(results.rising.order, action.id);
      return {
        ...model,
        screen: "main",
        view: { ...results, rising: { order, stage: { kind: "ask" } } },
        event: { kind: "card", id: action.id, first: false },
        focus: focusRequest(model, "card-heading", action.id),
      };
    }
    case "unbury": {
      const subscription = currentRecordSubscription(model, action.id, "not-using");
      if (subscription === null) return model;
      return {
        ...model,
        graveyard: recordAnswer(model.graveyard, subscription, "still-using"),
        event: { kind: "unburied", id: action.id },
        focus: focusRequest(model, "resting-item", action.id),
      };
    }
    case "bury-after-all": {
      const subscription = currentRecordSubscription(model, action.id, "still-using");
      if (subscription === null) return model;
      return {
        ...model,
        graveyard: recordAnswer(model.graveyard, subscription, "not-using"),
        event: { kind: "buried", id: action.id },
        focus: focusRequest(model, "tombstone", action.id),
      };
    }
  }
}
