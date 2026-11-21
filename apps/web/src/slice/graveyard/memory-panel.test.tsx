// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FORGET_BUTTON,
  FORGET_CANCEL,
  FORGET_CONFIRM,
  FORGET_QUESTION,
  MEMORY_HEADING,
  MEMORY_HINT,
  MEMORY_LABEL,
  MEMORY_SHORT,
  NEWER_NOTE,
  REMOVE_FAILED_NOTE,
  UNREADABLE_NOTE,
  WRITE_FAILED_NOTE,
  droppedNote,
  leftOutNote,
} from "../logic/memory-text";
import { WHAT_IS_KEPT } from "../logic/chrome-text";
import type { MemoryModel, PageAction } from "../page-state";
import { MemoryPanel } from "./memory-panel";
import { FocusRequestContext } from "./use-focus-request";
import { expectUniqueButtonNames } from "./test-a11y";

const OFF: MemoryModel = {
  on: false,
  removal: null,
  loadNote: null,
  storageNote: null,
  leftOut: 0,
  restored: false,
};
const ON: MemoryModel = { ...OFF, on: true };

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
  ];
});
afterEach(() => {
  cleanup();
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function renderPanel(
  memory: MemoryModel = OFF,
  options: { hasRecords?: boolean; busy?: boolean } = {},
) {
  const dispatch = vi.fn<(action: PageAction) => void>();
  const view = render(
    <MemoryPanel
      memory={memory}
      hasRecords={options.hasRecords ?? false}
      busy={options.busy ?? false}
      dispatch={dispatch}
    />,
  );
  return { dispatch, ...view };
}

const forgetButton = () => screen.getByRole("button", { name: FORGET_BUTTON });
const queryForget = () => screen.queryByRole("button", { name: FORGET_BUTTON });

describe("MemoryPanel: checkbox, hint and notes", () => {
  it("shows the Memory heading in a labelled section", () => {
    renderPanel();
    const region = screen.getByRole("region", { name: MEMORY_HEADING });
    expect(region.querySelector("h3")?.textContent).toBe("Memory");
  });

  it("shows an unticked checkbox with its label, described by the short sentence and the hint", async () => {
    const user = userEvent.setup();
    renderPanel();
    const box = screen.getByRole("checkbox", { name: MEMORY_LABEL });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(MEMORY_LABEL).toBe("Remember my graveyard on this device");
    await user.click(screen.getByRole("button", { name: WHAT_IS_KEPT }));
    const hint = screen.getByText(MEMORY_HINT);
    const short = screen.getByText(MEMORY_SHORT);
    expect(hint.id).not.toBe("");
    expect(short.id).not.toBe("");
    expect(box.getAttribute("aria-describedby")).toBe(`${short.id} ${hint.id}`);
    expect(MEMORY_HINT).toBe(
      "Only merchant text as printed on your statement (it can include reference numbers), amounts and your answers are kept, in this browser on this device. Transactions, dates and file names are not. Nothing is sent anywhere.",
    );
  });

  it("shows the checkbox ticked when Memory is on", () => {
    renderPanel(ON);
    expect((screen.getByRole("checkbox", { name: MEMORY_LABEL }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("dispatches set-memory when ticked and when unticked", async () => {
    const user = userEvent.setup();
    const off = renderPanel(OFF);
    await user.click(screen.getByRole("checkbox", { name: MEMORY_LABEL }));
    expect(off.dispatch).toHaveBeenCalledTimes(1);
    expect(off.dispatch).toHaveBeenCalledWith({ type: "set-memory", on: true });
    cleanup();
    const on = renderPanel(ON);
    await user.click(screen.getByRole("checkbox", { name: MEMORY_LABEL }));
    expect(on.dispatch).toHaveBeenCalledTimes(1);
    expect(on.dispatch).toHaveBeenCalledWith({ type: "set-memory", on: false });
  });

  it("marks the checkbox as the memory-checkbox focus target", () => {
    renderPanel();
    expect(screen.getByRole("checkbox").getAttribute("data-focus")).toBe("memory-checkbox");
  });

  it("shows no note when there is none", () => {
    const { container } = renderPanel();
    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      MEMORY_SHORT,
      MEMORY_HINT,
    ]);
  });

  it.each([
    ["unreadable load note", { loadNote: { kind: "unreadable" } }, UNREADABLE_NOTE],
    ["dropped load note", { loadNote: { kind: "dropped", count: 1 } }, droppedNote(1)],
    ["newer load note", { loadNote: { kind: "newer" } }, NEWER_NOTE],
    ["write-failed note", { storageNote: "write-failed" }, WRITE_FAILED_NOTE],
    ["remove-failed note", { storageNote: "remove-failed" }, REMOVE_FAILED_NOTE],
    ["left-out note", { leftOut: 2 }, leftOutNote(2)],
  ] satisfies [string, Partial<MemoryModel>, string][])("shows the %s", (_name, patch, text) => {
    renderPanel({ ...OFF, ...patch });
    expect(screen.getByText(text)).not.toBeNull();
  });

  it("shows the notes in order: load, storage, left out", () => {
    const { container } = renderPanel({
      ...ON,
      loadNote: { kind: "newer" },
      storageNote: "write-failed",
      leftOut: 2,
    });
    const texts = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(texts).toEqual([
      MEMORY_SHORT,
      MEMORY_HINT,
      NEWER_NOTE,
      WRITE_FAILED_NOTE,
      leftOutNote(2),
    ]);
  });

  it("announces nothing by itself", () => {
    const { container } = renderPanel({ ...ON, storageNote: "write-failed", leftOut: 1 });
    expect(container.querySelector("[role='status'], [role='alert'], [aria-live]")).toBeNull();
  });
});

describe("MemoryPanel: Forget everything", () => {
  it("is hidden with no records and Memory off", () => {
    renderPanel(OFF, { hasRecords: false });
    expect(queryForget()).toBeNull();
  });

  it("is shown with records", () => {
    renderPanel(OFF, { hasRecords: true });
    expect(forgetButton()).not.toBeNull();
  });

  it("is shown with Memory on and no records", () => {
    renderPanel(ON, { hasRecords: false });
    expect(forgetButton()).not.toBeNull();
  });

  it("opens a group labelled by the question and focuses Cancel", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderPanel(ON, { hasRecords: true });
    await user.click(forgetButton());
    const group = screen.getByRole("group", { name: FORGET_QUESTION });
    expect(group).not.toBeNull();
    expect(queryForget()).toBeNull();
    expect(screen.getByRole("button", { name: FORGET_CONFIRM })).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: FORGET_CANCEL }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("restores the button and focuses it on Escape, with no dispatch", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderPanel(ON, { hasRecords: true });
    await user.click(forgetButton());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(forgetButton());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("restores the button and focuses it on Cancel, with no dispatch", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderPanel(ON, { hasRecords: true });
    await user.click(forgetButton());
    await user.click(screen.getByRole("button", { name: FORGET_CANCEL }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(forgetButton());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches forget on Forget and closes the group", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderPanel(ON, { hasRecords: true });
    await user.click(forgetButton());
    await user.click(screen.getByRole("button", { name: FORGET_CONFIRM }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "forget" });
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("MemoryPanel: busy", () => {
  it("marks Forget everything aria-disabled and ignores clicks", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderPanel(ON, { hasRecords: true, busy: true });
    const button = forgetButton();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    await user.click(button);
    expect(screen.queryByRole("group")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("marks Forget aria-disabled when busy begins while confirming, and ignores clicks", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn<(action: PageAction) => void>();
    const props = { memory: ON, hasRecords: true, dispatch };
    const { rerender } = render(<MemoryPanel {...props} busy={false} />);
    await user.click(forgetButton());
    rerender(<MemoryPanel {...props} busy />);
    const confirm = screen.getByRole("button", { name: FORGET_CONFIRM });
    expect(confirm.getAttribute("aria-disabled")).toBe("true");
    expect(confirm.hasAttribute("disabled")).toBe(false);
    await user.click(confirm);
    expect(dispatch).not.toHaveBeenCalled();
    expect(screen.getByRole("group")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: FORGET_CANCEL }).getAttribute("aria-disabled"),
    ).toBeNull();
  });
});

describe("MemoryPanel: keyboard and names", () => {
  it("reaches and operates every control with Tab, Space and Enter, in DOM order", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderPanel(OFF, { hasRecords: true });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("checkbox"));
    await user.keyboard(" ");
    expect(dispatch).toHaveBeenLastCalledWith({ type: "set-memory", on: true });
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: WHAT_IS_KEPT }));
    await user.tab();
    expect(document.activeElement).toBe(forgetButton());
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: FORGET_CANCEL }));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: FORGET_CONFIRM }));
    await user.keyboard(" ");
    expect(dispatch).toHaveBeenLastCalledWith({ type: "forget" });
  });

  it("uses no positive tabindex", async () => {
    const user = userEvent.setup();
    const { container } = renderPanel(ON, { hasRecords: true });
    await user.click(forgetButton());
    for (const element of container.querySelectorAll("[tabindex]")) {
      expect(Number(element.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
    }
  });

  it("has unique button names in each state", async () => {
    const user = userEvent.setup();
    const { container, rerender, dispatch } = renderPanel(ON, { hasRecords: true });
    expectUniqueButtonNames(container);
    await user.click(forgetButton());
    expectUniqueButtonNames(container);
    rerender(<MemoryPanel memory={ON} hasRecords busy dispatch={dispatch} />);
    expectUniqueButtonNames(container);
    rerender(<MemoryPanel memory={OFF} hasRecords={false} busy={false} dispatch={dispatch} />);
    expectUniqueButtonNames(container);
  });
});

describe("MemoryPanel: button variants (Req 6.5)", () => {
  it("makes Forget everything danger, and in the confirmation Cancel secondary and Forget danger", async () => {
    const user = userEvent.setup();
    renderPanel(ON, { hasRecords: true });
    expect(forgetButton().getAttribute("data-variant")).toBe("danger");
    await user.click(forgetButton());
    const cancel = screen.getByRole("button", { name: FORGET_CANCEL });
    const confirm = screen.getByRole("button", { name: FORGET_CONFIRM });
    expect(cancel.getAttribute("data-variant")).toBe("secondary");
    expect(confirm.getAttribute("data-variant")).toBe("danger");
    for (const button of [cancel, confirm]) expect(button.className).not.toContain("opacity-60");
  });
});

describe("MemoryPanel: toggle, short sentence and What is kept? (pro-polish Req 9.4 to 9.6)", () => {
  const whatIsKept = () => screen.getByRole("button", { name: WHAT_IS_KEPT });

  it("shows, in order: heading, toggle label, short sentence, What is kept?, hint, notes, Forget everything", () => {
    const { container } = renderPanel({ ...ON, storageNote: "write-failed" }, { hasRecords: true });
    const section = container.querySelector("section");
    if (section === null) throw new Error("no section");
    const parts = [
      section.querySelector("h3"),
      screen.getByRole("checkbox", { name: MEMORY_LABEL }),
      screen.getByText(MEMORY_SHORT),
      whatIsKept(),
      screen.getByText(MEMORY_HINT),
      screen.getByText(WRITE_FAILED_NOTE),
      forgetButton(),
    ];
    for (let i = 1; i < parts.length; i += 1) {
      const before = parts[i - 1];
      const after = parts[i];
      if (before == null || after == null) throw new Error(`missing part ${i}`);
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
    expect(MEMORY_SHORT).toBe("Kept only in this browser, on this device.");
    expect(WHAT_IS_KEPT).toBe("What is kept?");
  });

  it("keeps a native checkbox with no switch role, inside a 44 px label", () => {
    renderPanel();
    const box = screen.getByRole("checkbox", { name: MEMORY_LABEL });
    expect(box.getAttribute("type")).toBe("checkbox");
    expect(box.hasAttribute("role")).toBe(false);
    expect(box.getAttribute("data-focus")).toBe("memory-checkbox");
    expect(box.className).toContain("appearance-none");
    expect(box.className).toContain("rounded-pill");
    expect(box.className).not.toContain("transition");
    const label = box.closest("label");
    expect(label?.className.split(" ")).toEqual(
      expect.arrayContaining(["flex", "min-h-11", "items-center", "gap-2"]),
    );
  });

  it("draws the track and knob as hidden sibling spans placed by peer-checked classes (Batch D #5)", () => {
    renderPanel();
    const box = screen.getByRole("checkbox", { name: MEMORY_LABEL });
    expect(box.className.split(" ")).toContain("peer");
    expect(box.className).not.toContain("before:");
    const track = box.parentElement?.querySelector<HTMLElement>("[data-switch-track]");
    const knob = box.parentElement?.querySelector<HTMLElement>("[data-switch-knob]");
    if (track == null || knob == null) throw new Error("no track or knob");
    for (const el of [track, knob]) {
      expect(el.tagName).toBe("SPAN");
      expect(el.getAttribute("aria-hidden")).toBe("true");
      expect(box.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
      expect(el.className).not.toContain("transition");
    }
    expect(track.className.split(" ")).toEqual(
      expect.arrayContaining([
        "border-bone/45",
        "peer-checked:border-moss",
        "peer-checked:bg-moss",
      ]),
    );
    expect(knob.className.split(" ")).toEqual(
      expect.arrayContaining([
        "size-4",
        "bg-bone",
        "peer-checked:translate-x-5",
        "peer-checked:bg-night",
      ]),
    );
  });

  it("removes the inline padding of What is kept? so its text starts at the short sentence (Batch D V1)", () => {
    renderPanel();
    const button = whatIsKept();
    expect(button.parentElement?.className.split(" ")).toContain("[&>button]:px-0");
    expect(button.className.split(" ")).toEqual(expect.arrayContaining(["min-h-11", "min-w-11"]));
  });

  it("lists the short id then the hint id in aria-describedby, and both resolve to their texts", () => {
    renderPanel();
    const box = screen.getByRole("checkbox", { name: MEMORY_LABEL });
    const ids = (box.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      MEMORY_SHORT,
      MEMORY_HINT,
    ]);
  });

  it("keeps the hint in the DOM and hidden until What is kept? is opened", async () => {
    const user = userEvent.setup();
    renderPanel();
    const button = whatIsKept();
    const box = screen.getByRole("checkbox", { name: MEMORY_LABEL });
    const hintId = (box.getAttribute("aria-describedby") ?? "").split(" ")[1] ?? "";
    const hint = document.getElementById(hintId);
    expect(hint?.textContent).toBe(MEMORY_HINT);
    expect(hint?.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(hintId);
    expect(button.getAttribute("data-variant")).toBe("tertiary");
    expect(button.className).toContain("min-h-11");
    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(hint?.hidden).toBe(false);
    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(hint?.hidden).toBe(true);
  });

  it("dispatches set-memory when the toggle label is clicked", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderPanel(OFF);
    await user.click(screen.getByText(MEMORY_LABEL));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "set-memory", on: true });
  });
});

describe("MemoryPanel: the memory-checkbox focus request (Req 9.5)", () => {
  it("focuses the toggle when the page requests memory-checkbox, as Memory settings does", () => {
    const dispatch = vi.fn<(action: PageAction) => void>();
    render(
      <FocusRequestContext.Provider
        value={{ focus: { target: "memory-checkbox", id: null, seq: 1 }, claim: () => true }}
      >
        <MemoryPanel memory={ON} hasRecords busy={false} dispatch={dispatch} />
      </FocusRequestContext.Provider>,
    );
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: MEMORY_LABEL }));
  });
});
