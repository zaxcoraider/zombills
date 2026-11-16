// Req 1.1: the public barrel exports exactly the Cancel module's eight values and ten types.

import { describe, expect, it } from "vitest";
import * as core from "../index.js";
import type {
  CancelDataIssue,
  CancelDataRule,
  CancelEntry,
  CancelHelp,
  CancelLinkKind,
  CancelRegion,
  CancellationEmail,
  EmailInput,
  EmailOnlyService,
  ValidateCancelOptions,
} from "../index.js";

// Naming the ten types here makes `npm run typecheck` fail if one leaves the barrel.
export type BarrelTypes = [
  CancelDataIssue,
  CancelDataRule,
  CancelEntry,
  CancelHelp,
  CancelLinkKind,
  CancelRegion,
  CancellationEmail,
  EmailInput,
  EmailOnlyService,
  ValidateCancelOptions,
];

describe("the Cancel module's public API (Req 1.1)", () => {
  it("exports the three constants", () => {
    expect(Array.isArray(core.CANCEL_ENTRIES)).toBe(true);
    expect(Array.isArray(core.EMAIL_ONLY_SERVICE_IDS)).toBe(true);
    expect(typeof core.APP_STORE_LINKS).toBe("object");
    expect(core.APP_STORE_LINKS).not.toBeNull();
  });

  it("exports the five functions", () => {
    expect(typeof core.getCancelHelp).toBe("function");
    expect(typeof core.statementRegion).toBe("function");
    expect(typeof core.cancellationEmail).toBe("function");
    expect(typeof core.mailtoHref).toBe("function");
    expect(typeof core.validateCancelDatabase).toBe("function");
  });

  it("keeps the internal lookup out of the barrel", () => {
    expect("lookupIn" in core).toBe(false);
  });
});
