import { describe, expect, it } from "vitest";
import { findInferredIntro, paidPriceHistory } from "./paid-history.js";
import { makeSubscription } from "./test-fixtures.js";

describe("findInferredIntro and paidPriceHistory: design worked examples", () => {
  it("750 then 1499, started in the statement: inferred intro, history without it", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
      startedInStatement: true,
    });
    const inferred = findInferredIntro(s);
    expect(inferred).toEqual({ date: "2026-01-10", amountCents: 750 });
    expect(paidPriceHistory(s, inferred)).toEqual([{ date: "2026-02-10", amountCents: 1499 }]);
  });

  it("the same charges with startedInStatement false: no inferred intro, history unchanged", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
      startedInStatement: false,
    });
    const inferred = findInferredIntro(s);
    expect(inferred).toBeNull();
    expect(paidPriceHistory(s, inferred)).toEqual([
      { date: "2026-01-10", amountCents: 750 },
      { date: "2026-02-10", amountCents: 1499 },
    ]);
  });

  it("only one charge at the full price: no inferred intro", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
      ],
      startedInStatement: true,
    });
    const inferred = findInferredIntro(s);
    expect(inferred).toBeNull();
    expect(paidPriceHistory(s, inferred)).toEqual(s.priceHistory);
  });

  it("1450 then 1499 is not a Band rise: no inferred intro", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 1450],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
      startedInStatement: true,
    });
    const inferred = findInferredIntro(s);
    expect(inferred).toBeNull();
    expect(paidPriceHistory(s, inferred)).toEqual(s.priceHistory);
  });

  it("two charges at the first price: no inferred intro", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
        ["2026-04-10", 750],
      ],
      startedInStatement: true,
    });
    expect(s.priceHistory.map((p) => p.amountCents)).toEqual([750, 1499, 750]);
    const inferred = findInferredIntro(s);
    expect(inferred).toBeNull();
    expect(paidPriceHistory(s, inferred)).toEqual(s.priceHistory);
  });

  it.each([true, false])(
    "a detector intro charge (startedInStatement %s): no inferred intro, history without the intro",
    (startedInStatement) => {
      const s = makeSubscription({
        intro: ["2026-01-10", 100],
        charges: [
          ["2026-02-10", 1499],
          ["2026-03-10", 1499],
        ],
        startedInStatement,
      });
      const inferred = findInferredIntro(s);
      expect(inferred).toBeNull();
      expect(paidPriceHistory(s, inferred)).toEqual([{ date: "2026-02-10", amountCents: 1499 }]);
    },
  );
});

describe("findInferredIntro and paidPriceHistory: edges", () => {
  it("an introCharge that does not match priceHistory[0] leaves the history unchanged", () => {
    const base = makeSubscription({
      intro: ["2026-01-10", 100],
      charges: [
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
    });
    const wrongAmount = {
      ...base,
      evidence: { ...base.evidence, introCharge: { date: "2026-01-10", amountCents: 101 } },
    };
    const wrongDate = {
      ...base,
      evidence: { ...base.evidence, introCharge: { date: "2026-01-11", amountCents: 100 } },
    };
    expect(paidPriceHistory(wrongAmount, null)).toEqual(base.priceHistory);
    expect(paidPriceHistory(wrongDate, null)).toEqual(base.priceHistory);
  });

  it("a single price entry gives no inferred intro and an unchanged history", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 1499],
        ["2026-02-10", 1499],
      ],
      startedInStatement: true,
    });
    expect(findInferredIntro(s)).toBeNull();
    expect(paidPriceHistory(s, null)).toEqual(s.priceHistory);
  });

  it("returns a slice of priceHistory: same entry objects, not the same array, input untouched", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
      startedInStatement: true,
    });
    const before = JSON.stringify(s);
    const paid = paidPriceHistory(s, findInferredIntro(s));
    expect(paid).toHaveLength(1);
    expect(paid[0]).toBe(s.priceHistory[1]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("returns the very same entries when the history is unchanged", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 1499],
        ["2026-02-10", 1799],
      ],
    });
    const paid = paidPriceHistory(s, null);
    expect(paid).toEqual(s.priceHistory);
    paid.forEach((entry, i) => expect(entry).toBe(s.priceHistory[i]));
  });

  it("the inferred intro is a new object, not an entry of priceHistory", () => {
    const s = makeSubscription({
      charges: [
        ["2026-01-10", 750],
        ["2026-02-10", 1499],
        ["2026-03-10", 1499],
      ],
      startedInStatement: true,
    });
    expect(findInferredIntro(s)).not.toBe(s.priceHistory[0]);
  });
});
