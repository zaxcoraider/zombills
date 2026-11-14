// Req 12.4: the detector runs under Vitest's Node environment, with no browser globals
// other than Node's built-in `navigator`.

import { describe, expect, it } from "vitest";
import { detectSubscriptions } from "../index.js";
import type { NormalizedTransaction } from "../normalize/types.js";
import { charge } from "./test-fixtures.js";

const NETFLIX: NormalizedTransaction[] = [
  charge("2026-01-02", 1549, "netflix"),
  charge("2026-02-02", 1549, "netflix"),
  charge("2026-03-02", 1549, "netflix"),
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

describe("the detector under the Node environment (Req 12.4)", () => {
  it("has no browser globals", () => {
    expectNoBrowserGlobals();
  });

  it("imports detectSubscriptions from the package entry and runs it on a Netflix fixture", () => {
    expect(typeof detectSubscriptions).toBe("function");
    const result = detectSubscriptions(NETFLIX);
    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0]?.id).toBe("sub:USD:monthly:*:netflix");
    expect(result.usage).toHaveLength(3);
  });

  it("still has no browser globals after the call", () => {
    detectSubscriptions(NETFLIX);
    expectNoBrowserGlobals();
  });
});
