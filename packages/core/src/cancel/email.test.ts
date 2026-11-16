import { describe, expect, it } from "vitest";
import { cancellationEmail, mailtoHref } from "./email.js";
import type { EmailInput } from "./types.js";

const CONFIRM =
  "Please confirm in writing that the subscription is cancelled, the date it ends, and that no further payments will be taken.";

function input(over: Partial<EmailInput> = {}): EmailInput {
  return {
    serviceName: "Netflix",
    amountText: "$17.99",
    currency: "USD",
    cadence: "monthly",
    cadenceAssumed: false,
    ...over,
  };
}

function amountLineOf(body: string): string {
  const lines = body.split("\n");
  return lines[lines.indexOf("Account email: [Your account email]") + 2] ?? "";
}

describe("cancellationEmail: Req 3.10 rows", () => {
  it("Netflix: full subject and body", () => {
    const email = cancellationEmail(input());
    expect(email.subject).toBe("Please cancel my Netflix subscription");
    expect(email.body).toBe(
      [
        "Hello,",
        "",
        "Please cancel my Netflix subscription and stop all future payments.",
        "",
        "Name on the account: [Your name]",
        "Account email: [Your account email]",
        "",
        "I am currently charged $17.99 (USD) every month.",
        "",
        CONFIRM,
        "",
        "Thank you,",
        "[Your name]",
      ].join("\n"),
    );
  });

  it("Riverside Gym Membership", () => {
    const email = cancellationEmail(
      input({ serviceName: "Riverside Gym Membership", amountText: "$29.00" }),
    );
    expect(email.subject).toBe("Please cancel my Riverside Gym Membership subscription");
    expect(amountLineOf(email.body)).toBe("I am currently charged $29.00 (USD) every month.");
  });

  it("The Economist, yearly, assumed", () => {
    const email = cancellationEmail(
      input({
        serviceName: "The Economist",
        amountText: "£179.00",
        currency: "GBP",
        cadence: "yearly",
        cadenceAssumed: true,
      }),
    );
    expect(email.subject).toBe("Please cancel my The Economist subscription");
    expect(amountLineOf(email.body)).toBe("My most recent charge was £179.00 (GBP).");
  });

  it("Spotify Premium with whitespace, weekly", () => {
    const email = cancellationEmail(
      input({
        serviceName: "  Spotify\n\tPremium ",
        amountText: "€10.99",
        currency: "EUR",
        cadence: "weekly",
      }),
    );
    expect(email.subject).toBe("Please cancel my Spotify Premium subscription");
    expect(amountLineOf(email.body)).toBe("I am currently charged €10.99 (EUR) every week.");
  });

  it("empty name, empty amount, invalid currency", () => {
    const email = cancellationEmail(input({ serviceName: "", amountText: "", currency: "usd" }));
    expect(email.subject).toBe("Please cancel my subscription");
    expect(email.body).toBe(
      [
        "Hello,",
        "",
        "Please cancel my subscription and stop all future payments.",
        "",
        "Name on the account: [Your name]",
        "Account email: [Your account email]",
        "",
        CONFIRM,
        "",
        "Thank you,",
        "[Your name]",
      ].join("\n"),
    );
  });

  it("repairs a lone surrogate and a format character", () => {
    const email = cancellationEmail(
      input({ serviceName: "Net\u200Bflix\uD800", amountText: "$1.00" }),
    );
    expect(email.subject).toBe("Please cancel my Net flix\uFFFD subscription");
    expect(amountLineOf(email.body)).toBe("I am currently charged $1.00 (USD) every month.");
  });
});

describe("cancellationEmail: amount line", () => {
  it("states weekly, monthly and yearly", () => {
    expect(amountLineOf(cancellationEmail(input({ cadence: "weekly" })).body)).toBe(
      "I am currently charged $17.99 (USD) every week.",
    );
    expect(amountLineOf(cancellationEmail(input({ cadence: "monthly" })).body)).toBe(
      "I am currently charged $17.99 (USD) every month.",
    );
    expect(amountLineOf(cancellationEmail(input({ cadence: "yearly" })).body)).toBe(
      "I am currently charged $17.99 (USD) every year.",
    );
  });

  it("does not state the cadence when it is assumed", () => {
    expect(amountLineOf(cancellationEmail(input({ cadenceAssumed: true })).body)).toBe(
      "My most recent charge was $17.99 (USD).",
    );
  });

  it("uses the assumed line for an invalid cadence even when not assumed", () => {
    const bad = input({ cadence: "constructor" as unknown as EmailInput["cadence"] });
    expect(amountLineOf(cancellationEmail(bad).body)).toBe(
      "My most recent charge was $17.99 (USD).",
    );
  });

  it("uses the assumed line when cadenceAssumed is not a boolean", () => {
    const bad = input({ cadenceAssumed: "false" as unknown as boolean });
    expect(amountLineOf(cancellationEmail(bad).body)).toBe(
      "My most recent charge was $17.99 (USD).",
    );
  });

  it("drops ` (C)` for an invalid currency", () => {
    for (const currency of ["usd", "US", "USDX", "", "U$D"]) {
      expect(amountLineOf(cancellationEmail(input({ currency })).body)).toBe(
        "I am currently charged $17.99 every month.",
      );
    }
  });

  it("drops the amount line and its blank line for an empty amount", () => {
    const body = cancellationEmail(input({ amountText: " \u200B " })).body;
    expect(body).not.toContain("charge");
    expect(body).not.toContain("\n\n\n");
    expect(body.split("\n")).toHaveLength(11);
  });
});

describe("cancellationEmail: placeholders and input handling", () => {
  it("has [Your name] twice and [Your account email] once", () => {
    const body = cancellationEmail(input()).body;
    expect(body.split("[Your name]")).toHaveLength(3);
    expect(body.split("[Your account email]")).toHaveLength(2);
  });

  it("copies $& and $1 as text", () => {
    const email = cancellationEmail(input({ serviceName: "A$&B$1C$$", amountText: "$&" }));
    expect(email.subject).toBe("Please cancel my A$&B$1C$$ subscription");
    expect(email.body).toContain("I am currently charged $& (USD) every month.");
  });

  it("copies [Your name] inside a name as text", () => {
    const email = cancellationEmail(input({ serviceName: "[Your name]" }));
    expect(email.subject).toBe("Please cancel my [Your name] subscription");
  });

  it("ignores extra properties", () => {
    const extra = {
      ...input(),
      name: "Ada Lovelace",
      email: "ada@example.com",
      cardNumber: "4111111111111111",
    } as EmailInput;
    expect(cancellationEmail(extra)).toEqual(cancellationEmail(input()));
    const text = JSON.stringify(cancellationEmail(extra));
    expect(text).not.toContain("Ada");
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain("4111");
  });

  it("cuts a long name at 80 code points", () => {
    const email = cancellationEmail(input({ serviceName: "x".repeat(100) }));
    expect(email.subject).toBe("Please cancel my " + "x".repeat(80) + " subscription");
  });

  it("does not mutate its input", () => {
    const i = input({ serviceName: " Netflix " });
    const copy = { ...i };
    cancellationEmail(i);
    expect(i).toEqual(copy);
  });

  it("does not throw for a non-object input or non-string fields", () => {
    for (const bad of [null, undefined, 42, "text", true]) {
      const email = cancellationEmail(bad as unknown as EmailInput);
      expect(email.subject).toBe("Please cancel my subscription");
      expect(email.body).not.toContain("charge");
    }
    const odd = {
      serviceName: 7,
      amountText: { a: 1 },
      currency: 5,
      cadence: null,
      cadenceAssumed: undefined,
    } as unknown as EmailInput;
    expect(cancellationEmail(odd).subject).toBe("Please cancel my subscription");
  });
});

describe("mailtoHref", () => {
  it("encodes the Netflix email as a literal", () => {
    const href = mailtoHref(cancellationEmail(input()));
    expect(href).toBe(
      "mailto:?subject=Please%20cancel%20my%20Netflix%20subscription" +
        "&body=Hello%2C%0D%0A%0D%0A" +
        "Please%20cancel%20my%20Netflix%20subscription%20and%20stop%20all%20future%20payments.%0D%0A%0D%0A" +
        "Name%20on%20the%20account%3A%20%5BYour%20name%5D%0D%0A" +
        "Account%20email%3A%20%5BYour%20account%20email%5D%0D%0A%0D%0A" +
        "I%20am%20currently%20charged%20%2417.99%20(USD)%20every%20month.%0D%0A%0D%0A" +
        "Please%20confirm%20in%20writing%20that%20the%20subscription%20is%20cancelled%2C%20the%20date%20it%20ends%2C%20and%20that%20no%20further%20payments%20will%20be%20taken.%0D%0A%0D%0A" +
        "Thank%20you%2C%0D%0A%5BYour%20name%5D",
    );
  });

  it("replaces a lone surrogate and uses CRLF", () => {
    expect(mailtoHref({ subject: "\uD800", body: "a\nb" })).toBe(
      "mailto:?subject=%EF%BF%BD&body=a%0D%0Ab",
    );
  });

  it("encodes & = ? # % so the query has one & and two =", () => {
    const href = mailtoHref({ subject: "a&b=c?d#e%f", body: "&=?#%" });
    expect(href.split("&")).toHaveLength(2);
    expect(href.split("=")).toHaveLength(3);
    expect(href.startsWith("mailto:?subject=")).toBe(true);
  });

  it("has no recipient", () => {
    expect(mailtoHref({ subject: "s", body: "b" })).toBe("mailto:?subject=s&body=b");
  });

  it("does not throw for a non-object input or non-string fields", () => {
    expect(mailtoHref(null as unknown as { subject: string; body: string })).toBe(
      "mailto:?subject=&body=",
    );
    expect(
      mailtoHref({ subject: 1, body: undefined } as unknown as { subject: string; body: string }),
    ).toBe("mailto:?subject=&body=");
  });
});
