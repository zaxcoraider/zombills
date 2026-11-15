// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FocusRequest } from "../page-state";
import { FocusRequestContext, focusAndReveal, useFocusRequest } from "./use-focus-request";

function Target({ focusKey, label }: { focusKey: string; label: string }) {
  const ref = useFocusRequest(focusKey);
  return (
    <h3 ref={ref} tabIndex={-1}>
      {label}
    </h3>
  );
}

/** Like SlicePage: `handled` lives in a ref that outlives the targets. */
function Provider({
  focus,
  handled,
  children,
}: {
  focus: FocusRequest | null;
  handled: { current: number };
  children: ReactNode;
}) {
  const claimRef = useRef((seq: number) => {
    if (seq <= handled.current) return false;
    handled.current = seq;
    return true;
  });
  return (
    <FocusRequestContext.Provider value={{ focus, claim: claimRef.current }}>
      {children}
    </FocusRequestContext.Provider>
  );
}

function request(target: FocusRequest["target"], id: string | null, seq: number): FocusRequest {
  return { target, id, seq };
}

describe("useFocusRequest", () => {
  afterEach(cleanup);

  it("sets data-focus and focuses on mount when the request names the key", () => {
    const handled = { current: 0 };
    render(
      <Provider focus={request("state-heading", null, 1)} handled={handled}>
        <Target focusKey="state-heading" label="Oops" />
      </Provider>,
    );
    const heading = screen.getByRole("heading", { name: "Oops" });
    expect(heading.dataset.focus).toBe("state-heading");
    expect(document.activeElement).toBe(heading);
  });

  it("does not focus for another key", () => {
    const handled = { current: 0 };
    render(
      <Provider focus={request("state-heading", null, 1)} handled={handled}>
        <Target focusKey="card-heading:a" label="Other" />
      </Provider>,
    );
    expect(document.activeElement).toBe(document.body);
    expect(handled.current).toBe(0);
  });

  it("claims a request for an element that mounts after the request", () => {
    const handled = { current: 0 };
    const focus = request("outcome", "a", 1);
    const { rerender } = render(
      <Provider focus={focus} handled={handled}>
        <p>waiting</p>
      </Provider>,
    );
    expect(document.activeElement).toBe(document.body);
    rerender(
      <Provider focus={focus} handled={handled}>
        <Target focusKey="outcome:a" label="Kept" />
      </Provider>,
    );
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Kept" }));
  });

  it("does not refocus a remount with the same seq", () => {
    const handled = { current: 0 };
    const focus = request("outcome", "a", 1);
    const { rerender } = render(
      <Provider focus={focus} handled={handled}>
        <Target focusKey="outcome:a" label="First" />
      </Provider>,
    );
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "First" }));
    (document.activeElement as HTMLElement).blur();
    rerender(
      <Provider focus={focus} handled={handled}>
        <Target key="again" focusKey="outcome:a" label="Second" />
      </Provider>,
    );
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses again for a new seq with the same key", () => {
    const handled = { current: 0 };
    const { rerender } = render(
      <Provider focus={request("card-heading", "a", 1)} handled={handled}>
        <Target focusKey="card-heading:a" label="Card" />
      </Provider>,
    );
    const heading = screen.getByRole("heading", { name: "Card" });
    heading.blur();
    expect(document.activeElement).toBe(document.body);
    rerender(
      <Provider focus={request("card-heading", "a", 2)} handled={handled}>
        <Target focusKey="card-heading:a" label="Card" />
      </Provider>,
    );
    expect(document.activeElement).toBe(heading);
  });

  it.each(["has space", "a:b", "a/b", "*", "x y:/*"])("works with the id %j", (id) => {
    const handled = { current: 0 };
    render(
      <Provider focus={request("tombstone", id, 1)} handled={handled}>
        <Target focusKey={`tombstone:${id}`} label="Stone" />
      </Provider>,
    );
    const heading = screen.getByRole("heading", { name: "Stone" });
    expect(heading.dataset.focus).toBe(`tombstone:${id}`);
    expect(document.activeElement).toBe(heading);
  });
});

describe("focusAndReveal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mount() {
    const stage = document.createElement("div");
    stage.setAttribute("data-burial-stage", "");
    const heading = document.createElement("h3");
    heading.tabIndex = -1;
    stage.append(heading);
    document.body.append(stage);
    const stageScroll = vi.fn();
    const headingScroll = vi.fn();
    stage.scrollIntoView = stageScroll;
    heading.scrollIntoView = headingScroll;
    const focus = vi.spyOn(heading, "focus");
    return { stage, heading, stageScroll, headingScroll, focus };
  }

  it("focuses without the browser scroll and scrolls the whole stage to its top", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { heading, stageScroll, headingScroll, focus } = mount();
    focusAndReveal(heading);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(headingScroll).not.toHaveBeenCalled();
    expect(stageScroll).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  });

  it("does not scroll smoothly under reduced motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { heading, stageScroll } = mount();
    focusAndReveal(heading);
    expect(stageScroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("scrolls an element outside a stage into view only as far as needed", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const heading = document.createElement("h2");
    heading.tabIndex = -1;
    document.body.append(heading);
    const scroll = vi.fn();
    heading.scrollIntoView = scroll;
    focusAndReveal(heading);
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "nearest" }));
  });
});
