import { describe, expect, it } from "vitest";
import type { RemovalLog, Token, TokenList } from "./internal-types.js";
import { lex } from "./lex.js";
import {
  removeLeading,
  removeRun,
  removeTokens,
  removeTrailing,
  spanOfRun,
  tokensFrom,
} from "./token-list.js";

function listOf(text: string, withSpans = true): TokenList {
  return tokensFrom(lex(text.normalize("NFKC")), withSpans);
}

/** Compact view: `gapBefore|folded` per token. */
function view(list: TokenList): string[] {
  return list.tokens.map((t) => `${t.gapBefore}|${t.folded}`);
}

const isDate = (t: Token): "date" | null => (/^\d/u.test(t.folded) ? "date" : null);

describe("tokensFrom", () => {
  it("puts the gap in front of a word into gapBefore", () => {
    const list = listOf("PAYPAL *NETFLIX");
    expect(view(list)).toEqual(["|paypal", " *|netflix"]);
    expect(list.trailingGap).toBe("");
  });

  it("keeps the gap after the last word as trailingGap", () => {
    expect(listOf("PAYPAL *").trailingGap).toBe(" *");
    expect(view(listOf("PAYPAL *"))).toEqual(["|paypal"]);
  });

  it("handles empty input and gap-only input", () => {
    expect(listOf("")).toEqual({ tokens: [], trailingGap: "" });
    expect(listOf(" * ")).toEqual({ tokens: [], trailingGap: " * " });
  });

  it("stores the lexeme index as the span, or null without spans", () => {
    expect(listOf("A B").tokens.map((t) => t.span)).toEqual([
      { first: 0, last: 0 },
      { first: 2, last: 2 },
    ]);
    expect(listOf("A B", false).tokens.map((t) => t.span)).toEqual([null, null]);
  });

  it("folds gapBefore", () => {
    expect(listOf("A \uFF0A B").tokens[1]?.gapBefore).toBe(" * ");
  });
});

describe("spanOfRun", () => {
  it("covers the first to the last token, or is null", () => {
    const { tokens } = listOf("A B C");
    expect(spanOfRun(tokens, 0, 3)).toEqual({ first: 0, last: 4 });
    expect(spanOfRun(tokens, 1, 1)).toBeNull();
    expect(spanOfRun(listOf("A B", false).tokens, 0, 2)).toBeNull();
  });
});

describe("removeTokens", () => {
  it("merges the gaps of removed tokens into the next token (PAYPAL 12/03 *X)", () => {
    const list = listOf("PAYPAL 12/03 *X");
    expect(view(list)).toEqual(["|paypal", " |12", "/|03", " *|x"]);
    const log: RemovalLog = [];
    const out = removeTokens(list, (t) => (/^\d+$/u.test(t.folded) ? "date" : null), log);
    expect(view(out)).toEqual(["|paypal", " / *|x"]);
    expect(out.tokens[1]?.gapBefore.endsWith("*")).toBe(true);
  });

  it("does not modify its input", () => {
    const list = listOf("PAYPAL 12/03 *X");
    const before = JSON.stringify(list);
    removeTokens(list, isDate, []);
    expect(JSON.stringify(list)).toBe(before);
  });

  it("removing the last token is safe and moves its gaps into trailingGap", () => {
    const log: RemovalLog = [];
    const out = removeTokens(
      listOf("NETFLIX 12 *"),
      (t) => (t.folded === "12" ? "date" : null),
      log,
    );
    expect(view(out)).toEqual(["|netflix"]);
    expect(out.trailingGap).toBe("  *");
    expect(log).toHaveLength(1);
  });

  it("can remove every token", () => {
    const out = removeTokens(listOf("A *B"), () => "trailing", []);
    expect(out).toEqual({ tokens: [], trailingGap: " *" });
  });

  it("keeps a PayPal-style trailing `*` visible after the last token is the only one left", () => {
    const out = removeTokens(listOf("PAYPAL *"), () => null, []);
    expect(out.trailingGap).toContain("*");
  });

  it("logs reason and span for each removed token", () => {
    const log: RemovalLog = [];
    removeTokens(listOf("A 12 B 03"), (t) => (/^\d/u.test(t.folded) ? "date" : null), log);
    expect(log).toEqual([
      { reason: "date", span: { first: 2, last: 2 } },
      { reason: "date", span: { first: 6, last: 6 } },
    ]);
  });

  it("logs a null span when tokens have no spans", () => {
    const log: RemovalLog = [];
    removeTokens(listOf("A 12", false), isDate, log);
    expect(log).toEqual([{ reason: "date", span: null }]);
  });
});

describe("removeRun", () => {
  it("removes a middle run as one logged removal and merges its gaps forward", () => {
    const log: RemovalLog = [];
    const out = removeRun(listOf("A CARD ENDING 1234 *B"), 1, 3, "card-number", log);
    // three removed gaps of one space each, then b's own gap " *"
    expect(view(out)).toEqual(["|a", "    *|b"]);
    expect(log).toEqual([{ reason: "card-number", span: { first: 2, last: 6 } }]);
  });

  it("clamps the range and logs nothing for an empty range", () => {
    const log: RemovalLog = [];
    const list = listOf("A B");
    expect(removeRun(list, 5, 2, "date", log)).toEqual(list);
    expect(removeRun(list, 1, 0, "date", log)).toEqual(list);
    expect(log).toEqual([]);
    const out = removeRun(list, 1, 10, "date", log);
    expect(view(out)).toEqual(["|a"]);
    expect(out.trailingGap).toBe(" ");
    expect(log).toHaveLength(1);
  });
});

describe("removeLeading", () => {
  const step = (list: TokenList, cursor: number) =>
    list.tokens[cursor]?.folded === "pos" ? { length: 1, reason: "prefix" as const } : null;

  it("removes leading matches, logs each, and merges their gaps into the first kept token", () => {
    const log: RemovalLog = [];
    const out = removeLeading(listOf("POS POS *NETFLIX"), step, log);
    expect(view(out)).toEqual(["  *|netflix"]);
    expect(log.map((r) => r.reason)).toEqual(["prefix", "prefix"]);
  });

  it("stops at the first non-match, so a prefix in the middle is kept", () => {
    const out = removeLeading(listOf("NETFLIX POS"), step, []);
    expect(view(out)).toEqual(["|netflix", " |pos"]);
  });

  it("removing everything leaves the gaps in trailingGap", () => {
    const out = removeLeading(listOf("POS POS *"), step, []);
    expect(out).toEqual({ tokens: [], trailingGap: "  *" });
  });

  it("ignores a step that returns length 0", () => {
    const list = listOf("A B");
    expect(removeLeading(list, () => ({ length: 0, reason: "prefix" }), [])).toEqual(list);
  });
});

describe("removeTrailing", () => {
  const step = (list: TokenList, end: number) =>
    list.tokens[end - 1]?.folded === "ca" ? { length: 1, reason: "trailing" as const } : null;

  it("removes trailing matches, logs each, and keeps their gaps in trailingGap", () => {
    const log: RemovalLog = [];
    const out = removeTrailing(listOf("NETFLIX CA CA"), step, log);
    expect(view(out)).toEqual(["|netflix"]);
    expect(out.trailingGap).toBe("  ");
    expect(log).toEqual([
      { reason: "trailing", span: { first: 4, last: 4 } },
      { reason: "trailing", span: { first: 2, last: 2 } },
    ]);
  });

  it("leaves the list alone when nothing matches", () => {
    const list = listOf("CA NETFLIX");
    expect(removeTrailing(list, step, [])).toEqual(list);
  });

  it("is safe on an empty list", () => {
    expect(removeTrailing(listOf(""), step, [])).toEqual({ tokens: [], trailingGap: "" });
  });
});
