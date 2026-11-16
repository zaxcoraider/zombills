import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CANCEL_ENTRIES } from "./cancel-data.js";
import { getCancelHelp, statementRegion } from "./lookup.js";
import { currencyArb, serviceIdArb } from "./test-arbitraries.js";

function isOn(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

describe("getCancelHelp properties", () => {
  it("P6: lookup is total and exact, and the currency acts only through its Region", () => {
    fc.assert(
      fc.property(serviceIdArb, currencyArb, currencyArb, (id, c, c2) => {
        const result = getCancelHelp(id, c);
        const entry = CANCEL_ENTRIES.find((e) => e.serviceId === id);
        expect(result.kind === "link").toBe(entry !== undefined);
        if (result.kind === "link" && entry !== undefined) {
          expect([entry.url, ...Object.values(entry.regionalUrls)]).toContain(result.url);
          expect(entry.providerDomains.some((d) => isOn(result.host, d))).toBe(true);
          if (statementRegion(c2) === statementRegion(c)) {
            expect(getCancelHelp(id, c2)).toEqual(result);
          }
        } else {
          expect(result).toEqual({ kind: "email-only", serviceId: id });
        }
      }),
    );
  });

  it("P6: a value that is not a string or null never throws", () => {
    fc.assert(
      fc.property(fc.anything(), currencyArb, (id, c) => {
        const result = getCancelHelp(id as string | null, c);
        if (typeof id !== "string") expect(result).toEqual({ kind: "email-only", serviceId: null });
      }),
    );
  });

  it("P7: the URL is the regional URL of the Statement region, else the default", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CANCEL_ENTRIES), currencyArb, (entry, c) => {
        const region = statementRegion(c);
        const regional = region === null ? undefined : entry.regionalUrls[region];
        const result = getCancelHelp(entry.serviceId, c);
        expect(result.kind).toBe("link");
        if (result.kind === "link") expect(result.url).toBe(regional ?? entry.url);
      }),
    );
  });
});
