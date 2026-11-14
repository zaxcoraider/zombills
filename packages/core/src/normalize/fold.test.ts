import { describe, expect, it } from "vitest";
import { FOLD_LETTER_MAP, fold } from "./fold.js";

describe("fold", () => {
  it.each([
    ["Café", "cafe"],
    ["STRAßE", "strasse"],
    ["Ørsted", "orsted"],
    ["Æble", "aeble"],
    ["Łódź", "lodz"],
    ["Þór", "thor"],
    ["ЯНДЕКС", "яндекс"],
  ])("folds %s to %s", (input, expected) => {
    expect(fold(input)).toBe(expected);
  });

  it("gives equal results for the text, its upper case and its lower case", () => {
    for (const s of [
      "Café",
      "STRAßE",
      "Ørsted",
      "Æble",
      "Łódź",
      "Þór",
      "ЯНДЕКС",
      "Œuvre",
      "Đorđe",
    ]) {
      expect(fold(s.toUpperCase())).toBe(fold(s));
      expect(fold(s.toLowerCase())).toBe(fold(s));
    }
  });

  it("does not throw on lone surrogates or emoji", () => {
    expect(() => fold("\ud800")).not.toThrow();
    expect(() => fold("a\udc00b")).not.toThrow();
    expect(() => fold("🧟 NETFLIX 🪦")).not.toThrow();
    expect(fold("🧟 NETFLIX")).toBe("🧟 netflix");
  });

  it("maps upper-case and lower-case special letters alike", () => {
    expect(Object.isFrozen(FOLD_LETTER_MAP)).toBe(true);
    for (const [letter, ascii] of Object.entries(FOLD_LETTER_MAP)) {
      expect(fold(letter)).toBe(ascii);
    }
    expect(fold("ÐÞ")).toBe("dth");
  });
});
