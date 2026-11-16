// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import type { ReactElement } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { APP_STORE_LINKS, cancellationEmail } from "@zombills/core";
import type { CancelHelp } from "@zombills/core";
import {
  BRACKETS_NOTE,
  COPY_FAILED_NOTICE,
  EMAIL_ONLY_INTRO,
  LINK_INTRO,
  MAILTO_HINT,
  copiedNotice,
  copyTextOf,
  emailInputFor,
  panelLine,
} from "../logic/cancel-text";
import type { AnswerRecord } from "../logic/graveyard";
import { formatMoney } from "../logic/money";
import { CancelHelper } from "./cancel-helper";
import { AnnounceContext } from "./use-announce";
import { COPIED_MS } from "./use-copy-email";

const FIXTURE_STEPS = ["Sign in to the fixture site.", "Choose Cancel plan.", "Confirm."];

const FIXTURES: Readonly<Record<string, CancelHelp>> = {
  netflix: {
    kind: "link",
    serviceId: "netflix",
    url: "https://www.fixture-provider.test/cancel?plan=1",
    linkKind: "cancel",
    host: "fixture-provider.test",
    steps: FIXTURE_STEPS,
    appStoreMayApply: true,
    lastChecked: null,
  },
  spotify: {
    kind: "link",
    serviceId: "spotify",
    url: "https://account.fixture-music.test/manage",
    linkKind: "manage",
    host: "account.fixture-music.test",
    steps: ["Open the account page."],
    appStoreMayApply: false,
    lastChecked: "2026-11-17",
  },
};

vi.mock("@zombills/core", async () => {
  const actual = await vi.importActual<typeof import("@zombills/core")>("@zombills/core");
  return {
    ...actual,
    getCancelHelp: (serviceId: string | null): CancelHelp =>
      (serviceId === null ? undefined : FIXTURES[serviceId]) ?? {
        kind: "email-only",
        serviceId,
      },
  };
});

let errorSpy: MockInstance;
let warnSpy: MockInstance;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  const calls = errorSpy.mock.calls.length + warnSpy.mock.calls.length;
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  window.getSelection()?.removeAllRanges();
  expect(calls).toBe(0);
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

const NETFLIX: AnswerRecord = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currency: "USD",
  cadence: "monthly",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  yearlySavingCents: 21588,
};
const SPOTIFY: AnswerRecord = {
  ...NETFLIX,
  id: "sub:USD:monthly:*:spotify",
  merchant: "Spotify",
  serviceId: "spotify",
  currentAmountCents: 1199,
  yearlySavingCents: 14388,
};
const GYM: AnswerRecord = {
  ...NETFLIX,
  id: "sub:USD:monthly:*:gym",
  merchant: "Riverside Gym Membership",
  serviceId: null,
  currentAmountCents: 2900,
  yearlySavingCents: 34800,
};

function ui(record: AnswerRecord, displayName = record.merchant): ReactElement {
  return <CancelHelper record={record} displayName={displayName} reduceMotion={false} />;
}

function emailTextOf(record: AnswerRecord): string {
  return copyTextOf(cancellationEmail(emailInputFor(record)));
}

function emailBlock(): HTMLElement {
  const block = document.querySelector<HTMLElement>("[data-email-text]");
  if (block === null) throw new Error("no email block");
  return block;
}

const NETFLIX_URL = "https://www.fixture-provider.test/cancel?plan=1";

describe("CancelHelper link panel", () => {
  it("is a region named 'Seal the grave: Netflix' with the line", () => {
    render(ui(NETFLIX));
    const region = screen.getByRole("region", { name: "Seal the grave: Netflix" });
    expect(within(region).getByText(panelLine("Netflix"))).toBeTruthy();
  });

  it("shows the cancel link with the fixture href, target, rel and description", () => {
    render(ui(NETFLIX));
    const link = screen.getByRole("link", {
      name: "Open the Netflix cancel page (fixture-provider.test) for Netflix",
    });
    expect(link.getAttribute("href")).toBe(NETFLIX_URL);
    expect(link.textContent).toBe("Open the Netflix cancel page (fixture-provider.test)");
    expect(link.className).toContain("underline");
    const description = document.getElementById(link.getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toBe("(opens in a new tab)");
  });

  it("puts target, rel and the new-tab description on every external link, and none on mailto", () => {
    render(ui(NETFLIX));
    const links = screen.getAllByRole("link");
    const external = links.filter((a) => !(a.getAttribute("href") ?? "").startsWith("mailto:"));
    expect(external).toHaveLength(3);
    for (const link of external) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("aria-describedby")).not.toBeNull();
    }
    const mail = links.find((a) => (a.getAttribute("href") ?? "").startsWith("mailto:"));
    expect(mail?.hasAttribute("target")).toBe(false);
    expect(mail?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("lists the steps in an ol, as stored", () => {
    const { container } = render(ui(NETFLIX));
    const items = container.querySelectorAll("ol > li");
    expect(Array.from(items, (li) => li.textContent)).toEqual(FIXTURE_STEPS);
  });

  it("shows the store note and both store links when appStoreMayApply", () => {
    render(ui(NETFLIX));
    expect(
      screen.getByText("If you pay through the App Store or Google Play, cancel there instead:"),
    ).toBeTruthy();
    const apple = screen.getByRole("link", { name: "Apple subscriptions for Netflix" });
    const google = screen.getByRole("link", { name: "Google Play subscriptions for Netflix" });
    expect(apple.getAttribute("href")).toBe(APP_STORE_LINKS.apple.url);
    expect(google.getAttribute("href")).toBe(APP_STORE_LINKS.google.url);
  });

  it("leaves out the store note when appStoreMayApply is false", () => {
    render(ui(SPOTIFY));
    expect(screen.queryByText(/App Store or Google Play/)).toBeNull();
    expect(screen.queryByRole("link", { name: /Apple subscriptions/ })).toBeNull();
  });

  it("shows no 'Link checked' line for lastChecked null, and the line for a dated copy", () => {
    const { unmount } = render(ui(NETFLIX));
    expect(screen.queryByText(/Link checked/)).toBeNull();
    unmount();
    render(ui(SPOTIFY));
    expect(screen.getByText(/^Link checked .* 2026\.$/)).toBeTruthy();
  });

  it("shows the manage-page text for a manage entry", () => {
    render(ui(SPOTIFY));
    expect(
      screen.getByRole("link", {
        name: "Open the Spotify manage page (account.fixture-music.test) for Spotify",
      }),
    ).toBeTruthy();
  });

  it("shows the intro, bracket note, email text and hint", () => {
    render(ui(NETFLIX));
    expect(screen.getByText(LINK_INTRO)).toBeTruthy();
    expect(screen.queryByText(EMAIL_ONLY_INTRO)).toBeNull();
    expect(screen.getByText(BRACKETS_NOTE)).toBeTruthy();
    expect(screen.getByText(MAILTO_HINT)).toBeTruthy();
    expect(emailBlock().textContent).toBe(emailTextOf(NETFLIX));
    expect(emailBlock().textContent).toContain("Please cancel my Netflix subscription");
    expect(emailBlock().textContent).toContain(
      `I am currently charged ${formatMoney(1799, "USD")} (USD) every month.`,
    );
    expect(emailBlock().querySelector(".font-semibold")?.textContent).toBe(
      "Please cancel my Netflix subscription",
    );
    expect(emailBlock().className).toContain("whitespace-pre-wrap");
    expect(emailBlock().className).toContain("select-text");
  });

  it("links the email app with a mailto href and no target", () => {
    render(ui(NETFLIX));
    const mail = screen.getByRole("link", { name: "Open in my email app for Netflix" });
    expect(mail.getAttribute("href")).toMatch(
      /^mailto:\?subject=Please%20cancel%20my%20Netflix%20subscription&body=/,
    );
    expect(mail.hasAttribute("target")).toBe(false);
  });

  it("names a Known service by its display name, not the statement merchant", () => {
    render(ui({ ...NETFLIX, serviceId: "netflix", merchant: "NETFLIX.COM" }, "NETFLIX.COM"));
    expect(emailBlock().textContent).toContain("Please cancel my Netflix subscription");
  });

  it("sets the wrap, size and no-icon rules", () => {
    const { container } = render(ui(NETFLIX));
    const section = container.querySelector("section");
    expect(section?.className).toContain("[overflow-wrap:anywhere]");
    for (const control of [...screen.getAllByRole("link"), ...screen.getAllByRole("button")]) {
      expect(control.className).toContain("inline-flex");
      expect(control.className).toContain("min-h-11");
      expect(control.className).toContain("min-w-11");
      expect(control.className).toContain("items-center");
    }
    expect(container.querySelector("svg, img")).toBeNull();
  });
});

describe("CancelHelper email-only panel", () => {
  it("shows the intro, the email naming the merchant, and no link but the mail link", () => {
    render(ui(GYM));
    expect(
      screen.getByRole("region", { name: "Seal the grave: Riverside Gym Membership" }),
    ).toBeTruthy();
    expect(screen.getByText(EMAIL_ONLY_INTRO)).toBeTruthy();
    expect(screen.queryByText(LINK_INTRO)).toBeNull();
    expect(document.querySelector("ol")).toBeNull();
    expect(emailBlock().textContent).toBe(emailTextOf(GYM));
    expect(emailBlock().textContent).toContain("Riverside Gym Membership");
    expect(emailBlock().textContent).toContain(
      `I am currently charged ${formatMoney(2900, "USD")} (USD) every month.`,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")?.startsWith("mailto:")).toBe(true);
  });
});

describe("CancelHelper accessible names and tab order", () => {
  it("starts every name with its visible text and ends it with ' for <d>'", () => {
    render(ui(NETFLIX, "Netflix (2)"));
    const controls = [...screen.getAllByRole("link"), ...screen.getAllByRole("button")];
    expect(controls).toHaveLength(5);
    for (const control of controls) {
      const name = control.getAttribute("aria-label") ?? "";
      expect(name.startsWith((control.textContent ?? "").trim())).toBe(true);
      expect(name.endsWith(" for Netflix (2)")).toBe(true);
    }
  });

  it("tabs line → cancel link → store links → Copy → email link, with no positive tabindex", async () => {
    const user = userEvent.setup();
    const { container } = render(ui(NETFLIX));
    expect(
      container.querySelector("[tabindex]:not([tabindex='0']):not([tabindex^='-'])"),
    ).toBeNull();
    const names: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      names.push(document.activeElement?.getAttribute("aria-label") ?? "");
    }
    expect(names).toEqual([
      "Open the Netflix cancel page (fixture-provider.test) for Netflix",
      "Apple subscriptions for Netflix",
      "Google Play subscriptions for Netflix",
      "Copy email for Netflix",
      "Open in my email app for Netflix",
    ]);
  });
});

/**
 * Testing Library only drains its own async wrapper under fake timers when a global `jest` exists,
 * so Vitest's fake clock needs this stand-in for `user.click` to settle.
 */
function installFakeClock() {
  vi.useFakeTimers();
  vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
}

function recordingAnnounce() {
  const calls: string[] = [];
  const wrap = (node: ReactElement) => (
    <AnnounceContext.Provider value={{ announce: (text) => calls.push(text) }}>
      {node}
    </AnnounceContext.Provider>
  );
  return { calls, wrap };
}

function selectedText(): string {
  return window.getSelection()?.toString() ?? "";
}

describe("CancelHelper copy flow", () => {
  it("writes the email once, shows Copied, announces, keeps focus and reverts after COPIED_MS", async () => {
    installFakeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { calls, wrap } = recordingAnnounce();
    render(wrap(ui(NETFLIX)));
    const button = screen.getByRole("button", { name: "Copy email for Netflix" });
    await user.click(button);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(emailTextOf(NETFLIX));
    const copied = screen.getByRole("button", { name: "Copied for Netflix" });
    expect(copied.textContent).toBe("Copied");
    expect(document.activeElement).toBe(copied);
    expect(calls).toEqual([copiedNotice("Netflix")]);
    await act(() => vi.advanceTimersByTimeAsync(COPIED_MS));
    const back = screen.getByRole("button", { name: "Copy email for Netflix" });
    expect(back.textContent).toBe("Copy email");
    expect(document.activeElement).toBe(back);
  });

  it("restarts the timer on a second Copy", async () => {
    installFakeClock();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.resolve() } });
    render(ui(NETFLIX));
    await user.click(screen.getByRole("button", { name: "Copy email for Netflix" }));
    await act(() => vi.advanceTimersByTimeAsync(COPIED_MS - 500));
    await user.click(screen.getByRole("button", { name: "Copied for Netflix" }));
    await act(() => vi.advanceTimersByTimeAsync(COPIED_MS - 500));
    expect(screen.getByRole("button", { name: "Copied for Netflix" })).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByRole("button", { name: "Copy email for Netflix" })).toBeTruthy();
  });

  it("selects exactly the email text and announces the failure when writeText rejects", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    });
    const { calls, wrap } = recordingAnnounce();
    render(wrap(ui(NETFLIX)));
    const button = screen.getByRole("button", { name: "Copy email for Netflix" });
    await user.click(button);
    await vi.waitFor(() => expect(calls).toEqual([COPY_FAILED_NOTICE]));
    expect(selectedText()).toBe(emailBlock().textContent);
    expect(document.activeElement).toBe(button);
    expect(button.textContent).toBe("Copy email");
  });

  it("selects the email text when writeText throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: () => {
          throw new Error("blocked");
        },
      },
    });
    const { calls, wrap } = recordingAnnounce();
    render(wrap(ui(NETFLIX)));
    await user.click(screen.getByRole("button", { name: "Copy email for Netflix" }));
    expect(calls).toEqual([COPY_FAILED_NOTICE]);
    expect(selectedText()).toBe(emailBlock().textContent);
  });

  it("selects the email text when navigator.clipboard is missing or writeText is not a function", async () => {
    const user = userEvent.setup();
    const { calls, wrap } = recordingAnnounce();
    vi.stubGlobal("navigator", {});
    const first = render(wrap(ui(NETFLIX)));
    await user.click(screen.getByRole("button", { name: "Copy email for Netflix" }));
    expect(selectedText()).toBe(emailBlock().textContent);
    first.unmount();
    window.getSelection()?.removeAllRanges();
    vi.stubGlobal("navigator", { clipboard: { writeText: "nope" } });
    render(wrap(ui(NETFLIX)));
    await user.click(screen.getByRole("button", { name: "Copy email for Netflix" }));
    expect(selectedText()).toBe(emailBlock().textContent);
    expect(calls).toEqual([COPY_FAILED_NOTICE, COPY_FAILED_NOTICE]);
  });

  it("ignores a missing selection API without throwing or logging", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("getSelection", undefined);
    const { calls, wrap } = recordingAnnounce();
    render(wrap(ui(NETFLIX)));
    await user.click(screen.getByRole("button", { name: "Copy email for Netflix" }));
    expect(calls).toEqual([COPY_FAILED_NOTICE]);
  });

  it("does not copy until the button is activated", () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(ui(NETFLIX));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("writes no state and logs nothing when unmounted while writeText is pending", async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => undefined;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    vi.stubGlobal("navigator", { clipboard: { writeText: () => pending } });
    const { calls, wrap } = recordingAnnounce();
    const view = render(wrap(ui(NETFLIX)));
    await user.click(screen.getByRole("button", { name: "Copy email for Netflix" }));
    view.unmount();
    await act(async () => {
      resolve();
      await pending;
    });
    expect(calls).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
