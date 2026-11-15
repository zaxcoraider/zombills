import { describe, expect, it } from "vitest";
import euSemicolon from "../../../../../samples/eu-semicolon.csv?raw";
import ukDebitCredit from "../../../../../samples/uk-debit-credit.csv?raw";
import usSigned from "../../../../../samples/us-signed.csv?raw";
import withPreamble from "../../../../../samples/with-preamble.csv?raw";
import { analyzeStatement } from "./analyze-statement";

describe("analyzeStatement outcome kinds", () => {
  it("returns empty for an empty string and for blank lines", () => {
    expect(analyzeStatement("")).toEqual({ kind: "empty" });
    expect(analyzeStatement("\n\n")).toEqual({ kind: "empty" });
  });

  it("returns parse-error with the parser's reason for conflicting date formats", () => {
    const csv = ["Date,Description,Amount", "13/05/2026,Coffee,-3.50", "05/13/2026,Tea,-2.50"].join(
      "\n",
    );
    const outcome = analyzeStatement(csv);
    expect(outcome.kind).toBe("parse-error");
    if (outcome.kind === "parse-error") {
      expect(outcome.reason).toMatch(/conflicting date formats/i);
    }
  });

  it("returns columns-unreadable with all three missing for Foo,Bar", () => {
    expect(analyzeStatement("Foo,Bar\n1,2")).toEqual({
      kind: "columns-unreadable",
      columns: ["Foo", "Bar"],
      found: { date: false, description: false, amount: false },
    });
  });

  it("reports a missing description", () => {
    const outcome = analyzeStatement("Date,Amount\n2026-01-01,-5.00");
    expect(outcome).toMatchObject({
      kind: "columns-unreadable",
      found: { date: true, description: false, amount: true },
    });
  });

  it("reports a missing amount when there is a debit column without a credit column", () => {
    const outcome = analyzeStatement("Date,Description,Debit\n2026-01-01,Coffee,5.00");
    expect(outcome).toMatchObject({
      kind: "columns-unreadable",
      found: { date: true, description: true, amount: false },
    });
  });

  it("returns no-transactions with the row count when every row is bad", () => {
    const csv = ["Date,Description,Amount", "not a date,Coffee,-3.50", "also bad,Tea,xyz"].join(
      "\n",
    );
    const outcome = analyzeStatement(csv);
    expect(outcome.kind).toBe("no-transactions");
    if (outcome.kind === "no-transactions") {
      expect(outcome.rowErrorCount).toBe(2);
    }
  });

  it("returns no-subscriptions with its facts for one non-recurring row", () => {
    const outcome = analyzeStatement("Date,Description,Amount\n2026-01-05,Corner Grocery,-12.34");
    expect(outcome.kind).toBe("no-subscriptions");
    if (outcome.kind === "no-subscriptions") {
      expect(outcome.transactionCount).toBe(1);
      expect(outcome.rowErrorCount).toBe(0);
      expect(outcome.detectedCurrency.code).toBe("USD");
      expect(outcome.statement.currencies).toEqual(["USD"]);
      expect(outcome.statement.firstDate).toBe("2026-01-05");
      expect(outcome.statement.lastDate).toBe("2026-01-05");
    }
  });
});

type Label = "zombie" | "possessed" | "trial-trap";

interface RiseExpectation {
  firstSeen: { date: string; amountCents: number };
  currentAmountCents: number;
  latestRise: { fromAmountCents: number; toAmountCents: number; date: string };
  increasePerChargeCents: number;
  increasePerYearCents: number;
}

interface Expected {
  name: string;
  csv: string;
  currency: string;
  subscriptions: [merchant: string, yearlyCostCents: number, labels: Label[]][];
  /** The one possessed row of the Sample (Req 8.1) */
  rise: { merchant: string; priceRise: RiseExpectation };
}

const SAMPLES: Expected[] = [
  {
    name: "us-signed",
    csv: usSigned,
    currency: "USD",
    subscriptions: [
      ["Adobe Creative Cloud", 65988, []],
      ["Riverside Gym Membership", 34800, []],
      ["Netflix", 21588, ["possessed"]],
      ["Spotify", 13188, []],
    ],
    rise: {
      merchant: "Netflix",
      priceRise: {
        firstSeen: { date: "2026-01-02", amountCents: 1549 },
        currentAmountCents: 1799,
        latestRise: { fromAmountCents: 1549, toAmountCents: 1799, date: "2026-03-02" },
        increasePerChargeCents: 250,
        increasePerYearCents: 3000,
      },
    },
  },
  {
    name: "uk-debit-credit",
    csv: ukDebitCredit,
    currency: "GBP",
    subscriptions: [
      ["Fitzone Gym Ltd", 29988, []],
      ["Netflix", 15588, ["possessed"]],
      ["Spotify", 14388, []],
      ["Amazon Prime", 10788, []],
      ["Disney+", 9588, []],
    ],
    rise: {
      merchant: "Netflix",
      priceRise: {
        firstSeen: { date: "2026-01-02", amountCents: 1099 },
        currentAmountCents: 1299,
        latestRise: { fromAmountCents: 1099, toAmountCents: 1299, date: "2026-03-02" },
        increasePerChargeCents: 200,
        increasePerYearCents: 2400,
      },
    },
  },
  {
    name: "eu-semicolon",
    csv: euSemicolon,
    currency: "EUR",
    subscriptions: [
      ["Fitnessstudio Lindenhof", 29880, []],
      ["Streaming Dienst Monatsbeitrag", 17988, ["possessed"]],
      ["Musikdienst Premium", 11988, []],
    ],
    rise: {
      merchant: "Streaming Dienst Monatsbeitrag",
      priceRise: {
        firstSeen: { date: "2026-01-03", amountCents: 1299 },
        currentAmountCents: 1499,
        latestRise: { fromAmountCents: 1299, toAmountCents: 1499, date: "2026-03-02" },
        increasePerChargeCents: 200,
        increasePerYearCents: 2400,
      },
    },
  },
  {
    name: "with-preamble",
    csv: withPreamble,
    currency: "USD",
    subscriptions: [
      ["Fit House Membership", 42000, []],
      ["Streamly Video Monthly", 16788, ["possessed"]],
      ["Cloudvault Storage 200gb", 3588, []],
    ],
    rise: {
      merchant: "Streamly Video Monthly",
      priceRise: {
        firstSeen: { date: "2026-01-03", amountCents: 1199 },
        currentAmountCents: 1399,
        latestRise: { fromAmountCents: 1199, toAmountCents: 1399, date: "2026-03-03" },
        increasePerChargeCents: 200,
        increasePerYearCents: 2400,
      },
    },
  },
];

describe.each(SAMPLES)("analyzeStatement on the $name Sample", (sample) => {
  const outcome = analyzeStatement(sample.csv);

  it("returns results with the merchants, yearly costs and order the detector expects", () => {
    expect(outcome.kind).toBe("results");
    if (outcome.kind !== "results") return;
    expect(outcome.subscriptions.map((s) => [s.merchant, s.yearlyCostCents, s.labels])).toEqual(
      sample.subscriptions,
    );
  });

  it("gives the possessed row the price rise of the Sample file and every other row none", () => {
    if (outcome.kind !== "results") throw new Error("expected results");
    for (const s of outcome.subscriptions) {
      if (s.merchant === sample.rise.merchant) {
        expect(s.priceRise).toEqual(sample.rise.priceRise);
      } else {
        expect(s.priceRise).toBeNull();
      }
      expect(s.trial).toBeNull();
    }
  });

  it("totals the yearly costs in the statement currency", () => {
    if (outcome.kind !== "results") throw new Error("expected results");
    const sum = sample.subscriptions.reduce((acc, [, cents]) => acc + cents, 0);
    expect(outcome.totals).toEqual([{ currency: sample.currency, totalCents: sum }]);
    expect(outcome.detectedCurrency.code).toBe(sample.currency);
  });
});
