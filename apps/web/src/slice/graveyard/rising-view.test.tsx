// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { useReducer } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "../logic/analyze-statement";
import type { AnalysisOutcome, ResultsOutcome } from "../logic/analyze-statement";
import { deriveHaunt } from "../logic/haunt-view";
import { formatMoney } from "../logic/money";
import { INITIAL_PAGE_MODEL, pageReducer } from "../page-state";
import type { PageAction, PageModel } from "../page-state";
import { RisingView } from "./rising-view";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

function modelFor(outcome: AnalysisOutcome, sourceName = "statement.csv"): PageModel {
  const working = pageReducer(INITIAL_PAGE_MODEL, { type: "start", runId: 1, sourceName });
  return pageReducer(working, { type: "finish", runId: 1, outcome });
}

function resultsOf(csv: string): ResultsOutcome {
  const outcome = analyzeStatement(csv);
  if (outcome.kind !== "results") throw new Error(`expected results, got ${outcome.kind}`);
  return outcome;
}

/** Renders the Rising from a real `pageReducer` model and records every dispatched action. */
function Harness({ initial, actions }: { initial: PageModel; actions: PageAction[] }) {
  const [model, dispatch] = useReducer((m: PageModel, a: PageAction) => {
    actions.push(a);
    return pageReducer(m, a);
  }, initial);
  if (model.view.kind !== "results") throw new Error("expected the results view");
  const haunt = deriveHaunt(model);
  return (
    <RisingView
      sourceName={model.view.sourceName}
      outcome={model.view.outcome}
      rising={model.view.rising}
      haunt={haunt}
      reduceMotion={false}
      dispatch={dispatch}
    />
  );
}

function renderRising(csv: string) {
  const actions: PageAction[] = [];
  render(<Harness initial={modelFor(resultsOf(csv))} actions={actions} />);
  return actions;
}

const GUESSED_ONLY_CSV = [
  "Date,Description,Amount,Currency",
  "2026-01-05,NETFLIX.COM,-12.99,EUR",
  "2026-01-03,RIVERSIDE GYM,-30.00,USD",
  "2026-02-03,RIVERSIDE GYM,-30.00,USD",
  "2026-03-03,RIVERSIDE GYM,-30.00,USD",
].join("\n");

const ENDED_CSV = [
  "Date,Description,Amount",
  "2026-01-05,RIVERSIDE GYM,-30.00",
  "2026-02-05,RIVERSIDE GYM,-30.00",
  "2026-03-05,RIVERSIDE GYM,-30.00",
  "2026-06-20,CORNER BAKERY,-4.50",
].join("\n");

describe("RisingView", () => {
  it("shows the first card and the progress line for the US sample", () => {
    renderRising(usSigned);
    expect(screen.getByRole("heading", { level: 2, name: "Recurring charges found" })).toBeTruthy();
    expect(screen.getByText("0 of 4 answered")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Adobe Creative Cloud" })).toBeTruthy();
    expect(screen.getByText("Still using this?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open the graveyard" })).toBeTruthy();
    expect(screen.getByText(/Still draining/)).toBeTruthy();
  });

  it("runs the burial sequence to the tombstone and dispatches burial-step three times", async () => {
    const actions = renderRising(usSigned);
    const name = screen.getByRole("heading", { level: 3 }).textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: `Here lies ${name}.` })).toBeTruthy();
    });
    const steps = actions.filter((a) => a.type === "burial-step");
    expect(steps.map((a) => (a.type === "burial-step" ? a.from : null))).toEqual([
      "condemned",
      "sinking",
      "closing",
    ]);
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });

  it("names the stage group while burying", () => {
    const outcome = resultsOf(usSigned);
    const first = modelFor(outcome);
    if (first.view.kind !== "results") throw new Error("expected results");
    const id = first.view.rising.order[0] as string;
    const burying = pageReducer(first, { type: "bury", id, reducedMotion: false });
    const actions: PageAction[] = [];
    render(<Harness initial={burying} actions={actions} />);

    const name = deriveHaunt(burying).names.get(id) as string;
    const group = screen.getByRole("group", { name: `Burying ${name}` });
    expect(group).toBeTruthy();
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(next);
    expect(actions.some((a) => a.type === "next" || a.type === "open-graveyard")).toBe(false);
  });

  it("reads Next as Visit the graveyard once the Queue is empty", () => {
    let model = modelFor(resultsOf(usSigned));
    for (;;) {
      if (model.view.kind !== "results") throw new Error("expected results");
      const head = deriveHaunt(model).queue[0];
      if (head === undefined) break;
      model = pageReducer(model, { type: "keep", id: head });
      if (deriveHaunt(model).queue.length > 0) model = pageReducer(model, { type: "next" });
    }
    render(<Harness initial={model} actions={[]} />);
    expect(screen.getByText("Kept. It rests.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("button", { name: "Visit the graveyard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open the graveyard" })).toBeTruthy();
  });

  it("shows the all-answered state when the Queue is empty on the ask stage", () => {
    let model = modelFor(resultsOf(usSigned));
    for (;;) {
      const head = deriveHaunt(model).queue[0];
      if (head === undefined) break;
      model = pageReducer(model, { type: "keep", id: head });
      model = pageReducer(model, { type: "next" });
    }
    // `next` is ignored on an empty Queue; the way back from the Graveyard reaches `ask`.
    model = pageReducer(pageReducer(model, { type: "open-graveyard" }), { type: "back-to-rising" });
    render(<Harness initial={model} actions={[]} />);
    expect(screen.getByText("Every undead has an answer.")).toBeTruthy();
    expect(screen.getByText("4 of 4 answered")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Visit the graveyard" })).toBeTruthy();
    expect(screen.queryByText("Still using this?")).toBeNull();
  });

  it("shows No undead here. and the Already stopped list when nothing is Risen", () => {
    renderRising(ENDED_CSV);
    expect(screen.getByRole("heading", { level: 3, name: "No undead here." })).toBeTruthy();
    expect(screen.getByText("Every recurring charge found has already stopped.")).toBeTruthy();
    expect(screen.getByText(/last charged 5 Mar 2026/)).toBeTruthy();
    expect(screen.queryByText("Still using this?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    // The USD group has no Currency total, so only the not-included note shows.
    expect(screen.queryByText(/Still draining/)).toBeNull();
    expect(
      screen.getByText(/USD: Ended subscriptions and guessed ones are not included/),
    ).toBeTruthy();
  });

  it("shows the code-prefixed note alone for a guessed-only currency", () => {
    renderRising(GUESSED_ONLY_CSV);
    expect(
      screen.getByText("EUR: Ended subscriptions and guessed ones are not included in the total."),
    ).toBeTruthy();
    const draining = screen.getAllByText(/Still draining/);
    expect(draining).toHaveLength(1);
    expect(within(draining[0] as HTMLElement).getByText(formatMoney(36000, "USD"))).toBeTruthy();
    expect(screen.queryByText(/Still draining.*€/)).toBeNull();
  });
});
