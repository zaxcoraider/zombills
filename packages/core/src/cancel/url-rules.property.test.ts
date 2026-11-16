import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { domainArb, hostArb } from "./test-arbitraries.js";
import { isOnDomain } from "./url-rules.js";

describe("url-rules properties", () => {
  it("P9: isOnDomain is the host check of the Glossary, and fixed cases hold", () => {
    expect(isOnDomain("notnetflix.com", "netflix.com")).toBe(false);
    expect(isOnDomain("a.b.netflix.com", "netflix.com")).toBe(true);
    fc.assert(
      fc.property(
        domainArb.chain((d) => hostArb(d).map((h) => [d, h] as const)),
        ([d, h]) => {
          const expected = h === d || h.endsWith("." + d);
          expect(isOnDomain(h, d)).toBe(expected);
          expect(isOnDomain("not" + d, d)).toBe(false);
          expect(isOnDomain("help." + d, d)).toBe(true);
          expect(isOnDomain(d, d)).toBe(true);
        },
      ),
    );
  });
});
