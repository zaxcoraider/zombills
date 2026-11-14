import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext } from "./internal-types.js";
import { lex } from "./lex.js";
import { removeDates } from "./rule-dates.js";
import { tokensFrom } from "./token-list.js";

function run(text: string, firstPass = true): { folded: string[]; log: RemovalLog } {
  const log: RemovalLog = [];
  const ctx: RuleContext = { firstPass, processor: null, log };
  const list = removeDates(tokensFrom(lex(text.normalize("NFKC"))), ctx);
  return { folded: list.tokens.map((t) => t.folded), log };
}

describe("removeDates", () => {
  it.each([
    "2026-03-12",
    "12/03",
    "12/03/26",
    "12/03/2026",
    "03.01",
    "03.01.2026",
    "12-03",
    "12JAN",
    "JAN12",
    "12 JAN",
    "JAN 12",
    "03/12",
    "13/12",
    "12/13",
  ])("removes %s", (date) => {
    expect(run(`FOO ${date} BAR`).folded).toEqual(["foo", "bar"]);
  });

  it.each(["31/13", "32.01", "00/05", "13/13", "32JAN", "0 JAN", "JAN 32", "2026-13-01"])(
    "keeps %s",
    (text) => {
      const folded = run(`FOO ${text} BAR`).folded;
      expect(folded.length).toBeGreaterThan(2);
      expect(folded[0]).toBe("foo");
      expect(folded[folded.length - 1]).toBe("bar");
    },
  );

  it("does not see a slash date when the gap is a space (later passes)", () => {
    expect(run("12 03", false).folded).toEqual(["12", "03"]);
    expect(run("12/03", false).folded).toEqual(["12", "03"]);
  });

  it("clears nested spaced months in one pass", () => {
    expect(run("12 12 JAN JAN").folded).toEqual([]);
    expect(run("FOO 12 12 JAN JAN BAR").folded).toEqual(["foo", "bar"]);
  });

  it("leaves a phone number alone", () => {
    expect(run("866-579-7172").folded).toEqual(["866-579-7172"]);
  });

  it("removes only a two-part date when the third part is not 2 or 4 digits", () => {
    expect(run("12/03/1").folded).toEqual(["1"]);
  });

  it("logs one date removal per date with its span, and keeps gaps", () => {
    const { log } = run("A 12/03/2026 B");
    expect(log).toEqual([{ reason: "date", span: { first: 2, last: 6 } }]);
    const list = removeDates(tokensFrom(lex("PAYPAL 12/03 *X")), {
      firstPass: true,
      processor: null,
      log: [],
    });
    expect(list.tokens.map((t) => `${t.gapBefore}|${t.folded}`)).toEqual(["|paypal", " / *|x"]);
  });

  it("handles a date at the very end and empty input", () => {
    expect(run("FOO 12/03").folded).toEqual(["foo"]);
    expect(run("").folded).toEqual([]);
  });
});
