import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { KNOWN_SERVICES } from "./known-services.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { applyNoise, noiseArb } from "./test-arbitraries.js";

describe("known service matching properties", () => {
  it("P7: known noise-insensitivity, every service x every variant x noise", () => {
    for (const service of KNOWN_SERVICES) {
      for (const variant of service.variants) {
        fc.assert(
          fc.property(noiseArb, (noise) => {
            const description = applyNoise(noise, variant.text);
            const identity = normalizeMerchant(description);
            expect(identity.serviceId, JSON.stringify(description)).toBe(service.serviceId);
            expect(identity.source, JSON.stringify(description)).toBe("known");
          }),
          { numRuns: 30 },
        );
      }
    }
  });
});
