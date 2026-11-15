import { describe, expect, it } from "vitest";
import type { Subscription } from "../detect/types.js";
import { classifySubscriptions } from "./classify-subscriptions.js";
import { makeSubscription } from "./test-fixtures.js";
import type { PriceRise, TrialDetails } from "./types.js";

function trial(s: Subscription): TrialDetails | null {
  return classifySubscriptions([s])[0]?.trial ?? null;
}

function rise(s: Subscription): PriceRise | null {
  return classifySubscriptions([s])[0]?.priceRise ?? null;
}

describe("findTrial: Req 3.5 rows", () => {
  it("introCharge 100 then 1499: trial-trap, not possessed", () => {
    const s = makeSubscription({
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    expect(trial(s)).toEqual({
      freeTrialDate: null,
      introCharge: { date: "2026-01-10", amountCents: 100 },
      firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
    });
    expect(rise(s)).toBeNull();
  });

  it("freeTrialDate only: trial-trap with no introCharge", () => {
    const s = makeSubscription({
      freeTrialDate: "2026-01-05",
      charges: [
        ["2026-02-05", 1099],
        ["2026-03-05", 1099],
        ["2026-04-05", 1099],
      ],
    });
    expect(trial(s)).toEqual({
      freeTrialDate: "2026-01-05",
      introCharge: null,
      firstFullCharge: { date: "2026-02-05", amountCents: 1099 },
    });
  });

  it("freeTrialDate and introCharge: both are kept", () => {
    const s = makeSubscription({
      freeTrialDate: "2026-01-03",
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    expect(trial(s)).toEqual({
      freeTrialDate: "2026-01-03",
      introCharge: { date: "2026-01-10", amountCents: 100 },
      firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
    });
  });

  it("no introCharge and no freeTrialDate: no trial", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 1499],
        ["2026-02-10", 1499],
      ],
    });
    expect(trial(s)).toBeNull();
  });
});

describe("findTrial: Inferred intro rows", () => {
  const NETFLIX_DATES: readonly string[] = ["2026-02-10", "2026-03-10", "2026-04-10", "2026-05-10"];

  function netflix(fullCount: number, startedInStatement: boolean): Subscription {
    return makeSubscription({
      startedInStatement,
      charges: [
        ["2026-01-10", 750],
        ...NETFLIX_DATES.slice(0, fullCount).map((d): [string, number] => [d, 1499]),
      ],
    });
  }

  it("750 then three 1499, started in statement: trial-trap, not possessed", () => {
    const s = netflix(3, true);
    expect(s.evidence.regularChargeCount).toBe(4);
    expect(trial(s)).toEqual({
      freeTrialDate: null,
      introCharge: { date: "2026-01-10", amountCents: 750 },
      firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
    });
    expect(rise(s)).toBeNull();
  });

  it("the same charges with startedInStatement false: no trial-trap, possessed from 750", () => {
    const s = netflix(3, false);
    expect(trial(s)).toBeNull();
    expect(rise(s)?.firstSeen).toEqual({ date: "2026-01-10", amountCents: 750 });
  });

  it("a fourth 1499 (full-price charge count 4): no trial-trap, not possessed", () => {
    const s = netflix(4, true);
    expect(s.evidence.regularChargeCount).toBe(5);
    expect(trial(s)).toBeNull();
    expect(rise(s)).toBeNull();
  });

  it("an Inferred intro and a freeTrialDate: both are kept", () => {
    const base = netflix(3, true);
    const s: Subscription = {
      ...base,
      evidence: { ...base.evidence, freeTrialDate: "2026-01-04" },
    };
    expect(trial(s)).toEqual({
      freeTrialDate: "2026-01-04",
      introCharge: { date: "2026-01-10", amountCents: 750 },
      firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
    });
  });
});

describe("findTrial: free-trial date on the first charge", () => {
  it("a 0.00 row on the first charge's date does not count", () => {
    const s = makeSubscription({
      source: "generic",
      merchantKey: "merchant:fit-gym",
      freeTrialDate: "2026-02-05",
      charges: [
        ["2026-02-05", 2900],
        ["2026-03-05", 2900],
        ["2026-04-05", 2900],
      ],
    });
    expect(trial(s)).toBeNull();
  });

  it("a free-trial date on the first charge's date is dropped when an introCharge counts", () => {
    const s = makeSubscription({
      freeTrialDate: "2026-02-10",
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    expect(trial(s)?.freeTrialDate).toBeNull();
    expect(trial(s)?.introCharge).toEqual({ date: "2026-01-10", amountCents: 100 });
  });
});

describe("findTrial: full-price charge count cut-off", () => {
  const DATES: readonly string[] = ["2026-02-10", "2026-03-10", "2026-04-10", "2026-05-10"];

  function full(count: number): [string, number][] {
    return DATES.slice(0, count).map((d): [string, number] => [d, 1499]);
  }

  it("introCharge: 3 full-price charges is labelled, 4 is not", () => {
    expect(
      trial(makeSubscription({ intro: ["2026-01-10", 100], charges: full(3) })),
    ).not.toBeNull();
    expect(trial(makeSubscription({ intro: ["2026-01-10", 100], charges: full(4) }))).toBeNull();
  });

  it("Inferred intro: 3 full-price charges is labelled, 4 is not", () => {
    const make = (n: number): Subscription =>
      makeSubscription({
        startedInStatement: true,
        charges: [["2026-01-10", 750], ...full(n)],
      });
    expect(trial(make(3))).not.toBeNull();
    expect(trial(make(4))).toBeNull();
  });

  it("freeTrialDate: 3 full-price charges is labelled, 4 is not", () => {
    expect(
      trial(makeSubscription({ freeTrialDate: "2026-01-05", charges: full(3) })),
    ).not.toBeNull();
    expect(trial(makeSubscription({ freeTrialDate: "2026-01-05", charges: full(4) }))).toBeNull();
  });
});

describe("findTrial: guards and new objects", () => {
  it("firstChargeDate not in charges: null (Req 3.3)", () => {
    const base = makeSubscription({
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    const s: Subscription = {
      ...base,
      evidence: { ...base.evidence, firstChargeDate: "2026-02-11" },
    };
    expect(trial(s)).toBeNull();
  });

  it("introCharge and firstFullCharge are new objects", () => {
    const s = makeSubscription({
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    const result = trial(s);
    expect(result?.introCharge).not.toBe(s.evidence.introCharge);
    expect(result?.firstFullCharge).not.toBe(s.priceHistory[1]);
    expect(Object.keys(result?.firstFullCharge ?? {}).sort()).toEqual(["amountCents", "date"]);
  });

  it("the Inferred intro's firstFullCharge is a new object, not priceHistory[1]", () => {
    const s = makeSubscription({
      startedInStatement: true,
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    const result = trial(s);
    expect(result?.firstFullCharge).toEqual(s.priceHistory[1]);
    expect(result?.firstFullCharge).not.toBe(s.priceHistory[1]);
  });
});
