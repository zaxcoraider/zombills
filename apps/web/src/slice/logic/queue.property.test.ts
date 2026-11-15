import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { StatementInfo, Subscription } from "@zombills/core";
import { recordAnswer, type Graveyard } from "./graveyard";
import { answerNowInOrder, queueOf, risingOrder, skipInOrder } from "./queue";
import { answerableListArb, deepFreeze } from "./test-arbitraries";
import { groupForDisplay } from "./totals";

function statementFor(list: readonly Subscription[]): StatementInfo {
  const currencies = [...new Set(list.map((s) => s.currency))].sort();
  return { firstDate: null, lastDate: null, asOf: null, asOfSource: null, currencies };
}

function moved(queue: readonly string[], id: string, toEnd: boolean): string[] {
  const rest = queue.filter((other) => other !== id);
  return toEnd ? [...rest, id] : [id, ...rest];
}

/** Picks an id: one of the list's, or a foreign one when `pick` is past the end. */
function idAt(ids: readonly string[], pick: number): string {
  return ids[pick % (ids.length + 1)] ?? "foreign-id";
}

describe("queue properties", () => {
  it("P1: skip and answer-now move one id within the Queue and nothing else changes", () => {
    fc.assert(
      fc.property(
        answerableListArb(8),
        fc.array(fc.tuple(fc.nat({ max: 20 }), fc.boolean()), { maxLength: 8 }),
        fc.array(fc.tuple(fc.boolean(), fc.nat({ max: 20 })), { maxLength: 12 }),
        (list, answerPicks, actions) => {
          const frozenList = deepFreeze(list);
          const statement = deepFreeze(statementFor(frozenList));
          const ids = frozenList.map((s) => s.id);

          // A Graveyard over some of the ids, plus a record for an id outside the list.
          let graveyard: Graveyard = [];
          for (const [pick, notUsing] of answerPicks) {
            const sub = frozenList[pick % Math.max(frozenList.length, 1)];
            if (sub)
              graveyard = recordAnswer(graveyard, sub, notUsing ? "not-using" : "still-using");
          }
          const base = frozenList[0];
          if (base) graveyard = recordAnswer(graveyard, { ...base, id: "foreign-id" }, "not-using");
          deepFreeze(graveyard);

          // With no actions: risingOrder is the flattened groupForDisplay order of active subscriptions.
          const order = risingOrder(frozenList, statement);
          const active = frozenList.filter((s) => s.status === "active");
          const expectedOrder = groupForDisplay(active, [], statement.currencies).flatMap((group) =>
            group.subscriptions.map((s) => s.id),
          );
          expect(order).toEqual(expectedOrder);

          const answered = new Set(graveyard.map((record) => record.id));
          const expectedQueue = order.filter((id) => !answered.has(id));
          let current = order;
          let queue = queueOf(current, graveyard);
          expect(queue).toEqual(expectedQueue);

          for (const [skip, pick] of actions) {
            const id = idAt(ids, pick);
            current = skip ? skipInOrder(current, id) : answerNowInOrder(current, id);
            const next = queueOf(current, graveyard);
            expect(next).toEqual(queue.includes(id) ? moved(queue, id, skip) : queue);
            queue = next;
          }

          // Same members, each once, whatever the actions were.
          expect([...queue].sort()).toEqual([...expectedQueue].sort());
          expect(new Set(queue).size).toBe(queue.length);
        },
      ),
    );
  });
});
