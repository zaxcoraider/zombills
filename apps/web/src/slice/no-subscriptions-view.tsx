import { useFocusRequest } from "./graveyard/use-focus-request";
import type { NoSubscriptionsOutcome } from "./logic/analyze-statement";
import { assumedValueNotes } from "./logic/assumed-values";
import { formatDisplayDate } from "./logic/display-date";

export interface NoSubscriptionsViewProps {
  sourceName: string;
  outcome: NoSubscriptionsOutcome;
  onStartAgain: () => void;
  /** Set when the Graveyard has records: "Open the graveyard" follows "Start again". */
  onOpenGraveyard?: (() => void) | undefined;
}

export function NoSubscriptionsView({
  outcome,
  onStartAgain,
  onOpenGraveyard,
}: NoSubscriptionsViewProps) {
  const headingRef = useFocusRequest("state-heading");
  const { firstDate, lastDate } = outcome.statement;
  const dates =
    firstDate !== null && lastDate !== null
      ? ` between ${formatDisplayDate(firstDate)} and ${formatDisplayDate(lastDate)}`
      : "";
  const notes = assumedValueNotes(outcome);

  return (
    <div className="flex flex-col gap-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold">
        No undead here.
      </h2>
      <p>
        No recurring charges were found in the {outcome.transactionCount} transactions read
        {dates}. A statement covering 2 to 3 months or more finds more.
      </p>
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={onStartAgain}
          className="rounded border border-bone bg-fog px-4 py-2 text-bone"
        >
          Start again
        </button>
        {onOpenGraveyard !== undefined ? (
          <button
            type="button"
            onClick={onOpenGraveyard}
            className="rounded border border-bone bg-fog px-4 py-2 text-bone"
          >
            Open the graveyard
          </button>
        ) : null}
      </div>
    </div>
  );
}
