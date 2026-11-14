import { describe, expect, it } from "vitest";
import { PROCESSOR_NAMES } from "./noise-lists.js";
import { normalizeMerchant } from "./normalize-merchant.js";
import { unidentifiedDisplayName, unidentifiedKey } from "./unidentified.js";
import type { ProcessorId } from "./types.js";

describe("unidentifiedDisplayName", () => {
  const EXPECTED: ReadonlyArray<readonly [ProcessorId, string]> = [
    ["paypal", "PayPal payment (merchant not shown)"],
    ["square", "Square payment (merchant not shown)"],
    ["shopify", "Shopify payment (merchant not shown)"],
    ["amazon-marketplace", "Amazon Marketplace payment (merchant not shown)"],
    ["google", "Google payment (merchant not shown)"],
    ["apple", "Apple payment (merchant not shown)"],
    ["sumup", "SumUp payment (merchant not shown)"],
    ["zettle", "Zettle payment (merchant not shown)"],
    ["toast", "Toast payment (merchant not shown)"],
  ];

  it.each(EXPECTED)("%s → %s", (processor, expected) => {
    expect(unidentifiedDisplayName(processor)).toBe(expected);
  });

  it("covers every processor", () => {
    expect(EXPECTED.map(([p]) => p).sort()).toEqual(Object.keys(PROCESSOR_NAMES).sort());
  });

  it("uses 'Unknown merchant' when no processor was found", () => {
    expect(unidentifiedDisplayName(null)).toBe("Unknown merchant");
  });
});

describe("unidentifiedKey", () => {
  it("joins processor and residue", () => {
    expect(unidentifiedKey("apple", "apple.com/bill 866-712-7753 ca")).toBe(
      "unidentified:apple:apple.com/bill 866-712-7753 ca",
    );
  });

  it("uses 'none' without a processor", () => {
    expect(unidentifiedKey(null, "foo")).toBe("unidentified:none:foo");
  });

  it("uses '-' for an empty residue", () => {
    expect(unidentifiedKey(null, "")).toBe("unidentified:none:-");
    expect(unidentifiedKey("paypal", "")).toBe("unidentified:paypal:-");
  });
});

describe("unidentified descriptions, end to end", () => {
  it.each([
    ["PAYPAL *", "paypal"],
    ["PAYPAL *1234567890", "paypal"],
    ["AMZN MKTP US*2K4LJ8MB3", "amazon-marketplace"],
    ["POS 01/12 123456", null],
    ["", null],
  ] as const)("Req 6.1: %j is unidentified", (description, processor) => {
    const identity = normalizeMerchant(description);
    expect(identity.source).toBe("unidentified");
    expect(identity.serviceId).toBeNull();
    expect(identity.processor).toBe(processor);
    expect(identity.key.startsWith("unidentified:")).toBe(true);
    expect(identity.displayName).toBe(unidentifiedDisplayName(processor));
  });

  it("Req 6.3: the same line with different dates gets the same key", () => {
    const a = normalizeMerchant("DEBIT CARD PURCHASE 12/03 APPLE.COM/BILL 866-712-7753 CA");
    const b = normalizeMerchant("DEBIT CARD PURCHASE 01/04 APPLE.COM/BILL 866-712-7753 CA");
    expect(a.key).toBe("unidentified:apple:apple.com/bill 866-712-7753 ca");
    expect(b.key).toBe(a.key);
  });

  it("Req 6.3: a card prefix and masked card number do not change the key", () => {
    const a = normalizeMerchant("POS XXXX1234 APPLE.COM/BILL 866-712-7753 CA");
    const b = normalizeMerchant("APPLE.COM/BILL 866-712-7753 CA");
    expect(a.source).toBe("unidentified");
    expect(a.key).toBe(b.key);
  });

  it("Req 6.3: different reference numbers give different keys", () => {
    const a = normalizeMerchant("PAYPAL *1234567890");
    const b = normalizeMerchant("PAYPAL *9876543210");
    expect(a.key).not.toBe(b.key);
  });

  it("Req 6.2: a date between the processor form and the location does not change the key", () => {
    expect(normalizeMerchant("APPLE.COM/BILL*12/03*CA").key).toBe(
      normalizeMerchant("APPLE.COM/BILL*CA").key,
    );
  });

  it("uses '-' for a description that is only a prefix and a date", () => {
    expect(normalizeMerchant("POS 01/12").key).toBe("unidentified:none:-");
  });

  it("depends on the description string alone", () => {
    expect(normalizeMerchant.length).toBe(1);
    expect(normalizeMerchant("PAYPAL *1234567890")).toEqual(
      normalizeMerchant("PAYPAL *1234567890"),
    );
  });
});
