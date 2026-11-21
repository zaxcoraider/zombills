// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { analyzeStatement } from "./logic/analyze-statement";
import { partsToText, priceRiseParts } from "./logic/label-text";
import { NoSubscriptionsView } from "./no-subscriptions-view";
import { storeLoadOf } from "./storage/test-store";
import { fakeStorage, fakeStoreTarget } from "./storage/test-store";
import { createGraveyardStore } from "./storage/graveyard-store";
import { formatMoney } from "./logic/money";
import {
  NEWER_NOTE,
  PRIVACY_NOTE,
  STATEMENT_TIP,
  UNREADABLE_NOTE,
  droppedNote,
  restoredLine,
} from "./logic/memory-text";
import {
  PRIMARY_ACTION_NAME,
  READ_PRIVACY_NOTE,
  KIRO_LINK,
  REAPER_LINK,
  REPO_LINK,
} from "./logic/landing-text";
import { SAMPLES } from "./samples";

const US_LABEL = "US bank statement";
const UK_LABEL = "UK bank statement";
const DROP_AREA_NAME = "Drop area: choose or drop a CSV statement";

function csvFile(text: string, name = "statement.csv", type = "text/csv"): File {
  return new File([text], name, { type });
}

function dropAreaElement(): HTMLElement {
  return screen.getByRole("button", { name: DROP_AREA_NAME });
}

function dropFiles(files: File[]) {
  fireEvent.drop(dropAreaElement(), { dataTransfer: { files, types: ["Files"] } });
}

async function chooseSample(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
}

/** Summon the undead with the US Sample, through the Landing view's Primary action. */
async function summon() {
  fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
  await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
}

function liveRegion(): HTMLElement {
  return screen.getByRole("status");
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SlicePage: Idle", () => {
  it("shows the heading, tagline, privacy note, tip, inputs, Primary action and samples", () => {
    const { container } = render(<App />);

    const h1 = screen.getByRole("heading", { level: 1, name: "Zombills" });
    expect(h1.className).toContain("font-display");
    expect(container.querySelector("main")?.className).toContain("max-w-[1184px]");
    expect(screen.getAllByText(PRIVACY_NOTE)).toHaveLength(1);
    expect(screen.getAllByText(STATEMENT_TIP)).toHaveLength(1);
    expect(dropAreaElement()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a file" })).toBeTruthy();
    const input = container.querySelector('input[type="file"]');
    expect(input?.getAttribute("accept")).toBe(".csv,text/csv");
    expect(input?.getAttribute("aria-label")).toBe("CSV statement file");
    expect(screen.getByRole("button", { name: PRIMARY_ACTION_NAME })).toBeTruthy();
    const otherSamples = within(screen.getByRole("list", { name: "Other sample statements" }));
    expect(otherSamples.getAllByRole("button").map((button) => button.textContent)).toEqual(
      SAMPLES.slice(1).map((sample) => sample.label),
    );
    expect(SAMPLES).toHaveLength(4);
    const usSample = SAMPLES[0] as (typeof SAMPLES)[number];
    expect(usSample.fileName).toBe("us-signed.csv");
    expect(screen.queryByRole("button", { name: usSample.label })).toBeNull();
    expect(screen.getByText("Your bank statement is haunted.")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    for (const link of links) expect(link.closest("footer")).not.toBeNull();
    expect(links.map((link) => link.textContent)).toEqual([
      REPO_LINK.text,
      REAPER_LINK.text,
      KIRO_LINK.text,
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      REPO_LINK.href,
      REAPER_LINK.href,
      KIRO_LINK.href,
    ]);
    expect(liveRegion().textContent).toBe("");
  });
});

const NETFLIX_BURIED = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
};
const SPOTIFY_KEPT = {
  id: "sub:USD:monthly:*:spotify",
  merchant: "Spotify",
  serviceId: "spotify",
  currentAmountCents: 1199,
  answer: "still-using",
  cadenceAssumed: false,
  carriedOver: false,
};

function renderWithStore(text: string | null) {
  const store = createGraveyardStore(fakeStoreTarget(fakeStorage()));
  return render(<App store={store} initialStore={storeLoadOf(text)} />);
}

describe("SlicePage: Idle, loaded Store", () => {
  it("shows the restored line above Open the graveyard", () => {
    renderWithStore(JSON.stringify({ version: 1, records: [NETFLIX_BURIED, SPOTIFY_KEPT] }));
    const line = screen.getByText(restoredLine(1, 1));
    expect(line.textContent).toBe("Your graveyard from this device is back: 1 buried, 1 resting.");
    const open = screen.getByRole("button", { name: "Open the graveyard" });
    expect(line.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(liveRegion().textContent).toBe("");
  });

  it("shows the unreadable note and keeps the Live region empty", () => {
    renderWithStore("not json");
    expect(screen.getByText(UNREADABLE_NOTE)).toBeTruthy();
    expect(liveRegion().textContent).toBe("");
  });

  it("shows the newer note and keeps the Live region empty", () => {
    renderWithStore(JSON.stringify({ version: 2, records: [] }));
    expect(screen.getByText(NEWER_NOTE)).toBeTruthy();
    expect(liveRegion().textContent).toBe("");
  });

  it("shows the dropped note for an ok load with one bad record", () => {
    renderWithStore(JSON.stringify({ version: 1, records: [NETFLIX_BURIED, { id: "bad" }] }));
    expect(screen.getByText(droppedNote(1))).toBeTruthy();
    expect(screen.getByText(restoredLine(1, 0))).toBeTruthy();
    expect(liveRegion().textContent).toBe("");
  });

  it("drops the line and the notes after a statement is analysed", async () => {
    renderWithStore(JSON.stringify({ version: 1, records: [NETFLIX_BURIED, { id: "bad" }] }));
    await summon();
    expect(screen.queryByText(restoredLine(1, 0))).toBeNull();
    expect(screen.queryByText(droppedNote(1))).toBeNull();
  });
});

describe("SlicePage: Working", () => {
  it("shows the reading text and disables the inputs until the frame is released", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));

    await waitFor(() => expect(frames).toHaveLength(1));
    expect(screen.getAllByText(`Reading ${US_LABEL}…`).length).toBeGreaterThan(0);
    expect(liveRegion().textContent).toBe(`Reading ${US_LABEL}…`);
    // aria-disabled, not the disabled attribute, so the clicked Sample button keeps focus.
    const fileButton = screen.getByRole("button", { name: "Choose a file" });
    expect(fileButton.getAttribute("aria-disabled")).toBe("true");
    expect(fileButton.hasAttribute("disabled")).toBe(false);
    // The Landing-origin working view keeps the Primary action and the three Secondary samples,
    // all four aria-disabled (the US Sample has no button of its own besides the Primary action).
    const primaryAction = screen.getByRole("button", { name: PRIMARY_ACTION_NAME });
    const secondarySamples = SAMPLES.slice(1).map((sample) =>
      screen.getByRole("button", { name: sample.label }),
    );
    expect(secondarySamples).toHaveLength(3);
    expect(screen.queryByRole("button", { name: US_LABEL })).toBeNull();
    for (const button of [primaryAction, ...secondarySamples]) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.hasAttribute("disabled")).toBe(false);
    }

    // Clicking a Sample button or the file button while working starts nothing.
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const pickerClick = vi.spyOn(input as HTMLInputElement, "click");
    fireEvent.click(screen.getByRole("button", { name: UK_LABEL }));
    fireEvent.click(fileButton);
    await act(async () => {});
    expect(pickerClick).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    expect(screen.queryByText(`Reading ${UK_LABEL}…`)).toBeNull();
    expect(liveRegion().textContent).toBe(`Reading ${US_LABEL}…`);
    expect(dropAreaElement().getAttribute("aria-disabled")).toBe("true");

    // A second drop while working is ignored.
    const arrayBuffer = vi.fn();
    const second = csvFile("a,b", "second.csv");
    second.arrayBuffer = arrayBuffer;
    dropFiles([second]);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(screen.queryByText("File: second.csv")).toBeNull();

    await act(async () => {
      frames[0]?.(0);
    });
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    expect(frames).toHaveLength(1);
  });
});

describe("SlicePage: Results from a Sample", () => {
  it("shows the summary, the Rising order, the cards, the total and the first card's focus", async () => {
    render(<App />);
    await summon();

    const adobeHeading = screen.getByRole("heading", { level: 3, name: "Adobe Creative Cloud" });
    await waitFor(() => expect(document.activeElement).toBe(adobeHeading));

    const summary = screen.getByText(/2 Jan 2026 to 25 Mar 2026/);
    expect(summary.textContent).toContain(US_LABEL);
    expect(summary.textContent).toMatch(/\d+ transactions read/);

    // The Rising order, seen through "Skip for now": the card after each skip.
    const seen: string[] = [];
    for (let step = 0; step < 4; step += 1) {
      const heading = document.querySelector("section[aria-labelledby] h3");
      seen.push(heading?.textContent ?? "");
      if (step < 3) fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    }
    expect(seen).toEqual([
      "Adobe Creative Cloud",
      "Riverside Gym Membership",
      "Netflix",
      "Spotify",
    ]);

    // Spotify is the card now, and it is the last one.
    const spotify = screen.getByRole("region", { name: "Spotify" });
    expect(spotify.textContent).toContain("Monthly");
    expect(spotify.textContent).toContain(formatMoney(1099, "USD"));
    expect(spotify.textContent).toContain(formatMoney(13188, "USD"));
    expect(spotify.textContent).toContain("a year");
    expect(spotify.textContent).not.toContain("Price went up");

    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: `Answer now Netflix · ${formatMoney(21588, "USD")} a year`,
      }),
    );
    const netflix = screen.getByRole("region", { name: "Netflix" });
    const history = within(netflix).getByRole("list", { name: "Price history" });
    const entries = Array.from(history.children).map((child) => child.textContent);
    expect(entries).toEqual([
      `2 Jan 2026: ${formatMoney(1549, "USD")}`,
      `2 Mar 2026: ${formatMoney(1799, "USD")}`,
    ]);
    const outcome = analyzeStatement(SAMPLES[0]?.text ?? "");
    if (outcome.kind !== "results") throw new Error("expected results for the US Sample");
    const netflixRise = outcome.subscriptions.find(
      (entry) => entry.merchant === "Netflix",
    )?.priceRise;
    if (netflixRise === null || netflixRise === undefined) throw new Error("expected a price rise");
    expect(netflix.textContent).toContain(partsToText(priceRiseParts(netflixRise, "USD")));

    const moneySpans = Array.from(document.querySelectorAll("main span")).filter(
      (span) => span.children.length === 0 && /\$\d/.test(span.textContent ?? ""),
    );
    expect(moneySpans.length).toBeGreaterThan(0);
    for (const span of moneySpans) expect(span.classList.contains("money")).toBe(true);

    expect(screen.getByText(/Still draining/).textContent).toContain(formatMoney(135564, "USD"));
    expect(
      screen.getByText("No currency was found in the statement, so amounts are shown in USD."),
    ).toBeTruthy();
  });

  it("announces the first card in the live region", async () => {
    render(<App />);
    await summon();
    expect(liveRegion().textContent).toBe(
      `Found 4 recurring charges. Still draining ${formatMoney(135564, "USD")} a year. ` +
        `Adobe Creative Cloud. Monthly, ${formatMoney(5499, "USD")}. ` +
        `${formatMoney(65988, "USD")} a year. Still using this?`,
    );
  });
});

describe("SlicePage: No subscriptions", () => {
  it("explains that three unrelated purchases are not recurring", async () => {
    render(<App />);
    dropFiles([
      csvFile(
        "Date,Description,Amount\n2026-01-03,CORNER BAKERY,-4.50\n2026-01-09,HARDWARE DEPOT,-23.10\n2026-01-20,BOOK NOOK,-12.00\n",
      ),
    ]);

    const heading = await screen.findByRole("heading", { level: 2, name: "No undead here." });
    expect(document.activeElement).toBe(heading);
    expect(
      screen.getByText(
        /No recurring charges were found in the 3 transactions read between 3 Jan 2026 and 20 Jan 2026\. A statement covering 2 to 3 months or more finds more\./,
      ),
    ).toBeTruthy();
    expect(liveRegion().textContent).toBe("No recurring charges found.");
  });
});

describe("SlicePage: Start again", () => {
  it("returns to idle, focuses the drop area and drops the result", async () => {
    render(<App />);
    await summon();

    fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));

    await waitFor(() => expect(document.activeElement).toBe(dropAreaElement()));
    expect(screen.queryByRole("heading", { name: "Recurring charges found" })).toBeNull();
    expect(screen.queryByText("Adobe Creative Cloud")).toBeNull();
    expect(liveRegion().textContent).toBe("");
  });

  it("does not focus the drop area on first load", () => {
    render(<App />);
    expect(document.activeElement).not.toBe(dropAreaElement());
  });
});

describe("SlicePage: Replace result", () => {
  it("replaces the first result when another sample is chosen", async () => {
    render(<App />);
    await summon();
    expect(screen.getByText(/2 Jan 2026 to 25 Mar 2026/).textContent).toContain(US_LABEL);

    fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    fireEvent.click(
      within(screen.getByRole("list", { name: "Sample statements" })).getByRole("button", {
        name: UK_LABEL,
      }),
    );

    await waitFor(() =>
      expect(screen.getByText(/transactions read/).textContent).toContain(UK_LABEL),
    );
    expect(screen.queryByText(new RegExp(`${US_LABEL}.*transactions read`))).toBeNull();
    // The first card is a GBP one; no USD figure is on the page.
    const card = document.querySelector("section[aria-labelledby]") as HTMLElement;
    expect(card.textContent).toContain("£");
    expect(document.body.textContent).not.toContain("$");
  });
});

describe("SlicePage: Keyboard", () => {
  it("tabs through the Primary action, the three Secondary samples, the privacy note, drop area, Choose a file and the four Footer tombstones", async () => {
    const user = userEvent.setup();
    render(<App />);

    const expected = [
      PRIMARY_ACTION_NAME,
      ...SAMPLES.slice(1).map((sample) => sample.label),
      READ_PRIVACY_NOTE,
      DROP_AREA_NAME,
      "Choose a file",
      "Zombills on GitHub",
      "The Reaper",
      "Privacy note",
      "Built with Kiro",
    ];
    for (const name of expected) {
      await user.tab();
      const active = document.activeElement as HTMLElement;
      expect(active.getAttribute("aria-label") ?? active.textContent).toBe(name);
    }
  });

  it("opens the file picker on Enter (keydown) and Space (keyup)", () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    const area = dropAreaElement();

    fireEvent.keyDown(area, { key: "Enter" });
    expect(click).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(area, { key: " " });
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(area, { key: " " });
    expect(click).toHaveBeenCalledTimes(2);
  });
});

describe("SlicePage: Drag-over text", () => {
  it("shows the release text while dragging over and restores it on leave", () => {
    render(<App />);
    expect(screen.getByText("Drop a CSV statement here")).toBeTruthy();

    fireEvent.dragEnter(dropAreaElement(), { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Release to read this file")).toBeTruthy();
    expect(screen.queryByText("Drop a CSV statement here")).toBeNull();

    fireEvent.dragLeave(dropAreaElement());
    expect(screen.getByText("Drop a CSV statement here")).toBeTruthy();
    expect(screen.queryByText("Release to read this file")).toBeNull();
  });
});

describe("SlicePage: Drop outside", () => {
  it("prevents the browser default for a drop on the body and stays idle", () => {
    render(<App />);
    const event = new Event("drop", { bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText("Drop a CSV statement here")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /recurring/i })).toBeNull();
  });
});

function spyOnRead(file: File) {
  const arrayBuffer = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
  file.arrayBuffer = arrayBuffer;
  return arrayBuffer;
}

/** Checks the error heading, its focus, the alert text and the live-region text. */
async function expectError(summary: string, detail?: string, focusStays = true) {
  const heading = await screen.findByRole("heading", { level: 2, name: summary });
  if (focusStays) await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(screen.getByRole("alert").textContent).toContain(summary);
  expect(liveRegion().textContent).toBe(summary);
  if (detail !== undefined) expect(screen.getByText(detail)).toBeTruthy();
  return heading;
}

describe("SlicePage: Skipped rows", () => {
  it("counts a row whose amount cannot be read", async () => {
    render(<App />);
    dropFiles([
      csvFile(
        [
          "Date,Description,Amount",
          "2026-01-02,NETFLIX.COM,-15.49",
          "2026-02-02,NETFLIX.COM,-15.49",
          "2026-03-02,NETFLIX.COM,-15.49",
          "2026-03-10,CORNER BAKERY,not an amount",
        ].join("\n"),
      ),
    ]);

    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    expect(screen.getByText(/1 row skipped because it could not be read/)).toBeTruthy();
  });
});

describe("SlicePage: Error: two files", () => {
  it("rejects two files without reading either", async () => {
    render(<App />);
    const first = csvFile("a,b", "one.csv");
    const second = csvFile("a,b", "two.csv");
    const firstRead = spyOnRead(first);
    const secondRead = spyOnRead(second);

    dropFiles([first, second]);

    await expectError("Only one statement can be read at a time. Drop a single CSV file.");
    expect(firstRead).not.toHaveBeenCalled();
    expect(secondRead).not.toHaveBeenCalled();
  });
});

describe("SlicePage: Error: too large", () => {
  it("rejects a file over 1 MB without reading it", async () => {
    render(<App />);
    const big = new File([new Uint8Array(1_048_577)], "big.csv", { type: "text/csv" });
    const read = spyOnRead(big);

    dropFiles([big]);

    const heading = await expectError("This file is larger than 1 MB, so it was not read.");
    expect(heading.textContent).toContain("1 MB");
    expect(read).not.toHaveBeenCalled();
  });
});

describe("SlicePage: Error: not CSV", () => {
  const NOT_CSV = "This file is not a CSV statement.";

  it("rejects a text file picked through the input", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    // user-event gives the file input focus again after the change event, which a real
    // picker does not, so this case checks that the heading received focus at all.
    const focused: EventTarget[] = [];
    const record = (event: Event) => focused.push(event.target as EventTarget);
    document.addEventListener("focusin", record);
    await user.upload(input, csvFile("hello", "notes.txt", "text/plain"));
    const heading = await expectError(NOT_CSV, undefined, false);
    document.removeEventListener("focusin", record);

    expect(focused).toContain(heading);
  });

  it("rejects the same file dropped", async () => {
    render(<App />);
    dropFiles([csvFile("hello", "notes.txt", "text/plain")]);
    await expectError(NOT_CSV);
  });

  it("rejects a .csv that contains U+0000", async () => {
    render(<App />);
    dropFiles([csvFile("Date,Description,Amount\u0000\n2026-01-02,NETFLIX.COM,-15.49")]);
    await expectError(NOT_CSV);
  });
});

describe("SlicePage: Error: empty", () => {
  it("rejects a 0-byte file", async () => {
    render(<App />);
    dropFiles([csvFile("", "empty.csv")]);
    await expectError("The file is empty.");
    expect(screen.getByText("File: empty.csv")).toBeTruthy();
  });
});

describe("SlicePage: Error: columns missing", () => {
  it("names the missing description column", async () => {
    render(<App />);
    dropFiles([csvFile("Date,Amount\n2026-01-02,-15.49")]);

    const heading = await screen.findByRole("heading", {
      level: 2,
      name: /^The columns could not be recognised\./,
    });
    expect(heading.textContent).toContain("No description column was found.");
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(liveRegion().textContent).toBe(heading.textContent);
    expect(screen.getByRole("alert").textContent).toContain("No description column was found.");
    expect(screen.getByText("Columns found: Date, Amount.")).toBeTruthy();
  });
});

describe("SlicePage: Error: headerless", () => {
  it("lists NETFLIX.COM and shows neither the date nor the amount", async () => {
    render(<App />);
    dropFiles([csvFile("01/02/2026,NETFLIX.COM,-15.49")]);

    const heading = await screen.findByRole("heading", {
      level: 2,
      name: /^The columns could not be recognised\./,
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(liveRegion().textContent).toBe(heading.textContent);
    expect(screen.getByText("Columns found: NETFLIX.COM.")).toBeTruthy();
    const alertText = screen.getByRole("alert").textContent ?? "";
    expect(alertText).not.toContain("01/02/2026");
    expect(alertText).not.toContain("-15.49");
    expect(document.body.textContent).not.toContain("01/02/2026");
    expect(document.body.textContent).not.toContain("-15.49");
  });
});

describe("SlicePage: Error: unreadable", () => {
  it("reports a file that cannot be opened", async () => {
    render(<App />);
    const file = csvFile("Date,Description,Amount\n", "locked.csv");
    file.arrayBuffer = vi.fn(() => Promise.reject(new Error("denied")));

    dropFiles([file]);

    await expectError("The file could not be opened.");
    expect(screen.getByText("File: locked.csv")).toBeTruthy();
  });
});

describe("SlicePage: Windows-1252 file", () => {
  it("reads a Windows-1252 copy of the UK Sample the same as the Sample", async () => {
    const uk = SAMPLES.find((sample) => sample.fileName === "uk-debit-credit.csv");
    expect(uk).toBeDefined();
    const text = (uk as (typeof SAMPLES)[number]).text;
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code === 0xa3) {
        bytes[i] = 0xa3;
      } else {
        // The Sample must hold no other non-ASCII character.
        expect(code).toBeLessThan(0x80);
        bytes[i] = code;
      }
    }

    function snapshot() {
      const summary = screen.getByText(/transactions read/).textContent ?? "";
      const main = document.querySelector("main") as HTMLElement;
      const risingSummary = within(main).getByText(/Still draining/).textContent;
      const card = document.querySelector("section[aria-labelledby]") as HTMLElement;
      return {
        summary: summary.replace(/^[^·]*(?= ·)/, ""),
        risingSummary,
        card: card.textContent,
      };
    }

    const first = render(<App />);
    await chooseSample(UK_LABEL);
    const fromSample = snapshot();
    first.unmount();

    render(<App />);
    dropFiles([new File([bytes], "uk-debit-credit.csv", { type: "text/csv" })]);
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    const fromFile = snapshot();

    expect(fromFile).toEqual(fromSample);
    expect(fromFile.card).toContain("£");
  });
});

describe("SlicePage: Guessed-only group", () => {
  it("shows guessed charges without a total and with the not-included note", async () => {
    render(<App />);
    dropFiles([
      csvFile(
        [
          "Date,Description,Amount,Currency",
          "2026-01-05,NETFLIX.COM,-12.99,EUR",
          "2026-01-03,RIVERSIDE GYM,-30.00,USD",
          "2026-02-03,RIVERSIDE GYM,-30.00,USD",
          "2026-03-03,RIVERSIDE GYM,-30.00,USD",
        ].join("\n"),
      ),
    ]);

    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    const main = within(document.querySelector("main") as HTMLElement);
    // Only USD has a Currency total; the EUR group shows its note alone.
    expect(main.getByText(/Still draining/).textContent).toContain(formatMoney(36000, "USD"));
    expect(main.getAllByText(/Still draining/)).toHaveLength(1);
    expect(
      main.getByText("EUR: Ended subscriptions and guessed ones are not included in the total."),
    ).toBeTruthy();
    // EUR comes before USD in the statement's currencies, so the guessed Netflix rises first.
    const card = main.getByRole("region", { name: "Netflix" });
    expect(within(card).getByText("Guessed from a single charge")).toBeTruthy();
  });
});

describe("SlicePage: Assumed value", () => {
  it("notes that USD was assumed when the statement names no currency", async () => {
    render(<App />);
    await summon();
    expect(
      screen.getByText("No currency was found in the statement, so amounts are shown in USD."),
    ).toBeTruthy();
  });

  it("shows the note in NoSubscriptionsView as a muted p after the summary line (Req 10.1)", () => {
    const outcome = analyzeStatement(
      ["Date,Description,Amount", "2026-01-05,CORNER BAKERY,-4.50"].join("\n"),
    );
    if (outcome.kind !== "no-subscriptions") throw new Error(`got ${outcome.kind}`);
    render(<NoSubscriptionsView sourceName="s.csv" outcome={outcome} onStartAgain={() => {}} />);
    const note = screen.getByText(
      "No currency was found in the statement, so amounts are shown in USD.",
    );
    expect(note.tagName).toBe("P");
    expect(note.classList.contains("text-caption")).toBe(true);
    expect(note.classList.contains("sm:text-small")).toBe(true);
    expect(note.classList.contains("text-bone/80")).toBe(true);
    const summary = screen.getByText(/No recurring charges were found/);
    expect(summary.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("SlicePage: Ended", () => {
  it("marks a series that stopped well before the statement end", async () => {
    render(<App />);
    dropFiles([
      csvFile(
        [
          "Date,Description,Amount",
          "2026-01-05,RIVERSIDE GYM,-30.00",
          "2026-02-05,RIVERSIDE GYM,-30.00",
          "2026-03-05,RIVERSIDE GYM,-30.00",
          "2026-06-20,CORNER BAKERY,-4.50",
        ].join("\n"),
      ),
    ]);

    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    const main = within(document.querySelector("main") as HTMLElement);
    expect(main.getByRole("heading", { level: 3, name: "No undead here." })).toBeTruthy();
    expect(main.getByText("Every recurring charge found has already stopped.")).toBeTruthy();
    expect(main.getByText(/Riverside Gym · last charged 5 Mar 2026/)).toBeTruthy();
    // The currency has no Currency total, so its note shows alone.
    expect(main.queryByText(/Still draining/)).toBeNull();
    expect(
      main.getByText("USD: Ended subscriptions and guessed ones are not included in the total."),
    ).toBeTruthy();
  });
});

const FOG_PANEL = '[class~="bg-fog/95"]';

describe("SlicePage: fog panels", () => {
  it("puts the Reading line and the error heading on a fog panel", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    await waitFor(() => expect(frames).toHaveLength(1));
    const reading = screen.getAllByText(`Reading ${US_LABEL}…`)[0] as HTMLElement;
    expect(reading.closest(FOG_PANEL)).not.toBeNull();
    await act(async () => {
      frames[0]?.(0);
    });
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    cleanup();
    vi.unstubAllGlobals();

    render(<App />);
    dropFiles([csvFile("", "empty.csv")]);
    const heading = await screen.findByRole("heading", { level: 2, name: "The file is empty." });
    expect(heading.closest(FOG_PANEL)).not.toBeNull();
  });
});

describe("SlicePage: Button variants on error (pro-polish Req 6.5)", () => {
  it("Start again is primary and Open the graveyard secondary, both inside the state Card", async () => {
    renderWithStore(JSON.stringify({ version: 1, records: [NETFLIX_BURIED] }));
    dropFiles([csvFile("", "empty.csv")]);
    await screen.findByRole("heading", { level: 2, name: "The file is empty." });
    const card = screen.getByRole("alert").parentElement as HTMLElement;
    expect(card.className).toContain("bg-fog/95");
    const startAgain = within(card).getByRole("button", { name: "Start again" });
    const openGraveyard = within(card).getByRole("button", { name: "Open the graveyard" });
    expect(startAgain.getAttribute("data-variant")).toBe("primary");
    expect(openGraveyard.getAttribute("data-variant")).toBe("secondary");
    expect(screen.getAllByRole("button", { name: "Start again" })).toEqual([startAgain]);
  });
});
