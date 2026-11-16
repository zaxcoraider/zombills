import { describe, expect, it } from "vitest";
import { KNOWN_SERVICES } from "../normalize/known-services.js";
import { APP_STORE_LINKS, CANCEL_ENTRIES, EMAIL_ONLY_SERVICE_IDS } from "./cancel-data.js";
import { validateCancelDatabase } from "./validate.js";

/** Last Known id written so far. Batch 5 deletes this constant and the filter below. */
const WRITTEN_THROUGH = "crunchyroll";
const pending = (id: string) => id > WRITTEN_THROUGH;

const KNOWN_IDS = KNOWN_SERVICES.map((s) => s.serviceId);

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeepFrozen);
}

describe("cancel data", () => {
  it("breaks no rule except the ids of batches not yet written", () => {
    const issues = validateCancelDatabase(
      CANCEL_ENTRIES,
      EMAIL_ONLY_SERVICE_IDS,
      KNOWN_IDS,
      APP_STORE_LINKS,
    );
    const expected = KNOWN_IDS.filter(pending).map((id) => ({
      serviceId: id,
      rule: "missing-service",
    }));
    const actual = issues.map((i) => ({ serviceId: i.serviceId, rule: i.rule }));
    expect(actual, issues.map((i) => i.message).join("\n")).toEqual(expected);
  });

  it("holds a date no later than tomorrow (UTC) in every non-null lastChecked", () => {
    const limit = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dates = [...CANCEL_ENTRIES, ...EMAIL_ONLY_SERVICE_IDS]
      .map((r) => r.lastChecked)
      .filter((d): d is string => d !== null);
    for (const date of dates) expect(date <= limit).toBe(true);
  });

  it("freezes every object, array and record", () => {
    expect(isDeepFrozen(CANCEL_ENTRIES)).toBe(true);
    expect(isDeepFrozen(EMAIL_ONLY_SERVICE_IDS)).toBe(true);
    expect(isDeepFrozen(APP_STORE_LINKS)).toBe(true);
  });

  it("sorts both arrays by serviceId in code-unit order", () => {
    for (const list of [CANCEL_ENTRIES, EMAIL_ONLY_SERVICE_IDS]) {
      const ids = list.map((r) => r.serviceId);
      expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
  });

  it("labels the two App-store links", () => {
    expect(APP_STORE_LINKS.apple.label).toBe("Apple subscriptions");
    expect(APP_STORE_LINKS.google.label).toBe("Google Play subscriptions");
  });
});
