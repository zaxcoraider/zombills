// Req 7.5: the classifier runs under Vitest's Node environment, with no browser globals
// other than Node's built-in `navigator`.

import { describe, expect, it } from "vitest";
import { classifySubscriptions, detectSubscriptions } from "../index.js";
import type { NormalizedTransaction } from "../normalize/types.js";
import { charge } from "../detect/test-fixtures.js";

const NETFLIX: NormalizedTransaction[] = [
  charge("2026-01-02", 1549, "netflix"),
  charge("2026-02-02", 1549, "netflix"),
  charge("2026-03-02", 1799, "netflix"),
];

// The package has no DOM typings. These declarations only give `typeof` a name to look at.
declare const window: unknown;
declare const document: unknown;
declare const navigator: { userAgent: string } | undefined;
declare const localStorage: unknown;

function expectNoBrowserGlobals(): void {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
  expect(typeof localStorage).toBe("undefined");
  // Node 21+ defines a built-in `navigator` global (userAgent "Node.js/<major>"). It is not a
  // browser global, so accept it. Older Node versions leave it undefined. Anything else
  // (for example a jsdom navigator) is a real browser global and fails.
  if (typeof navigator !== "undefined") {
    expect(navigator.userAgent.startsWith("Node.js/")).toBe(true);
  }
}

describe("the classifier under the Node environment (Req 7.5)", () => {
  it("has no browser globals", () => {
    expectNoBrowserGlobals();
  });

  it("imports classifySubscriptions from the package entry and labels the detector's Netflix output", () => {
    expect(typeof classifySubscriptions).toBe("function");
    const { subscriptions } = detectSubscriptions(NETFLIX);
    const classified = classifySubscriptions(subscriptions);
    expect(classified).toHaveLength(1);
    expect(classified[0]?.labels).toEqual(["possessed"]);
  });

  it("still has no browser globals after the call", () => {
    classifySubscriptions(detectSubscriptions(NETFLIX).subscriptions);
    expectNoBrowserGlobals();
  });
});
