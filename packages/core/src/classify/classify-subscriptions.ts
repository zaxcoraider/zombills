// Sets `labels`, `priceRise` and `trial` on detected Subscriptions.
// Pure: no network, DOM, clock, randomness, logging or module state.

import type { Subscription } from "../detect/types.js";
import { findInferredIntro, paidPriceHistory } from "./paid-history.js";
import { findPriceRise } from "./possessed.js";
import { findTrial } from "./trial-trap.js";
import type {
  ClassifiedSubscription,
  PriceRise,
  SubscriptionLabel,
  TrialDetails,
  UsageAnswer,
} from "./types.js";

/**
 * Labels each Subscription. Nested values (`charges`, `priceHistory`, `evidence`, `cancel`)
 * are shared with the input; treat results as read-only.
 */
export function classifySubscriptions(
  subscriptions: readonly Subscription[],
  answers?: ReadonlyMap<string, UsageAnswer>,
): ClassifiedSubscription[] {
  if (!Array.isArray(subscriptions)) {
    throw new TypeError("classifySubscriptions: subscriptions must be an array");
  }
  return subscriptions.map((s) => classifyOne(s, answerFor(answers, s.id)));
}

/** Internal. `answer` is whatever answers.get(id) returned, or undefined. */
export function classifyOne(subscription: Subscription, answer: unknown): ClassifiedSubscription {
  if (subscription.status === "ended") {
    return { ...subscription, labels: [], priceRise: null, trial: null };
  }
  let priceRise: PriceRise | null = null;
  let trial: TrialDetails | null = null;
  if (!subscription.evidence.cadenceAssumed) {
    const intro = findInferredIntro(subscription);
    priceRise = findPriceRise(subscription, paidPriceHistory(subscription, intro));
    trial = findTrial(subscription, intro);
  }
  const labels: SubscriptionLabel[] = [];
  if (answer === "not-using") labels.push("zombie");
  if (priceRise !== null) labels.push("possessed");
  if (trial !== null) labels.push("trial-trap");
  return { ...subscription, labels, priceRise, trial };
}

/** Internal. undefined when answers is not a Map. */
export function answerFor(answers: unknown, id: string): unknown {
  return answers instanceof Map ? answers.get(id) : undefined;
}
