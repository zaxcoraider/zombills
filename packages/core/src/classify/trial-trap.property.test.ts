// P5 of the subscription classifier (design "Correctness properties"): trial details.
// Runs on both sources of Req 11.1: (a) detector output and (b) hand-built Subscriptions.

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Subscription } from "../detect/types.js";
import { classifySubscriptions } from "./classify-subscriptions.js";
import { classifierSubscriptionsArb, detectorOutputArb } from "./test-arbitraries.js";
import { oracle } from "./test-oracle.js";

const SOURCES: readonly (readonly [string, fc.Arbitrary<Subscription[]>])[] = [
  ["detector output", detectorOutputArb],
  ["classifier subscriptions", classifierSubscriptionsArb],
];

describe.each(SOURCES)("trial-trap properties on %s", (_name, source) => {
  it("P5: trial details", () => {
    fc.assert(
      fc.property(source, (subs) => {
        const result = classifySubscriptions(subs);
        result.forEach((r, i) => {
          const s = subs[i] as Subscription;
          const trial = r.trial;
          if (trial === null) return;
          const e = s.evidence;

          expect(
            s.charges.some(
              (c) =>
                c.date === trial.firstFullCharge.date &&
                c.amountCents === trial.firstFullCharge.amountCents,
            ),
          ).toBe(true);
          expect(Object.keys(trial.firstFullCharge).sort()).toStrictEqual(["amountCents", "date"]);

          if (e.introCharge !== null) {
            expect(trial.introCharge).toStrictEqual(e.introCharge);
          } else {
            expect(trial.introCharge).toStrictEqual(oracle(s, undefined).inferredIntro);
          }

          if (trial.freeTrialDate !== null) {
            expect(trial.freeTrialDate).toBe(e.freeTrialDate);
            expect(trial.freeTrialDate).not.toBe(e.firstChargeDate);
          }

          expect(trial.introCharge !== null || trial.freeTrialDate !== null).toBe(true);
        });
      }),
    );
  });
});
