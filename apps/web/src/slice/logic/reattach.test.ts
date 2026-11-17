import type { Cadence, Subscription, UsageAnswer } from "@zombills/core";
import { describe, expect, it } from "vitest";
import type { AnswerRecord, Graveyard } from "./graveyard";
import { carriedOverCount, qualifyingCandidates, reattach } from "./reattach";
import { deepFreeze } from "./test-arbitraries";

const K = "unidentified:apple:apple.com/bill 866-712-7753 ca";
const FACTOR: Record<Cadence, number> = { weekly: 52, monthly: 12, yearly: 1 };

function record(
  id: string,
  merchant: string,
  amount: number,
  answer: UsageAnswer,
  extra: Partial<AnswerRecord> = {},
): AnswerRecord {
  const parts = id.split(":");
  const cadence = parts[2] as Cadence;
  return {
    id,
    merchant,
    serviceId: null,
    currency: parts[1] ?? "USD",
    cadence,
    currentAmountCents: amount,
    answer,
    cadenceAssumed: false,
    yearlySavingCents: amount * FACTOR[cadence],
    carriedOver: false,
    ...extra,
  };
}

function sub(
  id: string,
  amount: number,
  history: readonly number[],
  options: { guessed?: boolean; merchantKey?: string; merchant?: string } = {},
): Subscription {
  const parts = id.split(":");
  const cadence = parts[2] as Cadence;
  const date = "2026-01-12";
  return {
    id,
    merchant: options.merchant ?? "Apple",
    merchantKey: options.merchantKey ?? id.split(":").slice(4).join(":"),
    serviceId: null,
    source: "unidentified",
    currency: parts[1] ?? "USD",
    cadence,
    charges: [],
    currentAmountCents: amount,
    yearlyCostCents: amount * FACTOR[cadence],
    labels: [],
    priceHistory: history.map((amountCents) => ({ date, amountCents })),
    status: "active",
    confidence: "medium",
    evidence: {
      regularChargeCount: 3,
      firstChargeDate: date,
      lastChargeDate: date,
      nextExpectedDate: date,
      missedPeriods: 0,
      lateChargeDates: [],
      cadenceAssumed: options.guessed ?? false,
      introCharge: null,
      freeTrialDate: null,
      startedInStatement: false,
      partialRefunds: [],
    },
  };
}

const MUSIC = `sub:USD:monthly:1099:${K}`;
const ICLOUD = `sub:USD:monthly:99:${K}`;
const STAR = `sub:USD:monthly:*:${K}`;

describe("reattach: the Req 6.9 table", () => {
  it("row 1: Apple Music moves to the only Free subscription, iCloud+ stays Earlier", () => {
    const graveyard = deepFreeze([
      record(MUSIC, "Apple Music", 1099, "not-using"),
      record(ICLOUD, "iCloud+", 99, "still-using"),
    ]);
    const outcome = deepFreeze([sub(STAR, 1199, [1099, 1199])]);
    const moved = reattach(graveyard, outcome);
    expect(moved).toHaveLength(2);
    expect(moved[0]).toMatchObject({
      id: STAR,
      answer: "not-using",
      carriedOver: true,
      currentAmountCents: 1199,
      yearlySavingCents: 14388,
      cadenceAssumed: false,
    });
    expect(moved[1]).toBe(graveyard[1]);
    expect(carriedOverCount(graveyard, moved)).toBe(1);
  });

  it("row 2: Apple TV+ at 999 with history 999 must not take either record", () => {
    const graveyard = deepFreeze([
      record(MUSIC, "Apple Music", 1099, "not-using"),
      record(ICLOUD, "iCloud+", 99, "still-using"),
    ]);
    const outcome = deepFreeze([sub(STAR, 999, [999])]);
    expect(reattach(graveyard, outcome)).toBe(graveyard);
  });

  it("row 3: iCloud+ at 99 does not move to Apple Music at 1099", () => {
    const graveyard = deepFreeze([record(ICLOUD, "iCloud+", 99, "not-using")]);
    const outcome = deepFreeze([sub(STAR, 1099, [1099])]);
    expect(reattach(graveyard, outcome)).toBe(graveyard);
  });

  it("row 4: two Orphan records sharing their only candidate both stay Earlier", () => {
    const other = `sub:USD:monthly:999:${K}`;
    const graveyard = deepFreeze([
      record(MUSIC, "Apple Music", 1099, "still-using"),
      record(other, "Apple TV+", 999, "not-using"),
    ]);
    const outcome = deepFreeze([sub(STAR, 1099, [999, 1099])]);
    expect(reattach(graveyard, outcome)).toBe(graveyard);
  });

  it("row 5: two Qualifying candidates for one Orphan record give no move", () => {
    const graveyard = deepFreeze([record(MUSIC, "Apple Music", 1099, "not-using")]);
    const outcome = deepFreeze([
      sub(`sub:USD:monthly:1199:${K}`, 1199, [1099, 1199]),
      sub(`sub:USD:monthly:1299:${K}`, 1299, [1099, 1299]),
    ]);
    expect(reattach(graveyard, outcome)).toBe(graveyard);
  });

  it("row 6: a record whose id matches is not an Orphan record", () => {
    const id = "sub:USD:monthly:*:netflix";
    const graveyard = deepFreeze([record(id, "Netflix", 1599, "not-using")]);
    const outcome = deepFreeze([sub(id, 1599, [1599], { merchantKey: "netflix" })]);
    expect(reattach(graveyard, outcome)).toBe(graveyard);
  });

  it("row 7: a different Triple (currency) gives no move", () => {
    const graveyard = deepFreeze([
      record("sub:GBP:monthly:*:netflix", "Netflix", 1599, "not-using"),
    ]);
    const outcome = deepFreeze([
      sub("sub:USD:monthly:*:netflix", 1599, [1599], { merchantKey: "netflix" }),
    ]);
    expect(reattach(graveyard, outcome)).toBe(graveyard);
  });
});

describe("reattach: passes and edge cases", () => {
  // Task 14 asks for a "two passes" case (A moves in pass 1, leaving B one candidate in pass 2).
  // It cannot be built: a mover has one candidate s and claims(s) is 1, so no other Orphan record
  // has s as a candidate, and no other Orphan record's candidates or claims change. See the task
  // notes of task 14. This case pins what does hold: a move leaves the other Orphan record alone.
  it("a move in the first pass does not give another Orphan record a new candidate", () => {
    const idA = `sub:USD:monthly:1099:${K}`;
    const idB = `sub:USD:monthly:999:${K}`;
    const s1 = sub(`sub:USD:monthly:1199:${K}`, 1199, [1099, 1199]);
    const s2 = sub(`sub:USD:monthly:1299:${K}`, 1299, [999, 1299]);
    const s3 = sub(`sub:USD:monthly:1399:${K}`, 1399, [999, 1399]);
    const graveyard = deepFreeze([
      record(idA, "A", 1099, "not-using"),
      record(idB, "B", 999, "still-using"),
    ]);
    const moved = reattach(graveyard, deepFreeze([s1, s2, s3]));
    expect(moved[0]).toMatchObject({ id: s1.id, carriedOver: true });
    expect(moved[1]).toBe(graveyard[1]);
    expect(carriedOverCount(graveyard, moved)).toBe(1);
  });

  it("returns the same Graveyard object when nothing moves", () => {
    const graveyard: Graveyard = deepFreeze([record(MUSIC, "Apple Music", 1099, "not-using")]);
    expect(reattach(graveyard, [])).toBe(graveyard);
    expect(reattach([], deepFreeze([sub(STAR, 1099, [1099])]))).toEqual([]);
  });

  it("does not mutate frozen inputs", () => {
    const graveyard = deepFreeze([record(MUSIC, "Apple Music", 1099, "not-using")]);
    const outcome = deepFreeze([sub(STAR, 1199, [1099, 1199])]);
    expect(() => reattach(graveyard, outcome)).not.toThrow();
    expect(graveyard[0]?.id).toBe(MUSIC);
  });

  it("a guessed subscription qualifies only for a guessed record", () => {
    const guessed = sub(STAR, 1099, [1099], { guessed: true });
    const sure = record(MUSIC, "Apple Music", 1099, "not-using");
    const unsure = record(MUSIC, "Apple Music", 1099, "not-using", {
      cadenceAssumed: true,
      yearlySavingCents: null,
    });
    expect(qualifyingCandidates(sure, [guessed])).toEqual([]);
    expect(qualifyingCandidates(unsure, [guessed])).toEqual([guessed]);
    const moved = reattach(deepFreeze([unsure]), deepFreeze([guessed]));
    expect(moved[0]).toMatchObject({ id: STAR, cadenceAssumed: true, yearlySavingCents: null });
  });

  it("an id that does not parse has no candidates", () => {
    const odd = record("not-an-id", "X", 1099, "not-using");
    expect(qualifyingCandidates(odd, [sub(STAR, 1099, [1099])])).toEqual([]);
  });
});
