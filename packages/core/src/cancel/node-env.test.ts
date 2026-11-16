// Req 1.1, 4.4, 4.5: the Cancel module runs under Vitest's Node environment, with no browser
// globals other than Node's built-in `navigator`, and its URL checks need no polyfill.

import { describe, expect, it } from "vitest";
import {
  APP_STORE_LINKS,
  CANCEL_ENTRIES,
  EMAIL_ONLY_SERVICE_IDS,
  KNOWN_SERVICES,
  cancellationEmail,
  getCancelHelp,
  mailtoHref,
  statementRegion,
  validateCancelDatabase,
} from "../index.js";

// The package has no DOM typings. These declarations only give `typeof` a name to look at.
declare const window: unknown;
declare const document: unknown;
declare const navigator: { userAgent: string } | undefined;
declare const localStorage: unknown;

function expectNoBrowserGlobals(): void {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
  expect(typeof localStorage).toBe("undefined");
  // Node 21+ defines a built-in `navigator` global (userAgent "Node.js/<major>"). It is not a
  // browser global, so accept it. Older Node versions leave it undefined. Anything else
  // (for example a jsdom navigator) is a real browser global and fails.
  if (typeof navigator !== "undefined") {
    expect(navigator.userAgent.startsWith("Node.js/")).toBe(true);
  }
}

describe("the Cancel module under the Node environment (Req 4.4)", () => {
  it("has no browser globals", () => {
    expectNoBrowserGlobals();
  });

  it("imports every exported function from the package entry", () => {
    expect(typeof getCancelHelp).toBe("function");
    expect(typeof cancellationEmail).toBe("function");
    expect(typeof mailtoHref).toBe("function");
    expect(typeof statementRegion).toBe("function");
    expect(typeof validateCancelDatabase).toBe("function");
  });

  it("calls getCancelHelp for Netflix and gets a link", () => {
    const help = getCancelHelp("netflix", "USD");
    expect(help.kind).toBe("link");
    if (help.kind === "link") {
      expect(help.serviceId).toBe("netflix");
      expect(help.url.startsWith("https://")).toBe(true);
    }
  });

  it("calls cancellationEmail on the Netflix row of Req 3.10 and mailtoHref on the result", () => {
    const email = cancellationEmail({
      serviceName: "Netflix",
      amountText: "$17.99",
      currency: "USD",
      cadence: "monthly",
      cadenceAssumed: false,
    });
    expect(email.subject).toBe("Please cancel my Netflix subscription");
    expect(email.body).toContain("I am currently charged $17.99 (USD) every month.");
    const href = mailtoHref(email);
    expect(
      href.startsWith("mailto:?subject=Please%20cancel%20my%20Netflix%20subscription&body="),
    ).toBe(true);
  });

  it("calls statementRegion", () => {
    expect(statementRegion("GBP")).toBe("UK");
  });

  it("validates the real data with the platform URL and no polyfill", () => {
    const issues = validateCancelDatabase(
      CANCEL_ENTRIES,
      EMAIL_ONLY_SERVICE_IDS,
      KNOWN_SERVICES.map((service) => service.serviceId),
      APP_STORE_LINKS,
    );
    expect(Array.isArray(issues)).toBe(true);
    // Only ids of data batches not yet written may be missing; no URL or other rule fails.
    expect(issues.filter((issue) => issue.rule !== "missing-service")).toEqual([]);
  });

  it("still has no browser globals after the calls", () => {
    getCancelHelp("netflix", "USD");
    expectNoBrowserGlobals();
  });
});
