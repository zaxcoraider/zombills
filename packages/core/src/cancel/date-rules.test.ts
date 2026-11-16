import { describe, expect, it } from "vitest";
import { isCheckedDate } from "./date-rules.js";

describe("isCheckedDate", () => {
  it("treats 2028 and 2400 as leap years and 2100 as not", () => {
    expect(isCheckedDate("2028-02-29")).toBe(true);
    expect(isCheckedDate("2400-02-29")).toBe(true);
    expect(isCheckedDate("2100-02-29")).toBe(false);
    expect(isCheckedDate("2100-02-28")).toBe(true);
  });

  it("rejects 29 February in a common year", () => {
    expect(isCheckedDate("2026-02-29")).toBe(false);
    expect(isCheckedDate("2026-02-28")).toBe(true);
  });

  it("checks month and day bounds", () => {
    expect(isCheckedDate("2026-13-01")).toBe(false);
    expect(isCheckedDate("2026-00-10")).toBe(false);
    expect(isCheckedDate("2026-01-00")).toBe(false);
    expect(isCheckedDate("2026-01-32")).toBe(false);
    expect(isCheckedDate("2026-01-31")).toBe(true);
    expect(isCheckedDate("2026-04-30")).toBe(true);
    expect(isCheckedDate("2026-04-31")).toBe(false);
    expect(isCheckedDate("2026-12-31")).toBe(true);
  });

  it("starts at 2025-01-01", () => {
    expect(isCheckedDate("2024-12-31")).toBe(false);
    expect(isCheckedDate("2025-01-01")).toBe(true);
  });

  it("requires the yyyy-mm-dd form", () => {
    expect(isCheckedDate("2026-1-01")).toBe(false);
    expect(isCheckedDate("2026-01-1")).toBe(false);
    expect(isCheckedDate("20260101")).toBe(false);
    expect(isCheckedDate(" 2026-01-01")).toBe(false);
    expect(isCheckedDate("2026-01-01\n")).toBe(false);
    expect(isCheckedDate("")).toBe(false);
  });
});
