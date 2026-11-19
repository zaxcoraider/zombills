import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { PageModel } from "../page-state";
import { deriveHaunt } from "./haunt-view";
import { progressCounts, progressDots } from "./progress-dots";
import { risingOrder } from "./queue";
import { manyRisenOutcomeArb, pageModelArb, pageModelOver } from "./test-arbitraries";

/**
 * `pageModelArb` reaches at most 12 risen, so half the models come from outcomes of 13 to 16
 * active subscriptions; both sides of the limit occur (review C #5).
 */
const resultsModelArb: fc.Arbitrary<PageModel> = fc
  .oneof(pageModelArb, pageModelOver(manyRisenOutcomeArb))
  .filter((m) => m.view.kind === "results");

/** Req 10.3: dots for at most 12 risen, the bar above. A literal, so the constant cannot drift. */
const DOTS_LIMIT = 12;

function risenOf(m: PageModel): number {
  if (m.view.kind !== "results") throw new Error("filtered to results");
  return risingOrder(m.view.outcome.subscriptions, m.view.outcome.statement).length;
}

describe("progress dots (pro-polish P4)", () => {
  it("the generator reaches both sides of the 12-dot limit", () => {
    const risen = fc.sample(resultsModelArb, { numRuns: 200, seed: 1 }).map(risenOf);
    expect(risen.some((n) => n > DOTS_LIMIT)).toBe(true);
    expect(risen.some((n) => n <= DOTS_LIMIT)).toBe(true);
  });

  it("one dot per risen subscription in the original order, filled count equals answeredCount", () => {
    // **Validates: Requirements 10.2, 10.3, 13.5**
    fc.assert(
      fc.property(resultsModelArb, (m) => {
        if (m.view.kind !== "results") throw new Error("filtered to results");
        const order = risingOrder(m.view.outcome.subscriptions, m.view.outcome.statement);
        const risen = order.length;
        const haunt = deriveHaunt(m);
        const { answeredCount } = haunt;
        // M is the number of risen subscriptions the "N of M answered" text shows.
        expect(haunt.risen.length).toBe(risen);

        const dots = progressDots(m);
        if (risen > DOTS_LIMIT) {
          expect(dots).toBeNull();
        } else {
          expect(dots).not.toBeNull();
          expect(dots?.map((dot) => dot.id)).toEqual(order);
          expect(dots?.filter((dot) => dot.answered).length).toBe(answeredCount);
        }
        expect(progressCounts(m)).toEqual({ answered: answeredCount, risen });
      }),
    );
  });
});
