import { describe, expect, it } from "vitest";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./analyze-statement";
import type { NoSubscriptionsOutcome, ResultsOutcome } from "./analyze-statement";
import { announcement, cardSentence } from "./announce";
import { errorMessage } from "./messages";
import { formatMoney } from "./money";
import { INITIAL_PAGE_MODEL, pageReducer } from "../page-state";
import type { PageModel, PageView } from "../page-state";

const NETFLIX = "sub:USD:monthly:*:netflix";

function usResults(): ResultsOutcome {
  const outcome = analyzeStatement(usSigned);
  if (outcome.kind !== "results") throw new Error("us-signed.csv should give results");
  return outcome;
}

/** The page after the file finished, reached through the reducer so event and focus are real. */
function resultsModel(outcome: ResultsOutcome = usResults()): PageModel {
  const working = pageReducer(INITIAL_PAGE_MODEL, { type: "start", runId: 1, sourceName: "a.csv" });
  return pageReducer(working, { type: "finish", runId: 1, outcome });
}

function withView(view: PageView): PageModel {
  return { ...INITIAL_PAGE_MODEL, view };
}

function headId(model: PageModel): string {
  if (model.event?.kind !== "card") throw new Error("no card event");
  return model.event.id;
}

/** Walks the Queue until `id` is the head, with the card showing. */
function skipTo(model: PageModel, id: string): PageModel {
  let current = model;
  for (let i = 0; i < 10 && headId(current) !== id; i += 1) {
    current = pageReducer(current, { type: "skip", id: headId(current) });
  }
  return current;
}

function buried(model: PageModel, id: string): PageModel {
  const asked = skipTo(model, id);
  const burying = pageReducer(asked, { type: "bury", id, reducedMotion: true });
  return pageReducer(burying, { type: "burial-finish", id });
}

describe("announcement: slice views", () => {
  it("is empty when idle", () => {
    expect(announcement(INITIAL_PAGE_MODEL)).toBe("");
  });

  it("names the source while working", () => {
    expect(announcement(withView({ kind: "working", sourceName: "march.csv" }))).toBe(
      "Reading march.csv…",
    );
  });

  it("says no recurring charges were found", () => {
    const outcome: NoSubscriptionsOutcome = {
      ...usResults(),
      kind: "no-subscriptions",
    } as unknown as NoSubscriptionsOutcome;
    expect(announcement(withView({ kind: "no-subscriptions", sourceName: "a.csv", outcome }))).toBe(
      "No recurring charges found.",
    );
  });

  it("announces the summary of the error message", () => {
    const error = { kind: "too-large" } as const;
    expect(announcement(withView({ kind: "error", sourceName: null, error }))).toBe(
      errorMessage(error).summary,
    );
  });
});

describe("announcement: results", () => {
  it("announces the count, Still draining and the first card", () => {
    expect(announcement(resultsModel(), "en-US")).toBe(
      "Found 4 recurring charges. Still draining $1,355.64 a year. Adobe Creative Cloud. Monthly, $54.99. $659.88 a year. Still using this?",
    );
  });

  it("announces only the card when the card changes without being the first", () => {
    const model = resultsModel();
    const skipped = pageReducer(model, { type: "skip", id: headId(model) });
    const text = announcement(skipped, "en-US");
    expect(text).not.toContain("Found");
    expect(text).not.toContain("Still draining");
    expect(text).toContain("Still using this?");
    expect(text).not.toContain("Adobe Creative Cloud");
  });

  it("ends Netflix's card sentence with the price-rise sentence", () => {
    const text = announcement(skipTo(resultsModel(), NETFLIX), "en-US");
    expect(text).toBe(
      "Netflix. Monthly, $17.99. $215.88 a year. Still using this? Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year).",
    );
  });

  it("calls a guessed yearly cost an estimate", () => {
    const outcome = usResults();
    const netflix = outcome.subscriptions.find((s) => s.id === NETFLIX);
    if (!netflix) throw new Error("no Netflix");
    const guessed = {
      ...netflix,
      evidence: { ...netflix.evidence, cadenceAssumed: true },
    };
    expect(cardSentence(guessed, "Netflix", "en-US")).toContain(
      "about $215.88 a year (estimate). Still using this?",
    );
  });

  it("says there is no undead when nothing rose", () => {
    const base = usResults();
    const none = resultsModel({
      ...base,
      subscriptions: base.subscriptions.map((s) => ({ ...s, status: "ended" as const })),
    });
    const text = announcement(none, "en-US");
    expect(text.startsWith("Found 4 recurring charges. Still draining ")).toBe(true);
    expect(text.endsWith(" a year. No undead here.")).toBe(true);
  });

  it("gives one Still-draining sentence per currency with a figure", () => {
    const base = usResults();
    const outcome: ResultsOutcome = {
      ...base,
      subscriptions: base.subscriptions.map((s) =>
        s.id === NETFLIX ? { ...s, currency: "EUR", id: "sub:EUR:monthly:*:netflix" } : s,
      ),
      totals: [
        { currency: "EUR", totalCents: 21_588 },
        { currency: "USD", totalCents: 113_976 },
      ],
    };
    const text = announcement(resultsModel(outcome), "en-US");
    expect(text).toContain("Still draining €215.88 a year. Still draining $1,139.76 a year.");
  });
});

describe("announcement: haunt events", () => {
  it("announces keep", () => {
    const model = resultsModel();
    const id = headId(model);
    const kept = pageReducer(model, { type: "keep", id });
    expect(announcement(kept, "en-US")).toBe("Adobe Creative Cloud rests. Kept.");
  });

  it("announces a burial with the saving, the totals and Still draining (Req 14.3)", () => {
    expect(announcement(buried(resultsModel(), NETFLIX), "en-US")).toBe(
      "Netflix is buried. Saves $215.88 a year. Saved per year: $215.88. Still draining $1,139.76 a year.",
    );
  });

  it("announces a guessed burial without a saving", () => {
    const base = usResults();
    const outcome: ResultsOutcome = {
      ...base,
      subscriptions: base.subscriptions.map((s) =>
        s.id === NETFLIX ? { ...s, evidence: { ...s.evidence, cadenceAssumed: true } } : s,
      ),
    };
    const text = announcement(buried(resultsModel(outcome), NETFLIX), "en-US");
    expect(text.startsWith("Netflix is buried. Saving unknown: guessed from one charge.")).toBe(
      true,
    );
    expect(text).not.toContain("Saves");
    expect(text).toContain("Still draining");
  });

  it("announces an unbury with Still draining", () => {
    const opened = pageReducer(buried(resultsModel(), NETFLIX), { type: "open-graveyard" });
    const text = announcement(pageReducer(opened, { type: "unbury", id: NETFLIX }), "en-US");
    expect(text).toBe("Netflix is unburied and rests. Still draining $1,355.64 a year.");
  });

  it("announces the graveyard screen when no event is pending", () => {
    const opened = pageReducer(resultsModel(), { type: "open-graveyard" });
    expect(announcement(opened, "en-US")).toBe("Your graveyard.");
  });

  it("announces that every undead has an answer", () => {
    let model = resultsModel();
    for (let i = 0; i < 4; i += 1) {
      const kept = pageReducer(model, { type: "keep", id: headId(model) });
      model = i < 3 ? pageReducer(kept, { type: "next" }) : kept;
    }
    const opened = pageReducer(model, { type: "open-graveyard" });
    const done = pageReducer(opened, { type: "back-to-rising" });
    expect(done.event).toEqual({ kind: "all-answered" });
    expect(announcement(done)).toBe("Every undead has an answer.");
  });

  it("matches formatMoney with the given locale", () => {
    const text = announcement(resultsModel(), "de-DE");
    expect(text).toContain(formatMoney(135_564, "USD", "de-DE"));
    expect(text).not.toBe(announcement(resultsModel(), "en-US"));
  });
});
