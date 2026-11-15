import type { ClassifiedSubscription } from "@zombills/core";
import { CADENCE_LABELS, formatDisplayDate } from "./logic/display-date";
import { priceRiseParts, trialParts } from "./logic/label-text";
import { Money, TextLine } from "./graveyard/money-text";

export function SubscriptionItem({ subscription }: { subscription: ClassifiedSubscription }) {
  const { merchant, currency, cadence, currentAmountCents, yearlyCostCents, priceHistory } =
    subscription;
  const guessed = subscription.evidence.cadenceAssumed;
  const ended = subscription.status === "ended";

  return (
    <li className="flex flex-col gap-2 rounded bg-fog p-4 text-bone">
      <strong>{merchant}</strong>
      {guessed ? (
        <>
          <span>Guessed from a single charge</span>
          <span>
            {CADENCE_LABELS[cadence]} · <Money cents={currentAmountCents} currency={currency} />
          </span>
          <span>
            about <Money cents={yearlyCostCents} currency={currency} /> a year (estimate)
          </span>
        </>
      ) : (
        <span>
          {CADENCE_LABELS[cadence]} · <Money cents={currentAmountCents} currency={currency} /> ·{" "}
          <Money cents={yearlyCostCents} currency={currency} /> a year
        </span>
      )}
      {ended ? (
        <span>Ended · last charged {formatDisplayDate(subscription.evidence.lastChargeDate)}</span>
      ) : null}
      {subscription.priceRise !== null ? (
        <TextLine parts={priceRiseParts(subscription.priceRise, currency)} />
      ) : null}
      {subscription.trial !== null ? (
        <TextLine parts={trialParts(subscription.trial, currency)} />
      ) : null}
      {priceHistory.length > 1 ? (
        <ol aria-label="Price history" className="flex flex-col gap-2">
          {priceHistory.map((point) => (
            <li key={`${point.date}:${point.amountCents}`}>
              {formatDisplayDate(point.date)}:{" "}
              <Money cents={point.amountCents} currency={currency} />
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}
