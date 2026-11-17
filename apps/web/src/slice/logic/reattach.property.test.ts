import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Subscription } from "@zombills/core";
import {
  answersMap,
  recordAnswer,
  refreshGraveyard,
  type AnswerRecord,
  type Graveyard,
} from "./graveyard";
import { parseSubscriptionId } from "./graveyard-codec";
import { qualifyingCandidates, reattach } from "./reattach";
import {
  deepFreeze,
  graveyardActionArb,
  sharedTripleOutcomeArb,
  type GraveyardAction,
} from "./test-arbitraries";

describe("re-attach properties", () => {
  it("P7: re-attach is idempotent and moves only unambiguous Orphan records", () => {
    fc.assert(
      fc.property(sharedTripleOutcomeArb, (input) => {
        const graveyard = deepFreeze(input.graveyard);
        const subscriptions = deepFreeze(input.subscriptions);
        const result = reattach(graveyard, subscriptions);

        expect(reattach(result, subscriptions)).toEqual(result);
        expect(result).toHaveLength(graveyard.length);
        expect(new Set(result.map((r) => r.id)).size).toBe(result.length);

        const currentIds = new Set(subscriptions.map((s) => s.id));
        const recordIds = new Set(graveyard.map((r) => r.id));
        const free = subscriptions.filter((s) => !recordIds.has(s.id));
        graveyard.forEach((before, i) => {
          const after = result[i] as AnswerRecord;
          expect(after.answer).toBe(before.answer);
          if (after.id === before.id) {
            expect(after).toBe(before);
            return;
          }
          expect(currentIds.has(before.id)).toBe(false);
          expect(recordIds.has(after.id)).toBe(false);
          expect(currentIds.has(after.id)).toBe(true);
          const moved = parseSubscriptionId(after.id);
          const original = parseSubscriptionId(before.id);
          expect(moved).not.toBeNull();
          expect(moved?.currency).toBe(original?.currency);
          expect(moved?.cadence).toBe(original?.cadence);
          expect(moved?.merchantKey).toBe(original?.merchantKey);
          expect(after.carriedOver).toBe(true);
          const target = free.find((s) => s.id === after.id) as Subscription;
          expect(qualifyingCandidates(before, free)).toContain(target);
        });
        for (const record of graveyard) {
          if (currentIds.has(record.id)) {
            expect(result.find((r) => r.id === record.id)).toBe(record);
          }
        }
      }),
    );
  });

  it("P8: re-attach before refresh keeps the graveyard-ui P4 rules", () => {
    const scenarioArb = sharedTripleOutcomeArb.chain(({ graveyard, subscriptions }) =>
      fc.record({
        graveyard: fc.constant(graveyard),
        subscriptions: fc.constant(subscriptions),
        actions: fc.array(graveyardActionArb(subscriptions.map((s) => s.id)), { maxLength: 15 }),
      }),
    );
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const list: readonly Subscription[] = deepFreeze(scenario.subscriptions);
        let graveyard: Graveyard = deepFreeze(
          refreshGraveyard(reattach(scenario.graveyard, list), list),
        );
        // refresh with re-attach: one record per id, Earlier records are untouched
        expect(new Set(graveyard.map((r) => r.id)).size).toBe(graveyard.length);
        for (const action of scenario.actions as GraveyardAction[]) {
          if (action.type === "refresh") {
            const refreshed = deepFreeze(refreshGraveyard(reattach(graveyard, list), list));
            expect(new Set(refreshed.map((r) => r.id)).size).toBe(refreshed.length);
            for (const record of refreshed) {
              const subscription = list.find((s) => s.id === record.id);
              if (subscription !== undefined && !record.cadenceAssumed) {
                expect(subscription.evidence.cadenceAssumed).toBe(false);
              }
              if (subscription === undefined) expect(graveyard).toContain(record);
            }
            graveyard = refreshed;
            continue;
          }
          if (action.type === "skip" || action.type === "answer-now") continue;
          const subscription = list.find((s) => s.id === action.id);
          if (subscription === undefined) continue;
          const answer =
            action.type === "record"
              ? action.answer
              : action.type === "unbury"
                ? "still-using"
                : "not-using";
          const before = graveyard;
          graveyard = deepFreeze(recordAnswer(graveyard, subscription, answer));
          expect(graveyard.find((r) => r.id === action.id)?.answer).toBe(answer);
          expect(graveyard.find((r) => r.id === action.id)?.carriedOver).toBe(false);
          expect(graveyard.filter((r) => r.id !== action.id)).toEqual(
            before.filter((r) => r.id !== action.id),
          );
          // recording the same answer twice equals recording it once
          expect(recordAnswer(graveyard, subscription, answer)).toEqual(graveyard);
        }

        // Unbury then Bury after all restores the buried record, with carriedOver false
        const start: Graveyard = deepFreeze(
          refreshGraveyard(reattach(scenario.graveyard, list), list),
        );
        for (const record of start) {
          const subscription = list.find((s) => s.id === record.id);
          if (subscription === undefined || record.answer !== "not-using") continue;
          const restored = recordAnswer(
            recordAnswer(start, subscription, "still-using"),
            subscription,
            "not-using",
          ).find((r) => r.id === record.id);
          expect(restored).toEqual({ ...record, carriedOver: false });
        }

        // answersMap holds exactly the Current records
        const currentIds = new Set(list.map((s) => s.id));
        const answers = answersMap(graveyard, list);
        expect([...answers.keys()]).toEqual(
          graveyard.filter((r) => currentIds.has(r.id)).map((r) => r.id),
        );
      }),
    );
  });
});
