import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifySubscriptions, type Subscription } from "@zombills/core";
import {
  EMPTY_GRAVEYARD,
  answersMap,
  displayNames,
  isCurrentRecord,
  recordAnswer,
  refreshGraveyard,
  savingsTotals,
  stillDraining,
  type Graveyard,
} from "./graveyard";
import { currencyTotals, isCounted } from "./totals";
import {
  answerableListArb,
  answerRecordArb,
  deepFreeze,
  graveyardActionArb,
  subscriptionListArb,
  type GraveyardAction,
} from "./test-arbitraries";

const FACTOR = { weekly: 52, monthly: 12, yearly: 1 } as const;

/** A deterministic redraw of a list from a seed: some ids change, some drop, some are added. */
function redraw(list: readonly Subscription[], seed: number): Subscription[] {
  const next: Subscription[] = [];
  list.forEach((s, i) => {
    const bits = (seed >>> (i % 24)) & 7;
    if (bits === 0) return;
    const cadenceAssumed = bits === 1 ? !s.evidence.cadenceAssumed : s.evidence.cadenceAssumed;
    const currentAmountCents = bits === 2 ? s.currentAmountCents + 100 : s.currentAmountCents;
    next.push({
      ...s,
      currentAmountCents,
      yearlyCostCents: currentAmountCents * FACTOR[s.cadence],
      status: bits === 3 ? (s.status === "active" ? "ended" : "active") : s.status,
      evidence: { ...s.evidence, cadenceAssumed },
    });
  });
  const base = list[0];
  if (base !== undefined && (seed & 1) === 1) {
    next.push({ ...base, id: `added-${Math.abs(seed % 1000)}` });
  }
  return next;
}

/** Applies one action; returns the new list and Graveyard. Unknown ids and queue actions change nothing. */
function step(
  list: Subscription[],
  graveyard: Graveyard,
  action: GraveyardAction,
): { list: Subscription[]; graveyard: Graveyard } {
  if (action.type === "refresh") {
    const newList = redraw(list, action.seed);
    return { list: newList, graveyard: refreshGraveyard(graveyard, newList) };
  }
  if (action.type === "skip" || action.type === "answer-now") return { list, graveyard };
  const subscription = list.find((s) => s.id === action.id);
  if (subscription === undefined) return { list, graveyard };
  const answer =
    action.type === "record"
      ? action.answer
      : action.type === "unbury"
        ? "still-using"
        : "not-using";
  return { list, graveyard: recordAnswer(graveyard, subscription, answer) };
}

const scenarioArb = answerableListArb(8).chain((list) =>
  fc.record({
    list: fc.constant(list),
    actions: fc.array(graveyardActionArb(list.map((s) => s.id)), { maxLength: 25 }),
  }),
);

describe("answers properties", () => {
  it("P4: answers keep one record per id and follow the Req 9 rules", () => {
    fc.assert(
      fc.property(scenarioArb, ({ list: initial, actions }) => {
        let list = deepFreeze(initial);
        let graveyard: Graveyard = deepFreeze(EMPTY_GRAVEYARD);
        for (const action of actions) {
          const before = graveyard;
          const result = step(list, graveyard, action);
          list = deepFreeze(result.list);
          graveyard = deepFreeze(result.graveyard);

          // at most one record per id
          expect(new Set(graveyard.map((r) => r.id)).size).toBe(graveyard.length);

          if (action.type === "refresh") {
            const currentIds = new Set(list.map((s) => s.id));
            for (const record of graveyard) {
              const subscription = list.find((s) => s.id === record.id);
              if (subscription === undefined) {
                // Earlier records are the same objects as before
                expect(before).toContain(record);
              } else if (!record.cadenceAssumed) {
                expect(subscription.evidence.cadenceAssumed).toBe(false);
              }
            }
            // a removed record leaves its (guessed, Risen) subscription without a Current record
            const removed = before.filter(
              (r) => currentIds.has(r.id) && !graveyard.some((g) => g.id === r.id),
            );
            const answers = answersMap(graveyard, list);
            for (const record of removed) expect(answers.has(record.id)).toBe(false);
            continue;
          }
          if (action.type === "skip" || action.type === "answer-now") {
            expect(graveyard).toBe(before);
            continue;
          }

          const subscription = list.find((s) => s.id === action.id);
          if (subscription === undefined) {
            expect(graveyard).toBe(before);
            continue;
          }
          const expected =
            action.type === "record"
              ? action.answer
              : action.type === "unbury"
                ? "still-using"
                : "not-using";
          // the last answer given is the answer
          expect(graveyard.find((r) => r.id === action.id)?.answer).toBe(expected);
          // recording the same answer twice equals recording it once
          expect(recordAnswer(graveyard, subscription, expected)).toEqual(graveyard);
          // any action on one id leaves every other record deep-equal (Req 8.5)
          expect(graveyard.filter((r) => r.id !== action.id)).toEqual(
            before.filter((r) => r.id !== action.id),
          );
          // unbury then bury-after-all restores the buried record
          const buried = recordAnswer(graveyard, subscription, "not-using");
          const restored = recordAnswer(
            recordAnswer(buried, subscription, "still-using"),
            subscription,
            "not-using",
          );
          expect(restored).toEqual(buried);
        }

        // answersMap keys are exactly the Current record ids, with their answers
        const currentIds = new Set(list.map((s) => s.id));
        const answers = answersMap(graveyard, list);
        const currentRecords = graveyard.filter((r) => isCurrentRecord(r, currentIds));
        expect([...answers.keys()]).toEqual(currentRecords.map((r) => r.id));
        for (const record of currentRecords) expect(answers.get(record.id)).toBe(record.answer);

        // saving is null exactly when guessed, otherwise amount × factor
        for (const record of graveyard) {
          expect(record.yearlySavingCents === null).toBe(record.cadenceAssumed);
          if (!record.cadenceAssumed) {
            expect(record.yearlySavingCents).toBe(
              record.currentAmountCents * FACTOR[record.cadence],
            );
          }
        }
      }),
    );
  });
});

describe("classifier agreement properties", () => {
  it("P5: the zombie label appears exactly for active subscriptions with a not-using Current record", () => {
    const scenario = subscriptionListArb(8).chain((list) =>
      fc.record({
        list: fc.constant(list),
        actions: fc.array(graveyardActionArb(list.map((s) => s.id)), { maxLength: 25 }),
      }),
    );
    fc.assert(
      fc.property(scenario, ({ list: initial, actions }) => {
        let list = deepFreeze(initial);
        let graveyard: Graveyard = EMPTY_GRAVEYARD;
        for (const action of actions) {
          const result = step(list, graveyard, action);
          list = deepFreeze(result.list);
          graveyard = deepFreeze(result.graveyard);
        }
        const answers = answersMap(graveyard, list);
        const classified = classifySubscriptions(list, answers);
        for (const subscription of classified) {
          const expected =
            subscription.status === "active" && answers.get(subscription.id) === "not-using";
          expect(subscription.labels.includes("zombie")).toBe(expected);
        }
      }),
    );
  });
});

describe("Still draining properties", () => {
  it("P2: remaining plus Counted savings equals the Currency total", () => {
    fc.assert(
      fc.property(scenarioArb, ({ list: initial, actions }) => {
        const list = deepFreeze(initial);
        const totals = currencyTotals(list, []);
        const check = (graveyard: Graveyard): Map<string, number | null> => {
          const entries = stillDraining(totals, graveyard, list);
          expect(entries.map((e) => e.currency)).toEqual(
            [...new Set(list.map((s) => s.currency))].sort(),
          );
          const answers = answersMap(graveyard, list);
          const remaining = new Map<string, number | null>();
          for (const entry of entries) {
            remaining.set(entry.currency, entry.remainingCents);
            const total = totals.find((t) => t.currency === entry.currency);
            if (total === undefined) {
              expect(entry).toEqual({
                currency: entry.currency,
                remainingCents: null,
                hasExcluded: true,
              });
              continue;
            }
            let saved = 0n;
            for (const s of list) {
              if (s.currency !== entry.currency || !isCounted(s)) continue;
              const record = graveyard.find((r) => r.id === s.id);
              if (answers.get(s.id) === "not-using" && record?.yearlySavingCents != null) {
                saved += BigInt(record.yearlySavingCents);
              }
            }
            expect(entry.remainingCents).not.toBeNull();
            expect(Number.isSafeInteger(entry.remainingCents)).toBe(true);
            expect(entry.remainingCents as number).toBeGreaterThanOrEqual(0);
            expect(BigInt(entry.remainingCents as number) + saved).toBe(BigInt(total.totalCents));
          }
          return remaining;
        };

        let graveyard: Graveyard = EMPTY_GRAVEYARD;
        for (const action of actions) {
          if (action.type === "refresh") continue;
          graveyard = step(list, graveyard, action).graveyard;
          check(graveyard);
        }
        const counted = list.find(isCounted);
        if (counted !== undefined) {
          const base = recordAnswer(graveyard, counted, "still-using");
          const before = check(base);
          check(recordAnswer(base, counted, "not-using"));
          const after = check(
            recordAnswer(recordAnswer(base, counted, "not-using"), counted, "still-using"),
          );
          expect(after).toEqual(before);
        }
      }),
    );
  });
});

describe("Savings totals properties", () => {
  it("P3: totals match the BigInt reference per currency, or throw RangeError", () => {
    fc.assert(
      fc.property(fc.array(answerRecordArb, { maxLength: 1000 }), (records) => {
        const graveyard = deepFreeze(records);
        const reference = new Map<string, bigint>();
        for (const r of graveyard) {
          if (r.answer !== "not-using" || r.yearlySavingCents === null) continue;
          reference.set(
            r.currency,
            (reference.get(r.currency) ?? 0n) + BigInt(r.yearlySavingCents),
          );
        }
        const overflows = [...reference.values()].some((v) => v > BigInt(Number.MAX_SAFE_INTEGER));
        if (overflows) {
          expect(() => savingsTotals(graveyard)).toThrow(RangeError);
          return;
        }
        const totals = savingsTotals(graveyard);
        expect(totals.map((t) => t.currency)).toEqual([...reference.keys()].sort());
        for (const t of totals) expect(BigInt(t.totalCents)).toBe(reference.get(t.currency));
      }),
    );
  });

  it("P3: sums past the safe integer limit throw RangeError", () => {
    const big = (id: string): ReturnType<typeof deepFreeze<Graveyard>>[number] => ({
      id,
      merchant: "M",
      currency: "USD",
      cadence: "yearly",
      currentAmountCents: 1,
      answer: "not-using",
      cadenceAssumed: false,
      yearlySavingCents: Number.MAX_SAFE_INTEGER,
    });
    expect(() => savingsTotals([big("a"), big("b")])).toThrow(RangeError);
  });
});

describe("displayNames", () => {
  const mergedMerchants = ["A", "B", "A, $1.00 a month", "A, $1.00 a month (2)", "B (2)", ""];
  const itemArb = fc.record({
    id: fc.constantFrom("1", "2", "3", "4", "5", "6"),
    merchant: fc.constantFrom(...mergedMerchants),
    currency: fc.constantFrom("USD", "GBP"),
    cadence: fc.constantFrom("weekly", "monthly", "yearly"),
    currentAmountCents: fc.constantFrom(100, 500),
  });

  it("P6: names are distinct, one per id, and long forms start with the merchant", () => {
    fc.assert(
      fc.property(fc.array(itemArb, { maxLength: 8 }), (items) => {
        const names = displayNames(deepFreeze(items), "en-US");
        const ids = new Set(items.map((i) => i.id));
        expect([...names.keys()].sort()).toEqual([...ids].sort());
        expect(new Set(names.values()).size).toBe(names.size);

        const first = new Map<string, (typeof items)[number]>(
          items.map((i) => [i.id, i] as const).reverse(),
        );
        const idsPerMerchant = new Map<string, number>();
        for (const i of first.values()) {
          idsPerMerchant.set(i.merchant, (idsPerMerchant.get(i.merchant) ?? 0) + 1);
        }
        for (const [id, name] of names) {
          const merchant = first.get(id)?.merchant ?? "";
          const unique = idsPerMerchant.get(merchant) === 1;
          const clashes = [...names].some(
            ([otherId, other]) => otherId !== id && other === merchant,
          );
          if (unique && !clashes) expect(name).toBe(merchant);
          else expect(name.startsWith(unique ? `${merchant} (` : `${merchant}, `)).toBe(true);
        }
      }),
    );
  });
});
