import { cancellationEmail } from "@zombills/core";
import { describe, expect, it } from "vitest";
import {
  cancelLinkText,
  checkedLine,
  copiedNotice,
  copyTextOf,
  emailInputFor,
  knownNameFor,
  panelLine,
  withFor,
} from "./cancel-text";
import type { AnswerRecord } from "./graveyard";

function record(overrides: Partial<AnswerRecord>): AnswerRecord {
  return {
    id: "netflix",
    merchant: "NETFLIX.COM",
    serviceId: "netflix",
    currency: "USD",
    cadence: "monthly",
    currentAmountCents: 1799,
    answer: "not-using",
    cadenceAssumed: false,
    yearlySavingCents: 21588,
    carriedOver: false,
    ...overrides,
  };
}

describe("knownNameFor", () => {
  it("returns the Known display name, or null", () => {
    expect(knownNameFor("netflix")).toBe("Netflix");
    expect(knownNameFor(null)).toBeNull();
    expect(knownNameFor("merchant:x")).toBeNull();
    expect(knownNameFor("constructor")).toBeNull();
  });
});

describe("emailInputFor", () => {
  it("uses the Known display name for a Known record", () => {
    const input = emailInputFor(record({}), "en-US");
    expect(input).toEqual({
      serviceName: "Netflix",
      amountText: "$17.99",
      currency: "USD",
      cadence: "monthly",
      cadenceAssumed: false,
    });
  });

  it("uses the merchant for a generic record", () => {
    const input = emailInputFor(
      record({
        id: "riverside",
        merchant: "Riverside Gym Membership",
        serviceId: null,
        currentAmountCents: 2900,
      }),
      "en-US",
    );
    expect(input.serviceName).toBe("Riverside Gym Membership");
    expect(input.amountText).toBe("$29.00");
  });

  it("uses the merchant for an unknown service id", () => {
    const input = emailInputFor(record({ merchant: "Odd Co", serviceId: "no-such-service" }));
    expect(input.serviceName).toBe("Odd Co");
  });

  it("never carries a Display name suffix into the input", () => {
    const input = emailInputFor(
      record({ id: "gym-2", merchant: "Riverside Gym Membership", serviceId: null }),
    );
    expect(JSON.stringify(input)).not.toContain("(2)");
    expect(input.serviceName).toBe("Riverside Gym Membership");
  });

  it("gives the Netflix email its amount line in en-US", () => {
    const email = cancellationEmail(emailInputFor(record({}), "en-US"));
    expect(email.subject).toBe("Please cancel my Netflix subscription");
    expect(email.body).toContain("I am currently charged $17.99 (USD) every month.");
  });
});

describe("cancelLinkText", () => {
  it("names the page by link kind and shows the host", () => {
    expect(cancelLinkText("cancel", "Netflix", "netflix.com")).toBe(
      "Open the Netflix cancel page (netflix.com)",
    );
    expect(cancelLinkText("manage", "Netflix", "netflix.com")).toBe(
      "Open the Netflix manage page (netflix.com)",
    );
    expect(cancelLinkText("help", "Netflix", "netflix.com")).toBe(
      "Open the Netflix help page (netflix.com)",
    );
  });
});

describe("withFor", () => {
  it("appends the Display name", () => {
    expect(withFor("Copy email", "Netflix")).toBe("Copy email for Netflix");
  });
});

describe("checkedLine", () => {
  it("formats month and year in UTC", () => {
    expect(checkedLine("2026-11-17", "en-US")).toBe("Link checked November 2026.");
    expect(checkedLine("2026-12-01", "en-US")).toBe("Link checked December 2026.");
  });

  it("returns null for null and malformed input", () => {
    expect(checkedLine(null, "en-US")).toBeNull();
    expect(checkedLine("2026-13-01", "en-US")).toBeNull();
    expect(checkedLine("2026-00-10", "en-US")).toBeNull();
    expect(checkedLine("17 Nov 2026", "en-US")).toBeNull();
    expect(checkedLine("", "en-US")).toBeNull();
  });
});

describe("copiedNotice, copyTextOf and panelLine", () => {
  it("builds the notice", () => {
    expect(copiedNotice("Netflix")).toBe("Email for Netflix copied.");
  });

  it("joins subject and body with a blank line", () => {
    expect(copyTextOf({ subject: "S", body: "B\nC" })).toBe("S\n\nB\nC");
  });

  it("builds the panel line", () => {
    expect(panelLine("Netflix")).toBe(
      "Cancel Netflix with the provider. Burying it here does not stop the payments.",
    );
  });
});
