// P1 to P3 of the subscription classifier (design "Correctness properties"). Each runs on both
// sources of Req 11.1: (a) detector output and (b) hand-built Subscriptions.

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { Subscription } from "../detect/types.js";
import { classifySubscriptions } from "./classify-subscriptions.js";
import { answersArb, classifierSubscriptionsArb, detectorOutputArb } from "./test-arbitraries.js";
import { oracle } from "./test-oracle.js";
import type { ClassifiedSubscription, UsageAnswer } from "./types.js";

const SOURCES: readonly (readonly [string, fc.Arbitrary<Subscription[]>])[] = [
  ["detector output", detectorOutputArb],
  ["classifier subscriptions", classifierSubscriptionsArb],
];

const LABEL_ORDER: readonly string[] = ["zombie", "possessed", "trial-trap"];

/** Subscriptions together with an `answers` value (usually a Map, sometimes not). */
function inputArb(source: fc.Arbitrary<Subscription[]>): fc.Arbitrary<[Subscription[], unknown]> {
  return source.chain((subs) =>
    answersArb(subs.map((s) => s.id)).map((answers): [Subscription[], unknown] => [subs, answers]),
  );
}

/**
 * `answers` is typed `unknown` by the generator because the classifier must accept values its
 * signature forbids (Req 1.10); the cast is the only way to pass them.
 */
function run(subs: readonly Subscription[], answers: unknown): ClassifiedSubscription[] {
  return classifySubscriptions(subs, answers as ReadonlyMap<string, UsageAnswer> | undefined);
}

function answerOf(answers: unknown, id: string): unknown {
  return answers instanceof Map ? (answers.get(id) as unknown) : undefined;
}

function without(value: object, keys: readonly string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

const RESULT_KEYS = ["labels", "priceRise", "trial"] as const;

describe.each(SOURCES)("classifySubscriptions properties on %s", (_name, source) => {
  it("P1: never throws, order kept", () => {
    fc.assert(
      fc.property(inputArb(source), ([subs, answers]) => {
        const result = run(subs, answers);
        expect(result).toHaveLength(subs.length);
        expect(result.map((r) => r.id)).toStrictEqual(subs.map((s) => s.id));
      }),
      { numRuns: 300 },
    );
  });

  it("P2: no other field changes, inputs are not mutated", () => {
    fc.assert(
      fc.property(inputArb(source), ([subs, answers]) => {
        const subsBefore = structuredClone(subs);
        // A non-Map `answers` may hold a function, which structuredClone cannot copy; a spy on
        // `get` shows the classifier never reads it.
        let spy: ReturnType<typeof vi.fn> | null = null;
        let answersBefore: unknown = null;
        if (answers instanceof Map) {
          answersBefore = structuredClone(answers);
        } else if (
          typeof answers === "object" &&
          answers !== null &&
          typeof (answers as { get?: unknown }).get === "function"
        ) {
          // Test double on a fresh object from the generator.
          spy = vi.fn((answers as { get: (...a: unknown[]) => unknown }).get);
          (answers as { get: unknown }).get = spy;
        }

        const result = run(subs, answers);

        expect(subs).toStrictEqual(subsBefore);
        if (answers instanceof Map) expect(answers).toStrictEqual(answersBefore);
        if (spy !== null) expect(spy).not.toHaveBeenCalled();
        expect(result).toHaveLength(subs.length);
        result.forEach((r, i) => {
          const input = subs[i] as Subscription;
          expect(without(r, RESULT_KEYS)).toStrictEqual(without(input, RESULT_KEYS));
          expect(r).not.toBe(input);
          expect(r.labels).not.toBe(input.labels);
        });
      }),
    );
  });

  it("P3: labels only from evidence", () => {
    fc.assert(
      fc.property(inputArb(source), ([subs, answers]) => {
        const result = run(subs, answers);
        result.forEach((r, i) => {
          const s = subs[i] as Subscription;
          const answer = answerOf(answers, s.id);
          const expected = oracle(s, answer);

          expect(r.labels).toStrictEqual(expected.labels);
          expect(r.priceRise !== null).toBe(expected.hasPriceRise);
          expect(r.trial !== null).toBe(expected.hasTrial);

          expect(r.labels.includes("possessed")).toBe(r.priceRise !== null);
          expect(r.labels.includes("trial-trap")).toBe(r.trial !== null);
          expect(r.labels.includes("zombie")).toBe(s.status === "active" && answer === "not-using");
          if (s.status === "ended") expect(r.labels).toStrictEqual([]);
          if (s.evidence.cadenceAssumed) {
            for (const label of r.labels) expect(label).toBe("zombie");
          }

          expect(new Set(r.labels).size).toBe(r.labels.length);
          const positions = r.labels.map((label) => LABEL_ORDER.indexOf(label));
          expect(positions.every((p) => p >= 0)).toBe(true);
          expect(positions).toStrictEqual([...positions].sort((a, b) => a - b));

          const intro = expected.inferredIntro;
          if (intro !== null && r.trial !== null && r.priceRise !== null) {
            expect(r.trial.introCharge).toStrictEqual(intro);
            expect(r.priceRise.firstSeen).not.toStrictEqual(intro);
          }
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe("P1: input that is not an array", () => {
  it("P1: a non-array input throws TypeError, and [] gives []", () => {
    fc.assert(
      fc.property(
        fc.anything().filter((value) => !Array.isArray(value)),
        answersArb([]),
        (value, answers) => {
          expect(() =>
            classifySubscriptions(value as unknown as Subscription[], answers as undefined),
          ).toThrow(TypeError);
        },
      ),
      { numRuns: 300 },
    );
    expect(classifySubscriptions([])).toStrictEqual([]);
  });

  it("P1: [] gives [] for every answers value", () => {
    fc.assert(
      fc.property(answersArb([]), (answers) => {
        expect(run([], answers)).toStrictEqual([]);
      }),
    );
  });
});

/** The results with `"zombie"` removed from every `labels`. */
function withoutZombie(results: readonly ClassifiedSubscription[]): ClassifiedSubscription[] {
  return results.map((r) => ({ ...r, labels: r.labels.filter((label) => label !== "zombie") }));
}

/** Two independent `answers` values for the same input. */
function twoAnswersArb(
  source: fc.Arbitrary<Subscription[]>,
): fc.Arbitrary<[Subscription[], unknown, unknown]> {
  return source.chain((subs) => {
    const ids = subs.map((s) => s.id);
    return fc
      .tuple(answersArb(ids), answersArb(ids))
      .map(([a, b]): [Subscription[], unknown, unknown] => [subs, a, b]);
  });
}

describe.each(SOURCES)("classifySubscriptions properties (P6 to P9) on %s", (_name, source) => {
  it("P6: idempotent", () => {
    fc.assert(
      fc.property(twoAnswersArb(source), ([subs, a, b]) => {
        const once = run(subs, a);
        expect(run(once, a)).toStrictEqual(once);
        expect(run(run(subs, a), b)).toStrictEqual(run(subs, b));
      }),
    );
  });

  it("P7: deterministic", () => {
    fc.assert(
      fc.property(inputArb(source), ([subs, answers]) => {
        expect(run(subs, answers)).toStrictEqual(run(subs, answers));
      }),
    );
  });

  it("P8: answers touch only zombie, extra keys change nothing", () => {
    fc.assert(
      fc.property(twoAnswersArb(source), ([subs, a, b]) => {
        expect(withoutZombie(run(subs, a))).toStrictEqual(withoutZombie(run(subs, b)));
      }),
    );

    fc.assert(
      fc.property(
        inputArb(source),
        fc.array(
          fc.tuple(
            fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
            fc.constantFrom("still-using", "not-using", "maybe", null, 1, undefined),
          ),
          { maxLength: 6 },
        ),
        ([subs, answers], extra) => {
          if (!(answers instanceof Map)) return;
          const ids = new Set(subs.map((s) => s.id));
          const widened = new Map<unknown, unknown>(answers);
          for (const [key, value] of extra) {
            if (typeof key === "string" && ids.has(key)) continue;
            widened.set(key, value);
          }
          expect(run(subs, widened)).toStrictEqual(run(subs, answers));
        },
      ),
    );
  });

  it("P9: input order", () => {
    fc.assert(
      fc.property(
        inputArb(source).chain(([subs, answers]) =>
          fc
            .shuffledSubarray(subs, { minLength: subs.length, maxLength: subs.length })
            .map((shuffled): [Subscription[], Subscription[], unknown] => [
              subs,
              shuffled,
              answers,
            ]),
        ),
        ([subs, shuffled, answers]) => {
          expect(shuffled).toHaveLength(subs.length);
          const byId = new Map(run(subs, answers).map((r) => [r.id, r]));
          const expected = shuffled.map((s) => byId.get(s.id));
          expect(run(shuffled, answers)).toStrictEqual(expected);
        },
      ),
    );
  });
});
