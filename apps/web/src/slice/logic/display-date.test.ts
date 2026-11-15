import { describe, expect, it } from "vitest";
import { CADENCE_LABELS, formatDisplayDate } from "./display-date";

describe("formatDisplayDate", () => {
  it("formats a mid-month date", () => {
    expect(formatDisplayDate("2026-01-12")).toBe("12 Jan 2026");
  });

  it("drops the leading zero from the day", () => {
    expect(formatDisplayDate("2026-12-01")).toBe("1 Dec 2026");
  });

  it("formats a leap day", () => {
    expect(formatDisplayDate("2024-02-29")).toBe("29 Feb 2024");
  });

  it("returns non-ISO input unchanged", () => {
    expect(formatDisplayDate("12/01/2026")).toBe("12/01/2026");
    expect(formatDisplayDate("")).toBe("");
  });
});

describe("CADENCE_LABELS", () => {
  it("has the three display labels", () => {
    expect(CADENCE_LABELS).toEqual({ weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" });
  });
});
