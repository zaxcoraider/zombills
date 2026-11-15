// Live-region text per page model (Req 1.6a, 14.3). Pure: no React, DOM or clock.
import type { ClassifiedSubscription } from "@zombills/core";
import type { HauntEvent, PageModel } from "../page-state";
import { CADENCE_LABELS } from "./display-date";
import { deriveHaunt } from "./haunt-view";
import type { HauntView } from "./haunt-view";
import { partsToText, priceRiseParts, trialParts } from "./label-text";
import { errorMessage } from "./messages";
import { formatMoney } from "./money";

/** "Still draining <amount> a year." per currency with a figure (Req 1.6a). */
function stillDrainingSentences(haunt: HauntView, locale?: string): string[] {
  return haunt.stillDraining.flatMap((entry) =>
    entry.remainingCents === null
      ? []
      : [`Still draining ${formatMoney(entry.remainingCents, entry.currency, locale)} a year.`],
  );
}

/**
 * The sentence read for a card: name, cadence and price, yearly cost, the question, then one
 * sentence per label (Req 14.3).
 */
export function cardSentence(
  subscription: ClassifiedSubscription,
  name: string,
  locale?: string,
): string {
  const { currency, cadence, currentAmountCents, yearlyCostCents } = subscription;
  const yearly = formatMoney(yearlyCostCents, currency, locale);
  const yearlyText = subscription.evidence.cadenceAssumed
    ? `about ${yearly} a year (estimate)`
    : `${yearly} a year`;
  const sentences = [
    `${name}. ${CADENCE_LABELS[cadence]}, ${formatMoney(currentAmountCents, currency, locale)}. ${yearlyText}. Still using this?`,
  ];
  if (subscription.priceRise !== null) {
    sentences.push(`${partsToText(priceRiseParts(subscription.priceRise, currency, locale))}.`);
  }
  if (subscription.trial !== null) {
    const trial = partsToText(trialParts(subscription.trial, currency, locale));
    if (trial !== "") sentences.push(`${trial}.`);
  }
  return sentences.join(" ");
}

function buriedSentence(haunt: HauntView, id: string, name: string, locale?: string): string {
  const record = haunt.tombstones.find((candidate) => candidate.id === id);
  if (record === undefined || record.yearlySavingCents === null) {
    return `${name} is buried. Saving unknown: guessed from one charge.`;
  }
  const saving = formatMoney(record.yearlySavingCents, record.currency, locale);
  const totals = haunt.savings
    .map((total) => formatMoney(total.totalCents, total.currency, locale))
    .join(", ");
  return `${name} is buried. Saves ${saving} a year. Saved per year: ${totals}.`;
}

function eventSentence(
  event: HauntEvent,
  haunt: HauntView,
  foundSentence: string,
  locale?: string,
): string {
  const name = (id: string): string => haunt.names.get(id) ?? "This subscription";
  const draining = stillDrainingSentences(haunt, locale);
  switch (event.kind) {
    case "card": {
      const subscription = haunt.byId.get(event.id);
      const card = subscription ? cardSentence(subscription, name(event.id), locale) : "";
      const parts = event.first ? [foundSentence, ...draining, card] : [card];
      return parts.filter((part) => part !== "").join(" ");
    }
    case "all-answered":
      return "Every undead has an answer.";
    case "kept":
      return `${name(event.id)} rests. Kept.`;
    case "buried":
      return [buriedSentence(haunt, event.id, name(event.id), locale), ...draining].join(" ");
    case "unburied":
      return [`${name(event.id)} is unburied and rests.`, ...draining].join(" ");
  }
}

/** Text for the always-mounted role="status" region. */
export function announcement(model: PageModel, locale?: string): string {
  const { view, event } = model;
  const haunt = deriveHaunt(model, locale);
  const found =
    view.kind === "results"
      ? `Found ${view.outcome.subscriptions.length} recurring ${view.outcome.subscriptions.length === 1 ? "charge" : "charges"}.`
      : "";
  if (event !== null) return eventSentence(event, haunt, found, locale);
  if (model.screen === "graveyard") return "Your graveyard.";
  switch (view.kind) {
    case "idle":
      return "";
    case "working":
      return `Reading ${view.sourceName}…`;
    case "results":
      return [found, ...stillDrainingSentences(haunt, locale), "No undead here."].join(" ");
    case "no-subscriptions":
      return "No recurring charges found.";
    case "error":
      return errorMessage(view.error).summary;
  }
}
