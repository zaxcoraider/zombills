import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "./normalize-merchant.js";
import type { MerchantIdentity, MerchantSource, ProcessorId } from "./types.js";

type Row = readonly [
  description: string,
  source: MerchantSource,
  key: string,
  displayName: string,
  processor: ProcessorId | null,
];

function expectRow([description, source, key, displayName, processor]: Row): void {
  const identity = normalizeMerchant(description);
  expect(identity.source, description).toBe(source);
  expect(identity.key, description).toBe(key);
  expect(identity.displayName, description).toBe(displayName);
  expect(identity.processor, description).toBe(processor);
  expect(identity.serviceId, description).toBe(source === "known" ? key : null);
}

describe("normalizeMerchant: Req 3.12", () => {
  const ROWS: readonly Row[] = [
    ["NETFLIX.COM 866-579-7172 CA", "known", "netflix", "Netflix", null],
    ["POS PURCHASE NETFLIX.COM LOS GATOS CA", "known", "netflix", "Netflix", null],
    ["PAYPAL *SPOTIFY P1A2B3C4D5", "known", "spotify", "Spotify", "paypal"],
    [
      "GOOGLE *YouTubePremium g.co/helppay#",
      "known",
      "youtube-premium",
      "YouTube Premium",
      "google",
    ],
    [
      "SQ *BLUE BOTTLE COFFEE #0412 OAKLAND CA",
      "generic",
      "merchant:blue-bottle-coffee-oakland",
      "Blue Bottle Coffee Oakland",
      "square",
    ],
    [
      "DEBIT CARD PURCHASE XXXX1234 12/03 JOE'S PIZZA 0042",
      "generic",
      "merchant:joe-s-pizza",
      "Joe's Pizza",
      null,
    ],
    ["  joe's   pizza  ", "generic", "merchant:joe-s-pizza", "Joe's Pizza", null],
    ["PRIMEVIDEO MEMBERSHIP", "known", "amazon-prime", "Amazon Prime", null],
  ];

  it.each(ROWS)("%s", (...row) => {
    expectRow(row);
  });
});

describe("normalizeMerchant: folding, accents and scripts", () => {
  it("gives the same key to CAFÉ MÜLLER, Cafe Muller and café müller", () => {
    for (const description of ["CAFÉ MÜLLER", "Cafe Muller", "café müller"]) {
      expect(normalizeMerchant(description).key).toBe("merchant:cafe-muller");
    }
  });

  it("keeps accents in the display name and drops the reference", () => {
    expect(normalizeMerchant("CAFÉ MÜLLER 0412").displayName).toBe("Café Müller");
  });

  it("maps compatibility characters in the display name", () => {
    const identity = normalizeMerchant("ＣＡＦＥ");
    expect(identity.displayName).toBe("Cafe");
    expect(identity.key).toBe("merchant:cafe");
  });

  it("keeps Cyrillic letters in key and display name", () => {
    const identity = normalizeMerchant("ЯНДЕКС ПЛЮС");
    expect(identity.source).toBe("generic");
    expect(identity.key).toBe("merchant:яндекс-плюс");
    expect(identity.displayName).toBe("Яндекс Плюс");
  });
});

describe("normalizeMerchant: processors do not enter the key", () => {
  it("PAYPAL *SPOTIFY and SPOTIFY P1A2B3C4D5 both give spotify", () => {
    const withProcessor = normalizeMerchant("PAYPAL *SPOTIFY");
    const withReference = normalizeMerchant("SPOTIFY P1A2B3C4D5");
    expect(withProcessor.key).toBe("spotify");
    expect(withReference.key).toBe("spotify");
    expect(withProcessor.processor).toBe("paypal");
    expect(withReference.processor).toBeNull();
  });
});

describe("normalizeMerchant: Req 4.8 tables", () => {
  const KNOWN: ReadonlyArray<readonly [string, string]> = [
    ["UBER ONE", "uber-one"],
    ["MICROSOFT*XBOX GAME PASS", "xbox-game-pass"],
    ["XBOX GAME PASS ULTIMATE", "xbox-game-pass"],
    ["XBOX GAMEPASS", "xbox-game-pass"],
    ["PLAYSTATION PLUS", "playstation-plus"],
    ["PS PLUS 12 MONTH", "playstation-plus"],
    ["SIE PLAYSTATION PLUS", "playstation-plus"],
    ["NINTENDO SWITCH ONLINE", "nintendo-switch-online"],
    ["NINTENDO SW ONLINE", "nintendo-switch-online"],
    ["EA PLAY", "ea-play"],
    ["EA *EA PLAY", "ea-play"],
    ["ELECTRONIC ARTS EA PLAY", "ea-play"],
    ["KINDLE UNLIMITED", "kindle-unlimited"],
    ["AMAZON KINDLE UNLTD", "kindle-unlimited"],
    ["AMAZON PRIME", "amazon-prime"],
    ["AMAZON PRIME MEMBERSHIP", "amazon-prime"],
    ["AMZN PRIME", "amazon-prime"],
    ["PRIMEVIDEO MEMBERSHIP", "amazon-prime"],
    ["PRIME VIDEO MEMBERSHIP", "amazon-prime"],
    ["AMAZON PRIME VIDEO MEMBERSHIP", "amazon-prime"],
  ];

  it.each(KNOWN)("%s → %s", (description, serviceId) => {
    const identity = normalizeMerchant(description);
    expect(identity.source).toBe("known");
    expect(identity.serviceId).toBe(serviceId);
  });

  const GENERIC: ReadonlyArray<readonly [string, string | null]> = [
    ["UBER *TRIP", null],
    ["UBER EATS", null],
    ["AMZN MKTP US*2K4LJ8MB3", null],
    ["MICROSOFT*XBOX 425-681-4800 WA", "merchant:microsoft-xbox"],
    ["MICROSOFT*STORE", "merchant:microsoft-store"],
    ["PLAYSTATION NETWORK 877-971-7669 CA", null],
    ["SONY PLAYSTATION STORE", null],
    ["NINTENDO CD1234567 WA", null],
    ["NINTENDO ESHOP", null],
    ["ELECTRONIC ARTS", null],
    ["EA *ORIGIN", null],
    ["KINDLE SVCS*2K4LJ8MB3", "merchant:kindle-svcs"],
    ["PRIME VIDEO*2K4LJ8MB3", "merchant:prime-video"],
    ["PRIMEVIDEO*2K4LJ8MB3", null],
    ["PRIME VIDEO CHANNELS", "merchant:prime-video-channels"],
  ];

  it.each(GENERIC)("%s is not a known service", (description, key) => {
    const identity = normalizeMerchant(description);
    expect(identity.source).not.toBe("known");
    expect(identity.serviceId).toBeNull();
    if (key !== null) {
      expect(identity.source).toBe("generic");
      expect(identity.key).toBe(key);
    }
  });

  it("never matches the company-wide names", () => {
    for (const description of [
      "MICROSOFT",
      "XBOX",
      "PLAYSTATION",
      "PLAYSTATION NETWORK",
      "PS",
      "NINTENDO",
      "ELECTRONIC ARTS",
      "EA",
      "KINDLE",
      "PRIME VIDEO",
      "PRIMEVIDEO",
    ]) {
      expect(normalizeMerchant(description).source, description).not.toBe("known");
    }
  });
});

describe("normalizeMerchant: processor-only descriptions (Req 4.9)", () => {
  it.each([
    ["APPLE.COM/BILL", "apple"],
    ["GOOGLE *", "google"],
  ] as const)("%s is unidentified", (description, processor) => {
    const identity: MerchantIdentity = normalizeMerchant(description);
    expect(identity.source).toBe("unidentified");
    expect(identity.serviceId).toBeNull();
    expect(identity.processor).toBe(processor);
  });
});

describe("normalizeMerchant: input contract", () => {
  it.each([[undefined], [null], [42]])("throws TypeError for %s", (value) => {
    expect(() => normalizeMerchant(value as unknown as string)).toThrow(TypeError);
  });

  it("accepts the empty string", () => {
    expect(normalizeMerchant("")).toEqual({
      key: "unidentified:none:-",
      displayName: "Unknown merchant",
      source: "unidentified",
      serviceId: null,
      processor: null,
    });
  });
});
