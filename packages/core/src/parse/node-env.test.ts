// Req 12.3: the parser loads and runs in Node with no browser polyfills.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStatement } from "../index.js";

// Declared only so that `typeof` can look at the real globals without a lint or type error:
// these are the names that must NOT exist in the test environment.
declare const window: unknown;
declare const document: unknown;

const samplesRoot = fileURLToPath(new URL("../../../../samples/", import.meta.url));

describe("the package entry in the Node test environment (Req 12.3)", () => {
  it("runs with no window and no document", () => {
    // Node 21 and later define a `navigator` global of their own, so its absence cannot be a
    // condition of the test environment. The parser never reads it: the scan in no-network.test.ts
    // and the ESLint rule both forbid the name.
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(typeof process.versions.node).toBe("string");
  });

  it("imports from the package entry and parses a small CSV without a ReferenceError", () => {
    const result = parseStatement("Date,Description,Amount\n2026-01-02,ACME,-5.00\n");
    expect(result.status).toBe("mapped");
    if (result.status === "mapped") {
      expect(result.transactions).toEqual([
        { date: "2026-01-02", description: "ACME", amountCents: 500, currency: "USD" },
      ]);
    }
  });

  it("exports only the public functions and data at runtime", async () => {
    const entry = await import("../index.js");
    expect(Object.keys(entry).sort()).toEqual([
      "KNOWN_SERVICES",
      "getKnownService",
      "parseStatement",
    ]);
  });

  it("runs every path of the pipeline on every sample without a ReferenceError", () => {
    const samples = readdirSync(samplesRoot).filter((name) => name.endsWith(".csv"));
    expect(samples.length).toBeGreaterThanOrEqual(4);
    for (const name of samples) {
      const csv = readFileSync(join(samplesRoot, name), "utf8");
      expect(() => parseStatement(csv), name).not.toThrow();
      expect(
        () => parseStatement(csv, { currency: "eur", signConvention: "negative-out" }),
        name,
      ).not.toThrow();
      expect(() => parseStatement(csv, { columnMap: { date: "x" } }), name).not.toThrow();
    }
  });
});
