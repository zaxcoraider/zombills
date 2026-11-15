import { describe, expect, it, vi } from "vitest";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { GENERIC_FAILURE_REASON, analyzeStatement } from "./analyze-statement";

// Own file: vi.mock is hoisted and applies to every test in the file.
vi.mock("@zombills/core", async () => {
  const actual = await vi.importActual<typeof import("@zombills/core")>("@zombills/core");
  return {
    ...actual,
    detectSubscriptions: () => {
      throw new Error("boom: Netflix 17.99");
    },
  };
});

describe("analyzeStatement when the Pipeline throws", () => {
  it("returns the generic parse-error and none of the input", () => {
    const outcome = analyzeStatement(usSigned);
    expect(outcome).toEqual({ kind: "parse-error", reason: GENERIC_FAILURE_REASON });
    if (outcome.kind !== "parse-error") throw new Error("expected parse-error");
    expect(outcome.reason).not.toContain("Netflix");
    expect(outcome.reason).not.toContain("17.99");
    expect(outcome.reason).not.toContain("boom");
  });
});
