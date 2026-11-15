// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ClassifiedSubscription, PriceRise, TrialDetails } from "@zombills/core";
import { afterEach, describe, expect, it } from "vitest";
import { partsToText, priceRiseParts, trialParts } from "./logic/label-text";
import { SubscriptionItem } from "./subscription-item";

afterEach(cleanup);

const CURRENCY = "USD";

const PRICE_RISE: PriceRise = {
  firstSeen: { date: "2026-01-02", amountCents: 1000 },
  currentAmountCents: 1400,
  latestRise: { fromAmountCents: 1000, toAmountCents: 1400, date: "2026-03-02" },
  increasePerChargeCents: 400,
  increasePerYearCents: 4800,
};

const FREE_ONLY: TrialDetails = {
  freeTrialDate: "2026-01-05",
  introCharge: null,
  firstFullCharge: { date: "2026-02-05", amountCents: 1099 },
};

const INTRO_ONLY: TrialDetails = {
  freeTrialDate: null,
  introCharge: { date: "2026-01-10", amountCents: 100 },
  firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
};

const BOTH: TrialDetails = {
  freeTrialDate: "2026-01-03",
  introCharge: { date: "2026-01-10", amountCents: 100 },
  firstFullCharge: { date: "2026-02-10", amountCents: 1499 },
};

function build(overrides: Partial<ClassifiedSubscription> = {}): ClassifiedSubscription {
  return {
    id: "sub-1",
    merchant: "Example Plus",
    merchantKey: "merchant:example plus",
    serviceId: null,
    source: "generic",
    currency: CURRENCY,
    cadence: "monthly",
    charges: [],
    currentAmountCents: 1400,
    yearlyCostCents: 16800,
    labels: [],
    priceHistory: [{ date: "2026-01-02", amountCents: 1400 }],
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
      startedInStatement: true,
      partialRefunds: [],
    },
    priceRise: null,
    trial: null,
    ...overrides,
  };
}

function renderItem(subscription: ClassifiedSubscription): HTMLLIElement {
  const { container } = render(
    <ul>
      <SubscriptionItem subscription={subscription} />
    </ul>,
  );
  const item = container.querySelector("ul > li");
  if (!(item instanceof HTMLLIElement)) throw new Error("list item not rendered");
  return item;
}

/** The item's own line spans (direct children), as text. */
function lineTexts(item: HTMLElement): string[] {
  return Array.from(item.children)
    .filter((child) => child.tagName === "SPAN")
    .map((child) => child.textContent ?? "");
}

function lineElement(item: HTMLElement, expected: string): HTMLElement {
  const found = Array.from(item.children).find(
    (child): child is HTMLElement => child.tagName === "SPAN" && child.textContent === expected,
  );
  if (found === undefined) throw new Error(`line not found: ${expected}`);
  return found;
}

describe("SubscriptionItem label lines", () => {
  it("shows the price-rise line for a possessed subscription", () => {
    const item = renderItem(build({ labels: ["possessed"], priceRise: PRICE_RISE }));
    const expected = partsToText(priceRiseParts(PRICE_RISE, CURRENCY));
    expect(expected.startsWith("Price went up from ")).toBe(true);
    expect(lineTexts(item).filter((t) => t === expected)).toHaveLength(1);
    expect(lineTexts(item).filter((t) => t.includes("Price went up"))).toHaveLength(1);
    expect(lineTexts(item).some((t) => t.includes("ended on"))).toBe(false);
  });

  it.each([
    ["freeTrialDate only", FREE_ONLY, "Free trial ended on "],
    ["introCharge only", INTRO_ONLY, "Intro price ended on "],
    ["both", BOTH, "Free trial and intro price ended on "],
  ])("shows exactly the trial line when trial holds %s", (_name, trial, prefix) => {
    const item = renderItem(build({ labels: ["trial-trap"], trial }));
    const expected = partsToText(trialParts(trial, CURRENCY));
    expect(expected.startsWith(prefix)).toBe(true);
    expect(lineTexts(item).filter((t) => t === expected)).toHaveLength(1);
    expect(lineTexts(item).filter((t) => t.includes("ended on"))).toHaveLength(1);
    expect(lineTexts(item).some((t) => t.includes("Price went up"))).toBe(false);
  });

  it("puts the price-rise line before the trial line and the price-history list after both", () => {
    const item = renderItem(
      build({
        labels: ["possessed", "trial-trap"],
        priceRise: PRICE_RISE,
        trial: BOTH,
        priceHistory: [
          { date: "2026-01-02", amountCents: 1000 },
          { date: "2026-03-02", amountCents: 1400 },
        ],
      }),
    );
    const rise = lineElement(item, partsToText(priceRiseParts(PRICE_RISE, CURRENCY)));
    const trial = lineElement(item, partsToText(trialParts(BOTH, CURRENCY)));
    const history = item.querySelector('ol[aria-label="Price history"]');
    if (history === null) throw new Error("price history not rendered");

    const follows = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(rise.compareDocumentPosition(trial) & follows).toBeTruthy();
    expect(trial.compareDocumentPosition(history) & follows).toBeTruthy();
  });

  it("puts the label lines after the cost and Ended lines", () => {
    const item = renderItem(
      build({
        status: "ended",
        labels: ["possessed", "trial-trap"],
        priceRise: PRICE_RISE,
        trial: FREE_ONLY,
      }),
    );
    const texts = lineTexts(item);
    const ended = texts.findIndex((t) => t.startsWith("Ended"));
    const rise = texts.findIndex((t) => t.startsWith("Price went up"));
    const trial = texts.findIndex((t) => t.includes("ended on"));
    expect(ended).toBeGreaterThan(0);
    expect(rise).toBeGreaterThan(ended);
    expect(trial).toBeGreaterThan(rise);
  });

  it("shows neither line when both labels are absent", () => {
    const item = renderItem(build());
    expect(item.textContent).not.toContain("Price went up");
    expect(item.textContent).not.toContain("ended on");
  });

  it("puts every money figure of the lines in a .money span", () => {
    const item = renderItem(
      build({ labels: ["possessed", "trial-trap"], priceRise: PRICE_RISE, trial: BOTH }),
    );
    const cases: [string, ReturnType<typeof priceRiseParts>][] = [
      [partsToText(priceRiseParts(PRICE_RISE, CURRENCY)), priceRiseParts(PRICE_RISE, CURRENCY)],
      [partsToText(trialParts(BOTH, CURRENCY)), trialParts(BOTH, CURRENCY)],
    ];
    for (const [text, parts] of cases) {
      const line = lineElement(item, text);
      const expectedMoney = parts.filter((p) => p.kind === "money").map((p) => p.text);
      const spans = Array.from(line.querySelectorAll("span.money")).map((s) => s.textContent);
      expect(expectedMoney.length).toBeGreaterThan(0);
      expect(spans).toEqual(expectedMoney);
      // Nothing but the money spans is wrapped; the rest is plain text.
      expect(line.children).toHaveLength(expectedMoney.length);
    }
  });

  it("shows no zombie text even when labels contains zombie", () => {
    const item = renderItem(
      build({
        labels: ["zombie", "possessed", "trial-trap"],
        priceRise: PRICE_RISE,
        trial: INTRO_ONLY,
      }),
    );
    expect(item.textContent?.toLowerCase()).not.toContain("zombie");
  });
});
