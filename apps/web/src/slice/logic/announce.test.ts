import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Subscription } from "@zombills/core";
import type { NoSubscriptionsOutcome, ResultsOutcome } from "./analyze-statement";
import { announcement } from "./announce";
import { errorMessage } from "./messages";
import { formatMoney } from "./money";
import { subscriptionArb } from "./test-arbitraries";
import type { PageView } from "../page-state";

const STATEMENT = {
  firstDate: "2026-01-02",
  lastDate: "2026-03-25",
  asOf: "2026-03-25",
  asOfSource: "statement" as const,
  currencies: ["USD"],
};

const FACTS = {
  transactionCount: 18,
  rowErrorCount: 0,
  statement: STATEMENT,
  detectedCurrency: { code: "USD", source: "symbol" as const },
  detectedDateFormat: null,
  detectedSignConvention: null,
};

function sub(index: number): Subscription {
  const [base] = fc.sample(subscriptionArb, { seed: 1, numRuns: 1 });
  if (!base) throw new Error("no sample");
  return { ...base, id: `id-${index}` };
}

function results(
  count: number,
  totals: ResultsOutcome["totals"],
): PageView & { kind: "results" } {
  return {
    kind: "results",
    sourceName: "statement.csv",
    outcome: {
      kind: "results",
      ...FACTS,
      subscriptions: Array.from({ length: count }, (_, i) => sub(i)),
      totals,
    },
  };
}

describe("announcement", () => {
  it("is empty when idle", () => {
    expect(announcement({ kind: "idle" })).toBe("");
  });

  it("names the source while working", () => {
    expect(announcement({ kind: "working", sourceName: "march.csv" })).toBe("Reading march.csv…");
  });

  it("announces the count and the yearly total, built with formatMoney", () => {
    const view = results(4, [{ currency: "USD", totalCents: 135564 }]);
    expect(announcement(view)).toBe(
      `Found 4 recurring charges. Yearly total in USD: ${formatMoney(135564, "USD")}.`,
    );
    expect(announcement(view)).toBe("Found 4 recurring charges. Yearly total in USD: $1,355.64.");
  });

  it("uses the singular for one recurring charge", () => {
    const view = results(1, [{ currency: "USD", totalCents: 1000 }]);
    expect(announcement(view)).toBe(
      `Found 1 recurring charge. Yearly total in USD: ${formatMoney(1000, "USD")}.`,
    );
  });

  it("uses the plural for four recurring charges", () => {
    expect(announcement(results(4, [{ currency: "USD", totalCents: 1000 }]))).toContain(
      "Found 4 recurring charges.",
    );
  });

  it("gives one total sentence per currency total", () => {
    const view = results(2, [
      { currency: "USD", totalCents: 135564 },
      { currency: "EUR", totalCents: 9900 },
    ]);
    expect(announcement(view)).toBe(
      `Found 2 recurring charges. Yearly total in USD: ${formatMoney(135564, "USD")}. ` +
        `Yearly total in EUR: ${formatMoney(9900, "EUR")}.`,
    );
  });

  it("formats money with the given locale", () => {
    const view = results(2, [{ currency: "EUR", totalCents: 135564 }]);
    expect(announcement(view, "de-DE")).toBe(
      `Found 2 recurring charges. Yearly total in EUR: ${formatMoney(135564, "EUR", "de-DE")}.`,
    );
    expect(announcement(view, "de-DE")).not.toBe(announcement(view, "en-US"));
  });

  it("says no recurring charges were found", () => {
    const outcome: NoSubscriptionsOutcome = { kind: "no-subscriptions", ...FACTS };
    expect(announcement({ kind: "no-subscriptions", sourceName: "a.csv", outcome })).toBe(
      "No recurring charges found.",
    );
  });

  it("announces the summary of the error message", () => {
    const error = { kind: "too-large" } as const;
    expect(announcement({ kind: "error", sourceName: null, error })).toBe(
      errorMessage(error).summary,
    );
  });
});
