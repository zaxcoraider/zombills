import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext } from "./internal-types.js";
import { lex } from "./lex.js";
import { removeDomains } from "./rule-domains.js";
import { tokensFrom } from "./token-list.js";

function run(text: string, firstPass = true): { folded: string[]; raw: string[]; log: RemovalLog } {
  const log: RemovalLog = [];
  const ctx: RuleContext = { firstPass, processor: null, log };
  const list = removeDomains(tokensFrom(lex(text.normalize("NFKC"))), ctx);
  return { folded: list.tokens.map((t) => t.folded), raw: list.tokens.map((t) => t.raw), log };
}

describe("removeDomains", () => {
  it("replaces a first-token domain with its name label", () => {
    expect(run("NETFLIX.COM").folded).toEqual(["netflix"]);
    expect(run("HELP.MAX.COM").folded).toEqual(["max"]);
    expect(run("WWW.NYTIMES.COM").folded).toEqual(["nytimes"]);
    expect(run("BBC.CO.UK").folded).toEqual(["bbc"]);
    expect(run("NETFLIX.COM 12345").folded).toEqual(["netflix", "12345"]);
  });

  it("handles a URL with scheme, www and path", () => {
    expect(run("https://www.netflix.com/account").folded).toEqual(["netflix"]);
    expect(run("http://netflix.com").folded).toEqual(["netflix"]);
  });

  it("keeps http and https without ://", () => {
    expect(run("HTTP FOO").folded).toEqual(["http", "foo"]);
  });

  it("removes a domain that is not first, with its path", () => {
    expect(run("AUDIBLE AMZN.COM/BILL NJ").folded).toEqual(["audible", "nj"]);
    expect(run("FOO G.CO/HELPPAY").folded).toEqual(["foo"]);
    expect(run("FOO G.CO/A/B BAR").folded).toEqual(["foo", "bar"]);
  });

  it("does not remove a path in later passes", () => {
    expect(run("NETFLIX.COM BILL", false).folded).toEqual(["netflix", "bill"]);
    expect(run("NETFLIX.COM/BILL", false).folded).toEqual(["netflix", "bill"]);
  });

  it("needs a / to start a path", () => {
    expect(run("NETFLIX.COM*CA").folded).toEqual(["netflix", "ca"]);
  });

  it("does not treat unknown TLDs or empty labels as domains", () => {
    expect(run("NETFLIX.XYZ").folded).toEqual(["netflix.xyz"]);
    expect(run("A..COM").folded).toEqual(["a", "com"]);
  });

  it("strips a leading www. even when the rest is not a domain", () => {
    expect(run("WWW.FOO BAR").folded).toEqual(["foo", "bar"]);
  });

  it("keeps the raw case of the label", () => {
    expect(run("Netflix.Com").raw).toEqual(["Netflix"]);
    expect(run("WWW.Hulu.com").raw).toEqual(["Hulu"]);
  });

  it("logs removals as domain", () => {
    const result = run("FOO AMZN.COM/BILL");
    expect(result.log.length).toBeGreaterThan(0);
    expect(result.log.every((r) => r.reason === "domain")).toBe(true);
  });
});
