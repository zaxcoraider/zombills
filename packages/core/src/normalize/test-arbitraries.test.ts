import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { RemovalLog, RuleContext } from "./internal-types.js";
import { lex } from "./lex.js";
import { MONTHS } from "./noise-lists.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { removeDates } from "./rule-dates.js";
import { removeReferences } from "./rule-references.js";
import { tokensFrom } from "./token-list.js";
import {
  VARIANT_TOKENS,
  applyCase,
  dateArb,
  describeUnidentified,
  genericNameArb,
  referenceTokenArb,
  unidentifiedArb,
} from "./test-arbitraries.js";

function context(log: RemovalLog): RuleContext {
  return { firstPass: true, processor: null, log };
}

/** Independent check of the 1-31 / 1-12 rule, reading the digits and month names of the text. */
function hasValidReading(text: string): boolean {
  const groups = (text.match(/[0-9]+/gu) ?? []).map(Number);
  const inRange = (n: number | undefined, min: number, max: number): boolean =>
    n !== undefined && n >= min && n <= max;
  const monthName = MONTHS.find((m) => text.toLowerCase().includes(m));
  if (monthName !== undefined) return inRange(groups[0], 1, 31);
  if (/^[0-9]{4}-/u.test(text)) return inRange(groups[1], 1, 12) && inRange(groups[2], 1, 31);
  const [a, b] = groups;
  return (inRange(a, 1, 31) && inRange(b, 1, 12)) || (inRange(a, 1, 12) && inRange(b, 1, 31));
}

describe("test arbitraries", () => {
  it("every generated reference token is removed by step 7 and is not a variant token", () => {
    fc.assert(
      fc.property(referenceTokenArb, (token) => {
        const log: RemovalLog = [];
        const list = removeReferences(tokensFrom(lex(`FOO ${token} BAR`)), context(log));
        expect(list.tokens.map((t) => t.folded)).toEqual(["foo", "bar"]);
        expect(log.map((r) => r.reason)).toEqual(["reference"]);
        expect(VARIANT_TOKENS.has(token.toLowerCase())).toBe(false);
      }),
    );
  });

  it("every generated generic name is generic when bare", () => {
    fc.assert(
      fc.property(genericNameArb, (name) => {
        const identity = normalizeMerchant(name);
        expect(identity.source).toBe("generic");
        expect(identity.processor).toBeNull();
      }),
      { numRuns: 500 },
    );
  });

  it("every generated date passes the 1-31 / 1-12 check and is removed by step 2", () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        expect(hasValidReading(date), date).toBe(true);
        const log: RemovalLog = [];
        const list = removeDates(tokensFrom(lex(`FOO ${date} BAR`)), context(log));
        expect(list.tokens.map((t) => t.folded), date).toEqual(["foo", "bar"]);
      }),
      { numRuns: 500 },
    );
  });

  it("applyCase changes only the case of ASCII letters", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 40 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
        (text, bits) => {
          expect(applyCase(text, bits).toLowerCase()).toBe(text.toLowerCase());
        },
      ),
    );
  });

  it("every generated unidentified case is unidentified", () => {
    fc.assert(
      fc.property(unidentifiedArb, (c) => {
        expect(normalizeMerchant(describeUnidentified(c)).source, describeUnidentified(c)).toBe(
          "unidentified",
        );
      }),
      { numRuns: 500 },
    );
  });
});
