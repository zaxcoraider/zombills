import { describe, expect, it } from "vitest";
import * as CHROME_TEXT from "./chrome-text";

const EXPECTED: Record<string, string> = {
  HOME_CONTROL_NAME: "Zombills, back to the start",
  LEAVE_QUESTION:
    "Go back to the start? This statement's results are put away, and your answers are kept only until you close this page unless you remember your graveyard.",
  STAY_TEXT: "Stay",
  LEAVE_TEXT: "Leave",
  FREE_LINE: "Free. No sign-up. No bank login.",
  STATEMENT_HINT:
    "Most banks let you download your transactions as a CSV file. Look for Export or Download in online banking.",
  TRY_ANOTHER_STATEMENT: "Try another statement",
  SAMPLE_LIST_NAME: "Sample statements",
  TAP_TO_CHOOSE: "Tap to choose a CSV statement",
  SITE_LINKS_NAME: "Site links",
  PRIVACY_TOMBSTONE: "Privacy note",
  WRITE_INSTEAD: "Write to them instead",
  WHAT_IS_KEPT: "What is kept?",
};

describe("chrome text", () => {
  it("exports exactly the constants of the Text table", () => {
    expect(Object.keys(CHROME_TEXT).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [name, text] of Object.entries(EXPECTED)) {
    it(`${name} equals its text exactly`, () => {
      expect((CHROME_TEXT as Record<string, unknown>)[name]).toBe(text);
    });
  }

  it("contains no exclamation mark", () => {
    for (const text of Object.values(CHROME_TEXT)) expect(text).not.toContain("!");
  });

  it("makes no security claim in the Leave question", () => {
    for (const word of ["private", "secure", "encrypted", "anonymous"]) {
      expect(CHROME_TEXT.LEAVE_QUESTION.toLowerCase()).not.toContain(word);
    }
  });
});
