// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import type { Dispatch } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeGraveyard } from "../logic/graveyard-codec";
import type { AnswerRecord } from "../logic/graveyard";
import { EMPTY_GRAVEYARD } from "../logic/graveyard";
import type { PageAction, PageModel } from "../page-state";
import { initialPageModel } from "../page-state";
import { STORE_KEY, createGraveyardStore } from "./graveyard-store";
import { fakeStorage, fakeStoreTarget, storeLoadOf } from "./test-store";
import { useGraveyardMemory } from "./use-graveyard-memory";

const NETFLIX: AnswerRecord = {
  id: "sub:USD:monthly:*:netflix",
  merchant: "Netflix",
  serviceId: "netflix",
  currency: "USD",
  cadence: "monthly",
  currentAmountCents: 1799,
  answer: "not-using",
  cadenceAssumed: false,
  carriedOver: false,
  yearlySavingCents: 21588,
};
const SPOTIFY: AnswerRecord = {
  ...NETFLIX,
  id: "sub:USD:monthly:*:spotify",
  merchant: "Spotify",
  serviceId: "spotify",
  currentAmountCents: 1199,
  answer: "still-using",
  yearlySavingCents: 14388,
};

type Memory = PageModel["memory"];
type HookModel = Pick<PageModel, "memory" | "graveyard">;

function modelOf(on: boolean, graveyard: readonly AnswerRecord[], memory?: Partial<Memory>) {
  const base = initialPageModel({ kind: "empty" });
  return { memory: { ...base.memory, on, ...memory }, graveyard } satisfies HookModel;
}

function setup(options: { storage?: Parameters<typeof fakeStorage>[0]; text: string | null }) {
  const storage = fakeStorage(options.storage);
  const target = fakeStoreTarget(storage);
  const store = createGraveyardStore(target);
  const dispatch = vi.fn<Dispatch<PageAction>>();
  return { storage, target, store, dispatch, text: options.text };
}

function callsOf(storage: ReturnType<typeof fakeStorage>, method: string) {
  return storage.calls.filter((call) => call.method === method);
}

function strict({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

const spies = () =>
  (["error", "warn", "log"] as const).map((name) =>
    vi.spyOn(console, name).mockImplementation(() => {}),
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useGraveyardMemory", () => {
  it("writes once under StrictMode when the load's encoding differs from the raw text", () => {
    const logs = spies();
    const raw = JSON.stringify({ version: 1, records: [{ ...NETFLIX, extra: 1 }] });
    const { storage, store, dispatch } = setup({ text: raw });
    const model = modelOf(true, [NETFLIX], { restored: true });
    renderHook(() => useGraveyardMemory(model, store, raw, dispatch), { wrapper: strict });
    expect(callsOf(storage, "setItem")).toHaveLength(1);
    expect(callsOf(storage, "setItem")[0]?.args[0]).toBe(STORE_KEY);
    expect(dispatch.mock.calls).toEqual([
      [{ type: "store-written", leftOut: 0, reason: "load" }],
    ]);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it("writes nothing when the load equals its encoding", () => {
    const text = encodeGraveyard([NETFLIX, SPOTIFY]).text;
    const { storage, store, dispatch } = setup({ text });
    const model = modelOf(true, [NETFLIX, SPOTIFY]);
    renderHook(() => useGraveyardMemory(model, store, text, dispatch), { wrapper: strict });
    expect(storage.calls).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing on an empty start", () => {
    const { storage, store, dispatch } = setup({ text: null });
    const model = modelOf(false, EMPTY_GRAVEYARD);
    renderHook(() => useGraveyardMemory(model, store, null, dispatch), { wrapper: strict });
    expect(storage.calls).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches store-write-failed, then one removeItem and no store-remove-failed", () => {
    const { storage, store, dispatch } = setup({ storage: { throwOn: { set: true } }, text: null });
    let model: HookModel = modelOf(false, [NETFLIX]);
    const { rerender } = renderHook(() => useGraveyardMemory(model, store, null, dispatch));
    model = modelOf(true, [NETFLIX]);
    rerender();
    expect(callsOf(storage, "setItem")).toHaveLength(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "store-write-failed" });
    // The reducer's removal step: write-failed turns Memory off with a removal request.
    model = modelOf(false, [NETFLIX], { removal: { seq: 1, reason: "write-failed" } });
    rerender();
    expect(callsOf(storage, "removeItem")).toHaveLength(1);
    expect(dispatch.mock.calls.some(([a]) => a.type === "store-remove-failed")).toBe(false);
  });

  it("dispatches store-remove-failed for a failing removeItem after untick", () => {
    const text = encodeGraveyard([NETFLIX]).text;
    const { storage, store, dispatch } = setup({
      storage: { throwOn: { remove: true }, initial: { [STORE_KEY]: text } },
      text,
    });
    let model: HookModel = modelOf(true, [NETFLIX]);
    const { rerender } = renderHook(() => useGraveyardMemory(model, store, text, dispatch));
    model = modelOf(false, [NETFLIX], { removal: { seq: 1, reason: "untick" } });
    rerender();
    expect(callsOf(storage, "removeItem")).toHaveLength(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "store-remove-failed", reason: "untick" });
  });

  it("dispatches store-removed-elsewhere and then writes nothing while Memory is off", () => {
    const text = encodeGraveyard([NETFLIX]).text;
    const { storage, target, store, dispatch } = setup({ text });
    let model: HookModel = modelOf(true, [NETFLIX]);
    const { rerender } = renderHook(() => useGraveyardMemory(model, store, text, dispatch));
    act(() => target.dispatchRemoval(STORE_KEY, null));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "store-removed-elsewhere" });
    model = modelOf(false, [NETFLIX]);
    rerender();
    model = modelOf(false, [NETFLIX, SPOTIFY]);
    rerender();
    expect(callsOf(storage, "setItem")).toEqual([]);
    expect(callsOf(storage, "removeItem")).toEqual([]);
  });

  it("removes the storage listener on unmount", () => {
    const { target, store, dispatch } = setup({ text: null });
    const model = modelOf(false, EMPTY_GRAVEYARD);
    const { unmount } = renderHook(() => useGraveyardMemory(model, store, null, dispatch));
    expect(target.listenerCount()).toBe(1);
    unmount();
    expect(target.listenerCount()).toBe(0);
  });

  it("removes an unreadable store once, as the reducer asked", () => {
    const { storage, store, dispatch } = setup({
      storage: { initial: { [STORE_KEY]: "garbage" } },
      text: null,
    });
    const load = storeLoadOf("garbage");
    expect(load.result.kind).toBe("unreadable");
    const model = initialPageModel(load.result);
    renderHook(() => useGraveyardMemory(model, store, load.text, dispatch), { wrapper: strict });
    expect(callsOf(storage, "removeItem")).toHaveLength(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
