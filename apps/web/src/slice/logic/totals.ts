import type { Subscription } from "@zombills/core";

export interface CurrencyTotal {
  currency: string;
  totalCents: number;
}

export interface CurrencyGroup<S extends Subscription = Subscription> {
  currency: string;
  /** Counted first, then the rest; each part ordered by yearlyCostCents desc, merchant asc, id asc */
  subscriptions: S[];
  /** null when the group has no Counted subscription (Req 5.7) */
  total: CurrencyTotal | null;
  /** true when any subscription in the group is not Counted */
  hasExcluded: boolean;
}

/** status "active" and not cadenceAssumed (glossary "Counted subscription"). */
export function isCounted(subscription: Subscription): boolean {
  return subscription.status === "active" && !subscription.evidence.cadenceAssumed;
}

/** Listed currencies in `currencyOrder` order, then the rest in code-unit order. */
function orderCurrencies(present: Iterable<string>, currencyOrder: readonly string[]): string[] {
  const set = new Set(present);
  const ordered: string[] = [];
  for (const currency of currencyOrder) {
    if (set.delete(currency)) ordered.push(currency);
  }
  const rest = [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...ordered, ...rest];
}

/**
 * One entry per currency with a Counted subscription, in `currencyOrder` then code-unit order for
 * any currency not listed. @throws RangeError when a running sum is not a safe integer (Req 5.11a).
 */
export function currencyTotals(
  subscriptions: readonly Subscription[],
  currencyOrder: readonly string[],
): CurrencyTotal[] {
  const sums = new Map<string, number>();
  for (const subscription of subscriptions) {
    if (!isCounted(subscription)) continue;
    const next = (sums.get(subscription.currency) ?? 0) + subscription.yearlyCostCents;
    if (!Number.isSafeInteger(next)) {
      throw new RangeError("A currency total is not a safe integer");
    }
    sums.set(subscription.currency, next);
  }
  return orderCurrencies(sums.keys(), currencyOrder).map((currency) => ({
    currency,
    totalCents: sums.get(currency) ?? 0,
  }));
}

function compareDisplay(a: Subscription, b: Subscription): number {
  const countedA = isCounted(a);
  if (countedA !== isCounted(b)) return countedA ? -1 : 1;
  if (a.yearlyCostCents !== b.yearlyCostCents) return b.yearlyCostCents - a.yearlyCostCents;
  if (a.merchant !== b.merchant) return a.merchant < b.merchant ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** Req 5.2, 5.7, 5.12. Groups follow `currencyOrder`; unlisted currencies follow in code-unit order. */
export function groupForDisplay<S extends Subscription>(
  subscriptions: readonly S[],
  totals: readonly CurrencyTotal[],
  currencyOrder: readonly string[],
): CurrencyGroup<S>[] {
  const byCurrency = new Map<string, S[]>();
  for (const subscription of subscriptions) {
    const list = byCurrency.get(subscription.currency);
    if (list) list.push(subscription);
    else byCurrency.set(subscription.currency, [subscription]);
  }
  return orderCurrencies(byCurrency.keys(), currencyOrder).map((currency) => {
    const sorted = [...(byCurrency.get(currency) ?? [])].sort(compareDisplay);
    return {
      currency,
      subscriptions: sorted,
      total: totals.find((t) => t.currency === currency) ?? null,
      hasExcluded: sorted.some((s) => !isCounted(s)),
    };
  });
}
