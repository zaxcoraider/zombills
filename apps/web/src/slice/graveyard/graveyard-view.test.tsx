// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "../logic/analyze-statement";
import type { AnalysisOutcome, ResultsOutcome } from "../logic/analyze-statement";
import { answerRecordFor } from "../logic/graveyard";
import { deriveHaunt } from "../logic/haunt-view";
import { EARLIER_NOTE } from "../logic/memory-text";
import { formatMoney } from "../logic/money";
import { INITIAL_PAGE_MODEL, pageReducer } from "../page-state";
import type { PageAction, PageModel } from "../page-state";
import { GraveyardView } from "./graveyard-view";
import { APPLE_99, APPLE_299, APPLE_PAIR } from "./test-fixtures";
import { expectUniqueButtonNames } from "./test-a11y";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(cleanup);
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

function resultsOf(csv: string): ResultsOutcome {
  const outcome = analyzeStatement(csv);
  if (outcome.kind !== "results") throw new Error(`expected results, got ${outcome.kind}`);
  return outcome;
}

function load(model: PageModel, outcome: AnalysisOutcome, runId: number): PageModel {
  const working = pageReducer(model, { type: "start", runId, sourceName: "statement.csv" });
  return pageReducer(working, { type: "finish", runId, outcome });
}

function headId(model: PageModel): string {
  const { view, graveyard } = model;
  if (view.kind !== "results") throw new Error("expected the results view");
  const answered = new Set(graveyard.map((record) => record.id));
  const id = view.rising.order.find((candidate) => !answered.has(candidate));
  if (id === undefined) throw new Error("no card is waiting");
  return id;
}

type Step = "keep" | "bury" | "skip";

/** Answers the card at the head of the Queue; the reducer does the rest. */
function answer(model: PageModel, step: Step): PageModel {
  const id = headId(model);
  if (step === "skip") return pageReducer(model, { type: "skip", id });
  if (step === "keep")
    return pageReducer(pageReducer(model, { type: "keep", id }), { type: "next" });
  const burying = pageReducer(model, { type: "bury", id, reducedMotion: true });
  const buried = pageReducer(burying, { type: "burial-finish", id });
  return buried.view.kind === "results" && buried.graveyard.length < 4
    ? pageReducer(buried, { type: "next" })
    : buried;
}

/** Adobe kept, the gym skipped, Netflix and Spotify buried, then the Graveyard opened. */
function usGraveyardModel(): PageModel {
  let model = load(INITIAL_PAGE_MODEL, resultsOf(usSigned), 1);
  model = answer(model, "keep");
  model = answer(model, "skip");
  model = answer(model, "bury");
  model = answer(model, "bury");
  return pageReducer(model, { type: "open-graveyard" });
}

function renderView(
  model: PageModel,
  options: {
    hasStatement?: boolean;
    enteringId?: string | null;
    enteringSeq?: number | null;
    reduceMotion?: boolean;
  } = {},
) {
  const dispatch = vi.fn<(action: PageAction) => void>();
  const haunt = deriveHaunt(model);
  const result = render(
    <GraveyardView
      haunt={haunt}
      hasStatement={options.hasStatement ?? model.view.kind === "results"}
      enteringId={options.enteringId ?? null}
      enteringSeq={options.enteringSeq ?? null}
      memory={model.memory}
      reduceMotion={options.reduceMotion ?? false}
      dispatch={dispatch}
    />,
  );
  return { ...result, dispatch, haunt };
}

function appleModel(): PageModel {
  const outcome = resultsOf(usSigned);
  const apple: ResultsOutcome = { ...outcome, subscriptions: [...APPLE_PAIR] };
  let model = load(INITIAL_PAGE_MODEL, apple, 1);
  model = {
    ...model,
    graveyard: [answerRecordFor(APPLE_99, "not-using"), answerRecordFor(APPLE_299, "still-using")],
  };
  return pageReducer(model, { type: "open-graveyard" });
}

describe("GraveyardView", () => {
  it("shows the heading and the total per currency", () => {
    renderView(usGraveyardModel());
    expect(screen.getByRole("heading", { level: 2, name: "Your graveyard" })).toBeTruthy();
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent === `You buried ${formatMoney(34776, "USD")} a year.`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Nothing buried yet.")).toBeNull();
  });

  it("lists the tombstones in Graveyard order, each with an Unbury button", () => {
    const { container } = renderView(usGraveyardModel());
    const netflix = screen.getByRole("region", { name: "Here lies Netflix." });
    const spotify = screen.getByRole("region", { name: "Here lies Spotify." });
    expect(
      netflix.compareDocumentPosition(spotify) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unbury Netflix" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unbury Spotify" })).toBeTruthy();
    expect(container.querySelectorAll("ul > li > div > section").length).toBe(2);
  });

  it("shows Resting, Not answered yet and no Already stopped for the US sample", () => {
    renderView(usGraveyardModel());
    expect(screen.getByRole("heading", { level: 3, name: "Resting" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Bury after all Adobe Creative Cloud" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Not answered yet" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Answer now Riverside Gym Membership" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Already stopped" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to the rising" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to the start" })).toBeNull();
  });

  it("writes the Resting line as name, cadence, amount and yearly cost", () => {
    renderView(usGraveyardModel());
    const item = screen
      .getByRole("button", { name: "Bury after all Adobe Creative Cloud" })
      .closest("li");
    expect(item?.textContent).toContain(
      `Adobe Creative Cloud · Monthly · ${formatMoney(5499, "USD")} · ${formatMoney(65988, "USD")} a year`,
    );
  });

  it("dispatches the change actions with the record id", () => {
    const { dispatch, haunt } = renderView(usGraveyardModel());
    const [netflix] = haunt.tombstones;
    const adobe = haunt.kept[0];
    fireEvent.click(screen.getByRole("button", { name: "Unbury Netflix" }));
    fireEvent.click(screen.getByRole("button", { name: "Bury after all Adobe Creative Cloud" }));
    fireEvent.click(screen.getByRole("button", { name: "Answer now Riverside Gym Membership" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    expect(dispatch.mock.calls.map(([action]) => action.type)).toEqual([
      "unbury",
      "bury-after-all",
      "answer-now",
      "back-to-rising",
    ]);
    expect(dispatch.mock.calls[0]?.[0]).toEqual({ type: "unbury", id: netflix?.id });
    expect(dispatch.mock.calls[1]?.[0]).toEqual({ type: "bury-after-all", id: adobe?.id });
  });

  it("lists Ended subscriptions under Already stopped", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-01-05,RIVERSIDE GYM,-30.00",
      "2026-02-05,RIVERSIDE GYM,-30.00",
      "2026-03-05,RIVERSIDE GYM,-30.00",
      "2026-06-20,CORNER BAKERY,-4.50",
    ].join("\n");
    const model = pageReducer(load(INITIAL_PAGE_MODEL, resultsOf(csv), 1), {
      type: "open-graveyard",
    });
    renderView(model);
    expect(screen.getByRole("heading", { level: 3, name: "Already stopped" })).toBeTruthy();
    expect(screen.getByText(/· last charged 5 Mar 2026$/)).toBeTruthy();
    expect(screen.getByText("Nothing buried yet.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Resting" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Not answered yet" })).toBeNull();
  });

  it("shows an Earlier record as a tombstone with Unbury and the earlier note", () => {
    const first = usGraveyardModel();
    const other = [
      "Date,Description,Amount",
      "2026-01-03,RIVERSIDE GYM,-30.00",
      "2026-02-03,RIVERSIDE GYM,-30.00",
      "2026-03-03,RIVERSIDE GYM,-30.00",
    ].join("\n");
    const back = pageReducer(pageReducer(first, { type: "back-to-rising" }), { type: "reset" });
    const second = pageReducer(load(back, resultsOf(other), 2), { type: "open-graveyard" });
    const { haunt } = renderView(second);
    expect(haunt.currentIds.has(haunt.tombstones[0]?.id ?? "")).toBe(false);
    expect(screen.getAllByText(/^Netflix\.$/).length).toBe(1);
    expect(screen.getByRole("button", { name: "Unbury Netflix" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unbury Spotify" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Bury after all/ })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Here lies Netflix." }).textContent).toContain(
      EARLIER_NOTE,
    );
    expect(screen.getByText(`${formatMoney(34776, "USD")}`, { exact: false })).toBeTruthy();
  });

  it("says Nothing buried yet. and leaves the total out", () => {
    const model = pageReducer(load(INITIAL_PAGE_MODEL, resultsOf(usSigned), 1), {
      type: "open-graveyard",
    });
    renderView(model);
    expect(screen.getByText("Nothing buried yet.")).toBeTruthy();
    expect(screen.queryByText(/You buried/)).toBeNull();
    expect(screen.queryByText(/Here lies/)).toBeNull();
  });

  it("offers only Back to the start without a statement", () => {
    const model = pageReducer(INITIAL_PAGE_MODEL, { type: "open-graveyard" });
    const { dispatch } = renderView(model, { hasStatement: false });
    expect(screen.getByText("Nothing buried yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to the rising" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Not answered yet" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to the start" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "back-to-start" });
  });

  it("gives two Apple subscriptions different button names", () => {
    const { container } = renderView(appleModel());
    const apple = "Apple payment (merchant not shown)";
    expect(
      screen.getByRole("button", { name: `Unbury ${apple}, ${formatMoney(99, "USD")} a month` }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: `Bury after all ${apple}, ${formatMoney(299, "USD")} a month`,
      }),
    ).toBeTruthy();
    expectUniqueButtonNames(container);
  });

  it("has unique button names in the full US view", () => {
    const { container } = renderView(usGraveyardModel());
    expectUniqueButtonNames(container);
  });
});

/** The US Graveyard model with the buried Netflix marked Ended in the current statement. */
function endedNetflixModel(): PageModel {
  const model = usGraveyardModel();
  if (model.view.kind !== "results") throw new Error("expected the results view");
  const { outcome } = model.view;
  const subscriptions = outcome.subscriptions.map((s) =>
    s.serviceId === "netflix" ? { ...s, status: "ended" as const } : s,
  );
  return { ...model, view: { ...model.view, outcome: { ...outcome, subscriptions } } };
}

describe("GraveyardView: How to cancel", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("starts collapsed, with a hidden panel that aria-controls names", () => {
    renderView(usGraveyardModel());
    const button = screen.getByRole("button", { name: "How to cancel Netflix" });
    expect(button.textContent).toBe("How to cancel");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel).not.toBeNull();
    expect(panel?.hidden).toBe(true);
    expect(panel?.querySelector("section")?.getAttribute("aria-labelledby")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Seal the grave: Netflix" })).toBeNull();
  });

  it("toggles with click, Enter and Space and keeps focus", async () => {
    const user = userEvent.setup();
    renderView(usGraveyardModel());
    const button = screen.getByRole("button", { name: "How to cancel Netflix" });
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");

    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hidden).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("region", { name: "Seal the grave: Netflix" })).toBeTruthy();

    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.hidden).toBe(true);

    button.focus();
    await user.keyboard("{Enter}");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(button);
    await user.keyboard(" ");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("spans the full row only while its panel is expanded", async () => {
    const user = userEvent.setup();
    renderView(usGraveyardModel());
    const netflix = screen.getByRole("button", { name: "How to cancel Netflix" });
    const spotify = screen.getByRole("button", { name: "How to cancel Spotify" });
    const netflixItem = netflix.closest("li");
    const spotifyItem = spotify.closest("li");
    expect(netflixItem?.className).not.toContain("col-span-2");
    expect(spotifyItem?.className).not.toContain("col-span-2");

    await user.click(netflix);
    expect(netflixItem?.className).toContain("min-[641px]:col-span-2");
    expect(spotifyItem?.className).not.toContain("col-span-2");
    expect(document.activeElement).toBe(netflix);

    await user.click(netflix);
    expect(netflixItem?.className).not.toContain("col-span-2");
  });

  it("puts the disclosure next to Unbury and keeps the Unbury dispatch", () => {
    const { dispatch } = renderView(usGraveyardModel());
    const unbury = screen.getByRole("button", { name: "Unbury Netflix" });
    const how = screen.getByRole("button", { name: "How to cancel Netflix" });
    expect(unbury.parentElement).toBe(how.parentElement);
    fireEvent.click(unbury);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("shows an Earlier record's disclosure with Unbury and the earlier note", () => {
    const first = usGraveyardModel();
    const other = [
      "Date,Description,Amount",
      "2026-01-03,RIVERSIDE GYM,-30.00",
      "2026-02-03,RIVERSIDE GYM,-30.00",
      "2026-03-03,RIVERSIDE GYM,-30.00",
    ].join("\n");
    const back = pageReducer(pageReducer(first, { type: "back-to-rising" }), { type: "reset" });
    const second = pageReducer(load(back, resultsOf(other), 2), { type: "open-graveyard" });
    renderView(second);
    expect(screen.getByRole("button", { name: "Unbury Netflix" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "How to cancel Netflix" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Here lies Netflix." }).textContent).toContain(
      EARLIER_NOTE,
    );
  });

  it("gives an Ended tombstone the stopped line and no disclosure", () => {
    renderView(endedNetflixModel());
    const netflix = screen.getByRole("region", { name: "Here lies Netflix." });
    expect(netflix.textContent).toContain("It has stopped charging.");
    expect(netflix.textContent).not.toContain("Still feeding until you cancel.");
    expect(screen.queryByRole("button", { name: "How to cancel Netflix" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Seal the grave: Netflix" })).toBeNull();
    expect(screen.getByRole("button", { name: "Unbury Netflix" })).toBeTruthy();
    const spotify = screen.getByRole("region", { name: "Here lies Spotify." });
    expect(spotify.textContent).toContain("Still feeding until you cancel.");
    expect(screen.getByRole("button", { name: "How to cancel Spotify" })).toBeTruthy();
  });

  it("keeps two mounted panels apart by name", () => {
    const { container } = renderView(usGraveyardModel());
    expectUniqueButtonNames(container);
    for (const name of ["Netflix", "Spotify"]) {
      const button = screen.getByRole("button", { name: `How to cancel ${name}` });
      const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
      expect(panel).not.toBeNull();
      if (panel === null) continue;
      const controls = [...panel.querySelectorAll("button, a[href]")];
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const label = control.getAttribute("aria-label") ?? "";
        const visible = (control.textContent ?? "").replace(/\s+/g, " ").trim();
        expect(label.startsWith(visible)).toBe(true);
        expect(label.endsWith(` for ${name}`)).toBe(true);
      }
    }
  });

  it("names every panel control once with both panels open", async () => {
    const user = userEvent.setup();
    const { container } = renderView(usGraveyardModel());
    await user.click(screen.getByRole("button", { name: "How to cancel Netflix" }));
    await user.click(screen.getByRole("button", { name: "How to cancel Spotify" }));
    const netflix = screen.getByRole("region", { name: "Seal the grave: Netflix" });
    expect(within(netflix).getByRole("button", { name: "Copy email for Netflix" })).toBeTruthy();
    expectUniqueButtonNames(container);
  });
});

describe("GraveyardView: Memory and Earlier records", () => {
  const FORGET = "Forget everything";

  /** Netflix and Spotify buried and Adobe kept in an earlier statement; a gym statement is current. */
  function earlierModel(): PageModel {
    const first = usGraveyardModel();
    const other = [
      "Date,Description,Amount",
      "2026-01-03,RIVERSIDE GYM,-30.00",
      "2026-02-03,RIVERSIDE GYM,-30.00",
      "2026-03-03,RIVERSIDE GYM,-30.00",
    ].join("\n");
    const back = pageReducer(pageReducer(first, { type: "back-to-rising" }), { type: "reset" });
    return pageReducer(load(back, resultsOf(other), 2), { type: "open-graveyard" });
  }

  function expectPanelBeforeBackRow(): void {
    const panel = screen.getByRole("heading", { level: 3, name: "Memory" }).closest("section");
    expect(panel).not.toBeNull();
    const row = panel?.nextElementSibling;
    expect(row?.tagName).toBe("DIV");
    expect(row?.querySelector("button")?.textContent).toMatch(/^Back to /);
    expect(row?.nextElementSibling).toBeNull();
  }

  it("puts the Memory panel directly before the back-button row with records", () => {
    renderView(usGraveyardModel());
    expectPanelBeforeBackRow();
    expect(screen.getByRole("button", { name: FORGET })).toBeTruthy();
  });

  it("puts the Memory panel directly before the back-button row with an empty Graveyard", () => {
    const model = pageReducer(load(INITIAL_PAGE_MODEL, resultsOf(usSigned), 1), {
      type: "open-graveyard",
    });
    renderView(model);
    expect(screen.getByText("Nothing buried yet.")).toBeTruthy();
    expectPanelBeforeBackRow();
    expect(screen.queryByRole("button", { name: FORGET })).toBeNull();
  });

  it("puts the panel after Already stopped", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-01-05,RIVERSIDE GYM,-30.00",
      "2026-02-05,RIVERSIDE GYM,-30.00",
      "2026-03-05,RIVERSIDE GYM,-30.00",
      "2026-06-20,CORNER BAKERY,-4.50",
    ].join("\n");
    renderView(
      pageReducer(load(INITIAL_PAGE_MODEL, resultsOf(csv), 1), { type: "open-graveyard" }),
    );
    const stopped = screen.getByRole("heading", { level: 3, name: "Already stopped" });
    const memory = screen.getByRole("heading", { level: 3, name: "Memory" });
    expect(stopped.compareDocumentPosition(memory) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("marks Earlier tombstones and Resting items and gives each its action", () => {
    renderView(earlierModel());
    for (const name of ["Netflix", "Spotify"]) {
      const stone = screen.getByRole("region", { name: `Here lies ${name}.` });
      expect(stone.textContent).toContain(EARLIER_NOTE);
      expect(screen.getByRole("button", { name: `Unbury ${name}` })).toBeTruthy();
    }
    const adobe = screen.getByRole("button", { name: "Bury after all Adobe Creative Cloud" });
    const item = adobe.closest("li");
    expect(item?.querySelector("p")?.textContent).toContain(EARLIER_NOTE);
    expect(item?.querySelector("p > span")?.textContent).toContain(EARLIER_NOTE);
  });

  it("shows no note on a Current record", () => {
    renderView(usGraveyardModel());
    expect(screen.queryByText(EARLIER_NOTE, { exact: false })).toBeNull();
  });

  it("keeps button names unique with Earlier records and the panel", () => {
    const { container } = renderView(earlierModel());
    expectUniqueButtonNames(container);
  });

  describe("busy", () => {
    beforeAll(() => {
      MotionGlobalConfig.skipAnimations = false;
    });
    afterAll(() => {
      MotionGlobalConfig.skipAnimations = true;
    });

    const forgetButton = () => screen.getByRole("button", { name: FORGET });

    it("leaves Forget everything aria-disabled until each rise of the same record ends", async () => {
      const model = usGraveyardModel();
      const haunt = deriveHaunt(model);
      const id = haunt.tombstones[0]?.id ?? "";
      const dispatch = vi.fn<(action: PageAction) => void>();
      const view = (seq: number | null) => (
        <GraveyardView
          haunt={haunt}
          hasStatement
          enteringId={seq === null ? null : id}
          enteringSeq={seq}
          memory={model.memory}
          reduceMotion
          dispatch={dispatch}
        />
      );
      const { rerender } = render(view(null));
      expect(forgetButton().getAttribute("aria-disabled")).toBeNull();
      for (const seq of [1, 2, 3]) {
        rerender(view(seq));
        expect(forgetButton().getAttribute("aria-disabled")).toBe("true");
        await waitFor(() => expect(forgetButton().getAttribute("aria-disabled")).toBeNull(), {
          timeout: 3000,
        });
        expect(forgetButton().hasAttribute("disabled")).toBe(false);
      }
    });
  });
});
