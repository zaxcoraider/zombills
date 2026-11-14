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

  it("folds ẞ, ß and SS to ss and iota subscripts to iotas in every case form", () => {
    expect(fold("ẞ")).toBe("ss");
    expect(fold("ß")).toBe("ss");
    expect(fold("SS")).toBe("ss");
    expect(fold("ᾳ")).toBe(fold("ᾼ"));
    expect(fold("ᾳ")).toBe(fold("ΑΙ"));
  });

  it("gives equal results for every code point, its upper case and its lower case", () => {
    const failures: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const c = String.fromCodePoint(cp);
      const f = fold(c);
      if (f !== fold(c.toUpperCase()) || f !== fold(c.toLowerCase())) {
        failures.push(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
