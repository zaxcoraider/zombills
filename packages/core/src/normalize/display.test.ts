import { describe, expect, it } from "vitest";
import { slugify, titleCase } from "./display.js";

describe("titleCase", () => {
  it.each([
    ["JOE'S", "Joe's"],
    ["7-ELEVEN", "7-Eleven"],
    ["CAFÉ", "Café"],
    ["NETFLIX", "Netflix"],
    ["disney+", "Disney+"],
    ["AT&T", "At&t"],
    ["ЯНДЕКС", "Яндекс"],
  ])("%s → %s", (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });

  it("leaves ß unchanged when upper-casing would give several code points, so it is idempotent", () => {
    const once = titleCase("ßTRASSE");
    expect(once).toBe("ßtrasse");
    expect(titleCase(once)).toBe(once);
  });

  it("is idempotent on the samples", () => {
    for (const s of ["JOE'S", "7-ELEVEN", "CAFÉ", "ßTRASSE", "ǄAR", "İSTANBUL", "ŉ"]) {
      const once = titleCase(s);
      expect(titleCase(once)).toBe(once);
    }
  });

  it("handles the empty string", () => {
    expect(titleCase("")).toBe("");
  });
});

describe("slugify", () => {
  it.each([
    ["joe's pizza", "joe-s-pizza"],
    ["яндекс плюс", "яндекс-плюс"],
    ["---", ""],
    ["", ""],
    ["  foo   bar  ", "foo-bar"],
    ["disney+", "disney"],
    ["7-eleven", "7-eleven"],
  ])("%j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
