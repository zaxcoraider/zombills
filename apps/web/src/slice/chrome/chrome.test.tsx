// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { NEW_TAB_TEXT } from "../logic/cancel-text";
import {
  HOME_CONTROL_NAME,
  LEAVE_QUESTION,
  LEAVE_TEXT,
  PRIVACY_TOMBSTONE,
  SITE_LINKS_NAME,
  STAY_TEXT,
} from "../logic/chrome-text";
import {
  KIRO_LINK,
  PRIMARY_ACTION_NAME,
  REAPER_DESCRIPTION,
  REAPER_LINK,
  REPO_LINK,
} from "../logic/landing-text";
import { PRIVACY_NOTE } from "../logic/memory-text";
import { FooterTombstone } from "./footer-tombstone";
import { LeaveQuestion } from "./leave-question";

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

function setup(seq = 1) {
  const onStay = vi.fn();
  const onLeave = vi.fn();
  const view = render(<LeaveQuestion seq={seq} onStay={onStay} onLeave={onLeave} />);
  return { onStay, onLeave, ...view };
}

describe("LeaveQuestion", () => {
  it("is a group named by the leave question", () => {
    setup();
    expect(screen.getByRole("group", { name: LEAVE_QUESTION })).toBeTruthy();
  });

  it("focuses Stay after mount", () => {
    setup();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: STAY_TEXT }));
  });

  it("gives Stay and Leave the secondary variant", () => {
    setup();
    for (const name of [STAY_TEXT, LEAVE_TEXT]) {
      expect(screen.getByRole("button", { name }).getAttribute("data-variant")).toBe("secondary");
    }
  });

  it("refocuses Stay when seq changes after focus moved away", () => {
    const { onStay, onLeave, rerender } = setup(1);
    const leave = screen.getByRole("button", { name: LEAVE_TEXT });
    leave.focus();
    expect(document.activeElement).toBe(leave);
    rerender(<LeaveQuestion seq={2} onStay={onStay} onLeave={onLeave} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: STAY_TEXT }));
  });

  it("calls onStay once on Escape inside the group", () => {
    const { onStay, onLeave } = setup();
    fireEvent.keyDown(screen.getByRole("button", { name: LEAVE_TEXT }), { key: "Escape" });
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("calls onStay from Stay and onLeave from Leave", () => {
    const { onStay, onLeave } = setup();
    fireEvent.click(screen.getByRole("button", { name: STAY_TEXT }));
    expect(onStay).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: LEAVE_TEXT }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onStay).toHaveBeenCalledTimes(1);
  });

  it("puts no text in a Live region", () => {
    const { container } = setup();
    expect(container.querySelector('[role="status"], [aria-live]')).toBeNull();
  });
});

const RESULTS_HEADING = "Recurring charges found";
const DROP_AREA_NAME = "Drop area: choose or drop a CSV statement";
const NO_SUBSCRIPTIONS_CSV =
  "Date,Description,Amount\n2026-01-03,CORNER BAKERY,-4.50\n2026-01-09,HARDWARE DEPOT,-23.10\n2026-01-20,BOOK NOOK,-12.00\n";

function primaryAction(): HTMLElement {
  return screen.getByRole("button", { name: PRIMARY_ACTION_NAME });
}

function homeControl(): HTMLElement {
  return screen.getByRole("button", { name: HOME_CONTROL_NAME });
}

function liveText(): string | null {
  return screen.getByRole("status").textContent;
}

/**
 * The Live region text of the state that today's control reaches from the same place: going
 * home is that transition with only the focus target changed, so it announces nothing new
 * (Req 12.10).
 */
async function liveTextAfterTodaysControl(reach: () => Promise<void>, control: string) {
  render(<App />);
  await reach();
  fireEvent.click(screen.getByRole("button", { name: control }));
  await waitFor(() => expect(primaryAction()).toBeTruthy());
  const text = liveText();
  cleanup();
  return text;
}

function mainElement(): HTMLElement {
  return document.querySelector("main") as HTMLElement;
}

function dropFile(text: string, name: string) {
  fireEvent.drop(screen.getByRole("button", { name: DROP_AREA_NAME }), {
    dataTransfer: { files: [new File([text], name, { type: "text/csv" })], types: ["Files"] },
  });
}

async function summon() {
  fireEvent.click(primaryAction());
  await screen.findByRole("heading", { level: 2, name: RESULTS_HEADING });
}

/** Results with one kept record, then an empty file: the error view with a Graveyard record. */
async function reachError() {
  await summon();
  fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
  fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
  dropFile("", "empty.csv");
  await screen.findByRole("heading", { level: 2, name: "The file is empty." });
}

async function reachNoSubscriptions() {
  await summon();
  fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
  dropFile(NO_SUBSCRIPTIONS_CSV, "few.csv");
  await screen.findByRole("heading", { level: 2, name: "No undead here." });
}

/** The Graveyard view while idle: a kept record, home, then "Open the graveyard". */
async function reachGraveyard() {
  await reachError();
  fireEvent.click(homeControl());
  await waitFor(() => expect(document.activeElement).toBe(primaryAction()));
  fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: PRIMARY_ACTION_NAME })).toBeNull(),
  );
}

/** Req 1.2 and P5: one `h1`, named by the Home control, which is its only control. */
function expectCompactH1() {
  const headings = document.querySelectorAll("h1");
  expect(headings).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: HOME_CONTROL_NAME })).toBe(headings[0]);
  const h1 = headings[0] as HTMLElement;
  const controls = h1.querySelectorAll("button, a, input, select, textarea, [tabindex]");
  expect(controls).toHaveLength(1);
  const button = controls[0] as HTMLElement;
  expect(button.tagName).toBe("BUTTON");
  expect(button).toBe(homeControl());
  expect(button.querySelector('[aria-hidden="true"] svg, svg[aria-hidden="true"]')).not.toBeNull();
  expect(button.textContent).toBe("Zombills");
}

describe("Compact header", () => {
  it("has one h1 holding only the Home control on results", async () => {
    render(<App />);
    await summon();
    expectCompactH1();
    expect(screen.queryByText("Your bank statement is haunted.")).toBeNull();
  });

  it("has one h1 holding only the Home control on error", async () => {
    render(<App />);
    await reachError();
    expectCompactH1();
  });

  it("has one h1 holding only the Home control on no-subscriptions", async () => {
    render(<App />);
    await reachNoSubscriptions();
    expectCompactH1();
  });

  it("has one h1 holding only the Home control on the Graveyard view", async () => {
    render(<App />);
    await reachGraveyard();
    expectCompactH1();
  });

  it("keeps a Landing h1 with no button in it", () => {
    render(<App />);
    const headings = document.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Zombills" })).toBe(headings[0]);
    expect(headings[0]?.querySelector("button")).toBeNull();
    expect(screen.queryByRole("button", { name: HOME_CONTROL_NAME })).toBeNull();
  });
});

describe("Home control", () => {
  it("from error shows the Landing view, focuses the Primary action and keeps the Graveyard", async () => {
    const expected = await liveTextAfterTodaysControl(reachError, "Start again");
    render(<App />);
    await reachError();
    fireEvent.click(homeControl());
    await waitFor(() => expect(document.activeElement).toBe(primaryAction()));
    expect(screen.queryByRole("group", { name: LEAVE_QUESTION })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Zombills" })).toBeTruthy();
    expect(liveText()).toBe(expected);
    fireEvent.click(screen.getByRole("button", { name: "Open the graveyard" }));
    expect((await screen.findAllByText(/Adobe Creative Cloud/)).length).toBeGreaterThan(0);
  });

  it("from the Graveyard view while idle goes home and focuses the Primary action", async () => {
    const expected = await liveTextAfterTodaysControl(reachGraveyard, "Back to the start");
    render(<App />);
    await reachGraveyard();
    fireEvent.click(homeControl());
    await waitFor(() => expect(document.activeElement).toBe(primaryAction()));
    expect(liveText()).toBe(expected);
  });

  it("from results asks first with the Leave question as main's first child", async () => {
    render(<App />);
    await summon();
    const live = liveText();
    fireEvent.click(homeControl());
    const group = screen.getByRole("group", { name: LEAVE_QUESTION });
    expect(mainElement().firstElementChild).toBe(group);
    const stay = screen.getByRole("button", { name: STAY_TEXT });
    expect(document.activeElement).toBe(stay);
    expect(screen.getByRole("heading", { level: 2, name: RESULTS_HEADING })).toBeTruthy();
    expect(liveText()).toBe(live);

    homeControl().focus();
    fireEvent.click(homeControl());
    expect(screen.getByRole("group", { name: LEAVE_QUESTION })).toBe(group);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: STAY_TEXT }));
    expect(liveText()).toBe(live);
  });

  it("closes the Leave question on Stay and on Escape, focusing the Home control", async () => {
    render(<App />);
    await summon();
    const live = liveText();

    fireEvent.click(homeControl());
    fireEvent.click(screen.getByRole("button", { name: STAY_TEXT }));
    expect(screen.queryByRole("group", { name: LEAVE_QUESTION })).toBeNull();
    expect(document.activeElement).toBe(homeControl());
    expect(screen.getByRole("heading", { level: 2, name: RESULTS_HEADING })).toBeTruthy();
    expect(liveText()).toBe(live);

    fireEvent.click(homeControl());
    fireEvent.keyDown(screen.getByRole("button", { name: STAY_TEXT }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: LEAVE_QUESTION })).toBeNull();
    expect(document.activeElement).toBe(homeControl());
    expect(screen.getByRole("heading", { level: 2, name: RESULTS_HEADING })).toBeTruthy();
    expect(liveText()).toBe(live);
  });

  it("closes the Leave question on a change of state kind and focuses the Home control", async () => {
    const frames: FrameRequestCallback[] = [];
    render(<App />);
    await summon();
    fireEvent.click(homeControl());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: STAY_TEXT }));
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    dropFile(NO_SUBSCRIPTIONS_CSV, "few.csv");
    await waitFor(() => expect(frames).toHaveLength(1));
    expect(screen.queryByRole("group", { name: LEAVE_QUESTION })).toBeNull();
    expect(document.activeElement).toBe(homeControl());
    await act(async () => {
      frames[0]?.(0);
    });
    await screen.findByRole("heading", { level: 2, name: "No undead here." });
  });

  it("keeps the Leave question open across a change within one state kind (Req 1.4)", async () => {
    render(<App />);
    await summon();
    fireEvent.click(homeControl());
    const group = screen.getByRole("group", { name: LEAVE_QUESTION });
    // Answering the card is a step inside `results`: the view kind and the screen stay the same.
    fireEvent.click(screen.getByRole("button", { name: "Yes, let it rest" }));
    await waitFor(() => expect(screen.getByText(/1 of \d+ answered/)).toBeTruthy());
    expect(screen.getByRole("heading", { level: 2, name: RESULTS_HEADING })).toBeTruthy();
    expect(screen.getByRole("group", { name: LEAVE_QUESTION })).toBe(group);
  });

  it("goes home on Leave and focuses the Primary action", async () => {
    const expected = await liveTextAfterTodaysControl(async () => {
      await summon();
      fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    }, "Start again");
    render(<App />);
    await summon();
    fireEvent.click(homeControl());
    fireEvent.click(screen.getByRole("button", { name: LEAVE_TEXT }));
    await waitFor(() => expect(document.activeElement).toBe(primaryAction()));
    expect(screen.queryByRole("group", { name: LEAVE_QUESTION })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: RESULTS_HEADING })).toBeNull();
    expect(liveText()).toBe(expected);
  });

  it("is aria-disabled while working, does nothing and keeps focus", async () => {
    const frames: FrameRequestCallback[] = [];
    render(<App />);
    await summon();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    dropFile(NO_SUBSCRIPTIONS_CSV, "few.csv");
    await waitFor(() => expect(frames).toHaveLength(1));
    const home = homeControl();
    expect(home.getAttribute("aria-disabled")).toBe("true");
    expect(home.hasAttribute("disabled")).toBe(false);
    home.focus();
    const live = liveText();
    fireEvent.click(home);
    expect(document.activeElement).toBe(home);
    expect(screen.queryByRole("group", { name: LEAVE_QUESTION })).toBeNull();
    expect(screen.queryByRole("button", { name: PRIMARY_ACTION_NAME })).toBeNull();
    expect(liveText()).toBe(live);
    await act(async () => {
      frames[0]?.(0);
    });
    await screen.findByRole("heading", { level: 2, name: "No undead here." });
    expect(homeControl().hasAttribute("aria-disabled")).toBe(false);
  });

  it("does not ask on Start again", async () => {
    render(<App />);
    await summon();
    fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.queryByRole("group", { name: LEAVE_QUESTION })).toBeNull();
    await waitFor(() => expect(primaryAction()).toBeTruthy());
  });
});

describe("FooterTombstone", () => {
  const HREF = "#stone-link";

  function renderStone(reduceMotion = false) {
    return render(
      <>
        <FooterTombstone
          label="Zombills"
          reduceMotion={reduceMotion}
          href={HREF}
          describedBy="new-tab"
        />
        <span id="new-tab">Opens in a new tab</span>
      </>,
    );
  }

  it("renders a link with target, rel, description and its label as name", () => {
    renderStone();
    const link = screen.getByRole("link", { name: "Zombills" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(HREF);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-describedby")).toBe("new-tab");
    expect(link.hasAttribute("aria-label")).toBe(false);
    expect(link.getAttribute("data-exempt")).toBe("footer-tombstone");
  });

  it("renders a button that calls onActivate when no href is set", () => {
    const onActivate = vi.fn();
    render(<FooterTombstone label="Privacy note" reduceMotion={false} onActivate={onActivate} />);
    const button = screen.getByRole("button", { name: "Privacy note" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("shows the Peek ghost only without reduced motion", () => {
    const { container, unmount } = renderStone(false);
    expect(container.querySelector("[data-peek-ghost]")).not.toBeNull();
    unmount();
    const reduced = renderStone(true);
    expect(reduced.container.querySelector("[data-peek-ghost]")).toBeNull();
    expect(reduced.container.querySelector("[data-stone-face]")).not.toBeNull();
    expect(reduced.container.querySelector("[data-stone-outline]")).not.toBeNull();
  });

  it("hides every SVG from assistive technology", () => {
    for (const reduceMotion of [false, true]) {
      const { container, unmount } = renderStone(reduceMotion);
      for (const svg of container.querySelectorAll("svg")) {
        expect(svg.getAttribute("aria-hidden")).toBe("true");
      }
      unmount();
    }
  });
});

describe("Footer graveyard", () => {
  function footer(): HTMLElement {
    return screen.getByRole("contentinfo");
  }

  function describedTexts(el: HTMLElement): (string | null | undefined)[] {
    return (el.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
  }

  it("lists the four tombstones in order with their exact texts", () => {
    render(<App />);
    const list = within(footer()).getByRole("list", { name: SITE_LINKS_NAME });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      REPO_LINK.text,
      REAPER_LINK.text,
      PRIVACY_TOMBSTONE,
      KIRO_LINK.text,
    ]);
    const controls = items.map((item) => item.querySelector("a, button") as HTMLElement);
    expect(controls.map((control) => control.tagName)).toEqual(["A", "A", "BUTTON", "A"]);
  });

  it("gives the three links their href, target, rel and descriptions", () => {
    render(<App />);
    const scope = within(footer());
    const links = [REPO_LINK, REAPER_LINK, KIRO_LINK].map((link) => {
      const element = scope.getByRole("link", { name: new RegExp(`^${link.text}`) });
      expect(element.getAttribute("href")).toBe(link.href);
      expect(element.getAttribute("target")).toBe("_blank");
      expect(element.getAttribute("rel")).toBe("noopener noreferrer");
      expect(element.textContent).toBe(link.text);
      return element;
    });
    const [repo, reaper, kiro] = links as [HTMLElement, HTMLElement, HTMLElement];
    expect(describedTexts(repo)).toEqual([NEW_TAB_TEXT]);
    expect(describedTexts(reaper)).toEqual([REAPER_DESCRIPTION, NEW_TAB_TEXT]);
    expect(describedTexts(kiro)).toEqual([NEW_TAB_TEXT]);
    const privacy = scope.getByRole("button", { name: PRIVACY_TOMBSTONE });
    for (const control of [...links, privacy]) {
      const name = control.getAttribute("aria-label") ?? control.textContent ?? "";
      expect(name.startsWith(control.textContent ?? "")).toBe(true);
      expect(control.hasAttribute("aria-label")).toBe(false);
    }
  });

  it("has no heading, no img, the Privacy note once and no 'Built with Kiro.' sentence", () => {
    render(<App />);
    const scope = within(footer());
    expect(scope.queryAllByRole("heading")).toHaveLength(0);
    expect(scope.queryAllByRole("img")).toHaveLength(0);
    expect(footer().querySelector("img")).toBeNull();
    const notes = screen.getAllByText(PRIVACY_NOTE);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.getAttribute("tabindex")).toBe("-1");
    expect(footer().contains(notes[0] ?? null)).toBe(true);
    expect(screen.queryByText("Built with Kiro.")).toBeNull();
  });

  async function expectPrivacyStoneFocusesNote() {
    const href = window.location.href;
    const live = liveText();
    fireEvent.click(within(footer()).getByRole("button", { name: PRIVACY_TOMBSTONE }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText(PRIVACY_NOTE)));
    expect(window.location.href).toBe(href);
    expect(liveText()).toBe(live);
  }

  it("focuses the Privacy note from the 'Privacy note' stone on the Landing view", async () => {
    render(<App />);
    await expectPrivacyStoneFocusesNote();
  });

  it("focuses the Privacy note from the 'Privacy note' stone on results", async () => {
    render(<App />);
    await summon();
    await expectPrivacyStoneFocusesNote();
  });
});
