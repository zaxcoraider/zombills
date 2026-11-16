// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVOKE_AFTER_MS, downloadFile } from "./download-file";

const FILE = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });

let urlCount = 0;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;
let clicked: { href: string; download: string }[];
let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.useFakeTimers();
  urlCount = 0;
  clicked = [];
  createObjectURL = vi.fn(() => `blob:test/${++urlCount}`);
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download });
  });
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  // Runs the pending revoke timers so the module's liveUrl is null before the next test.
  vi.runAllTimers();
  vi.useRealTimers();
  for (const spy of consoleSpies) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
  clickSpy.mockRestore();
});

describe("downloadFile", () => {
  it("clicks an anchor with the object URL as href and the name as download", () => {
    downloadFile(FILE, "zombills-graveyard.png");
    expect(createObjectURL).toHaveBeenCalledWith(FILE);
    expect(clicked).toEqual([{ href: "blob:test/1", download: "zombills-graveyard.png" }]);
  });

  it("leaves no anchor in the body", () => {
    downloadFile(FILE, "x.png");
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("revokes the URL after REVOKE_AFTER_MS", () => {
    downloadFile(FILE, "x.png");
    vi.advanceTimersByTime(REVOKE_AFTER_MS - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });

  it("revokes the first URL before creating the second within the second", () => {
    downloadFile(FILE, "x.png");
    downloadFile(FILE, "x.png");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
    expect(revokeObjectURL.mock.invocationCallOrder[0]).toBeLessThan(
      createObjectURL.mock.invocationCallOrder[1] ?? 0,
    );
  });

  it("leaves both URLs revoked after two calls and the timers", () => {
    downloadFile(FILE, "x.png");
    downloadFile(FILE, "x.png");
    vi.advanceTimersByTime(REVOKE_AFTER_MS + 1);
    const revoked = revokeObjectURL.mock.calls.map((call) => call[0]);
    expect(revoked).toContain("blob:test/1");
    expect(revoked).toContain("blob:test/2");
  });

  it("does not revoke a later call's URL early or twice for the second", () => {
    downloadFile(FILE, "x.png");
    vi.advanceTimersByTime(REVOKE_AFTER_MS / 2);
    downloadFile(FILE, "x.png");
    vi.advanceTimersByTime(REVOKE_AFTER_MS / 2);
    // First timer fired; the second URL is still live.
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:test/2");
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test/2");
  });

  it("removes the anchor even when click throws", () => {
    clickSpy.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => downloadFile(FILE, "x.png")).toThrow("blocked");
    expect(document.body.querySelector("a")).toBeNull();
  });
});
