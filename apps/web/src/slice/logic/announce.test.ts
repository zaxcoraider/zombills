import { describe, expect, it } from "vitest";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./analyze-statement";
import type { NoSubscriptionsOutcome, ResultsOutcome } from "./analyze-statement";
import { announcement, cardSentence } from "./announce";
import { errorMessage } from "./messages";
import {
  FORGOTTEN,
  FORGOTTEN_REMOVE_FAILED,
  MEMORY_KEPT,
  MEMORY_NOT_KEPT,
  MEMORY_NOT_KEPT_REMOVE_FAILED,
  WRITE_FAILED_NOTE,
  carriedOverLine,
  leftOutNote,
} from "./memory-text";
import { recordAnswer } from "./graveyard";
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

describe("announcement: carried over (Req 6.8)", () => {
  function carried(model: PageModel, carriedOver: number): PageModel {
    if (model.view.kind !== "results") throw new Error("expected results");
    return { ...model, view: { ...model.view, carriedOver } };
  }

  it.each([
    [1, "1 earlier answer was carried over to this statement."],
    [2, "2 earlier answers were carried over to this statement."],
  ])("adds the line after Still draining in the first card sentence with %i", (n, line) => {
    expect(carriedOverLine(n)).toBe(line);
    expect(announcement(carried(resultsModel(), n), "en-US")).toBe(
      `Found 4 recurring charges. Still draining $1,355.64 a year. ${line} Adobe Creative Cloud. Monthly, $54.99. $659.88 a year. Still using this?`,
    );
  });

  it("adds the line to the default results sentence before No undead here", () => {
    const base = usResults();
    const none = resultsModel({
      ...base,
      subscriptions: base.subscriptions.map((s) => ({ ...s, status: "ended" as const })),
    });
    const text = announcement(carried(none, 2), "en-US");
    expect(
      text.endsWith(
        " a year. 2 earlier answers were carried over to this statement. No undead here.",
      ),
    ).toBe(true);
  });

  it("adds nothing with carriedOver 0 or to a card that is not the first", () => {
    expect(announcement(resultsModel(), "en-US")).not.toContain("carried over");
    const model = carried(resultsModel(), 1);
    const skipped = pageReducer(model, { type: "skip", id: headId(model) });
    expect(announcement(skipped, "en-US")).not.toContain("carried over");
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

describe("announcement: memory events", () => {
  const memoryModel = (
    what: "kept" | "not-kept" | "write-failed" | "left-out" | "forgotten",
    leftOut = 0,
    removeFailed = false,
  ): PageModel => ({
    ...INITIAL_PAGE_MODEL,
    memory: { ...INITIAL_PAGE_MODEL.memory, leftOut },
    event: removeFailed ? { kind: "memory", what, removeFailed: true } : { kind: "memory", what },
  });

  it("announces each memory event", () => {
    expect(announcement(memoryModel("kept"))).toBe(MEMORY_KEPT);
    expect(announcement(memoryModel("not-kept"))).toBe(MEMORY_NOT_KEPT);
    expect(announcement(memoryModel("write-failed"))).toBe(WRITE_FAILED_NOTE);
    expect(announcement(memoryModel("left-out", 2))).toBe(leftOutNote(2));
    expect(announcement(memoryModel("forgotten"))).toBe(FORGOTTEN);
  });

  it("adds the singular and plural left-out note to kept", () => {
    expect(announcement(memoryModel("kept", 1))).toBe(`${MEMORY_KEPT} ${leftOutNote(1)}`);
    expect(announcement(memoryModel("kept", 2))).toBe(`${MEMORY_KEPT} ${leftOutNote(2)}`);
    expect(leftOutNote(1)).not.toBe(leftOutNote(2));
  });

  it("announces one combined sentence when the removal failed", () => {
    expect(announcement(memoryModel("not-kept", 0, true))).toBe(MEMORY_NOT_KEPT_REMOVE_FAILED);
    expect(announcement(memoryModel("forgotten", 0, true))).toBe(FORGOTTEN_REMOVE_FAILED);
  });

  it("uses the Display name for Earlier records", () => {
    const base = pageReducer(resultsModel(), { type: "open-graveyard" });
    const netflix = usResults().subscriptions.find((s) => s.id === NETFLIX);
    if (!netflix) throw new Error("no Netflix");
    const earlier = { ...netflix, id: "sub:USD:monthly:*:old-gym", merchant: "Old Gym" };
    const open: PageModel = {
      ...base,
      graveyard: recordAnswer(
        recordAnswer([], earlier, "not-using"),
        { ...earlier, id: "sub:USD:monthly:*:old-gym-2", merchant: "Old Gym Two" },
        "still-using",
      ),
    };
    const unburied = pageReducer(open, { type: "unbury", id: earlier.id });
    expect(announcement(unburied, "en-US")).toMatch(/^Old Gym is unburied and rests\./);
    const reburied = pageReducer(unburied, { type: "bury-after-all", id: earlier.id });
    expect(announcement(reburied, "en-US")).toMatch(/^Old Gym is buried\. Saves /);
  });
});
