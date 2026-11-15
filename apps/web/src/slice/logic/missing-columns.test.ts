import { describe, expect, it } from "vitest";
import { findColumns } from "./missing-columns";

describe("findColumns", () => {
  it("matches with case and surrounding spaces ignored", () => {
    expect(findColumns(["  DATE ", " Description", "AMOUNT  "])).toEqual({
      date: true,
      description: true,
      amount: true,
    });
  });

  it("reports nothing found for unrelated names and for an empty list", () => {
    const none = { date: false, description: false, amount: false };
    expect(findColumns(["Foo", "Bar"])).toEqual(none);
    expect(findColumns([])).toEqual(none);
  });

  it("counts debit and credit together as the amount", () => {
    expect(findColumns(["Date", "Description", "Debit", "Credit"]).amount).toBe(true);
  });

  it("does not count a debit alone, or a credit alone, as the amount", () => {
    expect(findColumns(["Date", "Description", "Debit"]).amount).toBe(false);
    expect(findColumns(["Date", "Description", "Credit"]).amount).toBe(false);
  });

  it("reports each missing role on its own", () => {
    expect(findColumns(["Date", "Amount"])).toEqual({
      date: true,
      description: false,
      amount: true,
    });
    expect(findColumns(["Description", "Amount"])).toEqual({
      date: false,
      description: true,
      amount: true,
    });
  });

  it.each([
    ["Paid out", "Paid in"],
    ["Money out", "Money in"],
    ["PAID OUT", " paid in "],
  ])("counts %s and %s together as the amount", (debit, credit) => {
    expect(findColumns(["Date", "Description", debit, credit]).amount).toBe(true);
    expect(findColumns(["Date", "Description", debit]).amount).toBe(false);
    expect(findColumns(["Date", "Description", credit]).amount).toBe(false);
  });

  it("matches Posting Date as the date column", () => {
    expect(findColumns(["Posting Date", "Description", "Amount"]).date).toBe(true);
  });
});
