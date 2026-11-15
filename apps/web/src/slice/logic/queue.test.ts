import { describe, expect, it } from "vitest";
import type { StatementInfo, Subscription } from "@zombills/core";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./analyze-statement";
import { recordAnswer, type Graveyard } from "./graveyard";
import { answerNowInOrder, queueOf, risingOrder, skipInOrder } from "./queue";

function usResults() {
  const outcome = analyzeStatement(usSigned);
  if (outcome.kind !== "results") throw new Error("us-signed.csv should give results");
  return outcome;
}

function idOf(subscriptions: readonly Subscription[], merchant: string): string {
  const found = subscriptions.find((s) => s.merchant === merchant);
  if (!found) throw new Error(`no ${merchant}`);
  return found.id;
}

function withCurrency(base: Subscription, currency: string, id: string): Subscription {
  return { ...base, id, currency };
}

describe("risingOrder", () => {
  it("orders us-signed.csv as Adobe, Riverside Gym, Netflix, Spotify", () => {
    const { subscriptions, statement } = usResults();
    const merchants = risingOrder(subscriptions, statement).map(
      (id) => subscriptions.find((s) => s.id === id)?.merchant,
    );
    expect(merchants).toEqual([
      "Adobe Creative Cloud",
      "Riverside Gym Membership",
      "Netflix",
      "Spotify",
    ]);
  });

  it("leaves Ended subscriptions out", () => {
    const { subscriptions, statement } = usResults();
    const adobe = idOf(subscriptions, "Adobe Creative Cloud");
    const ended = subscriptions.map((s): Subscription =>
      s.id === adobe ? { ...s, status: "ended" } : s,
    );
    const order = risingOrder(ended, statement);
    expect(order).toHaveLength(3);
    expect(order).not.toContain(adobe);
  });

  it("follows StatementInfo.currencies for the group order", () => {
    const { subscriptions, statement } = usResults();
    const [first, second] = subscriptions;
    if (!first || !second) throw new Error("need two subscriptions");
    const list = [withCurrency(first, "USD", "usd"), withCurrency(second, "GBP", "gbp")];
    const info = (currencies: string[]): StatementInfo => ({ ...statement, currencies });
    expect(risingOrder(list, info(["USD", "GBP"]))).toEqual(["usd", "gbp"]);
    expect(risingOrder(list, info(["GBP", "USD"]))).toEqual(["gbp", "usd"]);
  });
});

describe("queueOf", () => {
  it("drops ids that have a record and keeps the order", () => {
    const { subscriptions, statement } = usResults();
    const order = risingOrder(subscriptions, statement);
    const netflix = subscriptions.find((s) => s.merchant === "Netflix");
    if (!netflix) throw new Error("no Netflix");
    const graveyard = recordAnswer([], netflix, "not-using");
    expect(queueOf(order, graveyard)).toEqual(order.filter((id) => id !== netflix.id));
  });

  it("returns an id at its own position when its record is removed", () => {
    const { subscriptions, statement } = usResults();
    const order = risingOrder(subscriptions, statement);
    const netflix = subscriptions.find((s) => s.merchant === "Netflix");
    if (!netflix) throw new Error("no Netflix");
    const answered: Graveyard = recordAnswer([], netflix, "still-using");
    expect(queueOf(order, answered)).not.toContain(netflix.id);
    expect(queueOf(order, [])).toEqual(order);
  });

  it("ignores records for ids outside the order", () => {
    const { subscriptions } = usResults();
    const first = subscriptions[0];
    if (!first) throw new Error("no subscription");
    const graveyard = recordAnswer([], first, "not-using");
    expect(queueOf(["other"], graveyard)).toEqual(["other"]);
  });
});

describe("skipInOrder and answerNowInOrder", () => {
  const order = ["a", "b", "c", "d"];

  it("skip moves the id to the end", () => {
    expect(skipInOrder(order, "a")).toEqual(["b", "c", "d", "a"]);
    expect(skipInOrder(order, "c")).toEqual(["a", "b", "d", "c"]);
    expect(skipInOrder(order, "d")).toEqual(order);
  });

  it("answer now moves the id to the front", () => {
    expect(answerNowInOrder(order, "c")).toEqual(["c", "a", "b", "d"]);
    expect(answerNowInOrder(order, "a")).toEqual(order);
  });

  it("leaves the order unchanged for an unknown id", () => {
    expect(skipInOrder(order, "zzz")).toEqual(order);
    expect(answerNowInOrder(order, "zzz")).toEqual(order);
  });

  it("does not mutate its input", () => {
    const frozen = Object.freeze([...order]);
    expect(() => skipInOrder(frozen, "a")).not.toThrow();
    expect(() => answerNowInOrder(frozen, "d")).not.toThrow();
  });
});
