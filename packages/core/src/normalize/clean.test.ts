import { describe, expect, it } from "vitest";
import { cleanDescription } from "./clean.js";
import { joinTokens } from "./lex.js";

function cleaned(description: string): string {
  return joinTokens(cleanDescription(description).cleaned, "raw");
}

describe("cleanDescription: cleaned names", () => {
  it.each([
    // Req 3.12
    ["NETFLIX.COM 866-579-7172 CA", "NETFLIX"],
    ["POS PURCHASE NETFLIX.COM LOS GATOS CA", "NETFLIX LOS GATOS"],
    ["PAYPAL *SPOTIFY P1A2B3C4D5", "SPOTIFY"],
    ["GOOGLE *YouTubePremium g.co/helppay#", "YouTubePremium"],
    ["SQ *BLUE BOTTLE COFFEE #0412 OAKLAND CA", "BLUE BOTTLE COFFEE OAKLAND"],
    ["DEBIT CARD PURCHASE XXXX1234 12/03 JOE'S PIZZA 0042", "JOE'S PIZZA"],
    ["  joe's   pizza  ", "joe's pizza"],
    // Req 7.1
    ["GEHALT BEISPIEL GMBH", "GEHALT BEISPIEL GMBH"],
    ["STREAMING DIENST MONATSBEITRAG", "STREAMING DIENST MONATSBEITRAG"],
    ["SUPERMARKT NORD 0412", "SUPERMARKT NORD"],
    ["MUSIKDIENST PREMIUM", "MUSIKDIENST PREMIUM"],
    ["FITNESSSTUDIO LINDENHOF", "FITNESSSTUDIO LINDENHOF"],
    ["TANKSTELLE AM RING", "TANKSTELLE AM RING"],
    ["ONLINE SHOP RUECKERSTATTUNG", "ONLINE SHOP RUECKERSTATTUNG"],
    // other examples
    ["POS 12/03 PURCHASE NETFLIX", "NETFLIX"],
    ["AUDIBLE AMZN.COM/BILL NJ", "AUDIBLE"],
    ["SEPA-LASTSCHRIFT SPOTIFY AB", "SPOTIFY"],
    ["KARTENZAHLUNG 03.01. NETFLIX", "NETFLIX"],
    ["WALGREENS STORE 1234", "WALGREENS"],
    ["BP 0412", "BP"],
    ["", ""],
  ])("%j → %j", (description, expected) => {
    expect(cleaned(description)).toBe(expected);
  });

  it("records the processor and cleans to empty for a processor-only description", () => {
    const result = cleanDescription("DEBIT CARD PURCHASE 12/03 APPLE.COM/BILL 866-712-7753 CA");
    expect(result.processor).toBe("apple");
    expect(result.cleaned).toEqual([]);
  });

  it("records the processor of a PayPal description", () => {
    expect(cleanDescription("PAYPAL *SPOTIFY P1A2B3C4D5").processor).toBe("paypal");
    expect(cleanDescription("NETFLIX.COM").processor).toBeNull();
  });
});

describe("cleanDescription: context", () => {
  it("keeps 365 for MICROSOFT 365 0412 WA", () => {
    const result = cleanDescription("MICROSOFT 365 0412 WA");
    expect(result.context).toEqual(["microsoft", "365", "0412", "wa"]);
    // The trailing loop removes `365` from the Cleaned name; only the context keeps it.
    expect(joinTokens(result.cleaned, "raw")).toBe("MICROSOFT");
  });

  it("is the folded tokens after step 5, before references are removed", () => {
    expect(cleanDescription("PAYPAL *SPOTIFY P1A2B3C4D5").context).toEqual([
      "spotify",
      "p1a2b3c4d5",
    ]);
  });
});

describe("cleanDescription: residue", () => {
  it.each([
    ["DEBIT CARD PURCHASE 12/03 APPLE.COM/BILL 866-712-7753 CA", "apple.com/bill 866-712-7753 ca"],
    ["DEBIT CARD PURCHASE 01/04 APPLE.COM/BILL 866-712-7753 CA", "apple.com/bill 866-712-7753 ca"],
    ["POS XXXX1234 APPLE.COM/BILL 866-712-7753 CA", "apple.com/bill 866-712-7753 ca"],
    ["PAYPAL *1234567890", "paypal *1234567890"],
    ["POS 01/12", ""],
  ])("%j → %j", (description, expected) => {
    expect(cleanDescription(description).residue).toBe(expected);
  });

  it("is the same with and without a date between separators", () => {
    expect(cleanDescription("APPLE.COM/BILL*12/03*CA").residue).toBe(
      cleanDescription("APPLE.COM/BILL*CA").residue,
    );
  });

  it("leaves one space where a date sat between two words", () => {
    expect(cleanDescription("FOO 12/03 BAR").residue).toBe("foo bar");
  });

  it("is empty for an empty description", () => {
    expect(cleanDescription("").residue).toBe("");
  });
});

describe("cleanDescription: passes", () => {
  it.each([
    "NETFLIX.COM 866-579-7172 CA",
    "PAYPAL *SPOTIFY P1A2B3C4D5",
    "GOOGLE *YouTubePremium g.co/helppay#",
    "SQ *BLUE BOTTLE COFFEE #0412 OAKLAND CA",
    "DEBIT CARD PURCHASE XXXX1234 12/03 JOE'S PIZZA 0042",
    "DEBIT CARD PURCHASE 12/03 APPLE.COM/BILL 866-712-7753 CA",
    "AMZN MKTP US*2K4LJ8MB3",
  ])("finishes %j in 2 passes", (description) => {
    expect(cleanDescription(description).passes).toBe(2);
  });
});
