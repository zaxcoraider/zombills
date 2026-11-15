// Test-only builder for hand-written Subscriptions that keep the detector's invariants.
// Not part of the build: tsconfig.build.json excludes `test-*.ts`.
// See .kiro/specs/subscription-classifier/design.md ("Generators", step 5).

import { addPeriods } from "../detect/cadence-rules.js";
import { parseIsoDate } from "../detect/dates.js";
import type { Cadence, PricePoint, Subscription, SubscriptionStatus } from "../detect/types.js";
import type { MerchantSource, NormalizedTransaction } from "../normalize/types.js";

export interface MakeSubscriptionOptions {
  /** Default "monthly" */
  cadence?: Cadence;
  /** Default "USD" */
  currency?: string;
  /** Default "known" */
  source?: MerchantSource;
  /** Default: "netflix" (known), "merchant:gym" (generic), "unidentified:none:gym" (unidentified) */
  merchantKey?: string;
  /** Regular charges as [date, amountCents], oldest first */
  charges: readonly (readonly [string, number])[];
  /** Introductory charge as [date, amountCents]; placed before `charges` */
  intro?: readonly [string, number];
  freeTrialDate?: string | null;
  /** Default false, so a repeated price never becomes an Inferred intro by accident */
  startedInStatement?: boolean;
  /** Default "active" */
  status?: SubscriptionStatus;
  /** Default false; when true, confidence is "low" */
  cadenceAssumed?: boolean;
}

// Literal factors on purpose: the tests must not depend on `CADENCE_FACTOR`.
const FACTOR: Readonly<Record<Cadence, number>> = { weekly: 52, monthly: 12, yearly: 1 };

function defaultKey(source: MerchantSource): string {
  if (source === "known") return "netflix";
  if (source === "generic") return "merchant:gym";
  return "unidentified:none:gym";
}

function displayNameOf(key: string, source: MerchantSource): string {
  if (source === "known") return key;
  return key.slice(key.lastIndexOf(":") + 1);
}

function nextExpected(lastDate: string, cadence: Cadence): string {
  const parsed = parseIsoDate(lastDate);
  if (parsed === null) throw new Error(`makeSubscription: not an ISO date: ${lastDate}`);
  return addPeriods(parsed, cadence, 1).iso;
}

/** A Subscription with every field derived from the charges, as the detector would. */
export function makeSubscription(options: MakeSubscriptionOptions): Subscription {
  const cadence = options.cadence ?? "monthly";
  const currency = options.currency ?? "USD";
  const source = options.source ?? "known";
  const merchantKey = options.merchantKey ?? defaultKey(source);
  const rows: [string, number][] = [
    ...(options.intro === undefined ? [] : [[...options.intro] as [string, number]]),
    ...options.charges.map(([date, amount]): [string, number] => [date, amount]),
  ];
  const firstRegular = options.charges[0];
  const last = rows[rows.length - 1];
  if (firstRegular === undefined || last === undefined) {
    throw new Error("makeSubscription: charges must not be empty");
  }

  const displayName = displayNameOf(merchantKey, source);
  const charges: NormalizedTransaction[] = rows.map(([date, amountCents]) => ({
    date,
    description: `${displayName} ${date}`,
    amountCents,
    currency,
    merchant: {
      key: merchantKey,
      displayName,
      source,
      serviceId: source === "known" ? merchantKey : null,
      processor: null,
    },
  }));

  const priceHistory: PricePoint[] = [];
  let previous: number | null = null;
  for (const [date, amountCents] of rows) {
    if (previous === null || amountCents !== previous) priceHistory.push({ date, amountCents });
    previous = amountCents;
  }

  const cadenceAssumed = options.cadenceAssumed ?? false;
  const lastRegular = options.charges[options.charges.length - 1] ?? last;
  const currentAmountCents = lastRegular[1];

  return {
    id: `sub:${currency}:${cadence}:0:${merchantKey}`,
    merchant: displayName,
    merchantKey,
    serviceId: source === "known" ? merchantKey : null,
    source,
    currency,
    cadence,
    charges,
    currentAmountCents,
    yearlyCostCents: currentAmountCents * FACTOR[cadence],
    labels: [],
    priceHistory,
    status: options.status ?? "active",
    confidence: cadenceAssumed ? "low" : "high",
    evidence: {
      regularChargeCount: options.charges.length,
      firstChargeDate: firstRegular[0],
      lastChargeDate: lastRegular[0],
      nextExpectedDate: nextExpected(lastRegular[0], cadence),
      missedPeriods: 0,
      lateChargeDates: [],
      cadenceAssumed,
      introCharge:
        options.intro === undefined
          ? null
          : { date: options.intro[0], amountCents: options.intro[1] },
      freeTrialDate: options.freeTrialDate ?? null,
      startedInStatement: options.startedInStatement ?? false,
      partialRefunds: [],
    },
  };
}
