import { useMemo } from "react";
import type { Ref } from "react";
import type { ResultsOutcome } from "./logic/analyze-statement";
import { assumedValueNotes } from "./logic/assumed-values";
import { formatDisplayDate } from "./logic/display-date";
import { formatMoney } from "./logic/money";
import { groupForDisplay } from "./logic/totals";
import { SubscriptionItem } from "./subscription-item";

export interface ResultsViewProps {
  sourceName: string;
  outcome: ResultsOutcome;
  headingRef: Ref<HTMLHeadingElement>;
  onStartAgain: () => void;
}

function skippedClause(count: number): string {
  if (count === 0) return "";
  return count === 1
    ? " · 1 row skipped because it could not be read"
    : ` · ${count} rows skipped because they could not be read`;
}

export function ResultsView({ sourceName, outcome, headingRef, onStartAgain }: ResultsViewProps) {
  const { subscriptions, totals, statement } = outcome;
  const groups = useMemo(
    () => groupForDisplay(subscriptions, totals, statement.currencies),
    [subscriptions, totals, statement.currencies],
  );
  const notes = assumedValueNotes(outcome);
  const { firstDate, lastDate } = statement;
  const dates =
    firstDate !== null && lastDate !== null
      ? ` · ${formatDisplayDate(firstDate)} to ${formatDisplayDate(lastDate)}`
      : "";

  return (
    <div className="flex flex-col gap-4">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold">
        Recurring charges found
      </h2>
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
      {groups.map((group) => (
        <section key={group.currency} className="flex flex-col gap-4">
          <h3 className="text-lg font-bold">{group.currency}</h3>
          <ul className="flex flex-col gap-2">
            {group.subscriptions.map((subscription) => (
              <SubscriptionItem key={subscription.id} subscription={subscription} />
            ))}
          </ul>
          {group.total !== null ? (
            <p>
              Yearly total ({group.currency}):{" "}
              <span className="money">
                {formatMoney(group.total.totalCents, group.currency)}
              </span>
            </p>
          ) : null}
          {group.hasExcluded ? (
            <p>Ended subscriptions and guessed ones are not included in the total.</p>
          ) : null}
        </section>
      ))}
      <div>
        <button
          type="button"
          onClick={onStartAgain}
          className="rounded border border-bone bg-fog px-4 py-2 text-bone"
        >
          Start again
        </button>
      </div>
    </div>
  );
}
