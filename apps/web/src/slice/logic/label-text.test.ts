import type { PriceRise, TrialDetails } from "@zombills/core";
import { describe, expect, it } from "vitest";
import { partsToText, priceRiseParts, trialParts } from "./label-text";
import { formatMoney } from "./money";

function rise(
  firstCents: number,
  currentCents: number,
  perChargeCents: number,
  perYearCents: number,
): PriceRise {
  return {
    firstSeen: { date: "2026-01-02", amountCents: firstCents },
    currentAmountCents: currentCents,
    latestRise: { fromAmountCents: firstCents, toAmountCents: currentCents, date: "2026-02-02" },
    increasePerChargeCents: perChargeCents,
    increasePerYearCents: perYearCents,
  };
}

describe("priceRiseParts (Req 9.3)", () => {
  it("hand-built monthly example, en-US", () => {
    expect(partsToText(priceRiseParts(rise(1000, 1400, 400, 4800), "USD", "en-US"))).toBe(
      "Price went up from $10.00 (2 Jan 2026) to $14.00 (+$48.00 a year)",
    );
  });

  it("us-signed.csv Netflix, en-US", () => {
    expect(partsToText(priceRiseParts(rise(1549, 1799, 250, 3000), "USD", "en-US"))).toBe(
      "Price went up from $15.49 (2 Jan 2026) to $17.99 (+$30.00 a year)",
    );
  });

  it("uk-debit-credit.csv, en-GB", () => {
    expect(partsToText(priceRiseParts(rise(1099, 1299, 200, 2400), "GBP", "en-GB"))).toBe(
      "Price went up from £10.99 (2 Jan 2026) to £12.99 (+£24.00 a year)",
    );
  });

  it("marks the three amounts as money parts equal to formatMoney", () => {
    const parts = priceRiseParts(rise(1549, 1799, 250, 3000), "USD", "en-US");
    expect(parts.filter((part) => part.kind === "money").map((part) => part.text)).toEqual([
      formatMoney(1549, "USD", "en-US"),
      formatMoney(1799, "USD", "en-US"),
      formatMoney(3000, "USD", "en-US"),
    ]);
    expect(
      parts.filter((part) => part.kind === "text").every((part) => !/\d\.\d\d/.test(part.text)),
    ).toBe(true);
  });
});

describe("trialParts (Req 9.4)", () => {
  const FULL_FREE = { date: "2026-02-05", amountCents: 1099 };
  const FULL_INTRO = { date: "2026-02-10", amountCents: 1499 };

  it("free trial only", () => {
    const trial: TrialDetails = {
      freeTrialDate: "2026-01-05",
      introCharge: null,
      firstFullCharge: FULL_FREE,
    };
    expect(partsToText(trialParts(trial, "USD", "en-US"))).toBe(
      "Free trial ended on 5 Feb 2026 (free on 5 Jan 2026, then $10.99)",
    );
  });

  it("intro price only", () => {
    const trial: TrialDetails = {
      freeTrialDate: null,
      introCharge: { date: "2026-01-10", amountCents: 100 },
      firstFullCharge: FULL_INTRO,
    };
    expect(partsToText(trialParts(trial, "USD", "en-US"))).toBe(
      "Intro price ended on 10 Feb 2026 ($1.00 on 10 Jan 2026, then $14.99)",
    );
  });

  it("free trial and intro price", () => {
    const trial: TrialDetails = {
      freeTrialDate: "2026-01-03",
      introCharge: { date: "2026-01-10", amountCents: 100 },
      firstFullCharge: FULL_INTRO,
    };
    const parts = trialParts(trial, "USD", "en-US");
    expect(partsToText(parts)).toBe(
      "Free trial and intro price ended on 10 Feb 2026 (free on 3 Jan 2026, $1.00 on 10 Jan 2026, then $14.99)",
    );
    expect(parts.filter((part) => part.kind === "money").map((part) => part.text)).toEqual([
      formatMoney(100, "USD", "en-US"),
      formatMoney(1499, "USD", "en-US"),
    ]);
  });

  it("gives no parts when neither field is set", () => {
    const trial: TrialDetails = {
      freeTrialDate: null,
      introCharge: null,
      firstFullCharge: FULL_FREE,
    };
    expect(trialParts(trial, "USD", "en-US")).toEqual([]);
  });
});

describe("partsToText", () => {
  it("joins the texts with no separator", () => {
    expect(
      partsToText([
        { kind: "text", text: "a " },
        { kind: "money", text: "$1.00" },
        { kind: "text", text: " b" },
      ]),
    ).toBe("a $1.00 b");
    expect(partsToText([])).toBe("");
  });
});
