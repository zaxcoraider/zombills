import { describe, expect, it } from "vitest";
import { cleanField, toWellFormedText } from "./clean-text.js";

describe("toWellFormedText", () => {
  it("keeps a surrogate pair", () => {
    expect(toWellFormedText("a\uD83D\uDE00b")).toBe("a\uD83D\uDE00b");
  });
  it("replaces a lone high surrogate", () => {
    expect(toWellFormedText("a\uD800b")).toBe("a\uFFFDb");
    expect(toWellFormedText("a\uD800")).toBe("a\uFFFD");
  });
  it("replaces a lone low surrogate", () => {
    expect(toWellFormedText("a\uDC00b")).toBe("a\uFFFDb");
  });
  it("replaces both halves of a reversed pair", () => {
    expect(toWellFormedText("\uDE00\uD83D")).toBe("\uFFFD\uFFFD");
  });
  it("returns an empty string unchanged", () => {
    expect(toWellFormedText("")).toBe("");
  });
});

describe("cleanField", () => {
  const classes: Array<[string, string]> = [
    ["space", " "],
    ["tab", "\t"],
    ["no-break space", "\u00A0"],
    ["ideographic space", "\u3000"],
    ["U+0000", "\u0000"],
    ["U+001F", "\u001F"],
    ["U+007F", "\u007F"],
    ["U+009F", "\u009F"],
    ["U+2028", "\u2028"],
    ["U+2029", "\u2029"],
    ["U+00AD", "\u00AD"],
    ["U+200B", "\u200B"],
    ["U+200F", "\u200F"],
    ["U+202A", "\u202A"],
    ["U+202E", "\u202E"],
    ["U+2060", "\u2060"],
    ["U+2064", "\u2064"],
    ["U+2066", "\u2066"],
    ["U+2069", "\u2069"],
    ["U+FEFF", "\uFEFF"],
    ["U+0600", "\u0600"],
    ["U+E0001", "\u{E0001}"],
  ];
  for (const [name, ch] of classes) {
    it(`turns ${name} between words into one space`, () => {
      expect(cleanField(`a${ch}b`)).toBe("a b");
    });
    it(`drops ${name} at the ends`, () => {
      expect(cleanField(`${ch}ab${ch}`)).toBe("ab");
    });
  }

  it("turns a mixed run into one space", () => {
    expect(cleanField("a\n\t b")).toBe("a b");
    expect(cleanField("a\u200B b")).toBe("a b");
  });

  it("keeps 80 code points and cuts 81 to 80", () => {
    expect(cleanField("x".repeat(80))).toBe("x".repeat(80));
    expect(cleanField("x".repeat(81))).toBe("x".repeat(80));
  });

  it("counts code points, never splitting a pair at the cut", () => {
    const pair = "\uD83D\uDE00";
    const out = cleanField(pair.repeat(81));
    expect(Array.from(out)).toHaveLength(80);
    expect(out).toBe(pair.repeat(80));
    const edge = cleanField("x".repeat(79) + pair + "y");
    expect(edge).toBe("x".repeat(79) + pair);
  });

  it("trims a space left at the cut", () => {
    expect(cleanField("x".repeat(79) + " y")).toBe("x".repeat(79));
  });

  it("repairs surrogates and folds separators together", () => {
    expect(cleanField("Net\u200Bflix\uD800")).toBe("Net flix\uFFFD");
  });

  it("gives an empty string for a non-string", () => {
    expect(cleanField(42)).toBe("");
    expect(cleanField(undefined)).toBe("");
    expect(cleanField(null)).toBe("");
  });
});
