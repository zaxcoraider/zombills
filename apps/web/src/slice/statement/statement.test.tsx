// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { DropZone } from "../drop-zone";
import {
  SAMPLE_LIST_NAME,
  STATEMENT_HINT,
  TAP_TO_CHOOSE,
  TRY_ANOTHER_STATEMENT,
} from "../logic/chrome-text";
import { OWN_STATEMENT_HEADING, PRIMARY_ACTION_NAME } from "../logic/landing-text";
import { STATEMENT_TIP } from "../logic/memory-text";
import type { FocusTarget } from "../page-state";
import { SAMPLES } from "../samples";
import type { Sample } from "../samples";
import { createGraveyardStore } from "../storage/graveyard-store";
import { fakeStorage, fakeStoreTarget, storeLoadOf } from "../storage/test-store";
import { GRAVE_EARTH, GRAVE_OUTLINE, GravePit, RestingGhost } from "./grave-art";
import { SampleChips } from "./sample-chips";
import { disclosureFocusStep, openOnWindowDrag } from "./statement-disclosure";
import { StatementPanel } from "./statement-panel";
import type { StatementPlace } from "./statement-panel";
import { useHoverNone } from "./use-hover-none";

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface FakeQuery {
  matches: boolean;
  media: string;
  listeners: Set<() => void>;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

function stubMatchMedia(matches: boolean): FakeQuery {
  const query: FakeQuery = {
    matches,
    media: "(hover: none)",
    listeners: new Set(),
    addEventListener: (_type, listener) => query.listeners.add(listener),
    removeEventListener: (_type, listener) => query.listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => {
      expect(media).toBe("(hover: none)");
      return query;
    }),
  );
  return query;
}

describe("useHoverNone", () => {
  it("returns false when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useHoverNone());
    expect(result.current).toBe(false);
  });

  it("returns true when (hover: none) matches", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useHoverNone());
    expect(result.current).toBe(true);
  });

  it("updates on a change event", () => {
    const query = stubMatchMedia(false);
    const { result } = renderHook(() => useHoverNone());
    expect(result.current).toBe(false);
    act(() => {
      query.matches = true;
      for (const listener of query.listeners) listener();
    });
    expect(result.current).toBe(true);
  });

  it("stops listening on unmount", () => {
    const query = stubMatchMedia(false);
    const { unmount } = renderHook(() => useHoverNone());
    expect(query.listeners.size).toBe(1);
    unmount();
    expect(query.listeners.size).toBe(0);
  });
});

describe("grave art", () => {
  const cases = [
    {
      name: "GravePit",
      node: (dragging: boolean, reduceMotion: boolean) => (
        <GravePit dragging={dragging} reduceMotion={reduceMotion} />
      ),
    },
    {
      name: "RestingGhost",
      node: (dragging: boolean, reduceMotion: boolean) => (
        <RestingGhost dragging={dragging} reduceMotion={reduceMotion} />
      ),
    },
  ];

  for (const { name, node } of cases) {
    for (const dragging of [false, true]) {
      for (const reduceMotion of [false, true]) {
        it(`${name} renders one aria-hidden element with no text (dragging ${dragging}, reduced ${reduceMotion})`, () => {
          const { container } = render(<div>{node(dragging, reduceMotion)}</div>);
          const root = container.firstElementChild as HTMLElement;
          const children = [...root.children];
          expect(children).toHaveLength(1);
          const art = children[0] as Element;
          // The ghost is SVG; the pit is CSS boxes so its edges follow the rounded corners (V2).
          expect(art.tagName.toLowerCase()).toBe(name === "RestingGhost" ? "svg" : "div");
          expect(art.getAttribute("aria-hidden")).toBe("true");
          expect(root.querySelector("text, image, foreignObject")).toBeNull();
          expect(root.textContent).toBe("");
        });
      }
    }
  }

  it("GravePit uses no id and no url() reference", () => {
    const { container } = render(<GravePit dragging={false} reduceMotion={false} />);
    expect(container.querySelectorAll("[id]")).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/url\(/);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("GravePit draws an even 12 px pit inset, one outline and one rim glow on the rounded edge", () => {
    const { container } = render(<GravePit dragging={false} reduceMotion={false} />);
    const grave = container.querySelector<HTMLElement>("[data-grave-pit]");
    if (grave === null) throw new Error("grave missing");
    expect(grave.className.split(" ")).toEqual(
      expect.arrayContaining(["absolute", "inset-0", "overflow-clip", "rounded-card"]),
    );
    expect(grave.style.background).toBe(GRAVE_EARTH);
    const pit = grave.querySelector<HTMLElement>("[data-pit]");
    if (pit === null) throw new Error("pit missing");
    expect(pit.className.split(" ")).toEqual(
      expect.arrayContaining(["absolute", "inset-3", "rounded-[4px]"]),
    );
    expect(pit.querySelectorAll("[data-pit-glow]")).toHaveLength(1);
    const outlines = grave.querySelectorAll<HTMLElement>("[data-grave-outline]");
    const rims = grave.querySelectorAll<HTMLElement>("[data-rim-glow]");
    expect(outlines).toHaveLength(1);
    expect(rims).toHaveLength(1);
    const outline = outlines[0] as HTMLElement;
    const rim = rims[0] as HTMLElement;
    for (const ring of [outline, rim]) {
      expect(ring.className.split(" ")).toEqual(
        expect.arrayContaining(["absolute", "inset-0", "rounded-card"]),
      );
      expect(ring.parentElement).toBe(grave);
    }
    expect(outline.className.split(" ")).toContain("border-2");
    expect(outline.style.borderColor).toBe(GRAVE_OUTLINE);
    expect(rim.className.split(" ")).toContain("border-[3px]");
    expect(rim.style.borderColor).toBe("var(--moss)");
    // No other element in the grave draws a border or an outline.
    const ringed = [...grave.querySelectorAll<HTMLElement>("*")].filter((el) =>
      /\b(border|outline|ring)(-|\b)/.test(el.className),
    );
    expect(ringed).toEqual([outline, rim]);
  });
});

describe("Grave drop area", () => {
  const AREA_NAME = "Drop area: choose or drop a CSV statement";

  function renderDropZone(disabled = false) {
    const onFiles = vi.fn<(files: File[]) => void>();
    const view = render(<DropZone disabled={disabled} reduceMotion={false} onFiles={onFiles} />);
    const area = screen.getByRole("button", { name: AREA_NAME });
    const choose = screen.getByRole("button", { name: "Choose a file" });
    const input = view.container.querySelector<HTMLInputElement>("input[type=file]");
    if (!input) throw new Error("file input missing");
    const wrapper = view.container.querySelector<HTMLElement>("[data-grave-drop]");
    if (!wrapper) throw new Error("grave wrapper missing");
    return { onFiles, area, choose, input, wrapper };
  }

  function csvFile(): File {
    return new File(["date,description,amount"], "statement.csv", { type: "text/csv" });
  }

  it("keeps role, name, data-focus and accept", () => {
    const { area, input } = renderDropZone();
    expect(area.getAttribute("role")).toBe("button");
    expect(area.getAttribute("data-focus")).toBe("drop-zone");
    expect(area.getAttribute("data-exempt")).toBe("drop-area");
    expect(input.getAttribute("accept")).toBe(".csv,text/csv");
    expect(input.className).toContain("sr-only");
    expect(area.textContent).toBe("Drop a CSV statement here");
  });

  it("opens the picker on Enter and on Space", () => {
    const { area, input } = renderDropZone();
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.keyDown(area, { key: "Enter" });
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(area, { key: " " });
    fireEvent.keyUp(area, { key: " " });
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("opens the picker on a click or tap, and not while aria-disabled (review B #2)", () => {
    const { area, input } = renderDropZone();
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    fireEvent.click(area);
    expect(click).toHaveBeenCalledTimes(1);
    cleanup();
    const working = renderDropZone(true);
    const workingClick = vi.spyOn(working.input, "click").mockImplementation(() => undefined);
    working.area.focus();
    fireEvent.click(working.area);
    expect(workingClick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(working.area);
  });

  it("hides the drop area's own focus ring only while a file is over the grave (review B V3)", () => {
    const { area, wrapper } = renderDropZone();
    expect(wrapper.className.split(" ")).toContain("group/grave");
    expect(area.className.split(" ")).toContain("group-data-[dragging=true]/grave:outline-none");
    expect(area.className).not.toMatch(/(^|\s)outline-none/);
  });

  it("lets Choose a file wrap inside the grave instead of overflowing it (review B #5)", () => {
    const { choose } = renderDropZone();
    const classes = choose.className.split(" ");
    // Both insets set and `w-fit mx-auto`: the shrink-to-fit width may use the grave's width less
    // 2 × 16 px, so the label wraps only when it must and the button never passes the grave.
    expect(classes).toEqual(
      expect.arrayContaining(["absolute", "inset-x-4", "bottom-4", "mx-auto", "w-fit", "text-center"]),
    );
    expect(classes).not.toContain("whitespace-nowrap");
    expect(classes).not.toContain("left-1/2");
  });

  it("shows the drag and working texts", () => {
    const { area, wrapper } = renderDropZone();
    fireEvent.dragEnter(wrapper);
    expect(area.textContent).toBe("Release to read this file");
    expect(wrapper.getAttribute("data-dragging")).toBe("true");
    fireEvent.dragLeave(wrapper);
    expect(area.textContent).toBe("Drop a CSV statement here");
    cleanup();
    const working = renderDropZone(true);
    expect(working.area.textContent).toBe("Reading…");
    expect(working.area.getAttribute("aria-disabled")).toBe("true");
    fireEvent.dragEnter(working.wrapper);
    expect(working.wrapper.getAttribute("data-dragging")).toBe("false");
  });

  it("reads a file dropped on Choose a file", () => {
    const { onFiles, choose } = renderDropZone();
    const file = csvFile();
    fireEvent.drop(choose, { dataTransfer: { files: [file], types: ["Files"] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("keeps the drag-over text when the drag moves from the wrapper onto the button", () => {
    const { area, choose, wrapper } = renderDropZone();
    fireEvent.dragEnter(wrapper);
    fireEvent.dragEnter(choose);
    fireEvent.dragLeave(wrapper);
    expect(area.textContent).toBe("Release to read this file");
  });

  it("does not nest Choose a file inside the role=button element", () => {
    const { area, choose } = renderDropZone();
    expect(area.contains(choose)).toBe(false);
    expect(choose.closest("[role=button]")).toBeNull();
    expect(choose.parentElement).toBe(area.parentElement);
  });

  it("shows TAP_TO_CHOOSE when the device has no hover, with the name unchanged", () => {
    stubMatchMedia(true);
    const { area } = renderDropZone();
    expect(area.textContent).toBe(TAP_TO_CHOOSE);
    expect(screen.getByRole("button", { name: AREA_NAME })).toBe(area);
  });
});

const NEW_LABELS = [
  "US bank statement",
  "UK bank statement",
  "European bank statement",
  "Statement with extra top lines",
];
const DROP_NAME = "Drop area: choose or drop a CSV statement";

/** Asserts that every node comes before the next one in document order. */
function expectInOrder(...nodes: Node[]) {
  for (let i = 1; i < nodes.length; i += 1) {
    const before = nodes[i - 1] as Node;
    const after = nodes[i] as Node;
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
}

function renderPanel(place: StatementPlace, disabled = false) {
  const onFiles = vi.fn<(files: File[]) => void>();
  const onChooseSample = vi.fn<(sample: Sample) => void>();
  const view = render(
    <StatementPanel
      place={place}
      showHeading
      disabled={disabled}
      reduceMotion={false}
      onFiles={onFiles}
      onChooseSample={onChooseSample}
    />,
  );
  return { ...view, onFiles, onChooseSample };
}

describe("Statement panel", () => {
  it("renders heading, hint, Tip, drop area and chips in order on the gate", () => {
    const { container } = renderPanel("gate");
    const section = container.firstElementChild as HTMLElement;
    expect(section.tagName.toLowerCase()).toBe("section");
    expect(section.className).toContain("rounded-card");
    expect(section.className).toContain("bg-fog/95");
    const heading = screen.getByRole("heading", { level: 2, name: TRY_ANOTHER_STATEMENT });
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.id).not.toBe("");
    const hint = screen.getByText(STATEMENT_HINT);
    const tip = screen.getByText(STATEMENT_TIP);
    expect(hint.tagName.toLowerCase()).toBe("p");
    expect(tip.tagName.toLowerCase()).toBe("p");
    expectInOrder(
      heading,
      hint,
      tip,
      screen.getByRole("button", { name: DROP_NAME }),
      screen.getByRole("list", { name: SAMPLE_LIST_NAME }),
    );
  });

  it("renders heading, hint, Tip and drop area in order on the Landing view, with no chips", () => {
    const { container } = renderPanel("landing");
    const section = container.firstElementChild as HTMLElement;
    const heading = screen.getByRole("heading", { level: 2, name: OWN_STATEMENT_HEADING });
    expect(heading.textContent).toBe("Or use your own statement");
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
    expectInOrder(
      heading,
      screen.getByText(STATEMENT_HINT),
      screen.getByText(STATEMENT_TIP),
      screen.getByRole("button", { name: DROP_NAME }),
    );
    expect(screen.queryByRole("list", { name: SAMPLE_LIST_NAME })).toBeNull();
    for (const label of NEW_LABELS)
      expect(screen.queryByRole("button", { name: label })).toBeNull();
  });

  it("drops the heading when showHeading is false", () => {
    const { container } = render(
      <StatementPanel
        place="gate"
        showHeading={false}
        disabled={false}
        reduceMotion={false}
        onFiles={() => {}}
        onChooseSample={() => {}}
      />,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    expect((container.firstElementChild as HTMLElement).hasAttribute("aria-labelledby")).toBe(
      false,
    );
  });
});

describe("Sample chips", () => {
  it("lists the four Samples by their new labels, in SAMPLES order", () => {
    render(<SampleChips disabled={false} onChoose={() => {}} />);
    const list = screen.getByRole("list", { name: "Sample statements" });
    expect(list.className).toContain("flex-wrap");
    const buttons = within(list).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(NEW_LABELS);
    expect(buttons.map((b) => b.textContent)).toEqual(SAMPLES.map((s) => s.label));
    for (const button of buttons) {
      expect(button.getAttribute("type")).toBe("button");
      expect(button.getAttribute("data-exempt")).toBe("sample-chip");
      expect(button.className).toContain("rounded-t-stone");
      expect(button.className).toContain("min-h-11");
      expect(button.hasAttribute("aria-disabled")).toBe(false);
      expect(button.parentElement?.tagName.toLowerCase()).toBe("li");
    }
  });

  it("starts each chip's own Sample", () => {
    const onChoose = vi.fn<(sample: Sample) => void>();
    render(<SampleChips disabled={false} onChoose={onChoose} />);
    const list = screen.getByRole("list", { name: SAMPLE_LIST_NAME });
    SAMPLES.forEach((sample, index) => {
      fireEvent.click(within(list).getByRole("button", { name: sample.label }));
      expect(onChoose).toHaveBeenCalledTimes(index + 1);
      expect(onChoose).toHaveBeenLastCalledWith(sample);
    });
  });

  it("is aria-disabled while working and starts nothing, keeping focus", () => {
    const onChoose = vi.fn<(sample: Sample) => void>();
    render(<SampleChips disabled onChoose={onChoose} />);
    const buttons = within(screen.getByRole("list", { name: SAMPLE_LIST_NAME })).getAllByRole(
      "button",
    );
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.hasAttribute("disabled")).toBe(false);
      // The disabled look (review B #9): dimmed, and no moss hover.
      expect(button.className.split(" ")).toEqual(
        expect.arrayContaining(["aria-disabled:opacity-60", "aria-disabled:hover:border-bone/50"]),
      );
      button.focus();
      fireEvent.click(button);
      expect(document.activeElement).toBe(button);
    }
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe("Statement panel on the Page", () => {
  const RESTORED_TEXT = JSON.stringify({
    version: 1,
    records: [
      {
        id: "sub:USD:monthly:*:netflix",
        merchant: "Netflix",
        serviceId: "netflix",
        currentAmountCents: 1799,
        answer: "not-using",
        cadenceAssumed: false,
        carriedOver: false,
      },
    ],
  });

  function expectTipOnceAndNoOldHeading() {
    expect(screen.getAllByText(STATEMENT_TIP)).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Or try a sample statement" })).toBeNull();
  }

  async function toResults() {
    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
  }

  it("Landing view: the Tip once, the Landing heading and no chips", () => {
    render(<App />);
    expectTipOnceAndNoOldHeading();
    expect(screen.getByRole("heading", { level: 2, name: OWN_STATEMENT_HEADING })).toBeTruthy();
    expect(screen.queryByRole("list", { name: SAMPLE_LIST_NAME })).toBeNull();
  });

  it("results: the Tip once, the gate heading and the chips; the chips go aria-disabled while working", async () => {
    render(<App />);
    await toResults();
    expectTipOnceAndNoOldHeading();
    expect(screen.getAllByRole("heading", { level: 2, name: TRY_ANOTHER_STATEMENT })).toHaveLength(
      1,
    );
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT }));
    fireEvent.click(
      within(screen.getByRole("list", { name: SAMPLE_LIST_NAME })).getByRole("button", {
        name: "UK bank statement",
      }),
    );
    await screen.findByText("Reading UK bank statement…", { selector: "main p" });
    expectTipOnceAndNoOldHeading();
    const chips = within(screen.getByRole("list", { name: SAMPLE_LIST_NAME })).getAllByRole(
      "button",
    );
    expect(chips.map((b) => b.textContent)).toEqual(NEW_LABELS);
    for (const chip of chips) expect(chip.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      for (const frame of frames.splice(0)) frame(0);
    });
  });

  it("error: the Tip once and no old heading", async () => {
    render(<App />);
    fireEvent.drop(screen.getByRole("button", { name: DROP_NAME }), {
      dataTransfer: {
        files: [new File(["a"], "notes.txt", { type: "text/plain" })],
        types: ["Files"],
      },
    });
    await screen.findByRole("heading", { level: 2, name: "This file is not a CSV statement." });
    expectTipOnceAndNoOldHeading();
    expect(screen.getByRole("list", { name: SAMPLE_LIST_NAME })).toBeTruthy();
  });

  it("the Graveyard view: the Tip once and no old heading", () => {
    const store = createGraveyardStore(fakeStoreTarget(fakeStorage()));
    render(<App store={store} initialStore={storeLoadOf(RESTORED_TEXT)} />);
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByRole("heading", { name: "Your graveyard" })).toBeTruthy();
    expectTipOnceAndNoOldHeading();
    fireEvent.click(screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT }));
    expect(screen.getByRole("list", { name: SAMPLE_LIST_NAME })).toBeTruthy();
  });
});

describe("disclosureFocusStep", () => {
  it("opens first for a drop-area request while the disclosure is shown and collapsed", () => {
    expect(disclosureFocusStep("drop-zone", true, false)).toBe("open");
  });

  it("claims a drop-area request when the disclosure is open or not shown", () => {
    expect(disclosureFocusStep("drop-zone", true, true)).toBe("claim");
    expect(disclosureFocusStep("drop-zone", false, false)).toBe("claim");
    expect(disclosureFocusStep("drop-zone", false, true)).toBe("claim");
  });

  it("claims every other target", () => {
    const others: FocusTarget[] = [
      "state-heading",
      "card-heading",
      "outcome",
      "stage",
      "tombstone",
      "all-answered",
      "graveyard-heading",
      "resting-item",
      "memory-checkbox",
      "primary-action",
    ];
    for (const target of others) {
      for (const shown of [false, true]) {
        for (const open of [false, true]) {
          expect(disclosureFocusStep(target, shown, open)).toBe("claim");
        }
      }
    }
  });
});

describe("Statement disclosure on the Page", () => {
  const FEW_CSV =
    "Date,Description,Amount\n2026-01-03,CORNER BAKERY,-4.50\n2026-01-09,HARDWARE DEPOT,-23.10\n2026-01-20,BOOK NOOK,-12.00\n";

  function disclosureButton(): HTMLElement {
    return screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT });
  }

  function disclosureBody(): HTMLElement {
    const id = disclosureButton().getAttribute("aria-controls");
    if (id === null || id === "") throw new Error("aria-controls missing");
    const body = document.getElementById(id);
    if (body === null) throw new Error("disclosure body missing");
    return body;
  }

  /** The `h2 > button` "Try another statement", collapsed, with "Start again" hidden inside. */
  function expectCollapsedDisclosure() {
    const button = disclosureButton();
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    const h2 = button.parentElement as HTMLElement;
    expect(h2.tagName).toBe("H2");
    expect(h2.className).toContain("text-lead");
    expect(h2.className).toContain("font-bold");
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const body = disclosureBody();
    expect(body.hidden).toBe(true);
    const section = h2.parentElement as HTMLElement;
    expect(section.tagName).toBe("SECTION");
    expect(section.getAttribute("aria-labelledby")).toBe(h2.id);
    expect(screen.queryByRole("button", { name: DROP_NAME })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2, name: TRY_ANOTHER_STATEMENT })).toEqual([h2]);
  }

  function expectStartAgainInside() {
    const startAgain = screen.getByRole("button", { name: "Start again", hidden: true });
    expect(disclosureBody().contains(startAgain)).toBe(true);
  }

  async function toResults() {
    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
  }

  it("results: collapsed, with the panel and Start again hidden inside", async () => {
    render(<App />);
    await toResults();
    expectCollapsedDisclosure();
    expectStartAgainInside();
    expect(disclosureBody().contains(document.querySelector("[data-grave-drop]"))).toBe(true);
  });

  it("the Graveyard view: collapsed, with the panel and Start again hidden inside", async () => {
    render(<App />);
    await toResults();
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByRole("heading", { level: 2, name: "Your graveyard" })).toBeTruthy();
    expectCollapsedDisclosure();
    expectStartAgainInside();
  });

  it("toggles aria-expanded and hidden, keeping focus on the button", async () => {
    render(<App />);
    await toResults();
    const button = disclosureButton();
    button.focus();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(disclosureBody().hidden).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("button", { name: DROP_NAME })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start again" })).toBeTruthy();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(disclosureBody().hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it("is collapsed again after leaving and re-entering a view", async () => {
    render(<App />);
    await toResults();
    fireEvent.click(disclosureButton());
    expect(disclosureButton().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByRole("heading", { level: 2, name: "Your graveyard" })).toBeTruthy();
    expectCollapsedDisclosure();
    fireEvent.click(disclosureButton());
    expect(disclosureButton().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Back to the rising" }));
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    expectCollapsedDisclosure();
  });

  it("stays open across a card answer", async () => {
    render(<App />);
    await toResults();
    fireEvent.click(disclosureButton());
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    await waitFor(() => expect(screen.getByText(/1 of \d+ answered/)).toBeTruthy());
    expect(disclosureButton().getAttribute("aria-expanded")).toBe("true");
    expect(disclosureBody().hidden).toBe(false);
  });

  /** The panel shown open with its own heading, and no disclosure button. */
  function expectOpenPanel() {
    const heading = screen.getByRole("heading", { level: 2, name: TRY_ANOTHER_STATEMENT });
    expect(heading.querySelector("button")).toBeNull();
    expect(screen.queryByRole("button", { name: TRY_ANOTHER_STATEMENT })).toBeNull();
    expect(screen.getByRole("button", { name: DROP_NAME })).toBeTruthy();
    expect(screen.getByRole("list", { name: SAMPLE_LIST_NAME })).toBeTruthy();
  }

  /** Start again, then Open the graveyard, inside the state Card and before the panel. */
  function expectStateActions(card: HTMLElement) {
    const startAgain = within(card).getByRole("button", { name: "Start again" });
    const open = within(card).getByRole("button", { name: "Open the graveyard" });
    expect(screen.getAllByRole("button", { name: "Start again" })).toEqual([startAgain]);
    expect(screen.getAllByRole("button", { name: "Open the graveyard" })).toEqual([open]);
    expectInOrder(startAgain, open, screen.getByRole("button", { name: DROP_NAME }));
  }

  it("error: the panel is open with no disclosure; the state Card holds Start again then Open the graveyard", async () => {
    render(<App />);
    await toResults();
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(disclosureButton());
    fireEvent.drop(screen.getByRole("button", { name: DROP_NAME }), {
      dataTransfer: {
        files: [new File([""], "empty.csv", { type: "text/csv" })],
        types: ["Files"],
      },
    });
    await screen.findByRole("heading", { level: 2, name: "The file is empty." });
    expectOpenPanel();
    expectStateActions(screen.getByRole("alert"));
  });

  it("the Graveyard view opened from error keeps Start again inside the disclosure (review B #1)", async () => {
    render(<App />);
    await toResults();
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(disclosureButton());
    fireEvent.drop(screen.getByRole("button", { name: DROP_NAME }), {
      dataTransfer: {
        files: [new File([""], "empty.csv", { type: "text/csv" })],
        types: ["Files"],
      },
    });
    await screen.findByRole("heading", { level: 2, name: "The file is empty." });
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect(screen.getByRole("heading", { level: 2, name: "Your graveyard" })).toBeTruthy();
    expectCollapsedDisclosure();
    expectStartAgainInside();
    fireEvent.click(disclosureButton());
    const startAgain = screen.getByRole("button", { name: "Start again" });
    expect(disclosureBody().contains(startAgain)).toBe(true);
  });

  it("no-subscriptions: the panel is open with no disclosure; the state Card holds Start again then Open the graveyard", async () => {
    render(<App />);
    await toResults();
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    fireEvent.click(disclosureButton());
    fireEvent.drop(screen.getByRole("button", { name: DROP_NAME }), {
      dataTransfer: {
        files: [new File([FEW_CSV], "few.csv", { type: "text/csv" })],
        types: ["Files"],
      },
    });
    const heading = await screen.findByRole("heading", { level: 2, name: "No undead here." });
    expectOpenPanel();
    expectStateActions(heading.parentElement as HTMLElement);
  });

  it("error with an empty Graveyard: Start again only, inside the state Card", async () => {
    render(<App />);
    fireEvent.drop(screen.getByRole("button", { name: DROP_NAME }), {
      dataTransfer: {
        files: [new File(["a"], "notes.txt", { type: "text/plain" })],
        types: ["Files"],
      },
    });
    await screen.findByRole("heading", { level: 2, name: "This file is not a CSV statement." });
    expectOpenPanel();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("button", { name: "Start again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open the graveyard" })).toBeNull();
  });
});

describe("Focus handover and window drag", () => {
  const UK = "UK bank statement";

  function disclosureButton(): HTMLElement {
    return screen.getByRole("button", { name: TRY_ANOTHER_STATEMENT });
  }

  async function toResults() {
    fireEvent.click(screen.getByRole("button", { name: PRIMARY_ACTION_NAME }));
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
  }

  /** Holds the run in `working` until the returned flush is called. */
  function holdFrames() {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    return async () => {
      await act(async () => {
        for (const frame of frames.splice(0)) frame(0);
      });
    };
  }

  function ukChip(): HTMLElement {
    return within(screen.getByRole("list", { name: SAMPLE_LIST_NAME })).getByRole("button", {
      name: UK,
    });
  }

  it("reading the UK chip on results leaves focus on the UK chip of the working panel", async () => {
    render(<App />);
    await toResults();
    const flush = holdFrames();
    fireEvent.click(disclosureButton());
    const chip = ukChip();
    chip.focus();
    fireEvent.click(chip);
    await screen.findByText("Reading UK bank statement…", { selector: "main p" });
    const working = ukChip();
    expect(document.activeElement).toBe(working);
    expect(working.getAttribute("aria-disabled")).toBe("true");
    await flush();
  });

  it("clicking the UK chip without focusing it first still hands focus to the working chip (review B #3)", async () => {
    render(<App />);
    await toResults();
    const flush = holdFrames();
    const button = disclosureButton();
    fireEvent.click(button);
    // A mouse click in Safari, or Firefox on macOS, does not focus the button it clicks, and
    // fireEvent.click does not either: the chip is not focused before or by the click.
    expect(document.activeElement).not.toBe(ukChip());
    fireEvent.click(ukChip());
    await screen.findByText("Reading UK bank statement…", { selector: "main p" });
    const working = ukChip();
    expect(document.activeElement).toBe(working);
    expect(working.getAttribute("aria-disabled")).toBe("true");
    await flush();
  });

  it("dropping a file while focus is on a Rising control hands focus to the working drop area (review B #3)", async () => {
    render(<App />);
    await toResults();
    const flush = holdFrames();
    const rising = screen.getByRole("button", { name: "Yes, let it rest" });
    rising.focus();
    fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"] } });
    expect(document.activeElement).toBe(rising);
    fireEvent.drop(screen.getByRole("button", { name: DROP_NAME }), {
      dataTransfer: {
        files: [new File(["Date,Description,Amount\n"], "other.csv", { type: "text/csv" })],
        types: ["Files"],
      },
    });
    await screen.findByText("Reading other.csv…", { selector: "main p" });
    const area = screen.getByRole("button", { name: DROP_NAME });
    expect(document.activeElement).toBe(area);
    expect(area.getAttribute("aria-disabled")).toBe("true");
    await flush();
  });

  it("a window dragenter with Files opens the disclosure without moving focus", async () => {
    render(<App />);
    await toResults();
    const button = disclosureButton();
    button.focus();
    fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"] } });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: DROP_NAME })).toBeTruthy();
    expect(document.activeElement).toBe(button);
  });

  it("a window dragenter without Files does nothing", async () => {
    render(<App />);
    await toResults();
    const button = disclosureButton();
    button.focus();
    fireEvent.dragEnter(window, { dataTransfer: { types: ["text/plain"] } });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("a window dragenter while working does nothing", async () => {
    // During `working` no disclosure is rendered and the key change resets it, so this Page test
    // guards future paths; `openOnWindowDrag` below tests the `working` gate itself (review B #7).
    render(<App />);
    await toResults();
    const flush = holdFrames();
    fireEvent.click(disclosureButton());
    const chip = ukChip();
    chip.focus();
    fireEvent.click(chip);
    await screen.findByText("Reading UK bank statement…", { selector: "main p" });
    const active = document.activeElement;
    fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"] } });
    expect(screen.queryByRole("button", { name: TRY_ANOTHER_STATEMENT })).toBeNull();
    expect(document.activeElement).toBe(active);
    await flush();
    await screen.findByRole("heading", { level: 2, name: "Recurring charges found" });
    expect(disclosureButton().getAttribute("aria-expanded")).toBe("false");
  });
});

describe("openOnWindowDrag (review B #7)", () => {
  it("opens only for a drag carrying files, while shown, collapsed and not working", () => {
    expect(openOnWindowDrag(["Files"], true, false, false)).toBe(true);
    expect(openOnWindowDrag(["text/plain", "Files"], true, false, false)).toBe(true);
  });

  it("does nothing while working, open, not shown, or without files", () => {
    expect(openOnWindowDrag(["Files"], true, false, true)).toBe(false);
    expect(openOnWindowDrag(["Files"], true, true, false)).toBe(false);
    expect(openOnWindowDrag(["Files"], false, false, false)).toBe(false);
    expect(openOnWindowDrag(["text/plain"], true, false, false)).toBe(false);
    expect(openOnWindowDrag([], true, false, false)).toBe(false);
    expect(openOnWindowDrag(undefined, true, false, false)).toBe(false);
  });
});
