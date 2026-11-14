import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext, TokenList } from "./internal-types.js";
import { lex } from "./lex.js";
import { removeCardNumbers } from "./rule-card-numbers.js";
import { tokensFrom } from "./token-list.js";

function run(text: string): { folded: string[]; list: TokenList; log: RemovalLog } {
  const log: RemovalLog = [];
  const ctx: RuleContext = { firstPass: true, processor: null, log };
  const list = removeCardNumbers(tokensFrom(lex(text.normalize("NFKC"))), ctx);
  return { folded: list.tokens.map((t) => t.folded), list, log };
}

describe("removeCardNumbers", () => {
  it.each([
    ["XXXX1234 NETFLIX", ["netflix"]],
    ["NETFLIX ****1234", ["netflix"]],
    ["NETFLIX CARD 1234", ["netflix"]],
    ["NETFLIX CARD ENDING 1234", ["netflix"]],
    ["NETFLIX CARD NO 1234", ["netflix"]],
    ["NETFLIX xx1234 FOO", ["netflix", "foo"]],
  ])("removes the mask in %s", (text, expected) => {
    expect(run(text).folded).toEqual(expected);
  });

  it.each([
    ["XX123", ["xx123"]],
    ["X1234", ["x1234"]],
    ["CARD 12345", ["card", "12345"]],
    ["NETFLIX 1234", ["netflix", "1234"]],
    ["NETFLIX *1234", ["netflix", "1234"]],
    ["CARD ENDING", ["card", "ending"]],
    ["CARD NO ABCD", ["card", "no", "abcd"]],
  ])("keeps %s", (text, expected) => {
    expect(run(text).folded).toEqual(expected);
  });

  it("logs one card-number removal per mask, with its span", () => {
    const { log } = run("CARD ENDING 1234 X");
    expect(log).toEqual([{ reason: "card-number", span: { first: 0, last: 4 } }]);
  });

  it("keeps the gaps of removed tokens on the next token", () => {
    const { list } = run("PAYPAL XXXX1234 *X");
    expect(list.tokens.map((t) => `${t.gapBefore}|${t.folded}`)).toEqual(["|paypal", "  *|x"]);
  });

  it("is safe when the last token is removed and when the input is empty", () => {
    expect(run("NETFLIX ****1234").list.trailingGap).toBe(" ****");
    expect(run("").folded).toEqual([]);
  });
});
