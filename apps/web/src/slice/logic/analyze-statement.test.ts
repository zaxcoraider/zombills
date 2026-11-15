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
    const csv = [
      "Date,Description,Amount",
      "13/05/2026,Coffee,-3.50",
      "05/13/2026,Tea,-2.50",
    ].join("\n");
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

interface Expected {
  name: string;
  csv: string;
  currency: string;
  subscriptions: [merchant: string, yearlyCostCents: number][];
}

const SAMPLES: Expected[] = [
  {
    name: "us-signed",
    csv: usSigned,
    currency: "USD",
    subscriptions: [
      ["Adobe Creative Cloud", 65988],
      ["Riverside Gym Membership", 34800],
      ["Netflix", 21588],
      ["Spotify", 13188],
    ],
  },
  {
    name: "uk-debit-credit",
    csv: ukDebitCredit,
    currency: "GBP",
    subscriptions: [
      ["Fitzone Gym Ltd", 29988],
      ["Netflix", 15588],
      ["Spotify", 14388],
      ["Amazon Prime", 10788],
      ["Disney+", 9588],
    ],
  },
  {
    name: "eu-semicolon",
    csv: euSemicolon,
    currency: "EUR",
    subscriptions: [
      ["Fitnessstudio Lindenhof", 29880],
      ["Streaming Dienst Monatsbeitrag", 17988],
      ["Musikdienst Premium", 11988],
    ],
  },
  {
    name: "with-preamble",
    csv: withPreamble,
    currency: "USD",
    subscriptions: [
      ["Fit House Membership", 42000],
      ["Streamly Video Monthly", 16788],
      ["Cloudvault Storage 200gb", 3588],
    ],
  },
];

describe.each(SAMPLES)("analyzeStatement on the $name Sample", (sample) => {
  const outcome = analyzeStatement(sample.csv);

  it("returns results with the merchants, yearly costs and order the detector expects", () => {
    expect(outcome.kind).toBe("results");
    if (outcome.kind !== "results") return;
    expect(outcome.subscriptions.map((s) => [s.merchant, s.yearlyCostCents])).toEqual(
      sample.subscriptions,
    );
  });

  it("totals the yearly costs in the statement currency", () => {
    if (outcome.kind !== "results") throw new Error("expected results");
    const sum = sample.subscriptions.reduce((acc, [, cents]) => acc + cents, 0);
    expect(outcome.totals).toEqual([{ currency: sample.currency, totalCents: sum }]);
    expect(outcome.detectedCurrency.code).toBe(sample.currency);
  });
});
