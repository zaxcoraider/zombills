import { describe, expect, it } from "vitest";
import * as text from "./landing-text";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("landing text", () => {
  it("matches the requirement text exactly", () => {
    expect(text.HERO_LINE).toBe(
      "We find the subscriptions still feeding on you. You decide which ones to bury.",
    );
    expect([...text.PRIMARY_ACTION_LINES]).toEqual([
      "Summon the undead",
      "with a sample US bank statement",
    ]);
    expect(text.PRIMARY_ACTION_NAME).toBe("Summon the undead with a sample US bank statement");
    expect(text.OTHER_SAMPLES_LABEL).toBe("Other samples:");
    expect(text.OTHER_SAMPLES_LIST_NAME).toBe("Other sample statements");
    expect(text.PRIVACY_BADGE_TEXT).toBe("Your statement never leaves your device.");
    expect(text.READ_PRIVACY_NOTE).toBe("Read the privacy note");
    expect(text.HOW_IT_WORKS_HEADING).toBe("How it works");
    expect(text.OWN_STATEMENT_HEADING).toBe("Or read your own statement");
    expect(text.BUILT_WITH_KIRO).toBe("Built with Kiro.");
    expect(text.REPO_LINK).toEqual({
      text: "Zombills on GitHub",
      href: "https://github.com/zaxcoraider/zombills",
    });
    expect(text.REAPER_LINK).toEqual({
      text: "The Reaper on GitHub",
      href: "https://github.com/zaxcoraider/zombills-reaper",
    });
    expect(text.REAPER_DESCRIPTION).toBe(
      "The Reaper is a Kiro Crew app that watches for new statements each month and drafts cancellation emails when you ask.",
    );
    expect(text.US_SAMPLE_FILE_NAME).toBe("us-signed.csv");
  });

  it("joins the two Primary action lines with one space", () => {
    expect(text.PRIMARY_ACTION_NAME).toBe(text.PRIMARY_ACTION_LINES.join(" "));
  });

  it("lists the three How it works steps in order", () => {
    expect(text.HOW_IT_WORKS_STEPS).toEqual([
      {
        heading: "Find the undead",
        text: "Drop in a statement. Every charge that keeps coming back rises from the grave.",
      },
      { heading: "Count what they cost", text: "See what each one drains from you in a year." },
      {
        heading: "Bury them",
        text: "Bury the ones you no longer use, and get help to cancel them.",
      },
    ]);
  });

  it("has no exclamation mark in any exported string", () => {
    const all = strings(Object.values(text));
    expect(all.length).toBeGreaterThan(10);
    for (const value of all) expect(value).not.toContain("!");
  });

  it("makes no claim beyond the badge text", () => {
    for (const word of ["private", "secure", "encrypted", "anonymous"]) {
      expect(text.PRIVACY_BADGE_TEXT.toLowerCase()).not.toContain(word);
    }
  });
});
