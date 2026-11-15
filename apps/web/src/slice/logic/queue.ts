import type { StatementInfo, Subscription } from "@zombills/core";
import type { Graveyard } from "./graveyard";
import { groupForDisplay } from "./totals";

/** Req 2.3: Risen ids grouped by StatementInfo.currencies, then the vertical-slice display order. */
export function risingOrder(
  subscriptions: readonly Subscription[],
  statement: StatementInfo,
): string[] {
  const active = subscriptions.filter((subscription) => subscription.status === "active");
  return groupForDisplay(active, [], statement.currencies).flatMap((group) =>
    group.subscriptions.map((subscription) => subscription.id),
  );
}

/** The Queue: ids of `order` with no Current record, in `order` order (Req 2.9). */
export function queueOf(order: readonly string[], graveyard: Graveyard): string[] {
  const answered = new Set(graveyard.map((record) => record.id));
  return order.filter((id) => !answered.has(id));
}

/** "Skip for now": move `id` to the end of `order`; unchanged when id is absent (Req 2.4). */
export function skipInOrder(order: readonly string[], id: string): string[] {
  if (!order.includes(id)) return [...order];
  return [...order.filter((other) => other !== id), id];
}

/** "Answer now": move `id` to the front of `order`; unchanged when id is absent (Req 7.4). */
export function answerNowInOrder(order: readonly string[], id: string): string[] {
  if (!order.includes(id)) return [...order];
  return [id, ...order.filter((other) => other !== id)];
}
