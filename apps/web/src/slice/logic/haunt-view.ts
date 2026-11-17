// Derived view of the haunt: everything the screens show, computed from the page model. Pure.
import { classifySubscriptions } from "@zombills/core";
import type { ClassifiedSubscription, StatementInfo } from "@zombills/core";
import type { NoSubscriptionsOutcome, ResultsOutcome } from "./analyze-statement";
import {
  answersMap,
  displayNames,
  savingsTotals,
  settledGraveyard,
  stillDraining,
} from "./graveyard";
import type { AnswerRecord, Graveyard, StillDraining } from "./graveyard";
import { queueOf } from "./queue";
import type { CurrencyTotal } from "./totals";

/** The part of `PageModel` that `deriveHaunt` reads (task 6 checks that `PageModel` fits). */
export interface HauntInput {
  view: HauntInputView;
  graveyard: Graveyard;
}

export type HauntInputView =
  | { kind: "idle" }
  | { kind: "working" }
  | {
      kind: "results";
      outcome: ResultsOutcome;
      rising: {
        /** Every Risen id, in Rising order as changed by skip and answer-now */
        order: readonly string[];
        stage: { kind: string; id?: string };
      };
    }
  | { kind: "no-subscriptions"; outcome: NoSubscriptionsOutcome }
  | { kind: "error" };

export interface HauntView {
  /** null outside the results view */
  statement: StatementInfo | null;
  classified: readonly ClassifiedSubscription[]; // same order as outcome.subscriptions
  byId: ReadonlyMap<string, ClassifiedSubscription>;
  risen: readonly ClassifiedSubscription[]; // in Rising order
  ended: readonly ClassifiedSubscription[]; // Ended subscriptions with no Current record
  queue: readonly string[];
  answeredCount: number; // Risen with a Current record
  names: ReadonlyMap<string, string>;
  currentIds: ReadonlySet<string>;
  /** Records that are not Current records; every record outside the results view */
  earlierIds: ReadonlySet<string>;
  /** Current records re-attached from an earlier statement (Req 7.2) */
  carriedOverIds: ReadonlySet<string>;
  tombstones: readonly AnswerRecord[]; // Graveyard order
  kept: readonly AnswerRecord[]; // Graveyard order
  /** From the settled Graveyard */
  savings: readonly CurrencyTotal[];
  stillDraining: readonly StillDraining[];
  fogCleared: boolean;
  /** Currency for the "$0.00" counter line, or null (Req 6.2) */
  counterFallbackCurrency: string | null;
}

/** Id of the record whose Burial sequence is running, or null. */
function buryingIdOf(view: HauntInputView): string | null {
  if (view.kind !== "results") return null;
  const { stage } = view.rising;
  return stage.kind === "burying" && stage.id !== undefined ? stage.id : null;
}

export function deriveHaunt(input: HauntInput, locale?: string): HauntView {
  const { view, graveyard } = input;
  const outcome = view.kind === "results" || view.kind === "no-subscriptions" ? view.outcome : null;
  const statement = outcome ? outcome.statement : null;
  // A no-subscriptions outcome has no subscriptions at all, not even Ended ones.
  const subscriptions = view.kind === "results" ? view.outcome.subscriptions : [];
  const currencyTotals = view.kind === "results" ? view.outcome.totals : [];

  // The Answers map uses every record, so the card shows "Zombie" during the sink (Req 5.3).
  const answers = answersMap(graveyard, subscriptions);
  const classified = classifySubscriptions(subscriptions, answers);
  const byId = new Map(classified.map((subscription) => [subscription.id, subscription]));
  const currentIds = new Set(answers.keys());

  const order = view.kind === "results" ? view.rising.order : [];
  const risen = order.flatMap((id) => {
    const subscription = byId.get(id);
    return subscription ? [subscription] : [];
  });
  const ended = classified.filter(
    (subscription) => subscription.status === "ended" && !currentIds.has(subscription.id),
  );
  const queue = view.kind === "results" ? queueOf(order, graveyard) : [];
  const answeredCount = risen.filter((subscription) => currentIds.has(subscription.id)).length;

  const names = displayNames([...graveyard, ...risen], locale);
  const settled = settledGraveyard(graveyard, buryingIdOf(view));
  const tombstones = graveyard.filter((record) => record.answer === "not-using");
  const kept = graveyard.filter((record) => record.answer === "still-using");
  const savings = savingsTotals(settled);

  return {
    statement,
    classified,
    byId,
    risen,
    ended,
    queue,
    answeredCount,
    names,
    currentIds,
    earlierIds: new Set(
      graveyard.filter((record) => !currentIds.has(record.id)).map((record) => record.id),
    ),
    carriedOverIds: new Set(
      graveyard
        .filter((record) => record.carriedOver && currentIds.has(record.id))
        .map((record) => record.id),
    ),
    tombstones,
    kept,
    savings,
    stillDraining: statement ? stillDraining(currencyTotals, settled, subscriptions) : [],
    fogCleared: settled.some((record) => record.answer === "not-using"),
    counterFallbackCurrency: statement ? (statement.currencies[0] ?? null) : null,
  };
}
