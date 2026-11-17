// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerRecord } from "../logic/graveyard";
import { DOWNLOAD_STARTED, IMAGE_SHARED, SAVE_FAILED, SHARE_FAILED } from "../logic/share-card-text";
import type { RenderedShareCard } from "./share-card-renderer";
import { downloadFile } from "./download-file";
import { SharePanel } from "./share-panel";
import { expectUniqueButtonNames } from "./test-a11y";
import { openGraveyardWithNetflix, renderControl } from "./test-share";
import { AnnounceContext } from "./use-announce";

vi.mock("./share-card-renderer", async () => ({
  renderShareCard: (await import("./test-share-render")).renderControl.render,
}));
vi.mock("./download-file", () => ({ downloadFile: vi.fn() }));

const FILE_NAME = "zombills-graveyard.png";
const SHARE_TITLE = "My Zombills graveyard";

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  window.location.hash = "";
  renderControl.reset();
  vi.mocked(downloadFile).mockReset();
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
  ];
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window.navigator, "share");
  Reflect.deleteProperty(window.navigator, "canShare");
  for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function setNavigator(name: "share" | "canShare", value: unknown) {
  Object.defineProperty(window.navigator, name, { configurable: true, value });
}

const live = () => screen.getByRole("status");
/** The visible line inside the panel; the Live region holds the same words, so it is left out. */
const panelText = (text: string) =>
  within(screen.getByRole("region", { name: "Share your graveyard" })).queryByText(text);

/** Records every text the Live region takes, so "nothing announced" and "emptied between" can be checked. */
function watchLive(): { texts: string[]; stop(): void } {
  const texts: string[] = [];
  const observer = new MutationObserver(() => texts.push(live().textContent ?? ""));
  observer.observe(live(), { childList: true, characterData: true, subtree: true });
  return { texts, stop: () => observer.disconnect() };
}

/** Opens the graveyard, makes the first Image and returns the result and the main button. */
async function showImage(): Promise<{ result: RenderedShareCard; main: HTMLElement }> {
  await openGraveyardWithNetflix();
  fireEvent.click(screen.getByRole("button", { name: "Make an image" }));
  const result = renderControl.fakeResult("one");
  await act(async () => {
    renderControl.resolveRender(0, result);
  });
  await screen.findByRole("img");
  await waitFor(() => expect(live().textContent).toMatch(/^Image ready\. /));
  const main = screen.getByRole("button", { name: /^(Share|Save) image$/ });
  return { result, main };
}

function fullShare(share: (data: ShareData) => Promise<void> | void) {
  setNavigator("share", vi.fn(share));
  setNavigator("canShare", vi.fn(() => true));
}

describe("share panel: Share path", () => {
  it("shares the Image file with only files and title, in the click itself, and announces it", async () => {
    fullShare(() => Promise.resolve());
    const { result, main } = await showImage();
    expect(main.textContent).toBe("Share image");
    fireEvent.click(main);
    const share = vi.mocked(window.navigator.share);
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]?.[0] as ShareData;
    expect(Object.keys(data).sort()).toEqual(["files", "title"]);
    expect(data.title).toBe(SHARE_TITLE);
    expect(data.files).toHaveLength(1);
    expect(data.files?.[0]).toBe(result.file);
    await waitFor(() => expect(live().textContent).toBe(IMAGE_SHARED));
    expect(downloadFile).not.toHaveBeenCalled();
    expect(panelText(SHARE_FAILED)).toBeNull();
  });

  it("does nothing after an AbortError: focus stays and nothing is announced or downloaded", async () => {
    fullShare(() => Promise.reject(new DOMException("closed", "AbortError")));
    const { main } = await showImage();
    main.focus();
    const watcher = watchLive();
    fireEvent.click(main);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    watcher.stop();
    expect(watcher.texts).toEqual([]);
    expect(downloadFile).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(main);
    expect(panelText(SHARE_FAILED)).toBeNull();
    expect(live().textContent).toMatch(/^Image ready\. /);
  });

  it("downloads and shows and announces the failure after a NotAllowedError", async () => {
    fullShare(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    const { result, main } = await showImage();
    fireEvent.click(main);
    await waitFor(() => expect(live().textContent).toBe(SHARE_FAILED));
    expect(panelText(SHARE_FAILED)?.tagName).toBe("P");
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadFile).mock.calls[0]?.[0]).toBe(result.file);
    expect(vi.mocked(downloadFile).mock.calls[0]?.[1]).toBe(FILE_NAME);
  });

  it("falls back to a download when share throws synchronously", async () => {
    fullShare(() => {
      throw new TypeError("share is gone");
    });
    const { main } = await showImage();
    fireEvent.click(main);
    await waitFor(() => expect(live().textContent).toBe(SHARE_FAILED));
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it("gives SAVE_FAILED instead of SHARE_FAILED when the fallback download throws", async () => {
    fullShare(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    vi.mocked(downloadFile).mockImplementation(() => {
      throw new Error("blocked");
    });
    const { main } = await showImage();
    fireEvent.click(main);
    await waitFor(() => expect(live().textContent).toBe(SAVE_FAILED));
    expect(panelText(SAVE_FAILED)).not.toBeNull();
    expect(panelText(SHARE_FAILED)).toBeNull();
  });

  it("clears the failure line at the start of the next activation", async () => {
    fullShare(() => Promise.reject(new DOMException("blocked", "NotAllowedError")));
    const { main } = await showImage();
    fireEvent.click(main);
    await waitFor(() => expect(panelText(SHARE_FAILED)).not.toBeNull());
    setNavigator("share", vi.fn(() => new Promise<void>(() => undefined)));
    fireEvent.click(main);
    expect(panelText(SHARE_FAILED)).toBeNull();
  });
});

describe("share panel: Save path", () => {
  async function expectSave(): Promise<void> {
    const { result, main } = await showImage();
    expect(main.textContent).toBe("Save image");
    fireEvent.click(main);
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadFile).mock.calls[0]?.[0]).toBe(result.file);
    expect(vi.mocked(downloadFile).mock.calls[0]?.[1]).toBe(FILE_NAME);
  }

  it("saves when navigator.share exists but canShare is missing", async () => {
    setNavigator("share", vi.fn());
    await expectSave();
    await waitFor(() => expect(live().textContent).toBe(DOWNLOAD_STARTED));
    expect(vi.mocked(window.navigator.share)).not.toHaveBeenCalled();
  });

  it("saves when canShare returns false", async () => {
    setNavigator("share", vi.fn());
    setNavigator("canShare", vi.fn(() => false));
    await expectSave();
    expect(vi.mocked(window.navigator.share)).not.toHaveBeenCalled();
  });

  it("saves when canShare throws", async () => {
    setNavigator("share", vi.fn());
    setNavigator("canShare", () => {
      throw new TypeError("no files");
    });
    await expectSave();
  });

  it("saves when neither is present and announces the download", async () => {
    await expectSave();
    await waitFor(() => expect(live().textContent).toBe(DOWNLOAD_STARTED));
    expectUniqueButtonNames(document.body);
  });

  it("announces twice for two clicks, with the region emptied between them", async () => {
    const { main } = await showImage();
    const watcher = watchLive();
    fireEvent.click(main);
    await waitFor(() => expect(live().textContent).toBe(DOWNLOAD_STARTED));
    fireEvent.click(main);
    await waitFor(() => expect(watcher.texts.filter((t) => t === DOWNLOAD_STARTED)).toHaveLength(2));
    watcher.stop();
    const first = watcher.texts.indexOf(DOWNLOAD_STARTED);
    const last = watcher.texts.lastIndexOf(DOWNLOAD_STARTED);
    expect(watcher.texts.slice(first + 1, last)).toContain("");
    expect(downloadFile).toHaveBeenCalledTimes(2);
  });

  it("shows and announces SAVE_FAILED when downloadFile throws, and not DOWNLOAD_STARTED", async () => {
    vi.mocked(downloadFile).mockImplementation(() => {
      throw new Error("blocked");
    });
    const { main } = await showImage();
    const watcher = watchLive();
    fireEvent.click(main);
    await waitFor(() => expect(live().textContent).toBe(SAVE_FAILED));
    watcher.stop();
    expect(panelText(SAVE_FAILED)?.tagName).toBe("P");
    expect(watcher.texts).not.toContain(DOWNLOAD_STARTED);
  });

  it("clears SAVE_FAILED when the next activation succeeds", async () => {
    vi.mocked(downloadFile).mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    const { main } = await showImage();
    fireEvent.click(main);
    await waitFor(() => expect(panelText(SAVE_FAILED)).not.toBeNull());
    fireEvent.click(main);
    expect(panelText(SAVE_FAILED)).toBeNull();
    await waitFor(() => expect(live().textContent).toBe(DOWNLOAD_STARTED));
  });
});

describe("share panel: downloadFile prop", () => {
  it("uses the prop instead of the default and announces through the context", async () => {
    const announce = vi.fn();
    const prop = vi.fn();
    const tombstone: AnswerRecord = {
      id: "sub:USD:monthly:1799:netflix",
      merchant: "Netflix",
      serviceId: "netflix",
      currency: "USD",
      cadence: "monthly",
      currentAmountCents: 1799,
      answer: "not-using",
      cadenceAssumed: false,
      yearlySavingCents: 21588,
      carriedOver: false,
    };
    render(
      <AnnounceContext.Provider value={{ announce }}>
        <SharePanel
          tombstones={[tombstone]}
          savings={[{ currency: "USD", totalCents: 21588 }]}
          reduceMotion={false}
          downloadFile={prop}
        />
      </AnnounceContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Make an image" }));
    const result = renderControl.fakeResult("one");
    await act(async () => {
      renderControl.resolveRender(0, result);
    });
    const main = await screen.findByRole("button", { name: "Save image" });
    fireEvent.click(main);
    expect(prop).toHaveBeenCalledTimes(1);
    expect(prop).toHaveBeenCalledWith(result.file, FILE_NAME);
    expect(downloadFile).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(DOWNLOAD_STARTED);
  });
});
