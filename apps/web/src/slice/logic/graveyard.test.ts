import { describe, expect, it } from "vitest";
import type { Subscription } from "@zombills/core";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./analyze-statement";
import {
  EMPTY_GRAVEYARD,
  answerRecordFor,
  answersMap,
  displayNames,
  isCurrentRecord,
  recordAnswer,
  refreshGraveyard,
  savingsTotals,
  settledGraveyard,
  stillDraining,
  type AnswerRecord,
} from "./graveyard";

function usResults() {
  const outcome = analyzeStatement(usSigned);
  if (outcome.kind !== "results") throw new Error("us-signed.csv should give results");
  return outcome;
}

function usSubscriptions(): Subscription[] {
  return usResults().subscriptions;
}

function byMerchant(subs: readonly Subscription[], merchant: string): Subscription {
  const found = subs.find((s) => s.merchant === merchant);
  if (!found) throw new Error(`no ${merchant}`);
  return found;
}

/** A hand-built guessed subscription (one charge, cadence assumed). */
function guessed(base: Subscription, overrides: Partial<Subscription> = {}): Subscription {
  return {
    ...base,
    id: "sub:USD:monthly:*:amazon-prime",
    merchant: "Amazon Prime",
    cadence: "monthly",
    currentAmountCents: 13_900,
    yearlyCostCents: 166_800,
    evidence: { ...base.evidence, cadenceAssumed: true },
    ...overrides,
  };
}

describe("Answer records (Req 5.8 table)", () => {
  it("buries Netflix, then Spotify, then a guessed Amazon Prime", () => {
    const subs = usSubscriptions();
    const netflix = byMerchant(subs, "Netflix");
    const spotify = byMerchant(subs, "Spotify");
    const prime = guessed(netflix);

    const first = recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
    expect(first).toEqual([
      expect.objectContaining({
        id: "sub:USD:monthly:*:netflix",
        answer: "not-using",
        cadenceAssumed: false,
        yearlySavingCents: 21_588,
      }),
    ]);

    const second = recordAnswer(first, spotify, "not-using");
    expect(second[1]).toMatchObject({
      id: "sub:USD:monthly:*:spotify",
      yearlySavingCents: 13_188,
    });

    const third = recordAnswer(second, prime, "not-using");
    expect(third).toHaveLength(3);
    expect(third[2]).toMatchObject({ cadenceAssumed: true, yearlySavingCents: null });
  });

  it("builds a record with exactly the eight AnswerRecord keys", () => {
    const record = answerRecordFor(byMerchant(usSubscriptions(), "Netflix"), "not-using");
    expect(Object.keys(record).sort()).toEqual(
      [
        "answer",
        "cadence",
        "cadenceAssumed",
        "currency",
        "currentAmountCents",
        "id",
        "merchant",
        "yearlySavingCents",
      ].sort(),
    );
  });
});

describe("recordAnswer and unbury (Req 8.6)", () => {
  it("keeps the record in its position when the answer changes and changes back", () => {
    const subs = usSubscriptions();
    const [a, b, c] = [subs[0], subs[1], subs[2]] as [Subscription, Subscription, Subscription];
    let graveyard = recordAnswer(EMPTY_GRAVEYARD, a, "not-using");
    graveyard = recordAnswer(graveyard, b, "not-using");
    graveyard = recordAnswer(graveyard, c, "still-using");
    const buried = graveyard;

    const unburied = recordAnswer(buried, b, "still-using");
    expect(unburied.map((r) => r.id)).toEqual(buried.map((r) => r.id));
    expect(unburied[1]?.answer).toBe("still-using");
    expect(unburied[1]?.yearlySavingCents).toBe(b.yearlyCostCents);

    expect(recordAnswer(unburied, b, "not-using")).toEqual(buried);
  });
});

describe("answersMap and isCurrentRecord", () => {
  it("lists only Current records", () => {
    const subs = usSubscriptions();
    const netflix = byMerchant(subs, "Netflix");
    const spotify = byMerchant(subs, "Spotify");
    const graveyard = recordAnswer(
      recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using"),
      spotify,
      "still-using",
    );
    const map = answersMap(graveyard, [netflix]);
    expect([...map]).toEqual([[netflix.id, "not-using"]]);
    expect(graveyard[1] && isCurrentRecord(graveyard[1], new Set([netflix.id]))).toBe(false);
  });
});

describe("refreshGraveyard (Req 9.5)", () => {
  it("refreshes a Current record from its subscription", () => {
    const netflix = byMerchant(usSubscriptions(), "Netflix");
    const graveyard = recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
    const raised: Subscription = {
      ...netflix,
      currentAmountCents: 2_000,
      yearlyCostCents: 24_000,
    };
    const [record] = refreshGraveyard(graveyard, [raised]);
    expect(record).toMatchObject({
      answer: "not-using",
      currentAmountCents: 2_000,
      yearlySavingCents: 24_000,
    });
  });

  it("keeps an Earlier record by identity", () => {
    const subs = usSubscriptions();
    const netflix = byMerchant(subs, "Netflix");
    const spotify = byMerchant(subs, "Spotify");
    const graveyard = recordAnswer(
      recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using"),
      spotify,
      "not-using",
    );
    const refreshed = refreshGraveyard(graveyard, [spotify]);
    expect(refreshed[0]).toBe(graveyard[0]);
    expect(refreshed).toHaveLength(2);
  });

  it("removes a record whose subscription turned guessed", () => {
    const netflix = byMerchant(usSubscriptions(), "Netflix");
    const graveyard = recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
    const nowGuessed: Subscription = {
      ...netflix,
      evidence: { ...netflix.evidence, cadenceAssumed: true },
    };
    expect(refreshGraveyard(graveyard, [nowGuessed])).toEqual([]);
  });

  it("keeps a guessed record that was already guessed", () => {
    const prime = guessed(byMerchant(usSubscriptions(), "Netflix"));
    const graveyard = recordAnswer(EMPTY_GRAVEYARD, prime, "not-using");
    expect(refreshGraveyard(graveyard, [prime])).toEqual(graveyard);
  });
});

describe("settledGraveyard", () => {
  it("drops the burying record only", () => {
    const subs = usSubscriptions();
    const netflix = byMerchant(subs, "Netflix");
    const spotify = byMerchant(subs, "Spotify");
    const graveyard = recordAnswer(
      recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using"),
      spotify,
      "not-using",
    );
    expect(settledGraveyard(graveyard, netflix.id).map((r) => r.id)).toEqual([spotify.id]);
    expect(settledGraveyard(graveyard, null)).toBe(graveyard);
  });
});

function record(
  currency: string,
  yearlySavingCents: number | null,
  answer = "not-using",
): AnswerRecord {
  return {
    id: `${currency}-${String(yearlySavingCents)}-${answer}`,
    merchant: "M",
    currency,
    cadence: "monthly",
    currentAmountCents: 1,
    answer: answer === "not-using" ? "not-using" : "still-using",
    cadenceAssumed: yearlySavingCents === null,
    yearlySavingCents,
  };
}

describe("savingsTotals (Req 6.8, 6.6)", () => {
  it("is empty without Tombstones", () => {
    expect(savingsTotals(EMPTY_GRAVEYARD)).toEqual([]);
    expect(savingsTotals([record("USD", 100, "still-using"), record("USD", null)])).toEqual([]);
  });

  it("gives one entry per currency in code-unit order", () => {
    expect(savingsTotals([record("USD", 21_588), record("GBP", 15_588)])).toEqual([
      { currency: "GBP", totalCents: 15_588 },
      { currency: "USD", totalCents: 21_588 },
    ]);
  });

  it("throws RangeError when two savings pass the safe integer limit", () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(() => savingsTotals([record("USD", big), record("USD", big)])).toThrow(RangeError);
  });
});

describe("stillDraining (Req 1.6a, 1.6b)", () => {
  it("follows burying and unburying Netflix in us-signed.csv", () => {
    const { subscriptions, totals } = usResults();
    const netflix = byMerchant(subscriptions, "Netflix");
    const usd = (graveyard: ReturnType<typeof recordAnswer>) =>
      stillDraining(totals, graveyard, subscriptions).find((e) => e.currency === "USD");

    expect(usd(EMPTY_GRAVEYARD)?.remainingCents).toBe(135_564);
    const buried = recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
    expect(usd(buried)?.remainingCents).toBe(113_976);
    expect(usd(recordAnswer(buried, netflix, "still-using"))?.remainingCents).toBe(135_564);
  });

  it("subtracts nothing for a guessed burial", () => {
    const { subscriptions, totals } = usResults();
    const prime = guessed(byMerchant(subscriptions, "Netflix"));
    const all = [...subscriptions, prime];
    const graveyard = recordAnswer(EMPTY_GRAVEYARD, prime, "not-using");
    expect(stillDraining(totals, graveyard, all)[0]?.remainingCents).toBe(135_564);
  });

  it("leaves the burying record out of both figures with settledGraveyard", () => {
    const { subscriptions, totals } = usResults();
    const netflix = byMerchant(subscriptions, "Netflix");
    const graveyard = recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
    const settled = settledGraveyard(graveyard, netflix.id);
    expect(savingsTotals(settled)).toEqual([]);
    expect(stillDraining(totals, settled, subscriptions)[0]?.remainingCents).toBe(135_564);
  });

  it("gives a currency with no Currency total a null remainder and the note", () => {
    const netflix = byMerchant(usSubscriptions(), "Netflix");
    const ended: Subscription = { ...netflix, currency: "GBP", status: "ended" };
    expect(stillDraining([], EMPTY_GRAVEYARD, [ended])).toEqual([
      { currency: "GBP", remainingCents: null, hasExcluded: true },
    ]);
  });

  it("clamps at 0 for hand-built input", () => {
    const netflix = byMerchant(usSubscriptions(), "Netflix");
    const graveyard = recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
    expect(
      stillDraining([{ currency: "USD", totalCents: 100 }], graveyard, [netflix])[0],
    ).toMatchObject({ remainingCents: 0 });
  });
});

describe("displayNames", () => {
  const item = (id: string, merchant: string, amount: number, currency = "USD") => ({
    id,
    merchant,
    currency,
    cadence: "monthly" as const,
    currentAmountCents: amount,
  });
  const APPLE = "Apple payment (merchant not shown)";

  it("tells two Apple subscriptions apart by amount and cadence", () => {
    const names = displayNames([item("a", APPLE, 99), item("b", APPLE, 299)], "en-US");
    expect(names.get("a")).toBe(`${APPLE}, $0.99 a month`);
    expect(names.get("b")).toBe(`${APPLE}, $2.99 a month`);
  });

  it("keeps the plain merchant when it is unique", () => {
    const names = displayNames([item("a", "Netflix", 1599), item("b", APPLE, 99)], "en-US");
    expect(names.get("a")).toBe("Netflix");
    expect(names.get("b")).toBe(APPLE);
  });

  it("treats items with the same id as one item", () => {
    const names = displayNames([item("a", "Netflix", 1599), item("a", "Netflix", 1599)], "en-US");
    expect([...names.values()]).toEqual(["Netflix"]);
  });

  it("suffixes equal long forms with (2)", () => {
    const names = displayNames([item("a", "A", 100), item("b", "A", 100)], "en-US");
    expect(names.get("a")).toBe("A, $1.00 a month");
    expect(names.get("b")).toBe("A, $1.00 a month (2)");
  });

  it("keeps three names distinct when a merchant looks like a suffixed long form", () => {
    const names = displayNames(
      [item("a", "A", 100), item("b", "A", 100), item("c", "A, $1.00 a month (2)", 500)],
      "en-US",
    );
    expect(new Set(names.values()).size).toBe(3);
    expect(names.get("a")).toBe("A, $1.00 a month");
    expect(names.get("b")).toBe("A, $1.00 a month (2)");
  });
});
