// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { NEW_TAB_TEXT } from "./logic/cancel-text";
import {
  HERO_LINE,
  HOW_IT_WORKS_HEADING,
  HOW_IT_WORKS_STEPS,
  OWN_STATEMENT_HEADING,
  PRIMARY_ACTION_NAME,
  PRIVACY_BADGE_TEXT,
  READ_PRIVACY_NOTE,
  REAPER_DESCRIPTION,
  REAPER_LINK,
  REPO_LINK,
} from "./logic/landing-text";
import { PRIVACY_NOTE, STATEMENT_TIP, droppedNote, restoredLine } from "./logic/memory-text";
import { LANDING_SKY_BACKGROUND, SKY_BACKGROUND } from "./graveyard/graveyard-backdrop";
import { SAMPLES } from "./samples";
import { createGraveyardStore } from "./storage/graveyard-store";
import { fakeStorage, fakeStoreTarget, storeLoadOf } from "./storage/test-store";

const US_LABEL = "US bank, signed amounts";
const UK_LABEL = "UK bank, debit and credit columns";
const EU_LABEL = "EU bank, semicolons";
const PREAMBLE_LABEL = "Statement with a header block";
const SECONDARY_LABELS = [UK_LABEL, EU_LABEL, PREAMBLE_LABEL];
const DROP_AREA_NAME = "Drop area: choose or drop a CSV statement";
const THREE_ROW_FILE =
  "Date,Description,Amount\n2026-01-03,CORNER BAKERY,-4.50\n2026-01-09,HARDWARE DEPOT,-23.10\n2026-01-20,BOOK NOOK,-12.00\n";

const SVG_COUNT = 14;

/** The NightScene root (the element holding --ground-h) and its first fixed layer. */
function sceneParts(container: HTMLElement) {
  const root = Array.from(container.querySelectorAll<HTMLElement>("div")).find(
    (el) => el.style.getPropertyValue("--ground-h") !== "",
  );
  if (root === undefined) throw new Error("expected the NightScene root");
  const layer = root.querySelector<HTMLElement>(":scope > .fixed");
  if (layer === null) throw new Error("expected the first fixed layer");
  return { root, layer };
}

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
const RESTORED_WITH_BAD_RECORD = JSON.stringify({
  version: 1,
  records: [NETFLIX_BURIED, { id: "bad" }],
});

function renderFirstVisit() {
  return render(<App />);
}

function renderRestored(text: string) {
  const store = createGraveyardStore(fakeStoreTarget(fakeStorage()));
  return render(<App store={store} initialStore={storeLoadOf(text)} />);
}

function csvFile(text: string, name = "statement.csv", type = "text/csv"): File {
  return new File([text], name, { type });
}

function dropArea(): HTMLElement {
  return screen.getByRole("button", { name: DROP_AREA_NAME });
}

function dropFiles(files: File[]) {
  fireEvent.drop(dropArea(), { dataTransfer: { files, types: ["Files"] } });
}

function liveRegion(): HTMLElement {
  return screen.getByRole("status");
}

function mainElement(): HTMLElement {
  return screen.getByRole("main");
}

function primaryAction(): HTMLElement {
  return screen.getByRole("button", { name: PRIMARY_ACTION_NAME });
}

/** The accessible name of a control in these tests: its `aria-label`, else its text. */
function nameOf(element: HTMLElement): string {
  return element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
}

/** Asserts that every node comes before the next one in document order. */
function expectInOrder(...nodes: Node[]) {
  for (let i = 1; i < nodes.length; i += 1) {
    const before = nodes[i - 1] as Node;
    const after = nodes[i] as Node;
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
}

/** Holds every `requestAnimationFrame` callback so a run stays in `working` until released. */
function holdFrames(): FrameRequestCallback[] {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }),
  );
  return frames;
}

async function summon() {
  fireEvent.click(primaryAction());
  await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Landing view: structure", () => {
  it("has the outline h1, How it works, three steps and Own statement", () => {
    renderFirstVisit();
    const outline = screen
      .getAllByRole("heading")
      .map((h) => [Number(h.tagName.slice(1)), h.textContent]);
    expect(outline).toEqual([
      [1, "Zombills"],
      [2, "How it works"],
      [3, "Find the undead"],
      [3, "Count what they cost"],
      [3, "Bury them"],
      [2, "Or read your own statement"],
    ]);
    expect(screen.queryByRole("heading", { name: "Or try a sample statement" })).toBeNull();
  });

  it("has one banner, main and contentinfo, with the Live region outside all three", () => {
    renderFirstVisit();
    const banner = screen.getAllByRole("banner");
    const main = screen.getAllByRole("main");
    const footer = screen.getAllByRole("contentinfo");
    expect([banner.length, main.length, footer.length]).toEqual([1, 1, 1]);
    const live = liveRegion();
    for (const landmark of [...banner, ...main, ...footer]) {
      expect(landmark.contains(live)).toBe(false);
    }
  });

  it("keeps the DOM order of the Landing view", () => {
    const { container } = renderRestored(RESTORED_TEXT);
    const art = container.querySelector("[data-hero-art]");
    if (art === null) throw new Error("expected the Hero art");
    expectInOrder(
      screen.getByRole("heading", { level: 1, name: "Zombills" }),
      screen.getByText("Your bank statement is haunted."),
      screen.getByRole("group", { name: "Saved per year" }),
      screen.getByText(HERO_LINE),
      art,
      primaryAction(),
      screen.getByRole("list", { name: "Other sample statements" }),
      screen.getByText(PRIVACY_BADGE_TEXT),
      screen.getByRole("heading", { level: 2, name: HOW_IT_WORKS_HEADING }),
      screen.getByRole("heading", { level: 2, name: OWN_STATEMENT_HEADING }),
      dropArea(),
      screen.getByRole("contentinfo"),
    );
  });

  it("the Hero art has a fixed size at every breakpoint", () => {
    const { container } = renderFirstVisit();
    const art = container.querySelector("[data-hero-art]");
    if (art === null) throw new Error("expected the Hero art");
    const classes = Array.from(art.classList);
    const tall = "[@media(min-height:700px)]";
    for (const expected of [
      "zb-art",
      "h-24",
      "w-32",
      "self-center",
      `max-sm:${tall}:h-48`,
      `max-sm:${tall}:w-64`,
      "sm:h-32",
      "sm:w-[10.5rem]",
      `sm:max-lg:${tall}:h-[15.75rem]`,
      `sm:max-lg:${tall}:w-[21rem]`,
      "lg:h-[16.5rem]",
      "lg:w-[22rem]",
      "lg:self-start",
      "2xl:h-[19.5rem]",
      "2xl:w-[26rem]",
    ]) {
      expect(classes, expected).toContain(expected);
    }
    expect(classes).not.toContain("self-start");
  });

  it("the Landing view has no fixed Ground", () => {
    const { container } = renderFirstVisit();
    const fixed = Array.from(container.querySelectorAll<HTMLElement>(".fixed"));
    expect(fixed.length).toBeGreaterThan(0);
    for (const layer of fixed) {
      for (const el of Array.from(layer.querySelectorAll<HTMLElement>("*"))) {
        expect(el.style.boxShadow, "inset shadow under a fixed layer").not.toContain("inset");
      }
    }
    const all = Array.from(container.querySelectorAll<HTMLElement>("*"));
    expect(all.filter((el) => el.style.height === "var(--ground-h)")).toHaveLength(0);
  });

  it("the Landing sky is fixed and ends in night", () => {
    const { container } = renderFirstVisit();
    const { root, layer } = sceneParts(container);
    expect(root.style.background).toBe("var(--night)");
    expect(layer.style.background.endsWith("var(--night) 100%)")).toBe(true);
    expect(layer.style.background).not.toContain("var(--ground-h)");
    expect(root.style.background).not.toContain("#");
    expect(layer.style.background).not.toContain("#");
  });

  it("the Landing sky background keeps the sky stops and adds the fade", () => {
    expect(LANDING_SKY_BACKGROUND.startsWith("linear-gradient(to bottom, ")).toBe(true);
    const stops = SKY_BACKGROUND.slice("linear-gradient(to bottom, ".length, -1);
    expect(LANDING_SKY_BACKGROUND).toContain(stops);
    // Amended (finding 9.2): the fog stop at 88 % fades straight to night at 100 %. A stop at
    // calc(100% - var(--ground-h)) would be clamped up to 88 % and leave a hard edge there.
    expect(LANDING_SKY_BACKGROUND).toBe(`linear-gradient(to bottom, ${stops}, var(--night) 100%)`);
    expect(LANDING_SKY_BACKGROUND).not.toContain("calc(");
    expect(LANDING_SKY_BACKGROUND.endsWith("var(--fog) 88%, var(--night) 100%)")).toBe(true);
  });

  it("the Hero art ground fades out", () => {
    const { container } = renderFirstVisit();
    const art = container.querySelector("[data-hero-art]");
    if (art === null) throw new Error("expected the Hero art");
    const maskOf = (el: Element): Element => {
      for (let node = el.parentElement; node !== null && node !== art.parentElement; node = node.parentElement) {
        const value = node.getAttribute("mask");
        const match = value === null ? null : /^url\(#(.+)\)$/.exec(value);
        if (match !== null) {
          const mask = Array.from(art.querySelectorAll("mask")).find((m) => m.id === match[1]);
          if (mask === undefined) throw new Error(`no mask ${match[1]} inside the Hero art`);
          return mask;
        }
      }
      throw new Error("no masked ancestor");
    };
    const ground = Array.from(art.querySelectorAll("path")).find((p) =>
      (p.getAttribute("d") ?? "").startsWith("M0 120"),
    );
    if (ground === undefined) throw new Error("expected the ground path");
    const masks = new Set([
      maskOf(ground),
      maskOf(art.querySelector(".zb-fog-a") as Element),
      maskOf(art.querySelector(".zb-fog-b") as Element),
    ]);
    expect(masks.size).toBe(1);
    const mask = Array.from(masks)[0];
    if (mask === undefined) throw new Error("expected a mask");
    const stops = Array.from(mask.querySelectorAll("stop"));
    expect(stops.length).toBeGreaterThan(0);
    for (const stop of stops) {
      expect(stop.getAttribute("stop-color") ?? "").toMatch(/^var\(--/);
    }
    expect(stops.some((stop) => Number(stop.getAttribute("stop-opacity")) === 0)).toBe(true);

    cleanup();
    const first = renderFirstVisit().container.querySelector("[data-hero-art] mask");
    const second = render(<App />).container.querySelectorAll("[data-hero-art] mask");
    const ids = [first?.id, ...Array.from(second).map((m) => m.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the Banner drops its minimum height from lg up", () => {
    renderFirstVisit();
    const header = Array.from(screen.getByRole("banner").classList);
    expect(header).toContain("lg:min-h-0");
    expect(header).toContain("min-h-[calc(var(--moon-d)*1.75+16px)]");
    const main = Array.from(mainElement().classList);
    for (const expected of ["pt-6", "sm:pt-8", "lg:pt-4"]) {
      expect(main, expected).toContain(expected);
    }
  });

  it("has no card behind the banner on a first visit", () => {
    renderFirstVisit();
    expect(screen.getByRole("banner").querySelector(".bg-fog\\/95")).toBeNull();
  });
});

describe("Landing view: Primary action and Secondary samples", () => {
  it("is found by name, has no aria-label and starts the US Sample", async () => {
    const frames = holdFrames();
    renderFirstVisit();
    const button = primaryAction();
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(screen.queryByRole("button", { name: US_LABEL })).toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(frames).toHaveLength(1));
    const reading = `Reading ${US_LABEL}…`;
    expect(within(mainElement()).getByText(reading)).toBeTruthy();
    expect(liveRegion().textContent).toBe(reading);

    const inputs = [
      primaryAction(),
      ...SECONDARY_LABELS.map((label) => screen.getByRole("button", { name: label })),
      dropArea(),
      screen.getByRole("button", { name: "Choose a file" }),
    ];
    for (const input of inputs) expect(input.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(primaryAction());
    await Promise.resolve();
    expect(frames).toHaveLength(1);

    frames[0]?.(0);
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    expect(screen.getByText(/transactions read/).textContent).toContain(US_LABEL);
  });

  it("lists exactly the three Secondary samples, in order", () => {
    renderFirstVisit();
    const list = screen.getByRole("list", { name: "Other sample statements" });
    expect(within(list).getAllByRole("button").map(nameOf)).toEqual(SECONDARY_LABELS);
    expect(SECONDARY_LABELS).toEqual(SAMPLES.slice(1).map((sample) => sample.label));
  });

  it.each(SECONDARY_LABELS)("starts a run from the Secondary sample %s", async (label) => {
    holdFrames();
    renderFirstVisit();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(await screen.findByText(`Reading ${label}…`, { selector: "main p" })).toBeTruthy();
  });
});

describe("Landing view: badge, steps and own statement", () => {
  it("moves focus to the Privacy note without changing the URL", async () => {
    renderFirstVisit();
    expect(within(mainElement()).getByText(PRIVACY_BADGE_TEXT)).toBeTruthy();
    const before = window.location.href;

    fireEvent.click(screen.getByRole("button", { name: READ_PRIVACY_NOTE }));

    const note = document.activeElement as HTMLElement;
    expect(note.tagName).toBe("P");
    expect(note.textContent).toBe(PRIVACY_NOTE);
    expect(note.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByRole("contentinfo").contains(note)).toBe(true);
    expect(window.location.href).toBe(before);
    expect(liveRegion().textContent).toBe("");
  });

  it("shows three steps with number, heading and text, and no control", () => {
    renderFirstVisit();
    const section = screen
      .getByRole("heading", { level: 2, name: HOW_IT_WORKS_HEADING })
      .closest("section") as HTMLElement;
    const items = within(section).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(
      HOW_IT_WORKS_STEPS.map((step, i) => `${i + 1}${step.heading}${step.text}`),
    );
    expect(section.querySelector("button, a, [tabindex]")).toBeNull();
  });

  it("orders the Own statement section as heading, Tip, drop area", () => {
    const { container } = renderFirstVisit();
    const heading = screen.getByRole("heading", { level: 2, name: OWN_STATEMENT_HEADING });
    const section = heading.closest("section") as HTMLElement;
    const children = Array.from(section.children);
    expect(children).toHaveLength(3);
    expect(children[0]).toBe(heading);
    expect(children[1]?.tagName).toBe("P");
    expect(children[1]?.textContent).toBe(STATEMENT_TIP);
    expect(children[2]?.querySelector('[data-focus="drop-zone"]')).toBe(dropArea());
    expect(container.querySelector('input[type="file"]')?.getAttribute("accept")).toBe(
      ".csv,text/csv",
    );
  });

  it("the ridge band sits between the Hero and How it works on the Landing view", () => {
    const { container } = renderFirstVisit();
    const bands = container.querySelectorAll("[data-ridge-band]");
    expect(bands).toHaveLength(1);
    const band = bands[0] as HTMLElement;
    expect(band.getAttribute("aria-hidden")).toBe("true");
    expect(band.querySelector("a, button, input, select, textarea, [tabindex]")).toBeNull();
    expect(band.textContent).toBe("");
    expect(band.closest(".fixed")).toBeNull();
    const hero = container.querySelector(".zb-hero") as HTMLElement;
    const heading = screen.getByRole("heading", { level: 2, name: HOW_IT_WORKS_HEADING });
    expectInOrder(hero, band, heading);
    expect(hero.contains(band)).toBe(false);
  });
});

describe("Landing view: Footer", () => {
  it("shows the note, credit, links and Reaper description, in order", () => {
    renderFirstVisit();
    const footer = screen.getByRole("contentinfo");
    const note = within(footer).getByText(PRIVACY_NOTE);
    const credit = within(footer).getByText("Built with Kiro.");
    const repo = within(footer).getByRole("link", { name: REPO_LINK.text });
    const reaper = within(footer).getByRole("link", { name: REAPER_LINK.text });
    const description = within(footer).getByText(REAPER_DESCRIPTION);
    expectInOrder(note, credit, repo, reaper, description);
    expect(repo.getAttribute("href")).toBe("https://github.com/zaxcoraider/zombills");
    expect(reaper.getAttribute("href")).toBe("https://github.com/zaxcoraider/zombills-reaper");
    for (const link of [repo, reaper]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.hasAttribute("aria-label")).toBe(false);
      const describedBy = link.getAttribute("aria-describedby");
      expect(describedBy).not.toBeNull();
      expect(document.getElementById(describedBy ?? "")?.textContent).toBe(NEW_TAB_TEXT);
    }
    expect(within(footer).queryByText(STATEMENT_TIP)).toBeNull();
  });

  it("the Reaper description is a block outside the link", () => {
    renderFirstVisit();
    const footer = screen.getByRole("contentinfo");
    const link = within(footer).getByRole("link", { name: "The Reaper on GitHub" });
    const description = within(footer).getByText(
      (_content, element) => element?.textContent === REAPER_DESCRIPTION && element.tagName === "SPAN",
    );
    expect(description.classList.contains("block")).toBe(true);
    expect(description.closest("li")).toBe(link.closest("li"));
    expect(link.contains(description)).toBe(false);
    expect(link.getAttribute("aria-label")).toBeNull();
    expect(link.textContent).toBe("The Reaper on GitHub");
  });
});

describe("Landing view: Tab order", () => {
  const BASE = [
    PRIMARY_ACTION_NAME,
    ...SECONDARY_LABELS,
    READ_PRIVACY_NOTE,
    DROP_AREA_NAME,
    "Choose a file",
    REPO_LINK.text,
    REAPER_LINK.text,
  ];

  async function tabNames(count: number): Promise<string[]> {
    const user = userEvent.setup();
    document.body.focus();
    const names: string[] = [];
    for (let i = 0; i < count; i += 1) {
      await user.tab();
      names.push(nameOf(document.activeElement as HTMLElement));
    }
    return names;
  }

  it("visits the controls in the design order", async () => {
    renderFirstVisit();
    expect(await tabNames(BASE.length)).toEqual(BASE);
  });

  it("puts Open the graveyard right after Read the privacy note", async () => {
    renderRestored(RESTORED_TEXT);
    const expected = [...BASE];
    expected.splice(expected.indexOf(READ_PRIVACY_NOTE) + 1, 0, "Open the graveyard");
    expect(await tabNames(expected.length)).toEqual(expected);
  });
});

describe("Landing view: Return notes and working", () => {
  it("shows the restored line, the dropped note and Open the graveyard after the badge", () => {
    renderRestored(RESTORED_WITH_BAD_RECORD);
    const main = within(mainElement());
    const open = main.getByRole("button", { name: "Open the graveyard" });
    expectInOrder(
      main.getByText(PRIVACY_BADGE_TEXT),
      main.getByText(restoredLine(1, 0)),
      main.getByText(droppedNote(1)),
      open,
    );
    fireEvent.click(open);
    expect(screen.getByRole("heading", { name: "Your graveyard" })).toBeTruthy();
  });

  it("keeps the Hero while working and puts the working line in a card after the Primary action", async () => {
    holdFrames();
    renderFirstVisit();
    fireEvent.click(primaryAction());
    const line = await screen.findByText(`Reading ${US_LABEL}…`, { selector: "main p" });
    expectInOrder(primaryAction(), line);
    expect(line.closest(".bg-fog\\/95")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Zombills" })).toBeTruthy();
    expect(screen.getByText(HERO_LINE)).toBeTruthy();
    expect(primaryAction()).toBeTruthy();
  });
});

describe("Non-landing views keep today's layout", () => {
  function expectNonLanding(container: HTMLElement, readAnother: boolean) {
    expect(within(screen.getByRole("contentinfo")).getByText(PRIVACY_NOTE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PRIMARY_ACTION_NAME })).toBeNull();
    expect(screen.queryByText(HERO_LINE)).toBeNull();
    expect(container.querySelector("[data-hero-art]")).toBeNull();
    expect(screen.queryByText(PRIVACY_BADGE_TEXT)).toBeNull();
    expect(screen.queryByRole("heading", { name: HOW_IT_WORKS_HEADING })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "Or try a sample statement" }),
    ).toBeTruthy();
    const gate = screen
      .getByRole("heading", { level: 2, name: "Or try a sample statement" })
      .closest("section") as HTMLElement;
    expect(within(gate).getAllByRole("button").map(nameOf)).toEqual(
      SAMPLES.map((sample) => sample.label),
    );
    const another = screen.queryByRole("heading", { level: 2, name: "Read another statement" });
    expect(another !== null).toBe(readAnother);
    expect(mainElement().className).toContain("max-w-[640px]");
  }

  it("results", async () => {
    const { container } = renderFirstVisit();
    await summon();
    expectNonLanding(container, true);
  });

  it("keep the fixed Hills and Fence and have no ridge band", async () => {
    const { container } = renderFirstVisit();
    await summon();
    expect(container.querySelector("[data-ridge-band]")).toBeNull();
    // Fixed layers on a Non-landing view hold SVG_COUNT svg elements (Stars, Moon, Hills, Fence and
    // the fog filters and tiles), as before the ridge change.
    const fixed = Array.from(container.querySelectorAll(".fixed"));
    const count = fixed.reduce((n, layer) => n + layer.querySelectorAll("svg").length, 0);
    expect(count).toBe(SVG_COUNT);
  });

  it("keep the fixed Ground with its inset line", async () => {
    const { container } = renderFirstVisit();
    await summon();
    const fixed = Array.from(container.querySelectorAll<HTMLElement>(".fixed"));
    const ground = fixed
      .flatMap((layer) => Array.from(layer.querySelectorAll<HTMLElement>("div")))
      .find((el) => el.style.height === "var(--ground-h)");
    if (ground === undefined) throw new Error("expected the Ground in a fixed layer");
    expect(ground.style.boxShadow).toContain("inset");
    const count = fixed.reduce((n, layer) => n + layer.querySelectorAll("svg").length, 0);
    expect(count).toBe(SVG_COUNT);
  });

  it("keep the root sky background and no fixed-layer background", async () => {
    const { container } = renderFirstVisit();
    await summon();
    const { root, layer } = sceneParts(container);
    expect(root.style.background).toBe(SKY_BACKGROUND);
    expect(layer.style.background).toBe("");
  });

  it("no-subscriptions", async () => {
    const { container } = renderFirstVisit();
    dropFiles([csvFile(THREE_ROW_FILE)]);
    await screen.findByRole("heading", { level: 2, name: "No undead here." });
    expectNonLanding(container, false);
  });

  it("error", async () => {
    const { container } = renderFirstVisit();
    dropFiles([csvFile("a", "notes.txt", "text/plain")]);
    await screen.findByRole("heading", { level: 2, name: "This file is not a CSV statement." });
    expectNonLanding(container, false);
  });

  it("the Graveyard view", () => {
    const { container } = renderRestored(RESTORED_TEXT);
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByRole("heading", { name: "Your graveyard" })).toBeTruthy();
    expectNonLanding(container, true);
  });

  it("working with origin other", async () => {
    const { container } = renderFirstVisit();
    await summon();
    const frames = holdFrames();
    fireEvent.click(screen.getByRole("button", { name: UK_LABEL }));
    await waitFor(() => expect(frames).toHaveLength(1));
    expect(within(mainElement()).getByText(`Reading ${UK_LABEL}…`)).toBeTruthy();
    expectNonLanding(container, false);
    frames[0]?.(0);
    await waitFor(() =>
      expect(screen.getByText(/transactions read/).textContent).toContain(UK_LABEL),
    );
  });
});

describe("Start again", () => {
  it("returns to the Landing view and focuses the drop area", async () => {
    renderFirstVisit();
    await summon();
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    await waitFor(() => expect(document.activeElement).toBe(dropArea()));
    expect(primaryAction()).toBeTruthy();
  });
});
