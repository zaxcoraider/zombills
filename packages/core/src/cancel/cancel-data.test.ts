import { describe, expect, it } from "vitest";
import { KNOWN_SERVICES } from "../normalize/known-services.js";
import { APP_STORE_LINKS, CANCEL_ENTRIES, EMAIL_ONLY_SERVICE_IDS } from "./cancel-data.js";
import { validateCancelDatabase } from "./validate.js";

const KNOWN_IDS = KNOWN_SERVICES.map((s) => s.serviceId);

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeepFrozen);
}

describe("cancel data", () => {
  it("breaks no rule in the real data", () => {
    const issues = validateCancelDatabase(
      CANCEL_ENTRIES,
      EMAIL_ONLY_SERVICE_IDS,
      KNOWN_IDS,
      APP_STORE_LINKS,
    );
    expect(issues, issues.map((i) => i.message).join("\n")).toEqual([]);
  });

  // Req 5.6, 6.12. These nine ids could not be opened from the checker's network (US-only
  // geo-block or bot wall), so they keep lastChecked null by the user's decision. The reason for
  // each is in .kiro/specs/cancel-helper/link-verification-2026-11-16.md.
  it("leaves only the nine named unverifiable ids unverified", () => {
    const issues = validateCancelDatabase(
      CANCEL_ENTRIES,
      EMAIL_ONLY_SERVICE_IDS,
      KNOWN_IDS,
      APP_STORE_LINKS,
      { requireVerified: true },
    );
    expect(issues.every((i) => i.rule === "unverified")).toBe(true);
    expect(issues.map((i) => i.serviceId)).toEqual([
      "audible",
      "disney-plus",
      "ea-play",
      "hellofresh",
      "hulu",
      "max",
      "peacock",
      "peloton",
      "wall-street-journal",
    ]);
  });

  it("lists each of the 59 Known ids exactly once across the two lists", () => {
    expect(KNOWN_IDS).toHaveLength(59);
    const listed = [...CANCEL_ENTRIES, ...EMAIL_ONLY_SERVICE_IDS].map((r) => r.serviceId);
    expect([...listed].sort()).toEqual([...KNOWN_IDS].sort());
    expect(new Set(listed).size).toBe(listed.length);
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
