import { describe, expect, it } from "vitest";
import type { Lexeme, Token } from "./internal-types.js";
import { joinTokens, lex } from "./lex.js";

/** Compact view: words as-is, gaps wrapped in <>. */
function shape(text: string): string[] {
  return lex(text.normalize("NFKC")).map((l) => (l.kind === "word" ? l.raw : `<${l.raw}>`));
}

function words(lexemes: readonly Lexeme[]): string[] {
  return lexemes.filter((l) => l.kind === "word").map((l) => l.raw);
}

describe("lex", () => {
  it.each(["AT&T", "MCDONALD'S", "JOE\u2019S", "DISNEY+", "APPLE TV+", "7-ELEVEN"])(
    "keeps the connector inside %s",
    (text) => {
      const lexemes = lex(text);
      const w = words(lexemes);
      if (text === "APPLE TV+") {
        expect(w).toEqual(["APPLE", "TV+"]);
      } else {
        expect(w).toEqual([text]);
      }
      expect(lexemes.filter((l) => l.kind === "gap").length).toBe(text === "APPLE TV+" ? 1 : 0);
    },
  );

  it("splits A--B into two words", () => {
    expect(shape("A--B")).toEqual(["A", "<-->", "B"]);
  });

  it("splits a domain and its path", () => {
    expect(shape("APPLE.COM/BILL")).toEqual(["APPLE.COM", "</>", "BILL"]);
  });

  it("starts with a gap for ****1234", () => {
    expect(shape("****1234")).toEqual(["<****>", "1234"]);
  });

  it("keeps brackets in the gaps of (800) 123", () => {
    expect(shape("(800) 123")).toEqual(["<(>", "800", "<) >", "123"]);
  });

  it("treats a trailing dot or hyphen as a gap", () => {
    expect(shape("03.01.")).toEqual(["03.01", "<.>"]);
    expect(shape("FOO-")).toEqual(["FOO", "<->"]);
  });

  it("treats a plus after a digit as a gap unless a letter or digit follows", () => {
    expect(shape("7+")).toEqual(["7", "<+>"]);
    expect(shape("A+B")).toEqual(["A+B"]);
  });

  it("returns an empty array for empty input", () => {
    expect(lex("")).toEqual([]);
  });

  it("gives one gap for whitespace-only input", () => {
    expect(shape("  \t ")).toEqual(["<  \t >"]);
  });

  it("reads fullwidth input after NFKC", () => {
    expect(shape("ＮＥＴＦＬＩＸ＊")).toEqual(["NETFLIX", "<*>"]);
  });

  it("folds each lexeme on its own", () => {
    const [word, gap] = lex("Café ");
    expect(word).toEqual({ kind: "word", raw: "Café", folded: "cafe" });
    expect(gap).toEqual({ kind: "gap", raw: " ", folded: " " });
  });

  it("keeps emoji, control characters and lone surrogates in gaps without throwing", () => {
    expect(shape("🧟NETFLIX🪦")).toEqual(["<🧟>", "NETFLIX", "<🪦>"]);
    expect(() => lex("a\ud800b\udc00\u0000c")).not.toThrow();
    expect(words(lex("a\ud800b"))).toEqual(["a", "b"]);
  });

  it("keeps letters of every script", () => {
    expect(words(lex("ЯНДЕКС ПЛЮС"))).toEqual(["ЯНДЕКС", "ПЛЮС"]);
  });

  it("never loses a character", () => {
    const text = "POS *PAYPAL (800) 123-4567 #0412 ça/va \ud800";
    expect(
      lex(text)
        .map((l) => l.raw)
        .join(""),
    ).toBe(text);
  });

  it("lexes joined tokens back to the same words with single-space gaps", () => {
    const original = lex("SQ *BLUE BOTTLE COFFEE #0412 OAKLAND CA");
    const tokens: Token[] = original
      .filter((l) => l.kind === "word")
      .map((l) => ({ raw: l.raw, folded: l.folded, gapBefore: "", span: null }));
    const again = lex(joinTokens(tokens, "raw"));
    expect(words(again)).toEqual(tokens.map((t) => t.raw));
    for (const l of again) {
      if (l.kind === "gap") expect(l.raw).toBe(" ");
    }
  });
});

describe("joinTokens", () => {
  const tokens = [
    { raw: "Café", folded: "cafe" },
    { raw: "Müller", folded: "muller" },
  ];

  it("joins raw and folded text with single spaces", () => {
    expect(joinTokens(tokens, "raw")).toBe("Café Müller");
    expect(joinTokens(tokens, "folded")).toBe("cafe muller");
  });

  it("returns an empty string for no tokens", () => {
    expect(joinTokens([], "raw")).toBe("");
  });
});
