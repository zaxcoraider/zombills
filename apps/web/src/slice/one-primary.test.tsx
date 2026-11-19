// @vitest-environment jsdom
// pro-polish Req 6.5 and 6.7: at most one primary control per Screen state, and exactly one where
// a next step exists; secondary and danger controls never sit on the bare scene (design P3).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import fc from "fast-check";
import { MotionGlobalConfig } from "framer-motion";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import usSigned from "../../../../samples/us-signed.csv?raw";
import { App } from "../App";
import { GraveyardView } from "./graveyard/graveyard-view";
import { renderControl } from "./graveyard/test-share-render";
import { analyzeStatement } from "./logic/analyze-statement";
import type { ResultsOutcome } from "./logic/analyze-statement";
import {
  HOME_CONTROL_NAME,
  LEAVE_QUESTION,
  STAY_TEXT,
  TRY_ANOTHER_STATEMENT,
} from "./logic/chrome-text";
import type { AnswerRecord } from "./logic/graveyard";
import { deriveHaunt } from "./logic/haunt-view";
import { PRIMARY_ACTION_NAME } from "./logic/landing-text";
import { FORGET_BUTTON, FORGET_QUESTION } from "./logic/memory-text";
import { pageGraveyardArb } from "./logic/test-arbitraries";
import { INITIAL_PAGE_MODEL, pageReducer } from "./page-state";
import type { PageAction, PageModel } from "./page-state";

vi.mock("./graveyard/share-card-renderer", async () => ({
  renderShareCard: (await import("./graveyard/test-share-render")).renderControl.render,
}));

// A stalled mound never reports that it closed, so the burial stays in `burying` (2 s fallback).
const mound = vi.hoisted(() => ({ stalled: false }));
vi.mock("./graveyard/burial-earth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./graveyard/burial-earth")>();
  return {
    ...actual,
    BurialMound: (props: ComponentProps<typeof actual.BurialMound>) =>
      mound.stalled ? null : <actual.BurialMound {...props} />,
  };
});

const UK_LABEL = "UK bank statement";
const DROP_AREA_NAME = "Drop area: choose or drop a CSV statement";
const INTERACTIVE = "button, a[href], [role=button], input";
const SURFACE = '.bg-fog, [class~="bg-fog/95"], [data-grave-drop]';

const ONE_SUBSCRIPTION_CSV = [
  "Date,Description,Amount",
  "2026-01-05,RIVERSIDE GYM,-30.00",
  "2026-02-05,RIVERSIDE GYM,-30.00",
  "2026-03-05,RIVERSIDE GYM,-30.00",
  "2026-04-05,RIVERSIDE GYM,-30.00",
  "2026-04-06,CORNER BAKERY,-4.50",
].join("\n");

const ENDED_ONLY_CSV = [
  "Date,Description,Amount",
  "2026-01-05,RIVERSIDE GYM,-30.00",
  "2026-02-05,RIVERSIDE GYM,-30.00",
  "2026-05-20,CORNER BAKERY,-4.50",
].join("\n");

const ONE_OFF_CSV = [
  "Date,Description,Amount",
  "2026-01-05,CORNER BAKERY,-4.50",
  "2026-02-10,HARDWARE STORE,-12.00",
].join("\n");

interface PrimaryCounts {
  marker: number;
  moss: number;
}

/** Primary markers and interactive moss fills; filled Progress dots and the bar are not counted. */
function primaryCounts(root: ParentNode = document.body): PrimaryCounts {
  return {
    marker: root.querySelectorAll('[data-variant="primary"]').length,
    moss: [...root.querySelectorAll(INTERACTIVE)].filter((el) => el.classList.contains("bg-moss"))
      .length,
  };
}

function expectPrimaries(expected: 0 | 1, root: ParentNode = document.body) {
  expect(primaryCounts(root)).toEqual({ marker: expected, moss: expected });
}

/** No secondary or danger control outside a fog surface or the Grave drop area. */
function expectNoBareOutlines(root: ParentNode = document.body) {
  const bare = [
    ...root.querySelectorAll('[data-variant="secondary"], [data-variant="danger"]'),
  ].filter((el) => el.parentElement?.closest(SURFACE) == null);
  expect(bare.map((el) => el.textContent)).toEqual([]);
}

function expectRow(expected: 0 | 1) {
  expectPrimaries(expected);
  expectNoBareOutlines();
}

function csvFile(text: string, name = "statement.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByRole("button", { name: DROP_AREA_NAME }), {
    dataTransfer: { files, types: ["Files"] },
  });
}

async function summon() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
  await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
}

/** Opens "Try another statement" on `results`. */
function openStatement() {
  fireEvent.click(screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT }));
}

/** From the US Sample results, reads a dropped file through the open Statement disclosure. */
async function summonThenDrop(file: File) {
  await summon();
  openStatement();
  dropFiles([file]);
}

function keepAndNext() {
  fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** Keeps Adobe and the gym, so Netflix is at the head of the Queue. */
function reachNetflix() {
  keepAndNext();
  keepAndNext();
  screen.getByRole("heading", { level: 3, name: "Netflix" });
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  window.location.hash = "";
  mound.stalled = false;
  renderControl.reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("one primary per Screen state (Req 6.5, 6.7)", () => {
  it("results, ask: the card's No, bury it is the one primary", async () => {
    await summon();
    expect(screen.getByRole("button", { name: "No, bury it" }).getAttribute("data-variant")).toBe(
      "primary",
    );
    expectRow(1);
  });

  it("results, rested: Next is the one primary", async () => {
    await summon();
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "No, bury it" })).toBeNull());
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("data-variant")).toBe(
      "primary",
    );
    expectRow(1);
  });

  it("results, burying: the disabled Next is the one primary; the answer block is hidden", async () => {
    await summon();
    reachNetflix();
    mound.stalled = true;
    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
    screen.getByRole("group", { name: "Burying Netflix" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "No, bury it" })).toBeNull());
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBe("true");
    expectRow(1);
  });

  it("results, buried: Next is the one primary", async () => {
    await summon();
    reachNetflix();
    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
    await screen.findByRole("region", { name: "Here lies Netflix." });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBeNull(),
    );
    expectRow(1);
  });

  it("results, all answered: Visit the graveyard is the one primary", async () => {
    render(<App />);
    dropFiles([csvFile(ONE_SUBSCRIPTION_CSV)]);
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(screen.getByRole("button", { name: "Visit the graveyard" }));
    await screen.findByRole("heading", { level: 2, name: "Your graveyard" });
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    const visit = await screen.findByRole("button", { name: "Visit the graveyard" });
    expect(visit.getAttribute("data-variant")).toBe("primary");
    expectRow(1);
  });

  it("results, no undead: no primary", async () => {
    render(<App />);
    dropFiles([csvFile(ENDED_ONLY_CSV)]);
    await screen.findByRole("heading", { level: 3, name: "No undead here." });
    expectRow(0);
  });

  it("working, with the frame held: no primary", async () => {
    await summon();
    openStatement();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: UK_LABEL }));
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    expect(screen.getAllByText(`Reading ${UK_LABEL}…`).length).toBeGreaterThan(0);
    expectRow(0);
  });

  it("error: Start again is the one primary", async () => {
    await summonThenDrop(csvFile("", "empty.csv"));
    await screen.findByRole("heading", { level: 2, name: "The file is empty." });
    expect(screen.getByRole("button", { name: "Start again" }).getAttribute("data-variant")).toBe(
      "primary",
    );
    expectRow(1);
  });

  it("no-subscriptions: Start again is the one primary", async () => {
    await summonThenDrop(csvFile(ONE_OFF_CSV));
    await screen.findByRole("heading", { level: 2, name: "No undead here." });
    expect(screen.getByRole("button", { name: "Start again" }).getAttribute("data-variant")).toBe(
      "primary",
    );
    expectRow(1);
  });

  it("Leave question open: none inside it, and the screen keeps its one primary", async () => {
    await summon();
    fireEvent.click(screen.getByRole("button", { name: HOME_CONTROL_NAME }));
    const question = screen.getByRole("group", { name: LEAVE_QUESTION });
    expect(within(question).getByRole("button", { name: STAY_TEXT })).toBeTruthy();
    expectPrimaries(0, question);
    expectNoBareOutlines(question);
    expectRow(1);
  });

  it("Forget confirmation open: none inside it, and the screen keeps its one primary", async () => {
    await summon();
    reachNetflix();
    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
    await screen.findByRole("region", { name: "Here lies Netflix." });
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    await screen.findByRole("heading", { level: 2, name: "Your graveyard" });
    fireEvent.click(screen.getByRole("button", { name: FORGET_BUTTON }));
    const confirmation = screen.getByRole("group", { name: FORGET_QUESTION });
    expectPrimaries(0, confirmation);
    expectNoBareOutlines(confirmation);
    expectRow(1);
  });
});

function resultsOf(csv: string): ResultsOutcome {
  const outcome = analyzeStatement(csv);
  if (outcome.kind !== "results") throw new Error(`expected results, got ${outcome.kind}`);
  return outcome;
}

/** The US Sample loaded into `results`, as the Page reaches it. */
function usResultsModel(): PageModel {
  const working = pageReducer(INITIAL_PAGE_MODEL, {
    type: "start",
    runId: 1,
    sourceName: "us-signed.csv",
  });
  return pageReducer(working, { type: "finish", runId: 1, outcome: resultsOf(usSigned) });
}

/** Renders the Graveyard view alone with the haunt the Page would derive from `model`. */
function renderGraveyardView(model: PageModel) {
  const dispatch = vi.fn<(action: PageAction) => void>();
  const haunt = deriveHaunt(model);
  render(
    <GraveyardView
      haunt={haunt}
      hasStatement={model.view.kind === "results"}
      enteringId={null}
      enteringSeq={null}
      memory={model.memory}
      reduceMotion={false}
      dispatch={dispatch}
    />,
  );
  return haunt;
}

/** At most 20 records (P3). */
const graveyardArb: fc.Arbitrary<AnswerRecord[]> = pageGraveyardArb.map((records) =>
  records.slice(0, 20),
);

describe("Graveyard view rows", () => {
  /**
   * **Validates: Requirements 6.5, 6.7, 13.5**
   * P3: one primary when something is buried, none otherwise, before an image and with one.
   */
  it("P3: has exactly one primary with tombstones and none without, from idle and from results", async () => {
    const results = usResultsModel();
    await fc.assert(
      fc.asyncProperty(graveyardArb, async (graveyard) => {
        for (const base of [INITIAL_PAGE_MODEL, results]) {
          try {
            const haunt = renderGraveyardView({ ...base, graveyard });
            const expected = haunt.tombstones.length > 0 ? 1 : 0;
            expectPrimaries(expected);
            expectNoBareOutlines();
            if (expected === 1) {
              // The Share panel with a stubbed image: the main button is primary, "again" is not.
              fireEvent.click(screen.getByRole("button", { name: "Make an image" }));
              await act(async () => {
                renderControl.resolveRender(0, renderControl.fakeResult("p3"));
              });
              await screen.findByRole("img");
              expectPrimaries(1);
              expectNoBareOutlines();
            }
          } finally {
            cleanup();
            renderControl.reset();
          }
        }
      }),
    );
  }, 30_000);
});
