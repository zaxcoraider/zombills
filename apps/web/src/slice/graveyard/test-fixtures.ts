// Hand-built ClassifiedSubscriptions for tests. Imported only by tests, never by the app.
import type { ClassifiedSubscription } from "@zombills/core";

/** A plain, unlabelled, active monthly subscription; the fixtures below override what differs. */
function base(
  id: string,
  merchant: string,
  currentAmountCents: number,
  overrides: Partial<ClassifiedSubscription> = {},
): ClassifiedSubscription {
  return {
    id,
    merchant,
    merchantKey: merchant.toLowerCase(),
    serviceId: null,
    source: "generic",
    currency: "USD",
    cadence: "monthly",
    charges: [],
    currentAmountCents,
    yearlyCostCents: currentAmountCents * 12,
    labels: [],
    priceHistory: [
      { date: "2026-01-02", amountCents: currentAmountCents },
      { date: "2026-02-02", amountCents: currentAmountCents },
      { date: "2026-03-02", amountCents: currentAmountCents },
    ],
    status: "active",
    confidence: "high",
    evidence: {
      regularChargeCount: 3,
      firstChargeDate: "2026-01-02",
      lastChargeDate: "2026-03-02",
      nextExpectedDate: "2026-04-02",
      missedPeriods: 0,
      lateChargeDates: [],
      cadenceAssumed: false,
      introCharge: null,
      freeTrialDate: null,
      startedInStatement: false,
      partialRefunds: [],
    },
    priceRise: null,
    trial: null,
    ...overrides,
  };
}

/** Intro price of $1.00 on 10 Jan 2026, then $14.99 from 10 Feb 2026. */
export const TRIAL_TRAP: ClassifiedSubscription = base("sub:USD:monthly:1499:trialflix", "Trialflix", 1499, {
  labels: ["trial-trap"],
  priceHistory: [
    { date: "2026-01-10", amountCents: 100 },
    { date: "2026-02-10", amountCents: 1499 },
    { date: "2026-03-10", amountCents: 1499 },
  ],
  evidence: {
    regularChargeCount: 2,
    firstChargeDate: "2026-01-10",
    lastChargeDate: "2026-03-10",
    nextExpectedDate: "2026-04-10",
    missedPeriods: 0,
    lateChargeDates: [],
    cadenceAssumed: false,
    introCharge: { date: "2026-01-10", amountCents: 100 },
    freeTrialDate: null,
    startedInStatement: true,
    partialRefunds: [],
  },
  trial: {
    freeTrialDate: null,
    introCharge: { date: "2026-01-10", amountCents: 100 },
    firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
  },
});

/** Price rose from $9.99 to $12.99 on 2 Feb 2026, after a $1.00 intro charge on 2 Jan 2026. */
export const POSSESSED_TRIAL_TRAP: ClassifiedSubscription = base(
  "sub:USD:monthly:1299:hauntify",
  "Hauntify",
  1299,
  {
    labels: ["possessed", "trial-trap"],
    yearlyCostCents: 1299 * 12,
    priceHistory: [
      { date: "2026-01-02", amountCents: 100 },
      { date: "2026-01-15", amountCents: 999 },
      { date: "2026-02-15", amountCents: 1299 },
      { date: "2026-03-15", amountCents: 1299 },
    ],
    evidence: {
      regularChargeCount: 3,
      firstChargeDate: "2026-01-02",
      lastChargeDate: "2026-03-15",
      nextExpectedDate: "2026-04-15",
      missedPeriods: 0,
      lateChargeDates: [],
      cadenceAssumed: false,
      introCharge: { date: "2026-01-02", amountCents: 100 },
      freeTrialDate: null,
      startedInStatement: true,
      partialRefunds: [],
    },
    priceRise: {
      firstSeen: { date: "2026-01-15", amountCents: 999 },
      currentAmountCents: 1299,
      latestRise: { fromAmountCents: 999, toAmountCents: 1299, date: "2026-02-15" },
      increasePerChargeCents: 300,
      increasePerYearCents: 3600,
    },
    trial: {
      freeTrialDate: null,
      introCharge: { date: "2026-01-02", amountCents: 100 },
      firstFullCharge: { date: "2026-01-15", amountCents: 999 },
    },
  },
);

/** One charge only, so the cadence is a guess: the saving is unknown (Req 5.6). */
export const GUESSED_AMAZON_PRIME: ClassifiedSubscription = base(
  "sub:USD:monthly:*:amazon-prime",
  "Amazon Prime",
  13_900,
  {
    yearlyCostCents: 166_800,
    confidence: "low",
    priceHistory: [{ date: "2026-03-05", amountCents: 13_900 }],
    evidence: {
      regularChargeCount: 1,
      firstChargeDate: "2026-03-05",
      lastChargeDate: "2026-03-05",
      nextExpectedDate: "2026-04-05",
      missedPeriods: 0,
      lateChargeDates: [],
      cadenceAssumed: true,
      introCharge: null,
      freeTrialDate: null,
      startedInStatement: false,
      partialRefunds: [],
    },
  },
);

const APPLE = "Apple payment (merchant not shown)";

/** Two Apple subscriptions with the same merchant and cadence: Display names need the amount. */
export const APPLE_99: ClassifiedSubscription = base("sub:USD:monthly:99:apple", APPLE, 99);
export const APPLE_299: ClassifiedSubscription = base("sub:USD:monthly:299:apple", APPLE, 299);

export const APPLE_PAIR: readonly ClassifiedSubscription[] = [APPLE_99, APPLE_299];
