// Req 10.3: the normalizer loads and runs in Node with no browser globals.

import { describe, expect, it } from "vitest";
import {
  KNOWN_SERVICES,
  getKnownService,
  normalizeMerchant,
  normalizeTransactions,
} from "../index.js";

// Declared only so that `typeof` can look at the real globals without a lint or type error:
// these are the names that must NOT exist in the test environment.
declare const window: unknown;
declare const document: unknown;
declare const navigator: { userAgent?: string } | undefined;
declare const localStorage: unknown;

describe("the normalizer in the Node test environment (Req 10.3)", () => {
  it("runs with no window, document or localStorage, and no navigator except Node's own", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(typeof localStorage).toBe("undefined");
    // Node 21 and later define a `navigator` global of their own (userAgent "Node.js/<major>"), so
    // its absence cannot be a condition of the environment. If it exists, it must be that one:
    // no browser polyfill is loaded. The normalizer never reads it (no-network.test.ts, ESLint).
    if (typeof navigator !== "undefined") {
      expect(navigator?.userAgent).toMatch(/^Node\.js\//);
    }
  });

  it("calls every exported function without a ReferenceError", () => {
    const identity = normalizeMerchant("NETFLIX.COM 866-579-7172 CA");
    expect(identity.key).toBe("netflix");
    expect(identity.source).toBe("known");

    const [row] = normalizeTransactions([
      { date: "2026-01-02", description: "SPOTIFY AB", amountCents: 999, currency: "EUR" },
    ]);
    expect(row?.merchant.key).toBe("spotify");

    expect(KNOWN_SERVICES.length).toBe(59);
    expect(getKnownService("netflix")?.displayName).toBe("Netflix");
    expect(getKnownService("no-such-service")).toBeUndefined();
  });
});
