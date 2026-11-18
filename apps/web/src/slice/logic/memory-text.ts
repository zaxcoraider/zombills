/** Copy for the Memory panel, the Landing view and the Live region (graveyard-memory, Req 1, 3.5, 4, 5, 7.1, 8). */

import type { MemoryEventKind, MemoryModel } from "../page-state";

export const MEMORY_HEADING = "Memory";
export const MEMORY_LABEL = "Remember my graveyard on this device";
export const MEMORY_HINT =
  "Only merchant text as printed on your statement (it can include reference numbers), amounts and your answers are kept, in this browser on this device. Transactions, dates and file names are not. Nothing is sent anywhere.";
export const PRIVACY_NOTE =
  "Your statement stays on this device and is never uploaded. Nothing is kept after you close this page unless you choose to remember your graveyard.";
export const STATEMENT_TIP = "Tip: 2 to 3 months of transactions works best.";

export function restoredLine(buried: number, resting: number): string {
  return `Your graveyard from this device is back: ${buried} buried, ${resting} resting.`;
}

export const MEMORY_KEPT = "Your graveyard will be kept on this device until you forget it.";
export const MEMORY_NOT_KEPT =
  "Your graveyard is no longer kept on this device. It is kept until you close this page.";

export function leftOutNote(n: number): string {
  return n === 1
    ? "1 answer could not be kept on this device. It is kept until you close this page."
    : `${n} answers could not be kept on this device. They are kept until you close this page.`;
}

export const UNREADABLE_NOTE = "Your saved graveyard could not be read, so it was ignored.";

export function droppedNote(n: number): string {
  return n === 1
    ? "1 saved answer could not be read and was left out."
    : `${n} saved answers could not be read and were left out.`;
}

export const NEWER_NOTE = "Your saved graveyard was made by a newer version of Zombills.";
export const WRITE_FAILED_NOTE =
  "This browser would not save your graveyard. It is kept until you close this page.";
export const REMOVE_FAILED_NOTE =
  "This browser would not clear the saved graveyard. Clear this site's data in the browser settings to remove it.";

export const MEMORY_ON_LINE = "Your answers are kept on this device.";
export const MEMORY_SETTINGS = "Memory settings";
export const EARLIER_NOTE = "From an earlier statement";
export const CARRIED_OVER_NOTE = "Answer carried over from an earlier statement";

export function carriedOverLine(n: number): string {
  return n === 1
    ? "1 earlier answer was carried over to this statement."
    : `${n} earlier answers were carried over to this statement.`;
}

export const FORGET_BUTTON = "Forget everything";
export const FORGET_QUESTION = "Forget every answer and tombstone? This cannot be undone.";
export const FORGET_CONFIRM = "Forget";
export const FORGET_CANCEL = "Cancel";
export const FORGOTTEN = "Everything is forgotten. Nothing is kept on this device.";

export const MEMORY_NOT_KEPT_REMOVE_FAILED = `Your graveyard is no longer kept on this device. ${REMOVE_FAILED_NOTE}`;
export const FORGOTTEN_REMOVE_FAILED = `Everything is forgotten. ${REMOVE_FAILED_NOTE}`;

/** The Live region sentence for a memory event (Req 1.3, 1.4, 5.2, 5.3, 8.5). */
export function memoryAnnouncement(
  what: MemoryEventKind,
  memory: Pick<MemoryModel, "leftOut">,
  removeFailed: boolean,
): string {
  switch (what) {
    case "kept":
      return memory.leftOut > 0 ? `${MEMORY_KEPT} ${leftOutNote(memory.leftOut)}` : MEMORY_KEPT;
    case "not-kept":
      return removeFailed ? MEMORY_NOT_KEPT_REMOVE_FAILED : MEMORY_NOT_KEPT;
    case "write-failed":
      return WRITE_FAILED_NOTE;
    case "left-out":
      return leftOutNote(memory.leftOut);
    case "forgotten":
      return removeFailed ? FORGOTTEN_REMOVE_FAILED : FORGOTTEN;
  }
}
