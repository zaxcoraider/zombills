import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pageModelArb } from "./logic/test-arbitraries";
import { isLandingView, pageReducer, shouldAskBeforeLeaving } from "./page-state";

describe("P1. Leave rule (Req 1.10)", () => {
  it("asks exactly on the results view, whatever the other fields hold", () => {
    fc.assert(
      fc.property(pageModelArb, pageModelArb, (m, other) => {
        expect(shouldAskBeforeLeaving(m)).toBe(m.view.kind === "results");
        const variants = [
          { ...m, screen: other.screen },
          { ...m, graveyard: other.graveyard },
          { ...m, memory: other.memory },
          { ...m, focus: other.focus },
          { ...m, event: other.event },
          {
            ...m,
            screen: other.screen,
            graveyard: other.graveyard,
            memory: other.memory,
            focus: other.focus,
            event: other.event,
          },
        ];
        for (const m2 of variants) {
          expect(shouldAskBeforeLeaving(m2)).toBe(shouldAskBeforeLeaving(m));
        }
      }),
    );
  });
});

describe("P2. Going home keeps the Graveyard (Req 1.11)", () => {
  it("lands on the Landing view with the Graveyard and Memory unchanged", () => {
    fc.assert(
      fc.property(pageModelArb, (m) => {
        const r = pageReducer(m, { type: "go-home" });
        if (isLandingView(m) || m.view.kind === "working") {
          expect(r).toBe(m);
          return;
        }
        expect(r.view).toEqual({ kind: "idle" });
        expect(r.screen).toBe("main");
        expect(r.focus?.target).toBe("primary-action");
        expect(r.focus?.seq).toBe((m.focus?.seq ?? 0) + 1);
        expect(r.graveyard).toEqual(m.graveyard);
        expect(r.memory).toEqual(m.memory);
      }),
    );
  });
});
