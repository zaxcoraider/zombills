import { describe, expect, it } from "vitest";
import { autoDetectColumns, findCurrencyColumn, resolveColumnMap } from "./columns";
import type { ColumnMap } from "./types";

// The recognised spellings are written out here, independently of header-names.ts.
const DATE_NAMES = ["date", "transaction date", "posted date", "value date", "trans. date"];
const DESCRIPTION_NAMES = [
  "description",
  "memo",
  "narrative",
  "details",
  "merchant",
  "payee",
  "transaction description",
];
const AMOUNT_NAMES = ["amount", "transaction amount", "net amount", "value"];
const DEBIT_NAMES = ["debit", "debit amount", "withdrawal", "withdrawals"];
const CREDIT_NAMES = ["credit", "credit amount", "deposit", "deposits"];

describe("autoDetectColumns: each recognised spelling (Req 2.1-2.4)", () => {
  it.each(DATE_NAMES)("date column named %j", (name) => {
    expect(autoDetectColumns(["Other", name, "Description", "Amount"])).toEqual({
      layout: "signed-amount",
      date: 1,
      description: 2,
      amount: 3,
      currency: null,
    });
  });

  it.each(DESCRIPTION_NAMES)("description column named %j", (name) => {
    expect(autoDetectColumns(["Date", name, "Amount"])).toEqual({
      layout: "signed-amount",
      date: 0,
      description: 1,
      amount: 2,
      currency: null,
    });
  });

  it.each(AMOUNT_NAMES)("amount column named %j", (name) => {
    expect(autoDetectColumns(["Date", "Description", name])).toEqual({
      layout: "signed-amount",
      date: 0,
      description: 1,
      amount: 2,
      currency: null,
    });
  });

  it.each(DEBIT_NAMES)("debit column named %j", (name) => {
    expect(autoDetectColumns(["Date", "Description", name, "Credit"])).toEqual({
      layout: "debit-credit",
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
      currency: null,
    });
  });

  it.each(CREDIT_NAMES)("credit column named %j", (name) => {
    expect(autoDetectColumns(["Date", "Description", "Debit", name])).toEqual({
      layout: "debit-credit",
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
      currency: null,
    });
  });
});

describe("autoDetectColumns: choosing among columns", () => {
  it("takes the leftmost match for each role (Req 2.1-2.3)", () => {
    expect(
      autoDetectColumns(["Memo", "Date", "Posted Date", "Description", "Value", "Amount"]),
    ).toEqual({
      layout: "signed-amount",
      date: 1,
      description: 0,
      amount: 4,
      currency: null,
    });
  });

  it("takes the leftmost debit and credit columns (Req 2.4)", () => {
    expect(
      autoDetectColumns(["Date", "Details", "Credit", "Deposit", "Withdrawal", "Debit"]),
    ).toEqual({
      layout: "debit-credit",
      date: 0,
      description: 1,
      debit: 4,
      credit: 2,
      currency: null,
    });
  });

  it("uses the debit/credit layout when an amount column is present too (Req 2.5)", () => {
    expect(autoDetectColumns(["Date", "Description", "Amount", "Debit", "Credit"])).toEqual({
      layout: "debit-credit",
      date: 0,
      description: 1,
      debit: 3,
      credit: 4,
      currency: null,
    });
  });

  it("uses the signed layout when only a debit or only a credit column sits next to an amount", () => {
    for (const lone of ["Debit", "Credit"]) {
      expect(autoDetectColumns(["Date", "Description", lone, "Amount"])).toEqual({
        layout: "signed-amount",
        date: 0,
        description: 1,
        amount: 3,
        currency: null,
      });
    }
  });

  it("ignores unrecognised columns and keeps indices into the full header", () => {
    expect(
      autoDetectColumns(["Ref", "Balance", "Posted Date", "Category", "Memo", "Net Amount"]),
    ).toEqual({
      layout: "signed-amount",
      date: 2,
      description: 4,
      amount: 5,
      currency: null,
    });
  });

  it("copes with blank and duplicate header names", () => {
    expect(autoDetectColumns(["", "Date", "", "Description", "Amount", "Amount", ""])).toEqual({
      layout: "signed-amount",
      date: 1,
      description: 3,
      amount: 4,
      currency: null,
    });
  });

  it("matches ignoring case and surrounding whitespace (Req 2.10)", () => {
    expect(autoDetectColumns(["  Posted Date ", "DESCRIPTION", "\tAmount\n"])).toEqual({
      layout: "signed-amount",
      date: 0,
      description: 1,
      amount: 2,
      currency: null,
    });
    expect(autoDetectColumns(["\u00a0DATE\u00a0", "Memo", " WITHDRAWALS", "Deposits "])).toEqual({
      layout: "debit-credit",
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
      currency: null,
    });
  });

  it("does not match names that merely contain a recognised name", () => {
    expect(autoDetectColumns(["Date posted", "Description text", "Total amount"])).toBeNull();
  });
});

describe("autoDetectColumns: incomplete detection returns null (Req 2.7)", () => {
  it.each<[string, string[]]>([
    ["no columns", []],
    ["no date", ["Description", "Amount"]],
    ["no description", ["Date", "Amount"]],
    ["no amount and no debit/credit pair", ["Date", "Description", "Balance"]],
    ["a debit without a credit and no amount", ["Date", "Description", "Debit"]],
    ["a credit without a debit and no amount", ["Date", "Description", "Credit"]],
    ["nothing recognised", ["Booked", "Text", "Sum"]],
  ])("%s", (_name, header) => {
    expect(autoDetectColumns(header)).toBeNull();
  });
});

describe("currency column (Req 10.4)", () => {
  it("is found via 'Currency' and 'CCY', ignoring case", () => {
    expect(autoDetectColumns(["Date", "Description", "Amount", "Currency"])?.currency).toBe(3);
    expect(autoDetectColumns(["Date", "Description", "Amount", "CCY"])?.currency).toBe(3);
    expect(autoDetectColumns(["Date", "Description", "Amount", " ccy "])?.currency).toBe(3);
  });

  it("takes the leftmost of several", () => {
    expect(findCurrencyColumn(["Amount", "CCY", "Currency"])).toBe(1);
  });

  it("is null when there is none", () => {
    expect(findCurrencyColumn(["Date", "Description", "Amount"])).toBeNull();
    expect(autoDetectColumns(["Date", "Description", "Amount"])?.currency).toBeNull();
  });

  it("is found in the debit/credit layout too", () => {
    expect(autoDetectColumns(["Date", "Memo", "Debit", "Credit", "Ccy"])?.currency).toBe(4);
  });
});

describe("resolveColumnMap: valid maps (Req 2.8, 9.2, 9.3)", () => {
  it("resolves a signed layout whose headers are not recognised", () => {
    const header = ["Booked", "Text", "Sum"];
    expect(
      resolveColumnMap(header, { date: "Booked", description: "Text", amount: "Sum" }),
    ).toEqual({
      ok: true,
      columns: { layout: "signed-amount", date: 0, description: 1, amount: 2, currency: null },
    });
  });

  it("resolves a debit/credit layout", () => {
    const header = ["Booked", "Text", "Out", "In"];
    expect(
      resolveColumnMap(header, { date: "Booked", description: "Text", debit: "Out", credit: "In" }),
    ).toEqual({
      ok: true,
      columns: {
        layout: "debit-credit",
        date: 0,
        description: 1,
        debit: 2,
        credit: 3,
        currency: null,
      },
    });
  });

  it("uses the map in place of auto-detection, even when the headers are recognisable", () => {
    const header = ["Date", "Description", "Amount", "Other"];
    expect(
      resolveColumnMap(header, { date: "Other", description: "Description", amount: "Amount" }),
    ).toEqual({
      ok: true,
      columns: { layout: "signed-amount", date: 3, description: 1, amount: 2, currency: null },
    });
  });

  it("matches names exactly, including surrounding whitespace and case", () => {
    const header = [" Booked ", "text", "Sum"];
    expect(
      resolveColumnMap(header, { date: " Booked ", description: "text", amount: "Sum" }).ok,
    ).toBe(true);
    const wrongCase = resolveColumnMap(header, {
      date: "Booked",
      description: "Text",
      amount: "Sum",
    });
    expect(wrongCase.ok).toBe(false);
  });

  it("takes the leftmost column when a name is duplicated", () => {
    const result = resolveColumnMap(["A", "B", "A", "C"], {
      date: "A",
      description: "B",
      amount: "C",
    });
    expect(result).toEqual({
      ok: true,
      columns: { layout: "signed-amount", date: 0, description: 1, amount: 3, currency: null },
    });
  });

  it("can map a role to a blank header", () => {
    const result = resolveColumnMap(["", "Text", "Sum"], {
      date: "",
      description: "Text",
      amount: "Sum",
    });
    expect(result).toEqual({
      ok: true,
      columns: { layout: "signed-amount", date: 0, description: 1, amount: 2, currency: null },
    });
  });

  it("ignores amount when both debit and credit are set (Req 2.5)", () => {
    const header = ["Booked", "Text", "Out", "In"];
    const result = resolveColumnMap(header, {
      date: "Booked",
      description: "Text",
      amount: "Not a column",
      debit: "Out",
      credit: "In",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.columns.layout).toBe("debit-credit");
    }
  });

  it("accepts the three required roles of the signed layout on their own", () => {
    const header = ["Booked", "Text", "Sum"];
    const result = resolveColumnMap(header, {
      date: "Booked",
      description: "Text",
      amount: "Sum",
    } satisfies ColumnMap);
    expect(result.ok).toBe(true);
  });
});

describe("resolveColumnMap: currency column", () => {
  const header = ["Booked", "Text", "Sum", "Ccy"];
  const base = { date: "Booked", description: "Text", amount: "Sum" };

  it("uses the mapped currency column", () => {
    const result = resolveColumnMap(["Booked", "Text", "Sum", "Money"], {
      ...base,
      currency: "Money",
    });
    expect(result.ok && result.columns.currency).toBe(3);
  });

  it("finds a column named currency or ccy when the map does not mention one", () => {
    const result = resolveColumnMap(header, base);
    expect(result.ok && result.columns.currency).toBe(3);
  });

  it("is null when the map has no currency and the header has none", () => {
    const result = resolveColumnMap(["Booked", "Text", "Sum"], base);
    expect(result.ok && result.columns.currency).toBeNull();
  });

  it("reports a mapped currency column that does not exist", () => {
    const result = resolveColumnMap(header, { ...base, currency: "Money" });
    expect(result).toEqual({
      ok: false,
      errors: [{ role: "currency", column: "Money", problem: "unknown-column" }],
    });
  });

  it("lets the mapped currency column win over a column named currency", () => {
    const result = resolveColumnMap(["Booked", "Text", "Sum", "Currency", "Money"], {
      ...base,
      currency: "Money",
    });
    expect(result.ok && result.columns.currency).toBe(4);
  });
});

describe("resolveColumnMap: invalid maps (Req 9.4)", () => {
  const header = ["Booked", "Text", "Sum", "Out", "In"];

  it("reports every missing role of the signed layout, in role order", () => {
    expect(resolveColumnMap(header, {})).toEqual({
      ok: false,
      errors: [
        { role: "date", column: null, problem: "missing-mapping" },
        { role: "description", column: null, problem: "missing-mapping" },
        { role: "amount", column: null, problem: "missing-mapping" },
      ],
    });
  });

  it("reports one unknown column with its role and the offending name", () => {
    expect(
      resolveColumnMap(header, { date: "Booked", description: "Memo text", amount: "Sum" }),
    ).toEqual({
      ok: false,
      errors: [{ role: "description", column: "Memo text", problem: "unknown-column" }],
    });
  });

  it("reports a missing role next to an unknown column: two invalid roles, two errors", () => {
    const result = resolveColumnMap(header, { date: "Nope", amount: "Sum" });
    expect(result).toEqual({
      ok: false,
      errors: [
        { role: "date", column: "Nope", problem: "unknown-column" },
        { role: "description", column: null, problem: "missing-mapping" },
      ],
    });
  });

  it("selects the debit/credit layout as soon as debit or credit is set, and then needs both", () => {
    expect(
      resolveColumnMap(header, {
        date: "Booked",
        description: "Text",
        amount: "Sum",
        debit: "Out",
      }),
    ).toEqual({
      ok: false,
      errors: [{ role: "credit", column: null, problem: "missing-mapping" }],
    });
    expect(resolveColumnMap(header, { date: "Booked", description: "Text", credit: "In" })).toEqual(
      {
        ok: false,
        errors: [{ role: "debit", column: null, problem: "missing-mapping" }],
      },
    );
  });

  it("reports unknown debit and credit columns separately", () => {
    const result = resolveColumnMap(header, {
      date: "Booked",
      description: "Text",
      debit: "Paid",
      credit: "Received",
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        { role: "debit", column: "Paid", problem: "unknown-column" },
        { role: "credit", column: "Received", problem: "unknown-column" },
      ],
    });
  });

  it("does not modify its arguments (Req 9.5)", () => {
    const frozenHeader = Object.freeze([...header]);
    const frozenMap = Object.freeze({ date: "Nope" });
    expect(() => resolveColumnMap(frozenHeader, frozenMap)).not.toThrow();
    expect(frozenHeader).toEqual(header);
    expect(frozenMap).toEqual({ date: "Nope" });
  });

  it("gives the same answer when called twice", () => {
    const map = { date: "Nope", description: "Text" };
    expect(resolveColumnMap(header, map)).toEqual(resolveColumnMap(header, map));
  });
});
