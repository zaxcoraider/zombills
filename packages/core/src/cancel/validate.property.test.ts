import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { KNOWN_SERVICES } from "../normalize/known-services.js";
import { APP_STORE_LINKS, CANCEL_ENTRIES, EMAIL_ONLY_SERVICE_IDS } from "./cancel-data.js";
import type { CancelDataIssue, CancelEntry, EmailOnlyService } from "./types.js";
import { validateCancelDatabase } from "./validate.js";

const KNOWN_IDS = KNOWN_SERVICES.map((s) => s.serviceId);

const RULES = [
  "missing-service",
  "unknown-service",
  "duplicate-id",
  "listed-twice",
  "unsorted",
  "https-only",
  "url-form",
  "provider-domain",
  "domain-form",
  "tracking-param",
  "steps-count",
  "step-text",
  "region-key",
  "region-duplicate",
  "date-form",
  "field-type",
  "unverified",
];

const FIELD_RANKS: Readonly<Record<string, number>> = {
  entries: -1,
  emailOnly: -1,
  appStoreLinks: -1,
  apple: -1,
  google: -1,
  entry: 0,
  serviceId: 1,
  label: 2,
  providerDomains: 3,
  url: 4,
  kind: 5,
  regionalUrls: 6,
  steps: 7,
  appStoreMayApply: 8,
  reason: 9,
  lastChecked: 10,
};

/** [rank, text] of the part of a field after its name, as the documented sub-field order. */
function subField(field: string): readonly [number, string] {
  const bracket = /\[(\d+)\]$/.exec(field);
  if (bracket !== null) return [Number(bracket[1]), ""];
  if (field.startsWith("regionalUrls.")) {
    const key = field.slice("regionalUrls.".length);
    const at = ["US", "UK", "EU"].indexOf(key);
    return at === -1 ? [3, key] : [at, ""];
  }
  return [-1, ""];
}

function fieldName(field: string): string {
  const cut = field.search(/[[.]/);
  return cut === -1 ? field : field.slice(0, cut);
}

/** The documented key without list and index, which the output does not carry. */
function restKey(i: CancelDataIssue): readonly [number, number, string, number] {
  const [rank, text] = subField(i.field);
  return [FIELD_RANKS[fieldName(i.field)] ?? 99, rank, text, RULES.indexOf(i.rule)];
}

function compareRest(a: CancelDataIssue, b: CancelDataIssue): number {
  const x = restKey(a);
  const y = restKey(b);
  for (const k of [0, 1] as const) if (x[k] !== y[k]) return x[k] - y[k];
  if (x[2] !== y[2]) return x[2] < y[2] ? -1 : 1;
  return x[3] - y[3];
}

/**
 * In this test only entries or emailOnly (list 0 or 1) is bad. The real data is valid, so the only
 * other issues are `missing-service` ones (list 3, indexed by the Known ids).
 */
function listOf(issue: CancelDataIssue, badList: 0 | 1): number {
  return issue.rule === "missing-service" ? 3 : badList;
}

function isIssue(value: unknown): value is CancelDataIssue {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.serviceId === null || typeof v.serviceId === "string") &&
    typeof v.field === "string" &&
    typeof v.message === "string" &&
    typeof v.rule === "string" &&
    RULES.includes(v.rule)
  );
}

function checkOutput(issues: readonly CancelDataIssue[], badList: 0 | 1, badLength: number | null) {
  expect(Array.isArray(issues)).toBe(true);
  for (const issue of issues) expect(isIssue(issue)).toBe(true);
  const lists = issues.map((i) => listOf(i, badList));
  expect(lists).toEqual([...lists].sort((a, b) => a - b));
  for (const list of [badList, 3]) {
    const group = issues.filter((i) => listOf(i, badList) === list);
    if (list === 3) {
      const at = (i: CancelDataIssue) => KNOWN_IDS.indexOf(i.serviceId ?? "");
      expect(group.map(at)).toEqual(group.map(at).sort((a, b) => a - b));
    } else if (badLength !== null && badLength <= 1) {
      // One record (index 0) or none: the whole-list issue has index -1, so it comes first.
      const whole = group.filter(
        (i) => fieldName(i.field) === (badList === 0 ? "entries" : "emailOnly"),
      );
      const rest = group.filter((i) => !whole.includes(i));
      expect(group).toEqual([...whole, ...[...rest].sort(compareRest)]);
    }
  }
}

describe("validateCancelDatabase properties", () => {
  it("P8: total, typed, ordered and deterministic for any value in place of entries", () => {
    fc.assert(
      fc.property(fc.oneof(fc.anything(), fc.array(fc.anything(), { maxLength: 1 })), (entries) => {
        const run = () =>
          validateCancelDatabase(
            entries as unknown as readonly CancelEntry[],
            EMAIL_ONLY_SERVICE_IDS,
            KNOWN_IDS,
            APP_STORE_LINKS,
          );
        const first = run();
        checkOutput(first, 0, Array.isArray(entries) ? entries.length : -1);
        expect(run()).toEqual(first);
      }),
    );
  });

  it("P8: total, typed, ordered and deterministic for any value in place of emailOnly", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.anything(), fc.array(fc.anything(), { maxLength: 1 })),
        (emailOnly) => {
          const run = () =>
            validateCancelDatabase(
              CANCEL_ENTRIES,
              emailOnly as unknown as readonly EmailOnlyService[],
              KNOWN_IDS,
              APP_STORE_LINKS,
            );
          const first = run();
          checkOutput(first, 1, Array.isArray(emailOnly) ? emailOnly.length : -1);
          expect(run()).toEqual(first);
        },
      ),
    );
  });
});
