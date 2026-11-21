// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCancelHelp } from "@zombills/core";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import {
  HOME_CONTROL_NAME,
  LEAVE_TEXT,
  PRIVACY_TOMBSTONE,
  STAY_TEXT,
  TRY_ANOTHER_STATEMENT,
  WHAT_IS_KEPT,
} from "./logic/chrome-text";
import {
  KIRO_LINK,
  PRIMARY_ACTION_NAME,
  READ_PRIVACY_NOTE,
  REAPER_LINK,
  REPO_LINK,
} from "./logic/landing-text";
import { formatMoney } from "./logic/money";
import { SAMPLES } from "./samples";
import { createGraveyardStore } from "./storage/graveyard-store";
import { fakeStorage, fakeStoreTarget, storeLoadOf } from "./storage/test-store";

const DROP_AREA_NAME = "Drop area: choose or drop a CSV statement";
const RESULTS_HEADING = "Recurring charges found";
const MEMORY_CHECKBOX = "Remember my graveyard on this device";
const THREE_ROW_FILE =
  "Date,Description,Amount\n2026-01-03,CORNER BAKERY,-4.50\n2026-01-09,HARDWARE DEPOT,-23.10\n2026-01-20,BOOK NOOK,-12.00\n";

/** The four Footer tombstones, in tab order (Req 2.2, 12.6). */
const FOOTER_STONES = [REPO_LINK.text, REAPER_LINK.text, PRIVACY_TOMBSTONE, KIRO_LINK.text];
/** The open Statement panel: drop area, "Choose a file", then the four Sample chips. */
const STATEMENT_PANEL = [DROP_AREA_NAME, "Choose a file", ...SAMPLES.map((s) => s.label)];

const NETFLIX_BURIED = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
};
const RESTORED_TEXT = JSON.stringify({ version: 1, records: [NETFLIX_BURIED] });

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderRestored() {
  const store = createGraveyardStore(fakeStoreTarget(fakeStorage()));
  return render(<App store={store} initialStore={storeLoadOf(RESTORED_TEXT)} />);
}

function liveText(): string | null {
  return screen.getByRole("status").textContent;
}

function homeControl(): HTMLElement {
  return screen.getByRole("button", { name: HOME_CONTROL_NAME });
}

function primaryAction(): HTMLElement {
  return screen.getByRole("button", { name: PRIMARY_ACTION_NAME });
}

async function summon() {
  fireEvent.click(primaryAction());
  await screen.findByRole("heading", { level: 2, name: RESULTS_HEADING });
}

function dropFile(file: File) {
  fireEvent.drop(screen.getByRole("button", { name: DROP_AREA_NAME }), {
    dataTransfer: { files: [file], types: ["Files"] },
  });
}

async function reachError() {
  dropFile(new File(["x"], "notes.txt", { type: "text/plain" }));
  await screen.findByRole("heading", { level: 2, name: "This file is not a CSV statement." });
}

async function reachNoSubscriptions() {
  dropFile(new File([THREE_ROW_FILE], "statement.csv", { type: "text/csv" }));
  await screen.findByRole("heading", { level: 2, name: "No undead here." });
}

async function buryCurrent(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
  await screen.findByRole("region", { name: `Here lies ${name}.` });
}

async function reachGraveyard() {
  await summon();
  fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
  await screen.findByRole("heading", { level: 2, name: "Your graveyard" });
}

/** Keeps Adobe Creative Cloud and Riverside Gym Membership, leaving Netflix as the card. */
function reachNetflix() {
  for (const name of ["Adobe Creative Cloud", "Riverside Gym Membership"]) {
    screen.getByRole("heading", { level: 3, name });
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  screen.getByRole("heading", { level: 3, name: "Netflix" });
}

type Name = string | RegExp;

function roleOf(element: HTMLElement): string {
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLInputElement && element.type === "checkbox") return "checkbox";
  return "button";
}

function describeElement(element: HTMLElement): string {
  return `${element.tagName} ${element.getAttribute("aria-label") ?? element.textContent ?? ""}`;
}

/**
 * Tabs once per expected name from where focus is now, and checks the focused element is the
 * one found by its role and accessible name (Req 12.6).
 */
async function expectTabOrder(expected: readonly Name[]) {
  const user = userEvent.setup();
  for (const name of expected) {
    await user.tab();
    const active = document.activeElement as HTMLElement;
    const matches = screen.queryAllByRole(roleOf(active), { name });
    expect(
      matches.includes(active),
      `expected ${String(name)}, focus is on ${describeElement(active)}`,
    ).toBe(true);
  }
}

/** Starts the walk from `document.body`, as a fresh Tab on the page does. */
async function expectTabOrderFromBody(expected: readonly Name[]) {
  (document.activeElement as HTMLElement | null)?.blur();
  expect(document.activeElement).toBe(document.body);
  await expectTabOrder(expected);
}

function openStatement() {
  fireEvent.click(screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT }));
}

function cancelLinkName(serviceId: string): RegExp {
  const help = getCancelHelp(serviceId, "USD");
  if (help.kind !== "link") throw new Error(`${serviceId} has a cancel page`);
  const host = help.host.replace(/\./g, "\\.");
  return new RegExp(`^Open the .+ (cancel|manage|help) page \\(${host}\\)`);
}

describe("Page tab orders (Req 12.6)", () => {
  it("results, ask: Home, Open the graveyard, the answers, Skip, the disclosure, the stones", async () => {
    render(<App />);
    await summon();
    await expectTabOrderFromBody([
      HOME_CONTROL_NAME,
      "Open the graveyard",
      "Yes, let it rest",
      "No, bury it",
      "Skip for now",
      TRY_ANOTHER_STATEMENT,
      ...FOOTER_STONES,
    ]);
  });

  it("results, ask, disclosure open: the Statement panel and Start again after the disclosure", async () => {
    render(<App />);
    await summon();
    openStatement();
    await expectTabOrderFromBody([
      HOME_CONTROL_NAME,
      "Open the graveyard",
      "Yes, let it rest",
      "No, bury it",
      "Skip for now",
      TRY_ANOTHER_STATEMENT,
      ...STATEMENT_PANEL,
      "Start again",
      ...FOOTER_STONES,
    ]);
  });

  it("results, buried with no App-store links: the cancel link, Write to them instead, Next", async () => {
    render(<App />);
    await summon();
    await buryCurrent("Adobe Creative Cloud");
    const rest = [
      cancelLinkName("adobe"),
      "Write to them instead for Adobe Creative Cloud",
      "Next",
      TRY_ANOTHER_STATEMENT,
      ...FOOTER_STONES,
    ];
    // The stage tombstone holds focus after the rise; Tab goes on from it.
    const tombstone = screen.getByRole("region", { name: "Here lies Adobe Creative Cloud." });
    await waitFor(() => expect(document.activeElement).toBe(tombstone));
    await expectTabOrder(rest);
    // From the top of the page, the tombstone (a focus target, not a control) is passed over.
    await expectTabOrderFromBody([HOME_CONTROL_NAME, "Open the graveyard", ...rest]);
  });

  it("results, buried with App-store links: the cancel link, both store links, then the rest", async () => {
    render(<App />);
    await summon();
    reachNetflix();
    await buryCurrent("Netflix");
    const rest = [
      cancelLinkName("netflix"),
      /^Apple subscriptions/,
      /^Google Play subscriptions/,
      "Write to them instead for Netflix",
      "Next",
      TRY_ANOTHER_STATEMENT,
      ...FOOTER_STONES,
    ];
    const tombstone = screen.getByRole("region", { name: "Here lies Netflix." });
    await waitFor(() => expect(document.activeElement).toBe(tombstone));
    await expectTabOrder(rest);
    await expectTabOrderFromBody([HOME_CONTROL_NAME, "Open the graveyard", ...rest]);
  });

  it("the Graveyard view: Home, the Waiting chips, Memory, Back to the rising, the disclosure, the stones", async () => {
    render(<App />);
    await reachGraveyard();
    const waiting: [string, number][] = [
      ["Adobe Creative Cloud", 65988],
      ["Riverside Gym Membership", 34800],
      ["Netflix", 21588],
      ["Spotify", 13188],
    ];
    expect(
      (screen.getByRole("checkbox", { name: MEMORY_CHECKBOX }) as HTMLInputElement).checked,
    ).toBe(false);
    await expectTabOrderFromBody([
      HOME_CONTROL_NAME,
      ...waiting.map(([name, cents]) => `Answer now ${name} · ${formatMoney(cents, "USD")} a year`),
      MEMORY_CHECKBOX,
      WHAT_IS_KEPT,
      "Back to the rising",
      TRY_ANOTHER_STATEMENT,
      ...FOOTER_STONES,
    ]);
  });

  it("error: Home, Start again, the open Statement panel, the stones", async () => {
    render(<App />);
    await reachError();
    await expectTabOrderFromBody([
      HOME_CONTROL_NAME,
      "Start again",
      ...STATEMENT_PANEL,
      ...FOOTER_STONES,
    ]);
  });

  it.each([
    { state: "error", reach: reachError },
    { state: "no-subscriptions", reach: reachNoSubscriptions },
  ])(
    "$state with a restored Graveyard: Open the graveyard after Start again",
    async ({ reach }) => {
      renderRestored();
      await reach();
      await expectTabOrderFromBody([
        HOME_CONTROL_NAME,
        "Start again",
        "Open the graveyard",
        ...STATEMENT_PANEL,
        ...FOOTER_STONES,
      ]);
    },
  );

  const LANDING = [
    PRIMARY_ACTION_NAME,
    ...SAMPLES.slice(1).map((sample) => sample.label),
    READ_PRIVACY_NOTE,
    DROP_AREA_NAME,
    "Choose a file",
    ...FOOTER_STONES,
  ];

  it("the Landing view with an empty Graveyard", async () => {
    render(<App />);
    await expectTabOrderFromBody(LANDING);
  });

  it("the Landing view with a restored Graveyard: Open the graveyard after Read the privacy note", async () => {
    renderRestored();
    const expected = [...LANDING];
    expected.splice(expected.indexOf(READ_PRIVACY_NOTE) + 1, 0, "Open the graveyard");
    await expectTabOrderFromBody(expected);
  });
});

/** One `h1`, named `HOME_CONTROL_NAME`, first; no heading skips a level (P5). */
function expectHeadingOutline() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
  const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
  expect(screen.getByRole("heading", { level: 1, name: HOME_CONTROL_NAME })).toBe(headings[0]);
  for (let i = 1; i < levels.length; i += 1) {
    expect(levels[i] as number).toBeLessThanOrEqual((levels[i - 1] as number) + 1);
  }
}

describe("Page heading outlines (Req 1.2, P5)", () => {
  it("results: one h1 named the Home control, no skipped level, also with the disclosure open", async () => {
    render(<App />);
    await summon();
    expectHeadingOutline();
    openStatement();
    expectHeadingOutline();
    await buryCurrent("Adobe Creative Cloud");
    expectHeadingOutline();
  });

  it("the Graveyard view: one h1 named the Home control, no skipped level", async () => {
    render(<App />);
    await reachGraveyard();
    expectHeadingOutline();
    cleanup();
    renderRestored();
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    await screen.findByRole("heading", { level: 2, name: "Your graveyard" });
    expectHeadingOutline();
  });
});

describe("Live region silence (Req 12.10)", () => {
  it("the Home control from error says what Start again says", async () => {
    render(<App />);
    await reachError();
    // "Start again" keeps today's focus target (Req 1.9); only the Landing view is awaited.
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    await waitFor(() => expect(primaryAction()).toBeTruthy());
    const expected = liveText();
    cleanup();

    render(<App />);
    await reachError();
    fireEvent.click(homeControl());
    await waitFor(() => expect(document.activeElement).toBe(primaryAction()));
    expect(liveText()).toBe(expected);
  });

  it("the Home control and the Leave question on results announce nothing new", async () => {
    render(<App />);
    await summon();
    openStatement();
    // "Start again" keeps today's focus target (Req 1.9); only the Landing view is awaited.
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    await waitFor(() => expect(primaryAction()).toBeTruthy());
    const afterReset = liveText();
    cleanup();

    render(<App />);
    await summon();
    const live = liveText();
    fireEvent.click(homeControl());
    expect(liveText()).toBe(live);
    fireEvent.click(homeControl());
    expect(liveText()).toBe(live);
    fireEvent.click(screen.getByRole("button", { name: STAY_TEXT }));
    expect(liveText()).toBe(live);
    fireEvent.click(homeControl());
    fireEvent.keyDown(screen.getByRole("button", { name: STAY_TEXT }), { key: "Escape" });
    expect(liveText()).toBe(live);
    fireEvent.click(homeControl());
    fireEvent.click(screen.getByRole("button", { name: LEAVE_TEXT }));
    await waitFor(() => expect(document.activeElement).toBe(primaryAction()));
    expect(liveText()).toBe(afterReset);
  });

  it("Try another statement opens and closes with the Live region unchanged", async () => {
    render(<App />);
    await summon();
    const live = liveText();
    openStatement();
    expect(
      screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(liveText()).toBe(live);
    openStatement();
    expect(
      screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(liveText()).toBe(live);
  });

  it("Write to them instead opens and closes with the Live region unchanged", async () => {
    render(<App />);
    await summon();
    await buryCurrent("Adobe Creative Cloud");
    const live = liveText();
    const write = screen.getByRole("button", {
      name: "Write to them instead for Adobe Creative Cloud",
    });
    fireEvent.click(write);
    expect(write.getAttribute("aria-expanded")).toBe("true");
    expect(liveText()).toBe(live);
    fireEvent.click(write);
    expect(write.getAttribute("aria-expanded")).toBe("false");
    expect(liveText()).toBe(live);
  });

  it("What is kept? opens and closes with the Live region unchanged", async () => {
    render(<App />);
    await reachGraveyard();
    const live = liveText();
    const kept = screen.getByRole("button", { name: WHAT_IS_KEPT });
    fireEvent.click(kept);
    expect(kept.getAttribute("aria-expanded")).toBe("true");
    expect(liveText()).toBe(live);
    fireEvent.click(kept);
    expect(kept.getAttribute("aria-expanded")).toBe("false");
    expect(liveText()).toBe(live);
  });

  it.each([
    { place: "the Landing view", reach: async () => undefined },
    { place: "results", reach: summon },
  ])("each Footer tombstone on $place leaves the Live region unchanged", async ({ reach }) => {
    const errors = vi.spyOn(console, "error");
    // Activating a link here must not navigate jsdom away; the test checks only the Page.
    const stopNavigation = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest("a[href]")) event.preventDefault();
    };
    document.addEventListener("click", stopNavigation, true);
    try {
      render(<App />);
      await reach();
      const live = liveText();
      const footer = within(screen.getByRole("contentinfo"));
      for (const name of FOOTER_STONES) {
        const stone = footer.getByRole(name === PRIVACY_TOMBSTONE ? "button" : "link", { name });
        fireEvent.pointerEnter(stone);
        fireEvent.mouseEnter(stone);
        stone.focus();
        fireEvent.click(stone);
        fireEvent.pointerLeave(stone);
        fireEvent.mouseLeave(stone);
        stone.blur();
        expect(liveText(), name).toBe(live);
      }
      expect(errors).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("click", stopNavigation, true);
    }
  });
});

describe("Progress dots and the footnote in the Page (Req 10.1, 10.2)", () => {
  function dotStates(): boolean[] {
    const row = document.querySelector<HTMLElement>("[data-progress-dots]");
    if (row === null) throw new Error("no Progress dots");
    expect(row.getAttribute("aria-hidden")).toBe("true");
    expect(row.textContent).toBe("");
    return Array.from(row.children).map((dot) => dot.classList.contains("bg-moss"));
  }

  it("shows four dots after the progress text and fills the first after an answer", async () => {
    render(<App />);
    await summon();
    const text = screen.getByText("0 of 4 answered");
    const row = document.querySelector("[data-progress-dots]") as Node;
    expect(text.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dotStates()).toEqual([false, false, false, false]);
    expect(document.querySelector("[data-progress-bar]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    expect(screen.getByText("1 of 4 answered")).toBeTruthy();
    expect(dotStates()).toEqual([true, false, false, false]);
  });

  it("shows the assumed-currency footnote as a muted p after the summary line", async () => {
    render(<App />);
    await summon();
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
