import { buttonVariant } from "./button-variants";
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
      {notes.map((note) => (
        <p key={note} className="text-caption sm:text-small text-bone/80">
          {note}
        </p>
      ))}
      <div className="flex flex-wrap gap-4">
        <button type="button" onClick={onStartAgain} {...buttonVariant("primary")}>
          Start again
        </button>
        {onOpenGraveyard !== undefined ? (
          <button type="button" onClick={onOpenGraveyard} {...buttonVariant("secondary")}>
            Open the graveyard
          </button>
        ) : null}
      </div>
    </div>
  );
}
