import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext } from "./internal-types.js";
import { lex } from "./lex.js";
import { removeReferences, removeStoreNumbers } from "./rule-references.js";
import { tokensFrom } from "./token-list.js";

function ctxOf(firstPass: boolean, log: RemovalLog): RuleContext {
  return { firstPass, processor: null, log };
}

function references(text: string): { folded: string[]; log: RemovalLog } {
  const log: RemovalLog = [];
  const list = removeReferences(tokensFrom(lex(text.normalize("NFKC"))), ctxOf(true, log));
  return { folded: list.tokens.map((t) => t.folded), log };
}

function stores(text: string, firstPass = true): { folded: string[]; log: RemovalLog } {
  const log: RemovalLog = [];
  const list = removeStoreNumbers(tokensFrom(lex(text.normalize("NFKC"))), ctxOf(firstPass, log));
  return { folded: list.tokens.map((t) => t.folded), log };
}

describe("removeReferences", () => {
  it.each(["2K4LJ8MB3", "P1A2B3C4D5", "0412", "123456"])("removes %s", (ref) => {
    const result = references(`FOO ${ref} BAR`);
    expect(result.folded).toEqual(["foo", "bar"]);
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.reason).toBe("reference");
  });

  it.each(["1PASSWORD", "MP3", "B2B", "365", "A1B2C"])("keeps %s", (word) => {
    expect(references(`FOO ${word}`).folded).toEqual(["foo", word.toLowerCase()]);
  });

  it("keeps hyphenated words such as 7-ELEVEN", () => {
    expect(references("7-ELEVEN 12345").folded).toEqual(["7-eleven"]);
  });
});

describe("removeStoreNumbers", () => {
  it("removes #ddd in pass 1", () => {
    const result = stores("FOO #0412 BAR");
    expect(result.folded).toEqual(["foo", "bar"]);
    expect(result.log[0]?.reason).toBe("store-number");
    expect(stores("FOO #12 BAR").folded).toEqual(["foo", "bar"]);
  });

  it("does not see # after pass 1", () => {
    expect(stores("FOO 12 BAR", false).folded).toEqual(["foo", "12", "bar"]);
  });

  it.each(["STORE 12", "NO 7", "NR 3"])("removes %s", (phrase) => {
    const result = stores(`FOO ${phrase} BAR`);
    expect(result.folded).toEqual(["foo", "bar"]);
    expect(result.log.map((r) => r.reason)).toEqual(["store-number", "store-number"]);
  });

  it("keeps the words without a number and numbers without the word", () => {
    expect(stores("NO THANKS").folded).toEqual(["no", "thanks"]);
    expect(stores("FOO 12").folded).toEqual(["foo", "12"]);
    expect(stores("STORE ABC").folded).toEqual(["store", "abc"]);
  });

  it("keeps the gap of a removed pair on the next token", () => {
    const log: RemovalLog = [];
    const list = removeStoreNumbers(tokensFrom(lex("A *STORE 12 *B")), ctxOf(true, log));
    expect(list.tokens.map((t) => t.folded)).toEqual(["a", "b"]);
    expect(list.tokens[1]?.gapBefore).toContain("*");
  });
});

describe("step order: store numbers before references", () => {
  function storesThenReferences(text: string): string[] {
    const log: RemovalLog = [];
    const ctx = ctxOf(true, log);
    const list = removeReferences(
      removeStoreNumbers(tokensFrom(lex(text.normalize("NFKC"))), ctx),
      ctx,
    );
    return list.tokens.map((t) => t.folded);
  }

  it.each([
    ["WALGREENS STORE 1234", ["walgreens"]],
    ["FOO STORE 0412", ["foo"]],
  ])("%s loses both STORE and the number", (text, expected) => {
    expect(storesThenReferences(text)).toEqual(expected);
  });

  it("would leave STORE behind if references ran first", () => {
    const log: RemovalLog = [];
    const ctx = ctxOf(true, log);
    const list = removeStoreNumbers(
      removeReferences(tokensFrom(lex("FOO STORE 0412")), ctx),
      ctx,
    );
    expect(list.tokens.map((t) => t.folded)).toEqual(["foo", "store"]);
  });
});
