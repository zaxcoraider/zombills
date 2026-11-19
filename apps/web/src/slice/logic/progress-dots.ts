// Progress dots next to "N of M answered" (pro-polish Req 10.2, 10.3). Pure.
import type { PageModel } from "../page-state";
import type { ResultsOutcome } from "./analyze-statement";
import { answersMap } from "./graveyard";
import { risingOrder } from "./queue";

/** More risen subscriptions than this show a bar instead of dots (Req 10.2). */
export const PROGRESS_DOTS_MAX = 12;

export interface ProgressDot {
  id: string;
  answered: boolean;
}

export interface ProgressCounts {
  answered: number;
  risen: number;
}

/** The ids with a Current record in a results model; null outside results. */
function resultsParts(
  model: PageModel,
): { outcome: ResultsOutcome; currentIds: ReadonlySet<string> } | null {
  if (model.view.kind !== "results") return null;
  const { outcome } = model.view;
  // The same Current-record test as deriveHaunt's answeredCount (answersMap keys).
  const currentIds = new Set(answersMap(model.graveyard, outcome.subscriptions).keys());
  return { outcome, currentIds };
}

/**
 * The dots for one results outcome, given the ids with a Current record (`HauntView.currentIds`).
 * Null when more than 12 have risen. Order: the original Rising order, not `rising.order`.
 */
export function progressDotsFor(
  outcome: ResultsOutcome,
  currentIds: ReadonlySet<string>,
): readonly ProgressDot[] | null {
  const order = risingOrder(outcome.subscriptions, outcome.statement);
  if (order.length > PROGRESS_DOTS_MAX) return null;
  return order.map((id) => ({ id, answered: currentIds.has(id) }));
}

/** "N of M answered" counts for one results outcome, given the ids with a Current record. */
export function progressCountsFor(
  outcome: ResultsOutcome,
  currentIds: ReadonlySet<string>,
): ProgressCounts {
  const order = risingOrder(outcome.subscriptions, outcome.statement);
  const answered = order.filter((id) => currentIds.has(id)).length;
  return { answered, risen: order.length };
}

/** Req 10.2, 10.3. Null when the Rising has more than 12 risen subscriptions (the bar is shown). */
export function progressDots(model: PageModel): readonly ProgressDot[] | null {
  const parts = resultsParts(model);
  return parts === null ? null : progressDotsFor(parts.outcome, parts.currentIds);
}

/** "N of M answered" counts for the dots or the bar; null outside results. */
export function progressCounts(model: PageModel): ProgressCounts | null {
  const parts = resultsParts(model);
  return parts === null ? null : progressCountsFor(parts.outcome, parts.currentIds);
}
