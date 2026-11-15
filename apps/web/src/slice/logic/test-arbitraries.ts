// Generators for the property tests. Imported only by tests, so it never reaches the bundle.
import fc from "fast-check";
import {
  AMOUNT_HEADERS,
  CREDIT_HEADERS,
  DATE_HEADERS,
  DEBIT_HEADERS,
  DESCRIPTION_HEADERS,
  type Subscription,
} from "@zombills/core";

export const MAX_YEARLY_COST_CENTS = 999_999_9900 * 52;

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;

/** Few distinct merchants, so equal merchants and code-unit edge cases (`"Z"` before `"a"`) are common. */
const merchantArb = fc.oneof(
  fc.constantFrom("Z", "a", "A", "z", "Netflix", "Spotify", ""),
  fc.string({ maxLength: 8 }),
);

/** Small values make ties on cost likely; the wide range covers the Req 5.11 bounds. */
const yearlyCostArb = fc.oneof(
  fc.constantFrom(0, 100, 1_000, 15_000),
  fc.integer({ min: 0, max: MAX_YEARLY_COST_CENTS }),
);

/**
 * A structurally valid Subscription. The `id` is drawn from a small set, so use `subscriptionListArb`
 * when ids must be unique within an array.
 */
export const subscriptionArb: fc.Arbitrary<Subscription> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    merchant: merchantArb,
    currency: fc.constantFrom(...CURRENCIES),
    cadence: fc.constantFrom("weekly", "monthly", "yearly"),
    status: fc.constantFrom("active", "ended"),
    cadenceAssumed: fc.boolean(),
    yearlyCostCents: yearlyCostArb,
    source: fc.constantFrom("known", "generic", "unidentified"),
    confidence: fc.constantFrom("high", "medium", "low"),
  })
  .map((v): Subscription => {
    const date = "2026-01-12";
    return {
      id: v.id,
      merchant: v.merchant,
      merchantKey: v.merchant.toLowerCase(),
      serviceId: null,
      source: v.source,
      currency: v.currency,
      cadence: v.cadence,
      charges: [],
      currentAmountCents: v.yearlyCostCents,
      yearlyCostCents: v.yearlyCostCents,
      labels: [],
      priceHistory: [],
      status: v.status,
      confidence: v.confidence,
      evidence: {
        regularChargeCount: 3,
        firstChargeDate: date,
        lastChargeDate: date,
        nextExpectedDate: date,
        missedPeriods: 0,
        lateChargeDates: [],
        cadenceAssumed: v.cadenceAssumed,
        introCharge: null,
        freeTrialDate: null,
        startedInStatement: false,
        partialRefunds: [],
      },
    };
  });

/** An array of subscriptions with unique ids (design "Generators"). */
export function subscriptionListArb(maxLength: number): fc.Arbitrary<Subscription[]> {
  return fc.uniqueArray(subscriptionArb, { maxLength, selector: (s) => s.id });
}

const ALL_HEADER_NAMES: readonly string[] = [
  ...DATE_HEADERS,
  ...DESCRIPTION_HEADERS,
  ...AMOUNT_HEADERS,
  ...DEBIT_HEADERS,
  ...CREDIT_HEADERS,
];

const NOISE_HEADER_NAMES = ["Balance", "Reference", "Category", "Type", "Notes", "Account", "Code"];

/** A header name with case and surrounding-space variants (ASCII, so `toLowerCase` agrees everywhere). */
const headerCellArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...ALL_HEADER_NAMES, ...NOISE_HEADER_NAMES),
    fc.constantFrom("keep", "upper", "title"),
    fc.constantFrom("", " ", "  ", "\t"),
    fc.constantFrom("", " ", "  ", "\t"),
  )
  .map(([name, casing, before, after]) => {
    const cased =
      casing === "upper"
        ? name.toUpperCase()
        : casing === "title"
          ? name.replace(/\b[a-z]/g, (c) => c.toUpperCase())
          : name;
    return `${before}${cased}${after}`;
  });

/** A header row of 3 to 8 cells drawn from every header list and from noise names (design P5). */
export const headerRowArb: fc.Arbitrary<string[]> = fc.array(headerCellArb, {
  minLength: 3,
  maxLength: 8,
});
