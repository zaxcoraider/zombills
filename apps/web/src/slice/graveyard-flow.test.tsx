// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { expectUniqueButtonNames } from "./graveyard/test-a11y";
import { analyzeStatement } from "./logic/analyze-statement";
import { partsToText, priceRiseParts } from "./logic/label-text";
import { formatMoney } from "./logic/money";
import { SAMPLES } from "./samples";

const mound = vi.hoisted(() => ({ stalled: false }));

// A stalled mound never reports that it closed, so only the 2 s fallback can end the burial.
vi.mock("./graveyard/burial-earth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./graveyard/burial-earth")>();
  return {
    ...actual,
    BurialMound: (props: ComponentProps<typeof actual.BurialMound>) =>
      mound.stalled ? null : <actual.BurialMound {...props} />,
  };
});

const US_LABEL = "US bank, signed amounts";
const UK_LABEL = "UK bank, debit and credit columns";

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

beforeEach(() => {
  window.location.hash = "";
  mound.stalled = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function chooseSample(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
}

/** Every button on the page has a name and no two share one (Req 14.1). */
function expectUnique() {
  expectUniqueButtonNames(document.body);
}

function liveRegion(): HTMLElement {
  return screen.getByRole("status");
}

function card(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

function cardHeading(name: string): HTMLElement {
  return screen.getByRole("heading", { level: 3, name });
}

/** Answers the card on screen with "Yes, let it rest", then moves on with "Next". */
function keepAndNext() {
  fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

/** Keeps Adobe Creative Cloud and Riverside Gym Membership, leaving Netflix as the card. */
function reachNetflix() {
  keepAndNext();
  keepAndNext();
  cardHeading("Netflix");
}

function counterText(): string {
  return within(screen.getByRole("group", { name: "Saved per year" })).getByText(
    (_content, element) => element?.classList.contains("sr-only") === true,
  ).textContent as string;
}

describe("graveyard flow: first card", () => {
  it("shows the first card, the Still draining total, the progress line and its focus", async () => {
    render(<App />);
    await chooseSample(US_LABEL);

    const main = within(document.querySelector("main") as HTMLElement);
    expect(main.getByText(/Still draining/).textContent).toContain(formatMoney(135564, "USD"));

    const adobe = card("Adobe Creative Cloud");
    expect(adobe.textContent).toContain("Monthly");
    expect(adobe.textContent).toContain(formatMoney(5499, "USD"));
    expect(adobe.textContent).toContain(formatMoney(65988, "USD"));
    expect(adobe.textContent).toContain("a year");
    expect(within(adobe).getByText("Still using this?")).toBeTruthy();
    expect(within(adobe).getByText("Undead")).toBeTruthy();
    expect(screen.getByText("0 of 4 answered")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(cardHeading("Adobe Creative Cloud")));
    expectUnique();
  });
});

describe("graveyard flow: keep", () => {
  it("rests the card, counts the answer, focuses the note and announces it", async () => {
    render(<App />);
    await chooseSample(US_LABEL);

    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));

    const note = await screen.findByText("Kept. It rests.");
    await waitFor(() => expect(document.activeElement).toBe(note));
    expect(screen.getByText(/It goes on charging/).textContent).toBe(
      `It goes on charging ${formatMoney(5499, "USD")} a month.`,
    );
    expect(within(card("Adobe Creative Cloud")).getByText("Resting")).toBeTruthy();
    expect(screen.getByText("1 of 4 answered")).toBeTruthy();
    expect(counterText()).toBe(formatMoney(0, "USD"));
    expect(liveRegion().textContent).toBe("Adobe Creative Cloud rests. Kept.");
    expectUnique();
  });
});

describe("graveyard flow: Netflix card", () => {
  it("shows Possessed and the price rise on Netflix only", async () => {
    render(<App />);
    await chooseSample(US_LABEL);

    expect(card("Adobe Creative Cloud").textContent).not.toContain("Price went up");
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(card("Riverside Gym Membership").textContent).not.toContain("Price went up");
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const outcome = analyzeStatement(SAMPLES[0]?.text ?? "");
    if (outcome.kind !== "results") throw new Error("expected results for the US Sample");
    const rise = outcome.subscriptions.find((entry) => entry.merchant === "Netflix")?.priceRise;
    if (rise === null || rise === undefined) throw new Error("expected a price rise");

    const netflix = card("Netflix");
    expect(within(netflix).getByText("Possessed")).toBeTruthy();
    expect(netflix.textContent).toContain(partsToText(priceRiseParts(rise, "USD")));

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    const spotify = card("Spotify");
    expect(spotify.textContent).not.toContain("Price went up");
  });
});

describe("graveyard flow: bury", () => {
  it("runs the burial, shows the tombstone and updates the totals, focus and live region", async () => {
    render(<App />);
    await chooseSample(US_LABEL);
    reachNetflix();

    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));

    const stage = screen.getByRole("group", { name: "Burying Netflix" });
    expect(document.activeElement).toBe(stage);
    for (const name of ["Yes, let it rest", "No, bury it"]) {
      expect(screen.getByRole("button", { name }).getAttribute("aria-disabled")).toBe("true");
    }
    expectUnique();
    // The chip swaps after the Undead chip has left.
    await waitFor(() => expect(within(stage).queryByText("Zombie")).not.toBeNull());

    const tombstone = await screen.findByRole("region", { name: "Here lies Netflix." });
    expect(tombstone.textContent).toContain("Fed on you every month.");
    expect(tombstone.textContent).toContain(`Saves${formatMoney(21588, "USD")}/year.`);
    await waitFor(() => expect(document.activeElement).toBe(tombstone));
    expect(counterText()).toBe(formatMoney(21588, "USD"));
    const main = within(document.querySelector("main") as HTMLElement);
    expect(main.getByText(/Still draining/).textContent).toContain(formatMoney(113976, "USD"));
    expect(liveRegion().textContent).toBe(
      `Netflix is buried. Saves ${formatMoney(21588, "USD")} a year. ` +
        `Saved per year: ${formatMoney(21588, "USD")}. ` +
        `Still draining ${formatMoney(113976, "USD")} a year.`,
    );
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBeNull();
    expectUnique();
  });
});

describe("graveyard flow: burial fallback", () => {
  it("ends a burial whose mound never closes after 2 seconds", async () => {
    render(<App />);
    await chooseSample(US_LABEL);
    reachNetflix();
    mound.stalled = true;
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
    expect(screen.queryByRole("region", { name: "Here lies Netflix." })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("region", { name: "Here lies Netflix." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")).toBeNull();
  });
});

describe("graveyard flow: Gate keeps focus", () => {
  it("does not remount the Gate while another statement is read", async () => {
    const frames: FrameRequestCallback[] = [];
    render(<App />);
    await chooseSample(US_LABEL);

    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    const button = screen.getByRole("button", { name: UK_LABEL });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(frames).toHaveLength(1));
    expect(screen.getByRole("button", { name: UK_LABEL })).toBe(button);
    expect(document.activeElement).toBe(button);

    await act(async () => {
      frames[0]?.(0);
    });
    await waitFor(() => {
      const first = document.querySelector("section[aria-labelledby] h3");
      expect(first).not.toBeNull();
      expect(document.activeElement).toBe(first);
    });
    expect(screen.getByRole("button", { name: UK_LABEL })).toBe(button);
  });
});

const DROP_AREA_NAME = "Drop area: choose or drop a CSV statement";

function dropCsv(lines: string[]) {
  const file = new File([lines.join("\n")], "statement.csv", { type: "text/csv" });
  const area = screen.getByRole("button", { name: DROP_AREA_NAME });
  fireEvent.drop(area, { dataTransfer: { files: [file], types: ["Files"] } });
}

/** The CSV of the slice's "Guessed-only group" test: Netflix is a single charge. */
const GUESSED_CSV = [
  "Date,Description,Amount,Currency",
  "2026-01-05,NETFLIX.COM,-12.99,EUR",
  "2026-01-03,RIVERSIDE GYM,-30.00,USD",
  "2026-02-03,RIVERSIDE GYM,-30.00,USD",
  "2026-03-03,RIVERSIDE GYM,-30.00,USD",
];

/** The CSV of the slice's "Ended" test: the gym stopped well before the statement end. */
const ENDED_CSV = [
  "Date,Description,Amount",
  "2026-01-05,RIVERSIDE GYM,-30.00",
  "2026-02-05,RIVERSIDE GYM,-30.00",
  "2026-03-05,RIVERSIDE GYM,-30.00",
  "2026-06-20,CORNER BAKERY,-4.50",
];

/** Buries the card on screen and waits for its tombstone. */
async function buryCurrent(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "No, bury it" }));
  await screen.findByRole("region", { name: `Here lies ${name}.` });
}

function section(heading: string): HTMLElement {
  const element = screen.getByRole("heading", { level: 3, name: heading }).closest("section");
  if (element === null) throw new Error(`no section for ${heading}`);
  return element;
}

/** Skips Adobe, buries Netflix and Spotify, keeps nothing else, and opens the graveyard. */
async function buryNetflixAndSpotify() {
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  cardHeading("Riverside Gym Membership");
  fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
  cardHeading("Netflix");
  await buryCurrent("Netflix");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  cardHeading("Spotify");
  await buryCurrent("Spotify");
}

describe("graveyard flow: skip and next", () => {
  it("moves a skipped card to the end and ends on 'Every undead has an answer.'", async () => {
    render(<App />);
    await chooseSample(US_LABEL);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(cardHeading("Riverside Gym Membership")),
    );
    expect(liveRegion().textContent).toContain("Riverside Gym Membership.");
    expectUnique();

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    const waiting = within(section("Not answered yet")).getAllByRole("listitem");
    expect(waiting).toHaveLength(4);
    expect(waiting[3]?.textContent).toContain("Adobe Creative Cloud");
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    cardHeading("Riverside Gym Membership");

    keepAndNext();
    keepAndNext();
    keepAndNext();
    cardHeading("Adobe Creative Cloud");
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    expect(screen.getByText("4 of 4 answered")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Visit the graveyard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open the graveyard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Visit the graveyard" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));

    const main = within(document.querySelector("main") as HTMLElement);
    expect(main.getByText("Every undead has an answer.")).toBeTruthy();
    expect(liveRegion().textContent).toBe("Every undead has an answer.");
    expectUnique();
  });
});

describe("graveyard flow: guessed", () => {
  it("keeps a guessed charge and says how often is a guess", async () => {
    render(<App />);
    dropCsv(GUESSED_CSV);
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });

    expect(card("Netflix")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    await screen.findByText("Kept. It rests.");
    expect(screen.getByText(/It goes on charging/).textContent).toBe(
      `It goes on charging ${formatMoney(1299, "EUR")} (how often is a guess).`,
    );
  });

  it("buries a guessed charge with an unknown saving and leaves the counter alone", async () => {
    render(<App />);
    dropCsv(GUESSED_CSV);
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    const before = counterText();

    await buryCurrent("Netflix");

    const tombstone = screen.getByRole("region", { name: "Here lies Netflix." });
    expect(tombstone.textContent).toContain("Saving unknown: guessed from one charge");
    expect(counterText()).toBe(before);
    expect(liveRegion().textContent).toContain("Netflix is buried. Saving unknown");
  });
});

describe("graveyard flow: Graveyard view", () => {
  it("lists tombstones, resting, unanswered, and returns to the gym card", async () => {
    render(<App />);
    await chooseSample(US_LABEL);
    // Adobe is kept first, then Gym is skipped to leave it unanswered.
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    cardHeading("Riverside Gym Membership");
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await buryCurrent("Netflix");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    cardHeading("Spotify");
    await buryCurrent("Spotify");

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));

    const heading = screen.getByRole("heading", { level: 2, name: "Your graveyard" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    const total = screen.getByText(/You buried/);
    expect(total.textContent).toBe(`You buried ${formatMoney(34776, "USD")} a year.`);
    expectUnique();
    const stones = screen.getAllByRole("region", { name: /^Here lies / });
    expect(stones).toHaveLength(2);
    expect(stones[0]?.textContent).toContain("Netflix");
    expect(stones[1]?.textContent).toContain("Spotify");

    const resting = within(section("Resting"));
    expect(resting.getByText(/Adobe Creative Cloud/)).toBeTruthy();
    expect(
      resting.getByRole("button", { name: "Bury after all Adobe Creative Cloud" }),
    ).toBeTruthy();
    expect(
      within(section("Not answered yet")).getByRole("button", {
        name: "Answer now Riverside Gym Membership",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Answer now Riverside Gym Membership" }));
    const gym = cardHeading("Riverside Gym Membership");
    await waitFor(() => expect(document.activeElement).toBe(gym));
    expect(screen.queryByRole("heading", { level: 2, name: "Your graveyard" })).toBeNull();
  });

  it("says nothing is buried yet when no answer was given", async () => {
    render(<App />);
    await chooseSample(US_LABEL);

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));

    expect(screen.getByText("Nothing buried yet.")).toBeTruthy();
    expect(screen.queryByText(/You buried/)).toBeNull();
  });

  it("goes back to the start from idle and focuses the drop area", async () => {
    render(<App />);
    await chooseSample(US_LABEL);
    reachNetflix();
    await buryCurrent("Netflix");
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    const dropArea = screen.getByRole("button", { name: DROP_AREA_NAME });
    await waitFor(() => expect(document.activeElement).toBe(dropArea));

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));

    expect(screen.getByRole("heading", { level: 2, name: "Your graveyard" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to the rising" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to the start" }));
    expect(screen.queryByRole("heading", { level: 2, name: "Your graveyard" })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: DROP_AREA_NAME })),
    );
  });
});

describe("graveyard flow: Already stopped", () => {
  it("shows no undead and lists the stopped series on the Rising and in the Graveyard view", async () => {
    render(<App />);
    dropCsv(ENDED_CSV);
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });

    expect(screen.getByRole("heading", { level: 3, name: "No undead here." })).toBeTruthy();
    expect(screen.getByText("Every recurring charge found has already stopped.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));

    const stopped = within(section("Already stopped"));
    expect(stopped.getByText(/Riverside Gym · last charged 5 Mar 2026/).textContent).toMatch(
      /· last charged 5 Mar 2026$/,
    );
  });
});

describe("graveyard flow: change answers", () => {
  it("unburies Netflix to Resting and buries it again after all", async () => {
    render(<App />);
    await chooseSample(US_LABEL);
    await buryNetflixAndSpotify();
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByText(/You buried/).textContent).toContain(formatMoney(34776, "USD"));

    fireEvent.click(screen.getByRole("button", { name: "Unbury Netflix" }));

    expect(screen.getByText(/You buried/).textContent).toContain(formatMoney(13188, "USD"));
    const item = within(section("Resting"))
      .getByText(/Netflix/)
      .closest("li");
    expect(item).not.toBeNull();
    expect(
      within(item as HTMLElement).getByRole("button", { name: "Bury after all Netflix" }),
    ).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(item));
    expectUnique();
    expect(liveRegion().textContent).toMatch(/^Netflix is unburied and rests\./);
    expect(liveRegion().textContent).toContain(
      `Still draining ${formatMoney(122376, "USD")} a year.`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Bury after all Netflix" }));

    expect(screen.getByText(/You buried/).textContent).toContain(formatMoney(34776, "USD"));
    const tombstone = screen.getByRole("region", { name: "Here lies Netflix." });
    await waitFor(() => expect(document.activeElement).toBe(tombstone));
    expect(liveRegion().textContent).toMatch(/^Netflix is buried\./);
    expectUnique();
  });
});

describe("graveyard flow: no storage", () => {
  it("writes nothing to storage, cookies or the URL, and keeps the Graveyard when the Sample is chosen again", async () => {
    const calls = (["getItem", "setItem", "removeItem", "clear"] as const).map((method) =>
      vi.spyOn(Storage.prototype, method),
    );
    const hashBefore = window.location.hash;
    render(<App />);
    await chooseSample(US_LABEL);
    reachNetflix();
    await buryCurrent("Netflix");

    await chooseSample(US_LABEL);

    expect(screen.queryByRole("region", { name: "Netflix" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 3, name: "Netflix" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByRole("region", { name: "Here lies Netflix." })).toBeTruthy();
    expect(screen.getByText(/You buried/).textContent).toContain(formatMoney(21588, "USD"));

    for (const spy of calls) expect(spy).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    expect(window.location.hash).toBe(hashBefore);
  });
});

describe("graveyard flow: unique names and Tab order", () => {
  it("tabs the first card in the drawn order", async () => {
    const user = userEvent.setup();
    render(<App />);
    await chooseSample(US_LABEL);
    await waitFor(() => expect(document.activeElement).toBe(cardHeading("Adobe Creative Cloud")));
    (document.activeElement as HTMLElement).blur();

    const expected = [
      "Open the graveyard",
      "Yes, let it rest",
      "No, bury it",
      "Skip for now",
      DROP_AREA_NAME,
      "Choose a file",
      ...SAMPLES.map((sample) => sample.label),
      "Start again",
    ];
    for (const name of expected) {
      await user.tab();
      const active = document.activeElement as HTMLElement;
      expect(active.getAttribute("aria-label") ?? active.textContent).toBe(name);
    }
    expectUnique();
  });
});

describe("graveyard flow: scene is decorative", () => {
  it("hides every svg and backdrop layer and draws no img", async () => {
    const { container } = render(<App />);
    await chooseSample(US_LABEL);
    reachNetflix();
    await buryCurrent("Netflix");

    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    const layers = [...container.querySelectorAll<HTMLElement>(".fixed")];
    expect(layers.length).toBeGreaterThan(0);
    for (const layer of layers) expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="img"]')).toBeNull();
  });
});
