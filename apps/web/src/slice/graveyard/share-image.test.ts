import { describe, expect, it, vi } from "vitest";
import { SHARE_TITLE } from "../logic/share-card-text";
import {
  currentNavigator,
  isAbortError,
  shareImage,
  sharePathFor,
  type ShareNavigator,
} from "./share-image";

const FILE = new File([new Uint8Array([1, 2, 3])], "zombills-graveyard.png", {
  type: "image/png",
});

/** Lets the promise callbacks inside shareImage run. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("sharePathFor", () => {
  it("returns share when both members exist and canShare returns true", () => {
    const canShare = vi.fn(() => true);
    const nav: ShareNavigator = { share: vi.fn(), canShare };
    expect(sharePathFor(nav, FILE)).toBe("share");
    expect(canShare).toHaveBeenCalledWith({ files: [FILE] });
  });

  it("returns save when canShare returns false", () => {
    expect(sharePathFor({ share: vi.fn(), canShare: () => false }, FILE)).toBe("save");
  });

  it("returns save when canShare throws", () => {
    const nav: ShareNavigator = {
      share: vi.fn(),
      canShare: () => {
        throw new TypeError("nope");
      },
    };
    expect(sharePathFor(nav, FILE)).toBe("save");
  });

  it("returns save when canShare is missing", () => {
    expect(sharePathFor({ share: vi.fn() }, FILE)).toBe("save");
  });

  it("returns save when share is missing", () => {
    expect(sharePathFor({ canShare: () => true }, FILE)).toBe("save");
  });

  it("returns save when there is no navigator", () => {
    expect(sharePathFor(undefined, FILE)).toBe("save");
  });
});

describe("shareImage", () => {
  it("calls shared on resolve", async () => {
    const handlers = { shared: vi.fn(), failed: vi.fn() };
    shareImage({ share: () => Promise.resolve() }, FILE, handlers);
    await flush();
    expect(handlers.shared).toHaveBeenCalledTimes(1);
    expect(handlers.failed).not.toHaveBeenCalled();
  });

  it("calls neither handler on AbortError", async () => {
    const handlers = { shared: vi.fn(), failed: vi.fn() };
    shareImage({ share: () => Promise.reject(new DOMException("x", "AbortError")) }, FILE, handlers);
    await flush();
    expect(handlers.shared).not.toHaveBeenCalled();
    expect(handlers.failed).not.toHaveBeenCalled();
  });

  it("calls failed on NotAllowedError", async () => {
    const handlers = { shared: vi.fn(), failed: vi.fn() };
    shareImage(
      { share: () => Promise.reject(new DOMException("x", "NotAllowedError")) },
      FILE,
      handlers,
    );
    await flush();
    expect(handlers.failed).toHaveBeenCalledTimes(1);
    expect(handlers.shared).not.toHaveBeenCalled();
  });

  it("calls failed on a synchronous throw and does not throw itself", () => {
    const handlers = { shared: vi.fn(), failed: vi.fn() };
    const nav: ShareNavigator = {
      share: () => {
        throw new TypeError("gone");
      },
    };
    expect(() => shareImage(nav, FILE, handlers)).not.toThrow();
    expect(handlers.failed).toHaveBeenCalledTimes(1);
    expect(handlers.shared).not.toHaveBeenCalled();
  });

  it("calls failed when share is missing", () => {
    const handlers = { shared: vi.fn(), failed: vi.fn() };
    expect(() => shareImage({}, FILE, handlers)).not.toThrow();
    expect(handlers.failed).toHaveBeenCalledTimes(1);
  });

  it("calls share synchronously with files and title, through the navigator", () => {
    const calls: { self: unknown; data: unknown }[] = [];
    const nav: ShareNavigator = {
      share(this: unknown, data?: ShareData) {
        calls.push({ self: this, data });
        return Promise.resolve();
      },
    };
    shareImage(nav, FILE, { shared: vi.fn(), failed: vi.fn() });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.self).toBe(nav);
    expect(calls[0]?.data).toEqual({ files: [FILE], title: "My Zombills graveyard" });
    expect(SHARE_TITLE).toBe("My Zombills graveyard");
  });
});

describe("isAbortError", () => {
  it("accepts a DOMException named AbortError", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
  });

  it("accepts a plain object named AbortError", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("rejects null, a string and other names", () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(new DOMException("x", "NotAllowedError"))).toBe(false);
  });
});

describe("currentNavigator", () => {
  it("returns the global navigator when there is one", () => {
    expect(currentNavigator()).toBe(globalThis.navigator);
  });
});
