// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STORE_LOAD, STORE_KEY, createGraveyardStore } from "./graveyard-store.ts";
import { fakeStorage, fakeStoreTarget, storeLoadOf } from "./test-store.ts";

const OK_TEXT = '{"version":1,"records":[]}';

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  consoleSpies = [
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  for (const spy of consoleSpies) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
});

describe("load", () => {
  it("gives EMPTY_STORE_LOAD when no key is stored", () => {
    const storage = fakeStorage();
    expect(createGraveyardStore(fakeStoreTarget(storage)).load()).toEqual(EMPTY_STORE_LOAD);
    expect(storage.calls).toEqual([{ method: "getItem", args: [STORE_KEY] }]);
  });

  it("gives the decoded result and, for ok, the raw text", () => {
    const storage = fakeStorage({ initial: { [STORE_KEY]: OK_TEXT } });
    const load = createGraveyardStore(fakeStoreTarget(storage)).load();
    expect(load).toEqual(storeLoadOf(OK_TEXT));
    expect(load.result.kind).toBe("ok");
    expect(load.text).toBe(OK_TEXT);
  });

  it("gives a null text for a result that is not ok", () => {
    const storage = fakeStorage({ initial: { [STORE_KEY]: "not json" } });
    const load = createGraveyardStore(fakeStoreTarget(storage)).load();
    expect(load.result.kind).toBe("unreadable");
    expect(load.text).toBeNull();
  });

  it("gives EMPTY_STORE_LOAD when the storage getter throws", () => {
    const storage = fakeStorage({ throwOn: { getter: true } });
    expect(createGraveyardStore(fakeStoreTarget(storage)).load()).toEqual(EMPTY_STORE_LOAD);
  });

  it("gives EMPTY_STORE_LOAD when getItem throws", () => {
    const storage = fakeStorage({ throwOn: { get: true } });
    expect(createGraveyardStore(fakeStoreTarget(storage)).load()).toEqual(EMPTY_STORE_LOAD);
  });
});

describe("write and remove", () => {
  it("write stores the text under STORE_KEY and returns true", () => {
    const storage = fakeStorage();
    expect(createGraveyardStore(fakeStoreTarget(storage)).write(OK_TEXT)).toBe(true);
    expect(storage.calls).toEqual([{ method: "setItem", args: [STORE_KEY, OK_TEXT] }]);
    expect(storage.peek(STORE_KEY)).toBe(OK_TEXT);
  });

  it("remove deletes STORE_KEY and returns true", () => {
    const storage = fakeStorage({ initial: { [STORE_KEY]: OK_TEXT } });
    expect(createGraveyardStore(fakeStoreTarget(storage)).remove()).toBe(true);
    expect(storage.calls).toEqual([{ method: "removeItem", args: [STORE_KEY] }]);
    expect(storage.peek(STORE_KEY)).toBeNull();
  });

  it("write returns false on QuotaExceededError", () => {
    const storage = fakeStorage({ throwOn: { set: true } });
    expect(createGraveyardStore(fakeStoreTarget(storage)).write(OK_TEXT)).toBe(false);
  });

  it("remove returns false on SecurityError", () => {
    const storage = fakeStorage({ throwOn: { remove: true } });
    expect(createGraveyardStore(fakeStoreTarget(storage)).remove()).toBe(false);
  });

  it("write and remove return false when the storage getter throws", () => {
    const store = createGraveyardStore(fakeStoreTarget(fakeStorage({ throwOn: { getter: true } })));
    expect(store.write(OK_TEXT)).toBe(false);
    expect(store.remove()).toBe(false);
  });

  it("fake failures are the DOMExceptions the spec names", () => {
    const set = fakeStorage({ throwOn: { set: true } });
    expect(() => set.setItem("k", "v")).toThrow(
      expect.objectContaining({ name: "QuotaExceededError" }),
    );
    const get = fakeStorage({ throwOn: { get: true } });
    expect(() => get.getItem("k")).toThrow(expect.objectContaining({ name: "SecurityError" }));
  });

  it("every call in the log uses STORE_KEY and none is clear", () => {
    const storage = fakeStorage();
    const store = createGraveyardStore(fakeStoreTarget(storage));
    store.load();
    store.write(OK_TEXT);
    store.remove();
    store.onRemovedElsewhere(() => undefined)();
    expect(storage.calls.map((call) => call.method)).toEqual(["getItem", "setItem", "removeItem"]);
    for (const call of storage.calls) expect(call.args[0]).toBe(STORE_KEY);
  });
});

describe("onRemovedElsewhere", () => {
  function setup() {
    const storage = fakeStorage();
    const target = fakeStoreTarget(storage);
    const listener = vi.fn();
    const unsubscribe = createGraveyardStore(target).onRemovedElsewhere(listener);
    return { storage, target, listener, unsubscribe };
  }

  it("calls the listener when STORE_KEY is removed", () => {
    const { target, listener } = setup();
    target.dispatchRemoval(STORE_KEY, null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("calls the listener when the whole storage is cleared (key null)", () => {
    const { target, listener } = setup();
    target.dispatchRemoval(null, null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores a new value for STORE_KEY and any other key", () => {
    const { target, listener } = setup();
    target.dispatchRemoval(STORE_KEY, "x");
    target.dispatchRemoval("other", null);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reads no storage", () => {
    const { storage, target, listener } = setup();
    target.dispatchRemoval(STORE_KEY, null);
    expect(listener).toHaveBeenCalled();
    expect(storage.calls).toEqual([]);
    expect(target.storageReads()).toBe(0);
  });

  it("registers one listener and the unsubscribe removes it", () => {
    const { target, listener, unsubscribe } = setup();
    expect(target.listenerCount()).toBe(1);
    unsubscribe();
    expect(target.listenerCount()).toBe(0);
    target.dispatchRemoval(STORE_KEY, null);
    expect(listener).not.toHaveBeenCalled();
  });

  it("reads events() only when called", () => {
    const events = vi.fn(() => window);
    const store = createGraveyardStore({ storage: () => window.localStorage, events });
    expect(events).not.toHaveBeenCalled();
    store.onRemovedElsewhere(() => undefined)();
    expect(events).toHaveBeenCalledTimes(1);
  });
});

describe("importing and creating", () => {
  it("reads neither window.localStorage nor window", async () => {
    const getter = vi.spyOn(window, "localStorage", "get");
    vi.resetModules();
    const fresh = await import("./graveyard-store.ts");
    expect(fresh.createGraveyardStore()).toBeDefined();
    expect(fresh.graveyardStore).toBeDefined();
    expect(getter).not.toHaveBeenCalled();
    getter.mockRestore();
  });

  it("the default store uses window.localStorage under STORE_KEY", () => {
    const store = createGraveyardStore();
    expect(store.write(OK_TEXT)).toBe(true);
    expect(window.localStorage.getItem(STORE_KEY)).toBe(OK_TEXT);
    expect(store.load().text).toBe(OK_TEXT);
    expect(store.remove()).toBe(true);
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull();
  });
});
