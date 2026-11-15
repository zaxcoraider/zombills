import { describe, expect, it } from "vitest";
import type { Subscription } from "../detect/types.js";
import { classifySubscriptions } from "./classify-subscriptions.js";
import { makeSubscription } from "./test-fixtures.js";
import type { UsageAnswer } from "./types.js";

const NETFLIX_RISE = makeSubscription({
  charges: [
    ["2026-01-02", 1549],
    ["2026-02-02", 1549],
    ["2026-03-02", 1799],
  ],
});

const TRIAL = makeSubscription({
  intro: ["2026-01-10", 100],
  charges: [
    ["2026-02-10", 1499],
    ["2026-03-10", 1499],
  ],
});

const BOTH = makeSubscription({
  intro: ["2026-01-10", 100],
  charges: [
    ["2026-02-10", 1499],
    ["2026-03-10", 1499],
    ["2026-04-10", 1699],
  ],
});

const PLAIN = makeSubscription({
  merchantKey: "spotify",
  charges: [
    ["2026-01-05", 1099],
    ["2026-02-05", 1099],
    ["2026-03-05", 1099],
    ["2026-04-05", 1099],
  ],
});

function labelsOf(s: Subscription, answer?: unknown): string[] {
  const answers = answer === undefined ? undefined : new Map([[s.id, answer]]);
  const result = classifySubscriptions(
    [s],
    answers as unknown as ReadonlyMap<string, UsageAnswer>,
  )[0];
  return result?.labels ?? ["<missing>"];
}

describe("classifySubscriptions: Req 5.4 rows", () => {
  const assumed = makeSubscription({
    charges: [["2026-01-15", 13900]],
    freeTrialDate: "2026-01-01",
    cadenceAssumed: true,
  });
  const endedRise = makeSubscription({
    status: "ended",
    charges: [
      ["2025-09-02", 1549],
      ["2025-10-02", 1549],
      ["2025-11-02", 1799],
    ],
  });
  const endedTrial = makeSubscription({
    status: "ended",
    intro: ["2025-09-10", 100],
    charges: [
      ["2025-10-10", 1499],
      ["2025-11-10", 1499],
    ],
  });

  it("assumed cadence, no answer: no labels, no details", () => {
    const [result] = classifySubscriptions([assumed]);
    expect(result?.labels).toEqual([]);
    expect(result?.priceRise).toBeNull();
    expect(result?.trial).toBeNull();
  });

  it("assumed cadence, not-using: only zombie", () => {
    const [result] = classifySubscriptions([assumed], new Map([[assumed.id, "not-using"]]));
    expect(result?.labels).toEqual(["zombie"]);
    expect(result?.priceRise).toBeNull();
    expect(result?.trial).toBeNull();
  });

  it("ended with a price rise: no labels", () => {
    const [result] = classifySubscriptions([endedRise]);
    expect(result?.labels).toEqual([]);
    expect(result?.priceRise).toBeNull();
  });

  it("ended with an intro charge and not-using: answer ignored", () => {
    const [result] = classifySubscriptions([endedTrial], new Map([[endedTrial.id, "not-using"]]));
    expect(result?.labels).toEqual([]);
    expect(result?.priceRise).toBeNull();
    expect(result?.trial).toBeNull();
  });

  it("the same id active again gets the zombie label back", () => {
    const active: Subscription = { ...endedTrial, status: "active" };
    expect(labelsOf(active, "not-using")).toContain("zombie");
  });
});

describe("classifySubscriptions: labels together (Req 4)", () => {
  it("possessed alone", () => {
    expect(labelsOf(NETFLIX_RISE)).toEqual(["possessed"]);
  });

  it("trial-trap alone", () => {
    expect(labelsOf(TRIAL)).toEqual(["trial-trap"]);
  });

  it("both labels, in Canonical order, with the Req 4.2 details", () => {
    const [result] = classifySubscriptions([BOTH]);
    expect(result?.labels).toEqual(["possessed", "trial-trap"]);
    expect(result?.priceRise?.firstSeen).toEqual({ date: "2026-02-10", amountCents: 1499 });
    expect(result?.trial?.firstFullCharge).toEqual({ date: "2026-02-10", amountCents: 1499 });
  });

  it("both labels with not-using: zombie first", () => {
    expect(labelsOf(BOTH, "not-using")).toEqual(["zombie", "possessed", "trial-trap"]);
  });

  it("an answer changes nothing but the zombie label (Req 4.3, 6.6)", () => {
    const without = classifySubscriptions([BOTH])[0];
    const withAnswer = classifySubscriptions([BOTH], new Map([[BOTH.id, "not-using"]]))[0];
    expect({ ...withAnswer, labels: [] }).toEqual({ ...without, labels: [] });
  });

  it("a Subscription with no signals has no labels and null details", () => {
    const [result] = classifySubscriptions([PLAIN]);
    expect(result?.labels).toEqual([]);
    expect(result?.priceRise).toBeNull();
    expect(result?.trial).toBeNull();
  });
});

describe("classifySubscriptions: input contract (Req 1.10)", () => {
  it.each([[undefined], [null], [{}], ["x"]])("throws TypeError for %j", (value) => {
    expect(() => classifySubscriptions(value as unknown as Subscription[])).toThrow(
      new TypeError("classifySubscriptions: subscriptions must be an array"),
    );
  });

  it("returns [] for []", () => {
    expect(classifySubscriptions([])).toEqual([]);
    expect(classifySubscriptions([], new Map())).toEqual([]);
  });

  it("keeps length and order", () => {
    const result = classifySubscriptions([PLAIN, NETFLIX_RISE, TRIAL]);
    expect(result.map((s) => s.id)).toEqual([PLAIN.id, NETFLIX_RISE.id, TRIAL.id]);
  });
});

describe("classifySubscriptions: answers (Req 6)", () => {
  const key = NETFLIX_RISE.id;

  it.each([
    ["absent", undefined],
    ["null", null],
    ["{}", {}],
    ["[]", []],
    ["a duck-typed get", { get: () => "not-using" }],
  ])("answers %s gives no zombie", (_name, answers) => {
    const result = classifySubscriptions(
      [NETFLIX_RISE],
      answers as unknown as Map<string, UsageAnswer>,
    );
    expect(result[0]?.labels).toEqual(["possessed"]);
  });

  it("a not-using Map entry gives zombie", () => {
    expect(labelsOf(NETFLIX_RISE, "not-using")).toEqual(["zombie", "possessed"]);
  });

  it.each([["still-using"], ["maybe"], [null], [1], [true], [""]])(
    "answer %j gives no zombie",
    (value) => {
      const answers = new Map<string, unknown>([[key, value]]);
      const result = classifySubscriptions([NETFLIX_RISE], answers as Map<string, UsageAnswer>);
      expect(result[0]?.labels).toEqual(["possessed"]);
    },
  );

  it("unknown and non-string keys change nothing", () => {
    const answers = new Map<unknown, unknown>([
      ["sub:USD:monthly:*:hulu", "not-using"],
      [1, "not-using"],
      [null, "not-using"],
      [undefined, "not-using"],
      [{ id: key }, "not-using"],
      [key, "still-using"],
    ]);
    const result = classifySubscriptions(
      [NETFLIX_RISE, PLAIN],
      answers as Map<string, UsageAnswer>,
    );
    expect(result.map((s) => s.labels)).toEqual([["possessed"], []]);
  });

  it("does not change the answers map", () => {
    const answers = new Map<string, UsageAnswer>([[key, "not-using"]]);
    classifySubscriptions([NETFLIX_RISE], answers);
    expect([...answers]).toEqual([[key, "not-using"]]);
  });
});

describe("classifySubscriptions: result shape (Req 1.4–1.6)", () => {
  it("returns new objects with the other fields equal, and a new labels array", () => {
    const [result] = classifySubscriptions([NETFLIX_RISE]);
    expect(result).not.toBe(NETFLIX_RISE);
    expect(result?.labels).not.toBe(NETFLIX_RISE.labels);
    const rest: Record<string, unknown> = { ...result };
    delete rest["labels"];
    delete rest["priceRise"];
    delete rest["trial"];
    const input: Record<string, unknown> = { ...NETFLIX_RISE };
    delete input["labels"];
    expect(rest).toEqual(input);
  });

  it("does not mutate the input", () => {
    const copy = structuredClone(NETFLIX_RISE);
    const inputs = [NETFLIX_RISE];
    classifySubscriptions(inputs, new Map([[NETFLIX_RISE.id, "not-using"]]));
    expect(NETFLIX_RISE).toEqual(copy);
    expect(inputs).toEqual([NETFLIX_RISE]);
  });

  it("replaces stale labels, priceRise and trial, and re-classifying removes zombie", () => {
    const stale = {
      ...PLAIN,
      labels: ["zombie", "possessed", "trial-trap"],
      priceRise: {
        firstSeen: { date: "2020-01-01", amountCents: 1 },
        currentAmountCents: 2,
        latestRise: null,
        increasePerChargeCents: 1,
        increasePerYearCents: 12,
      },
      trial: {
        freeTrialDate: null,
        introCharge: null,
        firstFullCharge: { date: "2020-01-01", amountCents: 1 },
      },
    } as unknown as Subscription;
    const [fresh] = classifySubscriptions([stale]);
    expect(fresh?.labels).toEqual([]);
    expect(fresh?.priceRise).toBeNull();
    expect(fresh?.trial).toBeNull();

    const [zombie] = classifySubscriptions(
      [NETFLIX_RISE],
      new Map([[NETFLIX_RISE.id, "not-using"]]),
    );
    expect(zombie?.labels).toEqual(["zombie", "possessed"]);
    const [again] = classifySubscriptions(
      [zombie as Subscription],
      new Map([[NETFLIX_RISE.id, "still-using"]]),
    );
    expect(again).toEqual(classifySubscriptions([NETFLIX_RISE])[0]);
    expect(again?.labels).toEqual(["possessed"]);
  });

  it("keeps an extra own property of the input", () => {
    const extra = { ...PLAIN, note: "kept" } as unknown as Subscription;
    const [result] = classifySubscriptions([extra]);
    expect((result as unknown as { note: string }).note).toBe("kept");
  });
});
