// Page state: one view at a time, replaced as a whole. Pure: no React, DOM or clock.
import type {
  AnalysisOutcome,
  NoSubscriptionsOutcome,
  ResultsOutcome,
} from "./logic/analyze-statement";
import { errorFromOutcome } from "./logic/messages";
import type { PageError } from "./logic/messages";

export type PageView =
  | { kind: "idle" }
  | { kind: "working"; sourceName: string }
  | { kind: "results"; sourceName: string; outcome: ResultsOutcome }
  | { kind: "no-subscriptions"; sourceName: string; outcome: NoSubscriptionsOutcome }
  | { kind: "error"; sourceName: string | null; error: PageError };

export interface PageModel {
  /** The id of the latest accepted `start`; a `finish` or `fail` with another id is ignored */
  runId: number;
  view: PageView;
}

export type PageAction =
  | { type: "start"; runId: number; sourceName: string }
  | { type: "finish"; runId: number; outcome: AnalysisOutcome }
  | { type: "fail"; runId: number; error: PageError }
  | { type: "reject"; sourceName: string | null; error: PageError }
  | { type: "reset" };

export const INITIAL_PAGE_MODEL: PageModel = { runId: 0, view: { kind: "idle" } };

function viewFromOutcome(sourceName: string, outcome: AnalysisOutcome): PageView {
  switch (outcome.kind) {
    case "results":
      return { kind: "results", sourceName, outcome };
    case "no-subscriptions":
      return { kind: "no-subscriptions", sourceName, outcome };
    case "empty":
    case "parse-error":
    case "columns-unreadable":
    case "no-transactions":
      return { kind: "error", sourceName, error: errorFromOutcome(outcome) };
  }
}

export function pageReducer(model: PageModel, action: PageAction): PageModel {
  const { view } = model;
  switch (action.type) {
    case "start":
      if (view.kind === "working") return model;
      return { runId: action.runId, view: { kind: "working", sourceName: action.sourceName } };
    case "finish":
      if (view.kind !== "working" || action.runId !== model.runId) return model;
      return { runId: model.runId, view: viewFromOutcome(view.sourceName, action.outcome) };
    case "fail":
      if (view.kind !== "working" || action.runId !== model.runId) return model;
      return {
        runId: model.runId,
        view: { kind: "error", sourceName: view.sourceName, error: action.error },
      };
    case "reject":
      if (view.kind === "working") return model;
      return {
        runId: model.runId,
        view: { kind: "error", sourceName: action.sourceName, error: action.error },
      };
    case "reset":
      if (view.kind === "idle" || view.kind === "working") return model;
      return { runId: model.runId, view: { kind: "idle" } };
  }
}
