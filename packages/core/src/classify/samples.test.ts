import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectSubscriptions } from "../detect/detect-subscriptions.js";
import type { Subscription } from "../detect/types.js";
import { normalizeTransactions } from "../normalize/index.js";
import { parseStatement } from "../parse/index.js";
import { classifySubscriptions } from "./classify-subscriptions.js";
import type { PriceRise, UsageAnswer } from "./types.js";

// Req 8.1, 8.2 and 6.7: the four sample statements, end to end through the classifier.
// The files in samples/ are never edited to make this pass.

const SAMPLES = fileURLToPath(new URL("../../../../samples/", import.meta.url));

interface ExpectedRow {
  file: string;
  merchantKey: string;
  priceRise: PriceRise;
}

function rise(
  firstSeen: [string, number],
  current: number,
  from: number,
  date: string,
  perCharge: number,
  perYear: number,
): PriceRise {
  return {
    firstSeen: { date: firstSeen[0], amountCents: firstSeen[1] },
    currentAmountCents: current,
    latestRise: { fromAmountCents: from, toAmountCents: current, date },
    increasePerChargeCents: perCharge,
    increasePerYearCents: perYear,
  };
}

const ROWS: ExpectedRow[] = [
  {
    file: "us-signed.csv",
    merchantKey: "netflix",
    priceRise: rise(["2026-01-02", 1549], 1799, 1549, "2026-03-02", 250, 3000),
  },
  {
    file: "uk-debit-credit.csv",
    merchantKey: "netflix",
    priceRise: rise(["2026-01-02", 1099], 1299, 1099, "2026-03-02", 200, 2400),
  },
  {
    file: "eu-semicolon.csv",
    merchantKey: "merchant:streaming-dienst-monatsbeitrag",
    priceRise: rise(["2026-01-03", 1299], 1499, 1299, "2026-03-02", 200, 2400),
  },
  {
    file: "with-preamble.csv",
    merchantKey: "merchant:streamly-video-monthly",
    priceRise: rise(["2026-01-03", 1199], 1399, 1199, "2026-03-03", 200, 2400),
  },
];

function detectSample(file: string): Subscription[] {
  const parsed = parseStatement(readFileSync(`${SAMPLES}${file}`, "utf8"));
  if (parsed.status !== "mapped") {
    throw new Error(`${file} did not map: ${parsed.status}`);
  }
  return detectSubscriptions(normalizeTransactions(parsed.transactions)).subscriptions;
}

function withoutClassifierFields(s: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...s };
  delete rest.labels;
  delete rest.priceRise;
  delete rest.trial;
  return rest;
}

describe.each(ROWS)("Req 8.1 and 8.2: $file", ({ file, merchantKey, priceRise }) => {
  const detected = detectSample(file);
  const classified = classifySubscriptions(detected);

  it("labels exactly the listed Subscription as possessed", () => {
    expect(classified.filter((s) => s.merchantKey === merchantKey)).toHaveLength(1);
    const row = classified.find((s) => s.merchantKey === merchantKey);
    expect(row?.labels).toEqual(["possessed"]);
    expect(row?.priceRise).toEqual(priceRise);
    expect(row?.trial).toBeNull();
  });

  it("gives every other Subscription no label, no priceRise and no trial", () => {
    const others = classified.filter((s) => s.merchantKey !== merchantKey);
    expect(others.length).toBe(detected.length - 1);
    for (const s of others) {
      expect({
        key: s.merchantKey,
        labels: s.labels,
        priceRise: s.priceRise,
        trial: s.trial,
      }).toEqual({ key: s.merchantKey, labels: [], priceRise: null, trial: null });
    }
  });

  it("keeps the Detector's order and every other field", () => {
    expect(classified).toHaveLength(detected.length);
    classified.forEach((s, i) => {
      expect(withoutClassifierFields({ ...s })).toEqual(
        withoutClassifierFields({ ...detected[i] }),
      );
    });
  });
});

describe("Req 6.7: us-signed.csv answers", () => {
  const detected = detectSample("us-signed.csv");

  function labelsFor(answers: [string, UsageAnswer][]) {
    const result = classifySubscriptions(detected, new Map(answers));
    const labels = (key: string) => result.find((s) => s.merchantKey === key)?.labels;
    return {
      netflix: labels("netflix"),
      spotify: labels("spotify"),
      adobe: labels("adobe"),
      ids: result.map((s) => s.id),
    };
  }

  it("absent answers", () => {
    const r = labelsFor([]);
    expect([r.netflix, r.spotify, r.adobe]).toEqual([["possessed"], [], []]);
  });

  it("Netflix not-using", () => {
    const r = labelsFor([["sub:USD:monthly:*:netflix", "not-using"]]);
    expect([r.netflix, r.spotify, r.adobe]).toEqual([["zombie", "possessed"], [], []]);
  });

  it("Spotify not-using, Adobe still-using", () => {
    const r = labelsFor([
      ["sub:USD:monthly:*:spotify", "not-using"],
      ["sub:USD:monthly:*:adobe", "still-using"],
    ]);
    expect([r.netflix, r.spotify, r.adobe]).toEqual([["possessed"], ["zombie"], []]);
  });

  it("an answer for hulu changes nothing, and the hulu id is not in the result", () => {
    const r = labelsFor([["sub:USD:monthly:*:hulu", "not-using"]]);
    expect(r.ids).not.toContain("sub:USD:monthly:*:hulu");
    expect([r.netflix, r.spotify, r.adobe]).toEqual([["possessed"], [], []]);
  });
});
