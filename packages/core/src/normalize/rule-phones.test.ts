import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext } from "./internal-types.js";
import { lex } from "./lex.js";
import { removePhones } from "./rule-phones.js";
import { tokensFrom } from "./token-list.js";

function run(text: string): { folded: string[]; log: RemovalLog } {
  const log: RemovalLog = [];
  const ctx: RuleContext = { firstPass: true, processor: null, log };
  const list = removePhones(tokensFrom(lex(text.normalize("NFKC"))), ctx);
  return { folded: list.tokens.map((t) => t.folded), log };
}

describe("removePhones", () => {
  it.each([
    "866-579-7172",
    "1-800-123-4567",
    "866.579.7172",
    "8665797172",
    "(800) 123 4567",
    "+44 20 7946 0958",
    "866 579 7172",
    "1 866 579 7172",
  ])("removes %s", (phone) => {
    const result = run(`FOO ${phone} BAR`);
    expect(result.folded).toEqual(["foo", "bar"]);
    expect(result.log.every((r) => r.reason === "phone")).toBe(true);
    expect(result.log.length).toBeGreaterThan(0);
  });

  it("removes a phone at the start and at the end", () => {
    expect(run("866-579-7172 NETFLIX").folded).toEqual(["netflix"]);
    expect(run("NETFLIX 866-579-7172").folded).toEqual(["netflix"]);
    expect(run("866-579-7172").folded).toEqual([]);
  });

  it("keeps a preceding short number", () => {
    expect(run("MICROSOFT 365 866 579 7172").folded).toEqual(["microsoft", "365"]);
  });

  it("keeps numbers outside 7-15 digits", () => {
    expect(run("FOO 123-456").folded).toEqual(["foo", "123-456"]);
    expect(run("FOO 1234567890123456").folded).toEqual(["foo", "1234567890123456"]);
    expect(run("FOO 123456789012345").folded).toEqual(["foo"]);
  });

  it("keeps other spaced digit groups without a marker", () => {
    expect(run("FOO 020 7946 0958").folded).toEqual(["foo", "020", "7946", "0958"]);
  });

  it("does not treat letters or non-ASCII digits as a phone", () => {
    expect(run("FOO 866-579-717X").folded).toEqual(["foo", "866-579-717x"]);
    expect(run("FOO ٨٦٦٥٧٩٧١٧٢").folded).toEqual(["foo", "٨٦٦٥٧٩٧١٧٢"]);
  });

  it("keeps the gap of a removed phone on the next token", () => {
    const log: RemovalLog = [];
    const ctx: RuleContext = { firstPass: true, processor: null, log };
    const list = removePhones(tokensFrom(lex("FOO 866-579-7172 *BAR")), ctx);
    expect(list.tokens[1]?.gapBefore).toContain("*");
  });
});
