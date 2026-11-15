import { afterEach, describe, expect, it, vi } from "vitest";
import { nextFrame, nextTask } from "./frame";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("nextFrame", () => {
  it("resolves only after the requestAnimationFrame callback runs", async () => {
    let callback: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    });
    let resolved = false;
    const promise = nextFrame().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(callback).toBeDefined();
    expect(resolved).toBe(false);
    callback?.(0);
    await promise;
    expect(resolved).toBe(true);
  });
});

describe("nextTask", () => {
  it("resolves only after fake timers advance", async () => {
    vi.useFakeTimers();
    let resolved = false;
    const promise = nextTask().then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await promise;
    expect(resolved).toBe(true);
  });
});
