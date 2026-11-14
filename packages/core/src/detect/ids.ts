// Subscription ids and result ordering (design "Ids", Req 1.11, 8).

import type { Entry, Series } from "./internal-types.js";
import type { Subscription } from "./types.js";

type Unidentified = Omit<Subscription, "id">;

function compareNumbers(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Strings by code units (never locale-aware). */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Element by element; a list that is a prefix of a longer one comes first. */
function compareLists(a: readonly number[], b: readonly number[]): number {
  const shared = a.length < b.length ? a.length : b.length;
  for (let i = 0; i < shared; i++) {
    const result = compareNumbers(a[i] as number, b[i] as number);
    if (result !== 0) return result;
  }
  return compareNumbers(a.length, b.length);
}

/** The Series charges, oldest first: the Introductory charge, then the Regular charges. */
function seriesEntries(series: Series): Entry[] {
  return series.intro === null ? series.regular : [series.intro, ...series.regular];
}

interface RankKey {
  days: number[];
  amounts: number[];
}

function rankKeyOf(series: Series): RankKey {
  const entries = seriesEntries(series);
  // Day numbers, not ISO strings: a 5-digit year would sort before a 4-digit one by code units.
  return { days: entries.map((e) => e.date.day), amounts: entries.map((e) => e.amountCents) };
}

function compareRankKeys(a: RankKey, b: RankKey): number {
  // The first date is the first element of the date list, so the list comparison covers it.
  const byDates = compareLists(a.days, b.days);
  return byDates !== 0 ? byDates : compareLists(a.amounts, b.amounts);
}

/**
 * Gives each Subscription its id. `series[i]` is the Series `subs[i]` was built from.
 * Returns new objects in the order of `subs`; the inputs are not changed.
 */
export function assignIds(
  subs: readonly Unidentified[],
  series: readonly Series[],
): Subscription[] {
  // Indices grouped by (currency, cadence, merchantKey). Currency and cadence contain neither
  // NUL nor ":", so the key is always the whole remainder.
  const byKey = new Map<string, number[]>();
  subs.forEach((sub, i) => {
    const groupKey = `${sub.currency}\u0000${sub.cadence}\u0000${sub.merchantKey}`;
    const list = byKey.get(groupKey);
    if (list === undefined) byKey.set(groupKey, [i]);
    else list.push(i);
  });

  const discriminators: string[] = new Array<string>(subs.length).fill("*");
  for (const indices of byKey.values()) {
    if (indices.length === 1) continue;
    const byAmount = new Map<number, number[]>();
    for (const i of indices) {
      const amount = (subs[i] as Unidentified).currentAmountCents;
      const list = byAmount.get(amount);
      if (list === undefined) byAmount.set(amount, [i]);
      else list.push(i);
    }
    for (const [amount, shared] of byAmount) {
      if (shared.length === 1) {
        discriminators[shared[0] as number] = String(amount);
        continue;
      }
      const ranked = shared
        .map((i) => ({ i, key: rankKeyOf(series[i] as Series) }))
        .sort((a, b) => compareRankKeys(a.key, b.key));
      ranked.forEach(({ i }, r) => {
        discriminators[i] = `${amount}-${r + 1}`;
      });
    }
  }

  return subs.map((sub, i) => ({
    id: `sub:${sub.currency}:${sub.cadence}:${discriminators[i] as string}:${sub.merchantKey}`,
    ...sub,
  }));
}

/** `yearlyCostCents` descending, then `id` by code units (Req 1.11). Returns a new array. */
export function sortSubscriptions(subs: Subscription[]): Subscription[] {
  return [...subs].sort((a, b) => {
    const byCost = compareNumbers(b.yearlyCostCents, a.yearlyCostCents);
    return byCost !== 0 ? byCost : compareStrings(a.id, b.id);
  });
}
