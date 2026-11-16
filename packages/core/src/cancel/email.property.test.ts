import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { cancellationEmail, mailtoHref } from "./email.js";
import { emailInputArb, emailInputWithExtrasArb, nastyStringArb } from "./test-arbitraries.js";
import { referenceClean, referenceEmail, referenceWellFormed } from "./test-reference.js";

const NAME_PLACEHOLDER = "[Your name]";
const EMAIL_PLACEHOLDER = "[Your account email]";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("cancellationEmail properties", () => {
  it("P1: the email is the template filled with the cleaned name and amount", () => {
    fc.assert(
      fc.property(emailInputArb, (input) => {
        expect(cancellationEmail(input)).toEqual(referenceEmail(input));
      }),
    );
  });

  it("P1: holds when name and amount are equal, empty, or the word in the template", () => {
    const edge = fc.record({
      serviceName: fc.constantFrom("", "Please", "subscription"),
      amountText: fc.constantFrom("", "Please", "subscription"),
      currency: fc.constantFrom("USD", "usd"),
      cadence: fc.constantFrom("weekly" as const, "monthly" as const, "yearly" as const),
      cadenceAssumed: fc.boolean(),
    });
    fc.assert(
      fc.property(edge, (input) => {
        expect(cancellationEmail(input)).toEqual(referenceEmail(input));
      }),
    );
  });

  it("P2: placeholders are never filled", () => {
    fc.assert(
      fc.property(emailInputArb, (input) => {
        const { body } = cancellationEmail(input);
        const n = referenceClean(input.serviceName);
        const a = referenceClean(input.amountText);
        expect(count(body, NAME_PLACEHOLDER)).toBe(
          2 + count(n, NAME_PLACEHOLDER) + count(a, NAME_PLACEHOLDER),
        );
        expect(count(body, EMAIL_PLACEHOLDER)).toBe(
          1 + count(n, EMAIL_PLACEHOLDER) + count(a, EMAIL_PLACEHOLDER),
        );
        expect(body.endsWith("\n" + NAME_PLACEHOLDER)).toBe(true);
      }),
    );
  });

  it("P3: subject and body hold only clean single-line fields", () => {
    fc.assert(
      fc.property(emailInputArb, (input) => {
        const { subject, body } = cancellationEmail(input);
        expect(subject).not.toMatch(/[\p{Cc}\p{Cf}\u2028\u2029]/u);
        expect(LONE_SURROGATE.test(subject)).toBe(false);
        expect(subject).toBe(subject.trim());
        expect(Array.from(subject).length).toBeLessThanOrEqual(17 + 80 + 13);

        expect(body.replaceAll("\n", "")).not.toMatch(/[\p{Cc}\p{Cf}\u2028\u2029]/u);
        expect(LONE_SURROGATE.test(body)).toBe(false);
        for (const line of body.split("\n")) {
          expect(line).toBe(line.trim());
        }
      }),
    );
  });

  it("P4: is total, deterministic, ignores extra properties and leaves its input alone", () => {
    fc.assert(
      fc.property(emailInputWithExtrasArb, ({ input, withExtras }) => {
        const clone = structuredClone(withExtras);
        const first = cancellationEmail(withExtras);
        expect(withExtras).toEqual(clone);
        expect(cancellationEmail(clone)).toEqual(first);
        expect(cancellationEmail(input)).toEqual(first);
      }),
    );
  });

  it("P5: mailtoHref round-trips the email", () => {
    fc.assert(
      fc.property(emailInputArb, (input) => {
        const email = cancellationEmail(input);
        const href = mailtoHref(email);
        expect(href.startsWith("mailto:?subject=")).toBe(true);
        const query = href.slice("mailto:?".length);
        expect(query).toMatch(/^[A-Za-z0-9\-_.!~*'()%=&]*$/);
        const parts = query.split("&");
        expect(parts).toHaveLength(2);
        const [subjectPart = "", bodyPart = ""] = parts;
        const decode = (part: string): readonly [string, string] => {
          const at = part.indexOf("=");
          return [part.slice(0, at), decodeURIComponent(part.slice(at + 1))];
        };
        expect(decode(subjectPart)).toEqual(["subject", email.subject]);
        expect(decode(bodyPart)).toEqual(["body", email.body.replaceAll("\n", "\r\n")]);
      }),
    );
  });

  it("P5: hand-built emails, lone surrogates included, never throw and decode repaired", () => {
    fc.assert(
      fc.property(nastyStringArb, nastyStringArb, (subject, body) => {
        const href = mailtoHref({ subject, body });
        const query = href.slice("mailto:?".length);
        expect(query).toMatch(/^[A-Za-z0-9\-_.!~*'()%=&]*$/);
        const parts = query.split("&");
        expect(parts).toHaveLength(2);
        const [subjectPart = "", bodyPart = ""] = parts;
        const value = (part: string): string =>
          decodeURIComponent(part.slice(part.indexOf("=") + 1));
        expect(value(subjectPart)).toBe(referenceWellFormed(subject));
        expect(value(bodyPart)).toBe(referenceWellFormed(body).replaceAll("\n", "\r\n"));
      }),
    );
  });
});
