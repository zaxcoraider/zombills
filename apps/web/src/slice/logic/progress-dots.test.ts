import { describe, expect, it } from "vitest";
import type { Subscription } from "@zombills/core";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import { analyzeStatement } from "./analyze-statement";
import { PROGRESS_DOTS_MAX, progressCounts, progressDots } from "./progress-dots";
import { risingOrder } from "./queue";
import { resultsOutcomeOf } from "./test-arbitraries";
import { INITIAL_PAGE_MODEL, pageReducer } from "../page-state";
import type { PageModel } from "../page-state";

/** An active subscription from the US sample, used as the shape for `count` distinct ones. */
function activeSubscriptions(count: number): Subscription[] {
  const outcome = analyzeStatement(usSigned);
  if (outcome.kind !== "results") throw new Error("us-signed.csv should give results");
  const template = outcome.subscriptions.find((s) => s.status === "active");
  if (template === undefined) throw new Error("us-signed.csv should have an active subscription");
  return Array.from({ length: count }, (_, i) => {
    const key = `svc-${String(i).padStart(2, "0")}`;
    return {
      ...template,
      id: `sub:${template.currency}:${template.cadence}:*:${key}`,
      merchant: `Service ${key}`,
      merchantKey: key,
      serviceId: null,
    };
  });
}

function resultsModel(subscriptions: readonly Subscription[]): PageModel {
  const working = pageReducer(INITIAL_PAGE_MODEL, { type: "start", runId: 1, sourceName: "a.csv" });
  return pageReducer(working, {
    type: "finish",
    runId: 1,
    outcome: resultsOutcomeOf(subscriptions),
  });
}

describe("progressDots and progressCounts", () => {
  it("are null outside the results view", () => {
    expect(progressDots(INITIAL_PAGE_MODEL)).toBeNull();
    expect(progressCounts(INITIAL_PAGE_MODEL)).toBeNull();
    const working = pageReducer(INITIAL_PAGE_MODEL, {
      type: "start",
      runId: 1,
      sourceName: "a.csv",
    });
    expect(progressDots(working)).toBeNull();
    expect(progressCounts(working)).toBeNull();
  });

  it("keeps the original Rising order after a Skip, with one answered", () => {
    let model = resultsModel(activeSubscriptions(3));
    if (model.view.kind !== "results") throw new Error("expected results");
    const original = risingOrder(model.view.outcome.subscriptions, model.view.outcome.statement);
    const [first, second] = original;
    if (first === undefined || second === undefined) throw new Error("expected 3 risen");
    model = pageReducer(model, { type: "keep", id: first });
    model = pageReducer(model, { type: "next" });
    model = pageReducer(model, { type: "skip", id: second });
    if (model.view.kind !== "results") throw new Error("expected results");
    expect(model.view.rising.order).not.toEqual(original);

    const dots = progressDots(model);
    expect(dots?.map((dot) => dot.id)).toEqual(original);
    expect(dots?.map((dot) => dot.answered)).toEqual([true, false, false]);
    expect(progressCounts(model)).toEqual({ answered: 1, risen: 3 });
  });

  it("gives no dots but still counts when more than 12 have risen", () => {
    let model = resultsModel(activeSubscriptions(PROGRESS_DOTS_MAX + 1));
    if (model.view.kind !== "results") throw new Error("expected results");
    const [first] = model.view.rising.order;
    if (first === undefined) throw new Error("expected 13 risen");
    model = pageReducer(model, { type: "keep", id: first });
    expect(progressDots(model)).toBeNull();
    expect(progressCounts(model)).toEqual({ answered: 1, risen: 13 });
  });
});
