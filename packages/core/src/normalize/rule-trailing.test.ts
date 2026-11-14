import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext } from "./internal-types.js";
import { lex } from "./lex.js";
import { removeTrailingCodes } from "./rule-trailing.js";
import { tokensFrom } from "./token-list.js";
import type { ProcessorId } from "./types.js";

function run(
  text: string,
  processor: ProcessorId | null = null,
): { folded: string; log: RemovalLog } {
  const log: RemovalLog = [];
  const ctx: RuleContext = { firstPass: true, processor, log };
  const list = removeTrailingCodes(tokensFrom(lex(text.normalize("NFKC"))), ctx);
  return { folded: list.tokens.map((t) => t.folded).join(" "), log };
}

describe("removeTrailingCodes", () => {
  it("removes location codes repeatedly from the end", () => {
    expect(run("FOO AM DE").folded).toBe("foo");
    expect(run("FOO LOS GATOS CA US").folded).toBe("foo los gatos");
  });

  it("keeps a location code that is not at the end", () => {
    expect(run("TANKSTELLE AM RING").folded).toBe("tankstelle am ring");
  });

  it("keeps a lone location code when no processor is recorded", () => {
    expect(run("CA").folded).toBe("ca");
    expect(run("BP").folded).toBe("bp");
    expect(run("BP 0412").folded).toBe("bp");
    expect(run("CA 0412").folded).toBe("ca");
  });

  it("removes a lone location code when a processor is recorded", () => {
    expect(run("CA", "apple").folded).toBe("");
  });

  it("removes digits-only tokens", () => {
    expect(run("SUPERMARKT NORD 0412").folded).toBe("supermarkt nord");
    expect(run("STUDIO 54").folded).toBe("studio");
    expect(run("123 456").folded).toBe("");
  });

  it("logs each removal as trailing", () => {
    const result = run("FOO 12 CA");
    expect(result.log.map((r) => r.reason)).toEqual(["trailing", "trailing"]);
    expect(result.log[0]?.span).toEqual({ first: 4, last: 4 });
  });

  it("handles an empty list", () => {
    expect(run("").folded).toBe("");
  });
});
