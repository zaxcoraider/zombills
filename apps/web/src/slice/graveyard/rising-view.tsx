// The Rising: the summary, the progress line and the stage where each undead card is asked.

import type { ClassifiedSubscription } from "@zombills/core";
import type { Dispatch, ReactNode } from "react";
import type { ResultsOutcome } from "../logic/analyze-statement";
import { assumedValueNotes } from "../logic/assumed-values";
import { formatDisplayDate } from "../logic/display-date";
import type { HauntView } from "../logic/haunt-view";
import type { PageAction, RisingModel } from "../page-state";
import { buttonVariant } from "../button-variants";
import { MEMORY_ON_LINE, MEMORY_SETTINGS, carriedOverLine } from "../logic/memory-text";
import { progressCountsFor, progressDotsFor } from "../logic/progress-dots";
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
  /** The Statement disclosure, rendered after the Stage (Req 7.3) */
  statementSlot: ReactNode;
}

/**
 * Req 7.1, 7.3: one column below lg; at lg the Stage left, the summary and the slot right.
 * The first row is as tall as the summary and the second takes the rest of the Stage's height,
 * so the Statement disclosure sits right under the summary (Batch D #1). Phones keep the
 * 16 px gap (Req 7.4).
 */
const RISING_GRID =
  "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,22rem)] lg:grid-rows-[auto_1fr] lg:gap-6 lg:gap-x-8 lg:[grid-template-areas:'stage_summary''stage_statement']";
const SUMMARY_CARD =
  "flex flex-col gap-4 rounded-card bg-fog/95 p-4 sm:p-6 lg:self-start lg:[grid-area:summary]";
const STATEMENT_AREA = "min-w-0 lg:self-start lg:[grid-area:statement]";

const NOT_INCLUDED_NOTE = "Ended subscriptions and guessed ones are not included in the total.";

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
      {notes.map((note) => (
        <p key={note} className="text-caption sm:text-small text-bone/80">
          {note}
        </p>
      ))}
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
    <div className="flex flex-col gap-4 rounded-card bg-fog/95 p-6">
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
    <div className="flex flex-col items-start gap-4 rounded-card bg-fog/95 p-6">
      <p ref={noteRef} tabIndex={-1} className="font-display text-3xl">
        Every undead has an answer.
      </p>
      <button
        type="button"
        {...buttonVariant("primary")}
        onClick={() => dispatch({ type: "open-graveyard" })}
      >
        Visit the graveyard
      </button>
    </div>
  );
}

/** Progress dots, or the bar above 12 risen (Req 10.2). Hidden: the text carries the count. */
function ProgressMarks({
  outcome,
  currentIds,
}: {
  outcome: ResultsOutcome;
  currentIds: ReadonlySet<string>;
}) {
  const dots = progressDotsFor(outcome, currentIds);
  if (dots !== null) {
    if (dots.length === 0) return null;
    return (
      <span
        aria-hidden="true"
        data-progress-dots=""
        className="flex flex-nowrap items-center gap-[8px]"
      >
        {/* Fixed pixels, not rem: 12 dots stay 184 px wide at 200 % text (Req 12.9). */}
        {dots.map((dot) => (
          <span
            key={dot.id}
            data-answered={dot.answered ? "true" : "false"}
            className={`box-border block h-[8px] w-[8px] shrink-0 rounded-pill ${
              dot.answered ? "bg-moss" : "border border-bone/45"
            }`}
          />
        ))}
      </span>
    );
  }
  const { answered, risen } = progressCountsFor(outcome, currentIds);
  return (
    <span
      aria-hidden="true"
      data-progress-bar=""
      className="block h-2 w-24 shrink-0 overflow-hidden rounded-pill bg-bone/20"
    >
      <span
        data-progress-fill=""
        className="block h-full rounded-pill bg-moss"
        style={{ width: `${(answered / risen) * 100}%` }}
      />
    </span>
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
  statementSlot,
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
  // Inside the Helper panel (a fog Card) while buried; below the Stage, on the bare scene,
  // while rested or burying (Req 8.4).
  const nextInPanel = stage.kind === "buried";
  const nextButton = (
    <button
      type="button"
      {...buttonVariant("primary", { bare: !nextInPanel })}
      aria-disabled={burying || undefined}
      onClick={onNext}
    >
      {queueEmpty ? "Visit the graveyard" : "Next"}
    </button>
  );

  return (
    <div className={RISING_GRID}>
      <div data-rising-summary="" className={SUMMARY_CARD}>
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p>
              {haunt.answeredCount} of {haunt.risen.length} answered
            </p>
            <ProgressMarks outcome={outcome} currentIds={haunt.currentIds} />
          </div>
          <button
            type="button"
            {...buttonVariant("secondary")}
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
              {...buttonVariant("secondary")}
              onClick={() => dispatch({ type: "open-memory-settings" })}
            >
              {MEMORY_SETTINGS}
            </button>
          </div>
        ) : null}
      </div>
      <div data-rising-stage="" className="flex min-w-0 flex-col gap-4 lg:[grid-area:stage]">
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
            {...(nextInPanel ? { next: nextButton } : {})}
          />
        ) : null}
        {showNext && !nextInPanel && !noRisen ? <div>{nextButton}</div> : null}
      </div>
      <div data-rising-statement="" className={STATEMENT_AREA}>
        {statementSlot}
      </div>
    </div>
  );
}
