import type { Subscription } from "@zombills/core";
import { answerRecordFor, type AnswerRecord, type Graveyard } from "./graveyard";
import { parseSubscriptionId } from "./graveyard-codec";

/** Req 6.2: Free subscriptions with o's Triple, not guessed unless o is, whose history holds o's amount. */
export function qualifyingCandidates(
  orphan: AnswerRecord,
  free: readonly Subscription[],
): Subscription[] {
  const triple = parseSubscriptionId(orphan.id);
  if (triple === null) return [];
  return free.filter(
    (s) =>
      s.currency === triple.currency &&
      s.cadence === triple.cadence &&
      s.merchantKey === triple.merchantKey &&
      (!s.evidence.cadenceAssumed || orphan.cadenceAssumed) &&
      s.priceHistory.some((p) => p.amountCents === orphan.currentAmountCents),
  );
}

/** One pass (design "Re-attach", steps 1–6). Returns the same array when nothing moves. */
function reattachPass(
  graveyard: Graveyard,
  subscriptions: readonly Subscription[],
): Graveyard {
  const currentIds = new Set(subscriptions.map((s) => s.id));
  const recordIds = new Set(graveyard.map((r) => r.id));
  const free = subscriptions.filter((s) => !recordIds.has(s.id));
  const candidatesOf = new Map<AnswerRecord, Subscription[]>();
  const claims = new Map<Subscription, number>();
  for (const record of graveyard) {
    if (currentIds.has(record.id)) continue;
    const candidates = qualifyingCandidates(record, free);
    candidatesOf.set(record, candidates);
    for (const s of candidates) claims.set(s, (claims.get(s) ?? 0) + 1);
  }
  const moves = new Map<AnswerRecord, Subscription>();
  for (const [record, candidates] of candidatesOf) {
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only !== undefined && claims.get(only) === 1) moves.set(record, only);
  }
  if (moves.size === 0) return graveyard;
  return graveyard.map((record) => {
    const s = moves.get(record);
    return s === undefined
      ? record
      : { ...answerRecordFor(s, record.answer), carriedOver: true };
  });
}

/** Req 6.1–6.5. Pure; returns the same Graveyard object when nothing moves. */
export function reattach(graveyard: Graveyard, subscriptions: readonly Subscription[]): Graveyard {
  let current = graveyard;
  for (;;) {
    const next = reattachPass(current, subscriptions);
    if (next === current) return current;
    current = next;
  }
}

/** Positions whose id differs between `before` and `after` (same length by Req 6.5). */
export function carriedOverCount(before: Graveyard, after: Graveyard): number {
  let count = 0;
  const length = Math.min(before.length, after.length);
  for (let i = 0; i < length; i += 1) {
    if (before[i]?.id !== after[i]?.id) count += 1;
  }
  return count;
}
