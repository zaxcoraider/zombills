import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { KNOWN_SERVICES } from "./known-services.js";
import { normalizeMerchant } from "./normalize-merchant.js";

describe("known service list properties", () => {
  it("P8: every variant text and display name maps to its own service", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_SERVICES),
        fc.nat(),
        fc.constantFrom("as-is", "upper", "lower"),
        (service, index, casing) => {
          const variant = service.variants[index % service.variants.length];
          const texts = [service.displayName, variant?.text ?? service.displayName];
          for (const text of texts) {
            const input =
              casing === "upper"
                ? text.toUpperCase()
                : casing === "lower"
                  ? text.toLowerCase()
                  : text;
            const identity = normalizeMerchant(input);
            expect(identity.serviceId, input).toBe(service.serviceId);
            expect(identity.source, input).toBe("known");
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("P8: exhaustive over every variant and display name", () => {
    for (const service of KNOWN_SERVICES) {
      expect(normalizeMerchant(service.displayName).serviceId, service.displayName).toBe(
        service.serviceId,
      );
      for (const variant of service.variants) {
        expect(normalizeMerchant(variant.text).serviceId, variant.text).toBe(service.serviceId);
      }
    }
  });
});
