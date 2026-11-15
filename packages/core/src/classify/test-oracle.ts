// Test-only reference for the subscription classifier (design "Correctness properties"). Not part
// of the build: tsconfig.build.json excludes `test-*.ts`.
//
// `oracle` is written straight from the requirement text (glossary, Req 2.1, 3.1, 5, 6.3) and
// shares no code with the classifier: the Band rise is checked in BigInt, the Cadence factors are
// literal, and the only import from the classifier is a type.

import type { PricePoint, Subscription } from "../detect/types.js";
import type { SubscriptionLabel } from "./types.js";

export interface OracleResult {
  /** Expected `labels`, in Canonical label order. */
  labels: SubscriptionLabel[];
  /** Whether `priceRise` must be non-null. */
  hasPriceRise: boolean;
  /** Whether `trial` must be non-null. */
  hasTrial: boolean;
  /** The Inferred intro charge (glossary), or null. */
  inferredIntro: PricePoint | null;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Glossary "Band rise": `(to − from) × 20 > from`, exactly. */
function bandRise(from: number, to: number): boolean {
  return (BigInt(to) - BigInt(from)) * 20n > BigInt(from);
}

function factorOf(cadence: Subscription["cadence"]): bigint {
  if (cadence === "weekly") return 52n;
  if (cadence === "monthly") return 12n;
  return 1n;
}

function countAmount(s: Subscription, amountCents: number): number {
  let n = 0;
  for (const c of s.charges) if (c.amountCents === amountCents) n += 1;
  return n;
}

/** Glossary "Inferred intro charge". */
function inferredIntroOf(s: Subscription): PricePoint | null {
  const e = s.evidence;
  const p0 = s.priceHistory[0];
  const p1 = s.priceHistory[1];
  if (e.introCharge !== null || !e.startedInStatement) return null;
  if (p0 === undefined || p1 === undefined) return null;
  if (!bandRise(p0.amountCents, p1.amountCents)) return null;
  if (countAmount(s, p0.amountCents) !== 1) return null;
  if (countAmount(s, p1.amountCents) < 2) return null;
  return { date: p0.date, amountCents: p0.amountCents };
}

/** Glossary "Paid price history". */
function paidOf(s: Subscription, inferred: PricePoint | null): PricePoint[] {
  const intro = s.evidence.introCharge;
  const p0 = s.priceHistory[0];
  const dropFirst =
    inferred !== null ||
    (intro !== null &&
      p0 !== undefined &&
      p0.date === intro.date &&
      p0.amountCents === intro.amountCents);
  return dropFirst ? s.priceHistory.slice(1) : s.priceHistory.slice();
}

/** Req 2.1 and 2.4. */
function isPossessed(s: Subscription, paid: PricePoint[]): boolean {
  const first = paid[0];
  if (first === undefined || paid.length < 2) return false;
  if (!bandRise(first.amountCents, s.currentAmountCents)) return false;
  const perYear = (BigInt(s.currentAmountCents) - BigInt(first.amountCents)) * factorOf(s.cadence);
  return perYear <= MAX_SAFE;
}

/** Req 3.1 and 3.3. */
function isTrialTrap(s: Subscription, inferred: PricePoint | null): boolean {
  const e = s.evidence;
  const hasIntro = e.introCharge !== null || inferred !== null;
  const hasFree = e.freeTrialDate !== null && e.freeTrialDate !== e.firstChargeDate;
  if (!hasIntro && !hasFree) return false;
  const fullPriceCount = inferred !== null ? e.regularChargeCount - 1 : e.regularChargeCount;
  if (fullPriceCount > 3) return false;
  if (inferred !== null) return s.priceHistory[1] !== undefined;
  return s.charges.some((c) => c.date === e.firstChargeDate);
}

/**
 * The labels, and whether `priceRise` and `trial` are set, that Req 2, 3, 5 and 6.3 require for
 * `s` when the answer for its id is `answer`.
 */
export function oracle(s: Subscription, answer: unknown): OracleResult {
  if (s.status === "ended") {
    return { labels: [], hasPriceRise: false, hasTrial: false, inferredIntro: null };
  }
  const eligible = !s.evidence.cadenceAssumed;
  const inferredIntro = eligible ? inferredIntroOf(s) : null;
  const hasPriceRise = eligible && isPossessed(s, paidOf(s, inferredIntro));
  const hasTrial = eligible && isTrialTrap(s, inferredIntro);
  const labels: SubscriptionLabel[] = [];
  if (answer === "not-using") labels.push("zombie");
  if (hasPriceRise) labels.push("possessed");
  if (hasTrial) labels.push("trial-trap");
  return { labels, hasPriceRise, hasTrial, inferredIntro };
}
