// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageAction, RisingStage } from "../page-state";
import { BURIAL_FALLBACK_MS } from "./motion";
import { useBurialFallback } from "./use-burial-fallback";

const burying = (id: string, phase: "condemned" | "sinking" | "closing"): RisingStage => ({
  kind: "burying",
  id,
  phase,
});

describe("useBurialFallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(initial: RisingStage | null) {
    const dispatch = vi.fn<(action: PageAction) => void>();
    const hook = renderHook(({ stage }) => useBurialFallback(stage, dispatch), {
      initialProps: { stage: initial },
    });
    return { dispatch, ...hook };
  }

  it("dispatches burial-finish(id) once at 2,000 ms and not at 1,999 ms", () => {
    const { dispatch } = setup(burying("netflix", "condemned"));
    vi.advanceTimersByTime(BURIAL_FALLBACK_MS - 1);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "burial-finish", id: "netflix" });
    vi.advanceTimersByTime(10_000);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("does not restart the timer when the phase changes within the same id", () => {
    const { dispatch, rerender } = setup(burying("netflix", "condemned"));
    vi.advanceTimersByTime(1000);
    rerender({ stage: burying("netflix", "sinking") });
    vi.advanceTimersByTime(500);
    rerender({ stage: burying("netflix", "closing") });
    vi.advanceTimersByTime(499);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "burial-finish", id: "netflix" });
  });

  it("is cleared when the stage becomes buried before 2 s", () => {
    const { dispatch, rerender } = setup(burying("netflix", "closing"));
    vi.advanceTimersByTime(1500);
    rerender({ stage: { kind: "buried", id: "netflix" } });
    vi.advanceTimersByTime(5000);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("is cleared when another id starts burying, and the new id gets its own 2 s", () => {
    const { dispatch, rerender } = setup(burying("netflix", "closing"));
    vi.advanceTimersByTime(1500);
    rerender({ stage: burying("hulu", "condemned") });
    vi.advanceTimersByTime(1999);
    expect(dispatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "burial-finish", id: "hulu" });
  });

  it("does nothing for other stages and clears on unmount", () => {
    const idle = setup({ kind: "ask" });
    vi.advanceTimersByTime(5000);
    expect(idle.dispatch).not.toHaveBeenCalled();

    const { dispatch, unmount } = setup(burying("netflix", "condemned"));
    unmount();
    vi.advanceTimersByTime(5000);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
