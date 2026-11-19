// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionGlobalConfig } from "framer-motion";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { formatMoney } from "../logic/money";
import { helperPanelMotion } from "./motion";
import { expectUniqueButtonNames } from "./test-a11y";
import {
  openGraveyardWithNetflix,
  openGraveyardWithNetflixAndSpotify,
  renderControl,
} from "./test-share";

vi.mock("./share-card-renderer", async () => ({
  renderShareCard: (await import("./test-share-render")).renderControl.render,
}));
vi.mock("./download-file", () => ({ downloadFile: vi.fn() }));

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => reduced.value };
});
vi.mock("./motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./motion")>();
  return { ...actual, helperPanelMotion: vi.fn(actual.helperPanelMotion) };
});

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("./share-panel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./share-panel")>();
  return {
    ...actual,
    SharePanel: (props: ComponentProps<typeof actual.SharePanel>) => {
      seen.props.push(props as unknown as Record<string, unknown>); // read-only key inspection
      return <actual.SharePanel {...props} />;
    },
  };
});

const NETFLIX_LINE = `I buried ${formatMoney(21588, "USD")} a year.`;
const BOTH_LINE = `I buried ${formatMoney(34776, "USD")} a year.`;
const FAILED = "Could not make the image in this browser.";

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  window.location.hash = "";
  reduced.value = false;
  seen.props.length = 0;
  renderControl.reset();
  vi.mocked(helperPanelMotion).mockClear();
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

const live = () => screen.getByRole("status");
const makeButton = (name: string) => screen.getByRole("button", { name });
const panel = () => screen.getByRole("region", { name: "Share your graveyard" });

async function settle(index: number, label: string) {
  await act(async () => {
    renderControl.resolveRender(index, renderControl.fakeResult(label));
  });
}

async function makeFirstImage() {
  fireEvent.click(makeButton("Make an image"));
  await settle(0, "one");
  await screen.findByRole("img");
}

describe("share panel: states", () => {
  it("sits after the tombstone list and before Resting, with the intro and Make an image", async () => {
    await openGraveyardWithNetflix();
    const region = panel();
    const list = screen.getByRole("region", { name: "Here lies Netflix." }).closest("ul");
    const resting = screen.getByRole("heading", { level: 3, name: "Resting" });
    expect(list).not.toBeNull();
    expect(
      (list as Element).compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(region.compareDocumentPosition(resting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(region).getByText(/^Make an image of your graveyard/)).toBeTruthy();
    expect(within(region).getByRole("button", { name: "Make an image" })).toBeTruthy();
    expect(renderControl.render).not.toHaveBeenCalled();
  });

  it("shows no panel with no Tombstone", async () => {
    await openGraveyardWithNetflix();
    fireEvent.click(screen.getByRole("button", { name: "Unbury Netflix" }));
    expect(screen.getByText("Nothing buried yet.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Share your graveyard" })).toBeNull();
  });

  it("keeps the same focused Make element while rendering and ignores a second click", async () => {
    await openGraveyardWithNetflix();
    const button = makeButton("Make an image");
    button.focus();
    fireEvent.click(button);
    expect(makeButton("Making the image…")).toBe(button);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(renderControl.render).toHaveBeenCalledTimes(1);
  });

  it("shows the Preview, announces it and leaves focus where it was", async () => {
    await openGraveyardWithNetflix();
    const button = makeButton("Make an image");
    button.focus();
    fireEvent.click(button);
    const result = renderControl.fakeResult("one");
    await act(async () => {
      renderControl.resolveRender(0, result);
    });
    const img = (await screen.findByRole("img")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(result.dataUrl);
    expect(img.getAttribute("width")).toBe("1080");
    expect(img.getAttribute("height")).toBe("1080");
    expect(img.getAttribute("alt")).toContain(NETFLIX_LINE);
    expect(img.getAttribute("alt")).toContain("1 subscription buried.");
    await waitFor(() => expect(live().textContent).toBe(`Image ready. ${img.getAttribute("alt")}`));
    expect(makeButton("Make the image again")).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it("drops a stale first render and renders again with the new content", async () => {
    await openGraveyardWithNetflixAndSpotify();
    fireEvent.click(makeButton("Make an image"));
    expect(renderControl.contentAt(0).totalLines).toEqual([BOTH_LINE]);
    fireEvent.click(screen.getByRole("button", { name: "Unbury Spotify" }));
    await settle(0, "stale");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Share image" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save image" })).toBeNull();
    expect(renderControl.render).toHaveBeenCalledTimes(2);
    expect(renderControl.contentAt(1).totalLines).toEqual([NETFLIX_LINE]);
    await settle(1, "fresh");
    const img = await screen.findByRole("img");
    expect(img.getAttribute("src")).toBe(renderControl.fakeResult("fresh").dataUrl);
    await waitFor(() => expect(live().textContent).toMatch(/^Image ready\. /));
    expect(live().textContent).toContain(NETFLIX_LINE);
  });

  it("keeps the old Preview busy while a changed graveyard renders again", async () => {
    const { downloadFile } = await import("./download-file");
    await openGraveyardWithNetflixAndSpotify();
    await makeFirstImage();
    fireEvent.click(screen.getByRole("button", { name: "Unbury Spotify" }));
    const old = screen.getByRole("img");
    expect(old.getAttribute("src")).toBe(renderControl.fakeResult("one").dataUrl);
    expect(old.parentElement?.getAttribute("aria-busy")).toBe("true");
    const main = screen.getByRole("button", { name: /^(Share|Save) image$/ });
    expect(main.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(main);
    expect(downloadFile).not.toHaveBeenCalled();
    expect(renderControl.render).toHaveBeenCalledTimes(2);
    await settle(1, "two");
    const next = await screen.findByRole("img");
    expect(next.getAttribute("src")).toBe(renderControl.fakeResult("two").dataUrl);
    expect(next.parentElement?.hasAttribute("aria-busy")).toBe(false);
    expect(main.getAttribute("aria-disabled")).toBeNull();
    await waitFor(() => expect(live().textContent).toBe("Image updated."));
  });

  it("starts a re-render when Spotify is buried after all", async () => {
    await openGraveyardWithNetflixAndSpotify();
    fireEvent.click(screen.getByRole("button", { name: "Unbury Spotify" }));
    await makeFirstImage();
    fireEvent.click(screen.getByRole("button", { name: "Bury after all Spotify" }));
    expect(renderControl.render).toHaveBeenCalledTimes(2);
    expect(renderControl.contentAt(1).totalLines).toEqual([BOTH_LINE]);
  });
});

describe("share panel: failure and focus", () => {
  it("shows and announces a failed render, with Make an image still usable", async () => {
    await openGraveyardWithNetflix();
    fireEvent.click(makeButton("Make an image"));
    await act(async () => {
      renderControl.rejectRender(0);
    });
    expect(within(panel()).getByText(FAILED)).toBeTruthy();
    await waitFor(() => expect(live().textContent).toBe(FAILED));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Share|Save) image$/ })).toBeNull();
    expect(makeButton("Make an image").getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(makeButton("Make an image"));
    expect(renderControl.render).toHaveBeenCalledTimes(2);
    expectUniqueButtonNames(document.body);
  });

  it("reads Make the image again after a failure that follows an earlier Image", async () => {
    await openGraveyardWithNetflixAndSpotify();
    await makeFirstImage();
    fireEvent.click(screen.getByRole("button", { name: "Unbury Spotify" }));
    await act(async () => {
      renderControl.rejectRender(1);
    });
    expect(within(panel()).getByText(FAILED)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(makeButton("Make the image again")).toBeTruthy();
  });

  it("moves focus to the Make button when the focused main button goes away", async () => {
    await openGraveyardWithNetflixAndSpotify();
    await makeFirstImage();
    fireEvent.click(screen.getByRole("button", { name: "Unbury Spotify" }));
    const item = screen.getByRole("button", { name: "Bury after all Spotify" }).closest("li");
    await waitFor(() => expect(document.activeElement).toBe(item));
    const main = screen.getByRole("button", { name: /^(Share|Save) image$/ });
    main.focus();
    expect(document.activeElement).toBe(main);
    await act(async () => {
      renderControl.rejectRender(1);
    });
    expect(document.activeElement).toBe(makeButton("Make the image again"));
  });

  it("leaves focus alone when the main button is not focused", async () => {
    await openGraveyardWithNetflixAndSpotify();
    await makeFirstImage();
    fireEvent.click(screen.getByRole("button", { name: "Unbury Spotify" }));
    const item = screen.getByRole("button", { name: "Bury after all Spotify" }).closest("li");
    await waitFor(() => expect(document.activeElement).toBe(item));
    await act(async () => {
      renderControl.rejectRender(1);
    });
    expect(document.activeElement).toBe(item);
  });
});

describe("share panel: names, order and unmount", () => {
  it("gives every button its visible text as its name, in each state", async () => {
    await openGraveyardWithNetflix();
    const check = () => {
      const buttons = within(panel()).getAllByRole("button");
      for (const button of buttons) {
        expect(button.hasAttribute("aria-label")).toBe(false);
        expect(button.hasAttribute("disabled")).toBe(false);
        expect(screen.getByRole("button", { name: button.textContent ?? "" })).toBe(button);
      }
      expectUniqueButtonNames(document.body);
    };
    check();
    fireEvent.click(makeButton("Make an image"));
    check();
    await settle(0, "one");
    await screen.findByRole("img");
    check();
    fireEvent.click(makeButton("Make the image again"));
    check();
    await act(async () => {
      renderControl.rejectRender(1);
    });
    check();
  });

  it("tabs from the Make button to the main button, with no positive tabindex", async () => {
    const user = userEvent.setup();
    await openGraveyardWithNetflix();
    await makeFirstImage();
    makeButton("Make the image again").focus();
    await user.tab();
    const active = document.activeElement as HTMLElement;
    expect(active.textContent).toMatch(/^(Share|Save) image$/);
    for (const element of panel().querySelectorAll("[tabindex]")) {
      expect(Number(element.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
    }
  });

  it("writes and announces nothing when a render settles after Start again", async () => {
    await openGraveyardWithNetflix();
    fireEvent.click(makeButton("Make an image"));
    fireEvent.click(screen.getByRole("button", { name: "Try another statement" }));
    fireEvent.click(screen.getByRole("button", { name: "Start again" }));
    expect(screen.queryByRole("region", { name: "Share your graveyard" })).toBeNull();
    const before = live().textContent;
    await settle(0, "late");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(live().textContent).toBe(before);
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("share panel: content, props and motion", () => {
  it("renders with exactly one argument, the Share content", async () => {
    await openGraveyardWithNetflix();
    fireEvent.click(makeButton("Make an image"));
    expect(renderControl.calls).toHaveLength(1);
    expect(renderControl.calls[0]).toHaveLength(1);
    expect(renderControl.calls[0]?.[0]).toEqual({
      totalLines: ["I buried " + formatMoney(21588, "USD") + " a year."],
      moreCurrencies: 0,
      countLine: "1 subscription buried.",
    });
  });

  it("receives only tombstones, savings and reduceMotion, with plain Answer records", async () => {
    await openGraveyardWithNetflixAndSpotify();
    expect(seen.props.length).toBeGreaterThan(0);
    for (const props of seen.props) {
      expect(Object.keys(props).sort()).toEqual(["reduceMotion", "savings", "tombstones"]);
      for (const record of props["tombstones"] as object[]) {
        expect(Object.keys(record).sort()).toEqual([
          "answer",
          "cadence",
          "cadenceAssumed",
          "carriedOver",
          "currency",
          "currentAmountCents",
          "id",
          "merchant",
          "serviceId",
          "yearlySavingCents",
        ]);
      }
    }
  });

  it("takes the Preview's motion from helperPanelMotion(true) under reduced motion", async () => {
    reduced.value = true;
    await openGraveyardWithNetflix();
    await makeFirstImage();
    const calls = vi.mocked(helperPanelMotion).mock.calls.map(([flag]) => flag);
    expect(calls).toContain(true);
    expect(calls).not.toContain(false);
  });
});

describe("share panel: button variants (Req 6.5)", () => {
  const primaries = () => panel().querySelectorAll('[data-variant="primary"]');

  it("makes Make an image the one primary before an image exists", async () => {
    await openGraveyardWithNetflix();
    expect(makeButton("Make an image").getAttribute("data-variant")).toBe("primary");
    expect(primaries().length).toBe(1);
  });

  it("makes the main button the one primary after an image, with Make the image again secondary", async () => {
    await openGraveyardWithNetflix();
    await makeFirstImage();
    const again = makeButton("Make the image again");
    const main = within(panel()).getByRole("button", { name: /^(Share|Save) image$/ });
    expect(again.getAttribute("data-variant")).toBe("secondary");
    expect(main.getAttribute("data-variant")).toBe("primary");
    expect(primaries().length).toBe(1);
    for (const button of [again, main]) expect(button.className).not.toContain("opacity-60");
  });
});
