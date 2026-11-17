import { encodeGraveyard } from "./graveyard-codec";
import type { Graveyard } from "./graveyard";

export type RemovalReason = "untick" | "unreadable" | "forget" | "write-failed";

export interface RemovalRequest {
  seq: number;
  reason: RemovalReason;
}

export interface MemorySnapshot {
  on: boolean;
  graveyard: Graveyard;
  removal: RemovalRequest | null;
  /** Text last written, or read on an ok load; null after a removal or failed write. */
  lastWritten: string | null;
}

export type StorageCommand =
  | { kind: "write"; text: string; leftOut: number; reason: "turn-on" | "load" | "change" }
  | { kind: "remove"; reason: RemovalReason };

/** `prev` is null on the first run after load. */
export function storageCommands(
  prev: MemorySnapshot | null,
  next: MemorySnapshot,
): StorageCommand[] {
  // Rule 0: nothing changed, so nothing is issued (also Strict Mode's second effect run).
  if (
    prev !== null &&
    prev.on === next.on &&
    prev.removal === next.removal &&
    prev.graveyard === next.graveyard
  ) {
    return [];
  }
  const commands: StorageCommand[] = [];
  // Rule 1: a new removal request.
  if (next.removal !== null && next.removal.seq !== prev?.removal?.seq) {
    commands.push({ kind: "remove", reason: next.removal.reason });
  }
  // Rule 2: write while Memory is on.
  if (next.on) {
    const { text, leftOut } = encodeGraveyard(next.graveyard);
    const reason = prev !== null && !prev.on ? "turn-on" : prev === null ? "load" : "change";
    if (reason === "turn-on" || text !== next.lastWritten) {
      commands.push({ kind: "write", text, leftOut, reason });
    }
  }
  return commands;
}

/** The last-written text after running `command` with outcome `ok`. */
export function lastWrittenAfter(
  lastWritten: string | null,
  command: StorageCommand,
  ok: boolean,
): string | null {
  void lastWritten;
  return command.kind === "write" && ok ? command.text : null;
}
