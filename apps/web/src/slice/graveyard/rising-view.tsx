// The Rising: the summary, the progress line and the stage where each undead card is asked.

import type { ClassifiedSubscription } from "@zombills/core";
import type { Dispatch } from "react";
import type { ResultsOutcome } from "../logic/analyze-statement";
import { assumedValueNotes } from "../logic/assumed-values";
import { formatDisplayDate } from "../logic/display-date";
import type { HauntView } from "../logic/haunt-view";
import type { PageAction, RisingModel } from "../page-state";
import { MEMORY_ON_LINE, MEMORY_SETTINGS, carriedOverLine } from "../logic/memory-text";
import { BurialStage } from "./burial-stage";
import { Money } from "./money-text";
import { useFocusRequest } from "./use-focus-request";

export interface RisingViewProps {
  sourceName: string;
  outcome: ResultsOutcome;
  rising: RisingModel;
  haunt: HauntView;
  /** Records re-attached to this statement's subscriptions (Req 6.8) */
  carriedOver: number;
  reduceMotion: boolean;
  /** true while Memory is on: shows the reminder and the Memory settings button */
  memoryOn: boolean;
  dispatch: Dispatch<PageAction>;
}

const NOT_INCLUDED_NOTE = "Ended subscriptions and guessed ones are not included in the total.";

const BUTTON_CLASS =
  "rounded border border-bone bg-fog px-4 py-2 text-bone aria-disabled:cursor-default";

function skippedClause(count: number): string {
  if (count === 0) return "";
  return count === 1
    ? " · 1 row skipped because it could not be read"
    : ` · ${count} rows skipped because they could not be read`;
}

function StatementSummary({
  sourceName,
  outcome,
}: {
  sourceName: string;
  outcome: ResultsOutcome;
}) {
  const notes = assumedValueNotes(outcome);
  const { firstDate, lastDate } = outcome.statement;
  const dates =
    firstDate !== null && lastDate !== null
      ? ` · ${formatDisplayDate(firstDate)} to ${formatDisplayDate(lastDate)}`
      : "";
  return (
    <>
      <p>
        {sourceName}
        {dates} · {outcome.transactionCount} transactions read
        {skippedClause(outcome.rowErrorCount)}
      </p>
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Ended subscriptions: "<Display name> · last charged <date>", no answer controls. */
export function EndedList({
  ended,
  names,
}: {
  ended: readonly ClassifiedSubscription[];
  names: ReadonlyMap<string, string>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {ended.map((subscription) => (
        <li key={subscription.id}>
          {names.get(subscription.id) ?? subscription.merchant} · last charged{" "}
          {formatDisplayDate(subscription.evidence.lastChargeDate)}
        </li>
      ))}
    </ul>
  );
}

function NoRisen({ haunt }: { haunt: HauntView }) {
  const headingRef = useFocusRequest("state-heading");
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-fog/95 p-6">
      <h3 ref={headingRef} tabIndex={-1} className="font-display text-3xl">
        No undead here.
      </h3>
      <p>Every recurring charge found has already stopped.</p>
      <EndedList ended={haunt.ended} names={haunt.names} />
    </div>
  );
}

function AllAnswered({ dispatch }: { dispatch: Dispatch<PageAction> }) {
  const noteRef = useFocusRequest("all-answered");
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl bg-fog/95 p-6">
      <p ref={noteRef} tabIndex={-1} className="font-display text-3xl">
        Every undead has an answer.
      </p>
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={() => dispatch({ type: "open-graveyard" })}
      >
        Visit the graveyard
      </button>
    </div>
  );
}

export function RisingView({
  sourceName,
  outcome,
  rising,
  haunt,
  carriedOver,
  reduceMotion,
  memoryOn,
  dispatch,
}: RisingViewProps) {
  const { stage } = rising;
  const head = haunt.queue[0] ?? null;
  const stageId = stage.kind === "ask" ? head : stage.id;
  const subscription = stageId === null ? undefined : haunt.byId.get(stageId);
  const record =
    stageId !== null && haunt.currentIds.has(stageId)
      ? (haunt.tombstones.find((r) => r.id === stageId) ?? null)
      : null;
  const noRisen = haunt.risen.length === 0;
  const burying = stage.kind === "burying";
  const showNext = stage.kind === "rested" || stage.kind === "buried" || burying;
  const queueEmpty = haunt.queue.length === 0;

  const onNext = () => {
    if (burying) return;
    dispatch(queueEmpty ? { type: "open-graveyard" } : { type: "next" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl bg-fog/95 p-6">
        <h2 className="text-xl font-bold">Recurring charges found</h2>
        <StatementSummary sourceName={sourceName} outcome={outcome} />
        {haunt.stillDraining.map((entry) => (
          <div key={entry.currency} className="flex flex-col gap-2">
            {entry.remainingCents !== null ? (
              <p>
                Still draining{" "}
                <span className="text-blood text-2xl font-semibold">
                  <Money cents={entry.remainingCents} currency={entry.currency} />
                </span>{" "}
                a year
              </p>
            ) : null}
            {entry.hasExcluded ? (
              <p>
                {entry.remainingCents === null ? `${entry.currency}: ` : ""}
                {NOT_INCLUDED_NOTE}
              </p>
            ) : null}
          </div>
        ))}
        {carriedOver > 0 ? <p>{carriedOverLine(carriedOver)}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p>
            {haunt.answeredCount} of {haunt.risen.length} answered
          </p>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => dispatch({ type: "open-graveyard" })}
          >
            Open the graveyard
          </button>
        </div>
        {memoryOn ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p>{MEMORY_ON_LINE}</p>
            <button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => dispatch({ type: "open-memory-settings" })}
            >
              {MEMORY_SETTINGS}
            </button>
          </div>
        ) : null}
      </div>
      {noRisen ? (
        <NoRisen haunt={haunt} />
      ) : stage.kind === "ask" && queueEmpty ? (
        <AllAnswered dispatch={dispatch} />
      ) : subscription !== undefined ? (
        <BurialStage
          key={subscription.id}
          subscription={subscription}
          record={record}
          displayName={haunt.names.get(subscription.id) ?? subscription.merchant}
          stage={stage}
          canSkip={haunt.queue.length > 1}
          reduceMotion={reduceMotion}
          dispatch={dispatch}
        />
      ) : null}
      {showNext && !noRisen ? (
        <div>
          <button
            type="button"
            className={BUTTON_CLASS}
            aria-disabled={burying ? "true" : undefined}
            onClick={onNext}
          >
            {queueEmpty ? "Visit the graveyard" : "Next"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
