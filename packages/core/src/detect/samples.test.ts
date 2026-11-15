import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeTransactions } from "../normalize/index.js";
import { parseStatement } from "../parse/index.js";
import { detectSubscriptions } from "./detect-subscriptions.js";
import type { DetectionResult, PricePoint, TransactionRole } from "./types.js";

// Req 10.1 and 10.2: the four sample statements, end to end, against the requirement tables.
// The files in samples/ are never edited to make this pass.

const SAMPLES = fileURLToPath(new URL("../../../../samples/", import.meta.url));

interface ExpectedSubscription {
  merchantKey: string;
  merchant: string;
  currentAmountCents: number;
  yearlyCostCents: number;
  priceHistory: PricePoint[];
}

interface ExpectedSample {
  file: string;
  currency: string;
  firstDate: string;
  lastDate: string;
  subscriptions: ExpectedSubscription[];
  /** Merchant keys whose every row is "not-recurring" */
  notRecurring: string[];
  /** Merchant keys whose every row is "money-in" */
  moneyIn: string[];
  usage: { "subscription-charge": number; "money-in": number; "not-recurring": number };
}

function sub(
  merchantKey: string,
  merchant: string,
  currentAmountCents: number,
  yearlyCostCents: number,
  ...priceHistory: [string, number][]
): ExpectedSubscription {
  return {
    merchantKey,
    merchant,
    currentAmountCents,
    yearlyCostCents,
    priceHistory: priceHistory.map(([date, amountCents]) => ({ date, amountCents })),
  };
}

const US: ExpectedSample = {
  file: "us-signed.csv",
  currency: "USD",
  firstDate: "2026-01-02",
  lastDate: "2026-03-25",
  subscriptions: [
    sub("adobe", "Adobe Creative Cloud", 5499, 65988, ["2026-01-12", 5499]),
    sub("merchant:riverside-gym-membership", "Riverside Gym Membership", 2900, 34800, [
      "2026-01-21",
      2900,
    ]),
    sub("netflix", "Netflix", 1799, 21588, ["2026-01-02", 1549], ["2026-03-02", 1799]),
    sub("spotify", "Spotify", 1099, 13188, ["2026-01-03", 1099]),
  ],
  notRecurring: [
    "merchant:greenleaf-market-austin",
    "merchant:harvest-foods-austin",
    "merchant:lone-star-fuel-austin",
    "merchant:taco-planet-austin",
    "merchant:online-marketplace-order",
  ],
  moneyIn: ["merchant:payroll-acme-corp-direct-dep", "merchant:online-marketplace-refund"],
  usage: { "subscription-charge": 12, "money-in": 7, "not-recurring": 7 },
};

const UK: ExpectedSample = {
  file: "uk-debit-credit.csv",
  currency: "GBP",
  firstDate: "2026-01-02",
  lastDate: "2026-03-21",
  subscriptions: [
    sub("merchant:fitzone-gym-ltd", "Fitzone Gym Ltd", 2499, 29988, ["2026-01-10", 2499]),
    sub("netflix", "Netflix", 1299, 15588, ["2026-01-02", 1099], ["2026-03-02", 1299]),
    sub("spotify", "Spotify", 1199, 14388, ["2026-01-05", 1199]),
    sub("amazon-prime", "Amazon Prime", 899, 10788, ["2026-01-09", 899]),
    sub("disney-plus", "Disney+", 799, 9588, ["2026-01-15", 799]),
  ],
  notRecurring: [
    "merchant:highfield-stores-london",
    "merchant:market-square-foods",
    "merchant:city-travel-card",
  ],
  moneyIn: ["merchant:salary-brighton-ltd", "merchant:online-shop-refund-ref"],
  usage: { "subscription-charge": 15, "money-in": 5, "not-recurring": 5 },
};

const EU: ExpectedSample = {
  file: "eu-semicolon.csv",
  currency: "EUR",
  firstDate: "2026-01-02",
  lastDate: "2026-03-27",
  subscriptions: [
    sub("merchant:fitnessstudio-lindenhof", "Fitnessstudio Lindenhof", 2490, 29880, [
      "2026-01-12",
      2490,
    ]),
    sub(
      "merchant:streaming-dienst-monatsbeitrag",
      "Streaming Dienst Monatsbeitrag",
      1499,
      17988,
      ["2026-01-03", 1299],
      ["2026-03-02", 1499],
    ),
    sub("merchant:musikdienst-premium", "Musikdienst Premium", 999, 11988, ["2026-01-09", 999]),
  ],
  notRecurring: ["merchant:supermarkt-nord", "merchant:tankstelle-am-ring"],
  moneyIn: ["merchant:gehalt-beispiel-gmbh", "merchant:online-shop-rueckerstattung"],
  usage: { "subscription-charge": 9, "money-in": 5, "not-recurring": 5 },
};

const PREAMBLE: ExpectedSample = {
  file: "with-preamble.csv",
  currency: "USD",
  firstDate: "2026-01-03",
  lastDate: "2026-03-20",
  subscriptions: [
    sub("merchant:fit-house-membership", "Fit House Membership", 3500, 42000, ["2026-01-20", 3500]),
    sub(
      "merchant:streamly-video-monthly",
      "Streamly Video Monthly",
      1399,
      16788,
      ["2026-01-03", 1199],
      ["2026-03-03", 1399],
    ),
    sub(
      "merchant:cloudvault-storage-200gb",
      "Cloudvault Storage 200gb",
      299,
      3588,
      ["2026-01-09", 299],
    ),
  ],
  notRecurring: ["merchant:corner-grocery"],
  moneyIn: ["merchant:payroll-example-inc"],
  usage: { "subscription-charge": 9, "money-in": 3, "not-recurring": 3 },
};

function detectSample(file: string) {
  const parsed = parseStatement(readFileSync(`${SAMPLES}${file}`, "utf8"));
  if (parsed.status !== "mapped") {
    throw new Error(`${file} did not map: ${parsed.status}`);
  }
  const rows = normalizeTransactions(parsed.transactions);
  const result: DetectionResult = detectSubscriptions(rows);
  return { rows, result };
}

describe("Req 10.6: uk-debit-credit.csv Prime Video membership", () => {
  it("is the known service amazon-prime", () => {
    const { result } = detectSample("uk-debit-credit.csv");
    const prime = result.subscriptions.find((s) => s.merchant === "Amazon Prime");
    expect(prime?.source).toBe("known");
    expect(prime?.serviceId).toBe("amazon-prime");
  });
});

describe.each([US, UK, EU, PREAMBLE])("Req 10.1: $file", (expected) => {
  const { rows, result } = detectSample(expected.file);

  it("returns exactly the listed Subscriptions, in order, with the listed fields", () => {
    const actual = result.subscriptions.map((s) => ({
      merchantKey: s.merchantKey,
      merchant: s.merchant,
      currentAmountCents: s.currentAmountCents,
      yearlyCostCents: s.yearlyCostCents,
      priceHistory: s.priceHistory,
    }));
    expect(actual).toEqual(expected.subscriptions);
  });

  it("gives every Subscription the shared fields", () => {
    for (const s of result.subscriptions) {
      expect(s.cadence).toBe("monthly");
      expect(s.status).toBe("active");
      expect(s.confidence).toBe("high");
      expect(s.labels).toEqual([]);
      expect(s.currency).toBe(expected.currency);
      expect(s.id).toBe(`sub:${expected.currency}:monthly:*:${s.merchantKey}`);
      expect(s.evidence.regularChargeCount).toBe(3);
      expect(s.evidence.missedPeriods).toBe(0);
      expect(s.evidence.lateChargeDates).toEqual([]);
      expect(s.evidence.cadenceAssumed).toBe(false);
      expect(s.evidence.introCharge).toBeNull();
      expect(s.evidence.freeTrialDate).toBeNull();
      expect(s.evidence.startedInStatement).toBe(false);
      expect(s.evidence.partialRefunds).toEqual([]);
    }
  });

  it("reports the Statement range", () => {
    expect(result.statement.firstDate).toBe(expected.firstDate);
    expect(result.statement.lastDate).toBe(expected.lastDate);
    expect(result.statement.currencies).toEqual([expected.currency]);
  });

  it("counts the usage roles", () => {
    const counts: Partial<Record<TransactionRole, number>> = {};
    for (const u of result.usage) {
      counts[u.role] = (counts[u.role] ?? 0) + 1;
    }
    expect(counts).toEqual(expected.usage);
    expect(result.usage).toHaveLength(rows.length);
  });

  it("marks the named merchants not-recurring and money-in, by key", () => {
    const rolesByKey = new Map<string, Set<TransactionRole>>();
    for (const u of result.usage) {
      const key = rows[u.index]?.merchant.key;
      if (key === undefined) {
        throw new Error(`usage index ${u.index} has no row`);
      }
      const roles = rolesByKey.get(key) ?? new Set<TransactionRole>();
      roles.add(u.role);
      rolesByKey.set(key, roles);
    }
    for (const key of expected.notRecurring) {
      expect([key, [...(rolesByKey.get(key) ?? [])]]).toEqual([key, ["not-recurring"]]);
    }
    for (const key of expected.moneyIn) {
      expect([key, [...(rolesByKey.get(key) ?? [])]]).toEqual([key, ["money-in"]]);
    }
  });
});
