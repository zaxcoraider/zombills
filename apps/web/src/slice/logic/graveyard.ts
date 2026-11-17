import type { Cadence, Subscription, UsageAnswer } from "@zombills/core";
import { formatMoney } from "./money";
import { isCounted, type CurrencyTotal } from "./totals";

/** Glossary "Answer record". Holds no transaction, date, price history, description or evidence. */
export interface AnswerRecord {
  readonly id: string;
  readonly merchant: string;
  /** Subscription.serviceId: a Known service id, or null for generic and unidentified merchants (cancel-helper Req 9) */
  readonly serviceId: string | null;
  readonly currency: string;
  readonly cadence: Cadence;
  readonly currentAmountCents: number;
  readonly answer: UsageAnswer;
  readonly cadenceAssumed: boolean;
  /** yearlyCostCents; null when cadenceAssumed (saving unknown, Req 5.6) */
  readonly yearlySavingCents: number | null;
  /** true after a Re-attach until the answer changes (Glossary "Answer record", amended) */
  readonly carriedOver: boolean;
}

export const CADENCE_FACTOR: Readonly<Record<Cadence, number>> = {
  weekly: 52,
  monthly: 12,
  yearly: 1,
};

/** Req 2.4: null when cadenceAssumed, else currentAmountCents × Cadence factor. */
export function yearlySavingFor(
  record: Pick<AnswerRecord, "cadence" | "currentAmountCents" | "cadenceAssumed">,
): number | null {
  return record.cadenceAssumed ? null : record.currentAmountCents * CADENCE_FACTOR[record.cadence];
}

/** At most one record per id, in the order the answers were first given (Req 9.2). */
export type Graveyard = readonly AnswerRecord[];

export const EMPTY_GRAVEYARD: Graveyard = [];

/**
 * The record a subscription gets for an answer (Req 4.2, 5.2, 5.6). It reads only the nine fields
 * it copies, so no charge, date or description reaches a record (Req 9.1).
 */
export function answerRecordFor(subscription: Subscription, answer: UsageAnswer): AnswerRecord {
  const cadenceAssumed = subscription.evidence.cadenceAssumed;
  return {
    id: subscription.id,
    merchant: subscription.merchant,
    serviceId: subscription.serviceId,
    currency: subscription.currency,
    cadence: subscription.cadence,
    currentAmountCents: subscription.currentAmountCents,
    answer,
    cadenceAssumed,
    yearlySavingCents: cadenceAssumed ? null : subscription.yearlyCostCents,
    carriedOver: false,
  };
}

/** Replace the record with this id in place, or append one (Req 9.2). Used for record and change. */
export function recordAnswer(
  graveyard: Graveyard,
  subscription: Subscription,
  answer: UsageAnswer,
): Graveyard {
  const record = answerRecordFor(subscription, answer);
  if (graveyard.some((existing) => existing.id === record.id)) {
    return graveyard.map((existing) => (existing.id === record.id ? record : existing));
  }
  return [...graveyard, record];
}

/**
 * Req 7.3, 7.4: the Earlier record with this id gets `answer`, carriedOver false and
 * yearlySavingFor(record); same position, every other field and record unchanged.
 * Returns the same Graveyard object when no record has the id or the answer is already `answer`.
 */
export function changeEarlierAnswer(
  graveyard: Graveyard,
  id: string,
  answer: UsageAnswer,
): Graveyard {
  const found = graveyard.find((record) => record.id === id);
  if (found === undefined || found.answer === answer) return graveyard;
  return graveyard.map((record) =>
    record.id === id
      ? { ...record, answer, carriedOver: false, yearlySavingCents: yearlySavingFor(record) }
      : record,
  );
}

/** The id is the id of a subscription in `subscriptions` (Glossary "Current record"). */
export function isCurrentRecord(record: AnswerRecord, currentIds: ReadonlySet<string>): boolean {
  return currentIds.has(record.id);
}

function idsOf(subscriptions: readonly Subscription[]): Set<string> {
  return new Set(subscriptions.map((subscription) => subscription.id));
}

/** id → answer for Current records only (Req 9.4). */
export function answersMap(
  graveyard: Graveyard,
  subscriptions: readonly Subscription[],
): ReadonlyMap<string, UsageAnswer> {
  const currentIds = idsOf(subscriptions);
  return new Map(
    graveyard
      .filter((record) => isCurrentRecord(record, currentIds))
      .map((record): [string, UsageAnswer] => [record.id, record.answer]),
  );
}

/**
 * Req 9.5: refresh every Current record from its subscription; remove a Current record whose
 * subscription is now guessed while the record has cadenceAssumed false; keep Earlier records.
 */
export function refreshGraveyard(
  graveyard: Graveyard,
  subscriptions: readonly Subscription[],
): Graveyard {
  const byId = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));
  const refreshed: AnswerRecord[] = [];
  for (const record of graveyard) {
    const subscription = byId.get(record.id);
    if (subscription === undefined) {
      refreshed.push(record);
    } else if (subscription.evidence.cadenceAssumed && !record.cadenceAssumed) {
      continue;
    } else {
      refreshed.push({
        ...answerRecordFor(subscription, record.answer),
        carriedOver: record.carriedOver,
      });
    }
  }
  return refreshed;
}

/** The Graveyard without the record whose Burial sequence is running (Req 5.5, 1.6a). */
export function settledGraveyard(graveyard: Graveyard, buryingId: string | null): Graveyard {
  if (buryingId === null) return graveyard;
  return graveyard.filter((record) => record.id !== buryingId);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Sums `yearlySavingCents` per currency over the records that pass `include`. Throws on an unsafe sum. */
function sumSavings(
  records: Iterable<AnswerRecord>,
  include: (record: AnswerRecord) => boolean,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const record of records) {
    if (record.answer !== "not-using" || record.yearlySavingCents === null || !include(record)) {
      continue;
    }
    const next = (sums.get(record.currency) ?? 0) + record.yearlySavingCents;
    if (!Number.isSafeInteger(next)) {
      throw new RangeError("A savings total is not a safe integer");
    }
    sums.set(record.currency, next);
  }
  return sums;
}

/**
 * Req 6.2, 6.3, 6.5, 6.7: one entry per currency with a Tombstone whose yearlySavingCents is not
 * null, in code-unit order of currency. @throws RangeError when a running sum is not a safe integer.
 */
export function savingsTotals(graveyard: Graveyard): CurrencyTotal[] {
  const sums = sumSavings(graveyard, () => true);
  return [...sums.keys()].sort(compareCodeUnits).map((currency) => ({
    currency,
    totalCents: sums.get(currency) ?? 0,
  }));
}

/**
 * One Still-draining entry per currency of `subscriptions`, in code-unit order of currency (Req 1.6a).
 */
export interface StillDraining {
  currency: string;
  /** Currency total minus Counted savings, clamped at 0; null when the currency has no Currency total */
  remainingCents: number | null;
  /** The vertical-slice "not included" note follows this line; always true when remainingCents is null */
  hasExcluded: boolean;
}

export function stillDraining(
  totals: readonly CurrencyTotal[],
  graveyard: Graveyard,
  subscriptions: readonly Subscription[],
): StillDraining[] {
  const counted = new Set(subscriptions.filter(isCounted).map((subscription) => subscription.id));
  const savings = sumSavings(graveyard, (record) => counted.has(record.id));
  const currencies = new Set(subscriptions.map((subscription) => subscription.currency));
  const hasExcluded = new Set(
    subscriptions.filter((subscription) => !isCounted(subscription)).map((s) => s.currency),
  );
  return [...currencies].sort(compareCodeUnits).map((currency): StillDraining => {
    const total = totals.find((t) => t.currency === currency);
    if (total === undefined) return { currency, remainingCents: null, hasExcluded: true };
    return {
      currency,
      remainingCents: Math.max(0, total.totalCents - (savings.get(currency) ?? 0)),
      hasExcluded: hasExcluded.has(currency),
    };
  });
}

/** Something that has a Display name: a subscription or a record. */
export type Nameable = Pick<
  Subscription,
  "id" | "merchant" | "currency" | "cadence" | "currentAmountCents"
>;

const PERIOD_WORD: Readonly<Record<Cadence, string>> = {
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/**
 * Glossary "Display name" plus the tie rule: id → name for every item. Items with the same id are
 * one item (a Current record and its subscription). Long form when another item shares the merchant;
 * then one suffix pass over all final names: a name equal to an earlier one gets " (2)", " (3)" …,
 * in input order, skipping any suffixed name already taken.
 */
export function displayNames(
  items: readonly Nameable[],
  locale?: string,
): ReadonlyMap<string, string> {
  const distinct = new Map<string, Nameable>();
  for (const item of items) if (!distinct.has(item.id)) distinct.set(item.id, item);

  const idsPerMerchant = new Map<string, number>();
  for (const item of distinct.values()) {
    idsPerMerchant.set(item.merchant, (idsPerMerchant.get(item.merchant) ?? 0) + 1);
  }

  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const item of distinct.values()) {
    const shared = (idsPerMerchant.get(item.merchant) ?? 0) > 1;
    const base = shared
      ? `${item.merchant}, ${formatMoney(item.currentAmountCents, item.currency, locale)} a ${PERIOD_WORD[item.cadence]}`
      : item.merchant;
    let name = base;
    for (let n = 2; taken.has(name); n += 1) name = `${base} (${n})`;
    taken.add(name);
    names.set(item.id, name);
  }
  return names;
}
