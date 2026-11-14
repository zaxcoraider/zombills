import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext } from "./internal-types.js";
import { lex } from "./lex.js";
import { CARD_PREFIXES } from "./noise-lists.js";
import { removePrefixes } from "./rule-prefixes.js";
import { tokensFrom } from "./token-list.js";
import type { ProcessorId } from "./types.js";

function run(
  text: string,
  options: { firstPass?: boolean; processor?: ProcessorId | null } = {},
): { folded: string[]; processor: ProcessorId | null; log: RemovalLog } {
  const log: RemovalLog = [];
  const ctx: RuleContext = {
    firstPass: options.firstPass ?? true,
    processor: options.processor ?? null,
    log,
  };
  const list = removePrefixes(tokensFrom(lex(text.normalize("NFKC"))), ctx);
  return { folded: list.tokens.map((t) => t.folded), processor: ctx.processor, log };
}

describe("removePrefixes: card prefixes", () => {
  it.each(CARD_PREFIXES.map((tokens) => [tokens.join(" ")]))(
    "removes %s at the start",
    (prefix) => {
      const result = run(`${prefix.toUpperCase()} NETFLIX`);
      expect(result.folded).toEqual(["netflix"]);
      expect(result.processor).toBeNull();
      expect(result.log).toHaveLength(1);
    },
  );

  it("removes the longest of overlapping prefixes first", () => {
    const result = run("DEBIT CARD PURCHASE NETFLIX");
    expect(result.folded).toEqual(["netflix"]);
    expect(result.log).toHaveLength(1);
    expect(run("SEPA DIRECT DEBIT NETFLIX").log).toHaveLength(1);
  });

  it("clears repeated prefixes", () => {
    const result = run("POS DEBIT VISA PURCHASE NETFLIX");
    expect(result.folded).toEqual(["netflix"]);
    expect(result.log.every((r) => r.reason === "prefix")).toBe(true);
  });

  it("keeps a prefix in the middle", () => {
    expect(run("NETFLIX POS").folded).toEqual(["netflix", "pos"]);
  });

  it("removes European prefixes", () => {
    expect(run("SEPA-LASTSCHRIFT SPOTIFY AB").folded).toEqual(["spotify", "ab"]);
    expect(run("KARTENZAHLUNG NETFLIX").folded).toEqual(["netflix"]);
  });

  it("removes a prefix before a processor form", () => {
    const result = run("POS PAYPAL *FOO");
    expect(result.folded).toEqual(["foo"]);
    expect(result.processor).toBe("paypal");
  });
});

describe("removePrefixes: processor forms", () => {
  it.each<[string, ProcessorId, string[]]>([
    ["PAYPAL *NETFLIX", "paypal", ["netflix"]],
    ["PP*NETFLIX", "paypal", ["netflix"]],
    ["SQ *FOO", "square", ["foo"]],
    ["SP *FOO", "shopify", ["foo"]],
    ["GOOGLE *YOUTUBE", "google", ["youtube"]],
    ["SUMUP *FOO", "sumup", ["foo"]],
    ["IZ *FOO", "zettle", ["foo"]],
    ["ZETTLE_*FOO", "zettle", ["foo"]],
    ["TST*FOO", "toast", ["foo"]],
    ["APPLE.COM/BILL", "apple", []],
    ["APPLE.COM/BILL*CA", "apple", ["ca"]],
    ["AMZN MKTP FOO", "amazon-marketplace", ["foo"]],
    ["AMAZON MKTPLACE FOO", "amazon-marketplace", ["foo"]],
    ["PAYPAL *", "paypal", []],
  ])("records %s", (text, processor, folded) => {
    const result = run(text);
    expect(result.processor).toBe(processor);
    expect(result.folded).toEqual(folded);
  });

  it.each([
    "GOOGLE STORAGE",
    "SQUARESPACE",
    "PAYPAL INC",
    "SQ FOO",
    "APPLE.COM BILL",
    "ZETTLE *FOO",
  ])("does not treat %s as a processor", (text) => {
    const result = run(text);
    expect(result.processor).toBeNull();
    expect(result.folded).toEqual(
      lex(text)
        .filter((l) => l.kind === "word")
        .map((l) => l.folded),
    );
  });

  it("does not match the * forms after pass 1", () => {
    expect(run("PAYPAL FOO", { firstPass: false }).processor).toBeNull();
  });

  it("records amazon-marketplace and consumes the country code before a *", () => {
    const result = run("AMZN MKTP US*2K4LJ8MB3");
    expect(result.processor).toBe("amazon-marketplace");
    expect(result.folded).toEqual(["2k4lj8mb3"]);
  });

  it("consumes the country code when it is last or before a reference number", () => {
    expect(run("AMZN MKTP US").folded).toEqual([]);
    expect(run("AMZN MKTP US 2K4LJ8MB3").folded).toEqual(["2k4lj8mb3"]);
  });

  it("keeps a country-code-like word that starts the merchant name", () => {
    const result = run("AMZN MKTP PS PLUS");
    expect(result.processor).toBe("amazon-marketplace");
    expect(result.folded).toEqual(["ps", "plus"]);
  });

  it("removes a further Amazon form without recording it", () => {
    const result = run("SQ *AMZN MKTP FOO");
    expect(result.processor).toBe("square");
    expect(result.folded).toEqual(["foo"]);
  });

  it("records only the first processor", () => {
    const result = run("PAYPAL *SQ *FOO");
    expect(result.processor).toBe("paypal");
    expect(result.folded).toEqual(["sq", "foo"]);
  });

  it("keeps a recorded processor from an earlier pass and still removes Amazon forms", () => {
    const result = run("AMZN MKTP FOO", { firstPass: false, processor: "square" });
    expect(result.processor).toBe("square");
    expect(result.folded).toEqual(["foo"]);
    expect(run("PAYPAL FOO", { processor: "square" }).folded).toEqual(["paypal", "foo"]);
  });

  it("logs processor removals with their span", () => {
    const result = run("PAYPAL *FOO");
    expect(result.log).toEqual([{ reason: "processor", span: { first: 0, last: 0 } }]);
  });
});
