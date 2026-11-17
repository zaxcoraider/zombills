import { describe, expect, it } from "vitest";
import * as text from "./memory-text";
import {
  CARRIED_OVER_NOTE,
  EARLIER_NOTE,
  FORGET_BUTTON,
  FORGET_CANCEL,
  FORGET_CONFIRM,
  FORGET_QUESTION,
  FORGOTTEN,
  FORGOTTEN_REMOVE_FAILED,
  PRIVACY_NOTE,
  MEMORY_HEADING,
  MEMORY_HINT,
  MEMORY_KEPT,
  MEMORY_LABEL,
  MEMORY_NOT_KEPT,
  MEMORY_NOT_KEPT_REMOVE_FAILED,
  MEMORY_ON_LINE,
  MEMORY_SETTINGS,
  NEWER_NOTE,
  REMOVE_FAILED_NOTE,
  UNREADABLE_NOTE,
  WRITE_FAILED_NOTE,
  carriedOverLine,
  droppedNote,
  leftOutNote,
  restoredLine,
  STATEMENT_TIP,
} from "./memory-text";

describe("Landing privacy texts", () => {
  it("PRIVACY_NOTE and STATEMENT_TIP equal their texts and join into the graveyard-memory Req 1.6 sentence", () => {
    expect(PRIVACY_NOTE).toBe(
      "Your statement stays on this device and is never uploaded. Nothing is kept after you close this page unless you choose to remember your graveyard.",
    );
    expect(STATEMENT_TIP).toBe("A statement covering 2 to 3 months gives the best results.");
    expect(`${PRIVACY_NOTE} ${STATEMENT_TIP}`).toBe(
      "Your statement stays on this device and is never uploaded. Nothing is kept after you close this page unless you choose to remember your graveyard. A statement covering 2 to 3 months gives the best results.",
    );
  });
});

describe("memory text constants", () => {
  it("equal the requirement text", () => {
    expect(MEMORY_HEADING).toBe("Memory");
    expect(MEMORY_LABEL).toBe("Remember my graveyard on this device");
    expect(MEMORY_HINT).toBe(
      "Only merchant text as printed on your statement (it can include reference numbers), amounts and your answers are kept, in this browser on this device. Transactions, dates and file names are not. Nothing is sent anywhere.",
    );
    expect(MEMORY_KEPT).toBe("Your graveyard will be kept on this device until you forget it.");
    expect(MEMORY_NOT_KEPT).toBe(
      "Your graveyard is no longer kept on this device. It is kept until you close this page.",
    );
    expect(UNREADABLE_NOTE).toBe("Your saved graveyard could not be read, so it was ignored.");
    expect(NEWER_NOTE).toBe("Your saved graveyard was made by a newer version of Zombills.");
    expect(WRITE_FAILED_NOTE).toBe(
      "This browser would not save your graveyard. It is kept until you close this page.",
    );
    expect(REMOVE_FAILED_NOTE).toBe(
      "This browser would not clear the saved graveyard. Clear this site's data in the browser settings to remove it.",
    );
    expect(MEMORY_ON_LINE).toBe("Your answers are kept on this device.");
    expect(MEMORY_SETTINGS).toBe("Memory settings");
    expect(EARLIER_NOTE).toBe("From an earlier statement");
    expect(CARRIED_OVER_NOTE).toBe("Answer carried over from an earlier statement");
    expect(FORGET_BUTTON).toBe("Forget everything");
    expect(FORGET_QUESTION).toBe("Forget every answer and tombstone? This cannot be undone.");
    expect(FORGET_CONFIRM).toBe("Forget");
    expect(FORGET_CANCEL).toBe("Cancel");
    expect(FORGOTTEN).toBe("Everything is forgotten. Nothing is kept on this device.");
  });

  it("builds the counted notes, with singular forms", () => {
    expect(leftOutNote(1)).toBe(
      "1 answer could not be kept on this device. It is kept until you close this page.",
    );
    expect(leftOutNote(3)).toBe(
      "3 answers could not be kept on this device. They are kept until you close this page.",
    );
    expect(droppedNote(1)).toBe("1 saved answer could not be read and was left out.");
    expect(droppedNote(3)).toBe("3 saved answers could not be read and were left out.");
    expect(carriedOverLine(1)).toBe("1 earlier answer was carried over to this statement.");
    expect(carriedOverLine(2)).toBe("2 earlier answers were carried over to this statement.");
    expect(restoredLine(1, 0)).toBe(
      "Your graveyard from this device is back: 1 buried, 0 resting.",
    );
  });

  it("combines the notes by replacing the last clause with REMOVE_FAILED_NOTE", () => {
    expect(MEMORY_NOT_KEPT_REMOVE_FAILED).toBe(
      MEMORY_NOT_KEPT.replace("It is kept until you close this page.", REMOVE_FAILED_NOTE),
    );
    expect(FORGOTTEN_REMOVE_FAILED).toBe(
      FORGOTTEN.replace("Nothing is kept on this device.", REMOVE_FAILED_NOTE),
    );
    expect(MEMORY_NOT_KEPT_REMOVE_FAILED).toBe(
      "Your graveyard is no longer kept on this device. This browser would not clear the saved graveyard. Clear this site's data in the browser settings to remove it.",
    );
    expect(FORGOTTEN_REMOVE_FAILED).toBe(
      "Everything is forgotten. This browser would not clear the saved graveyard. Clear this site's data in the browser settings to remove it.",
    );
  });

  it("has no banned words in any exported string or sample output", () => {
    const strings: string[] = [];
    for (const value of Object.values(text)) {
      if (typeof value === "string") strings.push(value);
    }
    strings.push(
      leftOutNote(1),
      leftOutNote(2),
      droppedNote(1),
      droppedNote(2),
      carriedOverLine(1),
      carriedOverLine(2),
      restoredLine(0, 0),
      restoredLine(2, 5),
    );
    const banned = [
      /!/,
      /encrypt/i,
      /secure/i,
      /safe/i,
      /\bprivate\b/i,
      /localStorage/,
      /sessionStorage/,
      /indexedDB/i,
      /caches\./,
      /cookieStore/,
      /\.cookie/,
    ];
    expect(strings.length).toBeGreaterThan(20);
    for (const s of strings) {
      for (const pattern of banned) expect(s).not.toMatch(pattern);
    }
  });
});
