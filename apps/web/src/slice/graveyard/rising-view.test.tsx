// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { useReducer } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "../logic/analyze-statement";
import type { AnalysisOutcome, ResultsOutcome } from "../logic/analyze-statement";
import { deriveHaunt } from "../logic/haunt-view";
import { MEMORY_ON_LINE, MEMORY_SETTINGS, carriedOverLine } from "../logic/memory-text";
import { formatMoney } from "../logic/money";
import { INITIAL_PAGE_MODEL, pageReducer } from "../page-state";
import type { PageAction, PageModel } from "../page-state";
import { RisingView } from "./rising-view";
import { App } from "../../App";
import { PRIMARY_ACTION_NAME } from "../logic/landing-text";
import { BARE_FOCUS } from "../landing/bare-focus";

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
function Harness({
  initial,
  actions,
  carriedOver = 0,
}: {
  initial: PageModel;
  actions: PageAction[];
  carriedOver?: number;
}) {
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
      carriedOver={carriedOver}
      reduceMotion={false}
      memoryOn={model.memory.on}
      dispatch={dispatch}
    />
  );
}

function renderRising(csv: string, memoryOn = false, carriedOver = 0) {
  const actions: PageAction[] = [];
  const model = modelFor(resultsOf(csv));
  const initial = memoryOn ? { ...model, memory: { ...model.memory, on: true } } : model;
  render(<Harness initial={initial} actions={actions} carriedOver={carriedOver} />);
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

describe("RisingView: carried over (Req 6.8)", () => {
  it("shows no line with carriedOver 0", () => {
    renderRising(usSigned);
    expect(screen.queryByText(/carried over/)).toBeNull();
  });

  it.each([1, 2])("shows the line directly after the Still-draining lines with %i", (n) => {
    renderRising(usSigned, false, n);
    const line = screen.getByText(carriedOverLine(n));
    expect(line.tagName).toBe("P");
    const draining = screen.getByText(/Still draining/);
    const lastDraining = draining.closest("div");
    expect(lastDraining?.nextElementSibling).toBe(line);
  });
});

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

describe("RisingView: Muted footnote (Req 10.1)", () => {
  it("shows the assumed-currency note as a muted p after the summary line", () => {
    renderRising(usSigned);
    const note = screen.getByText(
      "No currency was found in the statement, so amounts are shown in USD.",
    );
    expect(note.tagName).toBe("P");
    expect(note.classList.contains("text-caption")).toBe(true);
    expect(note.classList.contains("sm:text-small")).toBe(true);
    expect(note.classList.contains("text-bone/80")).toBe(true);
    const summary = screen.getByText(/transactions read/);
    expect(summary.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("RisingView: Memory on", () => {
  it("shows the reminder and a Memory settings button that opens the settings", () => {
    const actions = renderRising(usSigned, true);
    expect(screen.getByText(MEMORY_ON_LINE)).toBe(
      screen.getByText("Your answers are kept on this device."),
    );
    fireEvent.click(screen.getByRole("button", { name: MEMORY_SETTINGS }));
    expect(actions).toEqual([{ type: "open-memory-settings" }]);
  });

  it("shows neither while Memory is off", () => {
    renderRising(usSigned);
    expect(screen.queryByText(MEMORY_ON_LINE)).toBeNull();
    expect(screen.queryByRole("button", { name: MEMORY_SETTINGS })).toBeNull();
  });
});

describe("RisingView: Button variants (Req 6.5, 6.6)", () => {
  it("keeps Next primary and aria-disabled while burying; Open the graveyard is secondary", () => {
    const first = modelFor(resultsOf(usSigned));
    if (first.view.kind !== "results") throw new Error("expected results");
    const id = first.view.rising.order[0] as string;
    const burying = pageReducer(first, { type: "bury", id, reducedMotion: false });
    render(<Harness initial={burying} actions={[]} />);
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.getAttribute("data-variant")).toBe("primary");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(next.className).not.toContain("opacity-60");
    // "Next" sits on the bare scene, so it carries the bare-scene ring (review C #7).
    expect(next.className).toContain(BARE_FOCUS);
    expect(
      screen.getByRole("button", { name: "Open the graveyard" }).getAttribute("data-variant"),
    ).toBe("secondary");
  });

  it("makes Visit the graveyard primary and Memory settings secondary", () => {
    let model = modelFor(resultsOf(usSigned));
    for (;;) {
      const head = deriveHaunt(model).queue[0];
      if (head === undefined) break;
      model = pageReducer(model, { type: "keep", id: head });
      if (deriveHaunt(model).queue.length > 0) model = pageReducer(model, { type: "next" });
    }
    model = { ...model, memory: { ...model.memory, on: true } };
    render(<Harness initial={model} actions={[]} />);
    const visit = screen.getByRole("button", { name: "Visit the graveyard" });
    expect(visit.getAttribute("data-variant")).toBe("primary");
    expect(visit.hasAttribute("aria-disabled")).toBe(false);
    expect(
      screen.getByRole("button", { name: MEMORY_SETTINGS }).getAttribute("data-variant"),
    ).toBe("secondary");
  });
});

const THIRTEEN_CSV = [
  "Date,Description,Amount",
  ...[
    "ALDER",
    "BIRCH",
    "CEDAR",
    "DAMSON",
    "ELDER",
    "FIR",
    "GORSE",
    "HAZEL",
    "IVY",
    "JUNIPER",
    "KALE",
    "LARCH",
    "MAPLE",
  ].flatMap((word, i) =>
    ["01", "02", "03", "04"].map(
      (month) => `2026-${month}-${String(i + 2).padStart(2, "0")},${word} CLUB,-${10 + i}.00`,
    ),
  ),
].join("\n");

function progressDotsRow(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-progress-dots]");
}

function dotStates(): boolean[] {
  const row = progressDotsRow();
  if (row === null) throw new Error("no Progress dots");
  return Array.from(row.children).map((dot) => dot.classList.contains("bg-moss"));
}

describe("RisingView: Progress dots (Req 10.2)", () => {
  it("shows M dots, none filled, in an aria-hidden row after the progress text", () => {
    renderRising(usSigned);
    const row = progressDotsRow();
    expect(row?.getAttribute("aria-hidden")).toBe("true");
    expect(row?.classList.contains("flex-nowrap")).toBe(true);
    expect(row?.classList.contains("gap-[8px]")).toBe(true);
    expect(dotStates()).toEqual([false, false, false, false]);
    const text = screen.getByText("0 of 4 answered");
    expect(text.compareDocumentPosition(row as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const dot of Array.from(row?.children ?? [])) {
      expect(dot.classList.contains("rounded-pill")).toBe(true);
      expect(dot.classList.contains("border-bone/45")).toBe(true);
      // Fixed pixels, so the row never grows with the text size (Req 12.9).
      expect(dot.classList.contains("h-[8px]")).toBe(true);
      expect(dot.classList.contains("w-[8px]")).toBe(true);
    }
    expect(document.querySelector("[data-progress-bar]")).toBeNull();
  });

  it("fills the answered dot in the original Rising order after a Skip", () => {
    let model = modelFor(resultsOf(usSigned));
    if (model.view.kind !== "results") throw new Error("expected results");
    const original = [...model.view.rising.order];
    const first = original[0] as string;
    model = pageReducer(model, { type: "skip", id: first });
    if (model.view.kind !== "results") throw new Error("expected results");
    const head = model.view.rising.order[0] as string;
    expect(head).not.toBe(first);
    model = pageReducer(model, { type: "keep", id: head });
    render(<Harness initial={model} actions={[]} />);

    const text = screen.getByText(/^\d+ of 4 answered$/);
    const shown = Number(/^(\d+)/.exec(text.textContent ?? "")?.[1]);
    const states = dotStates();
    expect(states).toHaveLength(4);
    expect(states.filter(Boolean)).toHaveLength(shown);
    expect(states).toEqual(original.map((id) => id === head));
    // The dots add no text and no live region; the text alone carries the count.
    expect(progressDotsRow()?.textContent).toBe("");
    expect(progressDotsRow()?.querySelector("[aria-live]")).toBeNull();
  });

  it("shows the bar and no dots with 13 risen", () => {
    let model = modelFor(resultsOf(THIRTEEN_CSV));
    const haunt = deriveHaunt(model);
    expect(haunt.risen).toHaveLength(13);
    const head = haunt.queue[0] as string;
    model = pageReducer(model, { type: "keep", id: head });
    render(<Harness initial={model} actions={[]} />);

    expect(screen.getByText("1 of 13 answered")).toBeTruthy();
    expect(progressDotsRow()).toBeNull();
    const bar = document.querySelector<HTMLElement>("[data-progress-bar]");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
    for (const name of ["h-2", "w-24", "rounded-pill", "bg-bone/20"]) {
      expect(bar?.classList.contains(name)).toBe(true);
    }
    const fill = bar?.querySelector<HTMLElement>("[data-progress-fill]");
    expect(fill?.classList.contains("bg-moss")).toBe(true);
    expect(parseFloat(fill?.style.width ?? "")).toBeCloseTo((1 / 13) * 100, 5);
    expect(bar?.textContent).toBe("");
  });

  it("leaves the Live region text unchanged when a dot fills (Req 12.10)", async () => {
    window.location.hash = "";
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    expect(dotStates()).toEqual([false, false, false, false]);
    const name = screen.getByRole("heading", { level: 3 }).textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    await waitFor(() => expect(dotStates().filter(Boolean)).toHaveLength(1));
    // Exactly the Keep sentence: the dots add nothing to what is announced.
    expect(screen.getByRole("status").textContent).toBe(`${name} rests. Kept.`);
  });
});
