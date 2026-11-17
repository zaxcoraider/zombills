import { describe, expect, it } from "vitest";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./analyze-statement";
import type { NoSubscriptionsOutcome, ResultsOutcome } from "./analyze-statement";
import { EMPTY_GRAVEYARD, recordAnswer, type Graveyard } from "./graveyard";
import { deriveHaunt, type HauntInput } from "./haunt-view";
import { risingOrder } from "./queue";

const NETFLIX = "sub:USD:monthly:*:netflix";

function usResults(): ResultsOutcome {
  const outcome = analyzeStatement(usSigned);
  if (outcome.kind !== "results") throw new Error("us-signed.csv should give results");
  return outcome;
}

function resultsInput(
  graveyard: Graveyard,
  stage: { kind: string; id?: string } = { kind: "ask" },
  outcome: ResultsOutcome = usResults(),
): HauntInput {
  return {
    view: {
      kind: "results",
      outcome,
      rising: { order: risingOrder(outcome.subscriptions, outcome.statement), stage },
    },
    graveyard,
  };
}

function buriedNetflix(outcome: ResultsOutcome): Graveyard {
  const netflix = outcome.subscriptions.find((s) => s.id === NETFLIX);
  if (!netflix) throw new Error("no Netflix");
  return recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
}

describe("deriveHaunt: us-signed.csv", () => {
  it("shows four undead and the full yearly drain with an empty Graveyard", () => {
    const haunt = deriveHaunt(resultsInput(EMPTY_GRAVEYARD), "en-US");
    expect(haunt.risen).toHaveLength(4);
    expect(haunt.answeredCount).toBe(0);
    expect(haunt.queue).toEqual(haunt.risen.map((s) => s.id));
    expect(haunt.stillDraining).toEqual([
      { currency: "USD", remainingCents: 135_564, hasExcluded: false },
    ]);
    expect(haunt.savings).toEqual([]);
    expect(haunt.fogCleared).toBe(false);
    expect(haunt.counterFallbackCurrency).toBe("USD");
  });

  it("leaves the counter and Still draining alone while Netflix is mid-burial", () => {
    const outcome = usResults();
    const haunt = deriveHaunt(
      resultsInput(buriedNetflix(outcome), { kind: "burying", id: NETFLIX }, outcome),
      "en-US",
    );
    expect(haunt.savings).toEqual([]);
    expect(haunt.stillDraining[0]?.remainingCents).toBe(135_564);
    expect(haunt.fogCleared).toBe(false);
    // The Answers map uses every record, so the card is already a zombie.
    expect(haunt.byId.get(NETFLIX)?.labels).toContain("zombie");
    expect(haunt.tombstones.map((r) => r.id)).toEqual([NETFLIX]);
    expect(haunt.answeredCount).toBe(1);
  });

  it("counts the saving once the burial settles", () => {
    const outcome = usResults();
    const haunt = deriveHaunt(
      resultsInput(buriedNetflix(outcome), { kind: "buried", id: NETFLIX }, outcome),
    );
    expect(haunt.savings).toEqual([{ currency: "USD", totalCents: 21_588 }]);
    expect(haunt.stillDraining[0]?.remainingCents).toBe(113_976);
    expect(haunt.byId.get(NETFLIX)?.labels).toContain("zombie");
    expect(haunt.queue).not.toContain(NETFLIX);
    expect(haunt.fogCleared).toBe(true);
    expect(haunt.currentIds.has(NETFLIX)).toBe(true);
  });

  it("lists kept records apart from tombstones", () => {
    const outcome = usResults();
    const spotify = outcome.subscriptions.find((s) => s.merchant === "Spotify");
    if (!spotify) throw new Error("no Spotify");
    const haunt = deriveHaunt(resultsInput(recordAnswer(EMPTY_GRAVEYARD, spotify, "still-using")));
    expect(haunt.kept.map((r) => r.id)).toEqual([spotify.id]);
    expect(haunt.tombstones).toEqual([]);
    expect(haunt.savings).toEqual([]);
  });

  it("shows an Earlier record under tombstones and counts its saving (Req 6.5)", () => {
    const outcome = usResults();
    const netflix = outcome.subscriptions.find((s) => s.id === NETFLIX);
    if (!netflix) throw new Error("no Netflix");
    const earlier = recordAnswer(
      EMPTY_GRAVEYARD,
      {
        ...netflix,
        id: "sub:GBP:monthly:*:netflix",
        currency: "GBP",
        currentAmountCents: 1_299,
        yearlyCostCents: 15_588,
      },
      "not-using",
    );
    const haunt = deriveHaunt(resultsInput(earlier), "en-US");
    expect(haunt.tombstones.map((r) => r.id)).toEqual(["sub:GBP:monthly:*:netflix"]);
    expect(haunt.currentIds.has("sub:GBP:monthly:*:netflix")).toBe(false);
    expect(haunt.savings).toEqual([{ currency: "GBP", totalCents: 15_588 }]);
    expect(haunt.names.get("sub:GBP:monthly:*:netflix")).toBe("Netflix, £12.99 a month");
    expect(haunt.names.get(NETFLIX)).toBe("Netflix, $17.99 a month");
  });

  it("keeps the tombstone of a now-Ended subscription, still counted, with no zombie label (Req 9.6)", () => {
    const base = usResults();
    const outcome: ResultsOutcome = {
      ...base,
      subscriptions: base.subscriptions.map((s) =>
        s.id === NETFLIX ? { ...s, status: "ended" } : s,
      ),
    };
    const netflix = base.subscriptions.find((s) => s.id === NETFLIX);
    if (!netflix) throw new Error("no Netflix");
    const graveyard = recordAnswer(EMPTY_GRAVEYARD, netflix, "not-using");
    const haunt = deriveHaunt(resultsInput(graveyard, { kind: "ask" }, outcome));
    expect(haunt.tombstones.map((r) => r.id)).toEqual([NETFLIX]);
    expect(haunt.savings).toEqual([{ currency: "USD", totalCents: 21_588 }]);
    expect(haunt.byId.get(NETFLIX)?.labels).not.toContain("zombie");
    expect(haunt.ended.map((s) => s.id)).not.toContain(NETFLIX);
    expect(haunt.risen.map((s) => s.id)).not.toContain(NETFLIX);
  });

  it("lists an Ended subscription without a record under ended", () => {
    const base = usResults();
    const outcome: ResultsOutcome = {
      ...base,
      subscriptions: base.subscriptions.map((s) =>
        s.id === NETFLIX ? { ...s, status: "ended" } : s,
      ),
    };
    const haunt = deriveHaunt(resultsInput(EMPTY_GRAVEYARD, { kind: "ask" }, outcome));
    expect(haunt.ended.map((s) => s.id)).toEqual([NETFLIX]);
    expect(haunt.risen).toHaveLength(3);
  });
});

describe("deriveHaunt: other views", () => {
  it("idle has no statement and no fallback currency", () => {
    const haunt = deriveHaunt({ view: { kind: "idle" }, graveyard: EMPTY_GRAVEYARD });
    expect(haunt.statement).toBeNull();
    expect(haunt.counterFallbackCurrency).toBeNull();
    expect(haunt.risen).toEqual([]);
    expect(haunt.stillDraining).toEqual([]);
  });

  it("working and error views also have no fallback currency but keep Graveyard names", () => {
    const outcome = usResults();
    const graveyard = buriedNetflix(outcome);
    for (const kind of ["working", "error"] as const) {
      const haunt = deriveHaunt({ view: { kind }, graveyard });
      expect(haunt.statement).toBeNull();
      expect(haunt.counterFallbackCurrency).toBeNull();
      expect(haunt.names.get(NETFLIX)).toBe("Netflix");
      expect(haunt.savings).toEqual([{ currency: "USD", totalCents: 21_588 }]);
    }
  });

  it("no-subscriptions keeps the first statement currency as fallback", () => {
    const base = usResults();
    const outcome: NoSubscriptionsOutcome = {
      kind: "no-subscriptions",
      transactionCount: base.transactionCount,
      rowErrorCount: base.rowErrorCount,
      statement: base.statement,
      detectedCurrency: base.detectedCurrency,
      detectedDateFormat: base.detectedDateFormat,
      detectedSignConvention: base.detectedSignConvention,
    };
    const haunt = deriveHaunt({
      view: { kind: "no-subscriptions", outcome },
      graveyard: EMPTY_GRAVEYARD,
    });
    expect(haunt.statement).toBe(base.statement);
    expect(haunt.counterFallbackCurrency).toBe("USD");
    expect(haunt.risen).toEqual([]);
    expect(haunt.queue).toEqual([]);
  });
});

describe("deriveHaunt: earlierIds", () => {
  const OTHER = {
    id: "sub:USD:monthly:*:old-gym",
    merchant: "Old Gym",
    currency: "USD",
    cadence: "monthly",
    currentAmountCents: 2_000,
  } as const;

  it("holds every record outside the results view", () => {
    const outcome = usResults();
    const netflix = outcome.subscriptions.find((s) => s.id === NETFLIX);
    if (!netflix) throw new Error("no Netflix");
    const graveyard = recordAnswer(
      buriedNetflix(outcome),
      { ...netflix, id: OTHER.id },
      "still-using",
    );
    for (const kind of ["idle", "working", "error"] as const) {
      expect(deriveHaunt({ view: { kind }, graveyard }).earlierIds).toEqual(
        new Set(graveyard.map((record) => record.id)),
      );
    }
  });

  it("holds only the non-Current records in results", () => {
    const outcome = usResults();
    const netflix = outcome.subscriptions.find((s) => s.id === NETFLIX);
    if (!netflix) throw new Error("no Netflix");
    const graveyard = recordAnswer(
      buriedNetflix(outcome),
      { ...netflix, id: OTHER.id, merchant: OTHER.merchant },
      "still-using",
    );
    const haunt = deriveHaunt(resultsInput(graveyard, { kind: "ask" }, outcome));
    expect(haunt.earlierIds).toEqual(new Set([OTHER.id]));
    expect(haunt.currentIds.has(NETFLIX)).toBe(true);
  });

  it("is empty for an empty Graveyard", () => {
    expect(deriveHaunt(resultsInput(EMPTY_GRAVEYARD)).earlierIds.size).toBe(0);
  });
});
